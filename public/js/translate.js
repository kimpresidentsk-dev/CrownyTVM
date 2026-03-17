// translate.js v1.0 — Gemini Flash 번역 엔진
// 소셜 포스트, 메신저 메시지, 릴스 캡션, 스토리에 🌐 번역 버튼 추가

(function() {
    'use strict';

    const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
    let apiKey = 'AIzaSyAhkJlLDE_V2Iso8PZaGIWPqs_ht0ZuZeA';

    // Load API key from Firestore if available
    async function loadApiKey() {
        try {
            if (typeof db !== 'undefined') {
                const doc = await db.collection('admin_config').doc('ai_settings').get();
                if (doc.exists && doc.data().geminiApiKey && doc.data().geminiApiKey.length > 10) {
                    apiKey = doc.data().geminiApiKey;
                }
            }
        } catch (e) { console.warn('[translate] API key load:', e.message); }
    }

    // Get user's preferred language
    function getUserLang() {
        if (typeof currentLang !== 'undefined' && currentLang) return currentLang;
        return navigator.language?.slice(0, 2) || 'ko';
    }

    const LANG_NAMES = {
        ko: '한국어', en: 'English', ja: '日本語', zh: '中文', es: 'Español',
        fr: 'Français', de: 'Deutsch', pt: 'Português', ru: 'Русский', ar: 'العربية',
        hi: 'हिन्दी', th: 'ไทย', vi: 'Tiếng Việt', id: 'Bahasa Indonesia',
        tr: 'Türkçe', it: 'Italiano', nl: 'Nederlands', pl: 'Polski',
        sv: 'Svenska', da: 'Dansk'
    };

    // Translate text via Gemini Flash
    async function translateText(text, targetLang) {
        if (!text || !text.trim()) return '';
        const langName = LANG_NAMES[targetLang] || targetLang;

        const prompt = `Translate the following text to ${langName}. 
Rules:
- Return ONLY the translated text, no explanations
- Preserve emojis, @mentions, hashtags, and URLs as-is
- If the text is already in ${langName}, return it unchanged
- Keep the original tone and style

Text to translate:
${text}`;

        try {
            const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
                })
            });

            if (!res.ok) throw new Error(`API ${res.status}`);
            const data = await res.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        } catch (e) {
            console.error('[translate] Error:', e);
            if (typeof showToast === 'function') showToast('번역 실패: ' + e.message, 'error');
            return '';
        }
    }

    // Create translate button element
    function createTranslateBtn(getText, container) {
        const btn = document.createElement('button');
        btn.className = 'translate-btn';
        btn.innerHTML = '🌐';
        btn.title = '번역 / Translate';
        btn.style.cssText = 'background:none;border:1px solid var(--border,#E8E0D8);border-radius:6px;padding:0.2rem 0.5rem;cursor:pointer;font-size:0.85rem;opacity:0.7;transition:opacity 0.2s;';
        btn.onmouseenter = () => btn.style.opacity = '1';
        btn.onmouseleave = () => btn.style.opacity = '0.7';

        let translated = false;
        let originalHTML = '';

        btn.onclick = async (e) => {
            e.stopPropagation();
            if (translated) {
                // Restore original
                container.innerHTML = originalHTML;
                btn.innerHTML = '🌐';
                translated = false;
                return;
            }

            const text = getText();
            if (!text) return;

            btn.innerHTML = '⏳';
            btn.disabled = true;

            const result = await translateText(text, getUserLang());
            if (result) {
                originalHTML = container.innerHTML;
                container.innerHTML = `<p style="white-space:pre-wrap;">${result}</p><p style="font-size:0.65rem;color:var(--text-muted,#6B5744);margin-top:0.3rem;">🌐 ${LANG_NAMES[getUserLang()] || getUserLang()} 번역</p>`;
                btn.innerHTML = '↩️';
                translated = true;
            } else {
                btn.innerHTML = '🌐';
            }
            btn.disabled = false;
        };

        return btn;
    }

    // Auto-inject translate buttons into social posts
    function injectPostTranslateButtons() {
        document.querySelectorAll('.post').forEach(post => {
            if (post.querySelector('.translate-btn')) return; // already has one

            const contentEl = post.querySelector('.post-content');
            if (!contentEl) return;

            const actionsBar = post.querySelector('.post-actions-bar') || post.querySelector('.post-actions');
            if (!actionsBar) return;

            const btn = createTranslateBtn(
                () => contentEl.textContent?.trim(),
                contentEl
            );
            actionsBar.appendChild(btn);
        });
    }

    // Inject translate button into chat messages
    function injectChatTranslateButtons() {
        document.querySelectorAll('.msg-bubble').forEach(bubble => {
            if (bubble.querySelector('.translate-btn')) return;

            const textEl = bubble.querySelector('.msg-text');
            if (!textEl) return;

            const btn = createTranslateBtn(
                () => textEl.textContent?.trim(),
                textEl
            );
            btn.style.cssText += 'font-size:0.7rem;padding:0.1rem 0.3rem;margin-top:0.2rem;display:block;';
            bubble.appendChild(btn);
        });
    }

    // Observe DOM for new posts/messages and inject buttons
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

        // Observe social feed and chat messages
        const targets = ['social-feed', 'feed-container', 'chat-messages'];
        targets.forEach(id => {
            const el = document.getElementById(id);
            if (el) observer.observe(el, { childList: true, subtree: true });
        });

        // Also observe the main content area
        const content = document.querySelector('.content');
        if (content) observer.observe(content, { childList: true, subtree: true });
    }

    // Initialize
    async function init() {
        await loadApiKey();
        startObserver();
        // Initial injection
        injectPostTranslateButtons();
        injectChatTranslateButtons();
        console.log('[translate] v1.0 initialized');
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 1000); // Wait for other modules to load
    }

    // Expose for manual use
    window.translateText = translateText;
    window.injectPostTranslateButtons = injectPostTranslateButtons;
    window.injectChatTranslateButtons = injectChatTranslateButtons;

})();
