// chat.js — CrownyTVM 독립 메신저 클라이언트
// WebSocket 실시간 + REST API · Firebase 의존성 없음
'use strict';

let chatWs = null;
let chatReconnectTimer = null;
let chatReconnectDelay = 1000;
let chatCurrentId = null;
let chatMyUsername = null;
let chatOnlineUsers = new Set();
let chatTypingTimers = {};

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
        chatReconnectDelay = 1000;
        chatWs.send(JSON.stringify({ type: 'auth', token }));
    };
    chatWs.onmessage = (e) => { try { chatHandleWs(JSON.parse(e.data)); } catch {} };
    chatWs.onclose = () => chatScheduleReconnect();
    chatWs.onerror = () => {};
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
            chatMyUsername = data.username;
            chatOnlineUsers = new Set(data.online || []);
            chatLoadList();
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
        container.innerHTML = `<div class="chat-empty">${t('messenger.no_chats','대화가 없습니다')}<br><small>${t('messenger.start_hint','+ 버튼으로 시작하세요')}</small></div>`;
        return;
    }

    container.innerHTML = list.map(c => {
        const name = c.displayName || '?';
        const isOnline = c.type === 'dm' && chatOnlineUsers.has(name);
        const unread = c.unread > 0 ? `<span class="chat-badge">${c.unread}</span>` : '';
        const time = c.lastMessageTime ? chatFmtTime(c.lastMessageTime) : '';
        const preview = chatEsc(c.lastMessageText || '');
        const isGroup = c.type === 'group';
        return `<div class="chat-item${chatCurrentId === c.id ? ' active' : ''}${c.unread > 0 ? ' unread' : ''}" onclick="chatOpen('${c.id}')">
            ${c.photoURL ? `<img src="${chatEsc(c.photoURL)}" class="chat-avatar${isOnline ? ' online' : ''}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;">` : `<div class="chat-avatar${isOnline ? ' online' : ''}">${isGroup ? 'G' : (name[0] || '?').toUpperCase()}</div>`}
            <div class="chat-item-body">
                <div class="chat-item-top"><span class="chat-item-name">${chatEsc(name)}</span><span class="chat-item-time">${time}</span></div>
                <div class="chat-item-preview">${preview}${unread}</div>
            </div>
        </div>`;
    }).join('');
}

// ── 채팅 열기 ──

async function chatOpen(chatId) {
    chatCurrentId = chatId;
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
    // Clear app badge when opening a chat
    chatUpdateAppBadge();

    // 채팅방 정보
    const info = await chatApi('/' + chatId + '/info');
    if (headerEl && info && !info.error) {
        const name = info.groupName || info.participants.filter(p => p !== chatMyUsername)[0] || '';
        const isOnline = info.type === 'dm' && info.participantStatus?.some(p => p.username !== chatMyUsername && p.isOnline);
        headerEl.innerHTML = `<strong>${chatEsc(name)}</strong><span class="chat-status">${isOnline ? ' ' + t('messenger.online','온라인') : ''}</span>`;
    }

    // 메시지 로드
    const msgs = await chatApi('/' + chatId + '/messages?limit=50');
    if (!Array.isArray(msgs)) { messagesEl.innerHTML = ''; return; }

    messagesEl.innerHTML = msgs.map(m => chatRenderMsg(m)).join('');
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // 읽음 처리 (REST로 확실하게 + 이후 리스트 갱신)
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
    const isMine = m.senderId === chatMyUsername;
    const time = chatFmtTime(m.timestamp);
    const replyHtml = m.replyTo ? `<div class="chat-reply-ref">↩ ${chatEsc(String(m.replyTo).slice(0, 40))}</div>` : '';
    const tipHtml = m.crmmTip ? `<span class="chat-tip-badge">${m.crmmTip} ${t('messenger.mam_unit','맘')}</span>` : '';
    // 읽음/전송 상태 (내 메시지만)
    let statusHtml = '';
    if (isMine) {
        const readByOthers = (m.readBy || []).filter(u => u !== chatMyUsername);
        if (readByOthers.length > 0) statusHtml = `<span class="chat-read">${t('messenger.read','읽음')}</span>`;
        else statusHtml = `<span class="chat-sent">${t('messenger.sent_status','전송됨')}</span>`;
    }
    return `<div class="chat-msg ${isMine ? 'mine' : 'theirs'}" data-id="${m.id}">
        ${!isMine ? `<div class="chat-msg-sender">${chatEsc(m.senderId)}</div>` : ''}
        ${replyHtml}
        <div class="chat-bubble">${chatEsc(m.text)}${tipHtml}</div>
        <div class="chat-msg-meta">${statusHtml}<span class="chat-msg-time">${time}</span></div>
    </div>`;
}

