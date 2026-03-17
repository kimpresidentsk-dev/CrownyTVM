// index.js — CrownyTVM 독립 메신저 통합 진입점
// 순수 Node.js · npm 의존성 없음
'use strict';

const store = require('./chat-store');
const { attachWebSocket, getOnlineUsers } = require('./ws-server');

// ═══ API 핸들러 (server.js에서 호출) ═══

function apiListChats(username) {
    const chats = store.listChats(username);
    return chats.map(c => ({
        ...c,
        unread: store.getUnreadCount(c.id, username),
        displayName: c.type === 'group' ? c.groupName : c.participants.filter(p => p !== username)[0] || '',
    }));
}

function apiGetMessages(chatId, username, limit, before) {
    const chat = store.getChat(chatId);
    if (!chat || !chat.participants.includes(username)) return { error: '권한 없음' };
    return store.getMessages(chatId, limit || 50, before);
}

function apiCreateChat(username, otherUser, type, groupName) {
    if (type === 'group') {
        const participants = [username, ...(Array.isArray(otherUser) ? otherUser : [otherUser])];
        return store.createChat([...new Set(participants)], 'group', groupName || '그룹');
    }
    // DM
    return store.createChat([username, otherUser], 'dm');
}

function apiDeleteChat(chatId, username) {
    const chat = store.getChat(chatId);
    if (!chat) return { error: '채팅방 없음' };
    if (chat.type === 'group' && !chat.admins.includes(username)) return { error: '관리자만 삭제 가능' };
    store.deleteChat(chatId);
    return { success: true };
}

function apiSearchMessages(username, query) {
    return store.searchMessages(username, query);
}

function apiGetChatInfo(chatId, username) {
    const chat = store.getChat(chatId);
    if (!chat || !chat.participants.includes(username)) return { error: '권한 없음' };
    const online = getOnlineUsers();
    return {
        ...chat,
        participantStatus: chat.participants.map(p => ({
            username: p,
            isOnline: online.includes(p),
            lastSeen: store.getPresence(p).lastSeen,
        })),
    };
}

function apiUpdateGroup(chatId, username, body) {
    const chat = store.getChat(chatId);
    if (!chat || chat.type !== 'group') return { error: '그룹 아님' };
    if (!chat.admins.includes(username)) return { error: '관리자만 수정 가능' };

    if (body.groupName) store.updateGroupName(chatId, body.groupName);
    if (body.addMember) store.addGroupMember(chatId, body.addMember);
    if (body.removeMember) store.removeGroupMember(chatId, body.removeMember);

    return { success: true, chat: store.getChat(chatId) };
}

module.exports = {
    attachWebSocket,
    apiListChats, apiGetMessages, apiCreateChat, apiDeleteChat,
    apiSearchMessages, apiGetChatInfo, apiUpdateGroup,
};
