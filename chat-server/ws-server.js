// ws-server.js — 순수 Node.js WebSocket 서버 (RFC 6455)
// CrownyTVM 독립 메신저 · npm 의존성 없음
'use strict';

const crypto = require('crypto');
const store = require('./chat-store');

const MAGIC = '258EAFA5-E914-47DA-95CA-5AB5353BE740';
const connections = new Map(); // username → Set<{socket, alive}>

// ── WebSocket 프레임 ──

function encodeFrame(data, opcode) {
    opcode = opcode || 0x01; // text
    const payload = Buffer.from(data, 'utf8');
    const len = payload.length;
    let header;
    if (len < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x80 | opcode;
        header[1] = len;
    } else if (len < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x80 | opcode;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x80 | opcode;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }
    return Buffer.concat([header, payload]);
}

function decodeFrame(buf) {
    if (buf.length < 2) return null;
    const opcode = buf[0] & 0x0F;
    const masked = (buf[1] & 0x80) !== 0;
    let payloadLen = buf[1] & 0x7F;
    let offset = 2;

    if (payloadLen === 126) {
        if (buf.length < 4) return null;
        payloadLen = buf.readUInt16BE(2);
        offset = 4;
    } else if (payloadLen === 127) {
        if (buf.length < 10) return null;
        payloadLen = Number(buf.readBigUInt64BE(2));
        offset = 10;
    }

    if (masked) {
        if (buf.length < offset + 4 + payloadLen) return null;
        const mask = buf.slice(offset, offset + 4);
        offset += 4;
        const payload = buf.slice(offset, offset + payloadLen);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
        return { opcode, payload, totalLen: offset + payloadLen };
    }

    if (buf.length < offset + payloadLen) return null;
    return { opcode, payload: buf.slice(offset, offset + payloadLen), totalLen: offset + payloadLen };
}

// ── 전송 헬퍼 ──

function sendTo(username, data) {
    const conns = connections.get(username);
    if (!conns) return;
    const frame = encodeFrame(JSON.stringify(data));
    for (const c of conns) {
        try { c.socket.write(frame); } catch { /* 무시 */ }
    }
}

function broadcastToChat(chatId, data, excludeUser) {
    const chat = store.getChat(chatId);
    if (!chat) return;
    for (const p of chat.participants) {
        if (p !== excludeUser) sendTo(p, data);
    }
}

function getOnlineUsers() {
    const online = [];
    for (const [username, conns] of connections) {
        if (conns.size > 0) online.push(username);
    }
    return online;
}

// ── WebSocket 핸드셰이크 ──

function attachWebSocket(httpServer, authFn) {
    httpServer.on('upgrade', (req, socket, head) => {
        const url = req.url || '';
        if (!url.startsWith('/ws/chat')) {
            socket.destroy();
            return;
        }

        const key = req.headers['sec-websocket-key'];
        if (!key) { socket.destroy(); return; }

        const accept = crypto.createHash('sha1')
            .update(key + MAGIC)
            .digest('base64');

        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Accept: ' + accept + '\r\n' +
            '\r\n'
        );

        handleConnection(socket, authFn);
    });

    // 30초마다 핑
    setInterval(() => {
        for (const [, conns] of connections) {
            for (const c of conns) {
                if (!c.alive) {
                    try { c.socket.end(); } catch {}
                    conns.delete(c);
                    continue;
                }
                c.alive = false;
                try { c.socket.write(encodeFrame('', 0x09)); } catch {} // ping
            }
        }
    }, 30000);

    console.log('[WS] WebSocket 서버 연결 (/ws/chat)');
}

