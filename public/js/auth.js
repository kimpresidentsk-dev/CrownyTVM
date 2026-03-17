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
    
    // Google 로그인 버튼
    const googleBtn = document.querySelector('#login-form .btn-google');
    if (googleBtn) {
        googleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            loginWithGoogle();
        });
    }
    
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

// 이메일 회원가입
async function signup() {
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    
    if (!email || !password) {
        showToast(t('auth.enter_email_pw','이메일과 비밀번호를 입력하세요'), 'warning');
        return;
    }
    
    if (password.length < 6) {
        showToast(t('auth.pw_min_6','비밀번호는 최소 6자 이상이어야 합니다'), 'warning');
        return;
    }
    
    // 기존 Google 계정 존재 여부 체크
    try {
        const methods = await auth.fetchSignInMethodsForEmail(email);
        if (methods.includes('google.com')) {
            showToast(t('auth.already_google','이미 Google로 가입된 이메일입니다. Google 로그인을 이용해주세요.'), 'warning');
            return;
        }
    } catch (e) {
        // fetchSignInMethods 실패 시 가입 계속 진행
        console.warn('fetchSignInMethodsForEmail error:', e);
    }
    
    const nickname = await showPromptModal(t('auth.nickname_title','닉네임'), t('auth.enter_nickname','닉네임을 입력하세요 (SNS에 표시됨)'), '');
    if (!nickname || !nickname.trim()) {
        showToast(t('auth.nickname_required','닉네임은 필수입니다'), 'warning');
        return;
    }
    
    const savedInviteCode = localStorage.getItem('crowny_invite_code') || '';
    const referralCode = await showPromptModal(t('auth.referral_title','소개 코드'), t('auth.enter_referral','소개 코드가 있으면 입력하세요 (없으면 빈칸)'), savedInviteCode) || '';
    
    try {
        const result = await auth.createUserWithEmailAndPassword(email, password);
        
        // 이메일 인증 발송
        await result.user.sendEmailVerification();
        
        // Create wallet
        const wallet = web3.eth.accounts.create();
        
        // Save to Firestore
        await db.collection('users').doc(result.user.uid).set({
            email: email,
            nickname: nickname.trim(),
            walletAddress: wallet.address,
            privateKey: wallet.privateKey,
            adminLevel: -1,
            balances: { crny: 0, fnc: 0, crfn: 0 },
            offchainBalances: { crtd: 0, crac: 0, crgc: 0, creb: 0 },
            createdAt: new Date(),
            provider: 'email'
        });
        
        // Create first wallet in subcollection
        await db.collection('users').doc(result.user.uid)
            .collection('wallets').add({
                name: t('wallet.default_name','크라우니 지갑 1'),
                walletAddress: wallet.address,
                privateKey: wallet.privateKey,
                isImported: false,
                totalGasSubsidy: 0,
                balances: { crny: 0, fnc: 0, crfn: 0 },
                createdAt: new Date()
            });
        
        // 소개 코드 적용 + 초대/가입 리워드
        if (typeof INVITE !== 'undefined') {
            await INVITE.processSignupReferral(result.user.uid, referralCode.trim());
        } else if (referralCode.trim() && typeof applyReferralCode === 'function') {
            await applyReferralCode(result.user.uid, referralCode.trim());
        }
        
        showToast(`<i data-lucide="check-circle"></i> ${t('auth.signup_done','가입 완료!')} ${nickname} · <i data-lucide="mail"></i> ${email}`, 'success');
        
    } catch (error) {
        console.error(error);
        const msg = {
            'auth/email-already-in-use': t('auth.email_in_use','이미 사용 중인 이메일입니다'),
            'auth/invalid-email': t('auth.invalid_email_fmt','유효하지 않은 이메일 형식입니다'),
            'auth/weak-password': t('auth.weak_pw','비밀번호가 너무 약합니다 (최소 6자)')
        }[error.code] || error.message;
        showToast(t('auth.signup_failed','가입 실패: ') + msg, 'error');
    }
}

// 이메일 로그인
async function login() {
    console.log('[AUTH] login() called');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    console.log('[AUTH] email:', email, 'pw length:', password?.length);
    
    if (!email || !password) {
        showToast(t('auth.enter_email_pw','이메일과 비밀번호를 입력하세요'), 'warning');
        return;
    }
    
    try {
        console.log('[AUTH] calling signInWithEmailAndPassword...');
        await auth.signInWithEmailAndPassword(email, password);
        console.log('[AUTH] login success');
    } catch (error) {
        console.error('[AUTH] login error:', error);
        const msg = {
            'auth/user-not-found': t('auth.user_not_found','등록되지 않은 이메일입니다'),
            'auth/wrong-password': t('auth.wrong_pw','비밀번호가 틀립니다'),
            'auth/invalid-credential': t('auth.invalid_credential','이메일 또는 비밀번호가 올바르지 않습니다'),
            'auth/too-many-requests': t('auth.too_many','너무 많은 시도. 잠시 후 다시 시도해주세요')
        }[error.code] || error.message;
        showToast(t('auth.login_failed','로그인 실패: ') + msg, 'error');
    }
}

