// ===== wallet.js - 멀티월렛 + 온체인 ERC-20 + AES 암호화 =====

// ========== PRIVATE KEY ENCRYPTION (Web Crypto API) ==========

async function deriveEncryptionKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encryptPrivateKey(privateKey, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveEncryptionKey(password, salt);
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, key, enc.encode(privateKey)
    );
    return {
        encryptedPrivateKey: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        keySalt: btoa(String.fromCharCode(...salt)),
        keyIv: btoa(String.fromCharCode(...iv))
    };
}

async function decryptPrivateKey(encryptedData, password) {
    const salt = Uint8Array.from(atob(encryptedData.keySalt), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(encryptedData.keyIv), c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(encryptedData.encryptedPrivateKey), c => c.charCodeAt(0));
    const key = await deriveEncryptionKey(password, salt);
    try {
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        throw new Error(t('wallet.wrong_encryption_password', '암호화 비밀번호가 올바르지 않습니다'));
    }
}

// 개인키가 필요한 작업 시 호출 — 암호화된 지갑이면 비밀번호 입력 후 복호화
async function getDecryptedPrivateKey(wallet) {
    // 이미 평문 개인키가 있는 경우 (마이그레이션 전)
    if (wallet.privateKey) return wallet.privateKey;
    // 암호화된 경우
    if (wallet.encryptedPrivateKey) {
        const password = await showPromptModal(
            t('wallet.enter_encryption_pw', '지갑 비밀번호'),
            t('wallet.enter_encryption_pw_desc', '트랜잭션 서명을 위해 지갑 비밀번호를 입력하세요:')
        );
        if (!password) throw new Error(t('wallet.password_required', '비밀번호가 필요합니다'));
        return await decryptPrivateKey(wallet, password);
    }
    throw new Error(t('wallet.no_private_key', '개인키를 찾을 수 없습니다'));
}

// 기존 평문 개인키 지갑을 암호화로 마이그레이션
async function migrateWalletSecurity(walletToMigrate) {
    const wallet = walletToMigrate || allWallets.find(w => w.id === currentWalletId);
    if (!wallet || !wallet.privateKey) return false;

    const password = await showPromptModal(
        t('wallet.set_encryption_pw', '지갑 보안 비밀번호 설정'),
        t('wallet.set_encryption_pw_desc', '개인키를 암호화할 비밀번호를 설정하세요.\n이 비밀번호는 전송 시 필요합니다.\n\n비밀번호를 잊으면 복구할 수 없습니다!')
    );
    if (!password || password.length < 6) {
        if (password) showToast(t('wallet.pw_too_short', '비밀번호는 최소 6자 이상이어야 합니다'), 'warning');
        return false;
    }

    const confirmPw = await showPromptModal(
        t('wallet.confirm_encryption_pw', '비밀번호 확인'),
        t('wallet.confirm_encryption_pw_desc', '비밀번호를 다시 입력하세요:')
    );
    if (password !== confirmPw) {
        showToast(t('wallet.pw_mismatch', '비밀번호가 일치하지 않습니다'), 'error');
        return false;
    }

    try {
        showLoading(t('wallet.encrypting', '개인키 암호화 중...'));
        const encrypted = await encryptPrivateKey(wallet.privateKey, password);

        // Firestore 업데이트: 암호화 데이터 저장 + 평문 삭제
        const walletRef = db.collection('users').doc(currentUser.uid)
            .collection('wallets').doc(wallet.id);
        await walletRef.update({
            encryptedPrivateKey: encrypted.encryptedPrivateKey,
            keySalt: encrypted.keySalt,
            keyIv: encrypted.keyIv,
            privateKey: firebase.firestore.FieldValue.delete(),
            encryptedAt: new Date()
        });

        // 유저 문서의 루트 privateKey도 삭제 (auth.js에서 저장한 것)
        try {
            await db.collection('users').doc(currentUser.uid).update({
                privateKey: firebase.firestore.FieldValue.delete()
            });
        } catch (e) { /* 없을 수도 있음 */ }

        // 로컬 객체 업데이트
        wallet.encryptedPrivateKey = encrypted.encryptedPrivateKey;
        wallet.keySalt = encrypted.keySalt;
        wallet.keyIv = encrypted.keyIv;
        delete wallet.privateKey;

        hideLoading();
        showToast(t('wallet.encryption_success', '🔒 개인키가 안전하게 암호화되었습니다!'), 'success');
        displayCurrentWallet();
        return true;
    } catch (error) {
        hideLoading();
        console.error('Encryption migration error:', error);
        showToast(t('wallet.encryption_failed', '암호화 실패') + ': ' + error.message, 'error');
        return false;
    }
}

