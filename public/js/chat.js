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
    if (!chatMyUsername) return;
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
    const container = document.getElementById('chat-list-items');
    if (!container) return;

    if (!Array.isArray(list) || list.length === 0) {
        container.innerHTML = '<div class="chat-empty">대화가 없습니다<br><small>+ 버튼으로 시작하세요</small></div>';
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
            <div class="chat-avatar${isOnline ? ' online' : ''}">${isGroup ? 'G' : (name[0] || '?').toUpperCase()}</div>
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
    messagesEl.innerHTML = '<div class="chat-loading">불러오는 중...</div>';
    if (inputArea) inputArea.style.display = 'flex';

    // 채팅방 정보
    const info = await chatApi('/' + chatId + '/info');
    if (headerEl && info && !info.error) {
        const name = info.groupName || info.participants.filter(p => p !== chatMyUsername)[0] || '';
        const isOnline = info.type === 'dm' && info.participantStatus?.some(p => p.username !== chatMyUsername && p.isOnline);
        headerEl.innerHTML = `<strong>${chatEsc(name)}</strong><span class="chat-status">${isOnline ? ' 온라인' : ''}</span>`;
    }

    // 메시지 로드
    const msgs = await chatApi('/' + chatId + '/messages?limit=50');
    if (!Array.isArray(msgs)) { messagesEl.innerHTML = ''; return; }

    messagesEl.innerHTML = msgs.map(m => chatRenderMsg(m)).join('');
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // 읽음 처리
    chatSendWs({ type: 'chat:read', chatId });

    // 모바일
    document.getElementById('chat-panel')?.classList.add('open');
    chatLoadList();
}

// ── 메시지 렌더링 ──

function chatRenderMsg(m) {
    const isMine = m.senderId === chatMyUsername;
    const time = chatFmtTime(m.timestamp);
    const replyHtml = m.replyTo ? `<div class="chat-reply-ref">↩ ${chatEsc(String(m.replyTo).slice(0, 40))}</div>` : '';
    const tipHtml = m.crmmTip ? `<span class="chat-tip-badge">${m.crmmTip} 맘</span>` : '';
    // 읽음/전송 상태 (내 메시지만)
    let statusHtml = '';
    if (isMine) {
        const readByOthers = (m.readBy || []).filter(u => u !== chatMyUsername);
        if (readByOthers.length > 0) statusHtml = '<span class="chat-read">읽음</span>';
        else statusHtml = '<span class="chat-sent">전송됨</span>';
    }
    return `<div class="chat-msg ${isMine ? 'mine' : 'theirs'}" data-id="${m.id}">
        ${!isMine ? `<div class="chat-msg-sender">${chatEsc(m.senderId)}</div>` : ''}
        ${replyHtml}
        <div class="chat-bubble">${chatEsc(m.text)}${tipHtml}</div>
        <div class="chat-msg-meta">${statusHtml}<span class="chat-msg-time">${time}</span></div>
    </div>`;
}

// ── 메시지 전송 (항상 REST — CRMM 팁 + 상태 확실) ──

async function chatSend() {
    const input = document.getElementById('chat-input');
    if (!input || !chatCurrentId) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const crmmInput = document.getElementById('chat-crmm');
    const crmm = crmmInput ? parseInt(crmmInput.value) || 0 : 0;
    if (crmmInput) crmmInput.value = '';
    // CRM 패널 숨기기
    const crmmWrap = document.getElementById('chat-crmm-wrap');
    if (crmmWrap) crmmWrap.style.display = 'none';

    const body = { text };
    if (crmm > 0) body.crmm = crmm;

    const r = await chatApi('/' + chatCurrentId + '/send', { method: 'POST', body });
    if (r.msg) {
        chatOnMessage(r.msg);
        if (crmm > 0 && r.msg.crmmTip) {
            if (typeof showToast === 'function') showToast(crmm + ' 맘 전송 완료', 'success');
        } else if (crmm > 0 && !r.msg.crmmTip) {
            if (typeof showToast === 'function') showToast('맘 전송 실패 (잔액 부족?)', 'error');
        }
    } else if (r.error) {
        if (typeof showToast === 'function') showToast(r.error, 'error');
    }
}

function chatToggleCrmm() {
    const el = document.getElementById('chat-crmm-wrap');
    if (el) {
        const show = el.style.display === 'none';
        el.style.display = show ? 'flex' : 'none';
        if (show) document.getElementById('chat-crmm')?.focus();
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
            chatSendWs({ type: 'chat:read', chatId: msg.chatId });
        }
    }
    chatLoadList();
}

// ── 읽음 수신 ──

function chatOnRead(chatId, username) {
    if (chatId !== chatCurrentId || username === chatMyUsername) return;
    // 내 메시지들의 '전송됨' → '읽음' 업데이트
    document.querySelectorAll('.chat-msg.mine .chat-sent').forEach(el => {
        el.textContent = '읽음';
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
        el.textContent = username + ' 입력 중...';
        el.style.display = 'block';
        clearTimeout(chatTypingTimers[username]);
        chatTypingTimers[username] = setTimeout(() => { el.style.display = 'none'; }, 3000);
    } else {
        el.style.display = 'none';
    }
}

// ── 새 채팅 ──

async function chatNewDm() {
    const to = prompt('대화할 상대 아이디:');
    if (!to || !to.trim()) return;
    const chat = await chatApi('/create', { method: 'POST', body: { to: to.trim(), type: 'dm' } });
    if (chat && chat.id) { chatOpen(chat.id); chatLoadList(); }
    else if (typeof showToast === 'function') showToast(chat?.error || '생성 실패', 'error');
}

async function chatNewGroup() {
    const name = prompt('그룹 이름:');
    if (!name) return;
    const members = prompt('멤버 아이디 (쉼표로 구분):');
    if (!members) return;
    const to = members.split(',').map(s => s.trim()).filter(Boolean);
    const chat = await chatApi('/create', { method: 'POST', body: { to, type: 'group', groupName: name } });
    if (chat && chat.id) { chatOpen(chat.id); chatLoadList(); }
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
    if (results.length === 0) { container.innerHTML = '<div class="chat-empty">검색 결과 없음</div>'; return; }
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
    if (diff < 60000) return '방금';
    if (diff < 3600000) return Math.floor(diff / 60000) + '분 전';
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    if (diff < 86400000 * 7) return ['일','월','화','수','목','금','토'][d.getDay()] + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    return (d.getMonth() + 1) + '/' + d.getDate();
}

// ── 글로벌 등록 ──

window.chatInit = chatInit;
window.chatOpen = chatOpen;
window.chatSend = chatSend;
window.chatNewDm = chatNewDm;
window.chatNewGroup = chatNewGroup;
window.chatSearch = chatSearch;
window.chatBack = chatBack;
window.chatOnInputTyping = chatOnInputTyping;
window.chatToggleCrmm = chatToggleCrmm;