// ── 메시지 전송 (항상 REST — CRMM 팁 + 상태 확실) ──

let _chatSending = false;
async function chatSend() {
    if (_chatSending) return;
    const input = document.getElementById('chat-input');
    if (!input || !chatCurrentId) return;
    const text = input.value.trim();
    if (!text) return;
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
            // 잔액 표시
            const balEl = document.getElementById('chat-crmm-balance');
            if (balEl) {
                balEl.textContent = t('messenger.checking_balance','잔액 확인 중...');
                try {
                    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
                    const r = await fetch('/api/wallet', { headers: { 'Authorization': 'Bearer ' + token } });
                    const w = await r.json();
                    const crm = (w.offchainBalances && w.offchainBalances.CRM) || 0;
                    balEl.textContent = t('messenger.mam_balance','보유 맘: ') + crm.toLocaleString();
                } catch { balEl.textContent = ''; }
            }
        }
    }
}

// ── 수신 메시지 처리 ──

function chatOnMessage(msg) {
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
            // Mark read via REST (reliable) then refresh list to clear badge
            chatApi('/' + msg.chatId + '/read', { method: 'POST', body: {} }).then(() => {
                chatLoadList();
                chatUpdateAppBadge();
            });
            chatSendWs({ type: 'chat:read', chatId: msg.chatId });
        }
    } else {
        // Not viewing this chat — refresh list to show new unread badge
        chatLoadList();
    }

    // ── Notification for messages from others ──
    if (msg.senderId && msg.senderId !== chatMyUsername) {
        const isViewingThisChat = msg.chatId === chatCurrentId && document.hasFocus() &&
            document.querySelector('.page.active')?.id === 'messenger';

        if (!isViewingThisChat && !chatIsMuted(msg.chatId)) {
            // Sound
            chatPlayNotifSound();
            // Vibration (mobile)
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            // Browser notification (background tab / minimized)
            const senderName = msg.senderNick || msg.senderId;
            const preview = (msg.text || '').substring(0, 80);
            if (typeof showBrowserNotification === 'function') {
                showBrowserNotification(senderName, preview, { chatId: msg.chatId, otherId: msg.senderId });
            }
            // In-app notification
            if (typeof addNotification === 'function') {
                addNotification('messenger', `💬 ${senderName}: ${preview}`, { chatId: msg.chatId, otherId: msg.senderId });
            }
            // App badge (unread count on home screen icon)
            chatUpdateAppBadge();
        }
    }
}

// ── Notification sound (KakaoTalk-style two-tone chime) ──
function chatPlayNotifSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;
        // First tone
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.connect(gain1); gain1.connect(ctx.destination);
        osc1.type = 'sine';
        osc1.frequency.value = 830;
        gain1.gain.setValueAtTime(0.2, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc1.start(now); osc1.stop(now + 0.12);
        // Second tone (higher)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2); gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.value = 1050;
        gain2.gain.setValueAtTime(0, now + 0.1);
        gain2.gain.linearRampToValueAtTime(0.18, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc2.start(now + 0.1); osc2.stop(now + 0.3);
        // Auto-close context
        setTimeout(() => ctx.close(), 500);
    } catch(e) {}
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
    } catch(e) {}
}

// ── App badge (unread count on PWA icon) ──
function chatUpdateAppBadge() {
    try {
        // Count total unread from chat list
        const badges = document.querySelectorAll('.chat-badge');
        let total = 0;
        badges.forEach(b => { total += parseInt(b.textContent) || 0; });
        if (total > 0 && navigator.setAppBadge) {
            navigator.setAppBadge(total);
        } else if (navigator.clearAppBadge) {
            navigator.clearAppBadge();
        }
    } catch(e) {}
}