function handleConnection(socket, authFn) {
    let username = null;
    let buffer = Buffer.alloc(0);
    const conn = { socket, alive: true };

    socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);

        while (buffer.length > 0) {
            const frame = decodeFrame(buffer);
            if (!frame) break;
            buffer = buffer.slice(frame.totalLen);

            // pong
            if (frame.opcode === 0x0A) { conn.alive = true; continue; }
            // ping → pong
            if (frame.opcode === 0x09) {
                try { socket.write(encodeFrame(frame.payload.toString(), 0x0A)); } catch {}
                continue;
            }
            // close
            if (frame.opcode === 0x08) {
                try { socket.write(encodeFrame('', 0x08)); socket.end(); } catch {}
                return;
            }
            // text
            if (frame.opcode === 0x01) {
                conn.alive = true;
                try {
                    const msg = JSON.parse(frame.payload.toString('utf8'));
                    handleMessage(msg, conn, authFn, (u) => { username = u; });
                } catch (e) {
                    console.warn('[WS] parse error:', e.message);
                }
            }
        }
    });

    socket.on('close', () => cleanup(username, conn));
    socket.on('error', () => cleanup(username, conn));
}

function cleanup(username, conn) {
    if (!username) return;
    const conns = connections.get(username);
    if (conns) {
        conns.delete(conn);
        if (conns.size === 0) {
            connections.delete(username);
            store.updatePresence(username, false);
            // 오프라인 알림
            broadcastPresence(username, false);
        }
    }
}

function broadcastPresence(username, isOnline) {
    // 이 사용자의 모든 채팅방 참여자에게 알림
    const chats = store.listChats(username);
    const notified = new Set();
    for (const chat of chats) {
        for (const p of chat.participants) {
            if (p !== username && !notified.has(p)) {
                sendTo(p, { type: 'presence', username, isOnline, lastSeen: Date.now() });
                notified.add(p);
            }
        }
    }
}

// ── 메시지 핸들러 ──

function handleMessage(msg, conn, authFn, setUsername) {
    // 인증
    if (msg.type === 'auth') {
        const user = authFn(msg.token);
        if (!user) {
            try { conn.socket.write(encodeFrame(JSON.stringify({ type: 'error', error: '인증 실패' }))); } catch {}
            return;
        }
        const username = user.username;
        setUsername(username);

        if (!connections.has(username)) connections.set(username, new Set());
        connections.get(username).add(conn);
        store.updatePresence(username, true);

        // 인증 성공 응답 + 온라인 사용자 목록
        sendTo(username, { type: 'auth:ok', username, online: getOnlineUsers() });
        broadcastPresence(username, true);
        return;
    }

    // 인증 안 된 상태
    if (!conn.socket._wsUsername && msg.type !== 'auth') {
        // username을 conn에서 찾기
        let found = null;
        for (const [u, conns] of connections) {
            if (conns.has(conn)) { found = u; break; }
        }
        if (!found) {
            try { conn.socket.write(encodeFrame(JSON.stringify({ type: 'error', error: '인증 필요' }))); } catch {}
            return;
        }
        msg._from = found;
    } else {
        // 이미 찾은 username 사용
        for (const [u, conns] of connections) {
            if (conns.has(conn)) { msg._from = u; break; }
        }
    }

    const from = msg._from;
    if (!from) return;

    switch (msg.type) {
        case 'chat:send': {
            const chat = store.getChat(msg.chatId);
            if (!chat || !chat.participants.includes(from)) return;
            const saved = store.addMessage(msg.chatId, from, msg.text, msg.msgType || 'text', msg.replyTo);
            // 발신자에게 확인
            sendTo(from, { type: 'chat:sent', msg: saved });
            // 다른 참여자에게 전달
            broadcastToChat(msg.chatId, { type: 'chat:message', msg: saved }, from);
            break;
        }

        case 'chat:typing': {
            broadcastToChat(msg.chatId, { type: 'chat:typing', chatId: msg.chatId, username: from, isTyping: msg.isTyping }, from);
            break;
        }

        case 'chat:read': {
            store.markRead(msg.chatId, from);
            broadcastToChat(msg.chatId, { type: 'chat:read', chatId: msg.chatId, username: from }, from);
            break;
        }

        default:
            break;
    }
}

module.exports = { attachWebSocket, sendTo, broadcastToChat, connections, getOnlineUsers };
