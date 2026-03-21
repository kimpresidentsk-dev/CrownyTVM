// ===== auth.js - 회원가입, 로그인, 구글, 이메일인증, 비밀번호 리셋 =====
// Firebase 의존성 완전 제거 — CrownyTVM 서버 API만 사용

// 로그인 버튼 이벤트 보강 (onclick 대비)
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.querySelector('#login-form .btn-primary');
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            login();
        });
        // 터치 디바이스 대응
        loginBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            login();
        });
    }

    // Google 로그인 버튼 제거됨

    // Enter 키로 로그인
    const pwInput = document.getElementById('login-password');
    if (pwInput) {
        pwInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); login(); }
        });
    }
});

// 비밀번호 강도 체크 (실시간)
document.addEventListener('DOMContentLoaded', () => {
    const pwInput = document.getElementById('signup-password');
    if (pwInput) {
        pwInput.addEventListener('input', function() {
            const pw = this.value;
            const el = document.getElementById('password-strength');
            if (!el) return;
            if (pw.length === 0) { el.textContent = ''; return; }
            if (pw.length < 6) { el.textContent = t('auth.min_6chars', 'Minimum 6 characters'); el.style.color = '#B54534'; return; }
            let score = 0;
            if (pw.length >= 8) score++;
            if (/[A-Z]/.test(pw)) score++;
            if (/[0-9]/.test(pw)) score++;
            if (/[^A-Za-z0-9]/.test(pw)) score++;
            const labels = [t('auth.pw_weak','Weak'), t('auth.pw_normal','Fair'), t('auth.pw_good','Good'), t('auth.pw_strong','Strong')];
            const colors = ['#B54534', '#C4841D', '#6B8F3C', '#3D2B1F'];
            el.textContent = labels[Math.min(score, 3)];
            el.style.color = colors[Math.min(score, 3)];
        });
    }
});

// 회원가입 — CrownyTVM API 기반
async function signup() {
    const username = (document.getElementById('signup-username') || {}).value?.trim();
    const displayName = (document.getElementById('signup-displayname') || {}).value?.trim();
    const password = document.getElementById('signup-password').value;

    if (!username || !password) {
        showToast(t('auth.enter_id_pw','Please enter your ID and password'), 'warning');
        return;
    }

    if (!/^[a-z0-9._-]{2,30}$/.test(username)) {
        showToast(t('auth.id_format','ID: lowercase, numbers, ._- only (2-30 chars)'), 'warning');
        return;
    }

    if (password.length < 6) {
        showToast(t('auth.pw_min_6','Password must be at least 6 characters'), 'warning');
        return;
    }

    try {
        // CrownyTVM API로 가입
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, displayName: displayName || username })
        });
        const data = await res.json();

        if (data.error) {
            showToast(t('auth.register_fail','Registration failed: ') + data.error, 'error');
            return;
        }

        const email = username + '@crowny.org';
        showToast(`<i data-lucide="check-circle"></i> ${t('auth.register_done','Registered!')} ${displayName || username} · <i data-lucide="mail"></i> ${email}`, 'success');

        // 자동 로그인
        localStorage.setItem('crowny_token', data.token);
        localStorage.setItem('ctvm_token', data.token);
        localStorage.setItem('crowny_username', username);
        if (typeof ctvmToken !== 'undefined') window.ctvmToken = data.token;

        // UI 업데이트
        if (typeof onLoginSuccess === 'function') onLoginSuccess(data);
        document.getElementById('auth-modal').style.display = 'none';
        // 랜딩 페이지 숨기기 & 스크롤 복원
        if (typeof updateLandingState === 'function') updateLandingState({ username });
        else { document.body.style.overflow = ''; const lp = document.getElementById('landing-page'); if (lp) lp.classList.add('hidden'); }

    } catch (error) {
        console.error(error);
        showToast(t('auth.register_fail','Registration failed: ') + error.message, 'error');
    }
}

// 로그인 — CrownyTVM API 전용
async function login() {
    console.log('[AUTH] login() called');
    const emailOrUsername = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!emailOrUsername || !password) {
        showToast(t('auth.enter_email_pw','Please enter your email/ID and password'), 'warning');
        return;
    }

    // username인지 email인지 판별
    const username = emailOrUsername.includes('@') ? emailOrUsername.split('@')[0] : emailOrUsername;

    try {
        // CrownyTVM API로 로그인
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (data.token) {
            console.log('[AUTH] CrownyTVM login success');
            localStorage.setItem('crowny_token', data.token);
            localStorage.setItem('ctvm_token', data.token);
            localStorage.setItem('crowny_username', username);
            if (typeof ctvmToken !== 'undefined') window.ctvmToken = data.token;

            document.getElementById('auth-modal').style.display = 'none';
            if (typeof onLoginSuccess === 'function') onLoginSuccess(data);
            return;
        }

        // 로그인 실패
        const errorMsg = data.error || t('auth.invalid_credentials','Invalid ID or password');
        showToast(t('auth.login_failed','Login failed: ') + errorMsg, 'error');
    } catch (error) {
        console.error('[AUTH] login error:', error);
        showToast(t('auth.login_failed','Login failed: ') + error.message, 'error');
    }
}

