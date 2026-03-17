// ===== social.js - 유저데이터, 레퍼럴, 메신저, 소셜피드 (v16.0 - 숏폼+크로스서비스) =====

// Truncate wallet addresses (0x...) in text
function truncateWalletAddresses(text) {
    if (!text) return text;
    return text.replace(/0x[a-fA-F0-9]{30,}/g, (addr) => addr.slice(0, 6) + '...' + addr.slice(-4));
}

// ========== USER PROFILE MANAGEMENT ==========
async function loadUserData() {
    if (!currentUser) return;
    updatePresence(true);
    startPresenceHeartbeat();
    loadMessages();
    loadSocialFeed();
    loadReferralInfo();
    // AI 봇 댓글 자동 답변 감시
    if (typeof AI_SOCIAL !== 'undefined') {
        AI_SOCIAL.init().then(() => AI_SOCIAL.watchBotPostComments()).catch(e => console.warn('[AI-Social] init:', e));
    }
}

// ========== ONLINE PRESENCE ==========
let presenceInterval = null;

async function updatePresence(isOnline) {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).update({
            isOnline: isOnline,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) { console.warn('Presence update failed:', e); }
}

function startPresenceHeartbeat() {
    if (presenceInterval) clearInterval(presenceInterval);
    presenceInterval = setInterval(() => updatePresence(true), 5 * 60 * 1000);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') updatePresence(false);
        else updatePresence(true);
    });
    window.addEventListener('beforeunload', () => updatePresence(false));
}

// Get user display info (nickname + photo)
async function getUserDisplayInfo(uid) {
    try {
        let doc = await db.collection('users').doc(uid).get();
        // 봇 유저면 bot_profiles에서 조회
        if (!doc.exists && uid.startsWith('bot_')) {
            doc = await db.collection('bot_profiles').doc(uid).get();
        }
        if (!doc.exists) return { nickname: t('social.unknown','알 수 없음'), photoURL: '', email: '', isOnline: false, lastSeen: null };
        const data = doc.data();
        return {
            nickname: data.nickname || data.displayName || data.email?.split('@')[0] || t('social.user','사용자'),
            photoURL: data.photoURL || '',
            email: data.email || '',
            statusMessage: data.statusMessage || '',
            isOnline: data.isOnline || false,
            lastSeen: data.lastSeen?.toDate?.() || null
        };
    } catch (e) {
        return { nickname: t('social.unknown','알 수 없음'), photoURL: '', email: '', isOnline: false, lastSeen: null };
    }
}

// Profile avatar HTML helper
function avatarHTML(photoURL, nickname, size = 40) {
    if (photoURL) {
        return `<img src="${photoURL}" style="width:${size}px; height:${size}px; border-radius:50%; object-fit:cover; flex-shrink:0;" alt="${nickname}">`;
    }
    const colors = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F'];
    const color = colors[(nickname || '').charCodeAt(0) % colors.length];
    const initial = (nickname || '?').charAt(0).toUpperCase();
    return `<div style="width:${size}px; height:${size}px; border-radius:50%; background:${color}; display:flex; align-items:center; justify-content:center; font-size:${size*0.45}px; font-weight:700; color:#FFF8F0; flex-shrink:0;">${initial}</div>`;
}

function onlineDotHTML(isOnline) {
    return `<span class="online-dot ${isOnline ? 'online' : 'offline'}"></span>`;
}

// Show profile edit modal
async function showProfileEdit() {
    if (!currentUser) return;
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const data = userDoc.data() || {};

    const overlay = document.createElement('div');
    overlay.id = 'profile-edit-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
    <div style="background:var(--bg-card,#3D2B1F);padding:1.5rem;border-radius:16px;max-width:420px;width:100%;">
        <h3 style="margin-bottom:1rem;"><i data-lucide="pencil" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;"></i>${t('social.edit_profile','✏️ 프로필 편집')}</h3>
        <div style="text-align:center; margin-bottom:1rem;">
            <div id="profile-preview-avatar" style="display:inline-block;">${avatarHTML(data.photoURL, data.nickname, 80)}</div>
            <div style="margin-top:0.5rem;">
                <label for="profile-photo-input" style="color:#3D2B1F; cursor:pointer; font-size:0.85rem; font-weight:600;"><i data-lucide="camera" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('social.change_photo','📷 사진 변경')}</label>
                <input type="file" id="profile-photo-input" accept="image/*" style="display:none;" onchange="previewProfilePhoto(this)">
            </div>
        </div>
        <div style="display:grid; gap:0.8rem;">
            <div>
                <label style="font-size:0.8rem; color:var(--text-muted,#6B5744);">${t('auth.nickname_title','닉네임')}</label>
                <input type="text" id="profile-edit-nickname" value="${data.nickname || ''}" placeholder="${t('auth.nickname_title','닉네임')}" style="width:100%;padding:0.7rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
            </div>
            <div>
                <label style="font-size:0.8rem; color:var(--text-muted,#6B5744);">${t('social.status_msg','상태 메시지')}</label>
                <input type="text" id="profile-edit-status" value="${data.statusMessage || ''}" placeholder="${t('social.status_msg','상태 메시지')}" maxlength="50" style="width:100%;padding:0.7rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
            </div>
            <p style="font-size:0.75rem; color:var(--text-muted,#6B5744);">${t('auth.email','이메일')}: ${data.email}</p>
            <div style="margin-top:0.8rem; padding-top:0.8rem; border-top:1px solid #E8E0D8; display:grid; gap:0.5rem;">
                <p style="font-size:0.8rem; font-weight:600; color:var(--text,#3D2B1F); margin-bottom:0.2rem;"><i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('social.login_method','🔐 로그인 방법')}</p>
                ${currentUser && currentUser.providerData.some(p => p.providerId === 'google.com') ? `
                <p style="font-size:0.75rem; color:#6B8F3C;"><i data-lucide="check-circle" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('social.google_linked','✅ Google 계정 연동됨')}</p>` : `
                <button onclick="linkGoogleAccount(); document.getElementById('profile-edit-modal').remove();" style="width:100%;padding:0.7rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;cursor:pointer;background:var(--bg-card,#3D2B1F);font-size:0.85rem;display:flex;align-items:center;justify-content:center;gap:0.5rem;">
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" style="width:16px;height:16px;"> ${t('social.link_google','Google 계정 연동')}
                </button>`}
                ${currentUser && currentUser.providerData.some(p => p.providerId === 'password') ? `
                <p style="font-size:0.75rem; color:#6B8F3C;"><i data-lucide="check-circle" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('social.pw_login_set','✅ 이메일/비밀번호 로그인 설정됨')}</p>
                <button onclick="changePasswordFromProfile()" style="width:100%;padding:0.7rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;cursor:pointer;background:var(--bg-card,#3D2B1F);font-size:0.85rem;"><i data-lucide="key" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('auth.change_pw','🔑 비밀번호 변경')}</button>` : `
                <button onclick="setupPasswordFromProfile()" style="width:100%;padding:0.7rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;cursor:pointer;background:var(--bg-card,#3D2B1F);font-size:0.85rem;"><i data-lucide="key" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('social.setup_pw','🔑 비밀번호 설정 (이메일 로그인 추가)')}</button>`}
            </div>
        </div>
        <div style="display:flex;gap:0.5rem;margin-top:1rem;">
            <button onclick="document.getElementById('profile-edit-modal').remove()" style="flex:1;padding:0.7rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;cursor:pointer;background:var(--bg-card,#3D2B1F);">${t('common.cancel','취소')}</button>
            <button onclick="saveProfile()" style="flex:1;padding:0.7rem;border:none;border-radius:8px;cursor:pointer;background:var(--gold,#8B6914);color:#3D2B1F;font-weight:700;">${t('common.save','저장')}</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
}

function previewProfilePhoto(input) {
    if (!input.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('profile-preview-avatar').innerHTML = `<img src="${e.target.result}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">`;
    };
    reader.readAsDataURL(input.files[0]);
}

async function saveProfile() {
    const nickname = document.getElementById('profile-edit-nickname').value.trim();
    const statusMessage = document.getElementById('profile-edit-status').value.trim();
    const photoInput = document.getElementById('profile-photo-input');

    if (!nickname) { showToast(t('social.enter_nickname','닉네임을 입력하세요'), 'warning'); return; }

    try {
        showLoading(t('social.saving_profile','프로필 저장 중...'));
        const updates = { nickname, statusMessage };

        if (photoInput.files[0]) {
            const file = photoInput.files[0];
            const storagePath = `profile/${currentUser.uid}/${Date.now()}_${file.name}`;
            updates.photoURL = await resizeAndUploadImage(file, 200, storagePath);
        }

        await db.collection('users').doc(currentUser.uid).update(updates);
        hideLoading();
        showToast(t('social.profile_saved','<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> 프로필 저장 완료!'), 'success');
        document.getElementById('profile-edit-modal')?.remove();

        const userInfoEl = document.getElementById('user-email');
        if (userInfoEl) userInfoEl.textContent = nickname;
    } catch (e) {
        hideLoading();
        showToast(t('social.save_fail','저장 실패: ') + e.message, 'error');
    }
}

// 소개자 보상 안내문구 동적 로드
async function loadReferralRewardDesc() {
    try {
        const doc = await db.collection('admin_config').doc('referral_rewards').get();
        const config = doc.exists ? doc.data() : {};
        const r = config.signupRewards || { crtd: 30, crac: 20, crgc: 30, creb: 20 };
        const parts = [];
        if (r.crtd) parts.push(`${r.crtd} CRTD`);
        if (r.crac) parts.push(`${r.crac} CRAC`);
        if (r.crgc) parts.push(`${r.crgc} CRGC`);
        if (r.creb) parts.push(`${r.creb} CREB`);
        const descEl = document.getElementById('referral-reward-desc');
        if (descEl && parts.length > 0) {
            descEl.textContent = `친구 초대 시 ${parts.join(' + ')} 즉시 지급!`;
        }
    } catch (e) {
        console.warn('소개자 보상 안내 로드 실패:', e);
    }
}

// 소개자 정보 로드
async function loadReferralInfo() {
    if (!currentUser) return;
    loadReferralRewardDesc();
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (!userDoc.exists) return;
        const data = userDoc.data();
        
        const codeEl = document.getElementById('my-referral-code');
        if (codeEl) {
            if (data.referralCode) {
                const nick = data.referralNickname || data.nickname || '';
                codeEl.textContent = nick ? `${nick} (${data.referralCode})` : data.referralCode;
            } else {
                codeEl.textContent = t('social.not_generated','미생성');
            }
        }
        
        const nickEditEl = document.getElementById('referral-nick-edit');
        if (nickEditEl) nickEditEl.style.display = data.referralCode ? 'inline-block' : 'none';
        
        const countEl = document.getElementById('my-referral-count');
        if (countEl) countEl.textContent = `${data.referralCount || 0}명`;
        
        const earnings = data.referralEarnings || {};
        const tokenKeys = ['crny','fnc','crfn','crtd','crac','crgc','creb'];
        for (const tk of tokenKeys) {
            const el = document.getElementById(`referral-earn-${tk}`);
            if (el) el.textContent = earnings[tk] || 0;
        }
        
        const pendingEl = document.getElementById('referral-pending-rewards');
        if (pendingEl) {
            try {
                const pending = await db.collection('users').doc(currentUser.uid)
                    .collection('pendingRewards').where('released', '==', false).get();
                let pendingHTML = '';
                if (!pending.empty) {
                    pending.forEach(doc => {
                        const r = doc.data();
                        const releaseDate = r.releaseDate?.toDate ? r.releaseDate.toDate().toLocaleDateString('ko-KR') : '--';
                        pendingHTML += `<div style="font-size:0.75rem;color:#C4841D;">⏳ ${r.amount} ${(r.token||'').toUpperCase()} → ${releaseDate}</div>`;
                    });
                }
                pendingEl.innerHTML = pendingHTML || '<div style="font-size:0.75rem;color:var(--text-muted,#6B5744);">대기 중인 보상 없음</div>';
            } catch (e) {
                pendingEl.innerHTML = '';
            }
        }

        const userInfoEl = document.getElementById('user-email');
        if (userInfoEl) userInfoEl.textContent = data.nickname || data.email;
    } catch (error) {
        console.error('소개자 정보 로드 실패:', error);
    }
}

async function editReferralNickname() {
    if (!currentUser) return;
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const data = userDoc.data() || {};
    const newNick = await showPromptModal(
        t('social.edit_referral_nick', '소개 닉네임 변경'),
        t('social.enter_referral_nick', '표시될 소개 닉네임을 입력하세요:'),
        data.referralNickname || data.nickname || ''
    );
    if (!newNick || !newNick.trim()) return;
    try {
        await db.collection('users').doc(currentUser.uid).update({ referralNickname: newNick.trim() });
        showToast(t('social.nick_changed', '<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> 소개 닉네임 변경 완료'), 'success');
        loadReferralInfo();
    } catch (e) {
        showToast(t('social.nick_change_fail', '변경 실패: ') + e.message, 'error');
    }
}

async function copyReferralCode() {
    const codeEl = document.getElementById('my-referral-code');
    const code = codeEl?.textContent;
    if (!code || code === t('social.not_generated','미생성')) { showToast(t('social.generate_first','먼저 소개 코드를 생성하세요'), 'warning'); return; }
    try {
        await navigator.clipboard.writeText(code);
        showToast(`<i data-lucide="clipboard" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> ${t('social.code_copied','소개 코드 복사됨')}: ${code}`, 'success');
    } catch (e) {
        await showPromptModal(t('auth.referral_title','소개 코드'), t('social.copy_code','소개 코드를 복사하세요'), code);
    }
}

// ========== MESSENGER ==========
let currentChat = null;
let currentChatOtherId = null;
let chatUnsubscribe = null;
let chatDocUnsubscribe = null;
let typingTimeout = null;
let cachedChatDocs = [];
let msgLongPressTimer = null;
let currentChannel = null;
let channelMsgUnsubscribe = null;

function showChats() {
    document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    else document.querySelector('.sidebar-tabs .tab-btn')?.classList.add('active');
    document.getElementById('chats-view').style.display = 'block';
    document.getElementById('contacts-view').style.display = 'none';
    const channelsView = document.getElementById('channels-view');
    if (channelsView) channelsView.style.display = 'none';
    if (window.lucide) lucide.createIcons();
}

function showContacts() {
    document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    else document.querySelectorAll('.sidebar-tabs .tab-btn')[1]?.classList.add('active');
    document.getElementById('chats-view').style.display = 'none';
    document.getElementById('contacts-view').style.display = 'block';
    const channelsView = document.getElementById('channels-view');
    if (channelsView) channelsView.style.display = 'none';
    loadContacts();
    if (window.lucide) lucide.createIcons();
}

// ===== Contact Add Modal (email + nickname search) =====
async function showAddContactModal() {
    const overlay = document.createElement('div');
    overlay.id = 'add-contact-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
    <div style="background:var(--bg-card,#3D2B1F);padding:1.5rem;border-radius:16px;max-width:420px;width:100%;">
        <h3 style="margin-bottom:1rem;"><i data-lucide="plus" style="width:18px;height:18px;display:inline-block;vertical-align:middle;margin-right:6px;"></i>${t('social.add_contact','연락처 추가')}</h3>
        <div style="display:flex;gap:0.5rem;margin-bottom:0.8rem;">
            <input type="text" id="contact-search-input" placeholder="${t('social.search_email_nick','이메일 또는 닉네임 검색')}" style="flex:1;padding:0.7rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;font-size:0.9rem;">
            <button onclick="searchContactUsers()" style="padding:0.7rem 1rem;border:none;border-radius:8px;background:var(--gold,#8B6914);color:#3D2B1F;font-weight:600;cursor:pointer;">${t('social.search','검색')}</button>
        </div>
        <div id="contact-search-results" style="max-height:300px;overflow-y:auto;"></div>
        <div style="margin-top:1rem;text-align:right;">
            <button onclick="document.getElementById('add-contact-modal').remove()" style="padding:0.5rem 1rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;cursor:pointer;background:var(--bg-card,#3D2B1F);">${t('common.cancel','취소')}</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    document.getElementById('contact-search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchContactUsers();
    });
    document.getElementById('contact-search-input').focus();
}

async function searchContactUsers() {
    const query = document.getElementById('contact-search-input').value.trim();
    const resultsDiv = document.getElementById('contact-search-results');
    if (!query) { resultsDiv.innerHTML = `<p style="text-align:center;color:var(--text-muted,#6B5744);font-size:0.85rem;">${t('social.enter_search','검색어를 입력하세요')}</p>`; return; }

    resultsDiv.innerHTML = '<p style="text-align:center;color:var(--accent);"><i data-lucide="search"></i> 검색 중...</p>';

    try {
        const results = new Map();

        // Search by email
        const emailSnap = await db.collection('users').where('email', '==', query).get();
        emailSnap.forEach(doc => results.set(doc.id, doc));

        // Search by nickname (prefix match)
        const nickSnap = await db.collection('users')
            .where('nickname', '>=', query)
            .where('nickname', '<=', query + '\uf8ff')
            .limit(10).get();
        nickSnap.forEach(doc => results.set(doc.id, doc));

        resultsDiv.innerHTML = '';
        if (results.size === 0) {
            resultsDiv.innerHTML = `<p style="text-align:center;color:var(--text-muted,#6B5744);font-size:0.85rem;">${t('social.no_results','검색 결과가 없습니다')}</p>`;
            return;
        }

        for (const [uid, doc] of results) {
            if (uid === currentUser.uid) continue;
            const data = doc.data();
            const nick = data.nickname || data.email?.split('@')[0] || '사용자';
            const el = document.createElement('div');
            el.style.cssText = 'display:flex;align-items:center;gap:0.8rem;padding:0.7rem;border-bottom:1px solid var(--border,#E8E0D8);';
            el.innerHTML = `
                ${avatarHTML(data.photoURL, nick, 40)}
                <div style="flex:1;min-width:0;">
                    <strong style="font-size:0.9rem;">${nick}</strong> ${onlineDotHTML(data.isOnline)}
                    <p style="font-size:0.75rem;color:var(--text-muted,#6B5744);margin:0;">${data.email || ''}</p>
                </div>
                <button onclick="addContactFromSearch('${uid}','${(data.email||'').replace(/'/g,"\\'")}','${nick.replace(/'/g,"\\'")}')" style="padding:0.4rem 0.8rem;border:none;border-radius:6px;background:var(--gold,#8B6914);color:#3D2B1F;font-size:0.8rem;cursor:pointer;">추가</button>`;
            resultsDiv.appendChild(el);
        }
        if(window.lucide) lucide.createIcons();
    } catch (e) {
        resultsDiv.innerHTML = `<p style="color:red;text-align:center;">${e.message}</p>`;
    }
}

async function addContactFromSearch(uid, email, name) {
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('contacts').doc(uid).set({ email, name, addedAt: new Date() });
        showToast(t('social.contact_added','<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> 연락처에 추가되었습니다'), 'success');
        document.getElementById('add-contact-modal')?.remove();
        loadContacts();
    } catch (e) {
        showToast(t('social.add_fail','추가 실패: ') + e.message, 'error');
    }
}

