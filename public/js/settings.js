// ===== settings.js v1.0 - 설정 페이지 =====

async function loadSettings() {
    console.log('loadSettings called', { currentUser, db: typeof db });
    
    const container = document.getElementById('settings-content');
    if (!container) {
        console.warn('Settings container not found');
        return;
    }
    
    // Show loading while checking auth
    container.innerHTML = `<div style="text-align:center;padding:2rem;"><p>${typeof t === 'function' ? t('settings.loading', 'Loading settings...') : 'Loading settings...'}</p></div>`;
    
    // Wait for auth to be ready if needed
    if (!currentUser && typeof auth !== 'undefined') {
        try {
            await new Promise((resolve) => {
                const unsubscribe = auth.onAuthStateChanged((user) => {
                    window.currentUser = user;
                    unsubscribe();
                    resolve();
                });
            });
        } catch(e) {
            console.warn('Auth state check failed:', e);
        }
    }
    
    if (!currentUser) {
        container.innerHTML = `
            <div style="text-align:center;padding:2rem;">
                <p>${getText('settings.login_required', 'Please log in to view settings.')}</p>
                <button onclick="showPage('auth')" style="margin-top:1rem;padding:0.5rem 1rem;background:#3D2B1F;color:#FFF8F0;border:none;border-radius:6px;">${getText('settings.login_btn', 'Log In')}</button>
            </div>
        `;
        return;
    }

    let userData = {};

    // Load user data from server
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        if (token) {
            const resp = await fetch('/api/profile', { headers: { 'Authorization': 'Bearer ' + token } });
            if (resp.ok) userData = await resp.json();
        }
    } catch(e) {
        console.warn('Failed to load user data:', e);
    }
    
    const notifSettings = userData.notificationSettings || { messages: true, social: true, trading: true };
    const currentLang = localStorage.getItem('crowny-lang') || 'ko';
    const currentTheme = localStorage.getItem('crowny-theme') || 'light';
    
    // Helper function for translations with fallback
    const getText = (key, fallback) => (typeof t === 'function' ? t(key, fallback) : fallback);
    
    container.innerHTML = `
        <div class="settings-grid">
            <!-- Profile -->
            <div class="settings-card">
                <h4><i data-lucide="user" style="width:18px;height:18px;display:inline;vertical-align:text-bottom;color:#8B6914;"></i> ${getText('settings.profile', 'Profile Settings')}</h4>
                <p>${getText('settings.nickname', 'Nickname')}: <strong>${userData.nickname || '—'}</strong></p>
                <p>${getText('settings.status', 'Status message')}: ${userData.statusMessage || '—'}</p>
                <button onclick="showProfileEdit()" class="settings-btn">${getText('settings.edit_profile', '<i data-lucide="pencil" style="width:14px;height:14px;display:inline;vertical-align:text-bottom;"></i> Edit Profile')}</button>
            </div>
            
            <!-- Notifications -->
            <div class="settings-card">
                <h4><i data-lucide="bell" style="width:18px;height:18px;display:inline;vertical-align:text-bottom;color:#8B6914;"></i> ${getText('settings.notifications', 'Notification Settings')}</h4>
                <label class="settings-toggle">
                    <span>${getText('settings.msg_notif', 'New message notifications')}</span>
                    <input type="checkbox" id="notif-messages" ${notifSettings.messages !== false ? 'checked' : ''} onchange="saveNotifSettings()">
                    
                </label>
                <label class="settings-toggle">
                    <span>${getText('settings.social_notif', 'Social notifications')}</span>
                    <input type="checkbox" id="notif-social" ${notifSettings.social !== false ? 'checked' : ''} onchange="saveNotifSettings()">
                    
                </label>
                <label class="settings-toggle">
                    <span>${getText('settings.trading_notif', 'Trading notifications')}</span>
                    <input type="checkbox" id="notif-trading" ${notifSettings.trading !== false ? 'checked' : ''} onchange="saveNotifSettings()">
                    
                </label>
            </div>
            
            <!-- Push Notifications -->
            ${typeof renderPushNotifToggle === 'function' ? renderPushNotifToggle() : ''}
            
            <!-- Language -->
            <div class="settings-card">
                <h4><i data-lucide="globe" style="width:18px;height:18px;display:inline;vertical-align:text-bottom;color:#8B6914;"></i> ${getText('settings.language', 'Language Settings')}</h4>
                <button onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'flex' : 'none'; this.textContent = this.nextElementSibling.style.display === 'none' ? (typeof t==='function'?t('settings.select_lang','Select Language'):' Select Language')+' ▼' : (typeof t==='function'?t('settings.select_lang','Select Language'):'Select Language')+' ▲'" class="settings-btn" style="margin-bottom:0.5rem;">${getText('settings.select_lang', 'Select Language')} ▼</button>
                <div class="settings-lang-list" style="display:none">
                    ${Object.entries(typeof SUPPORTED_LANGS !== 'undefined' ? SUPPORTED_LANGS : {
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
                    }).map(([code, info]) => `
                        <label class="settings-radio">
                            <input type="radio" name="lang" value="${code}" ${currentLang === code ? 'checked' : ''} onchange="changeLanguageSetting('${code}')">
                            <span>${info.flag} ${info.name}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
            
            <!-- Theme -->
            <div class="settings-card">
                <h4><i data-lucide="palette" style="width:18px;height:18px;display:inline;vertical-align:text-bottom;color:#8B6914;"></i> ${getText('settings.theme', 'Theme Settings')}</h4>
                <label class="settings-toggle">
                    <span>${getText('settings.dark_mode', 'Dark mode')}</span>
                    <input type="checkbox" id="theme-toggle" ${currentTheme === 'dark' ? 'checked' : ''} onchange="toggleTheme()">
                    
                </label>
            </div>
            
            <!-- Privacy -->
            <div class="settings-card">
                <h4><i data-lucide="lock" style="width:18px;height:18px;display:inline;vertical-align:text-bottom;color:#8B6914;"></i> ${getText('settings.privacy', 'Privacy')}</h4>
                <button onclick="exportMyData()" class="settings-btn">${getText('settings.export_data', '📥 Download my data')}</button>
                <button onclick="requestDeactivation()" class="settings-btn settings-btn-danger">${getText('settings.deactivate', '⚠️ Request account deactivation')}</button>
            </div>
            
            <!-- Security -->
            <div class="settings-card">
                <h4><i data-lucide="shield" style="width:18px;height:18px;display:inline;vertical-align:text-bottom;color:#8B6914;"></i> ${getText('settings.security', 'Security')}</h4>
                <button onclick="resetPassword()" class="settings-btn">${getText('settings.change_password', '🔑 Change password')}</button>
                <p style="font-size:0.8rem; color:var(--accent); margin-top:0.5rem;">
                    ${getText('settings.wallet_encryption', 'Wallet encryption')}: 
                    <strong style="color:#5A9A6E;">AES-GCM ✅</strong>
                </p>
            </div>
        </div>
    `;
    if(window.lucide) lucide.createIcons();
}

async function saveNotifSettings() {
    if (!currentUser) return;
    const settings = {
        messages: document.getElementById('notif-messages')?.checked !== false,
        social: document.getElementById('notif-social')?.checked !== false,
        trading: document.getElementById('notif-trading')?.checked !== false,
    };
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/profile/settings', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ notificationSettings: settings })
        });
        if (!resp.ok) throw new Error('Save failed');
        const message = typeof t === 'function' ? t('settings.saved', 'Saved') : 'Saved';
        if (typeof showToast === 'function') showToast(message, 'success');
    } catch(e) {
        console.error('Failed to save notification settings:', e);
        const errorMessage = typeof t === 'function' ? t('settings.save_failed', 'Save failed') : 'Save failed';
        if (typeof showToast === 'function') showToast(errorMessage, 'error');
    }
}

function changeLanguageSetting(lang) {
    localStorage.setItem('crowny-lang', lang);
    if (typeof setLanguage === 'function') setLanguage(lang);
    const message = typeof t === 'function' ? t('settings.lang_changed', 'Language has been changed') : 'Language has been changed';
    if (typeof showToast === 'function') showToast(message, 'success');
    
    // Reload settings with new language
    setTimeout(() => {
        if (typeof loadSettings === 'function') loadSettings();
    }, 100);
}

function toggleTheme() {
    const isDark = document.getElementById('theme-toggle')?.checked;
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('crowny-theme', theme);
}

// Init theme on load
function initTheme() {
    let theme = localStorage.getItem('crowny-theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
}

async function exportMyData() {
    if (!currentUser) return;
    if (typeof showLoading === 'function') showLoading(t('settings.exporting', 'Exporting data...'));
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/profile', { headers: { 'Authorization': 'Bearer ' + token } });
        const profile = resp.ok ? await resp.json() : {};
        const data = { profile, exportedAt: new Date().toISOString() };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `crowny-data-${currentUser.uid}.json`;
        a.click(); URL.revokeObjectURL(url);
    } catch(e) {
        console.error('Export failed:', e);
    }
    if (typeof hideLoading === 'function') hideLoading();
}

async function requestDeactivation() {
    if (!currentUser) return;
    const confirmed = typeof showConfirmModal === 'function'
        ? await showConfirmModal(t('settings.deactivate', 'Account Deactivation'), t('settings.deactivate_confirm', 'Are you sure you want to deactivate your account?'))
        : confirm(t('settings.deactivate_confirm', 'Are you sure you want to deactivate your account?'));
    if (!confirmed) return;
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/profile/deactivate', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: '{}'
        });
        if (!resp.ok) throw new Error('Failed');
        if (typeof showToast === 'function') showToast(t('settings.deactivate_requested', 'Deactivation request has been submitted'), 'info');
    } catch(e) {
        console.error('Deactivation request failed:', e);
    }
}

// Init theme immediately
initTheme();
