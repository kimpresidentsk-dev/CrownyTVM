// ===== landing.js v1.0 — 초대 랜딩페이지 (첫 방문자 경험) =====
(function () {
    'use strict';

    const LANDING_ID = 'invite-landing-page';

    // 언어 감지
    function isKo() {
        try { return (localStorage.getItem('crowny_lang') || navigator.language || '').startsWith('ko'); }
        catch { return true; }
    }

    function txt(ko, en) { return isKo() ? ko : en; }

    // #invite=CODE 감지
    function getInviteCode() {
        const m = location.hash.match(/invite=([A-Z0-9-]+)/i);
        return m ? m[1].toUpperCase() : null;
    }

    // 이미 로그인 상태면 스킵
    function isLoggedIn() {
        return !!firebase.auth().currentUser;
    }

    // 멤버 수 가져오기 (Firestore stats)
    async function getMemberCount() {
        try {
            const doc = await db.collection('admin_config').doc('stats').get();
            if (doc.exists && doc.data().totalUsers) return doc.data().totalUsers;
        } catch (e) {}
        return 1200; // fallback placeholder
    }

    // 소개자 이름
    async function getInviterName(code) {
        try {
            const snap = await db.collection('users').where('referralCode', '==', code).get();
            if (!snap.empty) {
                const d = snap.docs[0].data();
                return d.referralNickname || d.nickname || d.email?.split('@')[0] || '';
            }
        } catch (e) {}
        return '';
    }

    function formatNumber(n) {
        return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K+' : n.toLocaleString();
    }

    // ========== 랜딩 페이지 렌더 ==========
    async function show(code) {
        // 코드 저장
        localStorage.setItem('crowny_invite_code', code);

        const [memberCount, inviterName] = await Promise.all([
            getMemberCount(),
            getInviterName(code)
        ]);

        // auth-modal 숨기기
        const authModal = document.getElementById('auth-modal');
        if (authModal) authModal.style.display = 'none';

        const el = document.createElement('div');
        el.id = LANDING_ID;
        el.className = 'landing-page';
        el.innerHTML = `
<div class="landing-inner">
    <!-- Hero -->
    <header class="landing-hero">
        <div class="landing-hero-glow"></div>
        <div class="landing-logo">
            <span class="landing-logo-icon">👑</span>
            <span class="landing-logo-text">CROWNY</span>
        </div>
        ${inviterName ? `<p class="landing-invited-by">${txt('초대자', 'Invited by')}: <strong>${inviterName}</strong></p>` : ''}
        <h1 class="landing-slogan">Protecting Beauty,<br>Empowering Safety:<br><em>For Every Woman in the World.</em></h1>
        <div class="landing-mockup">
            <div class="landing-phone">
                <div class="landing-phone-screen">
                    <div class="landing-phone-header">
                        <span>👑 CROWNY</span>
                        <span style="font-size:0.6rem;opacity:0.6;">PRESENT</span>
                    </div>
                    <div class="landing-phone-grid">
                        <div class="lp-icon"><i data-lucide="coins"></i></div><div class="lp-icon"><i data-lucide="message-circle"></i></div><div class="lp-icon"><i data-lucide="camera"></i></div>
                        <div class="lp-icon">🎨</div><div class="lp-icon">🛒</div><div class="lp-icon">📈</div>
                    </div>
                </div>
            </div>
        </div>
    </header>

    <!-- Features -->
    <section class="landing-features">
        <h2 class="landing-section-title">${txt('올인원 플랫폼', 'All-in-One Platform')}</h2>
        <div class="landing-feature-grid">
            <div class="landing-feature-card">
                <div class="landing-feat-icon">📈</div>
                <h3>Trading Game</h3>
                <p>${txt('가상 트레이딩으로 실력 향상', 'Level up with virtual trading')}</p>
            </div>
            <div class="landing-feature-card">
                <div class="landing-feat-icon">🛒</div>
                <h3>Mall</h3>
                <p>${txt('뷰티 & 라이프스타일 쇼핑', 'Beauty & lifestyle shopping')}</p>
            </div>
            <div class="landing-feature-card">
                <div class="landing-feat-icon">📸</div>
                <h3>Social</h3>
                <p>${txt('소셜 네트워크 & 메신저', 'Social network & messenger')}</p>
            </div>
            <div class="landing-feature-card">
                <div class="landing-feat-icon">🎨</div>
                <h3>Art</h3>
                <p>${txt('디지털 아트 & NFT 마켓', 'Digital art & NFT market')}</p>
            </div>
            <div class="landing-feature-card">
                <div class="landing-feat-icon">🔬</div>
                <h3>Energy</h3>
                <p>${txt('에코 & 바이오 기술', 'Eco & bio technology')}</p>
            </div>
            <div class="landing-feature-card">
                <div class="landing-feat-icon"><i data-lucide="heart"></i></div>
                <h3>Care</h3>
                <p>${txt('여성 안전 & 케어', 'Women safety & care')}</p>
            </div>
        </div>
    </section>

    <!-- Social proof -->
    <section class="landing-proof">
        <div class="landing-proof-number">${formatNumber(memberCount)}</div>
        <p>${txt('멤버가 함께하고 있습니다', 'members worldwide')}</p>
    </section>

    <!-- CTA -->
    <section class="landing-cta">
        <button id="landing-cta-btn" class="landing-cta-btn">
            <i data-lucide="gift" style="width:16px;height:16px;display:inline;"></i> ${txt('가입하고 100 CRTD 받기', 'Sign up & get 100 CRTD free')}
        </button>
        <p class="landing-cta-sub">${txt('무료 가입 · 30초면 완료', 'Free signup · takes 30 seconds')}</p>
    </section>

    <!-- Footer -->
    <footer class="landing-footer">
        <p>© 2025 CROWNY — Protecting Beauty, Empowering Safety</p>
    </footer>
</div>`;

        document.body.appendChild(el);

        // CTA 클릭 → 랜딩 제거, 가입 폼 표시
        document.getElementById('landing-cta-btn').addEventListener('click', function () {
            el.classList.add('landing-exit');
            setTimeout(() => {
                el.remove();
                if (authModal) authModal.style.display = 'flex';
                if (typeof showSignup === 'function') showSignup();
            }, 400);
        });
    }

    // ========== 진입점 ==========
    function init() {
        const code = getInviteCode();
        if (!code) return;
        if (isLoggedIn()) return;

        // invite.js의 기존 showInviteLanding을 오버라이드
        show(code);
    }

    // auth state 변경 전에 빠르게 실행
    // Firebase 초기화 직후, auth state 리스너보다 먼저 실행되도록
    // DOMContentLoaded에서 즉시 체크
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // invite.js의 handleInviteHash가 중복 실행되지 않도록
    // landing이 표시되면 invite.js의 showInviteLanding을 no-op으로 교체
    const origInterval = setInterval(() => {
        if (document.getElementById(LANDING_ID) && window.INVITE) {
            window.INVITE.handleInviteHash = function () {}; // no-op
            clearInterval(origInterval);
        }
    }, 100);
    setTimeout(() => clearInterval(origInterval), 5000);

    window.LANDING = { init, show };
})();
