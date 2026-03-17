// ===== auth.js - 회원가입, 로그인, 구글, 이메일인증, 비밀번호 리셋 =====

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
            if (pw.length < 6) { el.textContent = t('auth.min_6chars', '⚠️ 최소 6자 이상'); el.style.color = '#B54534'; return; }
            let score = 0;
            if (pw.length >= 8) score++;
            if (/[A-Z]/.test(pw)) score++;
            if (/[0-9]/.test(pw)) score++;
            if (/[^A-Za-z0-9]/.test(pw)) score++;
            const labels = [t('auth.pw_weak','약함 🔴'), t('auth.pw_normal','보통 🟡'), t('auth.pw_good','좋음 🟢'), t('auth.pw_strong','강함 💪')];
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
        showToast(t('auth.enter_id_pw','아이디와 비밀번호를 입력하세요'), 'warning');
        return;
    }

    if (!/^[a-z0-9._-]{2,30}$/.test(username)) {
        showToast('아이디: 영문 소문자, 숫자, ._- 만 가능 (2~30자)', 'warning');
        return;
    }

    if (password.length < 6) {
        showToast(t('auth.pw_min_6','비밀번호는 최소 6자 이상이어야 합니다'), 'warning');
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
            showToast('가입 실패: ' + data.error, 'error');
            return;
        }

        const email = username + '@crowny.org';
        showToast(`<i data-lucide="check-circle"></i> 가입 완료! ${displayName || username} · <i data-lucide="mail"></i> ${email}`, 'success');

        // 자동 로그인
        localStorage.setItem('crowny_token', data.token);
        localStorage.setItem('crowny_username', username);

        // Firebase에도 계정 생성 (기존 시스템 호환)
        try {
            await auth.createUserWithEmailAndPassword(email, password);
        } catch (e) {
            // Firebase 실패해도 CrownyTVM 가입은 성공
            console.warn('Firebase sync:', e.message);
        }

        // UI 업데이트
        if (typeof onLoginSuccess === 'function') onLoginSuccess(data);
        document.getElementById('auth-modal').style.display = 'none';

    } catch (error) {
        console.error(error);
        showToast('가입 실패: ' + error.message, 'error');
    }
}

// 로그인 — CrownyTVM API 우선, Firebase 폴백
async function login() {
    console.log('[AUTH] login() called');
    const emailOrUsername = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!emailOrUsername || !password) {
        showToast(t('auth.enter_email_pw','이메일/아이디와 비밀번호를 입력하세요'), 'warning');
        return;
    }

    // username인지 email인지 판별
    const username = emailOrUsername.includes('@') ? emailOrUsername.split('@')[0] : emailOrUsername;

    try {
        // CrownyTVM API로 로그인 시도
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (data.token) {
            console.log('[AUTH] CrownyTVM login success');
            localStorage.setItem('crowny_token', data.token);
            localStorage.setItem('crowny_username', username);

            // Firebase에도 로그인 (기존 시스템 호환)
            try {
                await auth.signInWithEmailAndPassword(username + '@crowny.org', password);
            } catch (e) {
                console.warn('Firebase sync:', e.message);
            }

            if (typeof onLoginSuccess === 'function') onLoginSuccess(data);
            document.getElementById('auth-modal').style.display = 'none';
            showToast(`<i data-lucide="check-circle"></i> 로그인 성공`, 'success');
            return;
        }
    } catch (e) {
        console.warn('[AUTH] CrownyTVM API error, trying Firebase:', e.message);
    }

    // Firebase 폴백
    try {
        const email = emailOrUsername.includes('@') ? emailOrUsername : emailOrUsername + '@crowny.org';
        await auth.signInWithEmailAndPassword(email, password);
        console.log('[AUTH] Firebase login success');
    } catch (error) {
        console.error('[AUTH] login error:', error);
        const msg = {
            'auth/user-not-found': t('auth.user_not_found','등록되지 않은 이메일입니다'),
            'auth/wrong-password': t('auth.wrong_pw','비밀번호가 틀립니다'),
            'auth/invalid-credential': t('auth.invalid_credential','아이디 또는 비밀번호가 올바르지 않습니다'),
            'auth/too-many-requests': t('auth.too_many','너무 많은 시도. 잠시 후 다시 시도해주세요')
        }[error.code] || error.message;
        showToast(t('auth.login_failed','로그인 실패: ') + msg, 'error');
    }
}

// Google 로그인 — 비활성화 (crowny.org 자체 인증 사용)
async function loginWithGoogle() {
    showToast('Google 로그인은 더 이상 지원되지 않습니다. 아이디/비밀번호로 로그인하세요.', 'info');
}

// 비밀번호 재설정
async function resetPassword() {
    const email = document.getElementById('login-email').value.trim() || await showPromptModal(t('auth.reset_pw','비밀번호 재설정'), t('auth.reset_email','비밀번호를 재설정할 이메일'), '');
    if (!email) return;
    
    try {
        await auth.sendPasswordResetEmail(email);
        showToast(`<i data-lucide="mail"></i> ${t('auth.reset_sent','비밀번호 재설정 링크를 보냈습니다.')} ${email}`, 'success');
    } catch (error) {
        const msg = {
            'auth/user-not-found': '등록되지 않은 이메일입니다',
            'auth/invalid-email': t('auth.invalid_email','유효하지 않은 이메일입니다')
        }[error.code] || error.message;
        showToast(t('common.failed','실패: ') + msg, 'error');
    }
}

