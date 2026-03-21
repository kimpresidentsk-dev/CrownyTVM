// ===== social.js - 유저데이터, 레퍼럴, 메신저, 소셜피드 (v17.0 - CrownyTVM Independent Mode) =====

// Truncate wallet addresses (0x...) in text
function truncateWalletAddresses(text) {
    if (!text) return text;
    return text.replace(/0x[a-fA-F0-9]{30,}/g, (addr) => addr.slice(0, 6) + '...' + addr.slice(-4));
}

// ========== AUTH HEADERS ==========
function _authHeaders() {
    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}

function getCtvmToken() {
    return localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token') || '';
}

function ctvmHeaders() {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getCtvmToken() };
}

// ========== USER PROFILE MANAGEMENT ==========
async function loadUserData() {
    if (!currentUser) return;
    updatePresence(true);
    startPresenceHeartbeat();
    loadMessages();
    loadSocialFeed();
    loadReferralInfo();
    if (typeof AI_SOCIAL !== 'undefined') {
        AI_SOCIAL.init().then(() => AI_SOCIAL.watchBotPostComments()).catch(e => console.warn('[AI-Social] init:', e));
    }
}

// ========== ONLINE PRESENCE ==========
let presenceInterval = null;

async function updatePresence(isOnline) {
    // Server handles presence via session; no-op on client
}

function startPresenceHeartbeat() {
    if (presenceInterval) clearInterval(presenceInterval);
    // No-op: server tracks presence via API calls
}

// Get user display info (nickname + photo)
async function getUserDisplayInfo(uid) {
    if (currentUser && currentUser.uid === uid) {
        return { nickname: currentUser.displayName || uid, photoURL: currentUser.photoURL || '', email: currentUser.email || '', isOnline: true, lastSeen: null };
    }
    try {
        const r = await fetch('/api/users/info?username=' + encodeURIComponent(uid), { headers: ctvmHeaders() });
        const info = await r.json();
        if (info && !info.error) {
            return { nickname: info.displayName || uid, photoURL: info.photoURL || '', email: info.email || '', statusMessage: info.statusMessage || '', isOnline: false, lastSeen: null };
        }
    } catch(e) { console.warn(e.message); }
    return { nickname: uid, photoURL: '', email: '', isOnline: false, lastSeen: null };
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
    let data = {};
    try {
        const r = await fetch('/api/profile', { headers: ctvmHeaders() });
        const profile = await r.json();
        data = { nickname: profile.displayName || profile.username, email: profile.email || '', photoURL: profile.photoURL || '', statusMessage: profile.statusMessage || '' };
    } catch(e) { data = { nickname: currentUser.displayName || '', email: currentUser.email || '' }; }

    const overlay = document.createElement('div');
    overlay.id = 'profile-edit-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
    <div style="background:var(--bg-card,#3D2B1F);padding:1.5rem;border-radius:16px;max-width:420px;width:100%;">
        <h3 style="margin-bottom:1rem;"><i data-lucide="pencil" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;"></i>${t('social.edit_profile','Edit Profile')}</h3>
        <div style="text-align:center; margin-bottom:1rem;">
            <div id="profile-preview-avatar" style="display:inline-block;">${avatarHTML(data.photoURL, data.nickname, 80)}</div>
            <div style="margin-top:0.5rem;">
                <label for="profile-photo-input" style="color:#3D2B1F; cursor:pointer; font-size:0.85rem; font-weight:600;"><i data-lucide="camera" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('social.change_photo','Change Photo')}</label>
                <input type="file" id="profile-photo-input" accept="image/*" style="display:none;" onchange="previewProfilePhoto(this)">
            </div>
        </div>
        <div style="display:grid; gap:0.8rem;">
            <div>
                <label style="font-size:0.8rem; color:var(--text-muted,#6B5744);">${t('auth.nickname_title','Nickname')}</label>
                <input type="text" id="profile-edit-nickname" value="${data.nickname || ''}" placeholder="${t('auth.nickname_title','Nickname')}" style="width:100%;padding:0.7rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
            </div>
            <div>
                <label style="font-size:0.8rem; color:var(--text-muted,#6B5744);">${t('social.status_msg','Status Message')}</label>
                <input type="text" id="profile-edit-status" value="${data.statusMessage || ''}" placeholder="${t('social.status_msg','Status Message')}" maxlength="50" style="width:100%;padding:0.7rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
            </div>
            <p style="font-size:0.75rem; color:var(--text-muted,#6B5744);">${t('auth.email','Email')}: ${data.email}</p>
            <div style="margin-top:0.8rem; padding-top:0.8rem; border-top:1px solid #E8E0D8; display:grid; gap:0.5rem;">
                <p style="font-size:0.8rem; font-weight:600; color:var(--text,#3D2B1F); margin-bottom:0.2rem;"><i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('social.login_method','Login Method')}</p>
                <p style="font-size:0.75rem; color:#5B7B8C;"><i data-lucide="check-circle" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('social.pw_login_set','CrownyTVM Account')}</p>
                <button onclick="changePasswordFromProfile()" style="width:100%;padding:0.7rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;cursor:pointer;background:var(--bg-card,#3D2B1F);font-size:0.85rem;"><i data-lucide="key" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('auth.change_pw','Change Password')}</button>
            </div>
        </div>
        <div style="display:flex;gap:0.5rem;margin-top:1rem;">
            <button onclick="document.getElementById('profile-edit-modal').remove()" style="flex:1;padding:0.7rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;cursor:pointer;background:var(--bg-card,#3D2B1F);">${t('common.cancel','Cancel')}</button>
            <button onclick="saveProfile()" style="flex:1;padding:0.7rem;border:none;border-radius:8px;cursor:pointer;background:var(--gold,#8B6914);color:#3D2B1F;font-weight:700;">${t('common.save','Save')}</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [overlay] });
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

    if (!nickname) { showToast(t('social.enter_nickname','Please enter a nickname'), 'warning'); return; }

    try {
        showLoading(t('social.saving_profile','Saving profile...'));
        const patchBody = { displayName: nickname, statusMessage };

        if (photoInput.files[0]) {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(photoInput.files[0]);
            });
            patchBody.photoURL = base64;
        }

        const r = await fetch('/api/profile', {
            method: 'PATCH',
            headers: ctvmHeaders(),
            body: JSON.stringify(patchBody)
        });
        const result = await r.json();
        if (result.error) throw new Error(result.error);

        if (currentUser) {
            currentUser.displayName = nickname;
            if (result.photoURL) currentUser.photoURL = result.photoURL;
        }

        hideLoading();
        showToast(t('social.profile_saved','<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Profile saved!'), 'success');
        document.getElementById('profile-edit-modal')?.remove();

        const userInfoEl = document.getElementById('user-email');
        if (userInfoEl) userInfoEl.textContent = nickname;
    } catch (e) {
        hideLoading();
        showToast(t('social.save_fail','Save failed: ') + e.message, 'error');
    }
}

