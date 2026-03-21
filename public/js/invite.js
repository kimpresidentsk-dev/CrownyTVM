// ===== invite.js v1.0 — 초대 시스템 (Server REST API) =====
(function() {
    'use strict';

    const INVITE_URL_BASE = 'https://crowny.org/#invite=';
    let inviteSettings = null;
    let rewardSettings = null;
    let userReferralCode = null;

    function _headers() {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
    }
    function _authHeaders() {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        return { 'Authorization': 'Bearer ' + token };
    }

    async function init() {
        if (!currentUser) return;
        await loadSettings();
        await ensureReferralCode();
        handleInviteHash();
    }

    async function loadSettings() {
        try {
            const res = await fetch('/api/invite/settings', { headers: _authHeaders() });
            const data = await res.json();
            inviteSettings = data.inviteSettings || {};
            rewardSettings = data.rewardSettings || getDefaultRewardSettings();
        } catch (e) {
            console.warn('invite settings load failed:', e);
            inviteSettings = {};
            rewardSettings = getDefaultRewardSettings();
        }
    }

    function getDefaultRewardSettings() {
        return { signupEnabled: true, signupTiers: [{ maxUsers: 1000, amount: 100 }, { maxUsers: 10000, amount: 30 }, { maxUsers: 100000, amount: 10 }], inviteEnabled: true, inviteAmount: 0.5, inviteMaxPerUser: 100 };
    }

    async function ensureReferralCode() {
        if (!currentUser) return;
        try {
            const res = await fetch('/api/invite/user-code', { headers: _authHeaders() });
            const data = await res.json();
            if (data.code) userReferralCode = data.code;
        } catch (e) { console.error('ensureReferralCode error:', e); }
    }

    function getInviteLink() { return userReferralCode ? INVITE_URL_BASE + userReferralCode : ''; }

    async function copyLink() {
        const link = getInviteLink();
        if (!link) { showToast(t('invite.no_code', 'No invite code available'), 'warning'); return; }
        try { await navigator.clipboard.writeText(link); showToast(t('invite.link_copied', 'Invite link copied!'), 'success'); }
        catch (e) { const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast(t('invite.link_copied', 'Invite link copied!'), 'success'); }
    }

    async function shareSMS() {
        const link = getInviteLink(); if (!link) return;
        const text = t('invite.share_text', 'Join CROWNY! Invite link:') + ' ' + link;
        if (navigator.share) { try { await navigator.share({ title: 'CROWNY', text, url: link }); } catch (e) {} }
        else { window.open('sms:?body=' + encodeURIComponent(text), '_blank'); }
    }

    async function shareKakao() {
        const link = getInviteLink(); if (!link) return;
        const appKey = inviteSettings?.kakaoAppKey;
        if (!appKey) { showToast(t('invite.kakao_no_key', 'Kakao app key is not configured.'), 'warning'); return; }
        try {
            if (!window.Kakao) { showToast(t('invite.kakao_sdk_fail', 'Kakao SDK failed to load'), 'error'); return; }
            if (!Kakao.isInitialized()) Kakao.init(appKey);
            Kakao.Share.sendDefault({ objectType: 'feed', content: { title: t('invite.kakao_title', 'CROWNY'), description: t('invite.kakao_desc', 'All-in-One Platform'), imageUrl: 'https://crowny.org/img/og-image.png', link: { mobileWebUrl: link, webUrl: link } }, buttons: [{ title: t('invite.kakao_btn', 'Sign Up'), link: { mobileWebUrl: link, webUrl: link } }] });
        } catch (e) { console.error('Kakao share error:', e); showToast(t('invite.kakao_fail', 'KakaoTalk share failed'), 'error'); }
    }

    function shareFacebook() {
        const link = getInviteLink(); if (!link) return;
        if (navigator.share) {
            navigator.share({ title: 'CROWNY', text: t('invite.share_text', 'Join CROWNY!'), url: link }).catch(() => {});
        } else {
            // Fallback: copy to clipboard
            navigator.clipboard?.writeText(link);
            showToast(t('invite.link_copied', 'Link copied to clipboard'), 'success');
        }
    }

    async function showInviteModal() {
        if (!currentUser) { showToast(t('common.login_required', 'Login required'), 'warning'); return; }
        if (!userReferralCode) await ensureReferralCode();
        let completedCount = 0, earnedCRTD = 0;
        try { const res = await fetch('/api/invite/stats', { headers: _authHeaders() }); const data = await res.json(); completedCount = data.completedCount || 0; earnedCRTD = data.earnedCRTD || 0; } catch (e) { console.warn(e.message); }
        const link = getInviteLink();
        const modal = document.createElement('div'); modal.id = 'invite-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        modal.innerHTML = `<div style="background:#FFF8F0;border-radius:16px;max-width:420px;width:100%;max-height:85vh;overflow-y:auto;padding:1.5rem;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;"><h3 style="margin:0;"><i data-lucide="gift"></i> ${t('invite.title', 'Invite Friends')}</h3><button onclick="document.getElementById('invite-modal').remove()" style="background:none;border:none;font-size:1.3rem;cursor:pointer;">✕</button></div><div style="background:#f8f8f8;border-radius:10px;padding:1rem;margin-bottom:1rem;text-align:center;"><p style="font-size:0.8rem;color:#6B5744;margin-bottom:0.3rem;">${t('invite.my_code', 'My Invite Code')}</p><p style="font-size:1.4rem;font-weight:800;color:#3D2B1F;letter-spacing:2px;">${userReferralCode || '—'}</p><p style="font-size:0.7rem;color:#6B5744;margin-top:0.3rem;word-break:break-all;">${link}</p></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-bottom:1.2rem;"><button onclick="INVITE.copyLink()" style="padding:0.8rem;border:none;border-radius:10px;background:#3D2B1F;color:#FFF8F0;font-weight:700;cursor:pointer;font-size:0.85rem;"><i data-lucide="copy"></i> ${t('invite.copy_link', 'Copy Link')}</button><button onclick="INVITE.shareSMS()" style="padding:0.8rem;border:none;border-radius:10px;background:#25D366;color:#FFF8F0;font-weight:700;cursor:pointer;font-size:0.85rem;">${t('invite.sms_share', 'SMS/Share')}</button><button onclick="INVITE.shareKakao()" style="padding:0.8rem;border:none;border-radius:10px;background:#FEE500;color:#3C1E1E;font-weight:700;cursor:pointer;font-size:0.85rem;">${t('invite.kakao', 'KakaoTalk')}</button><button onclick="INVITE.shareFacebook()" style="padding:0.8rem;border:none;border-radius:10px;background:#1877F2;color:#FFF8F0;font-weight:700;cursor:pointer;font-size:0.85rem;">${t('invite.facebook', 'Facebook')}</button></div><div style="background:#f0f7ff;border-radius:10px;padding:1rem;"><h4 style="margin:0 0 0.5rem 0;font-size:0.9rem;">${t('invite.stats', 'Invite Stats')}</h4><div style="display:flex;justify-content:space-around;text-align:center;"><div><p style="font-size:1.5rem;font-weight:800;color:#3D2B1F;">${completedCount}</p><p style="font-size:0.75rem;color:#6B5744;">${t('invite.successful', 'Successful Invites')}</p></div><div><p style="font-size:1.5rem;font-weight:800;color:#8B6914;">${earnedCRTD.toFixed(1)}</p><p style="font-size:0.75rem;color:#6B5744;">${t('invite.earned_crtd', 'Earned CRTD')}</p></div></div><p style="font-size:0.7rem;color:#6B5744;margin-top:0.5rem;text-align:center;">${t('invite.reward_info', 'Earn 0.5 CRTD per signup! (max 100)')}</p></div><button onclick="document.getElementById('invite-modal').remove(); showPage('dashboard');" style="width:100%;margin-top:1rem;padding:0.8rem;border:none;border-radius:10px;background:linear-gradient(135deg,#8B6914,#F0C060);color:#3D2B1F;font-weight:700;cursor:pointer;font-size:0.85rem;">⭐ ${t('invite.manage_referral', 'Manage Referral Program')}</button></div>`;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();
    }

    function handleInviteHash() {
        const hash = location.hash; if (!hash) return;
        const match = hash.match(/invite=([A-Z0-9-]+)/i); if (!match) return;
        const code = match[1].toUpperCase();
        if (currentUser) { showToast(t('invite.already_member', 'You are already a member!'), 'info'); history.replaceState(null, '', location.pathname); return; }
        showInviteLanding(code);
    }

    async function showInviteLanding(code) {
        let inviterName = '';
        try { const res = await fetch(`/api/invite/lookup?code=${encodeURIComponent(code)}`); const data = await res.json(); inviterName = data.inviterName || ''; } catch (e) {}
        localStorage.setItem('crowny_invite_code', code);
        const landing = document.createElement('div'); landing.id = 'invite-landing';
        landing.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.9);z-index:10001;display:flex;align-items:center;justify-content:center;padding:1rem;';
        landing.innerHTML = `<div style="background:#FFF8F0;border-radius:16px;max-width:400px;width:100%;padding:2rem;text-align:center;"><h2 style="margin:0 0 0.5rem 0;">${t('invite.landing_title', 'You have been invited to CROWNY!')}</h2>${inviterName ? `<p style="color:#6B5744;margin-bottom:1rem;">${t('invite.invited_by', 'Referred by')}: <strong>${inviterName}</strong></p>` : ''}<p style="font-size:0.85rem;color:#6B5744;margin-bottom:1.5rem;">${t('invite.landing_desc', 'Sign up and earn CRTD rewards!')}</p><button onclick="document.getElementById('invite-landing').remove();document.getElementById('show-signup-form')?.click();" style="width:100%;padding:1rem;background:#3D2B1F;color:#FFF8F0;border:none;border-radius:12px;font-size:1rem;font-weight:700;cursor:pointer;">${t('invite.signup_btn', 'Sign Up')}</button><button onclick="document.getElementById('invite-landing').remove()" style="width:100%;padding:0.7rem;background:transparent;border:none;color:#6B5744;cursor:pointer;margin-top:0.5rem;font-size:0.85rem;">${t('common.close', 'Close')}</button></div>`;
        document.body.appendChild(landing);
    }

    async function processSignupReferral(newUserId, referralCode) {
        if (!referralCode) { referralCode = localStorage.getItem('crowny_invite_code'); localStorage.removeItem('crowny_invite_code'); }
        if (!referralCode) return;
        try { await fetch('/api/invite/process-signup', { method: 'POST', headers: _headers(), body: JSON.stringify({ referralCode: referralCode.toUpperCase() }) }); } catch (e) { console.error('processSignupReferral error:', e); }
    }

    async function grantSignupReward(uid) { /* handled server-side via processSignupReferral */ }

    window.INVITE = { init, copyLink, shareSMS, shareKakao, shareFacebook, showInviteModal, handleInviteHash, processSignupReferral, grantSignupReward, getInviteLink, getSettings: () => rewardSettings, getUserCode: () => userReferralCode };
})();
