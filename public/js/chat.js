// chat.js — CrownyTVM 독립 메신저 클라이언트
// WebSocket 실시간 + REST API · Firebase 의존성 없음
// KakaoTalk-level messenger: unread counts, typing, media, edit/delete
'use strict';

let chatWs = null;
let chatReconnectTimer = null;
let chatReconnectDelay = 1000;
let chatCurrentId = null;
let chatMyUsername = null;
let chatOnlineUsers = new Set();
let chatTypingTimers = {};
let chatCurrentParticipants = []; // 현재 채팅방 참여자 목록
let chatTypingUsers = new Set();  // 현재 타이핑 중인 사용자들
let chatEditingMsgId = null;      // 수정 중인 메시지 ID
let chatReplyToMsgId = null;      // 답장 대상 메시지 ID
let chatPollTimer = null;         // 폴링 fallback 타이머
let chatLastMsgTimestamp = 0;     // 마지막 메시지 타임스탬프 (폴링 비교용)
let chatWsConnected = false;      // WS 연결 상태 추적

// ── 초기화 ──

function chatInit() {
    chatMyUsername = localStorage.getItem('crowny_username');
    console.log('[CHAT] chatInit() called, username:', chatMyUsername);
    if (!chatMyUsername) { console.warn('[CHAT] No crowny_username in localStorage, aborting'); return; }
    chatConnect();
    chatLoadList();
}

// ── WebSocket ──

function chatConnect() {
    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    if (!token) return;
    if (chatWs && (chatWs.readyState === 0 || chatWs.readyState === 1)) return;

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = proto + '//' + location.host + '/ws/chat';

    try { chatWs = new WebSocket(url); } catch (e) {
        console.warn('[CHAT] WS:', e);
        chatScheduleReconnect();
        return;
    }

    chatWs.onopen = () => {
        console.log('[CHAT] WS connected');
        chatReconnectDelay = 1000;
        chatWs.send(JSON.stringify({ type: 'auth', token }));
    };
    chatWs.onmessage = (e) => {
        try {
            chatHandleWs(JSON.parse(e.data));
        } catch (err) {
            console.error('[CHAT] WS message handling error:', err, 'raw:', e.data?.slice?.(0, 200));
        }
    };
    chatWs.onclose = (e) => {
        console.warn('[CHAT] WS closed, code:', e.code, 'reason:', e.reason);
        chatWsConnected = false;
        chatScheduleReconnect();
    };
    chatWs.onerror = (e) => {
        console.warn('[CHAT] WS error:', e);
    };
}

function chatScheduleReconnect() {
    if (chatReconnectTimer) return;
    chatReconnectTimer = setTimeout(() => {
        chatReconnectTimer = null;
        chatReconnectDelay = Math.min(chatReconnectDelay * 2, 30000);
        chatConnect();
    }, chatReconnectDelay);
}

function chatSendWs(data) {
    if (chatWs && chatWs.readyState === 1) { chatWs.send(JSON.stringify(data)); return true; }
    return false;
}

// ── WS 수신 핸들러 ──

function chatHandleWs(data) {
    switch (data.type) {
        case 'auth:ok':
            console.log('[CHAT] WS auth OK, username:', data.username);
            chatMyUsername = data.username;
            chatOnlineUsers = new Set(data.online || []);
            chatWsConnected = true;
            chatLoadList();
            // 재연결 시 현재 열린 채팅방 메시지 새로고침
            if (chatCurrentId) chatRefreshMessages();
            break;
        case 'chat:message':
        case 'chat:sent':
            chatOnMessage(data.msg);
            break;
        case 'chat:typing':
            chatOnTyping(data.chatId, data.username, data.isTyping);
            break;
        case 'chat:read':
            chatOnRead(data.chatId, data.username);
            break;
        case 'chat:deleted':
            chatOnMsgDeleted(data.chatId, data.msgId);
            break;
        case 'chat:edited':
            chatOnMsgEdited(data.chatId, data.msgId, data.text);
            break;
        case 'presence':
            if (data.isOnline) chatOnlineUsers.add(data.username);
            else chatOnlineUsers.delete(data.username);
            chatLoadList();
            break;
        case 'error':
            console.warn('[CHAT]', data.error);
            break;
    }
}

// ── REST API ──

async function chatApi(path, opts) {
    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    const headers = { 'Authorization': 'Bearer ' + token };
    if (opts && opts.body) headers['Content-Type'] = 'application/json';
    try {
        const r = await fetch('/api/chat' + path, {
            method: (opts && opts.method) || 'GET',
            headers,
            body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
        });
        return await r.json();
    } catch (e) {
        return { error: e.message };
    }
}

// ── 채팅 목록 ──

async function chatLoadList() {
    const list = await chatApi('/list');
    console.log('[CHAT] chatLoadList result:', Array.isArray(list) ? list.length + ' chats' : list);
    const container = document.getElementById('chat-list-items');
    if (!container) { console.warn('[CHAT] chat-list-items container not found!'); return; }

    if (!Array.isArray(list) || list.length === 0) {
        container.innerHTML = `<div class="chat-empty">${t('messenger.no_chats','No conversations')}<br><small>${t('messenger.start_hint','Tap + to start a chat')}</small></div>`;
        return;
    }

    container.innerHTML = list.map(c => {
        const name = c.displayName || '?';
        const isOnline = c.type === 'dm' && chatOnlineUsers.has(name);
        const unread = c.unread > 0 ? `<span class="chat-badge">${c.unread}</span>` : '';
        const time = c.lastMessageTime ? chatFmtTime(c.lastMessageTime) : '';
        const preview = chatEsc(c.lastMessageText || '');
        const isGroup = c.type === 'group';
        const memberCount = isGroup && c.participants ? `<span class="group-member-count">${c.participants.length}</span>` : '';
        return `<div class="chat-item${chatCurrentId === c.id ? ' active' : ''}${c.unread > 0 ? ' unread' : ''}" onclick="chatOpen('${c.id}')">
            ${c.photoURL ? `<img src="${chatEsc(c.photoURL)}" class="chat-avatar${isOnline ? ' online' : ''}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;">` : `<div class="chat-avatar${isOnline ? ' online' : ''}" style="background:${typeof ctvmColor==='function'?ctvmColor(name):'#8B6914'}">${isGroup ? 'G' : (name[0] || '?').toUpperCase()}</div>`}
            <div class="chat-item-body">
                <div class="chat-item-top"><span class="chat-item-name">${chatEsc(name)}${memberCount}</span><span class="chat-item-time">${time}</span></div>
                <div class="chat-item-preview">${preview}${unread}</div>
            </div>
        </div>`;
    }).join('');
}