// Google 로그인
async function loginWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');
        
        // 먼저 팝업으로 Google 계정 선택 (아직 로그인 X)
        // credential만 얻기 위해 signInWithPopup 사용 후 충돌 체크
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        const isNewUser = result.additionalUserInfo?.isNewUser;
        
        // 기존 이메일/비밀번호 계정 충돌 체크
        if (isNewUser || result.additionalUserInfo) {
            try {
                const methods = await auth.fetchSignInMethodsForEmail(user.email);
                // 기존 이메일/비밀번호 계정이 있고, Google 계정이 아닌 경우
                if (methods.includes('password') && !methods.includes('google.com')) {
                    // Google 로그인으로 만들어진 계정 삭제 (덮어쓰기 방지)
                    await user.delete();
                    showToast(t('auth.already_email','이미 이메일로 가입된 계정입니다. 이메일/비밀번호로 로그인해주세요.'), 'warning');
                    return;
                }
            } catch (e) {
                console.warn('fetchSignInMethodsForEmail error:', e);
            }
        }
        
        if (isNewUser) {
            // 신규 가입 → Firestore 프로필 + 지갑 생성
            const wallet = web3.eth.accounts.create();
            const nickname = user.displayName || user.email.split('@')[0];
            
            await db.collection('users').doc(user.uid).set({
                email: user.email,
                nickname: nickname,
                walletAddress: wallet.address,
                privateKey: wallet.privateKey,
                adminLevel: -1,
                balances: { crny: 0, fnc: 0, crfn: 0 },
                offchainBalances: { crtd: 0, crac: 0, crgc: 0, creb: 0 },
                photoURL: user.photoURL || '',
                createdAt: new Date(),
                provider: 'google'
            });
            
            await db.collection('users').doc(user.uid)
                .collection('wallets').add({
                    name: t('wallet.default_name','크라우니 지갑 1'),
                    walletAddress: wallet.address,
                    privateKey: wallet.privateKey,
                    isImported: false,
                    totalGasSubsidy: 0,
                    balances: { crny: 0, fnc: 0, crfn: 0 },
                    createdAt: new Date()
                });
            
            // 소개 코드 적용 + 초대/가입 리워드 (Google 가입)
            if (typeof INVITE !== 'undefined') {
                await INVITE.processSignupReferral(user.uid, '');
            }
            
            console.log('✅ Google 신규 가입:', user.email);
        } else {
            console.log('✅ Google 로그인:', user.email);
        }
    } catch (error) {
        if (error.code === 'auth/popup-closed-by-user') return;
        if (error.code === 'auth/popup-blocked') {
            showToast(t('auth.popup_blocked','팝업이 차단되었습니다. 팝업 차단을 해제해주세요.'), 'warning');
            return;
        }
        console.error('Google 로그인 실패:', error);
        showToast(t('auth.google_failed','Google 로그인 실패: ') + error.message, 'error');
    }
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

// Google 계정 연동 (기존 이메일 계정에 Google 로그인 추가)
async function linkGoogleAccount() {
    const user = auth.currentUser;
    if (!user) { showToast(t('common.login_required','로그인이 필요합니다'), 'warning'); return; }
    
    // 이미 Google 연동 여부 체크
    const hasGoogle = user.providerData.some(p => p.providerId === 'google.com');
    if (hasGoogle) {
        showToast(t('auth.google_already_linked','이미 Google 계정이 연동되어 있습니다'), 'info');
        return;
    }
    
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await user.linkWithPopup(provider);
        
        // Firestore에 provider 업데이트
        await db.collection('users').doc(user.uid).update({
            provider: 'email+google',
            photoURL: user.photoURL || ''
        });
        
        showToast(`<i data-lucide="check-circle"></i> ${t('auth.google_linked','Google 계정 연동 완료! 이제 Google로도 로그인할 수 있습니다.')}`, 'success');
    } catch (error) {
        if (error.code === 'auth/popup-closed-by-user') return;
        if (error.code === 'auth/credential-already-in-use') {
            showToast(t('auth.google_used','이 Google 계정은 이미 다른 계정에 연결되어 있습니다.'), 'error');
            return;
        }
        console.error('Google 연동 실패:', error);
        showToast(t('auth.google_link_fail','Google 연동 실패: ') + error.message, 'error');
    }
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
