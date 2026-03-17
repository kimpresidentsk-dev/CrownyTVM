// ===== settings.js v1.0 - 설정 페이지 =====

async function loadSettings() {
    console.log('loadSettings called', { currentUser, db: typeof db });
    
    const container = document.getElementById('settings-content');
    if (!container) {
        console.warn('Settings container not found');
        return;
    }
    
    // Show loading while checking auth
    container.innerHTML = '<div style="text-align:center;padding:2rem;"><p>설정을 불러오는 중...</p></div>';
    
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
                <p>설정을 보려면 로그인이 필요합니다.</p>
                <button onclick="showPage('auth')" style="margin-top:1rem;padding:0.5rem 1rem;background:#3D2B1F;color:#FFF8F0;border:none;border-radius:6px;">로그인</button>
            </div>
        `;
        return;
    }

    let userData = {};
    
    // Load user data with fallback
    try {
        if (typeof db !== 'undefined') {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            userData = userDoc.exists ? userDoc.data() : {};
        } else {
            console.warn('Firestore db not available');
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
                <h4><i data-lucide="user" style="width:18px;height:18px;display:inline;vertical-align:text-bottom;color:#8B6914;"></i> ${getText('settings.profile', '프로필 설정')}</h4>
                <p>${getText('settings.nickname', '닉네임')}: <strong>${userData.nickname || '—'}</strong></p>
                <p>${getText('settings.status', '상태 메시지')}: ${userData.statusMessage || '—'}</p>
                <button onclick="showProfileEdit()" class="settings-btn">${getText('settings.edit_profile', '<i data-lucide="pencil" style="width:14px;height:14px;display:inline;vertical-align:text-bottom;"></i> 프로필 편집')}</button>
            </div>
            
            <!-- Notifications -->
            <div class="settings-card">
                <h4><i data-lucide="bell" style="width:18px;height:18px;display:inline;vertical-align:text-bottom;color:#8B6914;"></i> ${getText('settings.notifications', '알림 설정')}</h4>
                <label class="settings-toggle">
                    <span>${getText('settings.msg_notif', '새 메시지 알림')}</span>
                    <input type="checkbox" id="notif-messages" ${notifSettings.messages !== false ? 'checked' : ''} onchange="saveNotifSettings()">
                    
                </label>
                <label class="settings-toggle">
                    <span>${getText('settings.social_notif', '소셜 알림')}</span>
                    <input type="checkbox" id="notif-social" ${notifSettings.social !== false ? 'checked' : ''} onchange="saveNotifSettings()">
                    
                </label>
                <label class="settings-toggle">
                    <span>${getText('settings.trading_notif', '거래 알림')}</span>
                    <input type="checkbox" id="notif-trading" ${notifSettings.trading !== false ? 'checked' : ''} onchange="saveNotifSettings()">
                    
                </label>
            </div>
            
            <!-- Push Notifications -->
            ${typeof renderPushNotifToggle === 'function' ? renderPushNotifToggle() : ''}
            
            <!-- Language -->
            <div class="settings-card">
                <h4><i data-lucide="globe" style="width:18px;height:18px;display:inline;vertical-align:text-bottom;color:#8B6914;"></i> ${getText('settings.language', '언어 설정')}</h4>
                <button onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'flex' : 'none'; this.textContent = this.nextElementSibling.style.display === 'none' ? '언어 선택 ▼' : '언어 선택 ▲'" class="settings-btn" style="margin-bottom:0.5rem;">언어 선택 ▼</button>
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
                <h4><i data-lucide="palette" style="width:18px;height:18px;display:inline;vertical-align:text-bottom;color:#8B6914;"></i> ${getText('settings.theme', '테마 설정')}</h4>
                <label class="settings-toggle">
                    <span>${getText('settings.dark_mode', '다크 모드')}</span>
                    <input type="checkbox" id="theme-toggle" ${currentTheme === 'dark' ? 'checked' : ''} onchange="toggleTheme()">
                    
                </label>
            </div>
            
            <!-- Privacy -->
            <div class="settings-card">
                <h4><i data-lucide="lock" style="width:18px;height:18px;display:inline;vertical-align:text-bottom;color:#8B6914;"></i> ${getText('settings.privacy', '개인정보')}</h4>
                <button onclick="exportMyData()" class="settings-btn">${getText('settings.export_data', '📥 내 데이터 다운로드')}</button>
                <button onclick="requestDeactivation()" class="settings-btn settings-btn-danger">${getText('settings.deactivate', '⚠️ 계정 비활성화 요청')}</button>
            </div>
            
            <!-- Security -->
            <div class="settings-card">
                <h4><i data-lucide="shield" style="width:18px;height:18px;display:inline;vertical-align:text-bottom;color:#8B6914;"></i> ${getText('settings.security', '보안')}</h4>
                <button onclick="resetPassword()" class="settings-btn">${getText('settings.change_password', '🔑 비밀번호 변경')}</button>
                <p style="font-size:0.8rem; color:var(--accent); margin-top:0.5rem;">
                    ${getText('settings.wallet_encryption', '지갑 암호화')}: 
                    <strong style="color:#6B8F3C;">AES-GCM ✅</strong>
                </p>
            </div>
        </div>
    `;
    if(window.lucide) lucide.createIcons();
}

async function saveNotifSettings() {
    if (!currentUser || typeof db === 'undefined') return;
    const settings = {
        messages: document.getElementById('notif-messages')?.checked !== false,
        social: document.getElementById('notif-social')?.checked !== false,
        trading: document.getElementById('notif-trading')?.checked !== false,
    };
    try {
        await db.collection('users').doc(currentUser.uid).update({ notificationSettings: settings });
        const message = typeof t === 'function' ? t('settings.saved', '저장됨') : '저장됨';
        if (typeof showToast === 'function') showToast(message, 'success');
    } catch(e) {
        console.error('Failed to save notification settings:', e);
        const errorMessage = typeof t === 'function' ? t('settings.save_failed', '저장 실패') : '저장 실패';
        if (typeof showToast === 'function') showToast(errorMessage, 'error');
    }
}

function changeLanguageSetting(lang) {
    localStorage.setItem('crowny-lang', lang);
    if (typeof setLanguage === 'function') setLanguage(lang);
    const message = typeof t === 'function' ? t('settings.lang_changed', '언어가 변경되었습니다') : '언어가 변경되었습니다';
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
    if (typeof showLoading === 'function') showLoading(t('settings.exporting', '데이터 내보내는 중...'));
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const data = { profile: userDoc.exists ? userDoc.data() : {}, exportedAt: new Date().toISOString() };
        
        // Remove sensitive fields
        delete data.profile.encryptedPrivateKey;
        delete data.profile.wallets;
        
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
        ? await showConfirmModal(t('settings.deactivate', '계정 비활성화'), t('settings.deactivate_confirm', '정말 계정을 비활성화 하시겠습니까?'))
        : confirm(t('settings.deactivate_confirm', '정말 계정을 비활성화 하시겠습니까?'));
    if (!confirmed) return;
    try {
        await db.collection('deactivation_requests').add({
            uid: currentUser.uid,
            email: currentUser.email,
            requestedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        if (typeof showToast === 'function') showToast(t('settings.deactivate_requested', '비활성화 요청이 접수되었습니다'), 'info');
    } catch(e) {
        console.error('Deactivation request failed:', e);
    }
}

// Init theme immediately
initTheme();