// ── 채팅 열기 ──

async function chatOpen(chatId) {
    chatCurrentId = chatId;
    chatEditingMsgId = null;
    chatReplyToMsgId = null;
    chatTypingUsers.clear();
    const messagesEl = document.getElementById('chat-messages');
    const headerEl = document.getElementById('chat-header-info');
    const inputArea = document.getElementById('chat-input-area');

    if (!messagesEl) return;
    messagesEl.innerHTML = `<div class="chat-loading">${t('messenger.loading','Loading...')}</div>`;
    if (inputArea) inputArea.style.display = 'flex';

    // Request notification permission on first chat open
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    chatUpdateAppBadge();

    // 채팅방 정보
    const info = await chatApi('/' + chatId + '/info');
    if (info && !info.error) {
        chatCurrentParticipants = info.participants || [];
        const name = info.groupName || info.participants.filter(p => p !== chatMyUsername)[0] || '';
        const isOnline = info.type === 'dm' && info.participantStatus?.some(p => p.username !== chatMyUsername && p.isOnline);
        const isGroup = info.type === 'group';
        if (headerEl) {
            headerEl.innerHTML = `<strong>${chatEsc(name)}</strong>` +
                (isGroup ? `<span class="chat-header-member-count">${info.participants.length}${t('messenger.members','members')}</span>` : '') +
                `<span class="chat-status">${isOnline ? ' ' + t('messenger.online','Online') : ''}</span>` +
                (isGroup ? `<button class="chat-header-info-btn" onclick="chatShowGroupInfo('${chatId}')" title="${t('messenger.group_info','Group Info')}">i</button>` : '');
        }
    }

    // 메시지 로드
    const msgs = await chatApi('/' + chatId + '/messages?limit=50');
    if (!Array.isArray(msgs)) { messagesEl.innerHTML = ''; return; }

    // 날짜 구분선 삽입
    let lastDate = '';
    let html = '';
    for (const m of msgs) {
        const d = new Date(m.timestamp);
        const dateStr = d.toLocaleDateString();
        if (dateStr !== lastDate) {
            lastDate = dateStr;
            html += `<div class="date-separator"><span>${chatFmtDate(m.timestamp)}</span></div>`;
        }
        html += chatRenderMsg(m);
    }
    messagesEl.innerHTML = html;
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // reply bar 초기화
    chatHideReplyBar();

    // 마지막 메시지 타임스탬프 기록 (폴링용)
    if (msgs.length > 0) chatLastMsgTimestamp = msgs[msgs.length - 1].timestamp;

    // 폴링 시작 (WS 끊김 대비)
    chatStartPolling();

    // 읽음 처리
    chatApi('/' + chatId + '/read', { method: 'POST', body: {} }).then(() => {
        chatLoadList();
        chatUpdateAppBadge();
    });
    chatSendWs({ type: 'chat:read', chatId });

    // 모바일: 하단 탭바 숨기기 + 패널 열기
    const btb = document.getElementById('bottom-tab-bar');
    if (btb) btb.style.display = 'none';
    document.getElementById('chat-panel')?.classList.add('open');
}

// ── 메시지 렌더링 ──

function chatRenderMsg(m) {
    if (m.deleted) {
        return `<div class="chat-msg ${m.senderId === chatMyUsername ? 'mine' : 'theirs'} deleted-msg" data-id="${m.id}">
            <div class="chat-bubble msg-deleted">${t('messenger.msg_deleted','This message was deleted')}</div>
        </div>`;
    }
    const isMine = m.senderId === chatMyUsername;
    const time = chatFmtTime(m.timestamp);
    const replyHtml = m.replyTo ? `<div class="chat-reply-ref" onclick="chatScrollToMsg('${chatEsc(m.replyTo)}')">↩ ${chatEsc(String(m.replyToText || m.replyTo).slice(0, 60))}</div>` : '';
    const tipHtml = m.crmmTip ? `<span class="chat-tip-badge">${m.crmmTip} ${t('messenger.mam_unit','MAM')}</span>` : '';

    // 읽음 표시: 카카오톡 스타일 — 안읽은 사람 수 표시
    let statusHtml = '';
    if (isMine) {
        const totalOthers = (chatCurrentParticipants.length || 2) - 1;
        const readByOthers = (m.readBy || []).filter(u => u !== chatMyUsername).length;
        const unreadCount = totalOthers - readByOthers;
        if (unreadCount > 0) {
            statusHtml = `<span class="chat-unread-count">${unreadCount}</span>`;
        }
        // unreadCount === 0 means everyone read — no indicator (like KakaoTalk)
    }

    // 메시지 콘텐츠 (이미지/파일/텍스트)
    let contentHtml = '';
    if (m.type === 'image' && m.fileUrl) {
        contentHtml = `<div class="chat-bubble chat-bubble-media"><img src="${chatEsc(m.fileUrl)}" class="chat-msg-img" onclick="chatPreviewImage('${chatEsc(m.fileUrl)}')" alt="image"><div class="chat-img-caption">${m.text ? chatEsc(m.text) : ''}</div></div>`;
    } else if (m.type === 'file' && m.fileUrl) {
        const fname = m.fileName || 'file';
        const fsize = m.fileSize ? chatFmtFileSize(m.fileSize) : '';
        contentHtml = `<div class="chat-bubble chat-bubble-file"><a href="${chatEsc(m.fileUrl)}" download="${chatEsc(fname)}" class="chat-file-link"><span class="chat-file-icon"><i data-lucide="paperclip" style="width:18px;height:18px"></i></span><span class="chat-file-info"><span class="chat-file-name">${chatEsc(fname)}</span><span class="chat-file-size">${fsize}</span></span></a></div>`;
    } else if (m.type === 'video' && m.fileUrl) {
        contentHtml = `<div class="chat-bubble chat-bubble-media"><video src="${chatEsc(m.fileUrl)}" controls class="chat-msg-video"></video></div>`;
    } else {
        const edited = m.edited ? `<span class="chat-edited-tag">${t('messenger.edited','edited')}</span>` : '';
        contentHtml = `<div class="chat-bubble">${chatLinkify(chatEsc(m.text))}${edited}${tipHtml}</div>`;
    }

    // 메시지 액션 버튼 (hover/longpress)
    const actionsHtml = `<div class="msg-actions-bar ${isMine ? 'left' : 'right'}">
        <button class="msg-action-btn" onclick="chatReplyTo('${m.id}','${chatEsc(m.senderId)}','${chatEsc((m.text || '').slice(0,40))}')" title="${t('messenger.reply','Reply')}">↩</button>
        ${isMine ? `<button class="msg-action-btn" onclick="chatEditMsg('${m.id}','${chatEsc(m.text || '')}')" title="${t('messenger.edit','Edit')}">✏</button>` : ''}
        ${isMine ? `<button class="msg-action-btn" onclick="chatDeleteMsg('${m.id}')" title="${t('messenger.delete','Delete')}">✕</button>` : ''}
    </div>`;

    return `<div class="chat-msg ${isMine ? 'mine' : 'theirs'}" data-id="${m.id}">
        ${!isMine && chatCurrentParticipants.length > 2 ? `<div class="chat-msg-sender">${chatEsc(m.senderId)}</div>` : ''}
        ${replyHtml}
        <div class="msg-actions-wrapper">
            ${actionsHtml}
            ${contentHtml}
        </div>
        <div class="chat-msg-meta">${statusHtml}<span class="chat-msg-time">${time}</span>${!isMine ? `<button class="chat-translate-btn" onclick="chatTranslateMsg(this,'${m.id}',\`${chatEsc((m.text||'').replace(/`/g,''))}\`)" data-i18n="messenger.translate">${t('messenger.translate','Translate')}</button>` : ''}</div>
    </div>`;
}