// 모든 지갑 보안 상태 체크 — 평문 개인키 있으면 안내
async function checkWalletSecurityOnLogin() {
    const unencrypted = allWallets.filter(w => w.privateKey && !w.encryptedPrivateKey);
    if (unencrypted.length > 0) {
        const doMigrate = await showConfirmModal(
            t('wallet.security_upgrade_title', '보안 업그레이드 필요'),
            t('wallet.security_upgrade_desc', `${unencrypted.length}개의 지갑에 암호화되지 않은 개인키가 있습니다.\n지금 보안 업그레이드를 진행하시겠습니까?`)
        );
        if (doMigrate) {
            for (const w of unencrypted) {
                const ok = await migrateWalletSecurity(w);
                if (!ok) break;
            }
        }
    }
}

// ========== MULTI-WALLET SYSTEM ==========
let currentWalletId = null;
let allWallets = [];

// Load User Wallet
async function loadUserWallet() {
    if (!currentUser) return;
    
    // Load all wallets (소프트 삭제된 지갑 제외)
    const walletsSnapshot = await db.collection('users').doc(currentUser.uid)
        .collection('wallets').get();
    
    allWallets = [];
    walletsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.status === 'deleted') return; // 소프트 삭제된 지갑 제외
        allWallets.push({ id: doc.id, ...data });
    });
    
    // If no wallets, create first one
    if (allWallets.length === 0) {
        await createFirstWallet();
        return;
    }
    
    // Load wallet selector
    const selector = document.getElementById('wallet-selector');
    selector.innerHTML = '';
    
    allWallets.forEach((wallet, index) => {
        const option = document.createElement('option');
        option.value = wallet.id;
        const type = wallet.isImported ? '↓' : '⌂';
        const name = wallet.name || `${t('wallet.wallet_label', '지갑')} ${index + 1}`;
        const addr = wallet.walletAddress.slice(0, 6) + '...' + wallet.walletAddress.slice(-4);
        option.textContent = `${type} ${name} (${addr})`;
        selector.appendChild(option);
    });
    
    // Load first wallet or previously selected
    currentWalletId = allWallets[0].id;
    displayCurrentWallet();
    
    // 보안 체크 (평문 개인키 있으면 마이그레이션 안내)
    setTimeout(() => checkWalletSecurityOnLogin(), 2000);
}

async function createFirstWallet() {
    const web3 = new Web3();
    const newAccount = web3.eth.accounts.create();
    
    // 암호화 비밀번호 설정
    const password = await showPromptModal(
        t('wallet.set_encryption_pw', '지갑 보안 비밀번호 설정'),
        t('wallet.first_wallet_pw_desc', '개인키를 보호할 비밀번호를 설정하세요.\n전송 시 이 비밀번호가 필요합니다.\n\n비밀번호를 잊으면 복구할 수 없습니다!\n(최소 6자)')
    );
    
    let walletData = {
        name: t('wallet.default_name', '크라우니 지갑 1'),
        walletAddress: newAccount.address,
        isImported: false,
        totalGasSubsidy: 0,
        createdAt: new Date()
    };
    
    if (password && password.length >= 6) {
        const encrypted = await encryptPrivateKey(newAccount.privateKey, password);
        walletData.encryptedPrivateKey = encrypted.encryptedPrivateKey;
        walletData.keySalt = encrypted.keySalt;
        walletData.keyIv = encrypted.keyIv;
        walletData.encryptedAt = new Date();
    } else {
        // 비밀번호 미설정 시 평문 저장 (추후 마이그레이션)
        walletData.privateKey = newAccount.privateKey;
    }
    
    const walletRef = await db.collection('users').doc(currentUser.uid)
        .collection('wallets').add(walletData);
    
    currentWalletId = walletRef.id;
    await loadUserWallet();
}

async function switchWallet() {
    const selector = document.getElementById('wallet-selector');
    currentWalletId = selector.value;
    await displayCurrentWallet();
}