// Referral system — no-op stubs (server-side wallet handles rewards differently)
async function loadReferralRewardDesc() { /* no-op in independent mode */ }
async function loadReferralInfo() { /* no-op in independent mode */ }
async function editReferralNickname() { showToast(t('social.coming_soon','Coming soon'), 'info'); }
async function copyReferralCode() {
    const codeEl = document.getElementById('my-referral-code');
    const code = codeEl?.textContent;
    if (!code || code === t('social.not_generated','Not generated')) { showToast(t('social.generate_first','Please generate a referral code first'), 'warning'); return; }
    try {
        await navigator.clipboard.writeText(code);
        showToast(`<i data-lucide="clipboard" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> ${t('social.code_copied','Referral code copied')}: ${code}`, 'success');
    } catch (e) {
        await showPromptModal(t('auth.referral_title','Referral Code'), t('social.copy_code','Copy the referral code'), code);
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

// ===== Contact Add Modal =====
async function showAddContactModal() {
    const overlay = document.createElement('div');
    overlay.id = 'add-contact-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
    <div style="background:var(--bg-card,#3D2B1F);padding:1.5rem;border-radius:16px;max-width:420px;width:100%;">
        <h3 style="margin-bottom:1rem;"><i data-lucide="plus" style="width:18px;height:18px;display:inline-block;vertical-align:middle;margin-right:6px;"></i>${t('social.add_contact','Add Contact')}</h3>
        <div style="display:flex;gap:0.5rem;margin-bottom:0.8rem;">
            <input type="text" id="contact-search-input" placeholder="${t('social.search_email_nick','Search by email or nickname')}" style="flex:1;padding:0.7rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;font-size:0.9rem;">
            <button onclick="searchContactUsers()" style="padding:0.7rem 1rem;border:none;border-radius:8px;background:var(--gold,#8B6914);color:#3D2B1F;font-weight:600;cursor:pointer;">${t('social.search','Search')}</button>
        </div>
        <div id="contact-search-results" style="max-height:300px;overflow-y:auto;"></div>
        <div style="margin-top:1rem;text-align:right;">
            <button onclick="document.getElementById('add-contact-modal').remove()" style="padding:0.5rem 1rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;cursor:pointer;background:var(--bg-card,#3D2B1F);">${t('common.cancel','Cancel')}</button>
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
    if (!query) { resultsDiv.innerHTML = `<p style="text-align:center;color:var(--text-muted,#6B5744);font-size:0.85rem;">${t('social.enter_search','Please enter a search term')}</p>`; return; }

    resultsDiv.innerHTML = `<p style="text-align:center;color:var(--accent);"><i data-lucide="search"></i> ${t('common.searching','Searching...')}</p>`;

    try {
        const r = await fetch('/api/users/search?q=' + encodeURIComponent(query), { headers: ctvmHeaders() });
        const results = await r.json();

        resultsDiv.innerHTML = '';
        if (!results || results.length === 0) {
            resultsDiv.innerHTML = `<p style="text-align:center;color:var(--text-muted,#6B5744);font-size:0.85rem;">${t('social.no_results','No results found')}</p>`;
            return;
        }

        for (const user of results) {
            if (user.username === currentUser.uid) continue;
            const nick = user.displayName || user.username;
            const el = document.createElement('div');
            el.style.cssText = 'display:flex;align-items:center;gap:0.8rem;padding:0.7rem;border-bottom:1px solid var(--border,#E8E0D8);';
            el.innerHTML = `
                ${avatarHTML(user.photoURL, nick, 40)}
                <div style="flex:1;min-width:0;">
                    <strong style="font-size:0.9rem;">${nick}</strong>
                    <p style="font-size:0.75rem;color:var(--text-muted,#6B5744);margin:0;">${user.email || ''}</p>
                </div>
                <button onclick="addContactFromSearch('${user.username}','${(user.email||'').replace(/'/g,"\\'")}','${nick.replace(/'/g,"\\'")}')" style="padding:0.4rem 0.8rem;border:none;border-radius:6px;background:var(--gold,#8B6914);color:#3D2B1F;font-size:0.8rem;cursor:pointer;">${t('social.add','Add')}</button>`;
            resultsDiv.appendChild(el);
        }
        if(window.lucide) lucide.createIcons();
    } catch (e) {
        resultsDiv.innerHTML = `<p style="color:red;text-align:center;">${e.message}</p>`;
    }
}

async function addContactFromSearch(uid, email, name) {
    try {
        const r = await fetch('/api/contacts', {
            method: 'POST',
            headers: ctvmHeaders(),
            body: JSON.stringify({ email, name, crownyUsername: uid })
        });
        const data = await r.json();
        if (data.error) throw new Error(data.error);
        showToast(t('social.contact_added','<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Added to contacts'), 'success');
        document.getElementById('add-contact-modal')?.remove();
        loadContacts();
    } catch (e) {
        showToast(t('social.add_fail','Add failed: ') + e.message, 'error');
    }
}

async function loadContacts() {
    const contactList = document.getElementById('contact-list');
    if (!contactList) return;
    contactList.innerHTML = '<p style="padding:1rem; text-align:center; color:var(--accent);">' + t('messenger.loading','Loading...') + '</p>';

    let contacts = [];
    try {
        const r = await fetch('/api/contacts', { headers: ctvmHeaders() });
        contacts = await r.json();
        if (!Array.isArray(contacts)) contacts = [];
    } catch(e) { contacts = []; }

    contactList.innerHTML = '';
    if (contacts.length === 0) {
        contactList.innerHTML = `
            <div style="text-align:center; padding:2rem; color:var(--accent);">
                <div style="margin-bottom:0.8rem;"><i data-lucide="users" style="width:40px;height:40px;display:block;margin:0 auto;"></i></div>
                <p style="font-size:0.95rem; margin-bottom:0.5rem;">${t('social.no_contacts','No contacts')}</p>
                <button onclick="showAddContactModal()" class="btn-primary" style="padding:0.5rem 1rem; font-size:0.85rem;"><i data-lucide="plus" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('social.add_contact_btn','Add Contact')}</button>
            </div>`;
        if(window.lucide) lucide.createIcons();
        return;
    }

    const groups = {};
    contacts.forEach(c => {
        const g = c.group || (c.isUser ? t('social.contact_internal','Member') : t('social.contact_external','External'));
        if (!groups[g]) groups[g] = [];
        groups[g].push(c);
    });

    Object.entries(groups).forEach(([groupName, members]) => {
        const header = document.createElement('div');
        header.style.cssText = 'padding:8px 14px;font-size:0.75rem;font-weight:700;color:#7A5C47;text-transform:uppercase;background:#F7F3ED;';
        header.textContent = groupName + ' (' + members.length + ')';
        contactList.appendChild(header);

        members.forEach(c => {
            const name = c.name || c.crownyUsername || '?';
            const initial = (name[0] || '?').toUpperCase();
            const sub = c.phone || c.email || c.crownyUsername || '';
            const contactItem = document.createElement('div');
            contactItem.className = 'contact-item';
            contactItem.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid #F0E8DC;';
            contactItem.onclick = () => showContactDetail(c);
            contactItem.innerHTML = `
                <div style="width:40px;height:40px;border-radius:50%;background:#3D2B1F;color:#FFF8F0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.95rem;flex-shrink:0;">${initial}</div>
                <div style="flex:1;min-width:0;overflow:hidden;">
                    <div style="font-size:0.95rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</div>
                    <div style="font-size:0.8rem;color:#7A5C47;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sub}</div>
                </div>
                ${c.isUser ? '<i data-lucide="badge-check" style="width:16px;height:16px;color:#5B7B8C;flex-shrink:0;"></i>' : ''}`;
            contactList.appendChild(contactItem);
        });
    });
    if(window.lucide) lucide.createIcons();
}

function showContactDetail(contact) {
    let existing = document.getElementById('contact-detail-modal');
    if (existing) existing.remove();

    const name = contact.name || '?';
    const modal = document.createElement('div');
    modal.id = 'contact-detail-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.7);z-index:99998;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.onclick = e => { if (e.target === modal) modal.remove(); };

    const fields = [
        { icon: 'phone', label: t('social.phone','Phone'), value: contact.phone },
        { icon: 'mail', label: t('social.email','Email'), value: contact.email },
        { icon: 'building-2', label: t('social.company','Company'), value: contact.company },
        { icon: 'briefcase', label: t('social.position','Position'), value: contact.position },
        { icon: 'map-pin', label: t('social.address','Address'), value: contact.address },
        { icon: 'cake', label: t('social.birthday','Birthday'), value: contact.birthday },
        { icon: 'tag', label: t('social.group','Group'), value: contact.group },
        { icon: 'sticky-note', label: t('social.notes','Notes'), value: contact.notes },
    ].filter(f => f.value);

    modal.innerHTML = `
    <div style="background:var(--card,#F7F3ED);padding:1.5rem;border-radius:16px;max-width:400px;width:100%;color:var(--text,#3D2B1F);">
        <div style="text-align:center;margin-bottom:1rem;">
            <div style="width:64px;height:64px;border-radius:50%;background:#3D2B1F;color:#FFF8F0;display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;margin:0 auto 8px;">${(name[0] || '?').toUpperCase()}</div>
            <h3 style="margin:0;font-size:1.1rem;">${name}</h3>
            ${contact.isUser ? '<span style="font-size:0.75rem;color:#5B7B8C;">Crowny ' + t('social.contact_internal','Member') + '</span>' : '<span style="font-size:0.75rem;color:#7A5C47;">' + t('social.contact_external','External') + '</span>'}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:1rem;">
            ${fields.map(f => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #F0E8DC;">
                <i data-lucide="${f.icon}" style="width:16px;height:16px;color:#7A5C47;flex-shrink:0;"></i>
                <div><div style="font-size:0.7rem;color:#7A5C47;">${f.label}</div><div style="font-size:0.9rem;">${f.value}</div></div>
            </div>`).join('')}
        </div>
        <div style="display:flex;gap:8px;">
            ${contact.crownyUsername ? `<button onclick="chatNewDmWith('${contact.crownyUsername}');document.getElementById('contact-detail-modal').remove();" style="flex:1;padding:0.5rem;border:none;border-radius:8px;background:#3D2B1F;color:#FFF8F0;cursor:pointer;font-weight:600;"><i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('social.chat','Chat')}</button>` : ''}
            <button onclick="deleteContactIndependent(${contact.id})" style="flex:1;padding:0.5rem;border:1px solid #c0392b;border-radius:8px;background:none;color:#c0392b;cursor:pointer;font-weight:600;"><i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('social.delete','Delete')}</button>
            <button onclick="document.getElementById('contact-detail-modal').remove()" style="flex:1;padding:0.5rem;border:1px solid #E8E0D8;border-radius:8px;background:none;cursor:pointer;">${t('common.close','Close')}</button>
        </div>
    </div>`;
    document.body.appendChild(modal);
    if (window.lucide) lucide.createIcons({ nodes: [modal] });
}

async function deleteContactIndependent(contactId) {
    const detailModal = document.getElementById('contact-detail-modal');
    if (detailModal) detailModal.remove();

    if (!await showConfirmModal(t('social.delete_contact','Delete Contact'), t('social.confirm_delete_contact','Are you sure you want to delete this contact?'))) return;
    try {
        const r = await fetch('/api/contacts/' + contactId, {
            method: 'DELETE',
            headers: ctvmHeaders()
        });
        const data = await r.json();
        if (data.error) throw new Error(data.error);
        showToast(t('social.contact_deleted','Contact deleted'), 'success');
        loadContacts();
    } catch(e) {
        showToast(t('social.delete_fail','Delete failed') + ': ' + e.message, 'error');
    }
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
        showToast(t('social.chat_fail','Failed to start chat'), 'error');
    }
}

async function showNewChatModal() {
    const email = await showPromptModal(t('social.new_chat','New Chat'), t('social.chat_email','Enter user email to chat with'), '');
    if (!email) return;
    startNewChat(email);
}

async function startNewChat(otherEmail) {
    try {
        if (otherEmail === currentUser.email) { showToast(t('social.no_self_chat','You cannot chat with yourself'), 'warning'); return; }
        // Use server API to create chat
        const otherUsername = otherEmail.replace(/@crowny\.org$/, '');
        const r = await fetch('/api/chat/create', {
            method: 'POST',
            headers: ctvmHeaders(),
            body: JSON.stringify({ otherUser: otherUsername, type: 'dm' })
        });
        const data = await r.json();
        if (data.error) throw new Error(data.error);
        await loadMessages();
        if (data.chatId) await openChat(data.chatId, otherUsername);
    } catch (error) {
        console.error('Start chat error:', error);
        showToast(t('social.chat_fail','Failed to start chat') + ': ' + error.message, 'error');
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
    const ampm = h < 12 ? t('common.am','AM') : t('common.pm','PM');
    const h12 = h % 12 || 12;
    return `${ampm} ${h12}:${m}`;
}

function formatDateLabel(date) {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const days = [t('messenger.day_sun','Sun'),t('messenger.day_mon','Mon'),t('messenger.day_tue','Tue'),t('messenger.day_wed','Wed'),t('messenger.day_thu','Thu'),t('messenger.day_fri','Fri'),t('messenger.day_sat','Sat')];
    return `${y}/${m}/${d} (${days[date.getDay()]})`;
}

// ===== Load chat list =====
async function loadMessages() {
    console.log('[loadMessages] called, currentUser:', !!currentUser);
    if (!currentUser) { console.log('[loadMessages] no currentUser'); return; }
    // Independent mode: chat.js chatInit() handles messenger
    console.log('[loadMessages] independent mode -> chatInit()');
    if (typeof chatInit === 'function') chatInit();
}

// ===== Open chat =====
async function openChat(chatId, otherId) {
    if (chatUnsubscribe) { if (typeof chatUnsubscribe === 'function') chatUnsubscribe(); }
    if (chatDocUnsubscribe) { if (typeof chatDocUnsubscribe === 'function') chatDocUnsubscribe(); }
    if (channelMsgUnsubscribe) { if (typeof channelMsgUnsubscribe === 'function') channelMsgUnsubscribe(); channelMsgUnsubscribe = null; }
    currentChannel = null;
    currentChat = chatId;
    currentChatOtherId = otherId;
    const msgInput = document.getElementById('message-input');
    if (msgInput) delete msgInput.dataset.channelMode;

    const container = document.getElementById('messenger-container');
    if (container) container.classList.add('chat-open');
    const messengerPage = document.getElementById('messenger');
    if (messengerPage) messengerPage.classList.add('chat-active');
    
    const bottomTab = document.querySelector('.bottom-tab-bar');
    if (bottomTab) bottomTab.style.display = 'none';
    const menuToggle = document.querySelector('.menu-toggle');
    if (menuToggle) menuToggle.style.display = 'none';
    const topBar = document.getElementById('crowny-top-bar');
    if (topBar) topBar.style.display = 'none';

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

    // If chat.js has openChatById, delegate to it
    if (typeof openChatById === 'function') {
        openChatById(chatId, otherId);
        return;
    }

    // Fallback: load messages via REST
    try {
        const r = await fetch(`/api/chat/${chatId}/messages?limit=100`, { headers: ctvmHeaders() });
        const msgs = await r.json();
        const messagesDiv = document.getElementById('chat-messages');
        messagesDiv.innerHTML = '';
        if (!msgs || msgs.length === 0) {
            messagesDiv.innerHTML = `<p style="text-align:center; color:var(--accent); padding:2rem;">${t('social.send_first','Send your first message!')}</p>`;
        } else {
            for (const msg of msgs) {
                const isMine = msg.senderId === currentUser.uid;
                const timestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();
                const senderInfo = await getUserDisplayInfo(msg.senderId);
                const msgEl = document.createElement('div');
                msgEl.style.cssText = `display:flex;gap:0.5rem;margin-bottom:0.5rem;${isMine ? 'flex-direction:row-reverse;' : ''}`;
                msgEl.innerHTML = `
                    ${!isMine ? avatarHTML(senderInfo.photoURL, senderInfo.nickname, 28) : ''}
                    <div style="max-width:80%;">
                        ${!isMine ? `<div style="font-size:0.7rem;color:var(--accent);margin-bottom:0.15rem;">${senderInfo.nickname}</div>` : ''}
                        <div style="background:${isMine ? '#3D2B1F' : '#F7F3ED'};color:${isMine ? '#FFF8F0' : '#3D2B1F'};padding:0.6rem 0.8rem;border-radius:${isMine ? '12px 12px 0 12px' : '12px 12px 12px 0'};word-break:break-word;font-size:0.9rem;line-height:1.4;">${msg.text || ''}</div>
                        <div class="msg-time" style="${isMine ? 'justify-content:flex-end;' : ''}">${formatMsgTime(timestamp)}</div>
                    </div>`;
                messagesDiv.appendChild(msgEl);
            }
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    } catch (e) {
        console.error('[openChat] load messages error:', e);
    }

    setupTypingListener();
}

// ===== Mobile: close chat =====
function closeChatMobile() {
    const container = document.getElementById('messenger-container');
    if (container) container.classList.remove('chat-open');
    const messengerPage = document.getElementById('messenger');
    if (messengerPage) messengerPage.classList.remove('chat-active');
    
    const bottomTab = document.querySelector('.bottom-tab-bar');
    if (bottomTab) bottomTab.style.display = '';
    const menuToggle = document.querySelector('.menu-toggle');
    if (menuToggle) menuToggle.style.display = '';
    const topBar2 = document.getElementById('crowny-top-bar');
    if (topBar2) topBar2.style.display = '';

    chatUnsubscribe = null;
    chatDocUnsubscribe = null;
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
    // No-op: chat.js WebSocket handles typing
}

// ===== Message input: Enter to send =====
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
let replyToMessage = null;

function setReplyTo(msgId, text, senderId, senderName) {
    replyToMessage = { messageId: msgId, text: (text || '').substring(0, 100), senderId, senderName };
    document.getElementById('reply-preview-bar').style.display = 'flex';
    document.getElementById('reply-preview-name').textContent = senderName;
    document.getElementById('reply-preview-text').textContent = text || t('social.media','Media');
    document.getElementById('message-input').focus();
}

function cancelReply() {
    replyToMessage = null;
    document.getElementById('reply-preview-bar').style.display = 'none';
}

// ===== Send message =====
async function sendMessage() {
    console.log('[sendMessage] called. currentChat:', currentChat, 'currentChannel:', currentChannel);
    // Channel mode
    if (currentChannel) {
        const input = document.getElementById('message-input');
        const text = input?.value.trim();
        if (!text) return;
        try {
            await fetch(`/api/channels/${currentChannel}/messages`, {
                method: 'POST',
                headers: ctvmHeaders(),
                body: JSON.stringify({ text, type: 'text' })
            });
            input.value = ''; input.style.height = 'auto';
            openChannel(currentChannel); // refresh
        } catch (e) { showToast(t('social.msg_send_fail','Message send failed') + ': ' + e.message, 'error'); }
        return;
    }
    if (!currentChat) { showToast(t('social.select_chat','Please select a chat'), 'warning'); return; }

    // If chat.js has its own sendChatMessage, delegate
    if (typeof sendChatMessage === 'function') {
        sendChatMessage();
        return;
    }

    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;

    try {
        // Use chat REST API as fallback
        const r = await fetch(`/api/chat/${currentChat}/messages`, {
            method: 'POST',
            headers: ctvmHeaders(),
            body: JSON.stringify({ text, type: 'text' })
        });
        const data = await r.json();
        if (data.error) throw new Error(data.error);
        cancelReply();
        input.value = '';
        input.style.height = 'auto';
        // Reload chat
        if (currentChatOtherId) openChat(currentChat, currentChatOtherId);
    } catch (e) {
        console.error('[sendMessage] send failed:', e);
        showToast(t('social.msg_send_fail','Message send failed') + ': ' + e.message, 'error');
    }
}

// ===== Attach menu =====
function showAttachMenu() {
    document.querySelectorAll('.attach-menu-popup').forEach(el => el.remove());
    const menu = document.createElement('div');
    menu.className = 'attach-menu-popup';
    menu.style.cssText = 'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:var(--bg-card,#3D2B1F);border:1px solid var(--border,#E8E0D8);border-radius:12px;padding:0.5rem;box-shadow:0 4px 20px rgba(0,0,0,0.15);z-index:9999;display:flex;gap:0.3rem;';
    const items = [
        { icon: '<i data-lucide="camera" style="width:20px;height:20px;"></i>', label: t('social.photo','Photo'), fn: () => sendMediaFile('image') },
        { icon: '<i data-lucide="video" style="width:20px;height:20px;"></i>', label: t('social.video','Video'), fn: () => sendMediaFile('video') },
        { icon: '<i data-lucide="file" style="width:20px;height:20px;"></i>', label: t('social.file','File'), fn: () => sendMediaFile('file') },
        { icon: '<i data-lucide="mic" style="width:20px;height:20px;"></i>', label: t('social.voice','Voice'), fn: () => startVoiceRecord(), mobile: true },
        { icon: '<i data-lucide="dollar-sign" style="width:20px;height:20px;"></i>', label: t('social.token','Token'), fn: () => sendTokenWithMessage(), mobile: true },
        { icon: '<i data-lucide="smile" style="width:20px;height:20px;"></i>', label: t('social.sticker','Sticker'), fn: () => showStickerGifPanel(), mobile: true },
        { icon: '<i data-lucide="smile-plus" style="width:20px;height:20px;"></i>', label: t('social.emoji','Emoji'), fn: () => showEmojiInsertPicker(), mobile: true },
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

// ===== Send media file (base64 via API) =====
async function sendMediaFile(mediaType) {
    if (!currentChat) { showToast(t('social.select_chat','Please select a chat'), 'warning'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    if (mediaType === 'image') input.accept = 'image/*';
    else if (mediaType === 'video') input.accept = 'video/*';
    input.onchange = async () => {
        if (!input.files[0]) return;
        const file = input.files[0];
        try {
            showLoading(t('social.sending','Sending...'));
            const base64 = await fileToBase64(file);
            // Send via chat API if available, otherwise show toast
            if (typeof sendChatMediaMessage === 'function') {
                await sendChatMediaMessage(mediaType, base64, file.name, file.size);
            } else {
                showToast(t('social.coming_soon','Coming soon'), 'info');
            }
            hideLoading();
        } catch (e) {
            hideLoading();
            showToast(t('social.send_failed','Send failed') + ': ' + e.message, 'error');
        }
    };
    input.click();
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
            showToast(t('social.coming_soon','Voice messages coming soon'), 'info');
        };
        voiceRecorder.start();
        voiceRecordStart = Date.now();
        document.getElementById('voice-recording-ui').style.display = 'flex';
        document.getElementById('chat-input-area').style.display = 'none';
        voiceRecordInterval = setInterval(() => {
            const s = Math.floor((Date.now() - voiceRecordStart) / 1000);
            document.getElementById('voice-rec-timer').textContent = `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
        }, 200);
    }).catch(() => showToast(t('social.mic_access_fail','Microphone access failed'), 'error'));
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