// 이메일 인증 확인
async function checkEmailVerified() {
    const user = auth.currentUser;
    if (!user) return;
    
    await user.reload();
    if (user.emailVerified) {
        showToast(`<i data-lucide="check-circle"></i> ${t('auth.email_verified','이메일 인증 완료!')}`, 'success');
        document.getElementById('verify-email-form').style.display = 'none';
        location.reload();
    } else {
        showToast(t('auth.not_verified','아직 인증되지 않았습니다. 이메일의 인증 링크를 클릭해주세요.'), 'warning');
    }
}

// 인증 메일 재발송
async function resendVerification() {
    const user = auth.currentUser;
    if (!user) return;
    
    try {
        await user.sendEmailVerification();
        showToast(`<i data-lucide="mail"></i> ${t('auth.resend_done','인증 메일을 다시 보냈습니다.')} ${user.email}`, 'success');
    } catch (error) {
        showToast(t('auth.resend_fail','재발송 실패: ') + error.message, 'error');
    }
}

// Google 계정 연동 — 비활성화
async function linkGoogleAccount() {
    showToast('Google 계정 연동은 더 이상 지원되지 않습니다.', 'info');
}

// 비밀번호 설정 (Google-only 사용자가 이메일/비밀번호 추가)
async function setupPasswordFromProfile() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const hasPassword = user.providerData.some(p => p.providerId === 'password');
    if (hasPassword) { showToast(t('auth.pw_already_set','이미 비밀번호가 설정되어 있습니다'), 'info'); return; }

    if (typeof showPromptModal !== 'function') { showToast(t('auth.ui_fail','UI 모듈 로드 실패'), 'error'); return; }

    const pw = await showPromptModal(t('auth.setup_pw','<i data-lucide="key"></i> 비밀번호 설정'), t('auth.new_pw_hint','새 비밀번호 (6자 이상)'), '', true);
    if (!pw || pw.length < 6) { if (pw !== null) showToast(t('auth.pw_min_6','비밀번호는 6자 이상이어야 합니다'), 'error'); return; }

    const pw2 = await showPromptModal(t('auth.confirm_pw','<i data-lucide="key"></i> 비밀번호 확인'), t('auth.reenter_pw','비밀번호를 다시 입력하세요'), '', true);
    if (pw !== pw2) { showToast(t('auth.pw_mismatch','비밀번호가 일치하지 않습니다'), 'error'); return; }

    try {
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, pw);
        await user.linkWithCredential(credential);
        await db.collection('users').doc(user.uid).update({
            provider: user.providerData.map(p => p.providerId === 'google.com' ? 'google' : 'email').join('+')
        });
        showToast(`<i data-lucide="check-circle"></i> ${t('auth.pw_set_done','비밀번호 설정 완료! 이제 이메일/비밀번호로도 로그인 가능합니다.')}`, 'success');
        // 프로필 모달 새로고침
        const modal = document.getElementById('profile-edit-modal');
        if (modal) { modal.remove(); showProfileEdit(); }
    } catch (e) {
        console.error('비밀번호 설정 실패:', e);
        showToast(t('auth.pw_set_fail','비밀번호 설정 실패: ') + e.message, 'error');
    }
}

// 비밀번호 변경
async function changePasswordFromProfile() {
    const user = firebase.auth().currentUser;
    if (!user) return;

    if (typeof showPromptModal !== 'function') { showToast(t('auth.ui_fail','UI 모듈 로드 실패'), 'error'); return; }

    const newPw = await showPromptModal(t('auth.change_pw','<i data-lucide="key"></i> 비밀번호 변경'), t('auth.new_pw_hint','새 비밀번호 (6자 이상)'), '', true);
    if (!newPw || newPw.length < 6) { if (newPw !== null) showToast(t('auth.pw_min_6','비밀번호는 6자 이상이어야 합니다'), 'error'); return; }

    const newPw2 = await showPromptModal(t('auth.confirm_pw','<i data-lucide="key"></i> 비밀번호 확인'), t('auth.reenter_new_pw','새 비밀번호를 다시 입력하세요'), '', true);
    if (newPw !== newPw2) { showToast(t('auth.pw_mismatch','비밀번호가 일치하지 않습니다'), 'error'); return; }

    try {
        await user.updatePassword(newPw);
        showToast(`<i data-lucide="check-circle"></i> ${t('auth.pw_changed','비밀번호 변경 완료!')}`, 'success');
    } catch (e) {
        if (e.code === 'auth/requires-recent-login') {
            showToast(t('auth.relogin','보안을 위해 재로그인이 필요합니다. 로그아웃 후 다시 로그인해주세요.'), 'warning');
        } else {
            showToast(t('auth.pw_change_fail','비밀번호 변경 실패: ') + e.message, 'error');
        }
    }
}

// Logout
function logout() {
    if (typeof cleanupNotifications === 'function') cleanupNotifications();
    auth.signOut();
    location.reload();
}