// ── 메시지 전송 ──

let _chatSending = false;
async function chatSend() {
    if (_chatSending) return;
    const input = document.getElementById('chat-input');
    if (!input || !chatCurrentId) return;
    const text = input.value.trim();

    // 수정 모드
    if (chatEditingMsgId) {
        if (!text) return;
        _chatSending = true;
        try {
            const r = await chatApi('/' + chatCurrentId + '/edit', {
                method: 'POST',
                body: { msgId: chatEditingMsgId, text }
            });
            if (r.success) {
                chatOnMsgEdited(chatCurrentId, chatEditingMsgId, text);
            } else if (r.error && typeof showToast === 'function') {
                showToast(r.error, 'error');
            }
        } catch (e) { console.error('[CHAT] edit error:', e); }
        finally {
            _chatSending = false;
            chatCancelEdit();
        }
        return;
    }

    if (!text && !document.getElementById('chat-file-input')?.files?.length) return;
    input.value = '';
    _chatSending = true;

    try {
        const crmmInput = document.getElementById('chat-crmm');
        const crmm = crmmInput ? parseInt(crmmInput.value) || 0 : 0;
        if (crmmInput) crmmInput.value = '';
        const crmmWrap = document.getElementById('chat-crmm-wrap');
        if (crmmWrap) crmmWrap.style.display = 'none';

        const body = { text };
        if (crmm > 0) body.crmm = crmm;
        if (chatReplyToMsgId) {
            body.replyTo = chatReplyToMsgId;
            chatHideReplyBar();
        }

        const r = await chatApi('/' + chatCurrentId + '/send', { method: 'POST', body });
        if (r.msg) {
            chatOnMessage(r.msg);
            if (crmm > 0 && r.msg.crmmTip) {
                if (typeof showToast === 'function') showToast(crmm + ' ' + t('messenger.mam_sent','MAM sent'), 'success');
            } else if (crmm > 0 && !r.msg.crmmTip) {
                if (typeof showToast === 'function') showToast(t('messenger.mam_fail','MAM failed (insufficient balance?)'), 'error');
            }
        } else if (r.error) {
            if (typeof showToast === 'function') showToast(r.error, 'error');
        }
    } catch (e) {
        console.error('[CHAT] send error:', e);
    } finally {
        _chatSending = false;
    }
}

async function chatToggleCrmm() {
    const el = document.getElementById('chat-crmm-wrap');
    if (el) {
        const show = el.style.display === 'none';
        el.style.display = show ? 'flex' : 'none';
        if (show) {
            document.getElementById('chat-crmm')?.focus();
            const balEl = document.getElementById('chat-crmm-balance');
            if (balEl) {
                balEl.textContent = t('messenger.checking_balance','Checking balance...');
                try {
                    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
                    const r = await fetch('/api/wallet', { headers: { 'Authorization': 'Bearer ' + token } });
                    const w = await r.json();
                    const crm = (w.offchainBalances && w.offchainBalances.CRM) || 0;
                    balEl.textContent = t('messenger.mam_balance','MAM Balance: ') + crm.toLocaleString();
                } catch { balEl.textContent = ''; }
            }
        }
    }
}

// ── 이미지/파일 전송 ──

function chatAttachFile() {
    let fileInput = document.getElementById('chat-file-input');
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'chat-file-input';
        fileInput.style.display = 'none';
        fileInput.accept = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt';
        fileInput.onchange = () => chatUploadFile(fileInput.files[0]);
        document.body.appendChild(fileInput);
    }
    fileInput.value = '';
    fileInput.click();
}

async function chatUploadFile(file) {
    if (!file || !chatCurrentId) return;
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        if (typeof showToast === 'function') showToast(t('messenger.file_too_large','File too large (max 10MB)'), 'error');
        return;
    }

    // 로딩 표시
    const messagesEl = document.getElementById('chat-messages');
    const loadingId = 'upload-' + Date.now();
    if (messagesEl) {
        messagesEl.insertAdjacentHTML('beforeend',
            `<div class="chat-msg mine" id="${loadingId}"><div class="chat-bubble chat-upload-progress">${t('messenger.uploading','Uploading...')} ${chatEsc(file.name)}</div></div>`);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    try {
        // base64 인코딩
        const reader = new FileReader();
        const base64 = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const ext = file.name.split('.').pop() || 'bin';
        const fileName = Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '.' + ext;

        // 업로드
        const uploadResp = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64, fileName })
        });
        const uploadData = await uploadResp.json();
        if (!uploadData.ok) throw new Error(uploadData.error || 'Upload failed');

        // 메시지 타입 결정
        let msgType = 'file';
        if (file.type.startsWith('image/')) msgType = 'image';
        else if (file.type.startsWith('video/')) msgType = 'video';

        // 메시지 전송
        const caption = document.getElementById('chat-input')?.value.trim() || '';
        if (caption) document.getElementById('chat-input').value = '';

        const r = await chatApi('/' + chatCurrentId + '/send', {
            method: 'POST',
            body: {
                text: caption,
                msgType,
                fileUrl: uploadData.url,
                fileName: file.name,
                fileSize: file.size,
            }
        });

        // 로딩 제거
        document.getElementById(loadingId)?.remove();

        if (r.msg) {
            chatOnMessage(r.msg);
        }
    } catch (e) {
        console.error('[CHAT] upload error:', e);
        document.getElementById(loadingId)?.remove();
        if (typeof showToast === 'function') showToast(t('messenger.upload_fail','Upload failed'), 'error');
    }
}

