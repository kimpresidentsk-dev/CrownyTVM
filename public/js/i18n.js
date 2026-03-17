// ===== CROWNY i18n (국제화) 시스템 v1.0 =====
// 언어 감지 + 수동 전환 + data-i18n 자동 교체

let currentLang = localStorage.getItem('crowny_lang') || navigator.language?.slice(0,2) || 'ko';
let langData = {};
let i18nReady = false;

// 지원 언어 목록
const SUPPORTED_LANGS = {
    ko: { name: '한국어', flag: '🇰🇷' },
    en: { name: 'English', flag: '🇺🇸' },
    zh: { name: '中文', flag: '🇨🇳' },
    ja: { name: '日本語', flag: '🇯🇵' },
    es: { name: 'Español', flag: '🇪🇸' },
    fr: { name: 'Français', flag: '🇫🇷' },
    de: { name: 'Deutsch', flag: '🇩🇪' },
    pt: { name: 'Português', flag: '🇧🇷' },
    ru: { name: 'Русский', flag: '🇷🇺' },
    ar: { name: 'العربية', flag: '🇸🇦' },
    hi: { name: 'हिन्दी', flag: '🇮🇳' },
    th: { name: 'ไทย', flag: '🇹🇭' },
    vi: { name: 'Tiếng Việt', flag: '🇻🇳' },
    id: { name: 'Bahasa Indonesia', flag: '🇮🇩' },
    tr: { name: 'Türkçe', flag: '🇹🇷' },
    it: { name: 'Italiano', flag: '🇮🇹' },
    nl: { name: 'Nederlands', flag: '🇳🇱' },
    pl: { name: 'Polski', flag: '🇵🇱' },
    sv: { name: 'Svenska', flag: '🇸🇪' },
    da: { name: 'Dansk', flag: '🇩🇰' },
    fi: { name: 'Suomi', flag: '🇫🇮' },
    no: { name: 'Norsk', flag: '🇳🇴' },
    uk: { name: 'Українська', flag: '🇺🇦' },
    ro: { name: 'Română', flag: '🇷🇴' },
    hu: { name: 'Magyar', flag: '🇭🇺' },
    cs: { name: 'Čeština', flag: '🇨🇿' },
    el: { name: 'Ελληνικά', flag: '🇬🇷' },
    he: { name: 'עברית', flag: '🇮🇱' },
    ms: { name: 'Bahasa Melayu', flag: '🇲🇾' },
    bn: { name: 'বাংলা', flag: '🇧🇩' }
};

// 지원하지 않는 언어면 ko로 폴백
if (!SUPPORTED_LANGS[currentLang]) {
    currentLang = 'ko';
}

async function loadLanguage(lang) {
    try {
        const res = await fetch(`lang/${lang}.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        langData = await res.json();
        currentLang = lang;
        localStorage.setItem('crowny_lang', lang);
        document.documentElement.lang = lang;
        i18nReady = true;
        console.log(`🌐 [i18n] Loaded: ${lang} (${Object.keys(langData).length} keys)`);
    } catch (e) {
        console.warn(`🌐 [i18n] Failed to load ${lang}, fallback to ko:`, e.message);
        if (lang !== 'ko') {
            await loadLanguage('ko');
        }
    }
}

// 번역 함수 — 키 기반 조회 (dot notation 지원)
function t(key, fallback) {
    if (!key) return fallback || '';
    // dot notation: "common.confirm" → langData["common.confirm"]
    return langData[key] || fallback || key;
}

// 페이지 내 data-i18n 속성 자동 교체
function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        const translated = t(key);
        if (translated && translated !== key) {
            // Check if element has child elements (icons, etc.) to preserve
            const hasChildElements = el.querySelector('i, svg, img, span.icon');
            if (!hasChildElements) {
                el.textContent = translated;
            } else {
                // Replace only text nodes, preserve element children
                const children = Array.from(el.childNodes);
                let textNodeFound = false;
                children.forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        if (!textNodeFound) {
                            node.textContent = translated + ' ';
                            textNodeFound = true;
                        } else {
                            node.textContent = '';
                        }
                    }
                });
                if (!textNodeFound) {
                    // No text node exists, prepend one before first child
                    el.insertBefore(document.createTextNode(translated + ' '), el.firstChild);
                }
            }
        }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.dataset.i18nPlaceholder;
        const translated = t(key);
        if (translated && translated !== key) {
            el.placeholder = translated;
        }
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.dataset.i18nTitle;
        const translated = t(key);
        if (translated && translated !== key) {
            el.title = translated;
        }
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
        const key = el.dataset.i18nHtml;
        const translated = t(key);
        if (translated && translated !== key) {
            el.innerHTML = translated;
        }
    });
}

// 언어 전환
function setLanguage(lang) {
    if (!SUPPORTED_LANGS[lang]) {
        console.warn(`🌐 [i18n] Unsupported language: ${lang}`);
        return;
    }
    loadLanguage(lang).then(() => {
        applyI18n();
        // 언어 선택 드롭다운 업데이트
        const selector = document.getElementById('lang-selector');
        if (selector) selector.value = lang;
        // 커스텀 이벤트 발생 — JS에서 동적 생성하는 텍스트도 갱신 가능
        document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
    });
}

// 언어 선택 UI 생성 (사이드바 상단, 로고 아래)
function createLanguageSelector() {
    const sidebar = document.getElementById('sidebar') || document.querySelector('.sidebar');
    if (!sidebar) return;

    const container = document.createElement('div');
    container.id = 'lang-switcher';
    container.style.cssText = 'padding:0.4rem 1rem; margin:0;';
    container.innerHTML = `
        <select id="lang-selector" onchange="setLanguage(this.value)" 
            style="width:100%; max-width:200px; padding:0.3rem 0.5rem; border-radius:6px; border:1px solid rgba(232,213,196,0.3); 
            background:rgba(255,248,240,0.1); color:#E8D5C4; font-size:0.78rem; cursor:pointer; appearance:auto;">
            ${Object.entries(SUPPORTED_LANGS).map(([code, info]) => 
                `<option value="${code}" ${code === currentLang ? 'selected' : ''}>${info.flag} ${info.name}</option>`
            ).join('')}
        </select>
    `;

    // 로고 바로 아래에 삽입
    const logo = sidebar.querySelector('.logo');
    if (logo && logo.nextSibling) {
        sidebar.insertBefore(container, logo.nextSibling);
    } else {
        sidebar.prepend(container);
    }
}

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    loadLanguage(currentLang).then(() => {
        applyI18n();
        createLanguageSelector();
    });
});

console.log('🌐 js/i18n.js v1.0 loaded');