// ===== Forward message — no-op (requires chat.js WebSocket) =====
async function forwardMessage(msgId) {
    showToast(t('social.coming_soon','Coming soon'), 'info');
}
async function executeForward(targetChatId, text, originalSenderId) {
    showToast(t('social.coming_soon','Coming soon'), 'info');
}

// ===== Pin message =====
async function pinMessage(msgId, text) {
    showToast(t('social.coming_soon','Coming soon'), 'info');
}
async function unpinMessage() {
    document.getElementById('pinned-message-banner').style.display = 'none';
}
function scrollToPinnedMessage() { /* no-op */ }

// ===== Sticker / GIF panel =====
function showStickerGifPanel() {
    document.querySelectorAll('.sticker-gif-panel').forEach(el => el.remove());
    const panel = document.createElement('div');
    panel.className = 'sticker-gif-panel';
    panel.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);width:340px;max-width:90vw;background:var(--bg-card,#3D2B1F);border:1px solid var(--border,#E8E0D8);border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.15);z-index:9999;overflow:hidden;';
    panel.innerHTML = `
        <div style="display:flex;border-bottom:1px solid var(--border,#E8E0D8);">
            <button onclick="showStickerTab()" class="sticker-tab-btn active" style="flex:1;padding:0.6rem;border:none;background:var(--bg-card,#3D2B1F);cursor:pointer;font-weight:600;border-bottom:2px solid #3D2B1F;">${t('social.sticker','Sticker')}</button>
            <button onclick="showGifTab()" class="sticker-tab-btn" style="flex:1;padding:0.6rem;border:none;background:var(--bg-card,#3D2B1F);cursor:pointer;font-weight:600;border-bottom:2px solid transparent;">GIF</button>
        </div>
        <div id="sticker-gif-content" style="height:250px;overflow-y:auto;padding:0.5rem;"></div>
    `;
    document.body.appendChild(panel);
    showStickerTab();
    setTimeout(() => {
        const dismiss = (e) => { if (!panel.contains(e.target)) { panel.remove(); document.removeEventListener('click', dismiss); } };
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
        `<button onclick="sendStickerMessage('${s}')" style="font-size:2.5rem;padding:0.8rem;border:none;background:none;cursor:pointer;border-radius:8px;" onmouseenter="this.style.background='#F7F3ED'" onmouseleave="this.style.background='none'">${s}</button>`
    ).join('')}</div>`;
}

function showGifTab() {
    document.querySelectorAll('.sticker-tab-btn').forEach(b => { b.classList.remove('active'); b.style.borderBottomColor = 'transparent'; });
    document.querySelectorAll('.sticker-tab-btn')[1].classList.add('active');
    document.querySelectorAll('.sticker-tab-btn')[1].style.borderBottomColor = '#3D2B1F';
    const content = document.getElementById('sticker-gif-content');
    content.innerHTML = `
        <div style="display:flex;gap:0.3rem;margin-bottom:0.5rem;">
            <input type="text" id="gif-search-input" placeholder="${t('social.gif_search','Search GIF...')}" style="flex:1;padding:0.5rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;font-size:0.85rem;" onkeypress="if(event.key==='Enter')searchGifs()">
            <button onclick="searchGifs()" style="padding:0.5rem 0.8rem;border:none;border-radius:8px;background:#3D2B1F;color:#FFF8F0;cursor:pointer;">${t('common.search','Search')}</button>
        </div>
        <div id="gif-results" style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.3rem;"></div>
    `;
    loadTrendingGifs();
}

async function loadTrendingGifs() {
    try {
        const res = await fetch('/api/ai/giphy?limit=20');
        const data = await res.json();
        renderGifs(data.data);
    } catch (e) { document.getElementById('gif-results').innerHTML = `<p style="color:var(--text-muted,#6B5744);text-align:center;grid-column:1/-1;">${t('social.gif_load_fail','GIF load failed')}</p>`; }
}

async function searchGifs() {
    const q = document.getElementById('gif-search-input').value.trim();
    if (!q) { loadTrendingGifs(); return; }
    try {
        const res = await fetch(`/api/ai/giphy?q=${encodeURIComponent(q)}&limit=20`);
        const data = await res.json();
        renderGifs(data.data);
    } catch (e) { document.getElementById('gif-results').innerHTML = `<p style="color:var(--text-muted,#6B5744);text-align:center;grid-column:1/-1;">${t('social.search_fail','Search failed')}</p>`; }
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
    showToast(t('social.coming_soon','Stickers coming soon'), 'info');
}

async function sendGifMessage(gifUrl) {
    if (!currentChat) return;
    document.querySelectorAll('.sticker-gif-panel').forEach(el => el.remove());
    showToast(t('social.coming_soon','GIFs coming soon'), 'info');
}

// ===== Share item from services — no-op stub =====
async function showShareItemModal() {
    showToast(t('social.coming_soon','Coming soon'), 'info');
}
async function shareServiceItem(type) { showToast(t('social.coming_soon','Coming soon'), 'info'); }
async function sendShareCard(type, id, name, imageUrl, price) { showToast(t('social.coming_soon','Coming soon'), 'info'); }

// ===== Token send in chat — no-op (wallet handles transfers differently) =====
async function sendTokenWithMessage() {
    showToast(t('social.coming_soon','Token transfer in chat coming soon'), 'info');
}

async function sendChatImage() { sendMediaFile('image'); }

// ===== Message delete =====
async function deleteMessage(msgId) {
    if (!currentChat) return;
    if (!await showConfirmModal(t('social.delete_msg','Delete Message'), t('social.confirm_delete_msg','Are you sure?'))) return;
    showToast(t('social.coming_soon','Coming soon'), 'info');
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
        btn.style.cssText = 'font-size:1.5rem;background:none;border:none;cursor:pointer;padding:6px;border-radius:8px;';
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

function showReactionPicker(msgId) { showToast(t('social.coming_soon','Coming soon'), 'info'); }
async function toggleReaction(msgId, emoji) { /* no-op */ }

// ===== Long press for mobile =====
function msgTouchStart(msgId) {
    msgLongPressTimer = setTimeout(() => {
        const actionsBar = document.getElementById('actions-' + msgId);
        if (actionsBar) { actionsBar.classList.toggle('show'); setTimeout(() => actionsBar.classList.remove('show'), 4000); }
    }, 500);
}
function msgTouchEnd() { clearTimeout(msgLongPressTimer); }

// ===== Chat message search =====
function toggleChatSearch() {
    const overlay = document.getElementById('chat-search-overlay');
    if (overlay.style.display === 'none') { overlay.style.display = 'flex'; document.getElementById('msg-search-input').focus(); }
    else closeChatSearch();
}
function closeChatSearch() {
    document.getElementById('chat-search-overlay').style.display = 'none';
    document.getElementById('msg-search-input').value = '';
    document.querySelectorAll('.msg-highlight').forEach(el => { el.replaceWith(document.createTextNode(el.textContent)); });
}
function searchMessagesInChat(query) {
    document.querySelectorAll('.msg-highlight').forEach(el => { el.replaceWith(document.createTextNode(el.textContent)); });
    if (!query.trim()) return;
    const msgs = document.getElementById('chat-messages');
    const walker = document.createTreeWalker(msgs, NodeFilter.SHOW_TEXT, null, false);
    const q = query.toLowerCase();
    const nodes = [];
    while (walker.nextNode()) { if (walker.currentNode.textContent.toLowerCase().includes(q)) nodes.push(walker.currentNode); }
    for (const node of nodes) {
        const text = node.textContent;
        const idx = text.toLowerCase().indexOf(q);
        if (idx === -1) continue;
        const span = document.createElement('span');
        span.innerHTML = `${text.substring(0, idx)}<span class="msg-highlight">${text.substring(idx, idx + query.length)}</span>${text.substring(idx + query.length)}`;
        node.parentNode.replaceChild(span, node);
    }
    const first = msgs.querySelector('.msg-highlight');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ===== Chat menu =====
function showChatMenu() {
    document.querySelectorAll('.chat-menu-dropdown').forEach(el => el.remove());
    const header = document.getElementById('chat-header');
    const menu = document.createElement('div');
    menu.className = 'chat-menu-dropdown';
    menu.style.position = 'absolute';
    menu.style.top = '48px';
    menu.style.right = '8px';
    menu.innerHTML = `
        <button class="chat-menu-item danger" onclick="leaveChat()"><i data-lucide="log-out" style="width:16px;height:16px;display:inline-block;vertical-align:middle;margin-right:6px;"></i> ${t('social.leave_chat','Leave Chat')}</button>`;
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
    if (!await showConfirmModal(t('social.leave_chat','Leave Chat'), t('social.confirm_leave','Are you sure?'))) return;
    try {
        await fetch(`/api/chat/${currentChat}`, { method: 'DELETE', headers: ctvmHeaders() });
        currentChat = null;
        currentChatOtherId = null;
        closeChatMobile();
        document.getElementById('chat-messages').innerHTML = '';
        document.getElementById('chat-header-actions').style.display = 'none';
        document.getElementById('chat-input-area').style.display = 'none';
        document.getElementById('chat-username').innerHTML = `<div class="chat-empty-state"><p>${t('social.select_chat','Please select a chat')}</p></div>`;
        showToast(t('social.left_chat','You left the chat'), 'info');
        loadMessages();
    } catch (e) {
        showToast(t('social.leave_fail','Failed to leave: ') + e.message, 'error');
    }
}

// ========== SOCIAL FEED ==========
async function loadSocialFeed() {
    if (!currentUser) return;
    const feed = document.getElementById('social-feed');
    if (!feed) return;
    await loadIndependentSocialFeed(feed);
}

async function toggleLike(postId, isLiked) {
    try {
        const res = await fetch('/api/social/like', {
            method: 'POST', headers: ctvmHeaders(),
            body: JSON.stringify({ postId })
        });
        const data = await res.json();
        if (data.ok) loadSocialFeed();
    } catch (e) { console.error('Like error:', e); }
}

async function showLikedUsers(postId) {
    showToast(t('social.coming_soon','Coming soon'), 'info');
}

async function toggleComments(postId) {
    const div = document.getElementById(`comments-${postId}`);
    if (!div) return;
    if (div.style.display === 'none') { div.style.display = 'block'; await showIndependentComments(postId); }
    else div.style.display = 'none';
}

async function loadComments(postId) {
    await showIndependentComments(postId);
}

async function addComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const text = input?.value.trim();
    if (!text) return;
    try {
        await fetch('/api/social/comment', {
            method: 'POST', headers: ctvmHeaders(),
            body: JSON.stringify({ postId, text })
        });
        input.value = '';
        await showIndependentComments(postId);
        loadSocialFeed();
    } catch (e) { showToast(t('social.comment_fail','Comment failed'), 'error'); }
}

async function editPost(postId) {
    try {
        // Fetch current post text from feed
        const res = await fetch(`/api/social/feed?limit=100`, { headers: ctvmHeaders() });
        const data = await res.json();
        const post = (data.posts || []).find(p => p.id === postId);
        if (!post) { showToast(t('social.post_not_found','Post not found'), 'error'); return; }
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        overlay.innerHTML = `<div class="modal-content" style="max-width:500px;width:90%;padding:1.5rem;">
            <h3 style="margin-bottom:1rem;">${t('social.edit_post','Edit Post')}</h3>
            <textarea id="edit-post-text" style="width:100%;min-height:120px;padding:0.8rem;border:1px solid var(--border,#E8E0D8);border-radius:10px;font-size:0.95rem;resize:vertical;background:var(--card-bg,#3D2B1F);color:var(--text,#FFF8F0);box-sizing:border-box;">${post.text || ''}</textarea>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
                <button onclick="this.closest('.modal-overlay').remove();" style="padding:0.6rem 1.2rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;background:none;color:var(--text,#3D2B1F);cursor:pointer;">${t('common.cancel','Cancel')}</button>
                <button onclick="saveEditPost('${postId}');" style="padding:0.6rem 1.2rem;border:none;border-radius:8px;background:#8B6914;color:#3D2B1F;font-weight:600;cursor:pointer;">${t('common.save','Save')}</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
    } catch (e) { showToast(t('social.edit_fail','Edit failed') + ': ' + e.message, 'error'); }
}

