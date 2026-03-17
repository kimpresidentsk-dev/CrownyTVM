// ===== invite.js v1.0 — 초대 시스템 (IIFE, window.INVITE) =====
(function() {
    'use strict';

    const INVITE_URL_BASE = 'https://crowny-org.vercel.app/#invite=';
    let inviteSettings = null;
    let rewardSettings = null;
    let userReferralCode = null;

    // ========== 초기화 ==========
    async function init() {
        if (!currentUser) return;
        await loadSettings();
        await ensureReferralCode();
        handleInviteHash();
    }

    // Firestore 설정 로드
    async function loadSettings() {
        try {
            const [invDoc, rwDoc] = await Promise.all([
                db.collection('admin_config').doc('invite_settings').get(),
                db.collection('admin_config').doc('reward_settings').get()
            ]);
            inviteSettings = invDoc.exists ? invDoc.data() : {};
            rewardSettings = rwDoc.exists ? rwDoc.data() : getDefaultRewardSettings();
        } catch (e) {
            console.warn('invite settings load failed:', e);
            inviteSettings = {};
            rewardSettings = getDefaultRewardSettings();
        }
    }

    function getDefaultRewardSettings() {
        return {
            signupEnabled: true,
            signupTiers: [
                { maxUsers: 1000, amount: 100 },
                { maxUsers: 10000, amount: 30 },
                { maxUsers: 100000, amount: 10 }
            ],
            inviteEnabled: true,
            inviteAmount: 0.5,
            inviteMaxPerUser: 100
        };
    }

    // 유저에게 referralCode 없으면 자동 생성
    async function ensureReferralCode() {
        if (!currentUser) return;
        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            if (!userDoc.exists) return;
            const data = userDoc.data();
            if (data.referralCode) {
                userReferralCode = data.referralCode;
                return;
            }
            // 자동 생성
            let code;
            let exists = true;
            while (exists) {
                const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
                code = 'CR-' + rand;
                const dup = await db.collection('users').where('referralCode', '==', code).get();
                exists = !dup.empty;
            }
            await db.collection('users').doc(currentUser.uid).update({
                referralCode: code,
                referralNickname: data.nickname || '',
                referralCount: data.referralCount || 0,
                referralEarnings: data.referralEarnings || {}
            });
            userReferralCode = code;
        } catch (e) {
            console.error('ensureReferralCode error:', e);
        }
    }

    function getInviteLink() {
        return userReferralCode ? INVITE_URL_BASE + userReferralCode : '';
    }

    // ========== 공유 방법 4가지 ==========

    // 1. 링크 복사
    async function copyLink() {
        const link = getInviteLink();
        if (!link) { showToast(t('invite.no_code', '초대 코드가 없습니다'), 'warning'); return; }
        try {
            await navigator.clipboard.writeText(link);
            showToast(t('invite.link_copied', '✅ 초대 링크가 복사되었습니다!'), 'success');
        } catch (e) {
            // fallback
            const ta = document.createElement('textarea');
            ta.value = link;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast(t('invite.link_copied', '✅ 초대 링크가 복사되었습니다!'), 'success');
        }
    }

    // 2. SMS / Web Share
    async function shareSMS() {
        const link = getInviteLink();
        if (!link) return;
        const text = t('invite.share_text', '크라우니에 가입하세요! 초대 링크:') + ' ' + link;
        if (navigator.share) {
            try {
                await navigator.share({ title: 'CROWNY', text: text, url: link });
            } catch (e) { /* user cancelled */ }
        } else {
            window.open('sms:?body=' + encodeURIComponent(text), '_blank');
        }
    }

    // 3. 카카오톡
    async function shareKakao() {
        const link = getInviteLink();
        if (!link) return;
        const appKey = inviteSettings?.kakaoAppKey;
        if (!appKey) {
            showToast(t('invite.kakao_no_key', '카카오 앱 키가 설정되지 않았습니다. 관리자에게 문의하세요.'), 'warning');
            return;
        }
        try {
            if (!window.Kakao) {
                showToast(t('invite.kakao_sdk_fail', '카카오 SDK 로드 실패'), 'error');
                return;
            }
            if (!Kakao.isInitialized()) {
                Kakao.init(appKey);
            }
            Kakao.Share.sendDefault({
                objectType: 'feed',
                content: {
                    title: t('invite.kakao_title', '크라우니 — Protecting Beauty, Empowering Safety'),
                    description: t('invite.kakao_desc', '지갑 · 트레이딩 · 마켓 · 소셜 · 아트 · 에너지 — 올인원 플랫폼'),
                    imageUrl: 'https://crowny-org.vercel.app/img/og-image.png',
                    link: { mobileWebUrl: link, webUrl: link }
                },
                buttons: [{
                    title: t('invite.kakao_btn', '가입하기'),
                    link: { mobileWebUrl: link, webUrl: link }
                }]
            });
        } catch (e) {
            console.error('Kakao share error:', e);
            showToast(t('invite.kakao_fail', '카카오톡 공유 실패'), 'error');
        }
    }

    // 4. 페이스북
    function shareFacebook() {
        const link = getInviteLink();
        if (!link) return;
        const appId = inviteSettings?.facebookAppId;
        if (!appId) {
            showToast(t('invite.fb_no_id', '페이스북 앱 ID가 설정되지 않았습니다. 관리자에게 문의하세요.'), 'warning');
            return;
        }
        if (window.FB) {
            FB.ui({ method: 'share', href: link }, function(response) {});
        } else {
            // fallback: open share URL
            window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(link), '_blank');
        }
    }

    // ========== 초대 모달 ==========
    async function showInviteModal() {
        if (!currentUser) { showToast(t('common.login_required', '로그인이 필요합니다'), 'warning'); return; }

        // 초대 코드 없으면 생성
        if (!userReferralCode) {
            await ensureReferralCode();
        }

        // 초대 현황 로드
        let completedCount = 0;
        let earnedCRTD = 0;
        try {
            const invSnap = await db.collection('invitations')
                .where('inviterUid', '==', currentUser.uid)
                .where('status', '==', 'completed').get();
            completedCount = invSnap.size;
            invSnap.forEach(doc => {
                const d = doc.data();
                if (d.rewardPaid) earnedCRTD += (rewardSettings?.inviteAmount || 0.5);
            });
        } catch (e) {}

        const link = getInviteLink();
        const modal = document.createElement('div');
        modal.id = 'invite-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
        <div style="background:#FFF8F0;border-radius:16px;max-width:420px;width:100%;max-height:85vh;overflow-y:auto;padding:1.5rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <h3 style="margin:0;"><i data-lucide="gift"></i> ${t('invite.title', '친구 초대')}</h3>
                <button onclick="document.getElementById('invite-modal').remove()" style="background:none;border:none;font-size:1.3rem;cursor:pointer;">✕</button>
            </div>

            <div style="background:#f8f8f8;border-radius:10px;padding:1rem;margin-bottom:1rem;text-align:center;">
                <p style="font-size:0.8rem;color:#6B5744;margin-bottom:0.3rem;">${t('invite.my_code', '내 초대 코드')}</p>
                <p style="font-size:1.4rem;font-weight:800;color:#3D2B1F;letter-spacing:2px;">${userReferralCode || '—'}</p>
                <p style="font-size:0.7rem;color:#6B5744;margin-top:0.3rem;word-break:break-all;">${link}</p>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-bottom:1.2rem;">
                <button onclick="INVITE.copyLink()" style="padding:0.8rem;border:none;border-radius:10px;background:#3D2B1F;color:#FFF8F0;font-weight:700;cursor:pointer;font-size:0.85rem;">
                    <i data-lucide="copy"></i> ${t('invite.copy_link', '링크 복사')}
                </button>
                <button onclick="INVITE.shareSMS()" style="padding:0.8rem;border:none;border-radius:10px;background:#25D366;color:#FFF8F0;font-weight:700;cursor:pointer;font-size:0.85rem;">
                    <i data-lucide="message-circle" style="width:16px;height:16px;margin-right:6px;"></i>${t('invite.sms_share', 'SMS/공유')}
                </button>
                <button onclick="INVITE.shareKakao()" style="padding:0.8rem;border:none;border-radius:10px;background:#FEE500;color:#3C1E1E;font-weight:700;cursor:pointer;font-size:0.85rem;">
                    <i data-lucide="heart" style="color:#FFB800;"></i> ${t('invite.kakao', '카카오톡')}
                </button>
                <button onclick="INVITE.shareFacebook()" style="padding:0.8rem;border:none;border-radius:10px;background:#1877F2;color:#FFF8F0;font-weight:700;cursor:pointer;font-size:0.85rem;">
                    <i data-lucide="facebook"></i> ${t('invite.facebook', '페이스북')}
                </button>
            </div>

            <div style="background:#f0f7ff;border-radius:10px;padding:1rem;">
                <h4 style="margin:0 0 0.5rem 0;font-size:0.9rem;"><i data-lucide="bar-chart-3"></i> ${t('invite.stats', '초대 현황')}</h4>
                <div style="display:flex;justify-content:space-around;text-align:center;">
                    <div>
                        <p style="font-size:1.5rem;font-weight:800;color:#3D2B1F;">${completedCount}</p>
                        <p style="font-size:0.75rem;color:#6B5744;">${t('invite.successful', '초대 성공')}</p>
                    </div>
                    <div>
                        <p style="font-size:1.5rem;font-weight:800;color:#8B6914;">${earnedCRTD.toFixed(1)}</p>
                        <p style="font-size:0.75rem;color:#6B5744;">${t('invite.earned_crtd', '획득 CRTD')}</p>
                    </div>
                </div>
                <p style="font-size:0.7rem;color:#6B5744;margin-top:0.5rem;text-align:center;">
                    ${t('invite.reward_info', '친구가 가입하면 0.5 CRTD를 받아요! (최대 100 CRTD)')}
                </p>
            </div>

            <button onclick="document.getElementById('invite-modal').remove(); showPage('dashboard');" 
                style="width:100%;margin-top:1rem;padding:0.8rem;border:none;border-radius:10px;background:linear-gradient(135deg,#8B6914,#F0C060);color:#3D2B1F;font-weight:700;cursor:pointer;font-size:0.85rem;">
                ⭐ ${t('invite.manage_referral', '소개자 프로그램 관리')}
            </button>
        </div>`;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();
    }

    // ========== 초대 해시 감지 ==========
    function handleInviteHash() {
        const hash = location.hash;
        if (!hash) return;
        const match = hash.match(/invite=([A-Z0-9-]+)/i);
        if (!match) return;
        const code = match[1].toUpperCase();

        if (currentUser) {
            // 이미 로그인
            showToast(t('invite.already_member', '이미 회원입니다!'), 'info');
            // clean hash
            history.replaceState(null, '', location.pathname);
            return;
        }

        // 미로그인 → 가입 유도
        showInviteLanding(code);
    }

    async function showInviteLanding(code) {
        // 소개자 정보 로드
        let inviterName = '';
        try {
            const snap = await db.collection('users').where('referralCode', '==', code).get();
            if (!snap.empty) {
                const d = snap.docs[0].data();
                inviterName = d.referralNickname || d.nickname || d.email?.split('@')[0] || '';
            }
        } catch (e) {}

        // 소개 코드를 localStorage에 저장 (가입 시 사용)
        localStorage.setItem('crowny_invite_code', code);

        const landing = document.createElement('div');
        landing.id = 'invite-landing';
        landing.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.9);z-index:10001;display:flex;align-items:center;justify-content:center;padding:1rem;';
        landing.innerHTML = `
        <div style="background:#FFF8F0;border-radius:16px;max-width:400px;width:100%;padding:2rem;text-align:center;">
            <div style="font-size:3rem;margin-bottom:0.5rem;"><i data-lucide="gift" style="width:80px;height:80px;"></i></div>
            <h2 style="margin:0 0 0.5rem 0;">${t('invite.landing_title', '크라우니에 초대되었습니다!')}</h2>
            ${inviterName ? `<p style="color:#6B5744;margin-bottom:1rem;">${t('invite.invited_by', '소개자')}: <strong>${inviterName}</strong></p>` : ''}
            <p style="font-size:0.85rem;color:#6B5744;margin-bottom:1.5rem;">${t('invite.landing_desc', '가입하고 CRTD 리워드를 받으세요!')}</p>
            <button onclick="document.getElementById('invite-landing').remove();document.getElementById('show-signup-form')?.click();" style="width:100%;padding:1rem;background:#3D2B1F;color:#FFF8F0;border:none;border-radius:12px;font-size:1rem;font-weight:700;cursor:pointer;">
                <i data-lucide="rocket"></i> ${t('invite.signup_btn', '가입하기')}
            </button>
            <button onclick="document.getElementById('invite-landing').remove()" style="width:100%;padding:0.7rem;background:transparent;border:none;color:#6B5744;cursor:pointer;margin-top:0.5rem;font-size:0.85rem;">
                ${t('common.close', '닫기')}
            </button>
        </div>`;
        document.body.appendChild(landing);
    }

    // ========== 가입 리워드 (단계별) ==========
    async function grantSignupReward(uid) {
        if (!rewardSettings) await loadSettings();
        if (!rewardSettings?.signupEnabled) return;

        try {
            // 현재 가입 순번
            let totalUsers = 0;
            const statsDoc = await db.collection('admin_config').doc('stats').get();
            if (statsDoc.exists) {
                totalUsers = statsDoc.data().totalUsers || 0;
            }

            // 단계별 금액 결정
            const tiers = rewardSettings.signupTiers || [];
            let amount = 0;
            for (const tier of tiers) {
                if (totalUsers <= tier.maxUsers) {
                    amount = tier.amount;
                    break;
                }
            }
            if (amount <= 0) return;

            // 원자적 지급
            await db.runTransaction(async (tx) => {
                const userRef = db.collection('users').doc(uid);
                const userDoc = await tx.get(userRef);
                if (!userDoc.exists) return;
                const off = userDoc.data().offchainBalances || {};
                tx.update(userRef, {
                    'offchainBalances.crtd': (off.crtd || 0) + amount
                });
            });

            // 로그
            await db.collection('reward_logs').add({
                uid: uid,
                type: 'signup',
                amount: amount,
                userNumber: totalUsers,
                createdAt: new Date()
            });

            console.log(`🎁 가입 리워드: ${amount} CRTD → ${uid} (순번 ${totalUsers})`);
        } catch (e) {
            console.error('grantSignupReward error:', e);
        }
    }

    // ========== 초대 리워드 ==========
    async function grantInviteReward(inviterUid, inviteeUid) {
        if (!rewardSettings) await loadSettings();
        if (!rewardSettings?.inviteEnabled) return;

        const amount = rewardSettings.inviteAmount || 0.5;
        const maxPerUser = rewardSettings.inviteMaxPerUser || 100;

        try {
            // 한도 체크
            const paidSnap = await db.collection('invitations')
                .where('inviterUid', '==', inviterUid)
                .where('rewardPaid', '==', true).get();
            const totalPaid = paidSnap.size * amount;
            if (totalPaid >= maxPerUser) {
                console.log(`⚠️ 초대 리워드 한도 초과: ${inviterUid}`);
                return;
            }

            // 원자적 지급
            await db.runTransaction(async (tx) => {
                const userRef = db.collection('users').doc(inviterUid);
                const userDoc = await tx.get(userRef);
                if (!userDoc.exists) return;
                const off = userDoc.data().offchainBalances || {};
                tx.update(userRef, {
                    'offchainBalances.crtd': (off.crtd || 0) + amount
                });
            });

            // invitation 문서 업데이트
            const invSnap = await db.collection('invitations')
                .where('inviterUid', '==', inviterUid)
                .where('inviteeUid', '==', inviteeUid)
                .where('rewardPaid', '==', false).limit(1).get();
            if (!invSnap.empty) {
                await invSnap.docs[0].ref.update({ rewardPaid: true, status: 'completed' });
            }

            // 로그
            await db.collection('reward_logs').add({
                uid: inviterUid,
                type: 'invite',
                amount: amount,
                inviteeUid: inviteeUid,
                createdAt: new Date()
            });

            console.log(`🎁 초대 리워드: ${amount} CRTD → ${inviterUid}`);
        } catch (e) {
            console.error('grantInviteReward error:', e);
        }
    }

    // ========== 가입 시 초대 처리 (auth.js에서 호출) ==========
    async function processSignupReferral(newUserId, referralCode) {
        if (!referralCode) {
            // localStorage에서 체크
            referralCode = localStorage.getItem('crowny_invite_code');
            localStorage.removeItem('crowny_invite_code');
        }
        if (!referralCode) return;

        try {
            const snap = await db.collection('users')
                .where('referralCode', '==', referralCode.toUpperCase()).get();
            if (snap.empty) return;

            const inviterDoc = snap.docs[0];
            const inviterUid = inviterDoc.id;
            if (inviterUid === newUserId) return; // 자기 자신

            // invitation 문서 생성
            await db.collection('invitations').add({
                inviterUid: inviterUid,
                inviteeUid: newUserId,
                inviteeEmail: currentUser?.email || '',
                status: 'completed',
                rewardPaid: false,
                createdAt: new Date()
            });

            // 초대 리워드 지급
            await grantInviteReward(inviterUid, newUserId);

            // totalUsers 카운터 증가
            await db.collection('admin_config').doc('stats').set({
                totalUsers: firebase.firestore.FieldValue.increment(1)
            }, { merge: true });

            // 가입 리워드 지급
            await grantSignupReward(newUserId);

        } catch (e) {
            console.error('processSignupReferral error:', e);
        }
    }

    // ========== Public API ==========
    window.INVITE = {
        init,
        copyLink,
        shareSMS,
        shareKakao,
        shareFacebook,
        showInviteModal,
        handleInviteHash,
        processSignupReferral,
        grantSignupReward,
        getInviteLink,
        getSettings: () => rewardSettings,
        getUserCode: () => userReferralCode
    };

})();