async function loadContacts() {
    const contactList = document.getElementById('contact-list');
    contactList.innerHTML = '<p style="padding:1rem; text-align:center; color:var(--accent);"><i data-lucide="clipboard"></i> 로딩 중...</p>';
    const contacts = await db.collection('users').doc(currentUser.uid).collection('contacts').get();
    contactList.innerHTML = '';

    if (contacts.empty) {
        contactList.innerHTML = `
            <div style="text-align:center; padding:2rem; color:var(--accent);">
                <div style="font-size:2.5rem; margin-bottom:0.8rem;"><i data-lucide="users" style="width:40px;height:40px;display:block;"></i></div>
                <p style="font-size:0.95rem; margin-bottom:0.5rem;">${t('social.no_contacts','연락처가 없습니다')}</p>
                <button onclick="showAddContactModal()" class="btn-primary" style="padding:0.5rem 1rem; font-size:0.85rem;"><i data-lucide="plus" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('social.add_contact_btn','연락처 추가')}</button>
            </div>`;
        return;
    }

    for (const doc of contacts.docs) {
        const contact = doc.data();
        const info = await getUserDisplayInfo(doc.id);
        const contactItem = document.createElement('div');
        contactItem.className = 'contact-item';
        contactItem.innerHTML = `
            <div style="position:relative;">
                ${avatarHTML(info.photoURL, info.nickname, 44)}
                <span class="online-dot ${info.isOnline ? 'online' : 'offline'}" style="position:absolute;bottom:0;right:0;"></span>
            </div>
            <div class="contact-info" style="flex:1;min-width:0;overflow:hidden;">
                <strong style="font-size:0.95rem;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${info.nickname}</strong>
                <p style="font-size:0.8rem; margin:0.1rem 0; color:var(--accent); opacity:0.7; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${info.statusMessage || (info.lastSeen ? getTimeAgo(info.lastSeen) : '')}</p>
            </div>
            <div style="display:flex; gap:0.3rem; align-items:center;">
                <button onclick='startChatWithContact("${contact.email}")' style="padding:0.35rem 0.7rem; border-radius:20px; font-size:0.8rem; background:#3D2B1F; color:#FFF8F0; border:none; cursor:pointer; display:flex; align-items:center; gap:3px;"><i data-lucide="message-circle" style="width:12px;height:12px;"></i> ${t('social.chat','채팅')}</button>
                <button onclick='showContactMenu("${doc.id}", "${info.nickname}")' style="padding:0.35rem; border-radius:50%; background:none; border:1px solid #E8E0D8; cursor:pointer; display:flex; align-items:center; justify-content:center;"><i data-lucide="more-vertical" style="width:14px;height:14px;color:#6B5744;"></i></button>
            </div>`;
        contactList.appendChild(contactItem);
    }
    if(window.lucide) lucide.createIcons();
}

async function startChatWithContact(email) {
    try {
        await startNewChat(email);
        document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.sidebar-tabs .tab-btn')[0].classList.add('active');
        document.getElementById('chats-view').style.display = 'block';
        document.getElementById('contacts-view').style.display = 'none';
        showPage('messenger');
    } catch (error) {
        console.error('Chat start error:', error);
        showToast(t('social.chat_fail','채팅 시작 실패'), 'error');
    }
}

async function showNewChatModal() {
    const email = await showPromptModal(t('social.new_chat','새 채팅'), t('social.chat_email','채팅할 사용자 이메일'), '');
    if (!email) return;
    startNewChat(email);
}

async function startNewChat(otherEmail) {
    try {
        if (otherEmail === currentUser.email) { showToast(t('social.no_self_chat','자기 자신과는 채팅할 수 없습니다'), 'warning'); return; }
        const users = await db.collection('users').where('email', '==', otherEmail).get();
        if (users.empty) { showToast(t('social.user_not_found','사용자를 찾을 수 없습니다'), 'error'); return; }
        const otherUser = users.docs[0];
        const otherId = otherUser.id;
        const existingChat = await db.collection('chats').where('participants', 'array-contains', currentUser.uid).get();
        let chatId = null;
        for (const doc of existingChat.docs) {
            if (doc.data().participants.includes(otherId)) { chatId = doc.id; break; }
        }
        if (!chatId) {
            const newChat = await db.collection('chats').add({
                participants: [currentUser.uid, otherId],
                lastMessage: '', lastMessageTime: new Date(), createdAt: new Date(),
                unreadCount: {}, typing: {}
            });
            chatId = newChat.id;
        }
        await loadMessages();
        await openChat(chatId, otherId);
    } catch (error) {
        console.error('Start chat error:', error);
        showToast(t('social.chat_fail','채팅 시작 실패') + ': ' + error.message, 'error');
    }
}

// ===== Chat list search (filter) =====
function filterChatList(query) {
    const items = document.querySelectorAll('#chat-list .chat-item');
    const q = query.toLowerCase();
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(q) ? '' : 'none';
    });
}

// ===== Format message time =====
function formatMsgTime(date) {
    if (!date) return '';
    const h = date.getHours();
    const m = date.getMinutes().toString().padStart(2, '0');
    const ampm = h < 12 ? '오전' : '오후';
    const h12 = h % 12 || 12;
    return `${ampm} ${h12}:${m}`;
}

function formatDateLabel(date) {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const days = ['일','월','화','수','목','금','토'];
    return `${y}년 ${m}월 ${d}일 ${days[date.getDay()]}요일`;
}

// ===== Load chat list =====
async function loadMessages() {
    if (!currentUser) { console.log('[loadMessages] no currentUser'); return; }
    const chatList = document.getElementById('chat-list');
    if (!chatList) return;
    chatList.innerHTML = '';
    let chats;
    try {
        chats = await db.collection('chats').where('participants', 'array-contains', currentUser.uid).get();
    } catch (e) {
        console.error('[loadMessages] Firestore error:', e);
        chatList.innerHTML = `<p style="padding:1rem;color:#e53935;text-align:center;">채팅 로드 실패: ${e.message}</p>`;
        return;
    }
    if (chats.empty) { chatList.innerHTML = `<p style="padding:1rem; color:var(--accent); text-align:center;">${t('social.start_chat','채팅을 시작하세요')}</p>`; return; }

    cachedChatDocs = chats.docs.sort((a, b) => {
        const aTime = a.data().lastMessageTime?.toMillis?.() || 0;
        const bTime = b.data().lastMessageTime?.toMillis?.() || 0;
        return bTime - aTime;
    });

    for (const doc of cachedChatDocs) {
        const chat = doc.data();
        const otherId = chat.participants.find(id => id !== currentUser.uid) || '';
        if (!otherId) continue; // 셀프 채팅 스킵
        const info = await getUserDisplayInfo(otherId);
        const unread = (chat.unreadCount && chat.unreadCount[currentUser.uid]) || 0;
        const lastTime = chat.lastMessageTime?.toDate?.();

        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.chatId = doc.id;
        chatItem.onclick = () => openChat(doc.id, otherId);
        const secIndicators = [];
        if (chat.secret) secIndicators.push('<i data-lucide="lock" style="width:10px;height:10px;display:inline-block;vertical-align:middle;"></i>');
        else if (chat.e2eEnabled === true) secIndicators.push('<i data-lucide="lock" style="width:10px;height:10px;display:inline-block;vertical-align:middle;"></i>');
        if (chat.autoDeleteAfter > 0) secIndicators.push('<i data-lucide="hourglass" style="width:10px;height:10px;display:inline-block;vertical-align:middle;"></i>');

        chatItem.innerHTML = `
            <div style="position:relative;">
                ${avatarHTML(info.photoURL, info.nickname, 44)}
                <span class="online-dot ${info.isOnline ? 'online' : 'offline'}" style="position:absolute;bottom:0;right:0;"></span>
            </div>
            <div class="chat-preview" style="flex:1;min-width:0;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <strong>${chat.secret ? '🔒 ' : ''}${info.nickname}${secIndicators.length ? ' <span style="font-size:0.7rem;opacity:0.5;">' + secIndicators.join('') + '</span>' : ''}</strong>
                    ${lastTime ? `<span class="chat-time">${getTimeAgo(lastTime)}</span>` : ''}
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <p style="flex:1;min-width:0;">${chat.lastMessage || t('social.no_messages','메시지 없음')}</p>
                    ${unread > 0 ? `<span class="unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
                </div>
            </div>`;
        chatList.appendChild(chatItem);
    }
}

// ===== Open chat =====
async function openChat(chatId, otherId) {
    if (chatUnsubscribe) chatUnsubscribe();
    if (chatDocUnsubscribe) chatDocUnsubscribe();
    if (channelMsgUnsubscribe) { channelMsgUnsubscribe(); channelMsgUnsubscribe = null; }
    currentChannel = null;
    currentChat = chatId;
    currentChatOtherId = otherId;
    const msgInput = document.getElementById('message-input');
    if (msgInput) delete msgInput.dataset.channelMode;

    // Mobile: show chat window
    const container = document.getElementById('messenger-container');
    if (container) container.classList.add('chat-open');
    const messengerPage = document.getElementById('messenger');
    if (messengerPage) messengerPage.classList.add('chat-active');
    
    // Hide bottom tab bar and hamburger on mobile when chat is active
    const bottomTab = document.querySelector('.bottom-tab-bar');
    if (bottomTab) bottomTab.style.display = 'none';
    const menuToggle = document.querySelector('.menu-toggle');
    if (menuToggle) menuToggle.style.display = 'none';

    const info = await getUserDisplayInfo(otherId);
    document.getElementById('chat-username').innerHTML = `
        <div style="display:flex;align-items:center;gap:0.5rem;">
            ${avatarHTML(info.photoURL, info.nickname, 32)}
            <div>
                <strong>${info.nickname}</strong> ${onlineDotHTML(info.isOnline)}
                ${info.statusMessage ? `<div style="font-size:0.7rem;color:var(--accent);">${info.statusMessage}</div>` : ''}
            </div>
        </div>`;
    document.getElementById('chat-header-actions').style.display = 'flex';
    document.getElementById('chat-input-area').style.display = 'flex';

    // Mark my unread as 0
    try {
        await db.collection('chats').doc(chatId).update({
            [`unreadCount.${currentUser.uid}`]: 0
        });
    } catch (e) { /* ignore */ }

    // Update chat list badge
    const chatItemEl = document.querySelector(`.chat-item[data-chat-id="${chatId}"] .unread-badge`);
    if (chatItemEl) chatItemEl.remove();

    // Listen for typing indicator + pinned message from chat doc
    chatDocUnsubscribe = db.collection('chats').doc(chatId).onSnapshot((snap) => {
        const data = snap.data();
        if (!data) return;
        const typing = data.typing || {};
        const otherTyping = typing[otherId];
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.style.display = otherTyping ? 'flex' : 'none';
        // Pinned message
        const pinnedBanner = document.getElementById('pinned-message-banner');
        if (data.pinnedMessage && pinnedBanner) {
            pinnedBanner.style.display = 'flex';
            document.getElementById('pinned-message-text').textContent = data.pinnedMessage.text || '고정된 메시지';
        } else if (pinnedBanner) {
            pinnedBanner.style.display = 'none';
        }
    });

    // Get chat settings for E2E / secret / auto-delete indicators
    let _chatSettings = {};
    let _screenshotCleanup = null;
    try {
        const chatDocData = await db.collection('chats').doc(chatId).get();
        _chatSettings = chatDocData.data() || {};
    } catch (e) {}

    // Secret chat screenshot detection
    if (_chatSettings.secret && typeof E2ECrypto !== 'undefined') {
        _screenshotCleanup = E2ECrypto.setupScreenshotDetection(chatId, otherId);
    }

    // Update header with security indicators
    const secIcons = [];
    if (_chatSettings.e2eEnabled === true) secIcons.push('<i data-lucide="lock" style="width:12px;height:12px;display:inline-block;vertical-align:middle;"></i>');
    if (_chatSettings.autoDeleteAfter > 0) secIcons.push('<i data-lucide="hourglass" style="width:12px;height:12px;display:inline-block;vertical-align:middle;"></i>');
    if (_chatSettings.secret) secIcons.push('🤫');
    if (secIcons.length > 0) {
        const headerEl = document.getElementById('chat-username');
        const secBadge = document.createElement('span');
        secBadge.style.cssText = 'font-size:0.7rem;margin-left:0.3rem;opacity:0.7;';
        secBadge.innerHTML = secIcons.join(' ');
        headerEl.querySelector('strong')?.appendChild(secBadge);
    }

    // Listen for messages
    let _isMarkingRead = false;
    chatUnsubscribe = db.collection('chats').doc(chatId)
        .collection('messages').orderBy('timestamp')
        .onSnapshot(async (snapshot) => {
            // readBy 업데이트로 인한 재실행 방지
            if (_isMarkingRead) return;
            
            const messagesDiv = document.getElementById('chat-messages');
            messagesDiv.innerHTML = '';
            if (snapshot.empty) {
                messagesDiv.innerHTML = `<p style="text-align:center; color:var(--accent); padding:2rem;">${t('social.send_first','메시지를 보내보세요!')}</p>`;
            }
            const senderCache = {};
            let lastDateStr = '';

            // Mark unread messages as read (비동기, 리렌더링 방지)
            const unreadDocs = [];
            for (const doc of snapshot.docs) {
                const msg = doc.data();
                if (msg.senderId !== currentUser.uid && !(msg.readBy || []).includes(currentUser.uid)) {
                    unreadDocs.push(doc.ref);
                }
            }
            if (unreadDocs.length > 0) {
                _isMarkingRead = true;
                const batch = db.batch();
                for (const ref of unreadDocs) {
                    batch.update(ref, { readBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
                }
                batch.commit().catch(() => {}).finally(() => { setTimeout(() => { _isMarkingRead = false; }, 1000); });
            }

            for (const doc of snapshot.docs) {
                const msg = doc.data();
                const msgId = doc.id;

                // Skip expired messages
                if (typeof E2ECrypto !== 'undefined' && E2ECrypto.isMessageExpired(msg)) continue;

                // Decrypt E2E message
                if (msg.encrypted && typeof E2ECrypto !== 'undefined') {
                    try {
                        msg._decryptedText = await E2ECrypto.decryptMessage(msg, currentUser.uid);
                    } catch (e) {
                        msg._decryptedText = '<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 암호화된 메시지 (복호화 불가)';
                    }
                }

                const isMine = msg.senderId === currentUser.uid;
                const timestamp = msg.timestamp?.toDate?.() || new Date();

                // Date separator
                const dateStr = formatDateLabel(timestamp);
                if (dateStr !== lastDateStr) {
                    lastDateStr = dateStr;
                    const sep = document.createElement('div');
                    sep.className = 'date-separator';
                    sep.innerHTML = `<span>${dateStr}</span>`;
                    messagesDiv.appendChild(sep);
                }

                if (!senderCache[msg.senderId]) senderCache[msg.senderId] = await getUserDisplayInfo(msg.senderId);
                const senderInfo = senderCache[msg.senderId];

                const msgEl = document.createElement('div');
                msgEl.style.cssText = `display:flex;gap:0.5rem;margin-bottom:0.5rem;${isMine ? 'flex-direction:row-reverse;' : ''}`;
                msgEl.dataset.msgId = msgId;

                // Build content
                let content = '';
                if (msg.deleted) {
                    content = `<span class="msg-deleted"><i data-lucide="ban" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('social.msg_deleted','이 메시지는 삭제되었습니다')}</span>`;
                } else {
                    // Reply quote
                    if (msg.replyTo) {
                        content += `<div class="msg-reply-quote" style="border-left:3px solid #3D2B1F;padding:0.2rem 0.5rem;margin-bottom:0.3rem;background:rgba(0,102,204,0.05);border-radius:0 6px 6px 0;font-size:0.75rem;color:var(--text-muted,#6B5744);cursor:pointer;" onclick="document.querySelector('[data-msg-id=\\'${msg.replyTo.messageId}\\']')?.scrollIntoView({behavior:'smooth',block:'center'})">
                            <div style="font-weight:600;color:#3D2B1F;font-size:0.7rem;">답장</div>
                            ${(msg.replyTo.text || '미디어').substring(0, 60)}</div>`;
                    }
                    // Forwarded label
                    if (msg.forwarded) {
                        content += `<div style="font-size:0.7rem;color:var(--text-muted,#6B5744);margin-bottom:0.2rem;font-style:italic;"><i data-lucide="arrow-up-right" style="width:10px;height:10px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> 전달된 메시지</div>`;
                    }
                    // Media types
                    const msgType = msg.type || 'text';
                    if (msgType === 'image' || msg.imageUrl) {
                        const imgUrl = msg.mediaUrl || msg.imageUrl;
                        content += `<img src="${imgUrl}" style="max-width:200px;border-radius:8px;cursor:pointer;display:block;margin-bottom:0.3rem;" onclick="window.open('${imgUrl}','_blank')">`;
                    }
                    if (msgType === 'video') {
                        content += `<video src="${msg.mediaUrl}" controls style="max-width:240px;border-radius:8px;display:block;margin-bottom:0.3rem;" preload="metadata"></video>`;
                    }
                    if (msgType === 'file') {
                        const sizeStr = msg.fileSize ? ` (${(msg.fileSize/1024).toFixed(0)} KB)` : '';
                        content += `<a href="${msg.mediaUrl}" target="_blank" download="${msg.fileName||'file'}" style="display:flex;align-items:center;gap:0.4rem;padding:0.4rem 0.6rem;background:rgba(0,0,0,0.05);border-radius:8px;text-decoration:none;color:inherit;margin-bottom:0.3rem;">
                            <span style="font-size:1.2rem;">📄</span><div><div style="font-size:0.8rem;font-weight:600;">${msg.fileName||'파일'}</div><div style="font-size:0.7rem;color:var(--text-muted,#6B5744);">${sizeStr}</div></div></a>`;
                    }
                    if (msgType === 'voice') {
                        content += `<div class="voice-msg-player" style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem;">
                            <button onclick="toggleVoicePlay(this,'${msg.mediaUrl}')" style="background:none;border:none;cursor:pointer;font-size:1.2rem;">▶️</button>
                            <div style="flex:1;height:4px;background:#E8E0D8;border-radius:2px;"><div class="voice-progress" style="width:0%;height:100%;background:#3D2B1F;border-radius:2px;transition:width 0.1s;"></div></div>
                            <span style="font-size:0.7rem;color:var(--text-muted,#6B5744);">${msg.duration ? msg.duration + 's' : ''}</span>
                        </div>`;
                    }
                    if (msgType === 'sticker') {
                        content += `<span style="font-size:3rem;line-height:1;">${msg.text}</span>`;
                    } else if (msgType === 'gif') {
                        content += `<img src="${msg.mediaUrl}" style="max-width:200px;border-radius:8px;display:block;margin-bottom:0.3rem;" loading="lazy">`;
                    } else if (msgType === 'share_card' && msg.shareCard) {
                        const sc = msg.shareCard;
                        const pageMap = { product: 'mall', artist: 'artist', campaign: 'fundraise', art: 'art' };
                        content += `<div onclick="showPage('${pageMap[sc.itemType]||sc.itemType}')" style="border:1px solid var(--border,#E8E0D8);border-radius:10px;overflow:hidden;cursor:pointer;margin-bottom:0.3rem;max-width:220px;">
                            ${sc.imageUrl ? `<img src="${sc.imageUrl}" style="width:100%;height:100px;object-fit:cover;">` : ''}
                            <div style="padding:0.4rem 0.6rem;"><div style="font-size:0.8rem;font-weight:600;">${sc.name}</div>${sc.price ? `<div style="font-size:0.75rem;color:#C4841D;">${sc.price}</div>` : ''}<div style="font-size:0.7rem;color:#3D2B1F;margin-top:0.2rem;"><i data-lucide="shopping-cart" style="width:10px;height:10px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> 보기</div></div></div>`;
                    } else if (msgType === 'transfer') {
                        content += `<div style="background:linear-gradient(135deg,#8B6914,#F0C060);color:#FFF8F0;padding:0.5rem 0.8rem;border-radius:8px;margin-bottom:0.3rem;font-weight:600;"><i data-lucide="dollar-sign" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${msg.tokenAmount} ${msg.tokenType}</div>`;
                    }
                    if (msg.tokenAmount && msg.type !== 'transfer') {
                        content += `<div style="background:linear-gradient(135deg,#8B6914,#F0C060);color:#FFF8F0;padding:0.5rem 0.8rem;border-radius:8px;margin-bottom:0.3rem;font-weight:600;"><i data-lucide="dollar-sign" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${msg.tokenAmount} ${msg.tokenType}</div>`;
                    }
                    // Text (skip for sticker/gif)
                    const displayText = msg._decryptedText || msg.text;
                    if (displayText && msgType !== 'sticker' && msgType !== 'gif') {
                        // Signature warning
                        let sigWarning = '';
                        if (msg._decryptedText && msg._decryptedText.endsWith('⚠️ 서명 검증 실패')) {
                            sigWarning = '<div style="font-size:0.7rem;color:#C4841D;margin-top:0.2rem;">⚠️ 서명 검증 실패</div>';
                        }
                        // Link preview
                        if (typeof parseLinkPreviews === 'function') {
                            const parsed = parseLinkPreviews(displayText);
                            content += `<span>${parsed.html}</span>${sigWarning}`;
                            if (parsed.previews) content += parsed.previews;
                        } else {
                            content += `<span>${displayText}</span>${sigWarning}`;
                        }
                    }
                }

                // Read receipt for my messages
                let readReceipt = '';
                if (isMine && !msg.deleted) {
                    const readBy = msg.readBy || [];
                    const isRead = readBy.includes(otherId);
                    readReceipt = `<span class="msg-read-receipt ${isRead ? 'read' : 'sent'}">${isRead ? '✓✓' : '✓'}</span>`;
                }

                // Reactions display
                let reactionsHTML = '';
                if (msg.reactions && !msg.deleted) {
                    const entries = Object.entries(msg.reactions);
                    if (entries.length > 0) {
                        reactionsHTML = '<div class="msg-reactions">';
                        for (const [emoji, uids] of entries) {
                            if (!uids || uids.length === 0) continue;
                            const isMineReaction = uids.includes(currentUser.uid);
                            reactionsHTML += `<span class="msg-reaction-chip ${isMineReaction ? 'mine' : ''}" onclick="toggleReaction('${msgId}','${emoji}')">${emoji} ${uids.length > 1 ? uids.length : ''}</span>`;
                        }
                        reactionsHTML += '</div>';
                    }
                }

                // Auto-delete remaining time
                let expiryHTML = '';
                if (msg.expiresAt && typeof E2ECrypto !== 'undefined') {
                    const remaining = E2ECrypto.getRemainingTime(msg);
                    if (remaining) expiryHTML = `<span style="font-size:0.65rem;color:#C4841D;margin-left:0.3rem;"><i data-lucide="hourglass" style="width:10px;height:10px;display:inline-block;vertical-align:middle;margin-right:2px;"></i>${remaining}</span>`;
                }

                // Action buttons (reaction + reply + forward + pin + delete)
                let actionsHTML = '';
                if (!msg.deleted) {
                    const side = isMine ? 'left' : 'right';
                    const sName = senderInfo.nickname.replace(/'/g, "\\'");
                    const mText = (msg._decryptedText || msg.text || '').replace(/'/g, "\\'").substring(0, 80);
                    actionsHTML = `<div class="msg-actions-bar ${side}" id="actions-${msgId}">`;
                    actionsHTML += `<button class="msg-action-btn" onclick="showReactionPicker('${msgId}')"><i data-lucide="smile" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>`;
                    actionsHTML += `<button class="msg-action-btn" onclick="setReplyTo('${msgId}','${mText}','${msg.senderId}','${sName}')"><i data-lucide="reply-all" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>`;
                    if (!_chatSettings.noForward && !_chatSettings.secret) {
                        actionsHTML += `<button class="msg-action-btn" onclick="forwardMessage('${msgId}')"><i data-lucide="arrow-up-right" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>`;
                    }
                    actionsHTML += `<button class="msg-action-btn" onclick="pinMessage('${msgId}','${mText}')"><i data-lucide="pin" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>`;
                    if (isMine) actionsHTML += `<button class="msg-action-btn" onclick="deleteMessage('${msgId}')"><i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>`;
                    actionsHTML += '</div>';
                }

                msgEl.innerHTML = `
                    ${!isMine ? avatarHTML(senderInfo.photoURL, senderInfo.nickname, 28) : ''}
                    <div style="max-width:80%;" class="msg-actions-wrapper"
                        ontouchstart="msgTouchStart('${msgId}')" ontouchend="msgTouchEnd()" ontouchmove="msgTouchEnd()">
                        ${!isMine ? `<div style="font-size:0.7rem;color:var(--accent);margin-bottom:0.15rem;">${senderInfo.nickname}</div>` : ''}
                        ${actionsHTML}
                        <div style="background:${isMine ? '#3D2B1F' : '#F7F3ED'};color:${isMine ? '#FFF8F0' : '#3D2B1F'};padding:0.6rem 0.8rem;border-radius:${isMine ? '12px 12px 0 12px' : '12px 12px 12px 0'};word-break:break-word;font-size:0.9rem;line-height:1.4;">${content}</div>
                        ${reactionsHTML}
                        <div class="msg-time" style="${isMine ? 'justify-content:flex-end;' : ''}">${msg.encrypted ? '<i data-lucide="lock" style="width:10px;height:10px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>' : ''}${formatMsgTime(timestamp)}${expiryHTML}${readReceipt}</div>
                    </div>`;
                messagesDiv.appendChild(msgEl);
            }
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });

    // Setup textarea typing events
    setupTypingListener();
}

