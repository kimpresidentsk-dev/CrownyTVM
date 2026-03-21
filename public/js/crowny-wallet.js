// ═══════════════════════════════════════════════════════════════
// crowny-wallet.js — 클라이언트 사이드 Ed25519 지갑
//
// 브라우저에서 키 생성 + 트랜잭션 서명
// 서버는 검증만 — 비밀키를 서버에 보내지 않음
//
// Web Crypto API (Ed25519) + IndexedDB 저장
// ═══════════════════════════════════════════════════════════════
'use strict';

const CrownyWallet = (function() {

    const DB_NAME = 'crowny-keystore';
    const STORE_NAME = 'keys';
    let _db = null;
    let _keypair = null; // { publicKey, privateKey } CryptoKey objects
    let _address = null;

    // ── IndexedDB ──

    function _openDB() {
        return new Promise((resolve, reject) => {
            if (_db) { resolve(_db); return; }
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = (e) => { e.target.result.createObjectStore(STORE_NAME); };
            req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
            req.onerror = (e) => reject(e);
        });
    }

    async function _dbGet(key) {
        const db = await _openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function _dbPut(key, value) {
        const db = await _openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // ── Ed25519 키 생성 ──

    async function generateKeypair() {
        // Web Crypto Ed25519 (Chrome 113+, Safari 17+)
        try {
            const kp = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
            _keypair = kp;
            return kp;
        } catch (e) {
            console.warn('[WALLET] Ed25519 not supported, using fallback');
            return _fallbackKeypair();
        }
    }

    // fallback: ECDSA P-256 (Ed25519 미지원 브라우저)
    async function _fallbackKeypair() {
        const kp = await crypto.subtle.generateKey(
            { name: 'ECDSA', namedCurve: 'P-256' },
            true, ['sign', 'verify']
        );
        _keypair = kp;
        return kp;
    }

    // ── 키 내보내기/가져오기 ──

    async function exportPublicKey() {
        if (!_keypair) return null;
        const raw = await crypto.subtle.exportKey('raw', _keypair.publicKey);
        return _bufToHex(raw);
    }

    async function exportPrivateKey() {
        if (!_keypair) return null;
        const pkcs8 = await crypto.subtle.exportKey('pkcs8', _keypair.privateKey);
        return _bufToHex(pkcs8);
    }

    // ── 주소 도출 (공개키 → SHA-256 → 균형3진 → CRW+57) ──

    async function deriveAddress() {
        if (!_keypair) return '';
        const rawPub = await crypto.subtle.exportKey('raw', _keypair.publicKey);
        const hash = await crypto.subtle.digest('SHA-256', rawPub);
        const bytes = new Uint8Array(hash);

        // bytes → trits (5 trits per byte)
        const trits = [];
        for (const b of bytes) {
            let v = b;
            for (let j = 4; j >= 0; j--) {
                const r = v % 3;
                trits.push(r === 0 ? 0 : r === 1 ? 1 : -1);
                if (r === 2) v += 1;
                v = Math.floor(v / 3);
            }
        }

        // 54 trits → address body
        const addrTrits = trits.slice(0, 54);
        const charMap = { '-1': 'N', '0': 'O', '1': 'T' };
        const body = addrTrits.map(t => charMap[String(t)] || 'O').join('');

        // 3-trit checksum
        const sum = addrTrits.reduce((a, t) => a + t, 0);
        const checkVal = ((sum % 27) + 27) % 27;
        const check = [
            Math.floor(checkVal / 9) - 1,
            Math.floor((checkVal % 9) / 3) - 1,
            (checkVal % 3) - 1,
        ].map(t => charMap[String(t)] || 'O').join('');

        _address = 'CRW' + body + check;
        return _address;
    }

    // ── 트랜잭션 서명 ──

    async function signTransaction(txData) {
        if (!_keypair) throw new Error('No keypair loaded');

        const payload = JSON.stringify(txData);
        const encoded = new TextEncoder().encode(payload);

        let signature;
        try {
            // Ed25519
            signature = await crypto.subtle.sign('Ed25519', _keypair.privateKey, encoded);
        } catch {
            // ECDSA fallback
            signature = await crypto.subtle.sign(
                { name: 'ECDSA', hash: 'SHA-256' },
                _keypair.privateKey, encoded
            );
        }

        return {
            ...txData,
            senderPubKey: await exportPublicKey(),
            senderAddress: _address,
            signature: _bufToHex(signature),
            signedAt: Math.floor(Date.now() / 1000),
        };
    }

    // ── 키 저장/로드 (IndexedDB, 비밀번호 암호화) ──

    async function saveKeypair(password) {
        if (!_keypair) return;

        const pubHex = await exportPublicKey();
        const privPkcs8 = await crypto.subtle.exportKey('pkcs8', _keypair.privateKey);

        // 비밀번호로 AES 키 생성
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
        const aesKey = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
            keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
        );

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, privPkcs8);

        await _dbPut('wallet', {
            publicKey: pubHex,
            address: _address,
            encrypted: _bufToHex(encrypted),
            salt: _bufToHex(salt),
            iv: _bufToHex(iv),
            algo: _keypair.privateKey.algorithm?.name === 'Ed25519' ? 'Ed25519' : 'ECDSA',
        });

        return { publicKey: pubHex, address: _address };
    }

    async function loadKeypair(password) {
        const stored = await _dbGet('wallet');
        if (!stored) return null;

        // AES 복호화
        const salt = _hexToBuf(stored.salt);
        const iv = _hexToBuf(stored.iv);
        const encrypted = _hexToBuf(stored.encrypted);

        const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
        const aesKey = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
            keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
        );

        let privPkcs8;
        try {
            privPkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, encrypted);
        } catch {
            throw new Error('Wrong password');
        }

        // 키페어 복원
        const algo = stored.algo === 'Ed25519' ? 'Ed25519' : { name: 'ECDSA', namedCurve: 'P-256' };
        const usages = stored.algo === 'Ed25519' ? ['sign'] : ['sign'];
        const privateKey = await crypto.subtle.importKey('pkcs8', privPkcs8, algo, true, usages);
        const pubBuf = _hexToBuf(stored.publicKey);
        const pubAlgo = stored.algo === 'Ed25519' ? 'Ed25519' : { name: 'ECDSA', namedCurve: 'P-256' };
        const publicKey = await crypto.subtle.importKey('raw', pubBuf, pubAlgo, true, ['verify']);

        _keypair = { publicKey, privateKey };
        _address = stored.address;

        return { publicKey: stored.publicKey, address: _address };
    }

    // ── 지갑 존재 확인 ──

    async function hasWallet() {
        try {
            const stored = await _dbGet('wallet');
            return !!stored;
        } catch { return false; }
    }

    async function getAddress() {
        if (_address) return _address;
        const stored = await _dbGet('wallet');
        return stored?.address || '';
    }

    // ── 서명된 전송 (서버에 비밀키 없이) ──

    async function signedTransfer(to, amount, currency, memo) {
        if (!_keypair || !_address) throw new Error('Wallet not loaded');
        const txData = {
            type: 'transfer',
            from: _address,
            to,
            amount,
            currency,
            memo: memo || '',
            nonce: Date.now(),
            timestamp: Math.floor(Date.now() / 1000),
        };
        return signTransaction(txData);
    }

    // ── 유틸 ──

    function _bufToHex(buf) {
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function _hexToBuf(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        return bytes.buffer;
    }

    function isLoaded() { return !!_keypair; }

    // ── Public API ──
    return {
        generateKeypair,
        deriveAddress,
        signTransaction,
        signedTransfer,
        saveKeypair,
        loadKeypair,
        hasWallet,
        getAddress,
        exportPublicKey,
        isLoaded,
    };
})();
