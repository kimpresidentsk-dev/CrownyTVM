// translate.js v2.0 — 한선씨 의미단어 사전 기반 번역 엔진
// 1차: 20K 의미단어 사전 (오프라인, ko↔en↔es)
// 튜브 포스트, 메신저 메시지, 쇼츠 캡션에 번역 버튼

(function() {
    'use strict';

    let semanticDict = null;
    let dictReady = false;

    // ===== 사전 로드 =====
    async function loadSemanticDict() {
        try {
            const res = await fetch('/data/semantic-dict.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            semanticDict = await res.json();
            dictReady = true;
            const koCount = Object.keys(semanticDict.ko || {}).length;
            console.log(`[translate] Semantic dict loaded: ${koCount} ko entries`);
        } catch (e) {
            console.warn('[translate] Dict load failed:', e.message);
        }
    }

    // ===== 언어 감지 =====
    function detectLang(text) {
        const koCount = (text.match(/[\uAC00-\uD7AF]/g) || []).length;
        const enCount = (text.match(/[a-zA-Z]/g) || []).length;
        const esAccent = (text.match(/[áéíóúüñ¿¡]/gi) || []).length;
        const zhCount = (text.match(/[\u4E00-\u9FFF]/g) || []).length;
        const jaCount = (text.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []).length;
        const total = text.replace(/\s/g, '').length || 1;

        if (koCount / total > 0.3) return 'ko';
        if (zhCount / total > 0.3) return 'zh';
        if (jaCount / total > 0.2) return 'ja';
        if (esAccent > 0) return 'es';
        if (enCount / total > 0.3) return 'en';
        return 'ko';
    }

    function getUserLang() {
        if (typeof currentLang !== 'undefined' && currentLang) return currentLang;
        return navigator.language?.slice(0, 2) || 'ko';
    }

    const LANG_NAMES = {
        ko: '한국어', en: 'English', ja: '日本語', zh: '中文', es: 'Español',
        fr: 'Français', de: 'Deutsch', pt: 'Português', ru: 'Русский', ar: 'العربية',
        hi: 'हिन्दी', bn: 'বাংলা', th: 'ไทย', vi: 'Tiếng Việt', id: 'Bahasa Indonesia',
        tr: 'Türkçe', it: 'Italiano', nl: 'Nederlands', pl: 'Polski',
        sv: 'Svenska', da: 'Dansk', fi: 'Suomi'
    };

    // ===== 한국어 조사 제거 =====
    const KO_PARTICLES = ['습니다','ㅂ니다','입니다','에서','으로','부터','까지','처럼','만큼','에게','한테','께서','라고','이라','에는','으면','는데','지만','거나','든지','는','은','이','가','을','를','에','의','로','와','과','도','만','고','며','면','서','니','요','다'];

    function stripParticle(word) {
        for (const p of KO_PARTICLES) {
            if (word.length > p.length + 1 && word.endsWith(p)) {
                return word.slice(0, -p.length);
            }
        }
        return word;
    }

    // ===== 단어 번역 (사전) =====
    function dictLookup(word, fromLang, toLang) {
        if (!semanticDict) return null;
        const lw = word.toLowerCase();

        if (fromLang === 'ko' && toLang === 'en') {
            return semanticDict.ko?.[word] || semanticDict.ko?.[lw] || null;
        }
        if (fromLang === 'ko' && toLang === 'es') {
            return semanticDict.ko_es?.[word] || semanticDict.ko_es?.[lw] || null;
        }
        if (fromLang === 'en' && toLang === 'ko') {
            return semanticDict.en?.[lw] || semanticDict.en?.[word] || null;
        }
        if (fromLang === 'en' && toLang === 'es') {
            const ko = semanticDict.en?.[lw];
            return ko ? (semanticDict.ko_es?.[ko] || null) : null;
        }
        if (fromLang === 'es' && toLang === 'en') {
            return semanticDict.es?.[lw] || semanticDict.es?.[word] || null;
        }
        if (fromLang === 'es' && toLang === 'ko') {
            const en = semanticDict.es?.[lw];
            return en ? (semanticDict.en?.[en.toLowerCase()] || null) : null;
        }
        return null;
    }

    // ===== 문장 번역 (사전 기반) =====
    function translateBySemantic(text, fromLang, toLang) {
        if (!semanticDict || fromLang === toLang) return { text, ratio: 0 };

        let translated = 0;
        let total = 0;

        if (fromLang === 'ko') {
            const tokens = text.split(/(\s+)/);
            const result = tokens.map(tok => {
                if (/^\s+$/.test(tok)) return ' ';
                const m = tok.match(/^(.*?)([.!?,;:。！？，；：\n]*)$/);
                const word = m ? m[1] : tok;
                const punct = m ? m[2] : '';
                if (!word) return punct;
                total++;

                let tr = dictLookup(word, fromLang, toLang);
                if (tr) { translated++; return tr + punct; }

                const stripped = stripParticle(word);
                if (stripped !== word) {
                    tr = dictLookup(stripped, fromLang, toLang);
                    if (tr) { translated++; return tr + punct; }
                }
                return tok;
            });
            return { text: result.join(''), ratio: total ? translated / total : 0 };
        } else {
            const tokens = text.split(/(\s+)/);
            const result = tokens.map(tok => {
                if (/^\s+$/.test(tok)) return ' ';
                const m = tok.match(/^(.*?)([.!?,;:]+)$/);
                const word = m ? m[1] : tok;
                const punct = m ? m[2] : '';
                if (!word) return punct;
                total++;

                const tr = dictLookup(word, fromLang, toLang);
                if (tr) { translated++; return tr + punct; }
                return tok;
            });
            return { text: result.join(''), ratio: total ? translated / total : 0 };
        }
    }

    // ===== 메인 번역 함수 =====
    async function translateText(text, targetLang) {
        if (!text || !text.trim()) return '';
        const srcLang = detectLang(text);
        if (srcLang === targetLang) return text;

        // 사전 기반 번역 시도 (ko↔en↔es)
        const supported = ['ko', 'en', 'es'];
        if (supported.includes(srcLang) && supported.includes(targetLang) && dictReady) {
            const result = translateBySemantic(text, srcLang, targetLang);
            if (result.ratio > 0) return result.text;
        }

        // 사전으로 번역 불가 — 원문 반환 (외부 API 미사용)
        return '';
    }

    // ===== UI: 번역 버튼 =====
    function createTranslateBtn(getText, container) {
        const btn = document.createElement('button');
        btn.className = 'translate-btn';
        btn.innerHTML = '';
        btn.title = typeof t === 'function' ? t('translate.btn_title', 'Translate') : 'Translate';
        btn.style.cssText = 'background:none;border:1px solid var(--border,#E8E0D8);border-radius:6px;padding:0.2rem 0.5rem;cursor:pointer;font-size:0.85rem;opacity:0.7;transition:opacity 0.2s;';
        btn.onmouseenter = () => btn.style.opacity = '1';
        btn.onmouseleave = () => btn.style.opacity = '0.7';

        let translated = false;
        let originalHTML = '';

        btn.onclick = async (e) => {
            e.stopPropagation();
            if (translated) {
                container.innerHTML = originalHTML;
                btn.innerHTML = '';
                translated = false;
                return;
            }

            const text = getText();
            if (!text) return;

            btn.innerHTML = '⏳';
            btn.disabled = true;

            const tl = getUserLang();
            const result = await translateText(text, tl);
            if (result) {
                originalHTML = container.innerHTML;
                const langLabel = LANG_NAMES[tl] || tl;
                container.innerHTML = `<p style="white-space:pre-wrap;">${escapeHtml(result)}</p><p style="font-size:0.65rem;color:var(--text-muted,#6B5744);margin-top:0.3rem;"> ${langLabel}</p>`;
                btn.innerHTML = '↩️';
                translated = true;
            } else {
                btn.innerHTML = '';
            }
            btn.disabled = false;
        };

        return btn;
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    // ===== 소셜 포스트에 번역 버튼 삽입 =====
    function injectPostTranslateButtons() {
        document.querySelectorAll('.post, .crny-social-post').forEach(post => {
            if (post.querySelector('.translate-btn')) return;
            const contentEl = post.querySelector('.post-content, .crny-post-text');
            if (!contentEl) return;
            const actionsBar = post.querySelector('.post-actions-bar, .post-actions, .crny-post-actions');
            if (!actionsBar) return;
            const btn = createTranslateBtn(() => contentEl.textContent?.trim(), contentEl);
            actionsBar.appendChild(btn);
        });
    }

    // ===== 채팅 메시지에 번역 버튼 삽입 =====
    function injectChatTranslateButtons() {
        document.querySelectorAll('.msg-bubble, .crny-chat-msg').forEach(bubble => {
            if (bubble.querySelector('.translate-btn')) return;
            const textEl = bubble.querySelector('.msg-text, .crny-msg-text');
            if (!textEl) return;
            const btn = createTranslateBtn(() => textEl.textContent?.trim(), textEl);
            btn.style.cssText += 'font-size:0.7rem;padding:0.1rem 0.3rem;margin-top:0.2rem;display:block;';
            bubble.appendChild(btn);
        });
    }

    // ===== DOM 감시 =====
    function startObserver() {
        const observer = new MutationObserver((mutations) => {
            let hasNew = false;
            for (const m of mutations) {
                if (m.addedNodes.length > 0) { hasNew = true; break; }
            }
            if (hasNew) {
                injectPostTranslateButtons();
                injectChatTranslateButtons();
            }
        });

        const targets = ['social-feed', 'feed-container', 'chat-messages', 'crny-chat-messages'];
        targets.forEach(id => {
            const el = document.getElementById(id);
            if (el) observer.observe(el, { childList: true, subtree: true });
        });

        const content = document.querySelector('.content');
        if (content) observer.observe(content, { childList: true, subtree: true });
    }

    // ===== 초기화 =====
    async function init() {
        await loadSemanticDict();
        startObserver();
        injectPostTranslateButtons();
        injectChatTranslateButtons();
        console.log('[translate] v2.0 initialized (semantic dict)');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 500);
    }

    // 외부 노출
    window.translateText = translateText;
    window.translateBySemantic = translateBySemantic;
    window.detectLang = detectLang;
    window.injectPostTranslateButtons = injectPostTranslateButtons;
    window.injectChatTranslateButtons = injectChatTranslateButtons;

})();