// ===== Mobile: close chat, back to list =====
function closeChatMobile() {
    const container = document.getElementById('messenger-container');
    if (container) container.classList.remove('chat-open');
    const messengerPage = document.getElementById('messenger');
    if (messengerPage) messengerPage.classList.remove('chat-active');
    
    // Restore bottom tab bar and hamburger visibility when closing chat
    const bottomTab = document.querySelector('.bottom-tab-bar');
    if (bottomTab) bottomTab.style.display = '';
    const menuToggle = document.querySelector('.menu-toggle');
    if (menuToggle) menuToggle.style.display = '';
    
    if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
    if (chatDocUnsubscribe) { chatDocUnsubscribe(); chatDocUnsubscribe = null; }
    currentChat = null;
    currentChatOtherId = null;
}

// ===== Typing indicator =====
function setupTypingListener() {
    const input = document.getElementById('message-input');
    if (!input) return;
    input.removeEventListener('input', handleTypingInput);
    input.addEventListener('input', handleTypingInput);
}

function handleTypingInput() {
    if (!currentChat || !currentUser) return;
    setTyping(true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => setTyping(false), 3000);
}

function setTyping(val) {
    if (!currentChat) return;
    db.collection('chats').doc(currentChat).update({
        [`typing.${currentUser.uid}`]: val
    }).catch(() => {});
}

// ===== Message input: Enter to send, Shift+Enter for newline =====
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('keydown', (e) => {
        const input = document.getElementById('message-input');
        if (!input || e.target !== input) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
});

// Auto-resize textarea
document.addEventListener('input', (e) => {
    if (e.target.id === 'message-input' && e.target.tagName === 'TEXTAREA') {
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    }
});

// ===== Reply state =====
let replyToMessage = null; // { messageId, text, senderId, senderName }

function setReplyTo(msgId, text, senderId, senderName) {
    replyToMessage = { messageId: msgId, text: (text || '').substring(0, 100), senderId, senderName };
    document.getElementById('reply-preview-bar').style.display = 'flex';
    document.getElementById('reply-preview-name').textContent = senderName;
    document.getElementById('reply-preview-text').textContent = text || '미디어';
    document.getElementById('message-input').focus();
}

function cancelReply() {
    replyToMessage = null;
    document.getElementById('reply-preview-bar').style.display = 'none';
}