async function displayCurrentWallet() {
    const wallet = allWallets.find(w => w.id === currentWalletId);
    if (!wallet) return;
    
    userWallet = wallet;
    
    const addr = wallet.walletAddress;
    document.getElementById('wallet-address').textContent = 
        addr.slice(0, 6) + '...' + addr.slice(-4);
    document.getElementById('wallet-address-full').textContent = addr;
    
    // Massivescan link
    document.getElementById('polygonscan-link').href = 
        `https://polygonscan.com/address/${addr}`;
    
    // Wallet type
    const walletType = wallet.isImported ? t('wallet.type_external', '외부 지갑') : t('wallet.type_crowny', '크라우니 지갑');
    document.getElementById('wallet-type').textContent = walletType;
    
    // Gas subsidy info (only for Crowny wallets)
    if (!wallet.isImported) {
        document.getElementById('gas-subsidy-info').style.display = 'block';
        const totalGas = wallet.totalGasSubsidy || 0;
        document.getElementById('total-gas-subsidy').textContent = totalGas.toFixed(4);
    } else {
        document.getElementById('gas-subsidy-info').style.display = 'none';
    }
    
    // Security status display
    const securityEl = document.getElementById('wallet-security-status');
    if (securityEl) {
        if (wallet.encryptedPrivateKey) {
            securityEl.innerHTML = `<span style="color:#6B8F3C;display:flex;align-items:center;gap:0.3rem;"><i data-lucide="lock" style="width:16px;height:16px;color:#6B8F3C;"></i>${t('wallet.encrypted', '암호화됨')}<i data-lucide="check" style="width:16px;height:16px;color:#6B8F3C;"></i></span>`;
        } else if (wallet.privateKey) {
            securityEl.innerHTML = `<span style="color:#C4841D;display:flex;align-items:center;gap:0.3rem;"><i data-lucide="alert-circle" style="width:16px;height:16px;color:#C4841D;"></i>${t('wallet.not_encrypted', '미암호화')}</span> <button onclick="migrateWalletSecurity()" style="margin-left:8px;padding:4px 10px;background:#3D2B1F;color:#FFF8F0;border:none;border-radius:6px;cursor:pointer;font-size:0.75rem;display:flex;align-items:center;gap:0.3rem;"><i data-lucide="shield" style="width:14px;height:14px;color:#FFF8F0;"></i>${t('wallet.upgrade_security', '보안 업그레이드')}</button>`;
        }
    }
    
    // Load balances
    if (!wallet.balances) {
        userWallet.balances = { crny: 0, fnc: 0, crfn: 0 };
        await db.collection('users').doc(currentUser.uid)
            .collection('wallets').doc(currentWalletId)
            .update({ balances: { crny: 0, fnc: 0, crfn: 0 } });
    }
    
    // 오프체인은 계정(유저) 단위 — 지갑별이 아님
    await loadRealBalances();
    await loadOffchainBalances();
    await loadMaticBalance();
    updateBalances();
}

async function showAddWalletModal() {
    const choice = await showPromptModal(t('wallet.add_wallet', '지갑 추가'), t('wallet.add_prompt', '1. 새 크라우니 지갑 생성\n2. 외부 지갑 가져오기\n\n번호를 입력하세요:'));
    
    if (choice === '1') {
        await createNewWallet();
    } else if (choice === '2') {
        await showImportWallet();
    }
}

async function showImportWallet() {
    const name = (await showPromptModal(t('wallet.import_title', '지갑 가져오기'), t('wallet.wallet_name_label', '지갑 이름:'))) || t('wallet.external_wallet', '외부 지갑');
    const privateKey = await showPromptModal(t('wallet.private_key_title', '개인키 입력'), t('wallet.private_key_prompt', '개인키를 입력하세요:\n(0x로 시작하는 64자리)'));
    if (!privateKey) return;
    
    try {
        const web3 = new Web3();
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        
        const confirmed = await showConfirmModal(
            t('wallet.add_confirm_title', '지갑 추가 확인'),
            `${t('wallet.add_confirm_msg', '이 지갑을 추가하시겠습니까?')}\n\n${t('wallet.wallet_name_label', '이름')}: ${name}\n${t('wallet.address_label', '주소')}: ${account.address}\n\n${t('wallet.external_gas_warning', '외부 지갑은 가스비가 자동 차감됩니다.')}`
        );
        
        if (confirmed) {
            await importExternalWallet(name, privateKey, account.address);
        }
    } catch (error) {
        showToast(t('wallet.invalid_private_key', '잘못된 개인키입니다'), 'error');
    }
}