async function saveEditPost(postId) {
    const textarea = document.getElementById('edit-post-text');
    if (!textarea) return;
    const newText = textarea.value.trim();
    if (!newText) { showToast(t('social.enter_content','Please enter content'), 'warning'); return; }
    try {
        const r = await fetch('/api/social/post', {
            method: 'PATCH', headers: ctvmHeaders(),
            body: JSON.stringify({ postId, text: newText })
        });
        const data = await r.json();
        if (data.error) throw new Error(data.error);
        showToast(t('social.post_edited','Post edited'), 'success');
        document.querySelector('.modal-overlay')?.remove();
        loadSocialFeed();
    } catch (e) { showToast(t('social.edit_fail','Edit failed') + ': ' + e.message, 'error'); }
}

async function deletePost(postId) {
    if (!await showConfirmModal(t('social.delete_post','Delete Post'), t('social.confirm_delete','Are you sure?'))) return;
    try {
        await fetch('/api/social/post', {
            method: 'DELETE', headers: ctvmHeaders(),
            body: JSON.stringify({ postId })
        });
        showToast(t('social.post_deleted','Post deleted'), 'info');
        loadSocialFeed();
    } catch (e) { showToast(t('social.delete_fail','Delete failed'), 'error'); }
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return t('social.just_now','Just now');
    if (seconds < 3600) return `${Math.floor(seconds / 60)}${t('social.min_ago','m ago')}`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}${t('social.hour_ago','h ago')}`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}${t('social.day_ago','d ago')}`;
    return `${Math.floor(seconds / 604800)}${t('social.week_ago','w ago')}`;
}

// ========== VIDEO EDITOR STATE ==========
let _videoEditorState = { trimStart: 0, trimEnd: 0, filter: 'none', textOverlay: '', textPosition: 'bottom', textColor: '#FFF8F0' };
let _pendingServiceLink = null;

// ========== SERVICE LINK CONFIG ==========
const SERVICE_LINK_CONFIG = {
    artist:   { action: t('social.support_artist','Support'), color: '#B54534', collection: 'artists', nameField: 'name', nav: (id) => { showPage('artist'); viewArtistDetail(id); } },
    campaign: { action: t('social.donate','Donate'), color: '#5B7B8C', collection: 'campaigns', nameField: 'title', nav: (id) => { showPage('fundraise'); showCampaignDetail(id); } },
    business: { action: t('social.invest','Invest'), color: '#3D2B1F', collection: 'businesses', nameField: 'name', nav: (id) => { showPage('business'); viewBusinessDetail(id); } },
    art:      { action: t('social.buy_artwork','Buy Artwork'), color: '#8B6914', collection: 'artworks', nameField: 'title', nav: (id) => showPage('art') },
    book:     { action: t('social.buy_book','Buy Book'), color: '#FF9800', collection: 'books', nameField: 'title', nav: (id) => showPage('books') },
    product:  { action: t('social.buy_product','Buy Product'), color: '#5B7B8C', collection: 'products', nameField: 'name', nav: (id) => { showPage('product-detail'); renderProductDetail(id); } }
};