// ── 이미지 프리뷰 ──

function chatPreviewImage(url) {
    let overlay = document.getElementById('chat-image-preview');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'chat-image-preview';
    overlay.className = 'chat-image-preview-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `<img src="${chatEsc(url)}" class="chat-image-preview-img">
        <a href="${chatEsc(url)}" download class="chat-image-download-btn">${t('messenger.download','Download')}</a>
        <button onclick="this.parentElement.remove()" class="chat-image-close-btn">✕</button>`;
    document.body.appendChild(overlay);
}

// ── 메시지 삭제 ──

async function chatDeleteMsg(msgId) {
    if (!chatCurrentId) return;
    if (!confirm(t('messenger.delete_confirm','Delete this message?'))) return;
    try {
        const r = await chatApi('/' + chatCurrentId + '/delete-msg', {
            method: 'POST',
            body: { msgId }
        });
        if (r.success) {
            chatOnMsgDeleted(chatCurrentId, msgId);
        } else if (r.error && typeof showToast === 'function') {
            showToast(r.error, 'error');
        }
    } catch (e) {
        console.error('[CHAT] delete error:', e);
    }
}

function chatOnMsgDeleted(chatId, msgId) {
    if (chatId !== chatCurrentId) return;
    const el = document.querySelector(`.chat-msg[data-id="${msgId}"]`);
    if (el) {
        el.classList.add('deleted-msg');
        const bubble = el.querySelector('.chat-bubble');
        if (bubble) {
            bubble.className = 'chat-bubble msg-deleted';
            bubble.textContent = t('messenger.msg_deleted','This message was deleted');
        }
        // 액션 버튼 제거
        const actions = el.querySelector('.msg-actions-bar');
        if (actions) actions.remove();
    }
}

// ── 메시지 수정 ──

function chatEditMsg(msgId, currentText) {
    chatEditingMsgId = msgId;
    const input = document.getElementById('chat-input');
    if (input) {
        // unescape HTML entities for editing
        const tmp = document.createElement('div');
        tmp.innerHTML = currentText;
        input.value = tmp.textContent || tmp.innerText || '';
        input.focus();
    }
    // 수정 중 표시
    const editBar = document.getElementById('chat-edit-bar');
    if (editBar) {
        editBar.style.display = 'flex';
        const tmp = document.createElement('div');
        tmp.innerHTML = currentText;
        editBar.querySelector('.chat-edit-text').textContent = (tmp.textContent || '').slice(0, 60);
    }
}

function chatCancelEdit() {
    chatEditingMsgId = null;
    const input = document.getElementById('chat-input');
    if (input) input.value = '';
    const editBar = document.getElementById('chat-edit-bar');
    if (editBar) editBar.style.display = 'none';
}

function chatOnMsgEdited(chatId, msgId, newText) {
    if (chatId !== chatCurrentId) return;
    const el = document.querySelector(`.chat-msg[data-id="${msgId}"] .chat-bubble`);
    if (el && !el.classList.contains('msg-deleted')) {
        el.innerHTML = chatLinkify(chatEsc(newText)) + `<span class="chat-edited-tag">${t('messenger.edited','edited')}</span>`;
    }
}

// ── 답장 ──

function chatReplyTo(msgId, sender, previewText) {
    chatReplyToMsgId = msgId;
    const replyBar = document.getElementById('chat-reply-bar');
    if (replyBar) {
        replyBar.style.display = 'flex';
        replyBar.querySelector('.chat-reply-sender').textContent = sender;
        const tmp = document.createElement('div');
        tmp.innerHTML = previewText;
        replyBar.querySelector('.chat-reply-text').textContent = (tmp.textContent || '').slice(0, 60);
    }
    document.getElementById('chat-input')?.focus();
}

function chatHideReplyBar() {
    chatReplyToMsgId = null;
    const replyBar = document.getElementById('chat-reply-bar');
    if (replyBar) replyBar.style.display = 'none';
}

function chatScrollToMsg(msgId) {
    const el = document.querySelector(`.chat-msg[data-id="${msgId}"]`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('chat-msg-highlight');
        setTimeout(() => el.classList.remove('chat-msg-highlight'), 2000);
    }
}

// ── 수신 메시지 처리 ──

function chatOnMessage(msg) {
    // 타임스탬프 추적 (폴링 비교용)
    if (msg.timestamp > chatLastMsgTimestamp) chatLastMsgTimestamp = msg.timestamp;

    if (msg.chatId === chatCurrentId) {
        const messagesEl = document.getElementById('chat-messages');
        if (messagesEl) {
            const loading = messagesEl.querySelector('.chat-loading');
            if (loading) loading.remove();
            // 중복 체크
            if (!messagesEl.querySelector(`[data-id="${msg.id}"]`)) {
                messagesEl.insertAdjacentHTML('beforeend', chatRenderMsg(msg));
                messagesEl.scrollTop = messagesEl.scrollHeight;
            }
        }
        if (msg.senderId !== chatMyUsername) {
            chatApi('/' + msg.chatId + '/read', { method: 'POST', body: {} }).then(() => {
                chatLoadList();
                chatUpdateAppBadge();
            });
            chatSendWs({ type: 'chat:read', chatId: msg.chatId });
        }
    } else {
        chatLoadList();
    }

    // ── Notification for messages from others ──
    if (msg.senderId && msg.senderId !== chatMyUsername) {
        const isViewingThisChat = msg.chatId === chatCurrentId && document.hasFocus() &&
            document.querySelector('.page.active')?.id === 'messenger';

        if (!isViewingThisChat && !chatIsMuted(msg.chatId)) {
            chatPlayNotifSound();
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            const senderName = msg.senderNick || msg.senderId;
            const preview = (msg.text || '').substring(0, 80);
            if (typeof showBrowserNotification === 'function') {
                showBrowserNotification(senderName, preview, { chatId: msg.chatId, otherId: msg.senderId });
            }
            if (typeof addNotification === 'function') {
                addNotification('messenger', `${senderName}: ${preview}`, { chatId: msg.chatId, otherId: msg.senderId });
            }
            chatUpdateAppBadge();
        }
    }
}

// ── Notification sound (KakaoTalk-style two-tone chime) ──
function chatPlayNotifSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.connect(gain1); gain1.connect(ctx.destination);
        osc1.type = 'sine';
        osc1.frequency.value = 830;
        gain1.gain.setValueAtTime(0.2, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc1.start(now); osc1.stop(now + 0.12);
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2); gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.value = 1050;
        gain2.gain.setValueAtTime(0, now + 0.1);
        gain2.gain.linearRampToValueAtTime(0.18, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc2.start(now + 0.1); osc2.stop(now + 0.3);
        setTimeout(() => ctx.close(), 500);
    } catch(e) { /* optional */ }
}

// ── 폴링 fallback (WS 끊김 대비) ──

function chatStartPolling() {
    chatStopPolling();
    // WS 연결 상태에 따라 폴링 간격 조절: 연결 중이면 10초, 끊겼으면 3초
    const interval = chatWsConnected ? 10000 : 3000;
    chatPollTimer = setInterval(() => {
        if (chatCurrentId) chatPollNewMessages();
    }, interval);
}

function chatStopPolling() {
    if (chatPollTimer) { clearInterval(chatPollTimer); chatPollTimer = null; }
}

async function chatPollNewMessages() {
    if (!chatCurrentId) return;
    try {
        const msgs = await chatApi('/' + chatCurrentId + '/messages?limit=10');
        if (!Array.isArray(msgs) || msgs.length === 0) return;
        const messagesEl = document.getElementById('chat-messages');
        if (!messagesEl) return;
        let added = false;
        for (const m of msgs) {
            if (!messagesEl.querySelector(`[data-id="${m.id}"]`)) {
                // 새 메시지 발견
                messagesEl.insertAdjacentHTML('beforeend', chatRenderMsg(m));
                added = true;
                if (m.timestamp > chatLastMsgTimestamp) chatLastMsgTimestamp = m.timestamp;
            }
        }
        if (added) {
            messagesEl.scrollTop = messagesEl.scrollHeight;
            chatLoadList();
            chatUpdateAppBadge();
        }
    } catch (e) { /* 폴링 실패 무시 */ }
}

// 재연결 시 현재 열린 채팅의 메시지 갱신
async function chatRefreshMessages() {
    if (!chatCurrentId) return;
    try {
        const msgs = await chatApi('/' + chatCurrentId + '/messages?limit=20');
        if (!Array.isArray(msgs)) return;
        const messagesEl = document.getElementById('chat-messages');
        if (!messagesEl) return;
        let added = false;
        for (const m of msgs) {
            if (!messagesEl.querySelector(`[data-id="${m.id}"]`)) {
                messagesEl.insertAdjacentHTML('beforeend', chatRenderMsg(m));
                added = true;
            }
        }
        if (added) messagesEl.scrollTop = messagesEl.scrollHeight;
    } catch (e) { console.warn('[CHAT] refresh error:', e); }
}

// ── Per-chat mute ──
function chatIsMuted(chatId) {
    try {
        const muted = JSON.parse(localStorage.getItem('crowny_muted_chats') || '{}');
        return !!muted[chatId];
    } catch { return false; }
}
function chatToggleMute(chatId) {
    try {
        const muted = JSON.parse(localStorage.getItem('crowny_muted_chats') || '{}');
        if (muted[chatId]) delete muted[chatId];
        else muted[chatId] = Date.now();
        localStorage.setItem('crowny_muted_chats', JSON.stringify(muted));
        if (typeof showToast === 'function') {
            showToast(muted[chatId] ? t('messenger.muted','Notifications muted') : t('messenger.unmuted','Notifications on'), 'info');
        }
    } catch(e) { /* optional */ }
}

// ── App badge ──
function chatUpdateAppBadge() {
    try {
        const badges = document.querySelectorAll('.chat-badge');
        let total = 0;
        badges.forEach(b => { total += parseInt(b.textContent) || 0; });
        if (total > 0 && navigator.setAppBadge) {
            navigator.setAppBadge(total);
        } else if (navigator.clearAppBadge) {
            navigator.clearAppBadge();
        }
    } catch(e) { /* optional */ }
}

// ── 읽음 수신 (카카오톡 스타일: 안읽은 수 업데이트) ──

function chatOnRead(chatId, username) {
    if (chatId !== chatCurrentId || username === chatMyUsername) return;
    // 내 메시지들의 안읽은 수 감소
    document.querySelectorAll('.chat-msg.mine .chat-unread-count').forEach(el => {
        const count = parseInt(el.textContent) || 0;
        if (count <= 1) {
            el.remove(); // 모두 읽음 → 숫자 제거 (카카오톡처럼)
        } else {
            el.textContent = count - 1;
        }
    });
}

// ── 타이핑 (다중 사용자 지원) ──

function chatOnInputTyping() {
    if (!chatCurrentId) return;
    chatSendWs({ type: 'chat:typing', chatId: chatCurrentId, isTyping: true });
    clearTimeout(chatTypingTimers._self);
    chatTypingTimers._self = setTimeout(() => {
        chatSendWs({ type: 'chat:typing', chatId: chatCurrentId, isTyping: false });
    }, 2000);
}

function chatOnTyping(chatId, username, isTyping) {
    if (chatId !== chatCurrentId || username === chatMyUsername) return;
    if (isTyping) {
        chatTypingUsers.add(username);
        clearTimeout(chatTypingTimers[username]);
        chatTypingTimers[username] = setTimeout(() => {
            chatTypingUsers.delete(username);
            chatRenderTypingIndicator();
        }, 3000);
    } else {
        chatTypingUsers.delete(username);
        clearTimeout(chatTypingTimers[username]);
    }
    chatRenderTypingIndicator();
}

function chatRenderTypingIndicator() {
    const el = document.getElementById('chat-typing');
    if (!el) return;
    if (chatTypingUsers.size === 0) {
        el.style.display = 'none';
        el.innerHTML = '';
        return;
    }
    const users = Array.from(chatTypingUsers);
    let text = '';
    if (users.length === 1) {
        text = users[0] + ' ' + t('messenger.typing','is typing');
    } else if (users.length === 2) {
        text = users.join(', ') + ' ' + t('messenger.typing_plural','are typing');
    } else {
        text = users.slice(0, 2).join(', ') + ' ' + t('messenger.typing_others',`and ${users.length - 2} others are typing`);
    }
    el.innerHTML = `<span class="typing-dots"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span> ${chatEsc(text)}`;
    el.style.display = 'flex';
}

// ── 그룹 정보 패널 ──

async function chatShowGroupInfo(chatId) {
    const info = await chatApi('/' + chatId + '/info');
    if (!info || info.error) return;

    chatCloseGroupInfo(); // 기존 패널 정리
    const overlay = document.createElement('div');
    overlay.id = 'chat-group-info';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.5);z-index:9998;display:flex;justify-content:flex-end';
    overlay.onclick = (e) => { if (e.target === overlay) chatCloseGroupInfo(); };

    const isAdmin = info.admins && info.admins.includes(chatMyUsername);
    const members = info.participants || [];
    const statuses = info.participantStatus || [];

    overlay.innerHTML = `<div style="width:300px;max-width:85vw;height:100%;background:#FFF8F0;display:flex;flex-direction:column;overflow-y:auto;animation:slideInRight .2s ease;box-shadow:-4px 0 20px rgba(0,0,0,.1)">
        <div style="display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid #E8E0D8;flex-shrink:0">
            <button onclick="chatCloseGroupInfo()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:#3D2B1F;padding:4px 8px">✕</button>
            <strong style="font-size:0.95rem;color:#3D2B1F">${t('messenger.group_info','Group Info')}</strong>
        </div>
        <div style="padding:16px;flex:1">
            <div style="text-align:center;margin-bottom:1.2rem">
                <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#3D2B1F,#6B5744);display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:#FFF8F0;margin:0 auto 8px">G</div>
                <h3 style="margin:0 0 2px;font-size:1rem;color:#3D2B1F">${chatEsc(info.groupName || '')}</h3>
                <div style="font-size:0.75rem;color:#7A5C47">${members.length} ${t('messenger.members','members')}</div>
            </div>
            ${isAdmin ? `<div style="display:flex;gap:8px;justify-content:center;margin-bottom:1rem">
                <button onclick="chatEditGroupName('${chatId}')" style="padding:6px 14px;background:none;border:1px solid #E8E0D8;border-radius:8px;font-size:0.8rem;cursor:pointer;color:#3D2B1F">${t('messenger.rename_group','Rename')}</button>
                <button onclick="chatInviteToGroup('${chatId}')" style="padding:6px 14px;background:none;border:1px solid #E8E0D8;border-radius:8px;font-size:0.8rem;cursor:pointer;color:#3D2B1F">${t('messenger.invite','Invite')}</button>
            </div>` : ''}
            <div style="margin-bottom:1rem">
                <div style="font-size:0.8rem;font-weight:600;color:#3D2B1F;margin-bottom:8px">${t('messenger.members_title','Members')}</div>
                ${members.map(m => {
                    const status = statuses.find(s => s.username === m);
                    const online = status?.isOnline;
                    const isOwner = info.admins?.[0] === m;
                    const isMAdmin = info.admins?.includes(m);
                    const roleBadge = isOwner ? `<span style="font-size:0.6rem;background:#F7F3ED;color:#6B5744;padding:1px 5px;border-radius:4px;margin-left:4px">${t('messenger.owner','Owner')}</span>` :
                        isMAdmin ? `<span style="font-size:0.6rem;background:#F7F3ED;color:#6B8F3C;padding:1px 5px;border-radius:4px;margin-left:4px">${t('messenger.admin','Admin')}</span>` : '';
                    const kickBtn = isAdmin && m !== chatMyUsername && !isOwner ?
                        `<button onclick="chatKickMember('${chatId}','${chatEsc(m)}')" style="margin-left:auto;padding:3px 8px;background:none;border:1px solid #E8E0D8;border-radius:6px;font-size:0.65rem;cursor:pointer;color:#B54534">${t('messenger.kick','Kick')}</button>` : '';
                    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #F0E8DC">
                        <span style="width:8px;height:8px;border-radius:50%;background:${online ? '#6B8F3C' : '#E8E0D8'};flex-shrink:0"></span>
                        <span style="flex:1;font-size:0.85rem;color:#3D2B1F">${chatEsc(m)}${roleBadge}</span>
                        ${kickBtn}
                    </div>`;
                }).join('')}
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;padding-top:8px;border-top:1px solid #E8E0D8">
                <button onclick="chatToggleMute('${chatId}')" style="width:100%;padding:8px;background:none;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;font-size:0.8rem;color:#3D2B1F">${chatIsMuted(chatId) ? t('messenger.unmute','Unmute') : t('messenger.mute','Mute')}</button>
                <button onclick="chatLeaveGroup('${chatId}')" style="width:100%;padding:8px;background:none;border:1px solid #B54534;border-radius:8px;cursor:pointer;font-size:0.8rem;color:#B54534">${t('messenger.leave_group','Leave Group')}</button>
            </div>
        </div>
    </div>`;

    document.body.appendChild(overlay);
}

function chatCloseGroupInfo() {
    const el = document.getElementById('chat-group-info');
    if (el) el.remove();
}

async function chatEditGroupName(chatId) {
    const name = prompt(t('messenger.new_group_name','Enter new group name:'));
    if (!name || !name.trim()) return;
    await chatApi('/' + chatId + '/group', { method: 'POST', body: { groupName: name.trim() } });
    chatShowGroupInfo(chatId);
    chatLoadList();
}

async function chatInviteToGroup(chatId) {
    chatShowUserSearch('invite');
    const modal = document.getElementById('chat-user-search-modal');
    if (modal) modal._inviteChatId = chatId;
}

async function chatKickMember(chatId, username) {
    if (!confirm(t('messenger.kick_confirm', `Remove ${username} from group?`))) return;
    await chatApi('/' + chatId + '/group', { method: 'POST', body: { removeMember: username } });
    chatShowGroupInfo(chatId);
}

async function chatLeaveGroup(chatId) {
    if (!confirm(t('messenger.leave_confirm','Leave this group?'))) return;
    await chatApi('/' + chatId + '/group', { method: 'POST', body: { removeMember: chatMyUsername } });
    chatCloseGroupInfo();
    chatCurrentId = null;
    chatBack();
}

// ── 새 채팅 ──

let chatSearchTimer = null;

function chatNewDm() {
    chatShowUserSearch('dm');
}

function chatNewGroup() {
    chatShowUserSearch('group');
}

function chatShowUserSearch(mode) {
    let modal = document.getElementById('chat-user-search-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'chat-user-search-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    const isGroup = mode === 'group';
    const isInvite = mode === 'invite';
    const title = isInvite ? t('messenger.invite_member','Invite Member') :
        isGroup ? t('messenger.new_group','Create Group') : t('messenger.find_user','Find User');
    modal.innerHTML = `<div style="background:#FFF8F0;border-radius:16px;width:100%;max-width:400px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.15)">
        <div style="padding:16px;border-bottom:1px solid #E8E0D8;display:flex;align-items:center;justify-content:space-between">
            <h3 style="margin:0;font-size:1rem;color:#3D2B1F">${title}</h3>
            <button onclick="this.closest('#chat-user-search-modal').remove()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:#7A5C47;padding:4px 8px">✕</button>
        </div>
        ${isGroup ? `<div style="padding:8px 16px;border-bottom:1px solid #F0E8DC"><input id="chat-group-name-input" placeholder="${t('messenger.group_name','Group Name')}" style="width:100%;padding:8px 12px;border:1px solid #E8E0D8;border-radius:8px;font-size:0.9rem;background:#fff;outline:none"></div>` : ''}
        <div style="padding:8px 16px">
            <input id="chat-user-search-input" class="crny-search-input" placeholder="${t('messenger.search_placeholder','Search by ID or name...')}" style="width:100%;padding:10px 14px;font-size:0.9rem;background:#fff" oninput="chatSearchUsers()">
        </div>
        ${(isGroup || isInvite) ? `<div id="chat-selected-users" style="padding:0 16px;display:flex;flex-wrap:wrap;gap:6px"></div>` : ''}
        <div id="chat-user-search-results" style="flex:1;overflow-y:auto;padding:0 8px 8px">
            <div style="text-align:center;padding:20px;color:#A08060;font-size:0.85rem">${t('messenger.enter_id','Enter a username')}</div>
        </div>
        ${(isGroup || isInvite) ? `<div style="padding:12px 16px;border-top:1px solid #E8E0D8"><button id="chat-create-group-btn" onclick="${isInvite ? 'chatDoInvite()' : 'chatCreateGroup()'}" style="width:100%;padding:10px;background:#3D2B1F;color:#FFF8F0;border:none;border-radius:10px;font-size:0.9rem;font-weight:600;cursor:pointer">${isInvite ? t('messenger.invite','Invite') : t('messenger.new_group','Create Group')}</button></div>` : ''}
    </div>`;
    document.body.appendChild(modal);
    modal._mode = mode;
    modal._selected = [];
    setTimeout(() => document.getElementById('chat-user-search-input')?.focus(), 100);
}

async function chatDoInvite() {
    const modal = document.getElementById('chat-user-search-modal');
    if (!modal || !modal._inviteChatId || modal._selected.length === 0) return;
    for (const username of modal._selected) {
        await chatApi('/' + modal._inviteChatId + '/group', { method: 'POST', body: { addMember: username } });
    }
    modal.remove();
    chatShowGroupInfo(modal._inviteChatId);
}

async function chatSearchUsers() {
    clearTimeout(chatSearchTimer);
    chatSearchTimer = setTimeout(async () => {
        const input = document.getElementById('chat-user-search-input');
        const container = document.getElementById('chat-user-search-results');
        if (!input || !container) return;
        const q = input.value.trim();
        if (q.length < 1) { container.innerHTML = `<div style="text-align:center;padding:20px;color:#A08060;font-size:0.85rem">${t('messenger.enter_id','Enter a username')}</div>`; return; }

        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        try {
            const r = await fetch('/api/users/search?q=' + encodeURIComponent(q), { headers: { 'Authorization': 'Bearer ' + token } });
            const users = await r.json();
            if (!Array.isArray(users) || users.length === 0) {
                container.innerHTML = `<div style="text-align:center;padding:20px;color:#A08060;font-size:0.85rem">${t('messenger.no_results','No results found')}</div>`;
                return;
            }
            container.innerHTML = users.map(u => `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;cursor:pointer;border-radius:10px;transition:background .15s" onmouseover="this.style.background='#F7F3ED'" onmouseout="this.style.background=''" onclick="chatPickUser('${chatEsc(u.username)}')">
                <div style="width:38px;height:38px;border-radius:50%;background:#8B6914;color:#FFF8F0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.9rem;flex-shrink:0">${(u.username[0] || '?').toUpperCase()}</div>
                <div style="min-width:0">
                    <div style="font-size:0.9rem;font-weight:600;color:#3D2B1F">${chatEsc(u.displayName || u.username)}</div>
                    <div style="font-size:0.75rem;color:#7A5C47">@${chatEsc(u.username)}</div>
                </div>
            </div>`).join('');
        } catch {
            container.innerHTML = `<div style="text-align:center;padding:20px;color:#B54534;font-size:0.85rem">${t('messenger.search_error','Search error')}</div>`;
        }
    }, 300);
}

async function chatPickUser(username) {
    const modal = document.getElementById('chat-user-search-modal');
    if (!modal) return;
    if (modal._mode === 'dm') {
        modal.remove();
        const chat = await chatApi('/create', { method: 'POST', body: { to: username, type: 'dm' } });
        if (chat && chat.id) { chatOpen(chat.id); chatLoadList(); }
        else if (typeof showToast === 'function') showToast(chat?.error || t('messenger.create_fail','Creation failed'), 'error');
    } else {
        if (!modal._selected.includes(username)) {
            modal._selected.push(username);
            chatRenderSelectedUsers();
        }
    }
}

function chatRemoveSelectedUser(username) {
    const modal = document.getElementById('chat-user-search-modal');
    if (!modal) return;
    modal._selected = modal._selected.filter(u => u !== username);
    chatRenderSelectedUsers();
}

function chatRenderSelectedUsers() {
    const modal = document.getElementById('chat-user-search-modal');
    const container = document.getElementById('chat-selected-users');
    if (!modal || !container) return;
    container.innerHTML = modal._selected.map(u => `<span style="display:inline-flex;align-items:center;gap:4px;background:#E8E0D8;color:#3D2B1F;padding:4px 10px;border-radius:12px;font-size:0.8rem;font-weight:600">@${chatEsc(u)}<button onclick="chatRemoveSelectedUser('${chatEsc(u)}')" style="background:none;border:none;cursor:pointer;color:#7A5C47;font-size:0.9rem;padding:0 2px">✕</button></span>`).join('');
}

async function chatCreateGroup() {
    const modal = document.getElementById('chat-user-search-modal');
    if (!modal || modal._selected.length === 0) {
        if (typeof showToast === 'function') showToast(t('messenger.select_members','Please select members'), 'error');
        return;
    }
    const nameInput = document.getElementById('chat-group-name-input');
    const groupName = nameInput ? nameInput.value.trim() : '';
    if (!groupName) {
        if (typeof showToast === 'function') showToast(t('messenger.enter_group_name','Please enter a group name'), 'error');
        nameInput?.focus();
        return;
    }
    modal.remove();
    const chat = await chatApi('/create', { method: 'POST', body: { to: modal._selected, type: 'group', groupName } });
    if (chat && chat.id) { chatOpen(chat.id); chatLoadList(); }
    else if (typeof showToast === 'function') showToast(chat?.error || t('messenger.create_fail','Creation failed'), 'error');
}

// ── 검색 ──

async function chatSearch() {
    const input = document.getElementById('chat-search');
    if (!input) return;
    const q = input.value.trim();
    if (q.length < 2) { chatLoadList(); return; }
    const results = await chatApi('/search?q=' + encodeURIComponent(q));
    const container = document.getElementById('chat-list-items');
    if (!container || !Array.isArray(results)) return;
    if (results.length === 0) { container.innerHTML = `<div class="chat-empty">${t('messenger.no_results','No results found')}</div>`; return; }
    container.innerHTML = results.map(m => `<div class="chat-item" onclick="chatOpen('${m.chatId}')">
        <div class="chat-avatar">${(m.senderId || '?')[0].toUpperCase()}</div>
        <div class="chat-item-body">
            <div class="chat-item-top"><span class="chat-item-name">${chatEsc(m.chatName || m.senderId)}</span><span class="chat-item-time">${chatFmtTime(m.timestamp)}</span></div>
            <div class="chat-item-preview">${chatEsc(m.text?.slice(0, 60) || '')}</div>
        </div>
    </div>`).join('');
}

// ── 뒤로가기 (모바일) ──

function chatBack() {
    chatCurrentId = null;
    chatEditingMsgId = null;
    chatReplyToMsgId = null;
    chatTypingUsers.clear();
    chatStopPolling();
    document.getElementById('chat-panel')?.classList.remove('open');
    chatCloseGroupInfo();
    const btb = document.getElementById('bottom-tab-bar');
    if (btb) btb.style.display = '';
    chatLoadList();
    chatUpdateAppBadge();
}

// ── 유틸 ──

function chatEsc(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;');
}

function chatLinkify(text) {
    return text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="chat-link">$1</a>');
}

function chatFmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    const lang = (typeof currentLang !== 'undefined' ? currentLang : 'ko') || 'ko';
    const locale = lang === 'ko' ? 'ko-KR' : lang === 'ja' ? 'ja-JP' : lang === 'zh' ? 'zh-CN' : lang === 'es' ? 'es' : 'en';
    if (diff < 60000) return t('messenger.time_just_now', 'Just now');
    if (diff < 3600000) return Math.floor(diff / 60000) + t('messenger.time_min_ago', 'm ago');
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const days = [t('messenger.day_sun','Sun'),t('messenger.day_mon','Mon'),t('messenger.day_tue','Tue'),t('messenger.day_wed','Wed'),t('messenger.day_thu','Thu'),t('messenger.day_fri','Fri'),t('messenger.day_sat','Sat')];
    if (diff < 86400000 * 7) return days[d.getDay()] + ' ' + d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    return (d.getMonth() + 1) + '/' + d.getDate();
}

function chatFmtDate(ts) {
    const d = new Date(ts);
    const lang = (typeof currentLang !== 'undefined' ? currentLang : 'ko') || 'ko';
    const locale = lang === 'ko' ? 'ko-KR' : lang === 'ja' ? 'ja-JP' : lang === 'zh' ? 'zh-CN' : lang === 'es' ? 'es' : 'en';
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

function chatFmtFileSize(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

// ── 메시지 번역 ──

async function chatTranslateMsg(btn, msgId, text) {
    const targetLang = (typeof currentLang !== 'undefined' ? currentLang : 'en') || 'en';
    btn.textContent = '...';
    btn.disabled = true;
    try {
        const r = await chatApi('/translate', { method: 'POST', body: { text, targetLang } });
        if (r.translated && r.translated !== text) {
            // Show translated text below the bubble
            const msgEl = document.querySelector(`.chat-msg[data-id="${msgId}"]`);
            if (msgEl) {
                const existing = msgEl.querySelector('.chat-translated');
                if (existing) existing.remove();
                const transDiv = document.createElement('div');
                transDiv.className = 'chat-translated';
                transDiv.textContent = r.translated;
                const bubble = msgEl.querySelector('.chat-bubble');
                if (bubble) bubble.after(transDiv);
            }
            btn.textContent = t('messenger.translated', 'Translated');
        } else {
            btn.textContent = t('messenger.same_lang', 'Same language');
        }
    } catch (e) {
        btn.textContent = t('messenger.translate', 'Translate');
        btn.disabled = false;
    }
}

// ── 글로벌 등록 ──

async function chatNewDmWith(username) {
    try {
        const chat = await chatApi('/create', { method: 'POST', body: { to: username } });
        if (chat && chat.id) { chatOpen(chat.id); chatLoadList(); }
        showPage('messenger');
    } catch(e) { console.warn('[CHAT] DM 시작 실패:', e); }
}

window.chatInit = chatInit;
window.chatNewDmWith = chatNewDmWith;
window.chatOpen = chatOpen;
window.chatSend = chatSend;
window.chatNewDm = chatNewDm;
window.chatNewGroup = chatNewGroup;
window.chatSearch = chatSearch;
window.chatBack = chatBack;
window.chatOnInputTyping = chatOnInputTyping;
window.chatToggleCrmm = chatToggleCrmm;
window.chatSearchUsers = chatSearchUsers;
window.chatPickUser = chatPickUser;
window.chatRemoveSelectedUser = chatRemoveSelectedUser;
window.chatCreateGroup = chatCreateGroup;
window.chatAttachFile = chatAttachFile;
window.chatDeleteMsg = chatDeleteMsg;
window.chatEditMsg = chatEditMsg;
window.chatCancelEdit = chatCancelEdit;
window.chatReplyTo = chatReplyTo;
window.chatHideReplyBar = chatHideReplyBar;
window.chatPreviewImage = chatPreviewImage;
window.chatShowGroupInfo = chatShowGroupInfo;
window.chatCloseGroupInfo = chatCloseGroupInfo;
window.chatDoInvite = chatDoInvite;
window.chatEditGroupName = chatEditGroupName;
window.chatInviteToGroup = chatInviteToGroup;
window.chatKickMember = chatKickMember;
window.chatLeaveGroup = chatLeaveGroup;
window.chatToggleMute = chatToggleMute;
window.chatTranslateMsg = chatTranslateMsg;
