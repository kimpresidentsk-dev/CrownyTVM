// chat-store.js — 파일 기반 채팅 저장소
// CrownyTVM 독립 메신저 · 순수 Node.js
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateMailId } = require('../mail-server/ternary');

const DATA_DIR = path.join(__dirname, '..', 'chat-data');
const CHATS_DIR = path.join(DATA_DIR, 'chats');
const MSG_DIR = path.join(DATA_DIR, 'messages');
const USERS_DIR = path.join(DATA_DIR, 'users');

[DATA_DIR, CHATS_DIR, MSG_DIR, USERS_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── 채팅방 ──

function generateChatId() {
    return 'CH' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

function generateMsgId() {
    return 'M' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
}

// DM용 고정 ID (두 사용자 조합)
function dmChatId(a, b) {
    const sorted = [a, b].sort();
    return 'DM_' + sorted.join('_');
}

function createChat(participants, type, groupName) {
    const id = type === 'dm' ? dmChatId(participants[0], participants[1]) : generateChatId();
    const existing = getChat(id);
    if (existing) return existing;

    const chat = {
        id,
        type: type || 'dm',
        participants,
        groupName: groupName || null,
        admins: type === 'group' ? [participants[0]] : [],
        created: Date.now(),
        lastMessage: null,
        lastMessageText: '',
        lastMessageTime: Date.now(),
    };
    fs.writeFileSync(path.join(CHATS_DIR, id + '.json'), JSON.stringify(chat, null, 2));
    // 메시지 디렉토리 생성
    const msgDir = path.join(MSG_DIR, id);
    if (!fs.existsSync(msgDir)) fs.mkdirSync(msgDir, { recursive: true });
    return chat;
}

function getChat(chatId) {
    const fp = path.join(CHATS_DIR, chatId + '.json');
    if (!fs.existsSync(fp)) return null;
    try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return null; }
}

function saveChat(chat) {
    fs.writeFileSync(path.join(CHATS_DIR, chat.id + '.json'), JSON.stringify(chat, null, 2));
}

function listChats(username) {
    if (!fs.existsSync(CHATS_DIR)) return [];
    const files = fs.readdirSync(CHATS_DIR).filter(f => f.endsWith('.json'));
    const chats = [];
    for (const f of files) {
        try {
            const chat = JSON.parse(fs.readFileSync(path.join(CHATS_DIR, f), 'utf8'));
            if (chat.participants && chat.participants.includes(username)) {
                chats.push(chat);
            }
        } catch { /* skip */ }
    }
    return chats.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
}

function deleteChat(chatId) {
    const fp = path.join(CHATS_DIR, chatId + '.json');
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    // 메시지 폴더도 삭제
    const msgDir = path.join(MSG_DIR, chatId);
    if (fs.existsSync(msgDir)) {
        fs.readdirSync(msgDir).forEach(f => fs.unlinkSync(path.join(msgDir, f)));
        fs.rmdirSync(msgDir);
    }
}

// ── 메시지 ──

function addMessage(chatId, senderId, text, type, replyTo) {
    const msgDir = path.join(MSG_DIR, chatId);
    if (!fs.existsSync(msgDir)) fs.mkdirSync(msgDir, { recursive: true });

    const msg = {
        id: generateMsgId(),
        chatId,
        senderId,
        text: (text || '').slice(0, 4000),
        type: type || 'text',
        timestamp: Date.now(),
        readBy: [senderId],
        replyTo: replyTo || null,
        deleted: false,
    };
    fs.writeFileSync(path.join(msgDir, msg.id + '.json'), JSON.stringify(msg));

    // 채팅방 lastMessage 업데이트
    const chat = getChat(chatId);
    if (chat) {
        chat.lastMessage = senderId;
        chat.lastMessageText = msg.text.slice(0, 50);
        chat.lastMessageTime = msg.timestamp;
        saveChat(chat);
    }

    return msg;
}

function getMessages(chatId, limit, before) {
    const msgDir = path.join(MSG_DIR, chatId);
    if (!fs.existsSync(msgDir)) return [];
    const files = fs.readdirSync(msgDir).filter(f => f.endsWith('.json'));
    let msgs = [];
    for (const f of files) {
        try {
            const msg = JSON.parse(fs.readFileSync(path.join(msgDir, f), 'utf8'));
            if (!msg.deleted && (!before || msg.timestamp < before)) {
                msgs.push(msg);
            }
        } catch { /* skip */ }
    }
    msgs.sort((a, b) => a.timestamp - b.timestamp);
    if (limit && msgs.length > limit) msgs = msgs.slice(-limit);
    return msgs;
}

function markRead(chatId, username) {
    const msgDir = path.join(MSG_DIR, chatId);
    if (!fs.existsSync(msgDir)) return 0;
    let count = 0;
    const files = fs.readdirSync(msgDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
        try {
            const fp = path.join(msgDir, f);
            const msg = JSON.parse(fs.readFileSync(fp, 'utf8'));
            if (msg.senderId !== username && !msg.readBy.includes(username)) {
                msg.readBy.push(username);
                fs.writeFileSync(fp, JSON.stringify(msg));
                count++;
            }
        } catch { /* skip */ }
    }
    return count;
}

function deleteMessage(msgId, chatId) {
    const fp = path.join(MSG_DIR, chatId, msgId + '.json');
    if (!fs.existsSync(fp)) return false;
    const msg = JSON.parse(fs.readFileSync(fp, 'utf8'));
    msg.deleted = true;
    msg.text = '';
    fs.writeFileSync(fp, JSON.stringify(msg));
    return true;
}

function getUnreadCount(chatId, username) {
    const msgDir = path.join(MSG_DIR, chatId);
    if (!fs.existsSync(msgDir)) return 0;
    let count = 0;
    const files = fs.readdirSync(msgDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
        try {
            const msg = JSON.parse(fs.readFileSync(path.join(msgDir, f), 'utf8'));
            if (!msg.deleted && msg.senderId !== username && !msg.readBy.includes(username)) count++;
        } catch { /* skip */ }
    }
    return count;
}

// ── 프레즌스 ──

function updatePresence(username, isOnline) {
    const fp = path.join(USERS_DIR, username + '.json');
    let data = {};
    if (fs.existsSync(fp)) try { data = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch {}
    data.isOnline = isOnline;
    data.lastSeen = Date.now();
    fs.writeFileSync(fp, JSON.stringify(data));
}

function getPresence(username) {
    const fp = path.join(USERS_DIR, username + '.json');
    if (!fs.existsSync(fp)) return { isOnline: false, lastSeen: 0 };
    try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return { isOnline: false, lastSeen: 0 }; }
}

// ── 그룹 관리 ──

function addGroupMember(chatId, username) {
    const chat = getChat(chatId);
    if (!chat || chat.type !== 'group') return false;
    if (!chat.participants.includes(username)) {
        chat.participants.push(username);
        saveChat(chat);
    }
    return true;
}

function removeGroupMember(chatId, username) {
    const chat = getChat(chatId);
    if (!chat || chat.type !== 'group') return false;
    chat.participants = chat.participants.filter(p => p !== username);
    chat.admins = chat.admins.filter(a => a !== username);
    saveChat(chat);
    return true;
}

function updateGroupName(chatId, name) {
    const chat = getChat(chatId);
    if (!chat || chat.type !== 'group') return false;
    chat.groupName = name;
    saveChat(chat);
    return true;
}

// ── 검색 ──

function searchMessages(username, query) {
    if (!query || query.length < 2) return [];
    const chats = listChats(username);
    const results = [];
    const q = query.toLowerCase();
    for (const chat of chats) {
        const msgDir = path.join(MSG_DIR, chat.id);
        if (!fs.existsSync(msgDir)) continue;
        const files = fs.readdirSync(msgDir).filter(f => f.endsWith('.json'));
        for (const f of files) {
            try {
                const msg = JSON.parse(fs.readFileSync(path.join(msgDir, f), 'utf8'));
                if (!msg.deleted && msg.text && msg.text.toLowerCase().includes(q)) {
                    results.push({ ...msg, chatName: chat.groupName || chat.participants.filter(p => p !== username)[0] || '' });
                    if (results.length >= 50) return results;
                }
            } catch { /* skip */ }
        }
    }
    return results.sort((a, b) => b.timestamp - a.timestamp);
}

module.exports = {
    createChat, getChat, saveChat, listChats, deleteChat, dmChatId,
    addMessage, getMessages, markRead, deleteMessage, getUnreadCount,
    updatePresence, getPresence,
    addGroupMember, removeGroupMember, updateGroupName,
    searchMessages,
    DATA_DIR, CHATS_DIR, MSG_DIR, USERS_DIR,
};