async function importExternalWallet(name, privateKey, address) {
    try {
        // 암호화 비밀번호 설정
        const password = await showPromptModal(
            t('wallet.set_encryption_pw', '지갑 보안 비밀번호 설정'),
            t('wallet.import_pw_desc', '가져온 개인키를 보호할 비밀번호를 설정하세요.\n(최소 6자)')
        );
        
        let walletData = {
            name: name,
            walletAddress: address,
            isImported: true,
            balances: { crny: 0, fnc: 0, crfn: 0 },
            importedAt: new Date()
        };
        
        if (password && password.length >= 6) {
            const encrypted = await encryptPrivateKey(privateKey, password);
            walletData.encryptedPrivateKey = encrypted.encryptedPrivateKey;
            walletData.keySalt = encrypted.keySalt;
            walletData.keyIv = encrypted.keyIv;
            walletData.encryptedAt = new Date();
        } else {
            walletData.privateKey = privateKey;
        }
        
        const walletRef = await db.collection('users').doc(currentUser.uid)
            .collection('wallets').add(walletData);
        
        showToast(t('wallet.import_success', '외부 지갑 추가 완료!'), 'success');
        currentWalletId = walletRef.id;
        await loadUserWallet();
    } catch (error) {
        console.error('Import error:', error);
        showToast(t('wallet.import_failed', '지갑 추가 실패') + ': ' + error.message, 'error');
    }
}

async function createNewWallet() {
    try {
        const name = (await showPromptModal(t('wallet.create_title', '새 지갑 생성'), t('wallet.wallet_name_label', '지갑 이름:'))) || `${t('wallet.crowny_wallet', '크라우니 지갑')} ${allWallets.length + 1}`;
        
        const web3 = new Web3();
        const newAccount = web3.eth.accounts.create();
        
        // 암호화 비밀번호 설정
        const password = await showPromptModal(
            t('wallet.set_encryption_pw', '지갑 보안 비밀번호 설정'),
            t('wallet.new_wallet_pw_desc', '개인키를 보호할 비밀번호를 설정하세요.\n(최소 6자)')
        );
        
        let walletData = {
            name: name,
            walletAddress: newAccount.address,
            isImported: false,
            totalGasSubsidy: 0,
            balances: { crny: 0, fnc: 0, crfn: 0 },
            createdAt: new Date()
        };
        
        if (password && password.length >= 6) {
            const encrypted = await encryptPrivateKey(newAccount.privateKey, password);
            walletData.encryptedPrivateKey = encrypted.encryptedPrivateKey;
            walletData.keySalt = encrypted.keySalt;
            walletData.keyIv = encrypted.keyIv;
            walletData.encryptedAt = new Date();
        } else {
            walletData.privateKey = newAccount.privateKey;
        }
        
        const walletRef = await db.collection('users').doc(currentUser.uid)
            .collection('wallets').add(walletData);
        
        showToast(t('wallet.create_success', '새 지갑 생성 완료!'), 'success');
        currentWalletId = walletRef.id;
        await loadUserWallet();
    } catch (error) {
        console.error('Create wallet error:', error);
        showToast(t('wallet.create_failed', '지갑 생성 실패') + ': ' + error.message, 'error');
    }
}

async function renameCurrentWallet() {
    const wallet = allWallets.find(w => w.id === currentWalletId);
    if (!wallet) return;
    const newName = await showPromptModal(t('wallet.rename_title', '지갑 이름 변경'), t('wallet.rename_prompt', '새 이름을 입력하세요:'), wallet.name || '');
    if (!newName || !newName.trim()) return;
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('wallets').doc(currentWalletId).update({ name: newName.trim() });
        wallet.name = newName.trim();
        showToast(t('wallet.rename_success', '✅ 지갑 이름 변경 완료'), 'success');
        await loadUserWallet();
    } catch (e) {
        showToast(t('wallet.rename_failed', '이름 변경 실패') + ': ' + e.message, 'error');
    }
}