// Service link — no-op stubs (requires service collections)
async function showServiceLinkModal() { showToast(t('social.coming_soon','Coming soon'), 'info'); }
let _selectedServiceType = null;
async function selectServiceType(type) { /* no-op */ }
async function searchServiceItems() { /* no-op */ }

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
            <h4 style="margin:0 0 0.8rem;">${t('social.video_edit','Video Edit')}</h4>
            <div style="margin-bottom:0.8rem;">
                <label style="font-size:0.8rem;color:var(--text-muted,#6B5744);">${t('social.trim','Trim')}</label>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <span style="font-size:0.75rem;">${t('social.start','Start')}</span>
                    <input type="range" id="trim-start" min="0" max="60" value="0" step="0.1" style="flex:1;" oninput="updateTrimPreview()">
                    <span id="trim-start-val" style="font-size:0.75rem;min-width:30px;">0s</span>
                </div>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <span style="font-size:0.75rem;">${t('social.end','End')}</span>
                    <input type="range" id="trim-end" min="0" max="60" value="60" step="0.1" style="flex:1;" oninput="updateTrimPreview()">
                    <span id="trim-end-val" style="font-size:0.75rem;min-width:30px;">60s</span>
                </div>
            </div>
            <div style="margin-bottom:0.8rem;">
                <label style="font-size:0.8rem;color:var(--text-muted,#6B5744);">${t('social.filter','Filter')}</label>
                <div style="display:flex;gap:0.5rem;margin-top:0.3rem;">
                    <button onclick="setVideoFilter('none')" class="vfilter-btn active" style="padding:0.3rem 0.6rem;border:2px solid #3D2B1F;border-radius:8px;font-size:0.75rem;cursor:pointer;background:var(--bg-card,#3D2B1F);">${t('social.filter_original','Original')}</button>
                    <button onclick="setVideoFilter('grayscale(100%)')" class="vfilter-btn" style="padding:0.3rem 0.6rem;border:2px solid #E8E0D8;border-radius:8px;font-size:0.75rem;cursor:pointer;background:var(--bg-card,#3D2B1F);">${t('social.filter_bw','B&W')}</button>
                    <button onclick="setVideoFilter('sepia(40%) saturate(1.4)')" class="vfilter-btn" style="padding:0.3rem 0.6rem;border:2px solid #E8E0D8;border-radius:8px;font-size:0.75rem;cursor:pointer;background:var(--bg-card,#3D2B1F);">${t('social.filter_warm','Warm')}</button>
                    <button onclick="setVideoFilter('saturate(0.8) hue-rotate(20deg)')" class="vfilter-btn" style="padding:0.3rem 0.6rem;border:2px solid #E8E0D8;border-radius:8px;font-size:0.75rem;cursor:pointer;background:var(--bg-card,#3D2B1F);">${t('social.filter_cool','Cool')}</button>
                </div>
            </div>
            <div style="margin-bottom:0.8rem;">
                <label style="font-size:0.8rem;color:var(--text-muted,#6B5744);">${t('social.text_overlay','Text Overlay')}</label>
                <input type="text" id="editor-text-input" placeholder="${t('social.enter_text','Enter text')}" maxlength="50" style="width:100%;padding:0.5rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;font-size:0.85rem;margin-top:0.3rem;box-sizing:border-box;" oninput="updateTextOverlay()">
                <div style="display:flex;gap:0.5rem;margin-top:0.3rem;align-items:center;">
                    <select id="editor-text-pos" style="padding:0.3rem;border:1px solid var(--border,#E8E0D8);border-radius:6px;font-size:0.8rem;" onchange="updateTextOverlay()">
                        <option value="top">${t('social.pos_top','Top')}</option><option value="center">${t('social.pos_center','Center')}</option><option value="bottom" selected>${t('social.pos_bottom','Bottom')}</option>
                    </select>
                    <input type="color" id="editor-text-color" value="#FFF8F0" style="width:30px;height:30px;border:none;cursor:pointer;" onchange="updateTextOverlay()">
                </div>
            </div>
            <div style="display:flex;gap:0.5rem;">
                <button onclick="document.getElementById('video-editor-modal').remove()" style="flex:1;padding:0.6rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;cursor:pointer;background:var(--bg-card,#3D2B1F);">${t('common.cancel','Cancel')}</button>
                <button onclick="applyVideoEdits()" style="flex:1;padding:0.6rem;border:none;border-radius:8px;cursor:pointer;background:var(--gold,#8B6914);color:#3D2B1F;font-weight:700;">${t('social.apply','Apply')}</button>
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
        video.play().catch(e => console.warn(e.message));
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
    showToast(t('social.edits_applied','Edits applied'), 'success');
}

function extractVideoThumbnail(file) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.src = URL.createObjectURL(file);
        video.onloadeddata = () => { video.currentTime = Math.min(2, video.duration * 0.1); };
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

// ========== CREATE POST ==========
async function createPost() {
    return createIndependentPost();
}