// ── 읽음 수신 ──

function chatOnRead(chatId, username) {
    if (chatId !== chatCurrentId || username === chatMyUsername) return;
    // 내 메시지들의 '전송됨' → '읽음' 업데이트
    document.querySelectorAll('.chat-msg.mine .chat-sent').forEach(el => {
        el.textContent = t('messenger.read','읽음');
        el.className = 'chat-read';
    });
}

// ── 타이핑 ──

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
    const el = document.getElementById('chat-typing');
    if (!el) return;
    if (isTyping) {
        el.textContent = username + ' ' + t('messenger.typing','입력 중...');
        el.style.display = 'block';
        clearTimeout(chatTypingTimers[username]);
        chatTypingTimers[username] = setTimeout(() => { el.style.display = 'none'; }, 3000);
    } else {
        el.style.display = 'none';
    }
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
    // 모달 생성
    let modal = document.getElementById('chat-user-search-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'chat-user-search-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    const isGroup = mode === 'group';
    modal.innerHTML = `<div style="background:#FFF8F0;border-radius:16px;width:100%;max-width:400px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.15)">
        <div style="padding:16px;border-bottom:1px solid #E8E0D8;display:flex;align-items:center;justify-content:space-between">
            <h3 style="margin:0;font-size:1rem;color:#3D2B1F">${isGroup ? t('messenger.new_group','그룹 만들기') : t('messenger.find_user','회원 찾기')}</h3>
            <button onclick="this.closest('#chat-user-search-modal').remove()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:#7A5C47;padding:4px 8px">✕</button>
        </div>
        ${isGroup ? `<div style="padding:8px 16px;border-bottom:1px solid #F0E8DC"><input id="chat-group-name-input" placeholder="${t('messenger.group_name','그룹 이름')}" style="width:100%;padding:8px 12px;border:1px solid #E8E0D8;border-radius:8px;font-size:0.9rem;background:#fff;outline:none"></div>` : ''}
        <div style="padding:8px 16px">
            <input id="chat-user-search-input" placeholder="${t('messenger.search_placeholder','아이디 또는 이름 검색...')}" style="width:100%;padding:10px 14px;border:1px solid #E8E0D8;border-radius:20px;font-size:0.9rem;background:#fff;outline:none" oninput="chatSearchUsers()">
        </div>
        ${isGroup ? `<div id="chat-selected-users" style="padding:0 16px;display:flex;flex-wrap:wrap;gap:6px"></div>` : ''}
        <div id="chat-user-search-results" style="flex:1;overflow-y:auto;padding:0 8px 8px">
            <div style="text-align:center;padding:20px;color:#A08060;font-size:0.85rem">${t('messenger.enter_id','아이디를 입력하세요')}</div>
        </div>
        ${isGroup ? `<div style="padding:12px 16px;border-top:1px solid #E8E0D8"><button id="chat-create-group-btn" onclick="chatCreateGroup()" style="width:100%;padding:10px;background:#3D2B1F;color:#FFF8F0;border:none;border-radius:10px;font-size:0.9rem;font-weight:600;cursor:pointer">${t('messenger.new_group','그룹 만들기')}</button></div>` : ''}
    </div>`;
    document.body.appendChild(modal);
    modal._mode = mode;
    modal._selected = [];
    setTimeout(() => document.getElementById('chat-user-search-input')?.focus(), 100);
}