// Google 로그인 — 비활성화 (crowny.org 자체 인증 사용)
async function loginWithGoogle() {
    showToast(t('auth.google_unsupported','Google login is no longer supported. Please use ID/password.'), 'info');
}

// 비밀번호 재설정 — CrownyTVM에서는 관리자 문의
async function resetPassword() {
    showToast(t('auth.reset_pw_contact','Contact admin to reset password.'), 'info');
}

// 이메일 인증 확인 — CrownyTVM에서는 불필요
async function checkEmailVerified() {
    showToast(t('auth.no_email_verify','Email verification is not required'), 'info');
}

// 인증 메일 재발송 — CrownyTVM에서는 불필요
async function resendVerification() {
    showToast(t('auth.no_email_verify','Email verification is not required'), 'info');
}

// Google 계정 연동 — 비활성화
async function linkGoogleAccount() {
    showToast(t('auth.google_link_unsupported','Google account linking is no longer supported.'), 'info');
}

// 비밀번호 설정 (프로필에서 비밀번호 변경) — CrownyTVM API 사용
async function setupPasswordFromProfile() {
    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    if (!token) { showToast(t('common.login_required','Login required'), 'warning'); return; }

    if (typeof showPromptModal !== 'function') { showToast(t('auth.ui_fail','UI module failed to load'), 'error'); return; }

    const newPw = await showPromptModal(t('auth.setup_pw','<i data-lucide="key"></i> Set Password'), t('auth.new_pw_hint','New password (6+ characters)'), '', true);
    if (!newPw || newPw.length < 6) { if (newPw !== null) showToast(t('auth.pw_min_6','Password must be at least 6 characters'), 'error'); return; }

    const newPw2 = await showPromptModal(t('auth.confirm_pw','<i data-lucide="key"></i> Confirm Password'), t('auth.reenter_pw','Please re-enter your password'), '', true);
    if (newPw !== newPw2) { showToast(t('auth.pw_mismatch','Passwords do not match'), 'error'); return; }

    try {
        const res = await fetch('/api/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ newPassword: newPw })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        showToast(`<i data-lucide="check-circle"></i> ${t('auth.pw_set_done','Password has been set!')}`, 'success');
        // 프로필 모달 새로고침
        const modal = document.getElementById('profile-edit-modal');
        if (modal) { modal.remove(); if (typeof showProfileEdit === 'function') showProfileEdit(); }
    } catch (e) {
        console.error('비밀번호 설정 실패:', e);
        showToast(t('auth.pw_set_fail','Password setup failed: ') + e.message, 'error');
    }
}

// 비밀번호 변경 — CrownyTVM API: POST /api/change-password
async function changePasswordFromProfile() {
    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    if (!token) { showToast(t('common.login_required','Login required'), 'warning'); return; }

    if (typeof showPromptModal !== 'function') { showToast(t('auth.ui_fail','UI module failed to load'), 'error'); return; }

    const oldPw = await showPromptModal(t('auth.current_pw','Current Password'), t('auth.enter_current_pw','Enter your current password'), '', true);
    if (!oldPw) return;

    const newPw = await showPromptModal(t('auth.change_pw','<i data-lucide="key"></i> Change Password'), t('auth.new_pw_hint','New password (6+ characters)'), '', true);
    if (!newPw || newPw.length < 6) { if (newPw !== null) showToast(t('auth.pw_min_6','Password must be at least 6 characters'), 'error'); return; }

    const newPw2 = await showPromptModal(t('auth.confirm_pw','<i data-lucide="key"></i> Confirm Password'), t('auth.reenter_new_pw','Please re-enter your new password'), '', true);
    if (newPw !== newPw2) { showToast(t('auth.pw_mismatch','Passwords do not match'), 'error'); return; }

    try {
        const res = await fetch('/api/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        showToast(`<i data-lucide="check-circle"></i> ${t('auth.pw_changed','Password changed successfully!')}`, 'success');
    } catch (e) {
        console.error('비밀번호 변경 실패:', e);
        showToast(t('auth.pw_change_fail','Password change failed: ') + e.message, 'error');
    }
}

// Logout — CrownyTVM 전용
function logout() {
    if (typeof cleanupNotifications === 'function') cleanupNotifications();
    // CrownyTVM 토큰 제거
    localStorage.removeItem('crowny_token');
    localStorage.removeItem('ctvm_token');
    localStorage.removeItem('crowny_username');
    currentUser = null;
    if (typeof useIndependentDB !== 'undefined') useIndependentDB = true;
    location.reload();
}