async function deleteCurrentWallet() {
    if (allWallets.length === 1) {
        showToast(t('wallet.delete_last', '마지막 지갑은 삭제할 수 없습니다.'), 'warning');
        return;
    }
    
    const wallet = allWallets.find(w => w.id === currentWalletId);
    const confirmed = await showConfirmModal(
        t('wallet.delete_wallet', '지갑 삭제'),
        `${t('wallet.delete_confirm', '지갑을 삭제하시겠습니까?')}\n\n${wallet.name}\n${wallet.walletAddress}\n\n${t('wallet.delete_warning', '삭제된 지갑은 관리자만 복구할 수 있습니다.')}`
    );
    
    if (!confirmed) return;
    
    // 비밀번호 재인증
    try {
        const user = firebase.auth().currentUser;
        const isGoogleOnly = user.providerData.every(p => p.providerId === 'google.com');
        
        if (isGoogleOnly) {
            // Google 전용 사용자: Google 재인증
            const provider = new firebase.auth.GoogleAuthProvider();
            await user.reauthenticateWithPopup(provider);
        } else {
            // 이메일/비밀번호 사용자: 비밀번호 입력
            const password = await showPromptModal(
                t('wallet.password_confirm', '비밀번호 확인'),
                t('wallet.password_confirm_desc', '지갑 삭제를 위해 비밀번호를 입력하세요:')
            );
            if (!password) return;
            
            const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
            await user.reauthenticateWithCredential(credential);
        }
    } catch (authError) {
        console.error('Reauth error:', authError);
        showToast(t('wallet.auth_failed', '인증 실패. 비밀번호를 확인하세요.'), 'error');
        return;
    }
    
    // 소프트 삭제 (실제 삭제 대신 status 변경)
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('wallets').doc(currentWalletId).update({
                status: 'deleted',
                deletedAt: new Date()
            });
        
        showToast(t('wallet.delete_success', '지갑 삭제 완료!'), 'success');
        await loadUserWallet();
    } catch (error) {
        console.error('Delete error:', error);
        showToast(t('wallet.delete_failed', '지갑 삭제 실패') + ': ' + error.message, 'error');
    }
}

// Load Real Balances from Polygon (온체인 조회 → 별도 저장)
async function loadRealBalances() {
    if (!userWallet) return;
    
    try {
        const address = userWallet.walletAddress;
        console.log('Loading onchain balances for:', address);
        
        // 온체인 잔액 조회
        const onchain = await getAllOnchainBalances(address);
        
        // 온체인 잔액은 별도 필드에 저장 (브릿지 잔액 보존)
        userWallet.onchainBalances = { crny: onchain.crny, fnc: onchain.fnc, crfn: onchain.crfn };
        
        // Firestore의 플랫폼 잔액(balances)이 없으면 온체인 값으로 초기화
        if (!userWallet.balances || (userWallet.balances.crny === 0 && userWallet.balances.fnc === 0 && userWallet.balances.crfn === 0)) {
            userWallet.balances.crny = onchain.crny;
            userWallet.balances.fnc = onchain.fnc;
            userWallet.balances.crfn = onchain.crfn;
        }
        
        // onchainBalances만 Firestore에 별도 저장 (balances는 덮어쓰지 않음)
        await db.collection('users').doc(currentUser.uid)
            .collection('wallets').doc(currentWalletId).update({
                'onchainBalances.crny': onchain.crny,
                'onchainBalances.fnc': onchain.fnc,
                'onchainBalances.crfn': onchain.crfn
            });
        
        console.log('✅ Onchain:', onchain, '| Platform:', userWallet.balances);
    } catch (error) {
        console.error('❌ Balance load error:', error);
        // 에러 시 기존 Firestore 잔액 유지 (덮어쓰기 안 함)
        console.log('온체인 조회 실패 — 플랫폼 잔액 유지');
    }
}

// Copy Address
function copyAddress() {
    if (!userWallet) return;
    
    const address = userWallet.walletAddress;
    
    // Modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(address).then(() => {
            showToast(t('toast.copied_address', '주소가 복사되었습니다'), 'success');
        }).catch(err => {
            // Fallback
            fallbackCopy(address);
        });
    } else {
        // Fallback
        fallbackCopy(address);
    }
}

function fallbackCopy(text) {
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.style.position = 'fixed';
    temp.style.left = '-999999px';
    document.body.appendChild(temp);
    temp.select();
    temp.setSelectionRange(0, 99999);
    
    try {
        document.execCommand('copy');
        showToast(t('toast.copied_address', '주소가 복사되었습니다'), 'success');
    } catch (err) {
        showToast(t('wallet.copy_failed', '복사 실패. 수동으로 복사해주세요'), 'error');
    }
    
    document.body.removeChild(temp);
}

