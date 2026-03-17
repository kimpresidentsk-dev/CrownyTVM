// ===== group-chat.js - 그룹채팅 시스템 (v1.0) =====
// Depends on: social.js (avatarHTML, getUserDisplayInfo, currentUser, db, etc.)
// Depends on: ui.js (showConfirmModal, showPromptModal, showToast)
// Depends on: i18n.js (t())

let currentGroupChat = null;
let groupChatUnsubscribe = null;
let groupInfoPanelOpen = false;

// ========== GROUP CHAT CREATION ==========

async function showNewGroupModal() {
    const groupName = await showPromptModal(
        t('group.new_group', '새 그룹 만들기'),
        t('group.enter_name', '그룹 이름을 입력하세요'),
        ''
    );
    if (!groupName || !groupName.trim()) return;

    // Load contacts for member selection
    const contacts = await db.collection('users').doc(currentUser.uid).collection('contacts').get();
    if (contacts.empty) {
        showToast(t('group.no_contacts', '연락처에 추가된 사용자가 없습니다. 먼저 연락처를 추가하세요.'), 'warning');
        return;
    }

    // Build member selection modal
    const memberInfos = [];
    for (const doc of contacts.docs) {
        const info = await getUserDisplayInfo(doc.id);
        memberInfos.push({ uid: doc.id, ...info });
    }

    const overlay = document.createElement('div');
    overlay.className = 'group-member-select-overlay';
    overlay.innerHTML = `
        <div class="group-member-select-modal">
            <h3 style="margin:0 0 0.5rem;">${t('group.select_members', '멤버 선택')}</h3>
            <p style="font-size:0.8rem;color:var(--accent);margin-bottom:1rem;">${t('group.group_name', '그룹명')}: <strong>${groupName.trim()}</strong></p>
            <div class="group-member-list" id="group-member-select-list">
                ${memberInfos.map(m => `
                    <label class="group-member-option" data-uid="${m.uid}">
                        <input type="checkbox" value="${m.uid}">
                        ${avatarHTML(m.photoURL, m.nickname, 36)}
                        <span>${m.nickname}</span>
                    </label>
                `).join('')}
            </div>
            <div style="display:flex;gap:0.5rem;margin-top:1rem;">
                <button class="btn-primary" id="group-create-confirm" style="flex:1;padding:0.6rem;border-radius:8px;">${t('group.create', '그룹 만들기')}</button>
                <button class="btn-secondary" id="group-create-cancel" style="flex:1;padding:0.6rem;border-radius:8px;">${t('common.cancel', '취소')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('group-create-cancel').onclick = () => overlay.remove();
    document.getElementById('group-create-confirm').onclick = async () => {
        const checked = overlay.querySelectorAll('input[type="checkbox"]:checked');
        const selectedUids = Array.from(checked).map(c => c.value);
        if (selectedUids.length === 0) {
            showToast(t('group.select_one', '최소 1명을 선택하세요'), 'warning');
            return;
        }
        overlay.remove();
        await createGroupChat(groupName.trim(), selectedUids);
    };
}

async function createGroupChat(groupName, memberUids) {
    try {
        showLoading();
        const participants = [currentUser.uid, ...memberUids];
        const newChat = await db.collection('chats').add({
            type: 'group',
            groupName: groupName,
            groupPhoto: '',
            createdBy: currentUser.uid,
            admins: [currentUser.uid],
            participants: participants,
            lastMessage: t('group.created', '그룹이 생성되었습니다'),
            lastMessageTime: new Date(),
            createdAt: new Date(),
            deleted: false
        });

        // Add system message
        await db.collection('chats').doc(newChat.id).collection('messages').add({
            type: 'system',
            text: t('group.created', '그룹이 생성되었습니다'),
            timestamp: new Date()
        });

        // Add join messages for each member
        const creatorInfo = await getUserDisplayInfo(currentUser.uid);
        for (const uid of memberUids) {
            const info = await getUserDisplayInfo(uid);
            await db.collection('chats').doc(newChat.id).collection('messages').add({
                type: 'system',
                text: `${info.nickname}${t('group.joined', '님이 입장했습니다')}`,
                timestamp: new Date()
            });
        }

        hideLoading();
        showToast(`<i data-lucide="check-circle"></i> ${t('group.created_success', '그룹이 생성되었습니다')}`, 'success');
        await loadMessages();
        await openGroupChat(newChat.id);
    } catch (e) {
        hideLoading();
        console.error('Group create error:', e);
        showToast(t('group.create_fail', '그룹 생성 실패') + ': ' + e.message, 'error');
    }
}

// ========== OPEN GROUP CHAT ==========

async function openGroupChat(chatId) {
    if (chatUnsubscribe) chatUnsubscribe();
    if (groupChatUnsubscribe) groupChatUnsubscribe();

    const chatDoc = await db.collection('chats').doc(chatId).get();
    const chatData = chatDoc.data();

    currentChat = chatId;
    currentChatOtherId = null; // group chat
    currentGroupChat = chatData;

    const memberCount = chatData.participants ? chatData.participants.length : 0;

    document.getElementById('chat-username').innerHTML = `
        <div style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;" onclick="toggleGroupInfoPanel()">
            <div class="group-avatar-icon"><i data-lucide="users"></i></div>
            <div>
                <strong>${chatData.groupName}</strong>
                <div style="font-size:0.7rem;color:var(--accent);">${t('group.members', '멤버')} ${memberCount}${t('group.people', '명')}</div>
            </div>
        </div>`;

    document.getElementById('chat-header-actions').style.display = 'flex';
    document.getElementById('chat-input-area').style.display = 'flex';
    document.querySelector('.chat-window').style.display = 'flex';

    // Mobile: show chat window
    if (window.innerWidth <= 768) {
        document.getElementById('chat-sidebar').style.display = 'none';
        document.getElementById('chat-header-back').style.display = 'block';
    }

    // Listen for messages
    groupChatUnsubscribe = db.collection('chats').doc(chatId)
        .collection('messages').orderBy('timestamp')
        .onSnapshot(async (snapshot) => {
            const messagesDiv = document.getElementById('chat-messages');
            messagesDiv.innerHTML = '';
            if (snapshot.empty) {
                messagesDiv.innerHTML = `<p style="text-align:center;color:var(--accent);padding:2rem;">${t('group.send_first', '메시지를 보내보세요!')}</p>`;
            }
            const senderCache = {};
            for (const doc of snapshot.docs) {
                const msg = doc.data();

                // System message
                if (msg.type === 'system') {
                    const sysEl = document.createElement('div');
                    sysEl.className = 'system-message';
                    sysEl.textContent = msg.text;
                    messagesDiv.appendChild(sysEl);
                    continue;
                }

                const isMine = msg.senderId === currentUser.uid;
                if (msg.senderId && !senderCache[msg.senderId]) {
                    senderCache[msg.senderId] = await getUserDisplayInfo(msg.senderId);
                }
                const senderInfo = msg.senderId ? senderCache[msg.senderId] : { nickname: '?', photoURL: '' };

                const msgEl = document.createElement('div');
                msgEl.style.cssText = `display:flex;gap:0.5rem;margin-bottom:0.5rem;${isMine ? 'flex-direction:row-reverse;' : ''}`;

                let content = '';
                // Reply quote
                if (msg.replyTo) {
                    content += `<div style="border-left:3px solid #3D2B1F;padding:0.2rem 0.5rem;margin-bottom:0.3rem;background:rgba(0,102,204,0.05);border-radius:0 6px 6px 0;font-size:0.75rem;color:#6B5744;">
                        <div style="font-weight:600;color:#3D2B1F;font-size:0.7rem;">답장</div>${(msg.replyTo.text || '').substring(0, 60)}</div>`;
                }
                if (msg.forwarded) content += `<div style="font-size:0.7rem;color:#6B5744;margin-bottom:0.2rem;font-style:italic;">↗️ 전달된 메시지</div>`;
                const msgType = msg.type || 'text';
                if (msgType === 'image' || msg.imageUrl) {
                    const imgUrl = msg.mediaUrl || msg.imageUrl;
                    content += `<img src="${imgUrl}" style="max-width:200px;border-radius:8px;cursor:pointer;display:block;margin-bottom:0.3rem;" onclick="window.open('${imgUrl}','_blank')">`;
                }
                if (msgType === 'video') content += `<video src="${msg.mediaUrl}" controls style="max-width:240px;border-radius:8px;display:block;margin-bottom:0.3rem;" preload="metadata"></video>`;
                if (msgType === 'file') content += `<a href="${msg.mediaUrl}" target="_blank" download="${msg.fileName||'file'}" style="display:flex;align-items:center;gap:0.4rem;padding:0.4rem 0.6rem;background:rgba(0,0,0,0.05);border-radius:8px;text-decoration:none;color:inherit;"><span>📄</span>${msg.fileName||'파일'}</a>`;
                if (msgType === 'voice') content += `<div style="display:flex;align-items:center;gap:0.5rem;"><button onclick="toggleVoicePlay(this,'${msg.mediaUrl}')" style="background:none;border:none;cursor:pointer;font-size:1.2rem;">▶️</button><div style="flex:1;height:4px;background:#E8E0D8;border-radius:2px;"><div class="voice-progress" style="width:0%;height:100%;background:#3D2B1F;border-radius:2px;"></div></div><span style="font-size:0.7rem;color:#6B5744;">${msg.duration||''}s</span></div>`;
                if (msgType === 'sticker') content += `<span style="font-size:3rem;">${msg.text}</span>`;
                else if (msgType === 'gif') content += `<img src="${msg.mediaUrl}" style="max-width:200px;border-radius:8px;" loading="lazy">`;
                else if (msgType === 'share_card' && msg.shareCard) {
                    const sc = msg.shareCard;
                    content += `<div style="border:1px solid #E8E0D8;border-radius:10px;overflow:hidden;cursor:pointer;max-width:220px;">${sc.imageUrl ? `<img src="${sc.imageUrl}" style="width:100%;height:100px;object-fit:cover;">` : ''}<div style="padding:0.4rem 0.6rem;"><div style="font-size:0.8rem;font-weight:600;">${sc.name}</div>${sc.price ? `<div style="font-size:0.75rem;color:#C4841D;">${sc.price}</div>` : ''}</div></div>`;
                }
                if (msg.tokenAmount) {
                    content += `<div style="background:linear-gradient(135deg,#8B6914,#F0C060);color:#FFF8F0;padding:0.5rem 0.8rem;border-radius:8px;margin-bottom:0.3rem;font-weight:600;"><i data-lucide="coins" style="width:14px;height:14px;display:inline;"></i> ${msg.tokenAmount} ${msg.tokenType}</div>`;
                }
                if (msg.text && msgType !== 'sticker' && msgType !== 'gif') content += `<span>${msg.text}</span>`;

                msgEl.innerHTML = `
                    ${!isMine ? avatarHTML(senderInfo.photoURL, senderInfo.nickname, 28) : ''}
                    <div style="max-width:70%;">
                        ${!isMine ? `<div style="font-size:0.7rem;color:var(--accent);margin-bottom:0.15rem;">${senderInfo.nickname}</div>` : ''}
                        <div style="background:${isMine ? 'var(--text)' : '#F7F3ED'};color:${isMine ? '#FFF8F0' : 'var(--text)'};padding:0.6rem 0.8rem;border-radius:${isMine ? '12px 12px 0 12px' : '12px 12px 12px 0'};word-break:break-word;font-size:0.9rem;line-height:1.4;">${content}</div>
                    </div>`;
                messagesDiv.appendChild(msgEl);
            }
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });

    // Store unsubscribe in the global chatUnsubscribe so closeChatMobile etc. works
    chatUnsubscribe = groupChatUnsubscribe;
}

// ========== GROUP INFO PANEL ==========

function toggleGroupInfoPanel() {
    const existing = document.getElementById('group-info-panel');
    if (existing) {
        existing.remove();
        groupInfoPanelOpen = false;
        return;
    }
    showGroupInfoPanel();
}

async function showGroupInfoPanel() {
    if (!currentChat || !currentGroupChat) return;

    // Re-fetch latest data
    const chatDoc = await db.collection('chats').doc(currentChat).get();
    const chat = chatDoc.data();
    currentGroupChat = chat;

    const isOwner = chat.createdBy === currentUser.uid;
    const isAdmin = chat.admins && chat.admins.includes(currentUser.uid);

    // Build member list
    let membersHTML = '';
    for (const uid of chat.participants) {
        const info = await getUserDisplayInfo(uid);
        const isOwnerBadge = uid === chat.createdBy;
        const isAdminBadge = chat.admins && chat.admins.includes(uid);
        const isSelf = uid === currentUser.uid;

        let roleBadge = '';
        if (isOwnerBadge) roleBadge = '<span class="role-badge owner"><i data-lucide="crown"></i> ' + t('group.owner', '방장') + '</span>';
        else if (isAdminBadge) roleBadge = '<span class="role-badge admin"><i data-lucide="star"></i> ' + t('group.admin', '관리자') + '</span>';

        let actions = '';
        if (isOwner && !isSelf) {
            if (isAdminBadge && !isOwnerBadge) {
                actions += `<button class="group-action-btn" onclick="removeAdmin('${uid}')" title="${t('group.remove_admin', '관리자 해제')}">⭐❌</button>`;
            } else if (!isAdminBadge) {
                actions += `<button class="group-action-btn" onclick="makeAdmin('${uid}')" title="${t('group.make_admin', '관리자 임명')}">⭐</button>`;
            }
        }
        if (isAdmin && !isSelf && uid !== chat.createdBy) {
            actions += `<button class="group-action-btn kick" onclick="kickMember('${uid}')" title="${t('group.kick', '강퇴')}">🚫</button>`;
        }

        membersHTML += `
            <div class="group-member-item">
                ${avatarHTML(info.photoURL, info.nickname, 36)}
                <div style="flex:1;min-width:0;">
                    <strong style="font-size:0.85rem;">${info.nickname}${isSelf ? ' (나)' : ''}</strong>
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
            <h3>${t('group.info', '그룹 정보')}</h3>
        </div>
        <div class="group-info-body">
            <div class="group-info-top">
                <div class="group-avatar-large">👥</div>
                <h3 id="group-info-name">${chat.groupName}</h3>
                <p style="color:var(--accent);font-size:0.85rem;">${t('group.members', '멤버')} ${chat.participants.length}${t('group.people', '명')}</p>
            </div>

            ${isAdmin ? `
            <div class="group-info-actions">
                <button class="btn-secondary" onclick="editGroupName()" style="font-size:0.8rem;padding:0.5rem 0.8rem;border-radius:8px;"><i data-lucide="edit"></i> ${t('group.edit_name', '그룹명 변경')}</button>
                <button class="btn-secondary" onclick="inviteMembers()" style="font-size:0.8rem;padding:0.5rem 0.8rem;border-radius:8px;"><i data-lucide="plus"></i> ${t('group.invite', '멤버 초대')}</button>
            </div>
            ` : ''}

            <div class="group-members-section">
                <h4 style="margin:0 0 0.5rem;font-size:0.9rem;">${t('group.member_list', '멤버 목록')}</h4>
                ${membersHTML}
            </div>

            <div class="group-info-bottom">
                ${isOwner ? `<button class="btn-danger" onclick="deleteGroupChat()" style="width:100%;padding:0.6rem;border-radius:8px;font-size:0.85rem;"><i data-lucide="trash"></i> ${t('group.delete', '그룹 삭제')}</button>` : ''}
                <button class="btn-secondary" onclick="leaveGroup()" style="width:100%;padding:0.6rem;border-radius:8px;font-size:0.85rem;margin-top:0.5rem;"><i data-lucide="log-out"></i> ${t('group.leave', '나가기')}</button>
            </div>
        </div>
    `;

    document.querySelector('.chat-window').appendChild(panel);
    groupInfoPanelOpen = true;
}

// ========== GROUP MANAGEMENT ==========

async function editGroupName() {
    const newName = await showPromptModal(
        t('group.edit_name', '그룹명 변경'),
        t('group.enter_new_name', '새 그룹명을 입력하세요'),
        currentGroupChat.groupName
    );
    if (!newName || !newName.trim()) return;

    await db.collection('chats').doc(currentChat).update({ groupName: newName.trim() });
    await db.collection('chats').doc(currentChat).collection('messages').add({
        type: 'system',
        text: t('group.name_changed', '그룹명이 변경되었습니다') + `: ${newName.trim()}`,
        timestamp: new Date()
    });
    currentGroupChat.groupName = newName.trim();

    // Refresh header and panel
    document.getElementById('group-info-name').textContent = newName.trim();
    showToast(t('group.name_updated', '✅ 그룹명이 변경되었습니다'), 'success');
    await loadMessages();
}

async function inviteMembers() {
    const email = await showPromptModal(
        t('group.invite', '멤버 초대'),
        t('group.invite_email', '초대할 사용자 이메일 또는 닉네임'),
        ''
    );
    if (!email || !email.trim()) return;

    try {
        // Search by email first
        let users = await db.collection('users').where('email', '==', email.trim()).get();
        // If not found, try nickname
        if (users.empty) {
            users = await db.collection('users').where('nickname', '==', email.trim()).get();
        }
        if (users.empty) {
            showToast(t('social.user_not_found', '사용자를 찾을 수 없습니다'), 'error');
            return;
        }

        const userId = users.docs[0].id;
        if (currentGroupChat.participants.includes(userId)) {
            showToast(t('group.already_member', '이미 그룹 멤버입니다'), 'warning');
            return;
        }

        await db.collection('chats').doc(currentChat).update({
            participants: firebase.firestore.FieldValue.arrayUnion(userId)
        });

        const info = await getUserDisplayInfo(userId);
        await db.collection('chats').doc(currentChat).collection('messages').add({
            type: 'system',
            text: `${info.nickname}${t('group.joined', '님이 입장했습니다')}`,
            timestamp: new Date()
        });

        showToast(`✅ ${info.nickname}${t('group.invited', '님을 초대했습니다')}`, 'success');

        // Refresh panel
        toggleGroupInfoPanel();
        await showGroupInfoPanel();
        await loadMessages();
    } catch (e) {
        console.error('Invite error:', e);
        showToast(t('group.invite_fail', '초대 실패') + ': ' + e.message, 'error');
    }
}

async function kickMember(uid) {
    const info = await getUserDisplayInfo(uid);
    const confirmed = await showConfirmModal(
        t('group.kick_confirm', '멤버 강퇴'),
        `${info.nickname}${t('group.kick_msg', '님을 강퇴하시겠습니까?')}`
    );
    if (!confirmed) return;

    try {
        await db.collection('chats').doc(currentChat).update({
            participants: firebase.firestore.FieldValue.arrayRemove(uid),
            admins: firebase.firestore.FieldValue.arrayRemove(uid)
        });

        await db.collection('chats').doc(currentChat).collection('messages').add({
            type: 'system',
            text: `${info.nickname}${t('group.kicked', '님이 강퇴되었습니다')}`,
            timestamp: new Date()
        });

        showToast(`${info.nickname}${t('group.kicked_success', '님을 강퇴했습니다')}`, 'success');
        toggleGroupInfoPanel();
        await showGroupInfoPanel();
        await loadMessages();
    } catch (e) {
        console.error('Kick error:', e);
        showToast(t('group.kick_fail', '강퇴 실패'), 'error');
    }
}

async function makeAdmin(uid) {
    const info = await getUserDisplayInfo(uid);
    await db.collection('chats').doc(currentChat).update({
        admins: firebase.firestore.FieldValue.arrayUnion(uid)
    });
    await db.collection('chats').doc(currentChat).collection('messages').add({
        type: 'system',
        text: `${info.nickname}${t('group.made_admin', '님이 관리자로 임명되었습니다')}`,
        timestamp: new Date()
    });
    showToast(`✅ ${info.nickname}${t('group.made_admin', '님이 관리자로 임명되었습니다')}`, 'success');
    toggleGroupInfoPanel();
    await showGroupInfoPanel();
}

async function removeAdmin(uid) {
    const info = await getUserDisplayInfo(uid);
    await db.collection('chats').doc(currentChat).update({
        admins: firebase.firestore.FieldValue.arrayRemove(uid)
    });
    await db.collection('chats').doc(currentChat).collection('messages').add({
        type: 'system',
        text: `${info.nickname}${t('group.removed_admin', '님의 관리자 권한이 해제되었습니다')}`,
        timestamp: new Date()
    });
    showToast(`${info.nickname}${t('group.admin_removed', '님의 관리자 권한을 해제했습니다')}`, 'success');
    toggleGroupInfoPanel();
    await showGroupInfoPanel();
}

async function leaveGroup() {
    const confirmed = await showConfirmModal(
        t('group.leave', '그룹 나가기'),
        t('group.leave_confirm', '정말로 이 그룹을 나가시겠습니까?')
    );
    if (!confirmed) return;

    try {
        const chatDoc = await db.collection('chats').doc(currentChat).get();
        const chat = chatDoc.data();
        const isOwner = chat.createdBy === currentUser.uid;

        const myInfo = await getUserDisplayInfo(currentUser.uid);

        // Remove from participants and admins
        await db.collection('chats').doc(currentChat).update({
            participants: firebase.firestore.FieldValue.arrayRemove(currentUser.uid),
            admins: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
        });

        // If owner leaves, transfer to oldest admin or oldest member
        if (isOwner) {
            const remainingAdmins = (chat.admins || []).filter(id => id !== currentUser.uid);
            const remainingParticipants = chat.participants.filter(id => id !== currentUser.uid);

            if (remainingParticipants.length > 0) {
                const newOwner = remainingAdmins.length > 0 ? remainingAdmins[0] : remainingParticipants[0];
                const updateData = { createdBy: newOwner };
                if (!remainingAdmins.includes(newOwner)) {
                    updateData.admins = firebase.firestore.FieldValue.arrayUnion(newOwner);
                }
                await db.collection('chats').doc(currentChat).update(updateData);

                const newOwnerInfo = await getUserDisplayInfo(newOwner);
                await db.collection('chats').doc(currentChat).collection('messages').add({
                    type: 'system',
                    text: `${newOwnerInfo.nickname}${t('group.new_owner', '님이 새 방장이 되었습니다')}`,
                    timestamp: new Date()
                });
            }
        }

        await db.collection('chats').doc(currentChat).collection('messages').add({
            type: 'system',
            text: `${myInfo.nickname}${t('group.left', '님이 퇴장했습니다')}`,
            timestamp: new Date()
        });

        showToast(t('group.left_success', '그룹을 나갔습니다'), 'success');

        // Close panel and reset
        const panel = document.getElementById('group-info-panel');
        if (panel) panel.remove();
        currentChat = null;
        currentGroupChat = null;
        if (groupChatUnsubscribe) { groupChatUnsubscribe(); groupChatUnsubscribe = null; }

        await loadMessages();

        // Reset chat window
        document.getElementById('chat-username').innerHTML = `
            <div class="chat-empty-state">
                <div style="font-size:3rem;margin-bottom:1rem;">💬</div>
                <p style="font-size:1rem;color:var(--accent);">${t('social.select_chat', '채팅을 선택하세요')}</p>
            </div>`;
        document.getElementById('chat-messages').innerHTML = '';
        document.getElementById('chat-input-area').style.display = 'none';
        document.getElementById('chat-header-actions').style.display = 'none';
    } catch (e) {
        console.error('Leave error:', e);
        showToast(t('group.leave_fail', '나가기 실패'), 'error');
    }
}

async function deleteGroupChat() {
    const confirmed = await showConfirmModal(
        t('group.delete', '그룹 삭제'),
        t('group.delete_confirm', '정말로 이 그룹을 삭제하시겠습니까? 모든 멤버가 이 채팅에 접근할 수 없게 됩니다.')
    );
    if (!confirmed) return;

    try {
        await db.collection('chats').doc(currentChat).update({ deleted: true });
        showToast(t('group.deleted', '✅ 그룹이 삭제되었습니다'), 'success');

        const panel = document.getElementById('group-info-panel');
        if (panel) panel.remove();
        currentChat = null;
        currentGroupChat = null;
        if (groupChatUnsubscribe) { groupChatUnsubscribe(); groupChatUnsubscribe = null; }

        await loadMessages();

        document.getElementById('chat-username').innerHTML = `
            <div class="chat-empty-state">
                <div style="font-size:3rem;margin-bottom:1rem;">💬</div>
                <p style="font-size:1rem;color:var(--accent);">${t('social.select_chat', '채팅을 선택하세요')}</p>
            </div>`;
        document.getElementById('chat-messages').innerHTML = '';
        document.getElementById('chat-input-area').style.display = 'none';
        document.getElementById('chat-header-actions').style.display = 'none';
    } catch (e) {
        console.error('Delete error:', e);
        showToast(t('group.delete_fail', '삭제 실패'), 'error');
    }
}

// ========== HOOK: Override loadMessages to include groups ==========

// Store original loadMessages reference
const _originalLoadMessages = typeof loadMessages === 'function' ? loadMessages : null;

async function loadMessagesWithGroups() {
    if (!currentUser) return;
    const chatList = document.getElementById('chat-list');
    if (!chatList) return;
    chatList.innerHTML = '';

    const chats = await db.collection('chats').where('participants', 'array-contains', currentUser.uid).get();
    if (chats.empty) {
        chatList.innerHTML = `<p style="padding:1rem; color:var(--accent); text-align:center;">${t('social.start_chat', '채팅을 시작하세요')}</p>`;
        return;
    }

    const chatDocs = chats.docs
        .filter(doc => !doc.data().deleted)
        .sort((a, b) => {
            const aTime = a.data().lastMessageTime?.toMillis?.() || 0;
            const bTime = b.data().lastMessageTime?.toMillis?.() || 0;
            return bTime - aTime;
        });

    if (chatDocs.length === 0) {
        chatList.innerHTML = `<p style="padding:1rem; color:var(--accent); text-align:center;">${t('social.start_chat', '채팅을 시작하세요')}</p>`;
        return;
    }

    for (const doc of chatDocs) {
        const chat = doc.data();
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';

        if (chat.type === 'group') {
            const memberCount = chat.participants ? chat.participants.length : 0;
            const gSecIcons = [];
            if (chat.e2eEnabled === true) gSecIcons.push('🔒');
            if (chat.autoDeleteAfter > 0) gSecIcons.push('⏱️');
            chatItem.onclick = () => openGroupChat(doc.id);
            chatItem.innerHTML = `
                <div class="group-avatar-icon chat-list-group-icon"><i data-lucide="users"></i></div>
                <div class="chat-preview">
                    <strong>👥 ${chat.groupName} <span class="group-member-count">(${memberCount})</span>${gSecIcons.length ? ' <span style="font-size:0.7rem;opacity:0.5;">' + gSecIcons.join('') + '</span>' : ''}</strong>
                    <p>${chat.lastMessage || t('social.no_messages', '메시지 없음')}</p>
                </div>`;
        } else {
            // Direct chat (original logic)
            const otherId = chat.participants.find(id => id !== currentUser.uid);
            if (!otherId) continue;
            const info = await getUserDisplayInfo(otherId);
            chatItem.onclick = () => openChat(doc.id, otherId);
            chatItem.innerHTML = `
                ${avatarHTML(info.photoURL, info.nickname, 44)}
                <div class="chat-preview">
                    <strong>${info.nickname}</strong>
                    <p>${chat.lastMessage || t('social.no_messages', '메시지 없음')}</p>
                </div>`;
        }
        chatList.appendChild(chatItem);
    }
}

// Override global loadMessages
loadMessages = loadMessagesWithGroups;