// ===== Send message =====
async function sendMessage() {
    console.log('[sendMessage] called. currentChat:', currentChat, 'currentChannel:', currentChannel, 'currentUser:', currentUser?.uid);
    // Channel mode
    if (currentChannel) {
        const input = document.getElementById('message-input');
        const text = input?.value.trim();
        if (!text) return;
        await db.collection('channels').doc(currentChannel).collection('messages').add({
            senderId: currentUser.uid, text, type: 'text', timestamp: new Date()
        });
        input.value = ''; input.style.height = 'auto';
        return;
    }
    if (!currentChat) { showToast(t('social.select_chat','채팅을 선택하세요'), 'warning'); return; }
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;
    console.log('[sendMessage] sending to chat:', currentChat, 'other:', currentChatOtherId);

    setTyping(false);
    clearTimeout(typingTimeout);

    const msgData = {
        senderId: currentUser.uid, text: text, type: 'text', timestamp: new Date(), readBy: [currentUser.uid]
    };

    // Reply
    if (replyToMessage) {
        msgData.replyTo = { messageId: replyToMessage.messageId, text: replyToMessage.text, senderId: replyToMessage.senderId };
    }

    // Link preview detection for internal links
    const internalMatch = text.match(/#page=(\w+)&id=([\w-]+)/);
    if (internalMatch) {
        msgData.internalLink = { page: internalMatch[1], id: internalMatch[2] };
    }

    // E2E Encryption
    if (typeof E2ECrypto !== 'undefined') {
        try {
            const chatSettings = await E2ECrypto.getChatSettings(currentChat);
            if (chatSettings.e2eEnabled === true) {
                let encrypted = null;
                if (currentChatOtherId) {
                    // 1:1 chat
                    encrypted = await E2ECrypto.encryptMessage(text, currentChatOtherId, currentUser.uid);
                } else if (chatSettings.participants) {
                    // Group chat
                    encrypted = await E2ECrypto.encryptMessageForGroup(text, chatSettings.participants, currentUser.uid);
                }
                if (encrypted) {
                    msgData.encryptedMessage = encrypted.encryptedMessage;
                    msgData.encryptedKeys = encrypted.encryptedKeys;
                    msgData.iv = encrypted.iv;
                    msgData.encrypted = true;
                    msgData.signature = encrypted.signature;
                    msgData.text = '<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>암호화된 메시지';
                }
            }
            // Auto-delete
            if (chatSettings.autoDeleteAfter && chatSettings.autoDeleteAfter > 0) {
                msgData.expiresAt = E2ECrypto.getExpiresAt(chatSettings.autoDeleteAfter);
            }
        } catch (e) { console.warn('[E2E] Encryption failed, sending plaintext:', e); }
    }

    try {
        await db.collection('chats').doc(currentChat).collection('messages').add(msgData);

        // Update chat doc - handle both 1:1 and group
        const updateData = { lastMessage: text, lastMessageTime: new Date() };
        if (currentChatOtherId) {
            updateData[`unreadCount.${currentChatOtherId}`] = firebase.firestore.FieldValue.increment(1);
        }
        await db.collection('chats').doc(currentChat).update(updateData);

        // Notification for recipient (1:1 only)
        if (currentChatOtherId && currentChatOtherId.length > 0) {
            try {
                const myInfo = await getUserDisplayInfo(currentUser.uid);
                await db.collection('users').doc(currentChatOtherId).collection('notifications').add({
                    type: 'messenger', message: `<i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> ${myInfo.nickname}: ${text.substring(0, 50)}`,
                    data: { chatId: currentChat, otherId: currentUser.uid }, read: false, createdAt: new Date()
                });
            } catch (e) { /* best-effort */ }
        }

        cancelReply();
        input.value = '';
        input.style.height = 'auto';
    } catch (e) {
        console.error('[sendMessage] 전송 실패:', e);
        showToast('메시지 전송 실패: ' + e.message, 'error');
    }
}

// ===== Attach menu (📎) =====
function showAttachMenu() {
    document.querySelectorAll('.attach-menu-popup').forEach(el => el.remove());
    const menu = document.createElement('div');
    menu.className = 'attach-menu-popup';
    menu.style.cssText = 'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:var(--bg-card,#3D2B1F);border:1px solid var(--border,#E8E0D8);border-radius:12px;padding:0.5rem;box-shadow:0 4px 20px rgba(0,0,0,0.15);z-index:9999;display:flex;gap:0.3rem;';
    const items = [
        { icon: '<i data-lucide="camera" style="width:20px;height:20px;"></i>', label: '사진', fn: () => sendMediaFile('image') },
        { icon: '<i data-lucide="video" style="width:20px;height:20px;"></i>', label: '영상', fn: () => sendMediaFile('video') },
        { icon: '<i data-lucide="file" style="width:20px;height:20px;"></i>', label: '파일', fn: () => sendMediaFile('file') },
        { icon: '<i data-lucide="mic" style="width:20px;height:20px;"></i>', label: '음성', fn: () => startVoiceRecord(), mobile: true },
        { icon: '<i data-lucide="dollar-sign" style="width:20px;height:20px;"></i>', label: '토큰', fn: () => sendTokenWithMessage(), mobile: true },
        { icon: '<i data-lucide="smile" style="width:20px;height:20px;"></i>', label: '스티커', fn: () => showStickerGifPanel(), mobile: true },
        { icon: '<i data-lucide="smile-plus" style="width:20px;height:20px;"></i>', label: '이모티콘', fn: () => showEmojiInsertPicker(), mobile: true },
    ];
    items.forEach(item => {
        const btn = document.createElement('button');
        btn.innerHTML = `<div style="font-size:1.3rem;">${item.icon}</div><div style="font-size:0.65rem;">${item.label}</div>`;
        btn.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;padding:0.5rem 0.8rem;border:none;background:none;cursor:pointer;border-radius:8px;';
        btn.onmouseenter = () => btn.style.background = '#F7F3ED';
        btn.onmouseleave = () => btn.style.background = 'none';
        btn.onclick = () => { menu.remove(); item.fn(); };
        menu.appendChild(btn);
    });
    document.body.appendChild(menu);
    setTimeout(() => {
        const dismiss = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', dismiss); } };
        document.addEventListener('click', dismiss);
    }, 10);
}

// ===== Send media file =====
async function sendMediaFile(mediaType) {
    if (!currentChat) { showToast(t('social.select_chat','채팅을 선택하세요'), 'warning'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    if (mediaType === 'image') input.accept = 'image/*';
    else if (mediaType === 'video') input.accept = 'video/*';
    // file = any
    input.onchange = async () => {
        if (!input.files[0]) return;
        const file = input.files[0];
        try {
            showLoading(`${mediaType === 'image' ? '<i data-lucide="camera" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>' : mediaType === 'video' ? '<i data-lucide="video" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>' : '<i data-lucide="file" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>'} 전송 중...`);

            if (mediaType === 'image') {
                // Firebase Storage로 업로드 (base64 대신 성능 개선)
                const url = await uploadToStorage(`media/${currentChat}/${Date.now()}_${file.name}`, file);
                await sendMediaMessage({ type: 'image', mediaUrl: url, text: '' }, '<i data-lucide="camera" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> 사진');
            } else if (mediaType === 'video') {
                const url = await uploadToStorage(`media/${currentChat}/${Date.now()}_${file.name}`, file);
                await sendMediaMessage({ type: 'video', mediaUrl: url, text: '', fileName: file.name, fileSize: file.size }, '<i data-lucide="video" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> 영상');
            } else {
                const url = await uploadToStorage(`files/${currentChat}/${Date.now()}_${file.name}`, file);
                await sendMediaMessage({ type: 'file', mediaUrl: url, text: '', fileName: file.name, fileSize: file.size }, `<i data-lucide="file" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> ${file.name}`);
            }
            hideLoading();
        } catch (e) {
            hideLoading();
            showToast('전송 실패: ' + e.message, 'error');
        }
    };
    input.click();
}

async function uploadToStorage(path, file) {
    const ref = firebase.storage().ref().child(path);
    const task = ref.put(file);
    return new Promise((resolve, reject) => {
        task.on('state_changed',
            (snap) => { const p = Math.round((snap.bytesTransferred / snap.totalBytes) * 100); showLoading(`📤 업로드 ${p}%`); },
            reject,
            async () => { resolve(await task.snapshot.ref.getDownloadURL()); }
        );
    });
}

async function sendMediaMessage(msgFields, lastMsgText) {
    const msgData = {
        senderId: currentUser.uid, timestamp: new Date(), readBy: [currentUser.uid], ...msgFields
    };
    if (replyToMessage) {
        msgData.replyTo = { messageId: replyToMessage.messageId, text: replyToMessage.text, senderId: replyToMessage.senderId };
        cancelReply();
    }
    await db.collection('chats').doc(currentChat).collection('messages').add(msgData);
    const updateData = { lastMessage: lastMsgText, lastMessageTime: new Date() };
    if (currentChatOtherId) updateData[`unreadCount.${currentChatOtherId}`] = firebase.firestore.FieldValue.increment(1);
    await db.collection('chats').doc(currentChat).update(updateData);
}

// ===== Voice recording =====
let voiceRecorder = null;
let voiceChunks = [];
let voiceRecordStart = 0;
let voiceRecordInterval = null;
let voiceStream = null;

function startVoiceRecord() {
    if (voiceRecorder) return;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        voiceStream = stream;
        voiceRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        voiceChunks = [];
        voiceRecorder.ondataavailable = (e) => { if (e.data.size > 0) voiceChunks.push(e.data); };
        voiceRecorder.onstop = async () => {
            voiceStream.getTracks().forEach(t => t.stop());
            voiceStream = null;
            if (voiceChunks.length === 0) return;
            const blob = new Blob(voiceChunks, { type: 'audio/webm' });
            const duration = Math.round((Date.now() - voiceRecordStart) / 1000);
            try {
                showLoading('🎤 음성 전송 중...');
                const url = await uploadToStorage(`voice/${currentChat}/${Date.now()}.webm`, blob);
                await sendMediaMessage({ type: 'voice', mediaUrl: url, duration, text: '' }, `🎤 음성 ${duration}초`);
                hideLoading();
            } catch (e) { hideLoading(); showToast('음성 전송 실패', 'error'); }
        };
        voiceRecorder.start();
        voiceRecordStart = Date.now();
        document.getElementById('voice-recording-ui').style.display = 'flex';
        document.getElementById('chat-input-area').style.display = 'none';
        voiceRecordInterval = setInterval(() => {
            const s = Math.floor((Date.now() - voiceRecordStart) / 1000);
            document.getElementById('voice-rec-timer').textContent = `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
        }, 200);
    }).catch(() => showToast('마이크 접근 실패', 'error'));
}

function stopVoiceRecord() {
    if (!voiceRecorder || voiceRecorder.state !== 'recording') return;
    clearInterval(voiceRecordInterval);
    document.getElementById('voice-recording-ui').style.display = 'none';
    document.getElementById('chat-input-area').style.display = 'flex';
    voiceRecorder.stop();
    voiceRecorder = null;
}

function cancelVoiceRecord() {
    if (!voiceRecorder) return;
    clearInterval(voiceRecordInterval);
    voiceChunks = [];
    if (voiceRecorder.state === 'recording') voiceRecorder.stop();
    voiceRecorder = null;
    if (voiceStream) { voiceStream.getTracks().forEach(t => t.stop()); voiceStream = null; }
    document.getElementById('voice-recording-ui').style.display = 'none';
    document.getElementById('chat-input-area').style.display = 'flex';
}

// ===== Forward message =====
async function forwardMessage(msgId) {
    if (!currentChat) return;
    const msgDoc = await db.collection('chats').doc(currentChat).collection('messages').doc(msgId).get();
    if (!msgDoc.exists) return;
    const msg = msgDoc.data();

    // Show chat selection modal
    const chats = await db.collection('chats').where('participants', 'array-contains', currentUser.uid).get();
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    let listHTML = '';
    for (const doc of chats.docs) {
        const c = doc.data();
        if (doc.id === currentChat || c.deleted) continue;
        let name = c.groupName || '';
        if (!name) {
            const otherId = c.participants.find(id => id !== currentUser.uid);
            if (otherId) { const info = await getUserDisplayInfo(otherId); name = info.nickname; }
        }
        if (!name) continue;
        listHTML += `<div style="padding:0.6rem;border-bottom:1px solid var(--border,#E8E0D8);cursor:pointer;" onmouseover="this.style.background='#F7F3ED'" onmouseout="this.style.background=''" onclick="executeForward('${doc.id}',${JSON.stringify(JSON.stringify(msg.text||''))},${JSON.stringify(JSON.stringify(msg.senderId||''))});this.closest('[style*=position]').remove();">${name}</div>`;
    }
    overlay.innerHTML = `<div style="background:var(--bg-card,#3D2B1F);padding:1.5rem;border-radius:16px;max-width:400px;width:100%;max-height:60vh;overflow-y:auto;">
        <h3 style="margin-bottom:1rem;">↗️ 전달할 채팅방 선택</h3>
        ${listHTML || '<p style="color:var(--text-muted,#6B5744);text-align:center;">전달 가능한 채팅방이 없습니다</p>'}
        <button onclick="this.closest('[style*=position]').remove()" style="width:100%;margin-top:1rem;padding:0.5rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;cursor:pointer;background:var(--bg-card,#3D2B1F);">취소</button>
    </div>`;
    document.body.appendChild(overlay);
}

async function executeForward(targetChatId, text, originalSenderId) {
    try {
        await db.collection('chats').doc(targetChatId).collection('messages').add({
            senderId: currentUser.uid, text: text || '', type: 'text',
            forwarded: true, originalSenderId: originalSenderId,
            timestamp: new Date(), readBy: [currentUser.uid]
        });
        await db.collection('chats').doc(targetChatId).update({
            lastMessage: '↗️ 전달된 메시지', lastMessageTime: new Date()
        });
        showToast('✅ 메시지 전달 완료', 'success');
    } catch (e) { showToast('전달 실패', 'error'); }
}

// ===== Pin message =====
async function pinMessage(msgId, text) {
    if (!currentChat) return;
    try {
        await db.collection('chats').doc(currentChat).update({
            pinnedMessage: { messageId: msgId, text: (text || '').substring(0, 100), pinnedAt: new Date() }
        });
        showToast('📌 메시지 고정 완료', 'success');
    } catch (e) { showToast('고정 실패', 'error'); }
}

async function unpinMessage() {
    if (!currentChat) return;
    await db.collection('chats').doc(currentChat).update({ pinnedMessage: null });
    document.getElementById('pinned-message-banner').style.display = 'none';
}

function scrollToPinnedMessage() {
    // find pinned msg element
    const chatDoc = db.collection('chats').doc(currentChat);
    chatDoc.get().then(snap => {
        const pm = snap.data()?.pinnedMessage;
        if (!pm) return;
        const el = document.querySelector(`[data-msg-id="${pm.messageId}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
}

// ===== Sticker / GIF panel =====
function showStickerGifPanel() {
    document.querySelectorAll('.sticker-gif-panel').forEach(el => el.remove());
    const panel = document.createElement('div');
    panel.className = 'sticker-gif-panel';
    panel.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);width:340px;max-width:90vw;background:var(--bg-card,#3D2B1F);border:1px solid var(--border,#E8E0D8);border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.15);z-index:9999;overflow:hidden;';
    panel.innerHTML = `
        <div style="display:flex;border-bottom:1px solid var(--border,#E8E0D8);">
            <button onclick="showStickerTab()" class="sticker-tab-btn active" style="flex:1;padding:0.6rem;border:none;background:var(--bg-card,#3D2B1F);cursor:pointer;font-weight:600;border-bottom:2px solid #3D2B1F;">😊 스티커</button>
            <button onclick="showGifTab()" class="sticker-tab-btn" style="flex:1;padding:0.6rem;border:none;background:var(--bg-card,#3D2B1F);cursor:pointer;font-weight:600;border-bottom:2px solid transparent;">GIF</button>
        </div>
        <div id="sticker-gif-content" style="height:250px;overflow-y:auto;padding:0.5rem;"></div>
    `;
    document.body.appendChild(panel);
    showStickerTab();
    setTimeout(() => {
        const dismiss = (e) => { if (!panel.contains(e.target) && !e.target.closest('.btn-send-token')) { panel.remove(); document.removeEventListener('click', dismiss); } };
        document.addEventListener('click', dismiss);
    }, 10);
}

function showStickerTab() {
    document.querySelectorAll('.sticker-tab-btn').forEach(b => { b.classList.remove('active'); b.style.borderBottomColor = 'transparent'; });
    document.querySelectorAll('.sticker-tab-btn')[0].classList.add('active');
    document.querySelectorAll('.sticker-tab-btn')[0].style.borderBottomColor = '#3D2B1F';
    const stickers = ['😀','😂','🥰','😎','🤔','😱','🥺','👍','❤️','🔥','🎉','💯','🙏','✨','💪','🎵'];
    const content = document.getElementById('sticker-gif-content');
    content.innerHTML = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.5rem;">${stickers.map(s =>
        `<button onclick="sendStickerMessage('${s}')" style="font-size:2.5rem;padding:0.8rem;border:none;background:none;cursor:pointer;border-radius:8px;transition:background 0.15s;" onmouseenter="this.style.background='#F7F3ED'" onmouseleave="this.style.background='none'">${s}</button>`
    ).join('')}</div>`;
}

function showGifTab() {
    document.querySelectorAll('.sticker-tab-btn').forEach(b => { b.classList.remove('active'); b.style.borderBottomColor = 'transparent'; });
    document.querySelectorAll('.sticker-tab-btn')[1].classList.add('active');
    document.querySelectorAll('.sticker-tab-btn')[1].style.borderBottomColor = '#3D2B1F';
    const content = document.getElementById('sticker-gif-content');
    content.innerHTML = `
        <div style="display:flex;gap:0.3rem;margin-bottom:0.5rem;">
            <input type="text" id="gif-search-input" placeholder="GIF 검색..." style="flex:1;padding:0.5rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;font-size:0.85rem;" onkeypress="if(event.key==='Enter')searchGifs()">
            <button onclick="searchGifs()" style="padding:0.5rem 0.8rem;border:none;border-radius:8px;background:#3D2B1F;color:#FFF8F0;cursor:pointer;">검색</button>
        </div>
        <div id="gif-results" style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.3rem;"></div>
    `;
    loadTrendingGifs();
}

async function loadTrendingGifs() {
    try {
        const res = await fetch('https://api.giphy.com/v1/gifs/trending?api_key=dc6zaTOxFJmzC&limit=20&rating=g');
        const data = await res.json();
        renderGifs(data.data);
    } catch (e) { document.getElementById('gif-results').innerHTML = '<p style="color:var(--text-muted,#6B5744);text-align:center;grid-column:1/-1;">GIF 로드 실패</p>'; }
}

async function searchGifs() {
    const q = document.getElementById('gif-search-input').value.trim();
    if (!q) { loadTrendingGifs(); return; }
    try {
        const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(q)}&limit=20&rating=g`);
        const data = await res.json();
        renderGifs(data.data);
    } catch (e) { document.getElementById('gif-results').innerHTML = '<p style="color:var(--text-muted,#6B5744);text-align:center;grid-column:1/-1;">검색 실패</p>'; }
}

function renderGifs(gifs) {
    const container = document.getElementById('gif-results');
    container.innerHTML = gifs.map(g => {
        const url = g.images.fixed_height_small.url;
        const fullUrl = g.images.original.url;
        return `<img src="${url}" data-full="${fullUrl}" style="width:100%;border-radius:6px;cursor:pointer;object-fit:cover;height:80px;" onclick="sendGifMessage('${fullUrl}')" loading="lazy">`;
    }).join('');
}

async function sendStickerMessage(emoji) {
    if (!currentChat) return;
    document.querySelectorAll('.sticker-gif-panel').forEach(el => el.remove());
    await sendMediaMessage({ type: 'sticker', text: emoji }, emoji);
}

async function sendGifMessage(gifUrl) {
    if (!currentChat) return;
    document.querySelectorAll('.sticker-gif-panel').forEach(el => el.remove());
    await sendMediaMessage({ type: 'gif', mediaUrl: gifUrl, text: '' }, 'GIF');
}

// ===== Share item from services =====
async function showShareItemModal() {
    if (!currentChat) { showToast('채팅을 선택하세요', 'warning'); return; }
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
    <div style="background:var(--bg-card,#3D2B1F);padding:1.5rem;border-radius:16px;max-width:420px;width:100%;">
        <h3 style="margin-bottom:1rem;">🔗 공유하기</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
            <button onclick="this.closest('[style*=position]').remove();shareServiceItem('product')" style="padding:0.8rem;border:2px solid var(--border,#E8E0D8);border-radius:12px;cursor:pointer;background:var(--bg-card,#3D2B1F);font-size:0.85rem;">🛒 상품</button>
            <button onclick="this.closest('[style*=position]').remove();shareServiceItem('artist')" style="padding:0.8rem;border:2px solid var(--border,#E8E0D8);border-radius:12px;cursor:pointer;background:var(--bg-card,#3D2B1F);font-size:0.85rem;">💖 아티스트</button>
            <button onclick="this.closest('[style*=position]').remove();shareServiceItem('campaign')" style="padding:0.8rem;border:2px solid var(--border,#E8E0D8);border-radius:12px;cursor:pointer;background:var(--bg-card,#3D2B1F);font-size:0.85rem;"><i data-lucide="heart" style="width:14px;height:14px;display:inline;"></i> 캠페인</button>
            <button onclick="this.closest('[style*=position]').remove();shareServiceItem('art')" style="padding:0.8rem;border:2px solid var(--border,#E8E0D8);border-radius:12px;cursor:pointer;background:var(--bg-card,#3D2B1F);font-size:0.85rem;">🎨 작품</button>
        </div>
        <button onclick="this.closest('[style*=position]').remove()" style="width:100%;margin-top:1rem;padding:0.5rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;cursor:pointer;background:var(--bg-card,#3D2B1F);">취소</button>
    </div>`;
    document.body.appendChild(overlay);
}

async function shareServiceItem(type) {
    const cfgMap = { product: { col: 'products', name: 'name' }, artist: { col: 'artists', name: 'name' }, campaign: { col: 'campaigns', name: 'title' }, art: { col: 'artworks', name: 'title' } };
    const cfg = cfgMap[type];
    if (!cfg) return;
    try {
        const snap = await db.collection(cfg.col).limit(20).get();
        if (snap.empty) { showToast('항목이 없습니다', 'info'); return; }
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        let listHTML = '';
        snap.forEach(doc => {
            const d = doc.data();
            const name = d[cfg.name] || doc.id;
            const price = d.price ? ` — ${d.price}` : '';
            const img = d.imageUrl || d.imageData || d.thumbnailUrl || '';
            listHTML += `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.6rem;border-bottom:1px solid var(--border,#E8E0D8);cursor:pointer;" onclick="sendShareCard('${type}','${doc.id}',${JSON.stringify(name)},${JSON.stringify(img)},${JSON.stringify(d.price||'')});this.closest('[style*=position]').remove();">
                ${img ? `<img src="${img}" style="width:40px;height:40px;border-radius:6px;object-fit:cover;">` : '<div style="width:40px;height:40px;border-radius:6px;background:#E8E0D8;display:flex;align-items:center;justify-content:center;">📦</div>'}
                <div style="flex:1;min-width:0;"><div style="font-size:0.85rem;font-weight:600;">${name}</div><div style="font-size:0.75rem;color:var(--text-muted,#6B5744);">${price}</div></div>
            </div>`;
        });
        overlay.innerHTML = `<div style="background:var(--bg-card,#3D2B1F);padding:1.5rem;border-radius:16px;max-width:420px;width:100%;max-height:60vh;overflow-y:auto;">
            <h3 style="margin-bottom:1rem;">선택하세요</h3>${listHTML}
            <button onclick="this.closest('[style*=position]').remove()" style="width:100%;margin-top:1rem;padding:0.5rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;cursor:pointer;background:var(--bg-card,#3D2B1F);">취소</button>
        </div>`;
        document.body.appendChild(overlay);
    } catch (e) { showToast('로드 실패', 'error'); }
}

async function sendShareCard(type, id, name, imageUrl, price) {
    if (!currentChat) return;
    await sendMediaMessage({
        type: 'share_card', text: '',
        shareCard: { itemType: type, itemId: id, name, imageUrl: imageUrl || '', price: price || '' }
    }, `🔗 ${name}`);
}

// ===== Token transfer in chat (improved with offchain) =====

// ===== Send image (legacy, now uses sendMediaFile) =====
async function sendChatImage() {
    sendMediaFile('image');
}

// ===== Token send =====
async function sendTokenWithMessage() {
    if (!currentChat || !currentChatOtherId) { showToast(t('social.select_chat','채팅을 선택하세요'), 'warning'); return; }
    if (!userWallet || !currentWalletId) { showToast(t('social.connect_wallet','지갑을 먼저 연결하세요'), 'warning'); return; }

    const tokenChoice = await showPromptModal(t('social.select_token','토큰 선택'),
        '온체인:\n1. CRNY (' + (userWallet.balances?.crny || 0).toFixed(2) + ')\n' +
        '2. FNC (' + (userWallet.balances?.fnc || 0).toFixed(2) + ')\n' +
        '3. CRFN (' + (userWallet.balances?.crfn || 0).toFixed(2) + ')\n\n' +
        '오프체인:\n4. CRTD (' + (userWallet.offchainBalances?.crtd || 0) + ' pt)\n' +
        '5. CRAC (' + (userWallet.offchainBalances?.crac || 0) + ' pt)\n' +
        '6. CRGC (' + (userWallet.offchainBalances?.crgc || 0) + ' pt)\n' +
        '7. CREB (' + (userWallet.offchainBalances?.creb || 0) + ' pt)', '1');
    if (!tokenChoice) return;

    const tokenMap = { '1':'crny', '2':'fnc', '3':'crfn', '4':'crtd', '5':'crac', '6':'crgc', '7':'creb' };
    const tokenKey = tokenMap[tokenChoice];
    if (!tokenKey) { showToast(t('social.invalid_choice','잘못된 선택'), 'error'); return; }

    const isOffchain = isOffchainToken(tokenKey);
    const tokenName = tokenKey.toUpperCase();
    const balance = isOffchain ? (userWallet.offchainBalances?.[tokenKey] || 0) : (userWallet.balances?.[tokenKey] || 0);

    const amount = await showPromptModal(t('social.send_amount','전송 수량'), `${t('social.amount_to_send','전송할')} ${tokenName} (${t('social.balance','잔액')}: ${balance})`, '');
    if (!amount) return;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0 || amountNum > balance) {
        showToast(t('social.insufficient','잔액이 부족하거나 잘못된 수량입니다'), 'error'); return;
    }
    const message = await showPromptModal(t('social.message','메시지'), t('social.msg_optional','메시지 (선택)'), '') || '';

    try {
        if (isOffchain) {
            const recipientDoc = await db.collection('users').doc(currentChatOtherId).get();
            const recipientOff = recipientDoc.data()?.offchainBalances || {};
            await db.collection('users').doc(currentUser.uid).update({ [`offchainBalances.${tokenKey}`]: balance - amountNum });
            userWallet.offchainBalances[tokenKey] = balance - amountNum;
            await db.collection('users').doc(currentChatOtherId).update({ [`offchainBalances.${tokenKey}`]: (recipientOff[tokenKey] || 0) + amountNum });
        } else {
            await db.collection('users').doc(currentUser.uid).collection('wallets').doc(currentWalletId)
                .update({ [`balances.${tokenKey}`]: balance - amountNum });
            userWallet.balances[tokenKey] = balance - amountNum;
            const recipientWallets = await db.collection('users').doc(currentChatOtherId).collection('wallets').limit(1).get();
            if (!recipientWallets.empty) {
                const rBal = recipientWallets.docs[0].data().balances || {};
                await recipientWallets.docs[0].ref.update({ [`balances.${tokenKey}`]: (rBal[tokenKey] || 0) + amountNum });
            }
        }
        await db.collection('chats').doc(currentChat).collection('messages').add({
            senderId: currentUser.uid, text: message, tokenAmount: amountNum, tokenType: tokenName, timestamp: new Date(), readBy: [currentUser.uid]
        });
        await db.collection('chats').doc(currentChat).update({
            lastMessage: `💰 ${amountNum} ${tokenName} 전송`,
            lastMessageTime: new Date(),
            [`unreadCount.${currentChatOtherId}`]: firebase.firestore.FieldValue.increment(1)
        });
        await db.collection('transactions').add({ from: currentUser.uid, to: currentChatOtherId, amount: amountNum, token: tokenName, type: isOffchain ? 'messenger_offchain' : 'messenger_onchain', message, timestamp: new Date() });
        updateBalances();
        showToast(`✅ ${amountNum} ${tokenName} ${t('social.sent','전송 완료!')}`, 'success');
    } catch (error) {
        console.error('메신저 토큰 전송 실패:', error);
        showToast(t('social.send_fail','전송 실패: ') + error.message, 'error');
    }
}

// ===== Message delete (soft) =====
async function deleteMessage(msgId) {
    if (!currentChat) return;
    if (!await showConfirmModal(t('social.delete_msg','메시지 삭제'), t('social.confirm_delete_msg','이 메시지를 삭제하시겠습니까?'))) return;
    try {
        await db.collection('chats').doc(currentChat).collection('messages').doc(msgId).update({ deleted: true, text: '', imageUrl: null, tokenAmount: null, reactions: {} });
        showToast(t('social.msg_deleted_toast','메시지가 삭제되었습니다'), 'info');
    } catch (e) {
        showToast(t('social.delete_fail','삭제 실패'), 'error');
    }
}

// ===== Reactions =====
function showEmojiInsertPicker() {
    document.querySelectorAll('.emoji-insert-popup').forEach(el => el.remove());
    const emojis = ['😀','😂','🥰','😎','😢','😡','👍','👎','❤️','🔥','🎉','✨','💪','🙏','👋','🤔','😱','🥳','💯','⭐','🌈','🍀','☕','🎵','💎','🦋','🌸','🐱','🐶','🍕'];
    const picker = document.createElement('div');
    picker.className = 'emoji-insert-popup';
    picker.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:#F7F3ED;border:1px solid #E8E0D8;border-radius:12px;padding:0.5rem;box-shadow:0 4px 20px rgba(61,43,31,0.15);z-index:9999;display:grid;grid-template-columns:repeat(6,1fr);gap:2px;max-width:280px;';
    emojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.style.cssText = 'font-size:1.5rem;background:none;border:none;cursor:pointer;padding:6px;border-radius:8px;transition:transform 0.1s;';
        btn.onmouseenter = () => btn.style.background = '#E8E0D8';
        btn.onmouseleave = () => btn.style.background = 'none';
        btn.onclick = () => {
            const input = document.getElementById('message-input');
            if (input) { input.value += emoji; input.focus(); }
            picker.remove();
        };
        picker.appendChild(btn);
    });
    document.body.appendChild(picker);
    setTimeout(() => {
        const dismiss = (e) => { if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('click', dismiss); } };
        document.addEventListener('click', dismiss);
    }, 10);
}

function showReactionPicker(msgId) {
    // Remove any existing picker
    document.querySelectorAll('.reaction-picker-popup').forEach(el => el.remove());

    const emojis = ['👍','❤️','😂','😮','😢','🔥'];
    const picker = document.createElement('div');
    picker.className = 'reaction-picker-popup';
    picker.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-card,#3D2B1F);border:1px solid var(--border,#E8E0D8);border-radius:24px;padding:6px 10px;box-shadow:0 4px 20px rgba(0,0,0,0.15);z-index:9999;display:flex;gap:4px;';
    emojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.style.cssText = 'font-size:1.4rem;background:none;border:none;cursor:pointer;padding:4px 6px;border-radius:8px;transition:transform 0.1s;';
        btn.onmouseenter = () => btn.style.transform = 'scale(1.3)';
        btn.onmouseleave = () => btn.style.transform = 'scale(1)';
        btn.onclick = () => { toggleReaction(msgId, emoji); picker.remove(); };
        picker.appendChild(btn);
    });

    document.body.appendChild(picker);
    setTimeout(() => {
        const dismiss = (e) => { if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('click', dismiss); } };
        document.addEventListener('click', dismiss);
    }, 10);
}

async function toggleReaction(msgId, emoji) {
    if (!currentChat) return;
    const msgRef = db.collection('chats').doc(currentChat).collection('messages').doc(msgId);
    const msgDoc = await msgRef.get();
    if (!msgDoc.exists) return;
    const reactions = msgDoc.data().reactions || {};
    const uids = reactions[emoji] || [];
    if (uids.includes(currentUser.uid)) {
        // Remove my reaction
        reactions[emoji] = uids.filter(u => u !== currentUser.uid);
        if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
        reactions[emoji] = [...uids, currentUser.uid];
    }
    await msgRef.update({ reactions });
}

// ===== Long press for mobile =====
function msgTouchStart(msgId) {
    msgLongPressTimer = setTimeout(() => {
        const actionsBar = document.getElementById('actions-' + msgId);
        if (actionsBar) {
            actionsBar.classList.toggle('show');
            setTimeout(() => actionsBar.classList.remove('show'), 4000);
        }
    }, 500);
}

function msgTouchEnd() {
    clearTimeout(msgLongPressTimer);
}

// ===== Chat message search =====
function toggleChatSearch() {
    const overlay = document.getElementById('chat-search-overlay');
    if (overlay.style.display === 'none') {
        overlay.style.display = 'flex';
        document.getElementById('msg-search-input').focus();
    } else {
        closeChatSearch();
    }
}

function closeChatSearch() {
    document.getElementById('chat-search-overlay').style.display = 'none';
    document.getElementById('msg-search-input').value = '';
    // Remove highlights
    document.querySelectorAll('.msg-highlight').forEach(el => {
        el.replaceWith(document.createTextNode(el.textContent));
    });
}

function searchMessagesInChat(query) {
    // Remove old highlights first
    document.querySelectorAll('.msg-highlight').forEach(el => {
        el.replaceWith(document.createTextNode(el.textContent));
    });
    if (!query.trim()) return;

    const msgs = document.getElementById('chat-messages');
    const walker = document.createTreeWalker(msgs, NodeFilter.SHOW_TEXT, null, false);
    const q = query.toLowerCase();
    const nodes = [];
    while (walker.nextNode()) {
        if (walker.currentNode.textContent.toLowerCase().includes(q)) {
            nodes.push(walker.currentNode);
        }
    }
    for (const node of nodes) {
        const text = node.textContent;
        const idx = text.toLowerCase().indexOf(q);
        if (idx === -1) continue;
        const before = text.substring(0, idx);
        const match = text.substring(idx, idx + query.length);
        const after = text.substring(idx + query.length);
        const span = document.createElement('span');
        span.innerHTML = `${before}<span class="msg-highlight">${match}</span>${after}`;
        node.parentNode.replaceChild(span, node);
    }
    // Scroll to first match
    const first = msgs.querySelector('.msg-highlight');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ===== Chat menu (leave/delete) =====
function showChatMenu() {
    document.querySelectorAll('.chat-menu-dropdown').forEach(el => el.remove());
    const header = document.getElementById('chat-header');
    const menu = document.createElement('div');
    menu.className = 'chat-menu-dropdown';
    menu.style.position = 'absolute';
    menu.style.top = '48px';
    menu.style.right = '8px';
    menu.innerHTML = `
        ${currentChat ? `<button class="chat-menu-item" onclick="E2ECrypto.showChatSecuritySettings('${currentChat}');this.closest('.chat-menu-dropdown').remove();"><i data-lucide="shield" style="width:16px;height:16px;display:inline-block;vertical-align:middle;margin-right:6px;"></i> 보안 설정</button>` : ''}
        <button class="chat-menu-item danger" onclick="leaveChat()"><i data-lucide="log-out" style="width:16px;height:16px;display:inline-block;vertical-align:middle;margin-right:6px;"></i> ${t('social.leave_chat','채팅방 나가기')}</button>`;
    if (typeof lucide !== 'undefined') setTimeout(() => lucide.createIcons(), 50);
    header.style.position = 'relative';
    header.appendChild(menu);
    setTimeout(() => {
        const dismiss = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', dismiss); } };
        document.addEventListener('click', dismiss);
    }, 10);
}

async function leaveChat() {
    if (!currentChat) return;
    if (!await showConfirmModal(t('social.leave_chat','채팅방 나가기'), t('social.confirm_leave','이 채팅방을 나가시겠습니까? 대화 내역이 삭제됩니다.'))) return;
    try {
        // Remove self from participants
        await db.collection('chats').doc(currentChat).update({
            participants: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
        });
        if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
        if (chatDocUnsubscribe) { chatDocUnsubscribe(); chatDocUnsubscribe = null; }
        currentChat = null;
        currentChatOtherId = null;
        closeChatMobile();
        document.getElementById('chat-messages').innerHTML = '';
        document.getElementById('chat-header-actions').style.display = 'none';
        document.getElementById('chat-input-area').style.display = 'none';
        document.getElementById('chat-username').innerHTML = `<div class="chat-empty-state"><div style="font-size:3rem;margin-bottom:1rem;">💬</div><p>채팅을 선택하세요</p></div>`;
        showToast(t('social.left_chat','채팅방을 나갔습니다'), 'info');
        loadMessages();
    } catch (e) {
        showToast(t('social.leave_fail','나가기 실패: ') + e.message, 'error');
    }
}

// ========== INSTAGRAM-STYLE SOCIAL FEED ==========
async function loadSocialFeed() {
    if (!currentUser) return;
    const feed = document.getElementById('social-feed');
    if (!feed) return;
    // Skeleton loading
    feed.innerHTML = Array(3).fill(`<div class="skeleton-post"><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;"><div class="skeleton skeleton-circle" style="width:36px;height:36px;"></div><div style="flex:1"><div class="skeleton skeleton-text medium"></div><div class="skeleton skeleton-text short"></div></div></div><div class="skeleton skeleton-image" style="margin-bottom:10px;"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text medium"></div></div>`).join('');

    try {
        const posts = await db.collection('posts').orderBy('timestamp', 'desc').limit(50).get();
        const sortedPosts = posts.docs;
        feed.innerHTML = '';

        if (sortedPosts.length === 0) {
            feed.innerHTML = `<div style="text-align:center; padding:3rem; color:var(--accent);">
                <p style="font-size:3rem; margin-bottom:1rem;">📝</p>
                <p style="font-size:1.1rem;">${t('social.no_posts','아직 게시물이 없습니다')}</p>
                <p style="font-size:0.85rem;">${t('social.write_first','첫 게시물을 작성해보세요!')}</p></div>`;
            return;
        }

        // Collect video posts for shorts viewer
        _shortsVideoPosts = [];

        for (const doc of sortedPosts) {
            const post = doc.data();

            // Apply filter (shorts tab)
            const currentFilter = document.querySelector('.social-filter-tab.active')?.dataset?.filter;
            if (currentFilter === 'shorts' && !post.videoUrl) continue;

            const userInfo = await getUserDisplayInfo(post.userId);
            const timeAgo = post.timestamp ? getTimeAgo(post.timestamp.toDate()) : '방금';
            const likedByMe = post.likedBy && post.likedBy.includes(currentUser.uid);
            const likeCount = post.likes || 0;
            const commentCount = post.commentCount || 0;
            const isMyPost = post.userId === currentUser.uid;

            if (post.videoUrl) {
                _shortsVideoPosts.push({ id: doc.id, data: post, nickname: userInfo.nickname });
            }

            // Media HTML (Instagram-style)
            let mediaHTML = '';
            if (post.videoUrl) {
                const filterStyle = post.videoFilter ? `filter:${post.videoFilter};` : '';
                const textOverlay = post.videoTextOverlay || '';
                const textColor = post.videoTextColor || '#FFF8F0';
                const textPos = post.videoTextPosition || 'bottom';
                const posCSS = textPos === 'top' ? 'top:10%' : textPos === 'center' ? 'top:45%' : 'bottom:10%';
                mediaHTML = `<div class="post-media-wrap" style="position:relative;cursor:pointer;" onclick="openShortsViewer('${doc.id}')">
                    <video src="${post.videoUrl}" style="width:100%;display:block;max-height:500px;object-fit:contain;${filterStyle}" muted playsinline preload="metadata" onmouseenter="this.play().catch(()=>{})" onmouseleave="this.pause();this.currentTime=0;"></video>
                    ${textOverlay ? `<div style="position:absolute;left:0;right:0;text-align:center;${posCSS};font-size:1.1rem;font-weight:700;color:${textColor};text-shadow:0 2px 4px rgba(61,43,31,0.8);pointer-events:none;">${textOverlay}</div>` : ''}
                    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.4);border-radius:50%;width:48px;height:48px;display:flex;align-items:center;justify-content:center;pointer-events:none;"><span style="color:#FFF8F0;font-size:1.5rem;margin-left:4px;">▶</span></div>
                </div>`;
            } else if (post.imageUrl) {
                mediaHTML = `<div class="post-media-wrap" style="position:relative;" onclick="handlePostDoubleTap('${doc.id}',this)"><img src="${post.imageUrl}" style="width:100%;display:block;" loading="lazy"></div>`;
            }

            // Caption truncation
            const captionText = post.text || '';
            const captionTruncated = captionText.length > 100;
            const captionDisplay = captionTruncated ? truncateWalletAddresses(captionText.substring(0, 100)) : truncateWalletAddresses(captionText);

            // Service link
            let serviceLinkHTML = '';
            if (post.serviceLink) {
                const sl = post.serviceLink;
                const cfg = SERVICE_LINK_CONFIG[sl.type] || {};
                serviceLinkHTML = `<div style="padding:0 14px 4px;"><button onclick="navigateServiceLink('${sl.type}','${sl.id}')" style="width:100%;padding:0.5rem;border:none;border-radius:8px;background:${cfg.color || '#3D2B1F'};color:#FFF8F0;font-weight:700;font-size:0.85rem;cursor:pointer;">${cfg.action || sl.action} — ${sl.title || ''}</button></div>`;
            }

            const postEl = document.createElement('div');
            postEl.className = 'post';
            postEl.id = `post-${doc.id}`;
            postEl.setAttribute('data-post-id', doc.id);
            postEl.innerHTML = `
                <div class="post-header" style="display:flex;align-items:center;gap:10px;padding:10px 14px;">
                    <div onclick="showUserProfile('${post.userId}')" style="cursor:pointer;">${avatarHTML(userInfo.photoURL, userInfo.nickname, 36)}</div>
                    <div style="flex:1;min-width:0;">
                        <strong onclick="showUserProfile('${post.userId}')" style="cursor:pointer;font-size:0.9rem;">${userInfo.nickname}${typeof AI_SOCIAL !== 'undefined' && AI_SOCIAL.isBotUser(post.userId) ? AI_SOCIAL.getBotBadge(post.userId) : ''}</strong>
                        ${post.location ? `<span style="font-size:0.75rem;color:var(--dark-muted,#6B5744);display:block;">${post.location}</span>` : ''}
                    </div>
                    <button onclick="showPostMenu('${doc.id}',${isMyPost})" style="background:none;border:none;cursor:pointer;font-size:1.2rem;color:var(--dark-muted,#6B5744);padding:4px;">⋯</button>
                </div>
                ${mediaHTML}
                <div class="post-actions-bar" style="display:flex;align-items:center;gap:16px;padding:8px 14px;">
                    <button onclick="toggleLike('${doc.id}', ${likedByMe})" style="background:none;border:none;cursor:pointer;font-size:1.4rem;padding:0;transition:transform 0.15s;" onmousedown="this.style.transform='scale(1.2)'" onmouseup="this.style.transform='scale(1)'">${likedByMe ? '❤️' : '🤍'}</button>
                    <button onclick="toggleComments('${doc.id}')" style="background:none;border:none;cursor:pointer;padding:0;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
                    <button onclick="sharePostWebAPI('${doc.id}')" style="background:none;border:none;cursor:pointer;font-size:1.2rem;padding:0;">↗️</button>
                    <span style="flex:1;"></span>
                    <button onclick="toggleSavePost('${doc.id}')" style="background:none;border:none;cursor:pointer;font-size:1.2rem;padding:0;">🔖</button>
                </div>
                ${likeCount > 0 ? `<div style="padding:0 14px;font-weight:700;font-size:0.85rem;margin-bottom:4px;cursor:pointer;" onclick="showLikedUsers('${doc.id}')">${t('social.likes','좋아요')} ${likeCount}${t('social.count','개')}</div>` : ''}
                ${captionText ? `<div style="padding:0 14px 4px;font-size:0.9rem;line-height:1.5;"><strong style="margin-right:4px;">${userInfo.nickname}</strong>${captionDisplay}${captionTruncated ? ' <span style="color:var(--dark-muted,#6B5744);cursor:pointer;" onclick="this.parentElement.textContent=\'\'" >더 보기</span>' : ''}</div>` : ''}
                ${serviceLinkHTML}
                ${commentCount > 0 ? `<div onclick="toggleComments('${doc.id}')" style="padding:0 14px;color:var(--dark-muted,#6B5744);font-size:0.85rem;cursor:pointer;margin-bottom:4px;">댓글 ${commentCount}개 모두 보기</div>` : ''}
                <div style="padding:0 14px 12px;font-size:0.7rem;color:var(--dark-muted,#6B5744);text-transform:uppercase;">${timeAgo}</div>
                <div id="comments-${doc.id}" style="display:none;border-top:1px solid var(--dark-border,#2a2a4a);padding:8px 14px;">
                    <div id="comment-list-${doc.id}"></div>
                    <div style="display:flex;gap:0.5rem;margin-top:6px;align-items:center;">
                        <input type="text" id="comment-input-${doc.id}" placeholder="${t('social.add_comment','댓글 달기...')}" style="flex:1;padding:8px;border:none;border-bottom:1px solid var(--dark-border,#2a2a4a);font-size:0.85rem;outline:none;background:transparent;" onkeypress="if(event.key==='Enter')addComment('${doc.id}')">
                        <button onclick="addComment('${doc.id}')" style="background:none;border:none;color:#0095f6;font-weight:700;cursor:pointer;font-size:0.85rem;">${t('social.post','게시')}</button>
                    </div>
                </div>`;
            feed.appendChild(postEl);
        }
    } catch (error) {
        console.error('Feed load error:', error);
        feed.innerHTML = `<div style="text-align:center; padding:3rem;">
            <p style="font-size:2rem; margin-bottom:1rem;">⚠️</p>
            <p style="color:red;">${error.message}</p>
            <button onclick="loadSocialFeed()" class="btn-primary" style="margin-top:1rem;">${t('common.refresh','새로고침')}</button></div>`;
    }
}

async function toggleLike(postId, isLiked) {
    const postRef = db.collection('posts').doc(postId);
    const post = await postRef.get();
    const data = post.data();
    let likedBy = data.likedBy || [];
    let likes = data.likes || 0;
    if (isLiked) {
        likedBy = likedBy.filter(uid => uid !== currentUser.uid);
        likes = Math.max(0, likes - 1);
    } else {
        likedBy.push(currentUser.uid);
        likes += 1;
        // Social notification
        if (data.userId !== currentUser.uid && typeof createSocialNotification === 'function') {
            const myInfo = await getUserDisplayInfo(currentUser.uid);
            createSocialNotification(data.userId, 'like', `${myInfo.nickname}님이 게시물을 좋아합니다`, { targetId: postId });
        }
    }
    await postRef.update({ likedBy, likes });
    loadSocialFeed();
}

async function showLikedUsers(postId) {
    const post = await db.collection('posts').doc(postId).get();
    const likedBy = post.data().likedBy || [];
    if (likedBy.length === 0) { showToast(t('social.no_likes','아직 좋아요가 없습니다'), 'info'); return; }
    let message = '';
    for (const uid of likedBy) {
        const info = await getUserDisplayInfo(uid);
        message += `${info.nickname}\n`;
    }
    await showConfirmModal(t('social.likes','좋아요'), message);
}

async function toggleComments(postId) {
    const div = document.getElementById(`comments-${postId}`);
    if (div.style.display === 'none') { div.style.display = 'block'; await (typeof loadCommentsWithReplies === 'function' ? loadCommentsWithReplies(postId) : loadComments(postId)); }
    else div.style.display = 'none';
}

async function loadComments(postId) {
    const list = document.getElementById(`comment-list-${postId}`);
    list.innerHTML = '';
    const comments = await db.collection('posts').doc(postId).collection('comments').orderBy('timestamp', 'asc').get();
    if (comments.empty) { list.innerHTML = `<p style="text-align:center; color:var(--accent); font-size:0.8rem;">${t('social.first_comment','첫 댓글을 남겨보세요!')}</p>`; return; }
    for (const doc of comments.docs) {
        const c = doc.data();
        const info = await getUserDisplayInfo(c.userId);
        const el = document.createElement('div');
        el.style.cssText = 'margin-bottom:0.4rem; font-size:0.85rem; line-height:1.4;';
        el.innerHTML = `<strong style="margin-right:0.3rem;">${info.nickname}</strong>${truncateWalletAddresses(c.text)} <span style="font-size:0.7rem; color:var(--accent);">${getTimeAgo(c.timestamp.toDate())}</span>`;
        list.appendChild(el);
    }
}

async function addComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const text = input.value.trim();
    if (!text) return;
    await db.collection('posts').doc(postId).collection('comments').add({ userId: currentUser.uid, text, timestamp: new Date() });
    const postRef = db.collection('posts').doc(postId);
    const post = await postRef.get();
    const postData = post.data();
    await postRef.update({ commentCount: (postData.commentCount || 0) + 1 });
    // Social notification
    if (postData.userId !== currentUser.uid && typeof createSocialNotification === 'function') {
        const myInfo = await getUserDisplayInfo(currentUser.uid);
        createSocialNotification(postData.userId, 'comment', `${myInfo.nickname}님이 댓글을 남겼습니다`, { targetId: postId });
    }
    // Check mentions
    const mentions = extractMentions ? extractMentions(text) : [];
    for (const mention of mentions) {
        try {
            const users = await db.collection('users').where('nickname', '==', mention).limit(1).get();
            if (!users.empty && users.docs[0].id !== currentUser.uid) {
                const myInfo = await getUserDisplayInfo(currentUser.uid);
                createSocialNotification(users.docs[0].id, 'mention', `${myInfo.nickname}님이 회원님을 언급했습니다`, { targetId: postId });
            }
        } catch (e) {}
    }
    input.value = '';
    await (typeof loadCommentsWithReplies === 'function' ? loadCommentsWithReplies(postId) : loadComments(postId));
    loadSocialFeed();
}

async function editPost(postId) {
    try {
        const doc = await db.collection('posts').doc(postId).get();
        if (!doc.exists) { showToast('게시물을 찾을 수 없습니다', 'error'); return; }
        const data = doc.data();
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        overlay.innerHTML = `<div class="modal-content" style="max-width:500px;width:90%;padding:1.5rem;">
            <h3 style="margin-bottom:1rem;">✏️ 게시물 수정</h3>
            <textarea id="edit-post-text" style="width:100%;min-height:120px;padding:0.8rem;border:1px solid var(--border,#E8E0D8);border-radius:10px;font-size:0.95rem;resize:vertical;background:var(--card-bg,#3D2B1F);color:var(--text,#FFF8F0);box-sizing:border-box;">${data.text || ''}</textarea>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
                <button onclick="this.closest('.modal-overlay').remove();" style="padding:0.6rem 1.2rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;background:none;color:var(--text,#3D2B1F);cursor:pointer;">취소</button>
                <button onclick="saveEditPost('${postId}');" style="padding:0.6rem 1.2rem;border:none;border-radius:8px;background:#8B6914;color:#3D2B1F;font-weight:600;cursor:pointer;">저장</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
    } catch (e) { showToast('수정 실패: ' + e.message, 'error'); }
}

async function saveEditPost(postId) {
    const textarea = document.getElementById('edit-post-text');
    if (!textarea) return;
    const newText = textarea.value.trim();
    if (!newText) { showToast('내용을 입력해주세요', 'warning'); return; }
    try {
        await db.collection('posts').doc(postId).update({ text: newText, editedAt: firebase.firestore.FieldValue.serverTimestamp() });
        showToast('게시물이 수정되었습니다 ✅', 'success');
        document.querySelector('.modal-overlay')?.remove();
        loadSocialFeed();
    } catch (e) { showToast('수정 실패: ' + e.message, 'error'); }
}

async function deletePost(postId) {
    if (!await showConfirmModal(t('social.delete_post','게시물 삭제'), t('social.confirm_delete','이 게시물을 삭제하시겠습니까?'))) return;
    try {
        await db.collection('posts').doc(postId).delete();
        showToast(t('social.post_deleted','게시물 삭제됨'), 'info');
        loadSocialFeed();
    } catch (e) { showToast(t('social.delete_fail','삭제 실패'), 'error'); }
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return t('social.just_now','방금 전');
    if (seconds < 3600) return `${Math.floor(seconds / 60)}${t('social.min_ago','분 전')}`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}${t('social.hour_ago','시간 전')}`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}${t('social.day_ago','일 전')}`;
    return `${Math.floor(seconds / 604800)}${t('social.week_ago','주 전')}`;
}