// Update Balances (7-token: 3 on-chain + 4 off-chain + MATIC)
async function refreshBalancesFromDB() {
    if (!currentUser || !userWallet) return;
    try {
        await loadOffchainBalances();
        await loadRealBalances();
        updateBalancesUI();
    } catch(e) { console.warn('Balance refresh error:', e); }
}

function updateBalances() {
    updateBalancesUI();
}

function updateBalancesUI() {
    if (!userWallet) return;
    
    // On-chain balances
    document.getElementById('crny-balance').textContent = userWallet.balances.crny.toFixed(2);
    document.getElementById('fnc-balance').textContent = userWallet.balances.fnc.toFixed(2);
    document.getElementById('crfn-balance').textContent = userWallet.balances.crfn.toFixed(2);
    
    // MATIC balance
    const maticEl = document.getElementById('matic-balance');
    if (maticEl) maticEl.textContent = (userWallet.maticBalance || 0).toFixed(4);
    
    // Off-chain balances
    const offchain = userWallet.offchainBalances || { crtd: 0, crac: 0, crgc: 0, creb: 0 };
    const crtdEl = document.getElementById('crtd-balance');
    const cracEl = document.getElementById('crac-balance');
    const crgcEl = document.getElementById('crgc-balance');
    const crebEl = document.getElementById('creb-balance');
    if (crtdEl) crtdEl.textContent = (offchain.crtd || 0).toLocaleString();
    if (cracEl) cracEl.textContent = (offchain.crac || 0).toLocaleString();
    if (crgcEl) crgcEl.textContent = (offchain.crgc || 0).toLocaleString();
    if (crebEl) crebEl.textContent = (offchain.creb || 0).toLocaleString();
    
    // Total asset in CRNY equivalent (per-token rates)
    const totalOffchain = (offchain.crtd || 0) + (offchain.crac || 0) + (offchain.crgc || 0) + (offchain.creb || 0);
    const totalCrnyFromOffchain = 
        (offchain.crtd || 0) / getTokenRate('crtd') +
        (offchain.crac || 0) / getTokenRate('crac') +
        (offchain.crgc || 0) / getTokenRate('crgc') +
        (offchain.creb || 0) / getTokenRate('creb');
    const totalCrny = userWallet.balances.crny + userWallet.balances.fnc + userWallet.balances.crfn + totalCrnyFromOffchain;
    const totalEl = document.getElementById('total-asset-crny');
    if (totalEl) totalEl.textContent = totalCrny.toFixed(2);
    
    // Total offchain points
    const offPtsEl = document.getElementById('total-offchain-pts');
    if (offPtsEl) offPtsEl.textContent = `${totalOffchain.toLocaleString()} pt`;
    
    // Sync badge
    const badge = document.getElementById('wallet-sync-badge');
    if (badge) { badge.style.display = 'inline'; setTimeout(() => badge.style.display = 'none', 3000); }
}

// ========== MATIC (가스비) 기능 ==========

// MATIC 잔액 조회
async function loadMaticBalance() {
    if (!userWallet || !userWallet.walletAddress) return;
    try {
        const weiBalance = await web3.eth.getBalance(userWallet.walletAddress);
        userWallet.maticBalance = parseFloat(web3.utils.fromWei(weiBalance, 'ether'));
        const maticEl = document.getElementById('matic-balance');
        if (maticEl) maticEl.textContent = userWallet.maticBalance.toFixed(4);
        console.log('⟠ MATIC:', userWallet.maticBalance.toFixed(4));
    } catch (e) {
        console.warn('MATIC 잔액 조회 실패:', e.message);
        userWallet.maticBalance = 0;
    }
}

