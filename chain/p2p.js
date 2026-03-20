// ═══════════════════════════════════════════════════════════════
// chain/p2p.js — P2P 네트워크 (Phase 2.1)
// CrownyCell Chain
//
// WebSocket 풀메시 — chat-server/ws-server.js 패턴 재활용
// 최소 3노드, 방사형 토폴로지 (모든 노드가 서로 연결)
// 각 노드 = 서버(listen) + 클라이언트(connect to peers)
// ═══════════════════════════════════════════════════════════════
'use strict';

const http = require('http');
const crypto = require('crypto');
const { sign, verify, sha256hex } = require('./crypto');

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-5AB5353BE740';
const HEARTBEAT_INTERVAL = 9000; // 9초 (블록 시간과 동기화)

// ── WebSocket 프레임 (ws-server.js에서 가져옴) ──

function encodeFrame(data, opcode) {
    opcode = opcode || 0x01;
    const payload = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data), 'utf8');
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
        payloadLen = buf.readUInt16BE(2); offset = 4;
    } else if (payloadLen === 127) {
        if (buf.length < 10) return null;
        payloadLen = Number(buf.readBigUInt64BE(2)); offset = 10;
    }
    if (masked) {
        if (buf.length < offset + 4 + payloadLen) return null;
        const mask = buf.slice(offset, offset + 4); offset += 4;
        const payload = buf.slice(offset, offset + payloadLen);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
        return { opcode, payload, totalLen: offset + payloadLen };
    }
    if (buf.length < offset + payloadLen) return null;
    return { opcode, payload: buf.slice(offset, offset + payloadLen), totalLen: offset + payloadLen };
}

// ── 메시지 타입 ──

const MSG = {
    HANDSHAKE:     'handshake',
    HANDSHAKE_ACK: 'handshake_ack',
    HEARTBEAT:     'heartbeat',
    HEARTBEAT_ACK: 'heartbeat_ack',
    PROPOSE_BLOCK: 'propose_block',
    VOTE:          'vote',
    COMMIT_BLOCK:  'commit_block',
    NEW_TX:        'new_tx',
    REQUEST_BLOCKS:'request_blocks',
    BLOCKS:        'blocks',
    PEER_LIST:     'peer_list',
};

// ── P2P 노드 ──

class P2PNode {
    constructor(options = {}) {
        this.port = options.port || 9730;
        this.host = options.host || '0.0.0.0';
        this.nodeId = options.nodeId || crypto.randomBytes(8).toString('hex');
        this.keypair = options.keypair || null;  // Ed25519
        this.seedPeers = options.seedPeers || []; // ['host:port', ...]

        this.peers = new Map(); // peerId → { socket, host, port, height, alive, pubKey }
        this.server = null;
        this.heartbeatTimer = null;
        this.handlers = {};  // msgType → callback

        // 통계
        this.stats = { messagesIn: 0, messagesOut: 0, blocksRelayed: 0 };
    }

    // ── 서버 시작 (다른 노드의 연결 수신) ──

    listen() {
        return new Promise((resolve) => {
            this.server = http.createServer((req, res) => {
                // 일반 HTTP 요청은 무시 (체인 API는 별도)
                res.writeHead(200); res.end('CrownyCell P2P Node');
            });

            this.server.on('upgrade', (req, socket, head) => {
                if (!req.url.startsWith('/ws/chain')) { socket.destroy(); return; }
                const key = req.headers['sec-websocket-key'];
                if (!key) { socket.destroy(); return; }
                const accept = crypto.createHash('sha1').update(key + WS_MAGIC).digest('base64');
                socket.write(
                    'HTTP/1.1 101 Switching Protocols\r\n' +
                    'Upgrade: websocket\r\n' +
                    'Connection: Upgrade\r\n' +
                    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
                );
                this._handleIncoming(socket);
            });

            this.server.listen(this.port, this.host, () => {
                console.log(`[P2P] Listening on ${this.host}:${this.port}`);
                resolve();
            });

            // 하트비트
            this.heartbeatTimer = setInterval(() => this._heartbeat(), HEARTBEAT_INTERVAL);
        });
    }

    // ── 시드 피어에 연결 ──