// ========== VIDEO EDITOR STATE ==========
let _videoEditorState = { trimStart: 0, trimEnd: 0, filter: 'none', textOverlay: '', textPosition: 'bottom', textColor: '#FFF8F0' };
let _pendingServiceLink = null;

// ========== SERVICE LINK CONFIG ==========
const SERVICE_LINK_CONFIG = {
    artist:   { action: '💖 후원하기', color: '#B54534', collection: 'artists', nameField: 'name', nav: (id) => { showPage('artist'); viewArtistDetail(id); } },
    campaign: { action: '<i data-lucide="heart" style="width:14px;height:14px;display:inline;"></i> 모금하기', color: '#6B8F3C', collection: 'campaigns', nameField: 'title', nav: (id) => { showPage('fundraise'); showCampaignDetail(id); } },
    business: { action: '<i data-lucide="coins" style="width:14px;height:14px;display:inline;"></i> 투자하기', color: '#3D2B1F', collection: 'businesses', nameField: 'name', nav: (id) => { showPage('business'); viewBusinessDetail(id); } },
    art:      { action: '🎨 작품 구매', color: '#8B6914', collection: 'artworks', nameField: 'title', nav: (id) => showPage('art') },
    book:     { action: '📚 책 구매', color: '#FF9800', collection: 'books', nameField: 'title', nav: (id) => showPage('books') },
    product:  { action: '🛒 상품 구매', color: '#5B7B8C', collection: 'products', nameField: 'name', nav: (id) => { showPage('product-detail'); renderProductDetail(id); } }
};