// MATIC 입금 안내 (주소 표시)
function showMaticDeposit() {
    if (!userWallet) { showToast(t('wallet.connect_wallet_first', '지갑을 먼저 연결하세요'), 'warning'); return; }
    const addr = userWallet.walletAddress;
    
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.innerHTML = `
        <div style="background:#3D2B1F;padding:1.5rem;border-radius:16px;max-width:420px;width:100%;text-align:center;">
            <h3 style="margin-bottom:1rem;">${t('wallet.matic_deposit_title', 'MATIC 입금')}</h3>
            <p style="font-size:0.85rem;color:#6B5744;margin-bottom:1rem;">${t('wallet.matic_deposit_desc', '아래 Polygon 주소로 MATIC을 보내주세요')}</p>
            <div style="background:#F7F3ED;padding:1rem;border-radius:10px;margin-bottom:1rem;word-break:break-all;font-family:monospace;font-size:0.82rem;font-weight:600;color:#3D2B1F;cursor:pointer;" onclick="navigator.clipboard&&navigator.clipboard.writeText('${addr}').then(()=>showToast(t('wallet.address_copied','주소 복사됨'),'success'))">
                ${addr}
            </div>
            <p style="font-size:0.75rem;color:#B54534;margin-bottom:1rem;">${t('wallet.matic_deposit_warning', '반드시 <strong>Polygon 네트워크</strong>로 전송하세요!<br>다른 네트워크(ETH 등)로 보내면 복구 불가합니다.')}</p>
            <div style="display:flex;gap:0.5rem;">
                <button onclick="navigator.clipboard&&navigator.clipboard.writeText('${addr}').then(()=>showToast(t('wallet.address_copied','주소 복사됨'),'success'))" style="flex:1;padding:0.7rem;background:#3D2B1F;color:#FFF8F0;border:none;border-radius:8px;cursor:pointer;font-weight:700;display:flex;align-items:center;justify-content:center;gap:0.3rem;"><i data-lucide="copy" style="width:16px;height:16px;color:#FFF8F0;"></i>주소 복사</button>
                <button onclick="this.closest('div[style*=fixed]').remove()" style="flex:1;padding:0.7rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#3D2B1F;">${t('common.close', '닫기')}</button>
            </div>
        </div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    
    // Initialize Lucide icons for the new content
    if (typeof lucide !== 'undefined') {
        setTimeout(() => lucide.createIcons(), 10);
    }
}

// MATIC 송금
async function showMaticSend() {
    if (!userWallet) { showToast(t('wallet.connect_wallet_first', '지갑을 먼저 연결하세요'), 'warning'); return; }
    
    const maticBal = userWallet.maticBalance || 0;
    if (maticBal <= 0) {
        showToast(t('wallet.matic_no_balance', 'MATIC 잔액이 없습니다. 먼저 입금해주세요.'), 'warning');
        return;
    }
    
    const toAddress = await showPromptModal(t('wallet.matic_send_title', 'MATIC 송금'), `${t('wallet.balance_label', '잔액')}: ${maticBal.toFixed(4)} MATIC\n\n${t('wallet.matic_recipient', '받는 주소 (0x...)')}:`);
    if (!toAddress || !toAddress.startsWith('0x') || toAddress.length !== 42) {
        if (toAddress) showToast(t('wallet.invalid_address', '유효하지 않은 주소입니다'), 'error');
        return;
    }
    
    const amount = await showPromptModal(t('wallet.matic_send_amount_title', '송금 금액'), `${toAddress.slice(0,6)}...${toAddress.slice(-4)} ${t('wallet.matic_send_to', '에게 보낼 MATIC')}:\n${t('wallet.balance_label', '잔액')}: ${maticBal.toFixed(4)}`);
    if (!amount) return;
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0 || amountNum >= maticBal) {
        showToast(`${t('wallet.invalid_amount', '유효하지 않은 금액입니다')} (${t('wallet.balance_label', '잔액')}: ${maticBal.toFixed(4)} MATIC)`, 'error');
        return;
    }
    
    const confirmed = await showConfirmModal(t('wallet.matic_send_confirm_title', 'MATIC 송금 확인'), `${t('wallet.matic_recipient', '받는 주소')}: ${toAddress}\n${t('wallet.matic_send_amount_label', '금액')}: ${amountNum} MATIC\n\n${t('wallet.proceed_confirm', '진행하시겠습니까?')}`);
    if (!confirmed) return;
    
    try {
        showLoading(t('wallet.matic_sending', 'MATIC 송금 중...'));
        
        const amountWei = web3.utils.toWei(amountNum.toString(), 'ether');
        const gasPrice = await web3.eth.getGasPrice();
        
        const tx = {
            from: userWallet.walletAddress,
            to: toAddress,
            value: amountWei,
            gas: 21000,
            gasPrice: gasPrice
        };
        
        const decryptedKey = await getDecryptedPrivateKey(userWallet);
        const signedTx = await web3.eth.accounts.signTransaction(tx, decryptedKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        
        hideLoading();
        showToast(`MATIC ${amountNum} ${t('wallet.matic_send_success', '송금 완료!')}`, 'success');
        
        // 잔액 갱신
        await loadMaticBalance();
        
    } catch (error) {
        hideLoading();
        console.error('MATIC 송금 실패:', error);
        showToast(t('wallet.matic_send_failed', 'MATIC 송금 실패') + ': ' + error.message, 'error');
    }
}


// ========== 온체인 ERC-20 함수 (web3) ==========
let web3;
try {
    web3 = new Web3('https://polygon-rpc.com');
} catch(e) {
    web3 = new Web3('https://rpc-mainnet.matic.quiknode.pro');
}

// ========== 온체인 ERC-20 함수 ==========

// 특정 지갑의 ERC-20 잔액 조회
async function getOnchainBalance(walletAddress, tokenKey) {
    try {
        const token = POLYGON_TOKENS[tokenKey.toLowerCase()];
        if (!token) return 0;
        
        const contract = new web3.eth.Contract(ERC20_ABI, token.address);
        const rawBalance = await contract.methods.balanceOf(walletAddress).call();
        const balance = parseFloat(web3.utils.fromWei(rawBalance, 'ether'));
        return balance;
    } catch (error) {
        console.error(`온체인 잔액 조회 실패 (${tokenKey}):`, error);
        return 0;
    }
}

// 전체 잔액 새로고침
async function refreshAllBalances() {
    if (!userWallet || !currentUser) { showToast(t('wallet.connect_wallet_first', '지갑을 먼저 연결하세요'), 'warning'); return; }
    try {
        showLoading(t('wallet.refreshing', '잔액 새로고침 중...'));
        await loadRealBalances();
        await loadOffchainBalances();
        await loadMaticBalance();
        updateBalances();
        hideLoading();
        showToast(t('wallet.refresh_success', '잔액이 업데이트되었습니다'), 'success');
    } catch (e) {
        hideLoading();
        showToast(t('wallet.refresh_failed', '새로고침 실패') + ': ' + e.message, 'error');
    }
}

// 3개 토큰 전체 잔액 조회
async function getAllOnchainBalances(walletAddress) {
    const [crny, fnc, crfn] = await Promise.all([
        getOnchainBalance(walletAddress, 'crny'),
        getOnchainBalance(walletAddress, 'fnc'),
        getOnchainBalance(walletAddress, 'crfn')
    ]);
    return { crny, fnc, crfn };
}

// ERC-20 토큰 전송 (private key 필요)
async function sendOnchainToken(fromPrivateKey, toAddress, tokenKey, amount) {
    const token = POLYGON_TOKENS[tokenKey.toLowerCase()];
    if (!token) throw new Error(t('wallet.unknown_token', '알 수 없는 토큰: ') + tokenKey);
    
    const contract = new web3.eth.Contract(ERC20_ABI, token.address);
    const amountWei = web3.utils.toWei(amount.toString(), 'ether');
    
    // 보내는 지갑 주소 추출
    const account = web3.eth.accounts.privateKeyToAccount(fromPrivateKey);
    const fromAddress = account.address;
    
    // 트랜잭션 데이터
    const txData = contract.methods.transfer(toAddress, amountWei).encodeABI();
    
    // 가스 추정
    const gasPrice = await web3.eth.getGasPrice();
    let gasEstimate;
    try {
        gasEstimate = await contract.methods.transfer(toAddress, amountWei).estimateGas({ from: fromAddress });
    } catch (e) {
        gasEstimate = 100000; // 기본값
    }
    
    const tx = {
        from: fromAddress,
        to: token.address,
        data: txData,
        gas: Math.floor(gasEstimate * 1.2), // 20% 여유
        gasPrice: gasPrice
    };
    
    // 서명 & 전송
    const signedTx = await web3.eth.accounts.signTransaction(tx, fromPrivateKey);
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    
    console.log(`✅ 온체인 전송 완료: ${amount} ${token.symbol} → ${toAddress}`);
    console.log(`   TX: https://polygonscan.com/tx/${receipt.transactionHash}`);
    
    return receipt;
}