// ========== SHARE POST ==========
async function sharePost(postId) {
    const shareUrl = `${location.origin}/social#${postId}`;
    try {
        if (navigator.share) {
            await navigator.share({ title: 'Crowny', text: t('social.shared_post','A post shared from Crowny'), url: shareUrl });
        } else {
            await navigator.clipboard.writeText(shareUrl);
            showToast(t('social.link_copied','Link copied'), 'success');
        }
        // Increment share count
        await fetch('/api/social/share', {
            method: 'POST', headers: ctvmHeaders(),
            body: JSON.stringify({ postId })
        });
    } catch (e) {
        if (e.name !== 'AbortError') {
            try { await navigator.clipboard.writeText(shareUrl); showToast(t('social.link_copied','Link copied'), 'success'); } catch (_) { console.warn(_.message); }
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

    overlay.innerHTML = `
    <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;" id="shorts-container">
        <video id="shorts-video" src="${post.data.videoUrl}" style="max-width:100%;max-height:100%;object-fit:contain;${filterCSS ? 'filter:'+filterCSS+';' : ''}" playsinline loop muted autoplay></video>
        ${textOverlay ? `<div style="position:absolute;left:0;right:0;text-align:center;${posStyle};font-size:1.4rem;font-weight:700;color:${textColor};text-shadow:0 2px 6px rgba(61,43,31,0.8);pointer-events:none;padding:0 1rem;">${textOverlay}</div>` : ''}
        <button onclick="closeShortsViewer()" style="position:absolute;top:16px;right:16px;background:rgba(61,43,31,0.5);color:#FFF8F0;border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;font-size:1.2rem;z-index:10;">✕</button>
        <div style="position:absolute;bottom:20px;left:16px;right:80px;color:#FFF8F0;z-index:5;">
            <strong style="font-size:0.95rem;">${post.nickname || t('social.user','User')}</strong>
            <p style="font-size:0.85rem;margin:0.2rem 0;opacity:0.9;">${(post.data.text || '').substring(0, 100)}</p>
        </div>
        <div style="position:absolute;right:12px;bottom:100px;display:flex;flex-direction:column;gap:1rem;align-items:center;z-index:5;">
            <button onclick="event.stopPropagation();toggleLike('${post.id}')" style="background:none;border:none;cursor:pointer;color:#FFF8F0;text-align:center;">
                <div style="font-size:1.5rem;">♡</div>
                <div style="font-size:0.75rem;">${post.data.likes?.length || 0}</div>
            </button>
            <button onclick="event.stopPropagation();closeShortsViewer();toggleComments('${post.id}')" style="background:none;border:none;cursor:pointer;color:#FFF8F0;text-align:center;">
                <div style="font-size:1.5rem;"><i data-lucide="message-circle" style="width:20px;height:20px;display:inline-block;vertical-align:middle"></i></div>
                <div style="font-size:0.75rem;">${post.data.commentCount || 0}</div>
            </button>
            <button onclick="event.stopPropagation();sharePost('${post.id}')" style="background:none;border:none;cursor:pointer;color:#FFF8F0;text-align:center;">
                <div style="font-size:1.5rem;">↗</div>
            </button>
        </div>
        ${_shortsCurrentIndex > 0 ? `<button onclick="event.stopPropagation();navigateShorts(-1)" style="position:absolute;top:50%;left:8px;transform:translateY(-50%);background:rgba(255,255,255,0.2);border:none;border-radius:50%;width:40px;height:40px;cursor:pointer;color:#FFF8F0;font-size:1.2rem;z-index:10;">▲</button>` : ''}
        ${_shortsCurrentIndex < _shortsVideoPosts.length - 1 ? `<button onclick="event.stopPropagation();navigateShorts(1)" style="position:absolute;top:50%;right:8px;transform:translateY(-50%);background:rgba(255,255,255,0.2);border:none;border-radius:50%;width:40px;height:40px;cursor:pointer;color:#FFF8F0;font-size:1.2rem;z-index:10;">▼</button>` : ''}
    </div>`;

    const video = document.getElementById('shorts-video');
    overlay.querySelector('#shorts-container').onclick = () => { video.muted = !video.muted; };

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

// ========== Contact management =====
async function editContact(contactDocId, currentName) {
    showToast(t('social.coming_soon','Coming soon'), 'info');
}

// ========== SOCIAL FEED FILTER ==========
function setSocialFilter(filter) {
    const wrapper = document.getElementById('social-feed-wrapper');
    const explore = document.getElementById('explore-content');
    const notifContent = document.getElementById('social-notifications-content');
    const profileContent = document.getElementById('full-profile-content');
    if (wrapper) wrapper.style.display = 'block';
    if (explore) explore.style.display = 'none';
    if (notifContent) notifContent.style.display = 'none';
    if (profileContent) profileContent.style.display = 'none';

    document.querySelectorAll('.social-tab-item').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.social-tab-item[data-filter="${filter}"]`);
    if (btn) btn.classList.add('active');

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

// ========== DEEP LINK ==========
function handlePostDeepLink() {
    const hash = window.location.hash;
    const postMatch = hash.match(/post=([^&]+)/);
    const userMatch = hash.match(/user=([^&]+)/);
    if (postMatch) {
        const postId = postMatch[1];
        showPage('social');
        setTimeout(() => {
            const el = document.querySelector(`[data-post-id="${postId}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        btn.textContent = '▶';
        return;
    }
    const audio = new Audio(url);
    currentVoiceAudio = audio;
    btn.textContent = '⏸';
    const progress = btn.parentElement.querySelector('.voice-progress');
    audio.ontimeupdate = () => { if (progress && audio.duration) progress.style.width = (audio.currentTime / audio.duration * 100) + '%'; };
    audio.onended = () => { btn.textContent = '▶'; if (progress) progress.style.width = '0%'; currentVoiceAudio = null; };
    audio.play().catch(() => { btn.textContent = '▶'; });
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
    list.innerHTML = `<p style="padding:1rem;text-align:center;color:var(--accent);">${t('common.loading','Loading...')}</p>`;
    try {
        const r = await fetch('/api/channels', { headers: ctvmHeaders() });
        const channels = await r.json();
        list.innerHTML = '';
        if (!channels || channels.length === 0) { list.innerHTML = `<p style="padding:1rem;text-align:center;color:var(--accent);">${t('social.no_channels','No channels')}</p>`; return; }
        channels.forEach(ch => {
            const isSub = (ch.subscribers || []).includes(currentUser?.uid);
            const el = document.createElement('div');
            el.className = 'chat-item';
            el.onclick = () => openChannel(ch.id);
            el.innerHTML = `
                <div style="width:44px;height:44px;border-radius:50%;background:#F7F3ED;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i data-lucide="megaphone" style="width:20px;height:20px;display:inline-block;vertical-align:middle"></i></div>
                <div class="chat-preview" style="flex:1;min-width:0;">
                    <strong>${ch.name}</strong>
                    <p style="font-size:0.75rem;color:var(--accent);">${ch.subscribers?.length || 0} ${t('social.subscribers','subscribers')}${isSub ? ' · ' + t('social.subscribed','Subscribed') : ''}</p>
                </div>`;
            list.appendChild(el);
        });
    } catch (e) { list.innerHTML = `<p style="color:red;text-align:center;">${e.message}</p>`; }
}

async function showCreateChannelModal() {
    const name = await showPromptModal(t('social.create_channel','Create Channel'), t('social.enter_channel_name','Enter channel name'), '');
    if (!name?.trim()) return;
    const desc = await showPromptModal(t('social.channel_desc','Channel Description'), t('social.channel_desc_optional','Channel description (optional)'), '');
    try {
        showLoading(t('social.creating_channel','Creating channel...'));
        await fetch('/api/channels', {
            method: 'POST', headers: ctvmHeaders(),
            body: JSON.stringify({ name: name.trim(), description: desc || '' })
        });
        hideLoading();
        showToast(t('social.channel_created','Channel created'), 'success');
        loadChannelList();
    } catch (e) { hideLoading(); showToast(t('social.create_fail','Creation failed') + ': ' + e.message, 'error'); }
}

async function openChannel(channelId) {
    chatUnsubscribe = null;
    chatDocUnsubscribe = null;
    channelMsgUnsubscribe = null;
    currentChat = null; currentChatOtherId = null;
    currentChannel = channelId;

    const container = document.getElementById('messenger-container');
    if (container) container.classList.add('chat-open');
    const messengerPage2 = document.getElementById('messenger');
    if (messengerPage2) messengerPage2.classList.add('chat-active');

    try {
        const chRes = await fetch('/api/channels', { headers: ctvmHeaders() });
        const channels = await chRes.json();
        const ch = channels.find(c => c.id === channelId);
        if (!ch) { showToast('Channel not found', 'error'); return; }
        const isOwner = ch.ownerId === currentUser.uid;
        const isSub = (ch.subscribers || []).includes(currentUser.uid);

        document.getElementById('chat-username').innerHTML = `
            <div style="display:flex;align-items:center;gap:0.5rem;">
                <div style="width:32px;height:32px;border-radius:50%;background:#F7F3ED;display:flex;align-items:center;justify-content:center;"><i data-lucide="megaphone" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i></div>
                <div><strong>${ch.name}</strong><div style="font-size:0.7rem;color:var(--accent);">${ch.subscribers?.length || 0} ${t('social.subscribers','subscribers')}</div></div>
                ${!isSub ? `<button onclick="subscribeChannel('${channelId}')" style="margin-left:0.5rem;padding:0.3rem 0.6rem;border:none;border-radius:6px;background:#3D2B1F;color:#FFF8F0;font-size:0.75rem;cursor:pointer;">${t('social.subscribe','Subscribe')}</button>` :
                    `<button onclick="unsubscribeChannel('${channelId}')" style="margin-left:0.5rem;padding:0.3rem 0.6rem;border:1px solid var(--border,#E8E0D8);border-radius:6px;background:var(--bg-card,#3D2B1F);font-size:0.75rem;cursor:pointer;">${t('social.unsubscribe','Unsubscribe')}</button>`}
            </div>`;
        document.getElementById('chat-header-actions').style.display = 'flex';
        document.getElementById('chat-input-area').style.display = isOwner ? 'flex' : 'none';

        // Load messages
        const msgRes = await fetch(`/api/channels/${channelId}/messages`, { headers: ctvmHeaders() });
        const msgs = await msgRes.json();
        const messagesDiv = document.getElementById('chat-messages');
        messagesDiv.innerHTML = '';
        if (!msgs || msgs.length === 0) {
            messagesDiv.innerHTML = `<p style="text-align:center;color:var(--accent);padding:2rem;">${t('social.no_messages','No messages')}</p>`;
        } else {
            for (const msg of msgs) {
                const timestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();
                const el = document.createElement('div');
                el.style.cssText = 'margin-bottom:0.5rem;';
                el.innerHTML = `<div style="background:#F7F3ED;padding:0.6rem 0.8rem;border-radius:12px;word-break:break-word;font-size:0.9rem;line-height:1.4;">${msg.text || ''}</div>
                    <div style="font-size:0.7rem;color:var(--accent);margin-top:0.15rem;">${formatMsgTime(timestamp)}</div>`;
                messagesDiv.appendChild(el);
            }
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    } catch (e) { console.error('openChannel error:', e); }
}

async function subscribeChannel(channelId) {
    await fetch(`/api/channels/${channelId}/subscribe`, { method: 'POST', headers: ctvmHeaders() });
    showToast(t('social.subscribed','Subscribed'), 'success');
    openChannel(channelId);
}

async function unsubscribeChannel(channelId) {
    await fetch(`/api/channels/${channelId}/subscribe`, { method: 'POST', headers: ctvmHeaders() });
    showToast(t('social.unsubscribed','Unsubscribed'), 'info');
    openChannel(channelId);
}

function showContactMenu(contactDocId, contactName) {
    document.querySelectorAll('.contact-menu-popup').forEach(el => el.remove());
    const menu = document.createElement('div');
    menu.className = 'contact-menu-popup';
    menu.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#FFF8F0;border:1px solid #E8E0D8;border-radius:12px;padding:0.5rem;box-shadow:0 4px 20px rgba(61,43,31,0.15);z-index:9999;min-width:160px;';
    menu.innerHTML = `
        <button onclick="deleteContactIndependent(${contactDocId});this.closest('.contact-menu-popup').remove();" style="display:flex;align-items:center;gap:6px;width:100%;padding:0.6rem 0.8rem;background:none;border:none;cursor:pointer;border-radius:8px;font-size:0.85rem;color:#B54534;"><i data-lucide="trash-2" style="width:16px;height:16px;"></i> ${t('social.delete_contact','Delete Contact')}</button>`;
    document.body.appendChild(menu);
    if (typeof lucide !== 'undefined') setTimeout(() => lucide.createIcons(), 50);
    setTimeout(() => {
        const dismiss = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', dismiss); } };
        document.addEventListener('click', dismiss);
    }, 10);
}

async function deleteContact(contactDocId, contactName) {
    if (!await showConfirmModal(t('social.delete_contact','Delete Contact'), `"${contactName}" ${t('social.confirm_delete_contact','Do you want to delete?')}`)) return;
    try {
        await fetch('/api/contacts/' + contactDocId, { method: 'DELETE', headers: ctvmHeaders() });
        showToast(t('social.contact_deleted','Contact deleted'), 'success');
        loadContacts();
    } catch (error) { showToast(t('social.delete_fail','Delete failed') + ': ' + error.message, 'error'); }
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

    document.querySelectorAll('.social-filter-tab').forEach(b => {
        b.classList.remove('active'); b.style.color = '#6B5744'; b.style.borderBottomColor = 'transparent';
    });
    const btn = document.querySelector('.social-filter-tab[data-filter="notifications"]');
    if (btn) { btn.classList.add('active'); btn.style.color = 'var(--text)'; btn.style.borderBottomColor = 'var(--text)'; }

    notifContent.innerHTML = `<p style="text-align:center;padding:2rem;color:var(--accent);">${t('social.notif_loading','Loading notifications...')}</p>`;

    try {
        const r = await fetch('/api/notifications', { headers: ctvmHeaders() });
        const notifs = await r.json();

        if (!notifs || notifs.length === 0) {
            notifContent.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--accent);"><p style="font-size:2rem;"><i data-lucide="bell" style="width:28px;height:28px;display:inline-block;vertical-align:middle"></i></p><p>${t('social.no_notifications','No notifications yet')}</p></div>`;
            return;
        }

        let html = `<div style="display:flex;justify-content:flex-end;margin-bottom:0.5rem;"><button onclick="markAllSocialNotifsRead()" style="background:none;border:none;color:#3D2B1F;font-size:0.8rem;cursor:pointer;font-weight:600;">${t('social.mark_all_read','Mark all read')}</button></div>`;
        for (const n of notifs) {
            const isRead = n.read;
            const timeAgo = getTimeAgoMs(n.ts || n.createdAt || Date.now());
            html += `<div onclick="handleSocialNotifClick('${n.id}','${n.notifType || n.type || ''}','${n.targetId || ''}','${n.fromUid || ''}')" style="display:flex;gap:0.6rem;padding:0.7rem;border-bottom:1px solid rgba(0,0,0,0.04);cursor:pointer;background:${isRead ? 'white' : 'rgba(33,150,243,0.04)'};">
                <div style="flex:1;min-width:0;">
                    <div style="font-size:0.85rem;${isRead ? '' : 'font-weight:600;'}">${n.message || ''}</div>
                    <div style="font-size:0.7rem;color:var(--accent);margin-top:0.15rem;">${timeAgo}</div>
                </div>
                ${isRead ? '' : '<span style="width:8px;height:8px;border-radius:50%;background:#0095f6;flex-shrink:0;margin-top:0.3rem;"></span>'}
            </div>`;
        }
        notifContent.innerHTML = html;
        updateSocialNotifBadge();
    } catch (e) {
        notifContent.innerHTML = `<p style="text-align:center;color:red;">${e.message}</p>`;
    }
}

async function handleSocialNotifClick(docId, type, targetId, fromUid) {
    try {
        await fetch('/api/notifications/read', { method: 'POST', headers: ctvmHeaders(), body: JSON.stringify({ id: docId }) });
    } catch (e) { console.warn(e.message); }

    if (type === 'follow' && fromUid) {
        showUserProfile(fromUid);
    } else if ((type === 'like' || type === 'comment' || type === 'mention') && targetId) {
        setSocialFilter('all');
        setTimeout(() => {
            const el = document.querySelector(`[data-post-id="${targetId}"]`);
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.boxShadow = '0 0 0 3px #3D2B1F'; setTimeout(() => el.style.boxShadow = '', 3000); }
        }, 500);
    }
}

async function markAllSocialNotifsRead() {
    try {
        await fetch('/api/notifications/read', { method: 'POST', headers: ctvmHeaders(), body: JSON.stringify({ all: true }) });
        showSocialNotifications();
    } catch (e) { console.warn(e.message); }
}

async function createSocialNotification(userId, notifType, message, data = {}) {
    if (!userId || userId === currentUser?.uid) return;
    try {
        await fetch('/api/notifications', {
            method: 'POST', headers: ctvmHeaders(),
            body: JSON.stringify({ targetUser: userId, type: notifType, message, ...data })
        });
    } catch (e) { console.warn('Social notif error:', e); }
}

async function updateSocialNotifBadge() {
    if (!currentUser) return;
    try {
        const r = await fetch('/api/notifications', { headers: ctvmHeaders() });
        const notifs = await r.json();
        const unread = (notifs || []).filter(n => !n.read).length;
        const badge = document.getElementById('social-notif-badge');
        if (badge) {
            if (unread > 0) { badge.style.display = 'inline-block'; badge.textContent = unread > 99 ? '99+' : unread; }
            else badge.style.display = 'none';
        }
    } catch (e) { console.warn(e.message); }
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

    document.querySelectorAll('.social-filter-tab').forEach(b => {
        b.classList.remove('active'); b.style.color = '#6B5744'; b.style.borderBottomColor = 'transparent';
    });
    const btn = document.querySelector('.social-filter-tab[data-filter="profile"]');
    if (btn) { btn.classList.add('active'); btn.style.color = 'var(--text)'; btn.style.borderBottomColor = 'var(--text)'; }

    profileContent.innerHTML = `<p style="text-align:center;padding:2rem;color:var(--accent);">${t('social.profile_loading','Loading profile...')}</p>`;

    try {
        const profileRes = await fetch('/api/users/profile?uid=' + encodeURIComponent(uid), { headers: ctvmHeaders() });
        const profileData = await profileRes.json();
        const info = await getUserDisplayInfo(uid);
        const isMe = uid === currentUser.uid;

        const postCount = profileData.postCount || 0;
        const followersCount = profileData.followersCount || 0;
        const followingCount = profileData.followingCount || 0;
        const amFollowing = profileData.isFollowing || false;

        // Load user posts
        const postsRes = await fetch(`/api/social/user-posts?uid=${encodeURIComponent(uid)}&tab=posts`, { headers: ctvmHeaders() });
        const postsData = await postsRes.json();
        const allPosts = postsData.posts || [];

        let html = `
        <div class="insta-profile">
            <div class="insta-profile-top">
                ${info.photoURL ? `<img class="insta-profile-pic" src="${info.photoURL}">` : `<div class="insta-profile-pic-placeholder">${(info.nickname||"?").charAt(0).toUpperCase()}</div>`}
                <div class="insta-profile-stats">
                    <div class="insta-stat"><div class="insta-stat-num">${postCount}</div><div class="insta-stat-label">${t('social.posts','Posts')}</div></div>
                    <div class="insta-stat" onclick="showFollowList('${uid}','followers')"><div class="insta-stat-num">${followersCount}</div><div class="insta-stat-label">${t('social.followers','Followers')}</div></div>
                    <div class="insta-stat" onclick="showFollowList('${uid}','following')"><div class="insta-stat-num">${followingCount}</div><div class="insta-stat-label">${t('social.following','Following')}</div></div>
                </div>
            </div>
            <div class="insta-profile-name">${info.nickname}</div>
            ${info.statusMessage ? `<div class="insta-profile-bio">${info.statusMessage}</div>` : ""}
            <div class="insta-profile-actions">
                ${isMe ? `<button class="insta-btn-edit" onclick="showProfileEdit()">${t('social.edit_profile','Edit Profile')}</button><button class="insta-btn-edit" onclick="copyShareURL('user','${uid}')">${t('common.share','Share')}</button>` : `<button class="${amFollowing ? 'insta-btn-following' : 'insta-btn-follow'}" onclick="followUser('${uid}');showFullProfile('${uid}')">${amFollowing ? t('social.following','Following') : t('social.follow','Follow')}</button><button class="insta-btn-edit" onclick="startChatFromProfile('${uid}')">${t('social.message','Message')}</button>`}
            </div>`;

        html += `<div class="insta-profile-tabs">
            <button class="insta-profile-tab active" onclick="switchProfileTab('posts','${uid}')"><i data-lucide="grid-3x3" style="width:18px;height:18px;"></i></button>
            <button class="insta-profile-tab" onclick="switchProfileTab('shorts','${uid}')"><i data-lucide="film" style="width:18px;height:18px;"></i></button>
            <button class="insta-profile-tab" onclick="switchProfileTab('saved','${uid}')"><i data-lucide="bookmark" style="width:18px;height:18px;"></i></button>
        </div>`;

        html += '<div id="profile-posts-grid" class="insta-grid">';
        const regularPosts = allPosts.filter(p => !p.videoUrl);
        for (const post of regularPosts) {
            if (post.image) {
                html += `<div class="insta-grid-item" onclick="scrollToPostOrOpen('${post.id}')"><img src="${post.image}" loading="lazy"></div>`;
            } else {
                html += `<div class="insta-grid-item" onclick="scrollToPostOrOpen('${post.id}')"><div style="width:100%;height:100%;background:linear-gradient(135deg,#8B6914,#6B5744);display:flex;align-items:center;justify-content:center;padding:0.5rem;"><span style="color:#FFF8F0;font-size:0.7rem;text-align:center;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;">${(post.text || '').substring(0, 60)}</span></div></div>`;
            }
        }
        html += '</div></div>';
        profileContent.innerHTML = html;
    } catch (e) {
        profileContent.innerHTML = `<p style="color:red;text-align:center;">${e.message}</p>`;
    }
}

async function switchProfileTab(tab, uid) {
    document.querySelectorAll('.insta-profile-tab').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');

    const grid = document.getElementById('profile-posts-grid');
    if (!grid) return;
    grid.innerHTML = `<p style="text-align:center;padding:1rem;color:var(--accent);">${t('common.loading','Loading...')}</p>`;

    try {
        const r = await fetch(`/api/social/user-posts?uid=${encodeURIComponent(uid)}&tab=${tab}`, { headers: ctvmHeaders() });
        const data = await r.json();
        const posts = data.posts || [];
        grid.innerHTML = '';
        grid.className = 'insta-grid';

        if (posts.length === 0) {
            grid.innerHTML = `<p style="text-align:center;padding:2rem;color:var(--accent);">${t('social.no_posts','No posts yet')}</p>`;
            return;
        }

        for (const post of posts) {
            if (post.image) {
                grid.innerHTML += `<div class="insta-grid-item" onclick="scrollToPostOrOpen('${post.id}')"><img src="${post.image}" loading="lazy"></div>`;
            } else if (post.videoUrl) {
                grid.innerHTML += `<div class="insta-grid-item" onclick="openShortsViewer('${post.id}')"><video src="${post.videoUrl}" muted preload="metadata" style="width:100%;height:100%;object-fit:cover;"></video></div>`;
            } else {
                grid.innerHTML += `<div class="insta-grid-item"><div style="width:100%;height:100%;background:linear-gradient(135deg,#8B6914,#6B5744);display:flex;align-items:center;justify-content:center;padding:0.5rem;"><span style="color:#FFF8F0;font-size:0.7rem;">${(post.text || '').substring(0, 60)}</span></div></div>`;
            }
        }
    } catch (e) {
        grid.innerHTML = `<p style="color:red;">${e.message}</p>`;
    }
}

async function showFollowList(uid, type) {
    showToast(t('social.coming_soon','Coming soon'), 'info');
}

// ========== DOUBLE-TAP LIKE ==========
let _lastTapTime = 0;
let _lastTapPostId = null;

function handlePostDoubleTap(postId, mediaEl) {
    const now = Date.now();
    if (_lastTapPostId === postId && now - _lastTapTime < 300) {
        doubleTapLike(postId, mediaEl);
        _lastTapTime = 0;
        _lastTapPostId = null;
    } else {
        _lastTapTime = now;
        _lastTapPostId = postId;
    }
}

async function doubleTapLike(postId, container) {
    if (container) {
        const heart = document.createElement('div');
        heart.className = 'double-tap-heart';
        heart.textContent = '♥';
        container.style.position = 'relative';
        container.appendChild(heart);
        setTimeout(() => heart.remove(), 900);
    }
    await toggleLike(postId, false);
}

// ========== NESTED COMMENTS ==========
async function loadCommentsWithReplies(postId) {
    await showIndependentComments(postId);
}

function showReplyInput(postId, commentId) {
    const el = document.getElementById(`reply-input-${postId}-${commentId}`);
    if (el) { el.style.display = el.style.display === 'none' ? 'block' : 'none'; el.querySelector('input')?.focus(); }
}

async function addReply(postId, parentId, input) {
    const text = input.value.trim();
    if (!text) return;
    try {
        await fetch('/api/social/comment', {
            method: 'POST', headers: ctvmHeaders(),
            body: JSON.stringify({ postId, text, parentId })
        });
        input.value = '';
        await showIndependentComments(postId);
    } catch (e) { showToast(t('social.comment_fail','Comment failed'), 'error'); }
}

// ========== WEB SHARE API ==========
async function sharePostWebAPI(postId) {
    const shareUrl = `${location.origin}/social#${postId}`;
    if (navigator.share) {
        try {
            await navigator.share({ title: 'Crowny ' + t('social.post','Post'), text: t('social.check_post','Check out this post!'), url: shareUrl });
        } catch (e) { /* user cancelled */ }
    } else {
        await navigator.clipboard.writeText(shareUrl);
        showToast(t('social.link_copied','Link copied'), 'success');
    }
    try {
        await fetch('/api/social/share', { method: 'POST', headers: ctvmHeaders(), body: JSON.stringify({ postId }) });
    } catch (e) { /* best effort */ }
}

// ========== INIT SOCIAL ENHANCEMENTS ==========
function initSocialEnhancements() {
    if (typeof initStories === 'function') initStories();
    updateSocialNotifBadge();
    setInterval(updateSocialNotifBadge, 60000);
}

const _origLoadUserData = window.loadUserData;
if (_origLoadUserData) {
    window.loadUserData = async function() {
        await _origLoadUserData();
        initSocialEnhancements();
    };
}

// ========== POST MENU (Bottom Sheet) ==========
function showPostMenu(postId, isMyPost) {
    document.querySelectorAll('.bottom-sheet-overlay,.bottom-sheet').forEach(el => el.remove());
    
    const overlay = document.createElement('div');
    overlay.className = 'bottom-sheet-overlay active';
    overlay.onclick = () => closeBottomSheet();
    
    const sheet = document.createElement('div');
    sheet.className = 'bottom-sheet active';
    
    let menuItems = '';
    if (isMyPost) {
        menuItems += `<button class="bottom-sheet-item" onclick="editPost('${postId}');closeBottomSheet();"><i data-lucide="pencil"></i> ${t('common.edit','Edit')}</button>`;
        menuItems += `<button class="bottom-sheet-item" style="color:#B54534;font-weight:600;" onclick="deletePost('${postId}');closeBottomSheet();"><i data-lucide="trash-2" style="color:#B54534;"></i> ${t('common.delete','Delete')}</button>`;
    }
    menuItems += `<button class="bottom-sheet-item" onclick="copyShareURL('post','${postId}');closeBottomSheet();"><i data-lucide="link"></i> ${t('social.copy_link','Copy Link')}</button>`;
    menuItems += `<button class="bottom-sheet-item" onclick="repostPost('${postId}');closeBottomSheet();"><i data-lucide="refresh-cw"></i> ${t('social.repost','Repost')}</button>`;
    menuItems += `<button class="bottom-sheet-item cancel" onclick="closeBottomSheet();"><i data-lucide="x"></i> ${t('common.cancel','Cancel')}</button>`;

    sheet.innerHTML = `<div class="bottom-sheet-handle"></div>${menuItems}`;
    
    document.body.appendChild(overlay);
    document.body.appendChild(sheet);
}

function closeBottomSheet() {
    document.querySelectorAll('.bottom-sheet-overlay,.bottom-sheet').forEach(el => {
        el.classList.remove('active');
        setTimeout(() => el.remove(), 300);
    });
}

// ═══════════════════════════════════════════════════════════════
// CrownyTVM Independent Social Feed (file-based, no Firebase)
// ═══════════════════════════════════════════════════════════════

async function loadIndependentSocialFeed(feed) {
    feed.innerHTML = `<div style="text-align:center;padding:2rem;color:#7A5C47;">${t('common.loading','Loading...')}</div>`;
    try {
        const res = await fetch('/api/social/feed?limit=30', { headers: ctvmHeaders() });
        const data = await res.json();
        feed.innerHTML = '';

        if (!data.posts || data.posts.length === 0) {
            feed.innerHTML = `<div style="text-align:center;padding:3rem;">
                <p style="font-size:2.5rem;margin-bottom:1rem;"><i data-lucide="pen-line" style="width:40px;height:40px;"></i></p>
                <p style="font-size:1.1rem;font-weight:600;color:#3D2B1F;">${t('social.no_posts','No posts yet')}</p>
                <p style="font-size:0.85rem;color:#7A5C47;">${t('social.write_first','Write your first post!')}</p></div>`;
            return;
        }

        for (const post of data.posts) {
            feed.appendChild(renderIndependentPost(post));
        }
    } catch (e) {
        feed.innerHTML = `<div style="text-align:center;padding:2rem;color:#c0392b;">${t('common.load_failed','Load failed')}: ${e.message}</div>`;
    }
}

function renderIndependentPost(post) {
    const el = document.createElement('div');
    el.className = 'crny-social-post';
    el.style.cssText = 'background:var(--card-bg,#FFF8F0);border-radius:12px;margin-bottom:12px;overflow:hidden;border:1px solid rgba(232,213,196,0.3);';
    el.dataset.postId = post.id;

    const myUser = localStorage.getItem('crowny_username') || '';
    const likedByMe = (post.likes || []).includes(myUser);
    const likeCount = (post.likes || []).length;
    const timeAgo = getTimeAgoMs(post.ts);

    let mediaHTML = '';
    if (post.youtube && post.youtube.id) {
        const ytId = post.youtube.id;
        mediaHTML = `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;background:#000;">
            <iframe src="https://www.youtube.com/embed/${ytId}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
                allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
    } else if (post.image) {
        mediaHTML = `<div><img src="${post.image}" style="width:100%;display:block;" loading="lazy"></div>`;
    }

    let textHTML = '';
    if (post.text) {
        textHTML = escapeHtmlSocial(post.text)
            .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:var(--primary,#B8860B);">$1</a>')
            .replace(/#(\S+)/g, '<span style="color:var(--primary,#B8860B);">#$1</span>');
    }

    el.innerHTML = `
        <div style="display:flex;align-items:center;padding:10px 12px;gap:10px;">
            ${post.authorPhotoURL ? `<img src="${post.authorPhotoURL}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;">` : `<div style="width:36px;height:36px;border-radius:50%;background:var(--primary,#B8860B);display:flex;align-items:center;justify-content:center;color:#FFF8F0;font-weight:700;font-size:0.85rem;">${(post.authorName || post.author || '?')[0].toUpperCase()}</div>`}
            <div style="flex:1;">
                <div style="font-weight:600;font-size:0.9rem;color:#3D2B1F;">${escapeHtmlSocial(post.authorName || post.author)}</div>
                <div style="font-size:0.72rem;color:#7A5C47;">@${escapeHtmlSocial(post.author)} · ${timeAgo}</div>
            </div>
            ${post.author === myUser ? `<button onclick="showPostMenu('${post.id}',true)" style="background:none;border:none;cursor:pointer;color:#7A5C47;font-size:1.2rem;">⋯</button>` : `<button onclick="showPostMenu('${post.id}',false)" style="background:none;border:none;cursor:pointer;color:#7A5C47;font-size:1.2rem;">⋯</button>`}
        </div>
        ${textHTML ? `<div class="crny-post-text" style="padding:0 12px 8px;font-size:0.9rem;line-height:1.5;color:#3D2B1F;white-space:pre-wrap;">${textHTML}</div>` : ''}
        ${mediaHTML}
        <div class="crny-post-actions" style="display:flex;gap:16px;padding:10px 12px;border-top:1px solid rgba(232,213,196,0.2);">
            <button onclick="toggleIndependentLike('${post.id}',this)" style="display:flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;font-size:0.85rem;color:${likedByMe ? '#e74c3c' : '#7A5C47'};">
                <i data-lucide="heart" style="width:16px;height:16px;${likedByMe ? 'fill:#e74c3c;' : ''}"></i> <span>${likeCount}</span>
            </button>
            <button onclick="showIndependentComments('${post.id}')" style="display:flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;font-size:0.85rem;color:#7A5C47;">
                <i data-lucide="message-circle" style="width:16px;height:16px;"></i> <span>${post.commentCount || 0}</span>
            </button>
            <button onclick="shareIndependentPost('${post.id}','${escapeHtmlSocial(post.text || '')}')" style="display:flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;font-size:0.85rem;color:#7A5C47;">
                <i data-lucide="share-2" style="width:16px;height:16px;"></i> ${t('common.share','Share')}
            </button>
        </div>
        <div id="comments-${post.id}" style="display:none;"></div>`;

    if (typeof lucide !== 'undefined') setTimeout(() => lucide.createIcons({ nodes: [el] }), 0);
    return el;
}

function escapeHtmlSocial(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getTimeAgoMs(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return t('social.just_now', 'Just now');
    if (diff < 3600000) return Math.floor(diff / 60000) + t('social.min_ago', 'm ago');
    if (diff < 86400000) return Math.floor(diff / 3600000) + t('social.hour_ago', 'h ago');
    if (diff < 604800000) return Math.floor(diff / 86400000) + t('social.day_ago', 'd ago');
    return Math.floor(diff / 604800000) + t('social.week_ago', 'w ago');
}

// Independent post creation
async function createIndependentPost() {
    const textarea = document.getElementById('post-text');
    const fileInput = document.getElementById('post-image');
    const text = textarea ? textarea.value.trim() : '';

    let youtubeUrl = '';
    const ytMatch = text.match(/(https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[^\s]+)/);
    if (ytMatch) youtubeUrl = ytMatch[1];

    let imageData = '';
    if (fileInput && fileInput.files[0]) {
        imageData = await fileToBase64(fileInput.files[0]);
    }

    if (!text && !youtubeUrl && !imageData) {
        if (typeof showToast === 'function') showToast(t('social.enter_content', 'Please enter content'), 'warning');
        return;
    }

    try {
        if (typeof showLoading === 'function') showLoading(t('social.posting', 'Posting...'));
        const res = await fetch('/api/social/post', {
            method: 'POST', headers: ctvmHeaders(),
            body: JSON.stringify({ text, youtubeUrl, image: imageData })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        if (textarea) textarea.value = '';
        if (fileInput) fileInput.value = '';
        const imgName = document.getElementById('post-image-name');
        if (imgName) imgName.textContent = '';

        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showToast === 'function') showToast(t('social.post_done', 'Posted!'), 'success');
        loadSocialFeed();
    } catch (e) {
        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showToast === 'function') showToast(t('social.post_fail', 'Post failed') + ': ' + e.message, 'error');
    }
}

function fileToBase64(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
    });
}

async function toggleIndependentLike(postId, btn) {
    try {
        const res = await fetch('/api/social/like', {
            method: 'POST', headers: ctvmHeaders(),
            body: JSON.stringify({ postId })
        });
        const data = await res.json();
        if (data.ok) {
            btn.style.color = data.liked ? '#e74c3c' : '#7A5C47';
            btn.innerHTML = `<i data-lucide="heart" style="width:16px;height:16px;${data.liked ? 'fill:#e74c3c;' : ''}"></i> <span>${data.count}</span>`;
            if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [btn] });
        }
    } catch (e) { console.error('Like error:', e); }
}

async function showIndependentComments(postId) {
    const container = document.getElementById('comments-' + postId);
    if (!container) return;
    if (container.style.display !== 'none') { container.style.display = 'none'; return; }
    container.style.display = 'block';
    container.innerHTML = `<div style="padding:8px 12px;color:#7A5C47;font-size:0.8rem;">${t('common.loading','Loading...')}</div>`;

    try {
        const res = await fetch(`/api/social/comments?postId=${postId}`, { headers: ctvmHeaders() });
        const comments = await res.json();
        let html = comments.map(c => `
            <div style="padding:6px 12px;border-top:1px solid rgba(232,213,196,0.15);">
                <span style="font-weight:600;font-size:0.8rem;color:#3D2B1F;">${escapeHtmlSocial(c.authorName || c.author)}</span>
                <span style="font-size:0.75rem;color:#7A5C47;margin-left:6px;">${getTimeAgoMs(c.ts)}</span>
                <div style="font-size:0.85rem;color:#3D2B1F;margin-top:2px;">${escapeHtmlSocial(c.text)}</div>
            </div>`).join('');

        html += `<div style="display:flex;padding:8px 12px;gap:6px;">
            <input id="cmnt-input-${postId}" type="text" placeholder="${t('social.add_comment','Add a comment...')}"
                style="flex:1;padding:6px 10px;border:1px solid rgba(232,213,196,0.4);border-radius:8px;font-size:0.82rem;background:rgba(255,248,240,0.5);color:#3D2B1F;"
                onkeypress="if(event.key==='Enter')submitIndependentComment('${postId}')">
            <button onclick="submitIndependentComment('${postId}')" style="background:var(--primary,#B8860B);color:#FFF8F0;border:none;border-radius:8px;padding:6px 12px;font-size:0.82rem;cursor:pointer;">${t('social.post','Post')}</button>
        </div>`;
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<div style="padding:8px 12px;color:#c0392b;font-size:0.8rem;">${e.message}</div>`;
    }
}

async function submitIndependentComment(postId) {
    const input = document.getElementById('cmnt-input-' + postId);
    if (!input || !input.value.trim()) return;
    try {
        const res = await fetch('/api/social/comment', {
            method: 'POST', headers: ctvmHeaders(),
            body: JSON.stringify({ postId, text: input.value.trim() })
        });
        const data = await res.json();
        if (data.ok) {
            showIndependentComments(postId);
            const postEl = document.querySelector(`[data-post-id="${postId}"]`);
            if (postEl) {
                const cntBtn = postEl.querySelectorAll('.crny-post-actions button')[1];
                if (cntBtn) {
                    const cnt = parseInt(cntBtn.querySelector('span')?.textContent || '0') + 1;
                    cntBtn.innerHTML = `<i data-lucide="message-circle" style="width:16px;height:16px;"></i> <span>${cnt}</span>`;
                    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [cntBtn] });
                }
            }
        }
    } catch (e) { console.error('Comment error:', e); }
}

async function deleteIndependentPost(postId) {
    if (!await showConfirmModal(t('social.delete_post','Delete Post'), t('social.confirm_delete', 'Are you sure?'))) return;
    try {
        await fetch('/api/social/post', {
            method: 'DELETE', headers: ctvmHeaders(),
            body: JSON.stringify({ postId })
        });
        loadSocialFeed();
        if (typeof showToast === 'function') showToast(t('social.post_deleted', 'Post deleted'), 'info');
    } catch (e) { console.error('Delete error:', e); }
}

function shareIndependentPost(postId, text) {
    const shareUrl = `${location.origin}/social#${postId}`;
    if (navigator.share) {
        navigator.share({ title: 'Crowny', text: text?.substring(0, 100) || ('Crowny ' + t('social.post','Post')), url: shareUrl }).catch(e => console.warn(e.message));
    } else {
        navigator.clipboard.writeText(shareUrl).then(() => {
            if (typeof showToast === 'function') showToast(t('social.link_copied', 'Link copied'), 'success');
        });
    }
}

// createPost hook
window._createPostIndependent = createIndependentPost;
ost;
ost;
ost;