// ========== SERVICE LINK MODAL ==========
async function showServiceLinkModal() {
    const overlay = document.createElement('div');
    overlay.id = 'service-link-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
    <div style="background:var(--bg-card,#3D2B1F);padding:1.5rem;border-radius:16px;max-width:480px;width:100%;max-height:80vh;overflow-y:auto;">
        <h3 style="margin-bottom:1rem;">🔗 서비스 연결</h3>
        <p style="font-size:0.85rem;color:var(--text-muted,#6B5744);margin-bottom:1rem;">게시물에 연결할 서비스를 선택하세요</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:1rem;">
            ${Object.entries(SERVICE_LINK_CONFIG).map(([type, cfg]) => `
                <button onclick="selectServiceType('${type}')" style="padding:0.8rem;border:2px solid var(--border,#E8E0D8);border-radius:12px;cursor:pointer;background:var(--bg-card,#3D2B1F);font-size:0.85rem;font-weight:600;text-align:center;transition:all 0.2s;" onmouseover="this.style.borderColor='${cfg.color}';this.style.background='${cfg.color}11'" onmouseout="this.style.borderColor='#E8E0D8';this.style.background='white'">
                    ${cfg.action}
                </button>
            `).join('')}
        </div>
        <div id="service-link-search" style="display:none;">
            <div style="display:flex;gap:0.5rem;margin-bottom:0.8rem;">
                <input type="text" id="service-link-query" placeholder="검색..." style="flex:1;padding:0.6rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;font-size:0.9rem;">
                <button onclick="searchServiceItems()" style="padding:0.6rem 1rem;border:none;border-radius:8px;background:var(--gold,#8B6914);color:#3D2B1F;cursor:pointer;">검색</button>
            </div>
            <div id="service-link-results" style="max-height:250px;overflow-y:auto;"></div>
        </div>
        <div style="margin-top:1rem;text-align:right;">
            <button onclick="document.getElementById('service-link-modal').remove()" style="padding:0.5rem 1rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;cursor:pointer;background:var(--bg-card,#3D2B1F);">취소</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
}

let _selectedServiceType = null;

async function selectServiceType(type) {
    _selectedServiceType = type;
    const searchDiv = document.getElementById('service-link-search');
    searchDiv.style.display = 'block';
    document.getElementById('service-link-query').value = '';
    document.getElementById('service-link-query').focus();
    // Auto-load first items
    await searchServiceItems();
}

async function searchServiceItems() {
    const type = _selectedServiceType;
    if (!type) return;
    const cfg = SERVICE_LINK_CONFIG[type];
    const query = document.getElementById('service-link-query').value.trim();
    const results = document.getElementById('service-link-results');
    results.innerHTML = '<p style="text-align:center;color:var(--accent);">로딩...</p>';

    try {
        let snap;
        if (query) {
            snap = await db.collection(cfg.collection).where(cfg.nameField, '>=', query).where(cfg.nameField, '<=', query + '\uf8ff').limit(10).get();
        } else {
            snap = await db.collection(cfg.collection).limit(10).get();
        }
        results.innerHTML = '';
        if (snap.empty) {
            results.innerHTML = '<p style="text-align:center;color:var(--text-muted,#6B5744);font-size:0.85rem;">결과 없음</p>';
            return;
        }
        snap.forEach(doc => {
            const data = doc.data();
            const name = data[cfg.nameField] || doc.id;
            const el = document.createElement('div');
            el.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:0.6rem;border-bottom:1px solid var(--border,#E8E0D8);cursor:pointer;';
            el.onmouseover = () => el.style.background = '#f9f9f9';
            el.onmouseout = () => el.style.background = 'white';
            el.innerHTML = `<span style="font-size:0.9rem;">${name}</span><button style="padding:0.3rem 0.6rem;border:none;border-radius:6px;background:${cfg.color};color:#FFF8F0;font-size:0.8rem;cursor:pointer;">선택</button>`;
            el.onclick = () => {
                _pendingServiceLink = { type, id: doc.id, title: name, action: cfg.action.replace(/[^\w가-힣\s]/g, '').trim() };
                document.getElementById('service-link-modal').remove();
                // Show preview
                const preview = document.getElementById('post-service-link-preview');
                preview.style.display = 'block';
                preview.innerHTML = `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem;background:${cfg.color}11;border:1px solid ${cfg.color}44;border-radius:8px;">
                    <span style="font-size:0.85rem;flex:1;">${cfg.action} - ${name}</span>
                    <button onclick="_pendingServiceLink=null;this.parentElement.parentElement.style.display='none';" style="background:none;border:none;cursor:pointer;font-size:1rem;">✕</button>
                </div>`;
            };
            results.appendChild(el);
        });
    } catch (e) {
        results.innerHTML = `<p style="color:red;text-align:center;font-size:0.85rem;">${e.message}</p>`;
    }
}

// ========== VIDEO EDITOR ==========
function openVideoEditor() {
    const videoInput = document.getElementById('post-video');
    if (!videoInput.files[0]) return;
    const url = URL.createObjectURL(videoInput.files[0]);

    const overlay = document.createElement('div');
    overlay.id = 'video-editor-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.9);z-index:99998;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1rem;';
    overlay.innerHTML = `
    <div style="width:100%;max-width:400px;">
        <div style="position:relative;margin-bottom:1rem;">
            <video id="editor-video" src="${url}" style="width:100%;border-radius:12px;max-height:50vh;" playsinline></video>
            <div id="editor-text-overlay" style="position:absolute;left:0;right:0;text-align:center;font-size:1.2rem;font-weight:700;text-shadow:0 2px 4px rgba(61,43,31,0.8);pointer-events:none;"></div>
        </div>
        <div style="background:var(--bg-card,#3D2B1F);border-radius:12px;padding:1rem;">
            <h4 style="margin:0 0 0.8rem;">✂️ 영상 편집</h4>
            <!-- Trim -->
            <div style="margin-bottom:0.8rem;">
                <label style="font-size:0.8rem;color:var(--text-muted,#6B5744);">트리밍 (구간 선택)</label>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <span style="font-size:0.75rem;">시작</span>
                    <input type="range" id="trim-start" min="0" max="60" value="0" step="0.1" style="flex:1;" oninput="updateTrimPreview()">
                    <span id="trim-start-val" style="font-size:0.75rem;min-width:30px;">0s</span>
                </div>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <span style="font-size:0.75rem;">끝</span>
                    <input type="range" id="trim-end" min="0" max="60" value="60" step="0.1" style="flex:1;" oninput="updateTrimPreview()">
                    <span id="trim-end-val" style="font-size:0.75rem;min-width:30px;">60s</span>
                </div>
            </div>
            <!-- Filters -->
            <div style="margin-bottom:0.8rem;">
                <label style="font-size:0.8rem;color:var(--text-muted,#6B5744);">필터</label>
                <div style="display:flex;gap:0.5rem;margin-top:0.3rem;">
                    <button onclick="setVideoFilter('none')" class="vfilter-btn active" style="padding:0.3rem 0.6rem;border:2px solid #3D2B1F;border-radius:8px;font-size:0.75rem;cursor:pointer;background:var(--bg-card,#3D2B1F);">원본</button>
                    <button onclick="setVideoFilter('grayscale(100%)')" class="vfilter-btn" style="padding:0.3rem 0.6rem;border:2px solid #E8E0D8;border-radius:8px;font-size:0.75rem;cursor:pointer;background:var(--bg-card,#3D2B1F);">흑백</button>
                    <button onclick="setVideoFilter('sepia(40%) saturate(1.4)')" class="vfilter-btn" style="padding:0.3rem 0.6rem;border:2px solid #E8E0D8;border-radius:8px;font-size:0.75rem;cursor:pointer;background:var(--bg-card,#3D2B1F);">따뜻한</button>
                    <button onclick="setVideoFilter('saturate(0.8) hue-rotate(20deg)')" class="vfilter-btn" style="padding:0.3rem 0.6rem;border:2px solid #E8E0D8;border-radius:8px;font-size:0.75rem;cursor:pointer;background:var(--bg-card,#3D2B1F);">시원한</button>
                </div>
            </div>
            <!-- Text overlay -->
            <div style="margin-bottom:0.8rem;">
                <label style="font-size:0.8rem;color:var(--text-muted,#6B5744);">텍스트 오버레이</label>
                <input type="text" id="editor-text-input" placeholder="텍스트 입력" maxlength="50" style="width:100%;padding:0.5rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;font-size:0.85rem;margin-top:0.3rem;box-sizing:border-box;" oninput="updateTextOverlay()">
                <div style="display:flex;gap:0.5rem;margin-top:0.3rem;align-items:center;">
                    <select id="editor-text-pos" style="padding:0.3rem;border:1px solid var(--border,#E8E0D8);border-radius:6px;font-size:0.8rem;" onchange="updateTextOverlay()">
                        <option value="top">상단</option><option value="center">중앙</option><option value="bottom" selected>하단</option>
                    </select>
                    <input type="color" id="editor-text-color" value="#FFF8F0" style="width:30px;height:30px;border:none;cursor:pointer;" onchange="updateTextOverlay()">
                </div>
            </div>
            <div style="display:flex;gap:0.5rem;">
                <button onclick="document.getElementById('video-editor-modal').remove()" style="flex:1;padding:0.6rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;cursor:pointer;background:var(--bg-card,#3D2B1F);">취소</button>
                <button onclick="applyVideoEdits()" style="flex:1;padding:0.6rem;border:none;border-radius:8px;cursor:pointer;background:var(--gold,#8B6914);color:#3D2B1F;font-weight:700;">✅ 적용</button>
            </div>
        </div>
    </div>`;
    document.body.appendChild(overlay);

    const video = document.getElementById('editor-video');
    video.onloadedmetadata = () => {
        const dur = Math.min(video.duration, 60);
        document.getElementById('trim-end').max = dur;
        document.getElementById('trim-start').max = dur;
        document.getElementById('trim-end').value = dur;
        document.getElementById('trim-end-val').textContent = dur.toFixed(1) + 's';
        _videoEditorState.trimEnd = dur;
        video.play().catch(() => {});
    };
}

function updateTrimPreview() {
    const s = parseFloat(document.getElementById('trim-start').value);
    const e = parseFloat(document.getElementById('trim-end').value);
    document.getElementById('trim-start-val').textContent = s.toFixed(1) + 's';
    document.getElementById('trim-end-val').textContent = e.toFixed(1) + 's';
    _videoEditorState.trimStart = s;
    _videoEditorState.trimEnd = e;
    const v = document.getElementById('editor-video');
    if (v) v.currentTime = s;
}

function setVideoFilter(filter) {
    _videoEditorState.filter = filter;
    const v = document.getElementById('editor-video');
    if (v) v.style.filter = filter;
    document.querySelectorAll('.vfilter-btn').forEach(b => { b.classList.remove('active'); b.style.borderColor = '#E8E0D8'; });
    event.target.classList.add('active');
    event.target.style.borderColor = '#3D2B1F';
}

function updateTextOverlay() {
    const text = document.getElementById('editor-text-input').value;
    const pos = document.getElementById('editor-text-pos').value;
    const color = document.getElementById('editor-text-color').value;
    _videoEditorState.textOverlay = text;
    _videoEditorState.textPosition = pos;
    _videoEditorState.textColor = color;
    const overlay = document.getElementById('editor-text-overlay');
    overlay.textContent = text;
    overlay.style.color = color;
    overlay.style.top = pos === 'top' ? '10%' : pos === 'center' ? '45%' : '';
    overlay.style.bottom = pos === 'bottom' ? '10%' : '';
}

function applyVideoEdits() {
    document.getElementById('video-editor-modal').remove();
    showToast('✅ 편집 적용됨', 'success');
}

// ========== THUMBNAIL EXTRACTION ==========
function extractVideoThumbnail(file) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.src = URL.createObjectURL(file);
        video.onloadeddata = () => {
            video.currentTime = Math.min(2, video.duration * 0.1);
        };
        video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = Math.min(video.videoWidth, 480);
            canvas.height = (canvas.width / video.videoWidth) * video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const thumb = canvas.toDataURL('image/jpeg', 0.7);
            URL.revokeObjectURL(video.src);
            resolve({ thumbnailData: thumb, duration: video.duration });
        };
        video.onerror = () => resolve({ thumbnailData: null, duration: 0 });
    });
}

// ========== CREATE POST (with video + service link support) ==========
async function createPost() {
    const textarea = document.getElementById('post-text');
    const fileInput = document.getElementById('post-image');
    const videoInput = document.getElementById('post-video');
    const locationInput = document.getElementById('post-location');
    const text = textarea.value.trim();
    const location = locationInput ? locationInput.value.trim() : '';
    const hasImage = fileInput.files[0];
    const hasVideo = videoInput.files[0];
    if (!text && !hasImage && !hasVideo) { showToast(t('social.enter_content','내용 또는 이미지/영상을 입력하세요'), 'warning'); return; }

    try {
        showLoading(t('social.posting','게시 중...'));
        let imageUrl = null;
        let videoUrl = null;
        let thumbnailData = null;
        let duration = 0;

        if (hasImage) {
            const file = fileInput.files[0];
            const storagePath = `posts/${currentUser.uid}/${Date.now()}_${file.name}`;
            imageUrl = await resizeAndUploadImage(file, 1080, storagePath);
        }

        if (hasVideo) {
            // Extract thumbnail first
            const thumbInfo = await extractVideoThumbnail(videoInput.files[0]);
            thumbnailData = thumbInfo.thumbnailData;
            duration = thumbInfo.duration;

            // Upload video to Firebase Storage
            const storageRef = firebase.storage().ref();
            const videoRef = storageRef.child(`videos/${currentUser.uid}/${Date.now()}.mp4`);
            
            // Show upload progress
            const uploadTask = videoRef.put(videoInput.files[0]);
            await new Promise((resolve, reject) => {
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                        showLoading(`📤 영상 업로드 중... ${progress}%`);
                    },
                    reject,
                    async () => {
                        videoUrl = await uploadTask.snapshot.ref.getDownloadURL();
                        resolve();
                    }
                );
            });
        }

        // Extract hashtags and mentions
        const hashtags = typeof extractHashtags === 'function' ? extractHashtags(text) : [];
        const mentions = typeof extractMentions === 'function' ? extractMentions(text) : [];

        const postData = {
            userId: currentUser.uid, text, imageUrl, likes: 0, likedBy: [], commentCount: 0, shareCount: 0, timestamp: new Date(),
            hashtags, mentions
        };
        
        if (location) postData.location = location;

        if (videoUrl) {
            postData.videoUrl = videoUrl;
            postData.thumbnailData = thumbnailData;
            postData.duration = duration;
            // Save editor metadata
            if (_videoEditorState.trimStart > 0 || _videoEditorState.trimEnd < duration) {
                postData.trimStart = _videoEditorState.trimStart;
                postData.trimEnd = _videoEditorState.trimEnd;
            }
            if (_videoEditorState.filter !== 'none') postData.videoFilter = _videoEditorState.filter;
            if (_videoEditorState.textOverlay) {
                postData.videoTextOverlay = _videoEditorState.textOverlay;
                postData.videoTextPosition = _videoEditorState.textPosition;
                postData.videoTextColor = _videoEditorState.textColor;
            }
        }

        if (_pendingServiceLink) {
            postData.serviceLink = _pendingServiceLink;
        }

        const newPostRef = await db.collection('posts').add(postData);

        // Send mention notifications
        if (mentions.length > 0 && typeof createSocialNotification === 'function') {
            const myInfo = await getUserDisplayInfo(currentUser.uid);
            for (const mention of mentions) {
                try {
                    const users = await db.collection('users').where('nickname', '==', mention).limit(1).get();
                    if (!users.empty && users.docs[0].id !== currentUser.uid) {
                        createSocialNotification(users.docs[0].id, 'mention', `${myInfo.nickname}님이 회원님을 언급했습니다`, { targetId: newPostRef.id });
                    }
                } catch (e) {}
            }
        }

        // Reset state
        textarea.value = '';
        fileInput.value = '';
        videoInput.value = '';
        if (locationInput) locationInput.value = '';
        document.getElementById('post-image-name').textContent = '';
        document.getElementById('post-video-preview').style.display = 'none';
        document.getElementById('post-service-link-preview').style.display = 'none';
        _pendingServiceLink = null;
        _videoEditorState = { trimStart: 0, trimEnd: 0, filter: 'none', textOverlay: '', textPosition: 'bottom', textColor: '#FFF8F0' };

        hideLoading();
        await loadSocialFeed();
        showToast(t('social.post_done','✅ 게시 완료!'), 'success');
        if (window.lucide) lucide.createIcons();
    } catch (error) {
        hideLoading();
        console.error('Post error:', error);
        showToast(t('social.post_fail','게시 실패') + ': ' + error.message, 'error');
    }
}

// ========== SHARE POST ==========
async function sharePost(postId) {
    const shareUrl = `https://crowny-org.vercel.app/#page=social&post=${postId}`;
    try {
        if (navigator.share) {
            await navigator.share({ title: 'Crowny', text: '크라우니에서 공유된 게시물', url: shareUrl });
        } else {
            await navigator.clipboard.writeText(shareUrl);
            showToast('📋 링크가 복사되었습니다', 'success');
        }
        // Increment share count
        await db.collection('posts').doc(postId).update({ shareCount: firebase.firestore.FieldValue.increment(1) });
    } catch (e) {
        if (e.name !== 'AbortError') {
            try { await navigator.clipboard.writeText(shareUrl); showToast('📋 링크가 복사되었습니다', 'success'); } catch (_) {}
        }
    }
}

// ========== SHORTS FULLSCREEN VIEWER ==========
let _shortsVideoPosts = [];
let _shortsCurrentIndex = 0;

function openShortsViewer(startPostId) {
    _shortsCurrentIndex = _shortsVideoPosts.findIndex(p => p.id === startPostId) || 0;
    renderShortsViewer();
}

