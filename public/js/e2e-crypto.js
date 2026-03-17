// ===== e2e-crypto.js - E2E 암호화 + 자동삭제 + 비밀채팅 + 메시지 서명 (v1.0) =====
// Depends on: social.js (currentUser, db), IndexedDB (crowny-offline)

const E2ECrypto = (() => {
    const DB_NAME = 'crowny-e2e';
    const DB_VERSION = 1;
    const KEY_STORE = 'keys';

    // ========== IndexedDB for private keys ==========
    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(KEY_STORE)) {
                    db.createObjectStore(KEY_STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function saveToIDB(id, data) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(KEY_STORE, 'readwrite');
            tx.objectStore(KEY_STORE).put({ id, ...data });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function getFromIDB(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(KEY_STORE, 'readonly');
            const req = tx.objectStore(KEY_STORE).get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async function deleteFromIDB(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(KEY_STORE, 'readwrite');
            tx.objectStore(KEY_STORE).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // ========== RSA Key Generation ==========
    async function generateKeyPair() {
        const encKeyPair = await crypto.subtle.generateKey(
            { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
            true, ['encrypt', 'decrypt']
        );
        const signKeyPair = await crypto.subtle.generateKey(
            { name: 'RSA-PSS', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
            true, ['sign', 'verify']
        );
        return { encKeyPair, signKeyPair };
    }

    async function exportPublicKeyJWK(key) {
        return await crypto.subtle.exportKey('jwk', key);
    }

    async function exportPrivateKeyJWK(key) {
        return await crypto.subtle.exportKey('jwk', key);
    }

    async function importPublicKeyEnc(jwk) {
        return await crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);
    }

    async function importPrivateKeyEnc(jwk) {
        return await crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt']);
    }

    async function importPublicKeySign(jwk) {
        return await crypto.subtle.importKey('jwk', jwk, { name: 'RSA-PSS', hash: 'SHA-256' }, true, ['verify']);
    }

    async function importPrivateKeySign(jwk) {
        return await crypto.subtle.importKey('jwk', jwk, { name: 'RSA-PSS', hash: 'SHA-256' }, true, ['sign']);
    }

    // ========== AES Key Generation ==========
    async function generateAESKey() {
        return await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    }

    async function exportAESKey(key) {
        return await crypto.subtle.exportKey('raw', key);
    }

    async function importAESKey(raw) {
        return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    }

    // ========== Encryption / Decryption ==========
    async function encryptWithAES(plaintext, aesKey) {
        const enc = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, enc.encode(plaintext));
        return { ciphertext: arrayBufferToBase64(ciphertext), iv: arrayBufferToBase64(iv) };
    }

    async function decryptWithAES(ciphertextB64, ivB64, aesKey) {
        const ciphertext = base64ToArrayBuffer(ciphertextB64);
        const iv = base64ToArrayBuffer(ivB64);
        const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
        return new TextDecoder().decode(plainBuf);
    }

    async function encryptAESKeyWithRSA(aesKey, rsaPublicKey) {
        const rawKey = await exportAESKey(aesKey);
        const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaPublicKey, rawKey);
        return arrayBufferToBase64(encrypted);
    }

    async function decryptAESKeyWithRSA(encryptedKeyB64, rsaPrivateKey) {
        const encrypted = base64ToArrayBuffer(encryptedKeyB64);
        const rawKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, rsaPrivateKey, encrypted);
        return await importAESKey(rawKey);
    }

    // ========== Message Signing ==========
    async function signMessage(text, privateSignKey) {
        const enc = new TextEncoder();
        const signature = await crypto.subtle.sign(
            { name: 'RSA-PSS', saltLength: 32 },
            privateSignKey,
            enc.encode(text)
        );
        return arrayBufferToBase64(signature);
    }

    async function verifySignature(text, signatureB64, publicSignKey) {
        const enc = new TextEncoder();
        const signature = base64ToArrayBuffer(signatureB64);
        return await crypto.subtle.verify(
            { name: 'RSA-PSS', saltLength: 32 },
            publicSignKey,
            signature,
            enc.encode(text)
        );
    }

    // ========== Key Fingerprint ==========
    async function getKeyFingerprint(publicKeyJWK) {
        const enc = new TextEncoder();
        const data = enc.encode(JSON.stringify(publicKeyJWK));
        const hash = await crypto.subtle.digest('SHA-256', data);
        const arr = new Uint8Array(hash);
        return Array.from(arr.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase();
    }

    // ========== Base64 Helpers ==========
    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    function base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    }

    // ========== Init: Generate or load keys on login ==========
    async function initKeys(uid) {
        if (!uid) return;
        try {
            // Check IDB for existing keys
            const stored = await getFromIDB(`keys_${uid}`);
            if (stored && stored.encPrivateKey && stored.signPrivateKey) {
                console.log('[E2E] Keys loaded from IndexedDB');
                // Verify publicKey is on Firestore
                const userDoc = await db.collection('users').doc(uid).get();
                if (userDoc.exists && userDoc.data().publicKey) return;
                // Re-upload public keys
                const encPub = await exportPublicKeyJWK(await importPrivateKeyEnc(stored.encPrivateKey).then(() => importPublicKeyEnc(stored.encPublicKey)));
                // Actually just re-save the stored public keys
                await db.collection('users').doc(uid).update({
                    publicKey: stored.encPublicKey,
                    publicSignKey: stored.signPublicKey
                });
                return;
            }

            // Check if Firestore already has publicKey (key exists on another device)
            const userDoc = await db.collection('users').doc(uid).get();
            if (userDoc.exists && userDoc.data().publicKey) {
                console.log('[E2E] Public key on Firestore but no private key locally. Need key import or regeneration.');
                // Don't auto-regenerate - user might import keys
                return;
            }

            // Generate new key pairs
            console.log('[E2E] Generating new key pairs...');
            const { encKeyPair, signKeyPair } = await generateKeyPair();

            const encPublicJWK = await exportPublicKeyJWK(encKeyPair.publicKey);
            const encPrivateJWK = await exportPrivateKeyJWK(encKeyPair.privateKey);
            const signPublicJWK = await exportPublicKeyJWK(signKeyPair.publicKey);
            const signPrivateJWK = await exportPrivateKeyJWK(signKeyPair.privateKey);

            // Save private keys to IndexedDB ONLY
            await saveToIDB(`keys_${uid}`, {
                encPublicKey: encPublicJWK,
                encPrivateKey: encPrivateJWK,
                signPublicKey: signPublicJWK,
                signPrivateKey: signPrivateJWK,
                createdAt: Date.now()
            });

            // Save public keys to Firestore
            await db.collection('users').doc(uid).update({
                publicKey: encPublicJWK,
                publicSignKey: signPublicJWK
            });

            console.log('[E2E] Key pairs generated and stored');
        } catch (e) {
            console.error('[E2E] Key init error:', e);
        }
    }

    // ========== Get my private keys ==========
    async function getMyKeys(uid) {
        const stored = await getFromIDB(`keys_${uid}`);
        if (!stored) return null;
        return {
            encPrivateKey: await importPrivateKeyEnc(stored.encPrivateKey),
            signPrivateKey: await importPrivateKeySign(stored.signPrivateKey),
            encPublicJWK: stored.encPublicKey,
            signPublicJWK: stored.signPublicKey
        };
    }

    // ========== Get recipient's public keys ==========
    async function getRecipientPublicKeys(uid) {
        const doc = await db.collection('users').doc(uid).get();
        if (!doc.exists) return null;
        const data = doc.data();
        if (!data.publicKey) return null;
        return {
            encPublicKey: await importPublicKeyEnc(data.publicKey),
            signPublicKey: data.publicSignKey ? await importPublicKeySign(data.publicSignKey) : null,
            encPublicJWK: data.publicKey,
            signPublicJWK: data.publicSignKey
        };
    }

    // ========== Encrypt message for 1:1 chat ==========
    async function encryptMessage(text, recipientUid, senderUid) {
        try {
            const myKeys = await getMyKeys(senderUid);
            const recipientKeys = await getRecipientPublicKeys(recipientUid);
            if (!myKeys || !recipientKeys) return null;

            // Generate session AES key
            const aesKey = await generateAESKey();

            // Encrypt message with AES
            const { ciphertext, iv } = await encryptWithAES(text, aesKey);

            // Encrypt AES key for recipient and sender (so sender can also read)
            const encryptedKeyForRecipient = await encryptAESKeyWithRSA(aesKey, recipientKeys.encPublicKey);
            const myEncPubKey = await importPublicKeyEnc(myKeys.encPublicJWK);
            const encryptedKeyForSender = await encryptAESKeyWithRSA(aesKey, myEncPubKey);

            // Sign the message
            let signature = null;
            if (myKeys.signPrivateKey) {
                signature = await signMessage(text, myKeys.signPrivateKey);
            }

            return {
                encryptedMessage: ciphertext,
                encryptedKeys: {
                    [recipientUid]: encryptedKeyForRecipient,
                    [senderUid]: encryptedKeyForSender
                },
                iv,
                encrypted: true,
                signature
            };
        } catch (e) {
            console.error('[E2E] Encrypt error:', e);
            return null;
        }
    }

    // ========== Decrypt message ==========
    async function decryptMessage(msgData, myUid) {
        try {
            if (!msgData.encrypted || !msgData.encryptedMessage) return msgData.text || '';

            const myKeys = await getMyKeys(myUid);
            if (!myKeys) return '🔒 암호화된 메시지 (복호화 불가)';

            const encryptedKey = msgData.encryptedKeys?.[myUid];
            if (!encryptedKey) return '🔒 암호화된 메시지 (복호화 불가)';

            const aesKey = await decryptAESKeyWithRSA(encryptedKey, myKeys.encPrivateKey);
            const plaintext = await decryptWithAES(msgData.encryptedMessage, msgData.iv, aesKey);

            // Verify signature if present
            if (msgData.signature && msgData.senderId) {
                try {
                    const senderKeys = await getRecipientPublicKeys(msgData.senderId);
                    if (senderKeys && senderKeys.signPublicKey) {
                        const valid = await verifySignature(plaintext, msgData.signature, senderKeys.signPublicKey);
                        if (!valid) return plaintext + ' ⚠️ 서명 검증 실패';
                    }
                } catch (e) {
                    console.warn('[E2E] Signature verification failed:', e);
                }
            }

            return plaintext;
        } catch (e) {
            console.error('[E2E] Decrypt error:', e);
            return '🔒 암호화된 메시지 (복호화 불가)';
        }
    }

    // ========== Group Chat E2E ==========
    async function encryptMessageForGroup(text, participantUids, senderUid) {
        try {
            const myKeys = await getMyKeys(senderUid);
            if (!myKeys) return null;

            const aesKey = await generateAESKey();
            const { ciphertext, iv } = await encryptWithAES(text, aesKey);

            // Encrypt AES key for each participant
            const encryptedKeys = {};
            for (const uid of participantUids) {
                try {
                    let pubKey;
                    if (uid === senderUid) {
                        pubKey = await importPublicKeyEnc(myKeys.encPublicJWK);
                    } else {
                        const recipKeys = await getRecipientPublicKeys(uid);
                        if (!recipKeys) continue;
                        pubKey = recipKeys.encPublicKey;
                    }
                    encryptedKeys[uid] = await encryptAESKeyWithRSA(aesKey, pubKey);
                } catch (e) {
                    console.warn(`[E2E] Failed to encrypt for ${uid}:`, e);
                }
            }

            let signature = null;
            if (myKeys.signPrivateKey) {
                signature = await signMessage(text, myKeys.signPrivateKey);
            }

            return {
                encryptedMessage: ciphertext,
                encryptedKeys,
                iv,
                encrypted: true,
                signature
            };
        } catch (e) {
            console.error('[E2E] Group encrypt error:', e);
            return null;
        }
    }

    // ========== Auto Delete ==========
    function getExpiresAt(autoDeleteAfter) {
        if (!autoDeleteAfter || autoDeleteAfter <= 0) return null;
        return new Date(Date.now() + autoDeleteAfter);
    }

    function isMessageExpired(msg) {
        if (!msg.expiresAt) return false;
        const expiresAt = msg.expiresAt?.toDate ? msg.expiresAt.toDate() : new Date(msg.expiresAt);
        return expiresAt <= new Date();
    }

    function getRemainingTime(msg) {
        if (!msg.expiresAt) return null;
        const expiresAt = msg.expiresAt?.toDate ? msg.expiresAt.toDate() : new Date(msg.expiresAt);
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) return '만료됨';
        if (remaining < 60000) return `${Math.ceil(remaining / 1000)}초`;
        if (remaining < 3600000) return `${Math.ceil(remaining / 60000)}분`;
        if (remaining < 86400000) return `${Math.ceil(remaining / 3600000)}시간`;
        return `${Math.ceil(remaining / 86400000)}일`;
    }

    async function cleanupExpiredMessages(chatId) {
        try {
            const now = new Date();
            const snap = await db.collection('chats').doc(chatId)
                .collection('messages')
                .where('expiresAt', '<=', now)
                .limit(50).get();
            if (snap.empty) return 0;
            const batch = db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log(`[E2E] Cleaned ${snap.size} expired messages from ${chatId}`);
            return snap.size;
        } catch (e) {
            console.warn('[E2E] Cleanup error:', e);
            return 0;
        }
    }

    async function cleanupAllExpiredMessages() {
        if (!currentUser) return;
        try {
            const chats = await db.collection('chats')
                .where('participants', 'array-contains', currentUser.uid).get();
            let total = 0;
            for (const doc of chats.docs) {
                const data = doc.data();
                if (data.autoDeleteAfter && data.autoDeleteAfter > 0) {
                    total += await cleanupExpiredMessages(doc.id);
                }
            }
            if (total > 0) console.log(`[E2E] Total expired messages cleaned: ${total}`);
        } catch (e) {
            console.warn('[E2E] Bulk cleanup error:', e);
        }
    }

    // ========== Secret Chat ==========
    async function createSecretChat(otherUid) {
        if (!currentUser) return null;
        // Check for existing secret chat
        const existing = await db.collection('chats')
            .where('participants', 'array-contains', currentUser.uid)
            .where('secret', '==', true).get();
        for (const doc of existing.docs) {
            if (doc.data().participants.includes(otherUid)) return doc.id;
        }

        const newChat = await db.collection('chats').add({
            participants: [currentUser.uid, otherUid],
            lastMessage: '🔒 비밀 채팅이 시작되었습니다',
            lastMessageTime: new Date(),
            createdAt: new Date(),
            unreadCount: {},
            typing: {},
            secret: true,
            e2eEnabled: true,
            autoDeleteAfter: 86400000, // 24h default
            noForward: true
        });
        return newChat.id;
    }

    // ========== Screenshot Detection (best-effort) ==========
    function setupScreenshotDetection(chatId, otherUid) {
        // Visibility change as proxy for screenshot (not reliable but warning)
        const handler = () => {
            if (document.visibilityState === 'hidden') return;
            // Keydown detection for PrintScreen
        };
        // Keyboard PrintScreen detection
        const keyHandler = async (e) => {
            if (e.key === 'PrintScreen' || (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5'))) {
                // Send notification
                try {
                    const myInfo = await getUserDisplayInfo(currentUser.uid);
                    await db.collection('chats').doc(chatId).collection('messages').add({
                        type: 'system',
                        text: `⚠️ ${myInfo.nickname}님이 스크린샷을 캡처했을 수 있습니다`,
                        timestamp: new Date()
                    });
                } catch (e) { /* best-effort */ }
            }
        };
        document.addEventListener('keyup', keyHandler);
        return () => { document.removeEventListener('keyup', keyHandler); };
    }

    // ========== Key Export/Import (backup) ==========
    async function exportKeysToFile(uid) {
        const stored = await getFromIDB(`keys_${uid}`);
        if (!stored) { showToast('내보낼 키가 없습니다', 'warning'); return; }
        const password = await showPromptModal('🔑 키 백업', '백업 파일을 보호할 비밀번호를 입력하세요', '');
        if (!password) return;

        // Encrypt with password-derived AES key
        const enc = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
        const derivedKey = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
            keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
        );
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const dataToEncrypt = enc.encode(JSON.stringify({
            encPrivateKey: stored.encPrivateKey,
            encPublicKey: stored.encPublicKey,
            signPrivateKey: stored.signPrivateKey,
            signPublicKey: stored.signPublicKey
        }));
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, derivedKey, dataToEncrypt);

        const blob = new Blob([JSON.stringify({
            salt: arrayBufferToBase64(salt),
            iv: arrayBufferToBase64(iv),
            data: arrayBufferToBase64(encrypted),
            version: 1
        })], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `crowny-keys-backup-${uid.substring(0, 6)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('✅ 키 백업 파일이 다운로드되었습니다', 'success');
    }

    async function importKeysFromFile(uid) {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json';
        input.onchange = async () => {
            if (!input.files[0]) return;
            try {
                const text = await input.files[0].text();
                const backup = JSON.parse(text);
                const password = await showPromptModal('🔑 키 복원', '백업 파일의 비밀번호를 입력하세요', '');
                if (!password) return;

                const enc = new TextEncoder();
                const salt = base64ToArrayBuffer(backup.salt);
                const iv = base64ToArrayBuffer(backup.iv);
                const encData = base64ToArrayBuffer(backup.data);

                const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
                const derivedKey = await crypto.subtle.deriveKey(
                    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
                    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
                );
                const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, derivedKey, encData);
                const keys = JSON.parse(new TextDecoder().decode(decrypted));

                await saveToIDB(`keys_${uid}`, {
                    encPublicKey: keys.encPublicKey,
                    encPrivateKey: keys.encPrivateKey,
                    signPublicKey: keys.signPublicKey,
                    signPrivateKey: keys.signPrivateKey,
                    createdAt: Date.now(),
                    imported: true
                });

                // Update Firestore public keys
                await db.collection('users').doc(uid).update({
                    publicKey: keys.encPublicKey,
                    publicSignKey: keys.signPublicKey
                });

                showToast('✅ 키 복원 완료! 이전 메시지도 복호화할 수 있습니다.', 'success');
            } catch (e) {
                console.error('[E2E] Import error:', e);
                showToast('키 복원 실패: 비밀번호가 잘못되었거나 파일이 손상되었습니다', 'error');
            }
        };
        input.click();
    }

    // ========== Auto Delete Timer Options ==========
    const AUTO_DELETE_OPTIONS = [
        { label: 'OFF', value: 0 },
        { label: '1시간', value: 3600000 },
        { label: '24시간', value: 86400000 },
        { label: '7일', value: 604800000 },
        { label: '30일', value: 2592000000 }
    ];

    // ========== Chat Settings UI ==========
    async function showChatSecuritySettings(chatId) {
        const chatDoc = await db.collection('chats').doc(chatId).get();
        const chat = chatDoc.data();
        const isSecret = chat.secret || false;
        const e2eEnabled = chat.e2eEnabled === true; // default OFF — only encrypt when explicitly enabled
        const autoDeleteAfter = chat.autoDeleteAfter || 0;
        const isGroup = chat.type === 'group';

        // Get key fingerprints for 1:1
        let fingerprintHTML = '';
        if (!isGroup) {
            const otherId = chat.participants.find(id => id !== currentUser.uid);
            try {
                const myStored = await getFromIDB(`keys_${currentUser.uid}`);
                const otherDoc = await db.collection('users').doc(otherId).get();
                const otherData = otherDoc.data();
                if (myStored?.encPublicKey) {
                    const myFP = await getKeyFingerprint(myStored.encPublicKey);
                    fingerprintHTML += `<div style="font-size:0.75rem;color:#6B5744;margin-top:0.3rem;">내 키: <code style="background:#F7F3ED;padding:0.1rem 0.3rem;border-radius:3px;">${myFP}</code></div>`;
                }
                if (otherData?.publicKey) {
                    const otherFP = await getKeyFingerprint(otherData.publicKey);
                    const otherInfo = await getUserDisplayInfo(otherId);
                    fingerprintHTML += `<div style="font-size:0.75rem;color:#6B5744;margin-top:0.2rem;">${otherInfo.nickname}: <code style="background:#F7F3ED;padding:0.1rem 0.3rem;border-radius:3px;">${otherFP}</code></div>`;
                }
            } catch (e) { /* ignore */ }
        }

        const overlay = document.createElement('div');
        overlay.id = 'chat-security-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        overlay.innerHTML = `
        <div style="background:#FFF8F0;padding:1.5rem;border-radius:16px;max-width:420px;width:100%;">
            <h3 style="margin-bottom:1rem;">🔐 채팅 보안 설정</h3>
            ${isSecret ? '<div style="background:#F7F3ED;padding:0.5rem;border-radius:8px;margin-bottom:1rem;font-size:0.8rem;">🔒 비밀 채팅 — E2E 암호화가 강제 적용됩니다</div>' : ''}
            
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.8rem 0;border-bottom:1px solid #E8E0D8;">
                <div>
                    <div style="font-weight:600;font-size:0.9rem;">🔒 E2E 암호화</div>
                    <div style="font-size:0.75rem;color:#6B5744;">메시지를 종단간 암호화합니다</div>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" id="e2e-toggle" ${e2eEnabled ? 'checked' : ''} ${isSecret ? 'disabled' : ''} onchange="E2ECrypto.updateChatSetting('${chatId}','e2eEnabled',this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            
            <div style="padding:0.8rem 0;border-bottom:1px solid #E8E0D8;">
                <div style="font-weight:600;font-size:0.9rem;margin-bottom:0.5rem;">⏱️ 메시지 자동 삭제</div>
                <select id="auto-delete-select" onchange="E2ECrypto.updateChatSetting('${chatId}','autoDeleteAfter',parseInt(this.value))" style="width:100%;padding:0.6rem;border:1px solid #E8E0D8;border-radius:8px;font-size:0.9rem;">
                    ${AUTO_DELETE_OPTIONS.map(o => `<option value="${o.value}" ${autoDeleteAfter === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
                </select>
            </div>

            ${fingerprintHTML ? `<div style="padding:0.8rem 0;border-bottom:1px solid #E8E0D8;">
                <div style="font-weight:600;font-size:0.9rem;margin-bottom:0.3rem;">🔑 키 지문</div>
                <div style="font-size:0.75rem;color:#6B5744;margin-bottom:0.3rem;">상대방과 동일한지 확인하세요</div>
                ${fingerprintHTML}
            </div>` : ''}

            <div style="padding:0.8rem 0;">
                <div style="font-weight:600;font-size:0.9rem;margin-bottom:0.5rem;">🔑 키 관리</div>
                <div style="display:flex;gap:0.5rem;">
                    <button onclick="E2ECrypto.exportKeysToFile('${currentUser.uid}')" style="flex:1;padding:0.5rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#FFF8F0;font-size:0.8rem;">📤 키 내보내기</button>
                    <button onclick="E2ECrypto.importKeysFromFile('${currentUser.uid}')" style="flex:1;padding:0.5rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#FFF8F0;font-size:0.8rem;">📥 키 가져오기</button>
                </div>
            </div>

            <button onclick="document.getElementById('chat-security-modal').remove()" style="width:100%;margin-top:0.5rem;padding:0.7rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#FFF8F0;">닫기</button>
        </div>`;
        document.body.appendChild(overlay);
    }

    async function updateChatSetting(chatId, field, value) {
        try {
            await db.collection('chats').doc(chatId).update({ [field]: value });
            showToast('✅ 설정이 변경되었습니다', 'success');
        } catch (e) {
            showToast('설정 변경 실패: ' + e.message, 'error');
        }
    }

    // ========== Secret Chat Modal ==========
    async function showStartSecretChatModal() {
        const contacts = await db.collection('users').doc(currentUser.uid).collection('contacts').get();
        if (contacts.empty) { showToast('연락처에 추가된 사용자가 없습니다', 'warning'); return; }

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        let listHTML = '';
        for (const doc of contacts.docs) {
            const info = await getUserDisplayInfo(doc.id);
            listHTML += `<div style="display:flex;align-items:center;gap:0.8rem;padding:0.7rem;border-bottom:1px solid #E8E0D8;cursor:pointer;" onclick="E2ECrypto.startSecretChatWith('${doc.id}');this.closest('[style*=position]').remove();">
                ${avatarHTML(info.photoURL, info.nickname, 40)}
                <div style="flex:1;"><strong>${info.nickname}</strong></div>
                <span style="font-size:0.8rem;color:#6B5744;">🔒</span>
            </div>`;
        }

        overlay.innerHTML = `<div style="background:#FFF8F0;padding:1.5rem;border-radius:16px;max-width:420px;width:100%;max-height:60vh;overflow-y:auto;">
            <h3 style="margin-bottom:1rem;">🔒 비밀 채팅 시작</h3>
            <p style="font-size:0.8rem;color:#6B5744;margin-bottom:1rem;">E2E 암호화 + 자동삭제(24시간) + 전달 불가</p>
            ${listHTML}
            <button onclick="this.closest('[style*=position]').remove()" style="width:100%;margin-top:1rem;padding:0.5rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#FFF8F0;">취소</button>
        </div>`;
        document.body.appendChild(overlay);
    }

    async function startSecretChatWith(otherUid) {
        try {
            showLoading('🔒 비밀 채팅 생성 중...');
            const chatId = await createSecretChat(otherUid);
            hideLoading();
            if (chatId) {
                await loadMessages();
                await openChat(chatId, otherUid);
                showToast('🔒 비밀 채팅이 시작되었습니다', 'success');
            }
        } catch (e) {
            hideLoading();
            showToast('비밀 채팅 생성 실패: ' + e.message, 'error');
        }
    }

    // ========== Check if chat has E2E enabled ==========
    async function isChatE2EEnabled(chatId) {
        try {
            const doc = await db.collection('chats').doc(chatId).get();
            if (!doc.exists) return false;
            const data = doc.data();
            return data.e2eEnabled === true; // default OFF — only encrypt when explicitly enabled
        } catch (e) { return false; }
    }

    async function getChatSettings(chatId) {
        try {
            const doc = await db.collection('chats').doc(chatId).get();
            if (!doc.exists) return {};
            return doc.data();
        } catch (e) { return {}; }
    }

    // Public API
    return {
        initKeys,
        encryptMessage,
        decryptMessage,
        encryptMessageForGroup,
        getExpiresAt,
        isMessageExpired,
        getRemainingTime,
        cleanupExpiredMessages,
        cleanupAllExpiredMessages,
        createSecretChat,
        setupScreenshotDetection,
        showChatSecuritySettings,
        updateChatSetting,
        showStartSecretChatModal,
        startSecretChatWith,
        isChatE2EEnabled,
        getChatSettings,
        exportKeysToFile,
        importKeysFromFile,
        getKeyFingerprint,
        getMyKeys,
        getRecipientPublicKeys,
        signMessage,
        verifySignature,
        AUTO_DELETE_OPTIONS
    };
})();

// Initialize E2E keys when user logs in
if (typeof firebase !== 'undefined') {
    const _e2eOrigLoadUserData = window.loadUserData;
    if (_e2eOrigLoadUserData) {
        window.loadUserData = async function() {
            await _e2eOrigLoadUserData();
            if (currentUser) {
                E2ECrypto.initKeys(currentUser.uid);
                E2ECrypto.cleanupAllExpiredMessages();
            }
        };
    }
}
