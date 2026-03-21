// ===== group-chat.js - 그룹채팅 시스템 (v2.0 — Server API) =====
// Depends on: social.js (avatarHTML, getUserDisplayInfo, currentUser)
// Depends on: ui.js (showConfirmModal, showPromptModal, showToast)
// Depends on: i18n.js (t())

let currentGroupChat = null;
let groupChatUnsubscribe = null;
let groupInfoPanelOpen = false;
let _groupMsgPollInterval = null;

function _authHeaders() {
    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}

// ========== GROUP CHAT CREATION ==========

async function showNewGroupModal() {
    const groupName = await showPromptModal(
        t('group.new_group', 'Create New Group'),
        t('group.enter_name', 'Enter a group name'),
        ''
    );
    if (!groupName || !groupName.trim()) return;

    // Load contacts for member selection
    try {
        const resp = await fetch('/api/contacts', { headers: _authHeaders() });
        const contacts = resp.ok ? await resp.json() : [];
        const contactList = Array.isArray(contacts) ? contacts : (contacts.contacts || []);
        if (!contactList.length) {
            showToast(t('group.no_contacts', 'No contacts found. Please add contacts first.'), 'warning');
            return;
        }

        const memberInfos = contactList.map(c => ({
            uid: c.crownyUsername || c.name || c.id,
            nickname: c.name || c.crownyUsername || c.email || '?',
            photoURL: c.photoURL || ''
        }));

        const overlay = document.createElement('div');
        overlay.className = 'group-member-select-overlay';
        overlay.innerHTML = `
            <div class="group-member-select-modal">
                <h3 style="margin:0 0 0.5rem;">${t('group.select_members', 'Select Members')}</h3>
                <p style="font-size:0.8rem;color:var(--accent);margin-bottom:1rem;">${t('group.group_name', 'Group Name')}: <strong>${groupName.trim()}</strong></p>
                <div class="group-member-list" id="group-member-select-list">
                    ${memberInfos.map(m => `
                        <label class="group-member-option" data-uid="${m.uid}">
                            <input type="checkbox" value="${m.uid}">
                            ${typeof avatarHTML === 'function' ? avatarHTML(m.photoURL, m.nickname, 36) : `<span>${m.nickname[0]}</span>`}
                            <span>${m.nickname}</span>
                        </label>
                    `).join('')}
                </div>
                <div style="display:flex;gap:0.5rem;margin-top:1rem;">
                    <button class="btn-primary" id="group-create-confirm" style="flex:1;padding:0.6rem;border-radius:8px;">${t('group.create', 'Create Group')}</button>
                    <button class="btn-secondary" id="group-create-cancel" style="flex:1;padding:0.6rem;border-radius:8px;">${t('common.cancel', 'Cancel')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('group-create-cancel').onclick = () => overlay.remove();
        document.getElementById('group-create-confirm').onclick = async () => {
            const checked = overlay.querySelectorAll('input[type="checkbox"]:checked');
            const selectedUids = Array.from(checked).map(c => c.value);
            if (selectedUids.length === 0) {
                showToast(t('group.select_one', 'Please select at least 1 member'), 'warning');
                return;
            }
            overlay.remove();
            await createGroupChat(groupName.trim(), selectedUids);
        };
    } catch (e) {
        showToast(t('group.create_fail', 'Failed to create group') + ': ' + e.message, 'error');
    }
}

async function createGroupChat(groupName, memberUids) {
    try {
        showLoading();
        const resp = await fetch('/api/chat/create', {
            method: 'POST',
            headers: _authHeaders(),
            body: JSON.stringify({ otherUser: memberUids, type: 'group', groupName })
        });
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data.error || 'Failed');

        hideLoading();
        showToast(`${t('group.created_success', 'Group created successfully')}`, 'success');
        await loadMessages();
        const chatId = data.chatId || data.id;
        if (chatId) await openGroupChat(chatId);
    } catch (e) {
        hideLoading();
        showToast(t('group.create_fail', 'Failed to create group') + ': ' + e.message, 'error');
    }
}

// ========== OPEN GROUP CHAT ==========

async function openGroupChat(chatId) {
    if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
    if (_groupMsgPollInterval) { clearInterval(_groupMsgPollInterval); _groupMsgPollInterval = null; }

    try {
        const resp = await fetch(`/api/chat/${chatId}/info`, { headers: _authHeaders() });
        if (!resp.ok) throw new Error('Failed to load chat');
        const chatData = await resp.json();

        currentChat = chatId;
        currentChatOtherId = null;
        currentGroupChat = chatData;

        const memberCount = chatData.participants ? chatData.participants.length : 0;

        document.getElementById('chat-username').innerHTML = `
            <div style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;" onclick="toggleGroupInfoPanel()">
                <div class="group-avatar-icon"><i data-lucide="users"></i></div>
                <div>
                    <strong>${chatData.groupName}</strong>
                    <div style="font-size:0.7rem;color:var(--accent);">${t('group.members', 'Members')} ${memberCount}${t('group.people', '')}</div>
                </div>
            </div>`;

        document.getElementById('chat-header-actions').style.display = 'flex';
        document.getElementById('chat-input-area').style.display = 'flex';
        document.querySelector('.chat-window').style.display = 'flex';

        if (window.innerWidth <= 768) {
            document.getElementById('chat-sidebar').style.display = 'none';
            document.getElementById('chat-header-back').style.display = 'block';
        }

        // Load and render messages
        await renderGroupMessages(chatId);

        // Poll for new messages every 3 seconds
        _groupMsgPollInterval = setInterval(() => renderGroupMessages(chatId), 3000);
        chatUnsubscribe = () => { if (_groupMsgPollInterval) { clearInterval(_groupMsgPollInterval); _groupMsgPollInterval = null; } };
    } catch (e) {
        showToast(t('group.open_fail', 'Failed to open group') + ': ' + e.message, 'error');
    }
}

async function renderGroupMessages(chatId) {
    try {
        const resp = await fetch(`/api/chat/${chatId}/messages?limit=100`, { headers: _authHeaders() });
        if (!resp.ok) return;
        const data = await resp.json();
        const messages = data.messages || data || [];

        const messagesDiv = document.getElementById('chat-messages');
        if (!messagesDiv) return;

        const wasAtBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < 50;
        const prevCount = messagesDiv.children.length;

        messagesDiv.innerHTML = '';
        if (!messages.length) {
            messagesDiv.innerHTML = `<p style="text-align:center;color:var(--accent);padding:2rem;">${t('group.send_first', 'Send a message!')}</p>`;
            return;
        }

        const senderCache = {};
        for (const msg of messages) {
            if (msg.type === 'system') {
                const sysEl = document.createElement('div');
                sysEl.className = 'system-message';
                sysEl.textContent = msg.text || msg.content || '';
                messagesDiv.appendChild(sysEl);
                continue;
            }

            const isMine = msg.senderId === currentUser.uid;
            if (msg.senderId && !senderCache[msg.senderId]) {
                senderCache[msg.senderId] = typeof getUserDisplayInfo === 'function'
                    ? await getUserDisplayInfo(msg.senderId)
                    : { nickname: msg.senderId, photoURL: '' };
            }
            const senderInfo = msg.senderId ? senderCache[msg.senderId] : { nickname: '?', photoURL: '' };

            const msgEl = document.createElement('div');
            msgEl.style.cssText = `display:flex;gap:0.5rem;margin-bottom:0.5rem;${isMine ? 'flex-direction:row-reverse;' : ''}`;

            let content = '';
            const text = msg.text || msg.content || '';
            if (msg.tokenAmount) {
                content += `<div style="background:linear-gradient(135deg,#8B6914,#F0C060);color:#FFF8F0;padding:0.5rem 0.8rem;border-radius:8px;margin-bottom:0.3rem;font-weight:600;"><i data-lucide="coins" style="width:14px;height:14px;display:inline;"></i> ${msg.tokenAmount} ${msg.tokenType}</div>`;
            }
            if (text) content += `<span>${text}</span>`;

            msgEl.innerHTML = `
                ${!isMine ? (typeof avatarHTML === 'function' ? avatarHTML(senderInfo.photoURL, senderInfo.nickname, 28) : '') : ''}
                <div style="max-width:70%;">
                    ${!isMine ? `<div style="font-size:0.7rem;color:var(--accent);margin-bottom:0.15rem;">${senderInfo.nickname}</div>` : ''}
                    <div style="background:${isMine ? 'var(--text)' : '#F7F3ED'};color:${isMine ? '#FFF8F0' : 'var(--text)'};padding:0.6rem 0.8rem;border-radius:${isMine ? '12px 12px 0 12px' : '12px 12px 12px 0'};word-break:break-word;font-size:0.9rem;line-height:1.4;">${content}</div>
                </div>`;
            messagesDiv.appendChild(msgEl);
        }

        if (wasAtBottom || messages.length !== prevCount) {
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    } catch (e) { /* ignore polling errors */ }
}

// ========== GROUP INFO PANEL ==========

function toggleGroupInfoPanel() {
    const existing = document.getElementById('group-info-panel');
    if (existing) { existing.remove(); groupInfoPanelOpen = false; return; }
    showGroupInfoPanel();
}

async function showGroupInfoPanel() {
    if (!currentChat) return;

    const resp = await fetch(`/api/chat/${currentChat}/info`, { headers: _authHeaders() });
    if (!resp.ok) return;
    const chat = await resp.json();
    currentGroupChat = chat;

    const isOwner = chat.createdBy === currentUser.uid;
    const isAdmin = chat.admins && chat.admins.includes(currentUser.uid);

    let membersHTML = '';
    for (const uid of (chat.participants || [])) {
        const info = typeof getUserDisplayInfo === 'function' ? await getUserDisplayInfo(uid) : { nickname: uid, photoURL: '' };
        const isOwnerBadge = uid === chat.createdBy;
        const isAdminBadge = chat.admins && chat.admins.includes(uid);
        const isSelf = uid === currentUser.uid;

        let roleBadge = '';
        if (isOwnerBadge) roleBadge = '<span class="role-badge owner"><i data-lucide="crown"></i> ' + t('group.owner', 'Owner') + '</span>';
        else if (isAdminBadge) roleBadge = '<span class="role-badge admin"><i data-lucide="star"></i> ' + t('group.admin', 'Admin') + '</span>';

        let actions = '';
        if (isAdmin && !isSelf && uid !== chat.createdBy) {
            actions += `<button class="group-action-btn kick" onclick="kickMember('${uid}')" title="${t('group.kick', 'Kick')}"><i data-lucide="x-circle" style="width:14px;height:14px;"></i></button>`;
        }

        membersHTML += `
            <div class="group-member-item">
                ${typeof avatarHTML === 'function' ? avatarHTML(info.photoURL, info.nickname, 36) : `<span>${(info.nickname || '?')[0]}</span>`}
                <div style="flex:1;min-width:0;">
                    <strong style="font-size:0.85rem;">${info.nickname}${isSelf ? ' (' + t('group.me', 'Me') + ')' : ''}</strong>
                    ${roleBadge}
                </div>
                <div style="display:flex;gap:0.3rem;">${actions}</div>
            </div>`;
    }

    const panel = document.createElement('div');
    panel.id = 'group-info-panel';
    panel.className = 'group-info-panel';
    panel.innerHTML = `
        <div class="group-info-header">
            <button onclick="toggleGroupInfoPanel()" class="group-info-close">✕</button>
            <h3>${t('group.info', 'Group Info')}</h3>
        </div>
        <div class="group-info-body">
            <div class="group-info-top">
                <div class="group-avatar-large"><i data-lucide="users"></i></div>
                <h3 id="group-info-name">${chat.groupName}</h3>
                <p style="color:var(--accent);font-size:0.85rem;">${t('group.members', 'Members')} ${(chat.participants || []).length}${t('group.people', '')}</p>
            </div>
            ${isAdmin ? `
            <div class="group-info-actions">
                <button class="btn-secondary" onclick="editGroupName()" style="font-size:0.8rem;padding:0.5rem 0.8rem;border-radius:8px;"><i data-lucide="edit"></i> ${t('group.edit_name', 'Change Group Name')}</button>
                <button class="btn-secondary" onclick="inviteMembers()" style="font-size:0.8rem;padding:0.5rem 0.8rem;border-radius:8px;"><i data-lucide="plus"></i> ${t('group.invite', 'Invite Members')}</button>
            </div>
            ` : ''}
            <div class="group-members-section">
                <h4 style="margin:0 0 0.5rem;font-size:0.9rem;">${t('group.member_list', 'Member List')}</h4>
                ${membersHTML}
            </div>
            <div class="group-info-bottom">
                ${isOwner ? `<button class="btn-danger" onclick="deleteGroupChat()" style="width:100%;padding:0.6rem;border-radius:8px;font-size:0.85rem;"><i data-lucide="trash"></i> ${t('group.delete', 'Delete Group')}</button>` : ''}
                <button class="btn-secondary" onclick="leaveGroup()" style="width:100%;padding:0.6rem;border-radius:8px;font-size:0.85rem;margin-top:0.5rem;"><i data-lucide="log-out"></i> ${t('group.leave', 'Leave')}</button>
            </div>
        </div>
    `;

    document.querySelector('.chat-window').appendChild(panel);
    groupInfoPanelOpen = true;
}

// ========== GROUP MANAGEMENT ==========

async function editGroupName() {
    const newName = await showPromptModal(
        t('group.edit_name', 'Change Group Name'),
        t('group.enter_new_name', 'Enter a new group name'),
        currentGroupChat?.groupName || ''
    );
    if (!newName || !newName.trim()) return;

    try {
        const resp = await fetch(`/api/chat/${currentChat}/group`, {
            method: 'POST',
            headers: _authHeaders(),
            body: JSON.stringify({ groupName: newName.trim() })
        });
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data.error || 'Failed');
        if (currentGroupChat) currentGroupChat.groupName = newName.trim();
        const nameEl = document.getElementById('group-info-name');
        if (nameEl) nameEl.textContent = newName.trim();
        showToast(t('group.name_updated', 'Group name updated'), 'success');
        await loadMessages();
    } catch (e) {
        showToast(t('group.name_fail', 'Failed to update name') + ': ' + e.message, 'error');
    }
}

async function inviteMembers() {
    const input = await showPromptModal(
        t('group.invite', 'Invite Members'),
        t('group.invite_email', 'Username of user to invite'),
        ''
    );
    if (!input || !input.trim()) return;

    try {
        const resp = await fetch(`/api/chat/${currentChat}/group`, {
            method: 'POST',
            headers: _authHeaders(),
            body: JSON.stringify({ addMember: input.trim() })
        });
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data.error || 'Failed');
        showToast(`${input.trim()} ${t('group.invited', 'has been invited')}`, 'success');
        toggleGroupInfoPanel();
        await showGroupInfoPanel();
        await loadMessages();
    } catch (e) {
        showToast(t('group.invite_fail', 'Invite failed') + ': ' + e.message, 'error');
    }
}

async function kickMember(uid) {
    const info = typeof getUserDisplayInfo === 'function' ? await getUserDisplayInfo(uid) : { nickname: uid };
    const confirmed = await showConfirmModal(
        t('group.kick_confirm', 'Kick Member'),
        `${info.nickname}${t('group.kick_msg', ' — kick from group?')}`
    );
    if (!confirmed) return;

    try {
        const resp = await fetch(`/api/chat/${currentChat}/group`, {
            method: 'POST',
            headers: _authHeaders(),
            body: JSON.stringify({ removeMember: uid })
        });
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data.error || 'Failed');
        showToast(`${info.nickname}${t('group.kicked_success', ' has been kicked')}`, 'success');
        toggleGroupInfoPanel();
        await showGroupInfoPanel();
        await loadMessages();
    } catch (e) {
        showToast(t('group.kick_fail', 'Kick failed'), 'error');
    }
}

async function makeAdmin(uid) {
    // Server doesn't have admin toggle yet — use updateGroup
    showToast(t('group.admin_not_supported', 'Admin management coming soon'), 'info');
}

async function removeAdmin(uid) {
    showToast(t('group.admin_not_supported', 'Admin management coming soon'), 'info');
}

async function leaveGroup() {
    const confirmed = await showConfirmModal(
        t('group.leave', 'Leave Group'),
        t('group.leave_confirm', 'Are you sure you want to leave this group?')
    );
    if (!confirmed) return;

    try {
        const resp = await fetch(`/api/chat/${currentChat}/group`, {
            method: 'POST',
            headers: _authHeaders(),
            body: JSON.stringify({ removeMember: currentUser.uid })
        });
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data.error || 'Failed');

        showToast(t('group.left_success', 'You have left the group'), 'success');

        const panel = document.getElementById('group-info-panel');
        if (panel) panel.remove();
        currentChat = null;
        currentGroupChat = null;
        if (_groupMsgPollInterval) { clearInterval(_groupMsgPollInterval); _groupMsgPollInterval = null; }

        await loadMessages();

        document.getElementById('chat-username').innerHTML = `
            <div class="chat-empty-state">
                <div style="font-size:3rem;margin-bottom:1rem;"><i data-lucide="message-circle"></i></div>
                <p style="font-size:1rem;color:var(--accent);">${t('social.select_chat', 'Select a chat')}</p>
            </div>`;
        document.getElementById('chat-messages').innerHTML = '';
        document.getElementById('chat-input-area').style.display = 'none';
        document.getElementById('chat-header-actions').style.display = 'none';
    } catch (e) {
        showToast(t('group.leave_fail', 'Failed to leave'), 'error');
    }
}

async function deleteGroupChat() {
    const confirmed = await showConfirmModal(
        t('group.delete', 'Delete Group'),
        t('group.delete_confirm', 'Are you sure you want to delete this group?')
    );
    if (!confirmed) return;

    try {
        const resp = await fetch(`/api/chat/${currentChat}`, {
            method: 'DELETE',
            headers: _authHeaders()
        });
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data.error || 'Failed');

        showToast(t('group.deleted', 'Group has been deleted'), 'success');

        const panel = document.getElementById('group-info-panel');
        if (panel) panel.remove();
        currentChat = null;
        currentGroupChat = null;
        if (_groupMsgPollInterval) { clearInterval(_groupMsgPollInterval); _groupMsgPollInterval = null; }

        await loadMessages();

        document.getElementById('chat-username').innerHTML = `
            <div class="chat-empty-state">
                <div style="font-size:3rem;margin-bottom:1rem;"><i data-lucide="message-circle"></i></div>
                <p style="font-size:1rem;color:var(--accent);">${t('social.select_chat', 'Select a chat')}</p>
            </div>`;
        document.getElementById('chat-messages').innerHTML = '';
        document.getElementById('chat-input-area').style.display = 'none';
        document.getElementById('chat-header-actions').style.display = 'none';
    } catch (e) {
        showToast(t('group.delete_fail', 'Delete failed'), 'error');
    }
}

// ========== HOOK: Override loadMessages to include groups ==========

const _originalLoadMessages = typeof loadMessages === 'function' ? loadMessages : null;

async function loadMessagesWithGroups() {
    if (!currentUser) return;
    const chatList = document.getElementById('chat-list');
    if (!chatList) return;
    chatList.innerHTML = '';

    try {
        const resp = await fetch('/api/chat/list', { headers: _authHeaders() });
        if (!resp.ok) return;
        const data = await resp.json();
        const chats = data.chats || data || [];

        const chatDocs = chats.filter(c => !c.deleted).sort((a, b) => {
            const aTime = a.lastMessageTime || a.updatedAt || 0;
            const bTime = b.lastMessageTime || b.updatedAt || 0;
            return bTime - aTime;
        });

        if (!chatDocs.length) {
            chatList.innerHTML = `<p style="padding:1rem; color:var(--accent); text-align:center;">${t('social.start_chat', 'Start a chat')}</p>`;
            return;
        }

        for (const chat of chatDocs) {
            const chatItem = document.createElement('div');
            chatItem.className = 'chat-item';
            const chatId = chat.chatId || chat.id;

            if (chat.type === 'group') {
                const memberCount = chat.participants ? chat.participants.length : 0;
                chatItem.onclick = () => openGroupChat(chatId);
                chatItem.innerHTML = `
                    <div class="group-avatar-icon chat-list-group-icon"><i data-lucide="users"></i></div>
                    <div class="chat-preview">
                        <strong>${chat.groupName} <span class="group-member-count">(${memberCount})</span></strong>
                        <p>${chat.lastMessage || t('social.no_messages', 'No messages')}</p>
                    </div>`;
            } else {
                const otherId = (chat.participants || []).find(id => id !== currentUser.uid);
                if (!otherId) continue;
                const info = typeof getUserDisplayInfo === 'function' ? await getUserDisplayInfo(otherId) : { nickname: otherId, photoURL: '' };
                chatItem.onclick = () => openChat(chatId, otherId);
                chatItem.innerHTML = `
                    ${typeof avatarHTML === 'function' ? avatarHTML(info.photoURL, info.nickname, 44) : `<div style="width:44px;height:44px;border-radius:50%;background:#E8E0D8;display:flex;align-items:center;justify-content:center;">${(info.nickname || '?')[0]}</div>`}
                    <div class="chat-preview">
                        <strong>${info.nickname}</strong>
                        <p>${chat.lastMessage || t('social.no_messages', 'No messages')}</p>
                    </div>`;
            }
            chatList.appendChild(chatItem);
        }
    } catch (e) {
        chatList.innerHTML = `<p style="padding:1rem; color:var(--accent); text-align:center;">${t('social.start_chat', 'Start a chat')}</p>`;
    }
}

// Override global loadMessages
loadMessages = loadMessagesWithGroups;