function renderShortsViewer() {
    if (_shortsVideoPosts.length === 0) return;
    const post = _shortsVideoPosts[_shortsCurrentIndex];
    if (!post) return;

    let overlay = document.getElementById('shorts-viewer');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'shorts-viewer';
        document.body.appendChild(overlay);
    }
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#3D2B1F;z-index:99999;display:flex;align-items:center;justify-content:center;';

    const filterCSS = post.data.videoFilter || '';
    const textOverlay = post.data.videoTextOverlay || '';
    const textPos = post.data.videoTextPosition || 'bottom';
    const textColor = post.data.videoTextColor || '#FFF8F0';
    const posStyle = textPos === 'top' ? 'top:10%' : textPos === 'center' ? 'top:45%' : 'bottom:10%';

    const sl = post.data.serviceLink;
    let serviceLinkHTML = '';
    if (sl) {
        const cfg = SERVICE_LINK_CONFIG[sl.type] || {};
        serviceLinkHTML = `<button onclick="event.stopPropagation();navigateServiceLink('${sl.type}','${sl.id}')" style="position:absolute;bottom:80px;left:50%;transform:translateX(-50%);padding:0.7rem 1.5rem;border:none;border-radius:24px;background:${cfg.color || '#3D2B1F'};color:#FFF8F0;font-weight:700;font-size:0.95rem;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.3);z-index:10;white-space:nowrap;">${cfg.action || sl.action}</button>`;
    }

    overlay.innerHTML = `
    <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;" id="shorts-container">
        <video id="shorts-video" src="${post.data.videoUrl}" style="max-width:100%;max-height:100%;object-fit:contain;${filterCSS ? 'filter:'+filterCSS+';' : ''}" playsinline loop muted autoplay
            ${post.data.trimStart ? `data-trim-start="${post.data.trimStart}"` : ''} ${post.data.trimEnd ? `data-trim-end="${post.data.trimEnd}"` : ''}></video>
        ${textOverlay ? `<div style="position:absolute;left:0;right:0;text-align:center;${posStyle};font-size:1.4rem;font-weight:700;color:${textColor};text-shadow:0 2px 6px rgba(61,43,31,0.8);pointer-events:none;padding:0 1rem;">${textOverlay}</div>` : ''}
        
        <!-- Close -->
        <button onclick="closeShortsViewer()" style="position:absolute;top:16px;right:16px;background:rgba(61,43,31,0.5);color:#FFF8F0;border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;font-size:1.2rem;z-index:10;">✕</button>
        
        <!-- Info overlay -->
        <div style="position:absolute;bottom:20px;left:16px;right:80px;color:#FFF8F0;z-index:5;">
            <strong style="font-size:0.95rem;">${post.nickname || '사용자'}</strong>
            <p style="font-size:0.85rem;margin:0.2rem 0;opacity:0.9;">${(post.data.text || '').substring(0, 100)}</p>
        </div>

        <!-- Side actions -->
        <div style="position:absolute;right:12px;bottom:100px;display:flex;flex-direction:column;gap:1rem;align-items:center;z-index:5;">
            <button onclick="event.stopPropagation();toggleLike('${post.id}',${(post.data.likedBy||[]).includes(currentUser?.uid)})" style="background:none;border:none;cursor:pointer;color:#FFF8F0;text-align:center;">
                <div style="font-size:1.5rem;">${(post.data.likedBy||[]).includes(currentUser?.uid) ? '❤️' : '🤍'}</div>
                <div style="font-size:0.75rem;">${post.data.likes || 0}</div>
            </button>
            <button onclick="event.stopPropagation();closeShortsViewer();toggleComments('${post.id}')" style="background:none;border:none;cursor:pointer;color:#FFF8F0;text-align:center;">
                <div style="font-size:1.5rem;">💬</div>
                <div style="font-size:0.75rem;">${post.data.commentCount || 0}</div>
            </button>
            <button onclick="event.stopPropagation();sharePost('${post.id}')" style="background:none;border:none;cursor:pointer;color:#FFF8F0;text-align:center;">
                <div style="font-size:1.5rem;">📤</div>
                <div style="font-size:0.75rem;">${post.data.shareCount || 0}</div>
            </button>
        </div>

        ${serviceLinkHTML}

        <!-- Nav arrows -->
        ${_shortsCurrentIndex > 0 ? `<button onclick="event.stopPropagation();navigateShorts(-1)" style="position:absolute;top:50%;left:8px;transform:translateY(-50%);background:rgba(255,255,255,0.2);border:none;border-radius:50%;width:40px;height:40px;cursor:pointer;color:#FFF8F0;font-size:1.2rem;z-index:10;">▲</button>` : ''}
        ${_shortsCurrentIndex < _shortsVideoPosts.length - 1 ? `<button onclick="event.stopPropagation();navigateShorts(1)" style="position:absolute;top:50%;right:8px;transform:translateY(-50%);background:rgba(255,255,255,0.2);border:none;border-radius:50%;width:40px;height:40px;cursor:pointer;color:#FFF8F0;font-size:1.2rem;z-index:10;">▼</button>` : ''}
    </div>`;

    // Toggle mute on tap
    const video = document.getElementById('shorts-video');
    overlay.querySelector('#shorts-container').onclick = () => { video.muted = !video.muted; };

    // Handle trim
    if (post.data.trimStart) video.currentTime = post.data.trimStart;
    video.ontimeupdate = () => {
        if (post.data.trimEnd && video.currentTime >= post.data.trimEnd) {
            video.currentTime = post.data.trimStart || 0;
        }
    };

    // Swipe support
    let touchStartY = 0;
    overlay.ontouchstart = (e) => { touchStartY = e.touches[0].clientY; };
    overlay.ontouchend = (e) => {
        const diff = touchStartY - e.changedTouches[0].clientY;
        if (Math.abs(diff) > 60) navigateShorts(diff > 0 ? 1 : -1);
    };
}

function navigateShorts(dir) {
    const next = _shortsCurrentIndex + dir;
    if (next >= 0 && next < _shortsVideoPosts.length) {
        _shortsCurrentIndex = next;
        renderShortsViewer();
    }
}

function closeShortsViewer() {
    const v = document.getElementById('shorts-viewer');
    if (v) v.remove();
}

function navigateServiceLink(type, id) {
    closeShortsViewer();
    const cfg = SERVICE_LINK_CONFIG[type];
    if (cfg && cfg.nav) cfg.nav(id);
}

// ========== Contact management ==========
async function editContact(contactDocId, currentName) {
    const newName = await showPromptModal('연락처 이름 변경', '새 이름을 입력하세요', currentName);
    if (!newName || newName.trim() === currentName) return;
    try {
        await db.collection('users').doc(currentUser.uid).collection('contacts').doc(contactDocId).update({ name: newName.trim() });
        showToast(t('social.contact_renamed','연락처 이름이 변경되었습니다'), 'success');
        loadContacts();
    } catch (error) { showToast('변경 실패: ' + error.message, 'error'); }
}

// ========== SOCIAL FEED FILTER ==========
function setSocialFilter(filter) {
    // Show feed wrapper, hide others
    const wrapper = document.getElementById('social-feed-wrapper');
    const explore = document.getElementById('explore-content');
    const notifContent = document.getElementById('social-notifications-content');
    const profileContent = document.getElementById('full-profile-content');
    if (wrapper) wrapper.style.display = 'block';
    if (explore) explore.style.display = 'none';
    if (notifContent) notifContent.style.display = 'none';
    if (profileContent) profileContent.style.display = 'none';

    // Update new tab bar
    document.querySelectorAll('.social-tab-item').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.social-tab-item[data-filter="${filter}"]`);
    if (btn) btn.classList.add('active');

    // Legacy support
    document.querySelectorAll('.social-filter-tab').forEach(b => {
        b.classList.remove('active');
        b.style.color = '#6B5744';
        b.style.borderBottomColor = 'transparent';
    });
    const legacyBtn = document.querySelector(`.social-filter-tab[data-filter="${filter}"]`);
    if (legacyBtn) {
        legacyBtn.classList.add('active');
        legacyBtn.style.color = 'var(--text)';
        legacyBtn.style.borderBottomColor = 'var(--text)';
    }
    window._currentSocialFilter = filter;
    loadSocialFeed();
}

// ========== DEEP LINK: #post={id} ==========
function handlePostDeepLink() {
    const hash = window.location.hash;
    const postMatch = hash.match(/post=([^&]+)/);
    const userMatch = hash.match(/user=([^&]+)/);
    if (postMatch) {
        const postId = postMatch[1];
        showPage('social');
        setTimeout(async () => {
            const el = document.querySelector(`[data-post-id="${postId}"]`);
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
            const doc = await db.collection('posts').doc(postId).get();
            if (doc.exists && doc.data().videoUrl) {
                _shortsVideoPosts = [{ id: postId, data: doc.data(), nickname: '' }];
                openShortsViewer(postId);
            }
        }, 1000);
    }
    if (userMatch) {
        const userId = userMatch[1];
        showPage('social');
        setTimeout(() => { if (typeof showFullProfile === 'function') showFullProfile(userId); }, 500);
    }
}
window.addEventListener('hashchange', handlePostDeepLink);
window.addEventListener('load', () => setTimeout(handlePostDeepLink, 2000));

// ===== Voice message player =====
let currentVoiceAudio = null;
function toggleVoicePlay(btn, url) {
    if (currentVoiceAudio && !currentVoiceAudio.paused) {
        currentVoiceAudio.pause();
        currentVoiceAudio = null;
        btn.textContent = '▶️';
        return;
    }
    const audio = new Audio(url);
    currentVoiceAudio = audio;
    btn.textContent = '⏸️';
    const progress = btn.parentElement.querySelector('.voice-progress');
    audio.ontimeupdate = () => { if (progress && audio.duration) progress.style.width = (audio.currentTime / audio.duration * 100) + '%'; };
    audio.onended = () => { btn.textContent = '▶️'; if (progress) progress.style.width = '0%'; currentVoiceAudio = null; };
    audio.play().catch(() => { btn.textContent = '▶️'; });
}

// ========== CHANNELS (BROADCAST) ==========
function showChannels() {
    document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('chats-view').style.display = 'none';
    document.getElementById('contacts-view').style.display = 'none';
    document.getElementById('channels-view').style.display = 'block';
    loadChannelList();
    if (window.lucide) lucide.createIcons();
}

async function loadChannelList() {
    const list = document.getElementById('channel-list');
    list.innerHTML = '<p style="padding:1rem;text-align:center;color:var(--accent);">로딩...</p>';
    try {
        const snap = await db.collection('channels').orderBy('createdAt', 'desc').limit(50).get();
        list.innerHTML = '';
        if (snap.empty) { list.innerHTML = '<p style="padding:1rem;text-align:center;color:var(--accent);">채널이 없습니다</p>'; return; }
        snap.forEach(doc => {
            const ch = doc.data();
            const isSub = (ch.subscribers || []).includes(currentUser?.uid);
            const el = document.createElement('div');
            el.className = 'chat-item';
            el.onclick = () => openChannel(doc.id);
            el.innerHTML = `
                <div style="width:44px;height:44px;border-radius:50%;background:#F7F3ED;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">📢</div>
                <div class="chat-preview" style="flex:1;min-width:0;">
                    <strong>${ch.name}</strong>
                    <p style="font-size:0.75rem;color:var(--accent);">${ch.subscribers?.length || 0} 구독자${isSub ? ' · ✅ 구독중' : ''}</p>
                </div>`;
            list.appendChild(el);
        });
    } catch (e) { list.innerHTML = `<p style="color:red;text-align:center;">${e.message}</p>`; }
}

async function showCreateChannelModal() {
    const name = await showPromptModal('📢 채널 만들기', '채널 이름을 입력하세요', '');
    if (!name?.trim()) return;
    const desc = await showPromptModal('📢 채널 설명', '채널 설명 (선택)', '');
    try {
        showLoading('채널 생성 중...');
        await db.collection('channels').add({
            name: name.trim(), description: desc || '', ownerId: currentUser.uid,
            subscribers: [currentUser.uid], createdAt: new Date()
        });
        hideLoading();
        showToast('✅ 채널 생성 완료', 'success');
        loadChannelList();
    } catch (e) { hideLoading(); showToast('생성 실패: ' + e.message, 'error'); }
}

async function openChannel(channelId) {
    if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
    if (chatDocUnsubscribe) { chatDocUnsubscribe(); chatDocUnsubscribe = null; }
    if (channelMsgUnsubscribe) { channelMsgUnsubscribe(); channelMsgUnsubscribe = null; }
    currentChat = null; currentChatOtherId = null;
    currentChannel = channelId;

    const container = document.getElementById('messenger-container');
    if (container) container.classList.add('chat-open');
    const messengerPage2 = document.getElementById('messenger');
    if (messengerPage2) messengerPage2.classList.add('chat-active');

    const chDoc = await db.collection('channels').doc(channelId).get();
    const ch = chDoc.data();
    const isOwner = ch.ownerId === currentUser.uid;
    const isSub = (ch.subscribers || []).includes(currentUser.uid);

    document.getElementById('chat-username').innerHTML = `
        <div style="display:flex;align-items:center;gap:0.5rem;">
            <div style="width:32px;height:32px;border-radius:50%;background:#F7F3ED;display:flex;align-items:center;justify-content:center;">📢</div>
            <div><strong>${ch.name}</strong><div style="font-size:0.7rem;color:var(--accent);">${ch.subscribers?.length || 0} 구독자</div></div>
            ${!isSub ? `<button onclick="subscribeChannel('${channelId}')" style="margin-left:0.5rem;padding:0.3rem 0.6rem;border:none;border-radius:6px;background:#3D2B1F;color:#FFF8F0;font-size:0.75rem;cursor:pointer;">구독</button>` :
                `<button onclick="unsubscribeChannel('${channelId}')" style="margin-left:0.5rem;padding:0.3rem 0.6rem;border:1px solid var(--border,#E8E0D8);border-radius:6px;background:var(--bg-card,#3D2B1F);font-size:0.75rem;cursor:pointer;">구독취소</button>`}
        </div>`;
    document.getElementById('chat-header-actions').style.display = 'flex';
    document.getElementById('chat-input-area').style.display = isOwner ? 'flex' : 'none';

    // Listen for channel messages
    channelMsgUnsubscribe = db.collection('channels').doc(channelId)
        .collection('messages').orderBy('timestamp')
        .onSnapshot(async (snapshot) => {
            const messagesDiv = document.getElementById('chat-messages');
            messagesDiv.innerHTML = '';
            if (snapshot.empty) {
                messagesDiv.innerHTML = `<p style="text-align:center;color:var(--accent);padding:2rem;">아직 메시지가 없습니다</p>`;
            }
            for (const doc of snapshot.docs) {
                const msg = doc.data();
                const timestamp = msg.timestamp?.toDate?.() || new Date();
                const el = document.createElement('div');
                el.style.cssText = 'margin-bottom:0.5rem;';
                let content = '';
                if (msg.mediaUrl && msg.type === 'image') content += `<img src="${msg.mediaUrl}" style="max-width:300px;border-radius:8px;display:block;margin-bottom:0.3rem;">`;
                if (msg.text) content += `<span>${msg.text}</span>`;
                el.innerHTML = `<div style="background:#F7F3ED;padding:0.6rem 0.8rem;border-radius:12px;word-break:break-word;font-size:0.9rem;line-height:1.4;">${content}</div>
                    <div style="font-size:0.7rem;color:var(--accent);margin-top:0.15rem;">${formatMsgTime(timestamp)}</div>`;
                messagesDiv.appendChild(el);
            }
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });

    // Override sendMessage for channel context
    const origInput = document.getElementById('message-input');
    origInput.dataset.channelMode = channelId;
}

async function subscribeChannel(channelId) {
    await db.collection('channels').doc(channelId).update({ subscribers: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
    showToast('✅ 구독 완료', 'success');
    openChannel(channelId);
}

async function unsubscribeChannel(channelId) {
    await db.collection('channels').doc(channelId).update({ subscribers: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) });
    showToast('구독 취소됨', 'info');
    openChannel(channelId);
}

// Channel message sending is handled within sendMessage by checking currentChannel

function showContactMenu(contactDocId, contactName) {
    document.querySelectorAll('.contact-menu-popup').forEach(el => el.remove());
    const menu = document.createElement('div');
    menu.className = 'contact-menu-popup';
    menu.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#FFF8F0;border:1px solid #E8E0D8;border-radius:12px;padding:0.5rem;box-shadow:0 4px 20px rgba(61,43,31,0.15);z-index:9999;min-width:160px;';
    menu.innerHTML = `
        <button onclick="deleteContact('${contactDocId}','${contactName.replace(/'/g,"\\'")}');this.closest('.contact-menu-popup').remove();" style="display:flex;align-items:center;gap:6px;width:100%;padding:0.6rem 0.8rem;background:none;border:none;cursor:pointer;border-radius:8px;font-size:0.85rem;color:#B54534;"><i data-lucide="trash-2" style="width:16px;height:16px;"></i> ${t('social.delete_contact','연락처 삭제')}</button>`;
    document.body.appendChild(menu);
    if (typeof lucide !== 'undefined') setTimeout(() => lucide.createIcons(), 50);
    setTimeout(() => {
        const dismiss = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', dismiss); } };
        document.addEventListener('click', dismiss);
    }, 10);
}

async function deleteContact(contactDocId, contactName) {
    if (!await showConfirmModal(t('social.delete_contact','연락처 삭제'), `"${contactName}" ${t('social.confirm_delete_contact','연락처를 삭제하시겠습니까?')}`)) return;
    try {
        await db.collection('users').doc(currentUser.uid).collection('contacts').doc(contactDocId).delete();
        showToast(t('social.contact_deleted','연락처가 삭제되었습니다'), 'success');
        loadContacts();
    } catch (error) { showToast(t('social.delete_fail','삭제 실패') + ': ' + error.message, 'error'); }
}

// ========== SOCIAL NOTIFICATIONS TAB ==========
async function showSocialNotifications() {
    const wrapper = document.getElementById('social-feed-wrapper');
    const explore = document.getElementById('explore-content');
    const profile = document.getElementById('full-profile-content');
    const notifContent = document.getElementById('social-notifications-content');
    if (wrapper) wrapper.style.display = 'none';
    if (explore) explore.style.display = 'none';
    if (profile) profile.style.display = 'none';
    if (notifContent) notifContent.style.display = 'block';

    // Update tab
    document.querySelectorAll('.social-filter-tab').forEach(b => {
        b.classList.remove('active');
        b.style.color = '#6B5744';
        b.style.borderBottomColor = 'transparent';
    });
    const btn = document.querySelector('.social-filter-tab[data-filter="notifications"]');
    if (btn) { btn.classList.add('active'); btn.style.color = 'var(--text)'; btn.style.borderBottomColor = 'var(--text)'; }

    notifContent.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--accent);">🔔 알림 로딩 중...</p>';

    try {
        const snap = await db.collection('social_notifications').doc(currentUser.uid).collection('items')
            .orderBy('createdAt', 'desc').limit(50).get();

        if (snap.empty) {
            notifContent.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--accent);"><p style="font-size:2rem;">🔔</p><p>아직 알림이 없습니다</p></div>';
            return;
        }

        let html = '<div style="display:flex;justify-content:flex-end;margin-bottom:0.5rem;"><button onclick="markAllSocialNotifsRead()" style="background:none;border:none;color:#3D2B1F;font-size:0.8rem;cursor:pointer;font-weight:600;">모두 읽음</button></div>';
        for (const doc of snap.docs) {
            const n = doc.data();
            const isRead = n.read;
            const info = n.fromUid ? await getUserDisplayInfo(n.fromUid) : { nickname: '시스템', photoURL: '' };
            const timeAgo = getTimeAgo(n.createdAt?.toDate?.() || new Date());
            const icons = { like: '❤️', comment: '💬', follow: '👤', mention: '📢', story_reply: '📸' };
            const icon = icons[n.notifType] || '🔔';

            html += `<div onclick="handleSocialNotifClick('${doc.id}','${n.notifType}','${n.targetId || ''}','${n.fromUid || ''}')" style="display:flex;gap:0.6rem;padding:0.7rem;border-bottom:1px solid rgba(0,0,0,0.04);cursor:pointer;background:${isRead ? 'white' : 'rgba(33,150,243,0.04)'};">
                ${avatarHTML(info.photoURL, info.nickname, 40)}
                <div style="flex:1;min-width:0;">
                    <div style="font-size:0.85rem;${isRead ? '' : 'font-weight:600;'}">${icon} ${n.message}</div>
                    <div style="font-size:0.7rem;color:var(--accent);margin-top:0.15rem;">${timeAgo}</div>
                </div>
                ${isRead ? '' : '<span style="width:8px;height:8px;border-radius:50%;background:#0095f6;flex-shrink:0;margin-top:0.3rem;"></span>'}
            </div>`;
        }
        notifContent.innerHTML = html;

        // Mark badge
        updateSocialNotifBadge();
    } catch (e) {
        notifContent.innerHTML = `<p style="text-align:center;color:red;">${e.message}</p>`;
    }
}

async function handleSocialNotifClick(docId, type, targetId, fromUid) {
    // Mark as read
    try {
        await db.collection('social_notifications').doc(currentUser.uid).collection('items').doc(docId).update({ read: true });
    } catch (e) {}

    if (type === 'follow' && fromUid) {
        showUserProfile(fromUid);
    } else if ((type === 'like' || type === 'comment' || type === 'mention') && targetId) {
        showExploreTab(false);
        setSocialFilter('all');
        setTimeout(() => {
            const el = document.querySelector(`[data-post-id="${targetId}"]`);
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.boxShadow = '0 0 0 3px #3D2B1F'; setTimeout(() => el.style.boxShadow = '', 3000); }
        }, 500);
    } else if (type === 'story_reply' && fromUid) {
        showPage('messenger');
    }
}

async function markAllSocialNotifsRead() {
    try {
        const snap = await db.collection('social_notifications').doc(currentUser.uid).collection('items')
            .where('read', '==', false).get();
        const batch = db.batch();
        snap.docs.forEach(doc => batch.update(doc.ref, { read: true }));
        await batch.commit();
        showSocialNotifications();
    } catch (e) {}
}