    async connectToSeeds() {
        for (const seed of this.seedPeers) {
            const [host, port] = seed.split(':');
            await this.connectToPeer(host, parseInt(port) || 9730);
        }
    }

    connectToPeer(host, port) {
        return new Promise((resolve) => {
            const net = require('net');
            const socket = net.createConnection({ host, port }, () => {
                // WebSocket 핸드셰이크
                const wsKey = crypto.randomBytes(16).toString('base64');
                socket.write(
                    `GET /ws/chain HTTP/1.1\r\n` +
                    `Host: ${host}:${port}\r\n` +
                    `Upgrade: websocket\r\n` +
                    `Connection: Upgrade\r\n` +
                    `Sec-WebSocket-Key: ${wsKey}\r\n` +
                    `Sec-WebSocket-Version: 13\r\n\r\n`
                );

                let handshakeDone = false;
                let buffer = Buffer.alloc(0);

                socket.on('data', (chunk) => {
                    buffer = Buffer.concat([buffer, chunk]);
                    if (!handshakeDone) {
                        const headerEnd = buffer.indexOf('\r\n\r\n');
                        if (headerEnd >= 0) {
                            handshakeDone = true;
                            buffer = buffer.slice(headerEnd + 4);
                            this._setupPeerSocket(socket, `${host}:${port}`, buffer);
                            this._sendHandshake(socket);
                            resolve(true);
                        }
                    }
                });

                socket.on('error', () => { resolve(false); });
                socket.on('close', () => { this._removePeer(socket); });
            });

            socket.on('error', () => { resolve(false); });
            setTimeout(() => resolve(false), 5000); // 5초 타임아웃
        });
    }

    // ── 내부: 수신 연결 처리 ──