async function chatSearchUsers() {
    clearTimeout(chatSearchTimer);
    chatSearchTimer = setTimeout(async () => {
        const input = document.getElementById('chat-user-search-input');
        const container = document.getElementById('chat-user-search-results');
        if (!input || !container) return;
        const q = input.value.trim();
        if (q.length < 1) { container.innerHTML = `<div style="text-align:center;padding:20px;color:#A08060;font-size:0.85rem">${t('messenger.enter_id','아이디를 입력하세요')}</div>`; return; }

        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        try {
            const r = await fetch('/api/users/search?q=' + encodeURIComponent(q), { headers: { 'Authorization': 'Bearer ' + token } });
            const users = await r.json();
            if (!Array.isArray(users) || users.length === 0) {
                container.innerHTML = `<div style="text-align:center;padding:20px;color:#A08060;font-size:0.85rem">${t('messenger.no_results','검색 결과 없음')}</div>`;
                return;
            }
            const modal = document.getElementById('chat-user-search-modal');
            const isGroup = modal && modal._mode === 'group';
            container.innerHTML = users.map(u => `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;cursor:pointer;border-radius:10px;transition:background .15s" onmouseover="this.style.background='#F7F3ED'" onmouseout="this.style.background=''" onclick="chatPickUser('${chatEsc(u.username)}')">
                <div style="width:38px;height:38px;border-radius:50%;background:#8B6914;color:#FFF8F0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.9rem;flex-shrink:0">${(u.username[0] || '?').toUpperCase()}</div>
                <div style="min-width:0">
                    <div style="font-size:0.9rem;font-weight:600;color:#3D2B1F">${chatEsc(u.displayName || u.username)}</div>
                    <div style="font-size:0.75rem;color:#7A5C47">@${chatEsc(u.username)}</div>
                </div>
            </div>`).join('');
        } catch {
            container.innerHTML = `<div style="text-align:center;padding:20px;color:#B54534;font-size:0.85rem">${t('messenger.search_error','검색 오류')}</div>`;
        }
    }, 300);
}

async function chatPickUser(username) {
    const modal = document.getElementById('chat-user-search-modal');
    if (!modal) return;
    if (modal._mode === 'dm') {
        // DM — 즉시 대화 시작
        modal.remove();
        const chat = await chatApi('/create', { method: 'POST', body: { to: username, type: 'dm' } });
        if (chat && chat.id) { chatOpen(chat.id); chatLoadList(); }
        else if (typeof showToast === 'function') showToast(chat?.error || t('messenger.create_fail','생성 실패'), 'error');
    } else {
        // 그룹 — 선택 목록에 추가
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
        if (typeof showToast === 'function') showToast(t('messenger.select_members','멤버를 선택하세요'), 'error');
        return;
    }
    const nameInput = document.getElementById('chat-group-name-input');
    const groupName = nameInput ? nameInput.value.trim() : '';
    if (!groupName) {
        if (typeof showToast === 'function') showToast(t('messenger.enter_group_name','그룹 이름을 입력하세요'), 'error');
        nameInput?.focus();
        return;
    }
    modal.remove();
    const chat = await chatApi('/create', { method: 'POST', body: { to: modal._selected, type: 'group', groupName } });
    if (chat && chat.id) { chatOpen(chat.id); chatLoadList(); }
    else if (typeof showToast === 'function') showToast(chat?.error || t('messenger.create_fail','생성 실패'), 'error');
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
    if (results.length === 0) { container.innerHTML = `<div class="chat-empty">${t('messenger.no_results','검색 결과 없음')}</div>`; return; }
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
    document.getElementById('chat-panel')?.classList.remove('open');
    // 모바일: 하단 탭바 복원
    const btb = document.getElementById('bottom-tab-bar');
    if (btb) btb.style.display = '';
    // 목록 새로고침 + 배지 업데이트 (읽음 반영)
    chatLoadList();
    chatUpdateAppBadge();
}

// ── 유틸 ──

function chatEsc(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function chatFmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    const lang = (typeof currentLang !== 'undefined' ? currentLang : 'ko') || 'ko';
    const locale = lang === 'ko' ? 'ko-KR' : lang === 'ja' ? 'ja-JP' : lang === 'zh' ? 'zh-CN' : lang === 'es' ? 'es' : 'en';
    if (diff < 60000) return t('messenger.time_just_now', '방금');
    if (diff < 3600000) return Math.floor(diff / 60000) + t('messenger.time_min_ago', '분 전');
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const days = [t('messenger.day_sun','일'),t('messenger.day_mon','월'),t('messenger.day_tue','화'),t('messenger.day_wed','수'),t('messenger.day_thu','목'),t('messenger.day_fri','금'),t('messenger.day_sat','토')];
    if (diff < 86400000 * 7) return days[d.getDay()] + ' ' + d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    return (d.getMonth() + 1) + '/' + d.getDate();
}

// ── 글로벌 등록 ──

// 연락처에서 DM 시작
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