async function createSocialNotification(userId, notifType, message, data = {}) {
    if (!userId || userId === currentUser?.uid) return;
    try {
        await db.collection('social_notifications').doc(userId).collection('items').add({
            notifType,
            message,
            fromUid: currentUser.uid,
            targetId: data.targetId || '',
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            ...data
        });
    } catch (e) { console.warn('Social notif error:', e); }
}

async function updateSocialNotifBadge() {
    if (!currentUser) return;
    try {
        const snap = await db.collection('social_notifications').doc(currentUser.uid).collection('items')
            .where('read', '==', false).limit(50).get();
        const badge = document.getElementById('social-notif-badge');
        if (badge) {
            if (snap.size > 0) { badge.style.display = 'inline-block'; badge.textContent = snap.size > 99 ? '99+' : snap.size; }
            else badge.style.display = 'none';
        }
    } catch (e) {}
}

// ========== FULL PROFILE PAGE ==========
async function showFullProfile(uid) {
    uid = uid || currentUser?.uid;
    if (!uid) return;

    const wrapper = document.getElementById('social-feed-wrapper');
    const explore = document.getElementById('explore-content');
    const notifContent = document.getElementById('social-notifications-content');
    const profileContent = document.getElementById('full-profile-content');
    if (wrapper) wrapper.style.display = 'none';
    if (explore) explore.style.display = 'none';
    if (notifContent) notifContent.style.display = 'none';
    if (profileContent) profileContent.style.display = 'block';

    // Update tab
    document.querySelectorAll('.social-filter-tab').forEach(b => {
        b.classList.remove('active');
        b.style.color = '#6B5744';
        b.style.borderBottomColor = 'transparent';
    });
    const btn = document.querySelector('.social-filter-tab[data-filter="profile"]');
    if (btn) { btn.classList.add('active'); btn.style.color = 'var(--text)'; btn.style.borderBottomColor = 'var(--text)'; }

    profileContent.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--accent);">프로필 로딩 중...</p>';

    try {
        const info = await getUserDisplayInfo(uid);
        const followCounts = await getFollowCounts(uid);
        const postsSnap = await db.collection('posts').where('userId', '==', uid).orderBy('timestamp', 'desc').get();
        const isMe = uid === currentUser.uid;
        const amFollowing = isMe ? false : await isFollowing(uid);
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data() || {};

        let html = `
        <div class="insta-profile">
            <div class="insta-profile-top">
                ${info.photoURL ? `<img class="insta-profile-pic" src="${info.photoURL}">` : `<div class="insta-profile-pic-placeholder">${(info.nickname||"?").charAt(0).toUpperCase()}</div>`}
                <div class="insta-profile-stats">
                    <div class="insta-stat"><div class="insta-stat-num">${postsSnap.size}</div><div class="insta-stat-label">게시물</div></div>
                    <div class="insta-stat" onclick="showFollowList('${uid}','followers')"><div class="insta-stat-num">${followCounts.followers}</div><div class="insta-stat-label">팔로워</div></div>
                    <div class="insta-stat" onclick="showFollowList('${uid}','following')"><div class="insta-stat-num">${followCounts.following}</div><div class="insta-stat-label">팔로잉</div></div>
                </div>
            </div>
            <div class="insta-profile-name">${info.nickname}</div>
            ${info.statusMessage ? `<div class="insta-profile-bio">${info.statusMessage}</div>` : ""}
            ${userData.bio ? `<div class="insta-profile-bio">${userData.bio}</div>` : ""}
            <div class="insta-profile-actions">
                ${isMe ? `<button class="insta-btn-edit" onclick="showProfileEdit()">프로필 편집</button><button class="insta-btn-edit" onclick="copyShareURL('user','${uid}')">공유</button>` : `<button class="${amFollowing ? 'insta-btn-following' : 'insta-btn-follow'}" onclick="followUser('${uid}');showFullProfile('${uid}')">${amFollowing ? "팔로잉" : "팔로우"}</button><button class="insta-btn-edit" onclick="startChatFromProfile('${uid}')">메시지</button>`}
            </div>`;
        // Profile tabs (Instagram-style)
        html += `<div class="insta-profile-tabs">
            <button class="insta-profile-tab active" onclick="switchProfileTab('posts','${uid}')">📷</button>
            <button class="insta-profile-tab" onclick="switchProfileTab('shorts','${uid}')">🎬</button>
            <button class="insta-profile-tab" onclick="switchProfileTab('saved','${uid}')">🔖</button>
        </div>`;

        // Posts grid (Instagram 3-col)
        html += '<div id="profile-posts-grid" class="insta-grid">';
        const allPosts = postsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const regularPosts = allPosts.filter(p => !p.videoUrl);
        for (const post of regularPosts) {
            if (post.imageUrl) {
                html += `<div class="insta-grid-item" onclick="scrollToPostOrOpen('${post.id}')"><img src="${post.imageUrl}" loading="lazy"></div>`;
            } else {
                html += `<div class="insta-grid-item" onclick="scrollToPostOrOpen('${post.id}')"><div style="width:100%;height:100%;background:linear-gradient(135deg,#8B6914,#6B5744);display:flex;align-items:center;justify-content:center;padding:0.5rem;"><span style="color:#FFF8F0;font-size:0.7rem;text-align:center;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;">${(post.text || '').substring(0, 60)}</span></div></div>`;
            }
        }
        html += '</div>';

        html += '</div>'; // close insta-profile
        profileContent.innerHTML = html;
    } catch (e) {
        profileContent.innerHTML = `<p style="color:red;text-align:center;">${e.message}</p>`;
    }
}

async function switchProfileTab(tab, uid) {
    document.querySelectorAll('.profile-tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');

    const grid = document.getElementById('profile-posts-grid');
    if (!grid) return;
    grid.innerHTML = '<p style="text-align:center;padding:1rem;color:var(--accent);">로딩...</p>';

    try {
        if (tab === 'posts') {
            const snap = await db.collection('posts').where('userId', '==', uid).orderBy('timestamp', 'desc').get();
            const posts = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.videoUrl);
            grid.innerHTML = '';
            grid.className = 'insta-grid';
            for (const post of posts) {
                if (post.imageUrl) {
                    grid.innerHTML += `<div class="insta-grid-item" onclick="scrollToPostOrOpen('${post.id}')"><img src="${post.imageUrl}" loading="lazy"></div>`;
                } else {
                    grid.innerHTML += `<div class="insta-grid-item" onclick="scrollToPostOrOpen('${post.id}')"><div style="width:100%;height:100%;background:linear-gradient(135deg,#8B6914,#6B5744);display:flex;align-items:center;justify-content:center;padding:0.5rem;"><span style="color:#FFF8F0;font-size:0.7rem;">${(post.text || '').substring(0, 60)}</span></div></div>`;
                }
            }
            if (posts.length === 0) grid.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--accent);">게시물이 없습니다</p>';
        } else if (tab === 'shorts') {
            const snap = await db.collection('posts').where('userId', '==', uid).orderBy('timestamp', 'desc').get();
            const videos = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.videoUrl);
            grid.innerHTML = '';
            grid.className = 'insta-grid';
            for (const post of videos) {
                grid.innerHTML += `<div class="insta-grid-item" onclick="openShortsViewer('${post.id}')"><video src="${post.videoUrl}" muted preload="metadata" style="width:100%;height:100%;object-fit:cover;"></video><span style="position:absolute;top:4px;right:4px;color:#FFF8F0;font-size:0.8rem;text-shadow:0 1px 3px rgba(61,43,31,0.8);">🎬</span></div>`;
            }
            if (videos.length === 0) grid.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--accent);">숏폼이 없습니다</p>';
        } else if (tab === 'saved') {
            const savedSnap = await db.collection('users').doc(uid).collection('savedPosts').orderBy('savedAt', 'desc').get();
            grid.innerHTML = '';
            grid.className = 'insta-grid';
            for (const doc of savedSnap.docs) {
                const postDoc = await db.collection('posts').doc(doc.id).get();
                if (!postDoc.exists) continue;
                const post = postDoc.data();
                if (post.imageUrl) {
                    grid.innerHTML += `<div class="insta-grid-item" onclick="scrollToPostOrOpen('${doc.id}')"><img src="${post.imageUrl}" loading="lazy"></div>`;
                } else if (post.videoUrl) {
                    grid.innerHTML += `<div class="insta-grid-item" onclick="openShortsViewer('${doc.id}')"><video src="${post.videoUrl}" muted preload="metadata" style="width:100%;height:100%;object-fit:cover;"></video></div>`;
                } else {
                    grid.innerHTML += `<div class="insta-grid-item"><div style="width:100%;height:100%;background:var(--bg-card-alt,#F7F3ED);display:flex;align-items:center;justify-content:center;"><span style="font-size:0.7rem;">${(post.text || '').substring(0, 40)}</span></div></div>`;
                }
            }
            if (savedSnap.empty) grid.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--accent);">저장된 게시물이 없습니다</p>';
        }
    } catch (e) {
        grid.innerHTML = `<p style="color:red;">${e.message}</p>`;
    }
}

async function showFollowList(uid, type) {
    try {
        const snap = await db.collection('users').doc(uid).collection(type === 'followers' ? 'followers' : 'following').get();
        if (snap.empty) { showToast('목록이 비어있습니다', 'info'); return; }

        let html = '';
        for (const doc of snap.docs) {
            const info = await getUserDisplayInfo(doc.id);
            const amFollowingThis = currentUser ? await isFollowing(doc.id) : false;
            html += `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0;border-bottom:1px solid var(--border,#E8E0D8);">
                <div onclick="showFullProfile('${doc.id}')" style="cursor:pointer;">${avatarHTML(info.photoURL, info.nickname, 36)}</div>
                <span style="flex:1;font-size:0.9rem;font-weight:600;cursor:pointer;" onclick="showFullProfile('${doc.id}')">${info.nickname}</span>
                ${doc.id !== currentUser?.uid ? `<button onclick="followUser('${doc.id}');this.textContent='${amFollowingThis ? '팔로우' : '팔로잉 ✓'}'" style="padding:0.3rem 0.6rem;border:${amFollowingThis ? 'none' : '1px solid #E8E0D8'};border-radius:6px;background:${amFollowingThis ? '#0095f6' : 'white'};color:${amFollowingThis ? 'white' : 'var(--text)'};font-size:0.8rem;cursor:pointer;">${amFollowingThis ? '팔로잉' : '팔로우'}</button>` : ''}
            </div>`;
        }

        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        modal.innerHTML = `<div style="background:var(--bg-card,#3D2B1F);padding:1.2rem;border-radius:16px;max-width:380px;width:100%;max-height:70vh;overflow-y:auto;">
            <h4 style="margin-bottom:0.8rem;">${type === 'followers' ? '팔로워' : '팔로잉'} ${snap.size}명</h4>
            ${html}
            <button onclick="this.parentElement.parentElement.remove()" style="width:100%;margin-top:0.8rem;padding:0.6rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;background:var(--bg-card,#3D2B1F);cursor:pointer;">닫기</button>
        </div>`;
        document.body.appendChild(modal);
    } catch (e) { showToast('목록 로드 실패', 'error'); }
}

// ========== DOUBLE-TAP LIKE ==========
let _lastTapTime = 0;
let _lastTapPostId = null;

function handlePostDoubleTap(postId, mediaEl) {
    const now = Date.now();
    if (_lastTapPostId === postId && now - _lastTapTime < 300) {
        // Double tap - like!
        doubleTapLike(postId, mediaEl);
        _lastTapTime = 0;
        _lastTapPostId = null;
    } else {
        _lastTapTime = now;
        _lastTapPostId = postId;
    }
}

async function doubleTapLike(postId, container) {
    // Show heart animation
    if (container) {
        const heart = document.createElement('div');
        heart.className = 'double-tap-heart';
        heart.textContent = '❤️';
        container.style.position = 'relative';
        container.appendChild(heart);
        setTimeout(() => heart.remove(), 900);
    }
    // Like the post if not already liked
    const postRef = db.collection('posts').doc(postId);
    const post = await postRef.get();
    const data = post.data();
    if (data.likedBy && data.likedBy.includes(currentUser.uid)) return;
    let likedBy = data.likedBy || [];
    likedBy.push(currentUser.uid);
    await postRef.update({ likedBy, likes: (data.likes || 0) + 1 });

    // Notification
    if (data.userId !== currentUser.uid) {
        const myInfo = await getUserDisplayInfo(currentUser.uid);
        await createSocialNotification(data.userId, 'like', `${myInfo.nickname}님이 게시물을 좋아합니다`, { targetId: postId });
    }
    loadSocialFeed();
}

// ========== NESTED COMMENTS (REPLIES) ==========
async function loadCommentsWithReplies(postId) {
    const list = document.getElementById(`comment-list-${postId}`);
    if (!list) return;
    list.innerHTML = '';

    const comments = await db.collection('posts').doc(postId).collection('comments')
        .orderBy('timestamp', 'asc').get();
    if (comments.empty) { list.innerHTML = `<p style="text-align:center;color:var(--accent);font-size:0.8rem;">${t('social.first_comment','첫 댓글을 남겨보세요!')}</p>`; return; }

    const topLevel = [];
    const replies = {};
    comments.docs.forEach(doc => {
        const c = { id: doc.id, ...doc.data() };
        if (c.parentId) {
            if (!replies[c.parentId]) replies[c.parentId] = [];
            replies[c.parentId].push(c);
        } else {
            topLevel.push(c);
        }
    });

    for (const c of topLevel) {
        const info = await getUserDisplayInfo(c.userId);
        const el = document.createElement('div');
        el.style.cssText = 'margin-bottom:0.5rem;font-size:0.85rem;line-height:1.4;';
        el.innerHTML = `
            <div style="display:flex;align-items:flex-start;gap:0.4rem;">
                <div onclick="showUserProfile('${c.userId}')" style="cursor:pointer;flex-shrink:0;">${avatarHTML(info.photoURL, info.nickname, 24)}</div>
                <div style="flex:1;">
                    <strong style="cursor:pointer;" onclick="showUserProfile('${c.userId}')">${info.nickname}</strong>
                    ${truncateWalletAddresses(c.text)}
                    <div style="font-size:0.7rem;color:var(--accent);margin-top:0.1rem;">
                        ${getTimeAgo(c.timestamp?.toDate?.() || new Date())}
                        <button onclick="showReplyInput('${postId}','${c.id}')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:0.7rem;font-weight:600;">답글</button>
                    </div>
                </div>
            </div>`;

        // Replies
        if (replies[c.id]) {
            for (const r of replies[c.id]) {
                const rInfo = await getUserDisplayInfo(r.userId);
                const rEl = document.createElement('div');
                rEl.className = 'reply-comment';
                rEl.style.cssText = 'margin-top:0.3rem;font-size:0.82rem;';
                rEl.innerHTML = `<div style="display:flex;align-items:flex-start;gap:0.4rem;">
                    <div onclick="showUserProfile('${r.userId}')" style="cursor:pointer;flex-shrink:0;">${avatarHTML(rInfo.photoURL, rInfo.nickname, 20)}</div>
                    <div><strong onclick="showUserProfile('${r.userId}')" style="cursor:pointer;">${rInfo.nickname}</strong> ${truncateWalletAddresses(r.text)}
                    <div style="font-size:0.65rem;color:var(--accent);">${getTimeAgo(r.timestamp?.toDate?.() || new Date())}</div></div>
                </div>`;
                el.appendChild(rEl);
            }
        }

        // Reply input (hidden)
        const replyDiv = document.createElement('div');
        replyDiv.id = `reply-input-${postId}-${c.id}`;
        replyDiv.style.cssText = 'display:none;margin-left:2rem;margin-top:0.3rem;';
        replyDiv.innerHTML = `<div style="display:flex;gap:0.4rem;align-items:center;">
            <input type="text" placeholder="답글..." style="flex:1;padding:0.3rem 0.6rem;border:none;border-bottom:1px solid var(--border);font-size:0.8rem;outline:none;" onkeypress="if(event.key==='Enter')addReply('${postId}','${c.id}',this)">
            <button onclick="addReply('${postId}','${c.id}',this.previousElementSibling)" style="background:none;border:none;color:#3D2B1F;font-weight:700;cursor:pointer;font-size:0.8rem;">게시</button>
        </div>`;
        el.appendChild(replyDiv);

        list.appendChild(el);
    }
}

function showReplyInput(postId, commentId) {
    const el = document.getElementById(`reply-input-${postId}-${commentId}`);
    if (el) { el.style.display = el.style.display === 'none' ? 'block' : 'none'; el.querySelector('input')?.focus(); }
}

async function addReply(postId, parentId, input) {
    const text = input.value.trim();
    if (!text) return;
    await db.collection('posts').doc(postId).collection('comments').add({
        userId: currentUser.uid, text, parentId, timestamp: new Date()
    });
    const postRef = db.collection('posts').doc(postId);
    const post = await postRef.get();
    await postRef.update({ commentCount: (post.data().commentCount || 0) + 1 });
    input.value = '';
    loadCommentsWithReplies(postId);
}

// ========== WEB SHARE API ==========
async function sharePostWebAPI(postId) {
    const post = await db.collection('posts').doc(postId).get();
    const data = post.data();
    const url = generateShareURL('post', postId);

    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Crowny 게시물',
                text: data.text ? data.text.substring(0, 100) : '게시물을 확인하세요!',
                url
            });
        } catch (e) { /* user cancelled */ }
    } else {
        await copyShareURL('post', postId);
    }
    // Increment share count
    await db.collection('posts').doc(postId).update({
        shareCount: firebase.firestore.FieldValue.increment(1)
    });
}

// ========== LOCATION TAG ==========
// Added to post creation (location field in create post area)

// ========== INIT SOCIAL ENHANCEMENTS ==========
function initSocialEnhancements() {
    // Init stories
    if (typeof initStories === 'function') initStories();
    // Update social notif badge
    updateSocialNotifBadge();
    setInterval(updateSocialNotifBadge, 60000);
}

// Auto-init when social page loads
const _origLoadUserData = window.loadUserData;
if (_origLoadUserData) {
    window.loadUserData = async function() {
        await _origLoadUserData();
        initSocialEnhancements();
    };
}

// ========== POST MENU (Bottom Sheet) ==========
function showPostMenu(postId, isMyPost) {
    // Remove existing
    document.querySelectorAll('.bottom-sheet-overlay,.bottom-sheet').forEach(el => el.remove());
    
    const overlay = document.createElement('div');
    overlay.className = 'bottom-sheet-overlay active';
    overlay.onclick = () => closeBottomSheet();
    
    const sheet = document.createElement('div');
    sheet.className = 'bottom-sheet active';
    
    let menuItems = '';
    if (isMyPost) {
        menuItems += `<button onclick="editPost('${postId}');closeBottomSheet();" style="width:100%;padding:14px;border:none;background:none;color:var(--dark-text,#3D2B1F);font-size:0.95rem;cursor:pointer;text-align:left;">✏️ 수정</button>`;
        menuItems += `<button onclick="deletePost('${postId}');closeBottomSheet();" style="width:100%;padding:14px;border:none;background:none;color:#B54534;font-size:0.95rem;font-weight:600;cursor:pointer;text-align:left;">🗑️ 삭제</button>`;
    }
    menuItems += `<button onclick="copyShareURL('post','${postId}');closeBottomSheet();" style="width:100%;padding:14px;border:none;background:none;color:var(--dark-text,#3D2B1F);font-size:0.95rem;cursor:pointer;text-align:left;">🔗 링크 복사</button>`;
    menuItems += `<button onclick="repostPost('${postId}');closeBottomSheet();" style="width:100%;padding:14px;border:none;background:none;color:var(--dark-text,#3D2B1F);font-size:0.95rem;cursor:pointer;text-align:left;"><i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 리포스트</button>`;
    menuItems += `<button onclick="closeBottomSheet();" style="width:100%;padding:14px;border:none;background:none;color:var(--dark-muted,#6B5744);font-size:0.95rem;cursor:pointer;text-align:left;">취소</button>`;
    
    sheet.innerHTML = `
        <div class="bottom-sheet-handle"></div>
        <div style="padding:8px 0;">${menuItems}</div>`;
    
    document.body.appendChild(overlay);
    document.body.appendChild(sheet);
}

function closeBottomSheet() {
    document.querySelectorAll('.bottom-sheet-overlay,.bottom-sheet').forEach(el => {
        el.classList.remove('active');
        setTimeout(() => el.remove(), 300);
    });
}