    _handleIncoming(socket) {
        let buffer = Buffer.alloc(0);
        const peerId = crypto.randomBytes(4).toString('hex');

        socket.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            while (buffer.length > 0) {
                const frame = decodeFrame(buffer);
                if (!frame) break;
                buffer = buffer.slice(frame.totalLen);
                if (frame.opcode === 0x0A) continue; // pong
                if (frame.opcode === 0x09) { // ping → pong
                    try { socket.write(encodeFrame(frame.payload.toString(), 0x0A)); } catch {}
                    continue;
                }
                if (frame.opcode === 0x08) { socket.end(); return; } // close
                if (frame.opcode === 0x01) {
                    this.stats.messagesIn++;
                    try {
                        const msg = JSON.parse(frame.payload.toString('utf8'));
                        this._handleMessage(msg, socket, peerId);
                    } catch {}
                }
            }
        });

        socket.on('close', () => this._removePeer(socket));
        socket.on('error', () => this._removePeer(socket));
    }

    _setupPeerSocket(socket, addr, initialBuffer) {
        let buffer = initialBuffer || Buffer.alloc(0);

        socket.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            while (buffer.length > 0) {
                const frame = decodeFrame(buffer);
                if (!frame) break;
                buffer = buffer.slice(frame.totalLen);
                if (frame.opcode === 0x0A) { this._markAlive(socket); continue; }
                if (frame.opcode === 0x09) {
                    try { socket.write(encodeFrame('', 0x0A)); } catch {}
                    continue;
                }
                if (frame.opcode === 0x08) { socket.end(); return; }
                if (frame.opcode === 0x01) {
                    this.stats.messagesIn++;
                    try {
                        const msg = JSON.parse(frame.payload.toString('utf8'));
                        this._handleMessage(msg, socket, addr);
                    } catch {}
                }
            }
        });
    }

    // ── 메시지 처리 ──

    _handleMessage(msg, socket, peerId) {
        switch (msg.type) {
            case MSG.HANDSHAKE:
                this._onHandshake(msg, socket, peerId);
                break;
            case MSG.HANDSHAKE_ACK:
                this._onHandshakeAck(msg, socket, peerId);
                break;
            case MSG.HEARTBEAT:
                this._sendTo(socket, { type: MSG.HEARTBEAT_ACK, nodeId: this.nodeId, height: this._getHeight() });
                break;
            case MSG.HEARTBEAT_ACK:
                this._markAlive(socket);
                break;
            default:
                // 체인 메시지 → 외부 핸들러로 전달
                if (this.handlers[msg.type]) {
                    this.handlers[msg.type](msg, peerId);
                }
        }
    }

    // ── 핸드셰이크 ──

    _sendHandshake(socket) {
        this._sendTo(socket, {
            type: MSG.HANDSHAKE,
            nodeId: this.nodeId,
            port: this.port,
            height: this._getHeight(),
            pubKey: this.keypair ? this.keypair.publicKey.toString('hex') : null,
            peers: Array.from(this.peers.keys()),
        });
    }

    _onHandshake(msg, socket, peerId) {
        const id = msg.nodeId || peerId;
        this.peers.set(id, {
            socket,
            nodeId: id,
            port: msg.port,
            height: msg.height || 0,
            alive: true,
            pubKey: msg.pubKey ? Buffer.from(msg.pubKey, 'hex') : null,
        });
        // ACK 응답
        this._sendTo(socket, {
            type: MSG.HANDSHAKE_ACK,
            nodeId: this.nodeId,
            port: this.port,
            height: this._getHeight(),
            pubKey: this.keypair ? this.keypair.publicKey.toString('hex') : null,
        });
        console.log(`[P2P] Peer connected: ${id} (height: ${msg.height})`);
        if (this.handlers['peer:connected']) this.handlers['peer:connected']({ peerId: id, height: msg.height });
    }

    _onHandshakeAck(msg, socket, peerId) {
        const id = msg.nodeId || peerId;
        this.peers.set(id, {
            socket,
            nodeId: id,
            port: msg.port,
            height: msg.height || 0,
            alive: true,
            pubKey: msg.pubKey ? Buffer.from(msg.pubKey, 'hex') : null,
        });
        console.log(`[P2P] Peer confirmed: ${id} (height: ${msg.height})`);
        if (this.handlers['peer:connected']) this.handlers['peer:connected']({ peerId: id, height: msg.height });
    }

    // ── 하트비트 ──

    _heartbeat() {
        for (const [id, peer] of this.peers) {
            if (!peer.alive) {
                console.log(`[P2P] Peer timeout: ${id}`);
                this._removePeer(peer.socket);
                continue;
            }
            peer.alive = false;
            this._sendTo(peer.socket, { type: MSG.HEARTBEAT, nodeId: this.nodeId, height: this._getHeight() });
        }
    }

    _markAlive(socket) {
        for (const peer of this.peers.values()) {
            if (peer.socket === socket) { peer.alive = true; break; }
        }
    }

    _removePeer(socket) {
        for (const [id, peer] of this.peers) {
            if (peer.socket === socket) {
                this.peers.delete(id);
                console.log(`[P2P] Peer disconnected: ${id}`);
                if (this.handlers['peer:disconnected']) this.handlers['peer:disconnected']({ peerId: id });
                break;
            }
        }
        try { socket.destroy(); } catch {}
    }

    // ── 전송 ──

    _sendTo(socket, data) {
        try {
            const frame = encodeFrame(JSON.stringify(data));
            socket.write(frame);
            this.stats.messagesOut++;
        } catch {}
    }

    broadcast(data) {
        for (const peer of this.peers.values()) {
            this._sendTo(peer.socket, data);
        }
    }

    sendToPeer(peerId, data) {
        const peer = this.peers.get(peerId);
        if (peer) this._sendTo(peer.socket, data);
    }

    // ── 외부 핸들러 등록 ──

    onMessage(type, callback) {
        this.handlers[type] = callback;
    }

    // ── 상태 ──

    getPeerCount() { return this.peers.size; }
    getPeerIds() { return Array.from(this.peers.keys()); }
    getPeerInfo() {
        return Array.from(this.peers.entries()).map(([id, p]) => ({
            nodeId: id, height: p.height, alive: p.alive, port: p.port,
        }));
    }

    _getHeight() {
        // producer와 연결 시 실제 높이 반환, 아니면 0
        return this._chainHeight || 0;
    }
    setChainHeight(h) { this._chainHeight = h; }

    // ── 종료 ──

    stop() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        for (const peer of this.peers.values()) {
            try { peer.socket.destroy(); } catch {}
        }
        this.peers.clear();
        if (this.server) this.server.close();
        console.log('[P2P] Node stopped');
    }
}

module.exports = { P2PNode, MSG, encodeFrame, decodeFrame };
