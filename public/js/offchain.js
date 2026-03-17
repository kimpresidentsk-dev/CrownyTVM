// ===== offchain.js - 오프체인 포인트, 브릿지, 스왑 =====
// ========== OFF-CHAIN (동적 토큰 시스템) ==========

// 기본 토큰 (Firestore 로드 실패 시 폴백)
const DEFAULT_OFFCHAIN_TOKENS = {
    crtd: { name: 'CRTD', get fullName() { return t('offchain.token.crtd', '트레이딩 달러'); }, icon: '📈', color: '#C4841D', isDefault: true },
    crac: { name: 'CRAC', get fullName() { return t('offchain.token.crac', '아트 크레딧'); }, icon: '🎭', color: '#8B6914', isDefault: true },
    crgc: { name: 'CRGC', get fullName() { return t('offchain.token.crgc', '굿즈 & 기빙'); }, icon: '🛒', color: '#6B8F3C', isDefault: true },
    creb: { name: 'CREB', get fullName() { return t('offchain.token.creb', '에코 바이오'); }, icon: '🌱', color: '#5B7B8C', isDefault: true }
};

// 토큰별 교환 비율 헬퍼
function getTokenRate(tokenKey) {
    return (window.OFFCHAIN_RATES && window.OFFCHAIN_RATES[tokenKey]) || window.OFFCHAIN_RATE || 100;
}

// 동적 토큰 레지스트리 (런타임에 Firestore에서 로드)
let OFFCHAIN_TOKEN_REGISTRY = { ...DEFAULT_OFFCHAIN_TOKENS };
let OFFCHAIN_TOKENS_LIST = Object.keys(DEFAULT_OFFCHAIN_TOKENS);
const OFFCHAIN_TOKEN_NAMES = {};

// 토큰 레지스트리 초기화 (앱 시작 시 호출)
async function loadTokenRegistry() {
    try {
        const doc = await db.collection('admin_config').doc('tokens').get();
        if (doc.exists && doc.data().registry) {
            const registry = doc.data().registry;
            // 기본 토큰 + DB 토큰 병합
            OFFCHAIN_TOKEN_REGISTRY = { ...DEFAULT_OFFCHAIN_TOKENS, ...registry };
        }
    } catch (e) {
        console.warn('토큰 레지스트리 로드 실패 (기본값 사용):', e);
    }
    
    // 목록/이름 동기화
    OFFCHAIN_TOKENS_LIST = Object.keys(OFFCHAIN_TOKEN_REGISTRY);
    for (const [key, info] of Object.entries(OFFCHAIN_TOKEN_REGISTRY)) {
        OFFCHAIN_TOKEN_NAMES[key] = `${info.name} (${info.fullName})`;
    }
    console.log(`✅ 토큰 레지스트리: ${OFFCHAIN_TOKENS_LIST.length}개`, OFFCHAIN_TOKENS_LIST);
}

function getTokenInfo(tokenKey) {
    return OFFCHAIN_TOKEN_REGISTRY[tokenKey] || { name: tokenKey.toUpperCase(), fullName: '', icon: '🪙', color: '#6B5744' };
}

function isOffchainToken(tokenKey) {
    return OFFCHAIN_TOKENS_LIST.includes((tokenKey || '').toLowerCase());
}

// Firestore에서 오프체인 잔액 로드
// 실시간 오프체인 잔액 리스너
let _offchainUnsubscribe = null;
function startOffchainListener() {
    if (_offchainUnsubscribe) _offchainUnsubscribe();
    if (!currentUser) return;
    _offchainUnsubscribe = db.collection('users').doc(currentUser.uid)
        .onSnapshot(doc => {
            if (!doc.exists || !userWallet) return;
            const offchain = doc.data().offchainBalances || {};
            const prev = JSON.stringify(userWallet.offchainBalances || {});
            userWallet.offchainBalances = {};
            for (const key of OFFCHAIN_TOKENS_LIST) {
                userWallet.offchainBalances[key] = offchain[key] || 0;
            }
            for (const [key, val] of Object.entries(offchain)) {
                if (!userWallet.offchainBalances.hasOwnProperty(key)) {
                    userWallet.offchainBalances[key] = val;
                }
            }
            if (JSON.stringify(userWallet.offchainBalances) !== prev) {
                console.log('<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Off-chain balances updated (realtime):', userWallet.offchainBalances);
                if (typeof updateBalancesUI === 'function') updateBalancesUI();
                if (typeof showToast === 'function') showToast('💰 잔액이 업데이트되었습니다', 'success', 2000);
            }
        }, err => console.warn('Offchain listener error:', err));
}

async function loadOffchainBalances() {
    if (!userWallet || !currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (!userDoc.exists) return;
        const data = userDoc.data();
        const offchain = data.offchainBalances || {};
        
        // 동적 토큰 전부 로드
        userWallet.offchainBalances = {};
        for (const key of OFFCHAIN_TOKENS_LIST) {
            userWallet.offchainBalances[key] = offchain[key] || 0;
        }
        // DB에 있지만 레지스트리에 없는 토큰도 보존
        for (const [key, val] of Object.entries(offchain)) {
            if (!userWallet.offchainBalances.hasOwnProperty(key)) {
                userWallet.offchainBalances[key] = val;
            }
        }
        console.log('✅ Off-chain balances:', userWallet.offchainBalances);
    } catch (error) {
        console.error('❌ Off-chain balance error:', error);
        userWallet.offchainBalances = {};
        for (const key of OFFCHAIN_TOKENS_LIST) {
            userWallet.offchainBalances[key] = 0;
        }
    }
}

// 오프체인 전송 모달
async function showOffchainSendModal() {
    if (!userWallet) { showToast(t('wallet.connect_wallet_first', '지갑을 먼저 연결하세요')); return; }
    const offchain = userWallet.offchainBalances || {};

    let tokenKey = (selectedToken && isOffchainToken(selectedToken)) ? selectedToken : null;

    if (!tokenKey) {
        const activeTokens = OFFCHAIN_TOKENS_LIST.filter(t => (offchain[t] || 0) > 0);
        if (activeTokens.length === 0) { showToast(t('offchain.no_tokens', '보유한 오프체인 토큰이 없습니다')); return; }
        
        const info = activeTokens.map((t, i) => {
            const ti = getTokenInfo(t);
            return `${i+1}. ${ti.icon} ${ti.name} — ${(offchain[t]||0).toLocaleString()} pt`;
        }).join('\n');
        const choice = await showPromptModal(t('offchain.send_title', '⚡ 오프체인 포인트 전송'), `${info}\n\n${t('offchain.select_number', '번호:')}`, '');
        if (!choice) return;
        const idx = parseInt(choice) - 1;
        if (idx < 0 || idx >= activeTokens.length) { showToast(t('offchain.invalid_choice', '잘못된 선택')); return; }
        tokenKey = activeTokens[idx];
    }

    const tokenName = tokenKey.toUpperCase();
    const balance = offchain[tokenKey] || 0;
    const email = await showPromptModal(t('offchain.recipient_title', '📧 받는 사람'), t('offchain.recipient_email', '받는 사람 이메일:'), '');
    if (!email) return;
    const amount = await showPromptModal(`💰 ${tokenName} ${t('offchain.amount_label', '수량')}`, `${email} ${t('offchain.send_amount_to', '에게 전송할')} ${tokenName}\n${t('wallet.balance_label', '잔액')}: ${balance.toLocaleString()} pt`, '');
    if (!amount) return;
    const amountNum = parseInt(amount);
    if (isNaN(amountNum) || amountNum <= 0 || amountNum > balance) {
        showToast(`${t('offchain.invalid_amount', '잘못된 수량')}\n${t('wallet.balance_label', '잔액')}: ${balance.toLocaleString()} ${tokenName}`); return;
    }
    sendOffchainPoints(email, amountNum, tokenKey);
}

// Zero-Gas 즉시 전송
async function sendOffchainPoints(recipientEmail, amount, tokenKey) {
    if (!currentUser || !userWallet) return;
    const tokenName = tokenKey.toUpperCase();
    try {
        const users = await db.collection('users').where('email', '==', recipientEmail).get();
        if (users.empty) { showToast(t('offchain.user_not_found', '❌ 사용자를 찾을 수 없습니다')); return; }
        const recipientDoc = users.docs[0];
        const recipientData = recipientDoc.data();
        const recipientOff = recipientData.offchainBalances || {};

        const senderBal = userWallet.offchainBalances[tokenKey] || 0;
        if (amount > senderBal) { showToast(`${t('offchain.insufficient_balance', '❌ 잔액 부족')} (${senderBal} ${tokenName})`); return; }

        // Firestore batch로 원자적 전송 (발신자 차감 + 수신자 적립 + 로그)
        const batch = db.batch();
        
        // 발신자 차감
        const senderRef = db.collection('users').doc(currentUser.uid);
        batch.update(senderRef, {
            [`offchainBalances.${tokenKey}`]: senderBal - amount
        });

        // 수신자 적립
        const recipientRef = db.collection('users').doc(recipientDoc.id);
        batch.update(recipientRef, {
            [`offchainBalances.${tokenKey}`]: (recipientOff[tokenKey] || 0) + amount
        });

        // 트랜잭션 로그
        const txRef = db.collection('offchain_transactions').doc();
        batch.set(txRef, {
            from: currentUser.uid, fromEmail: currentUser.email,
            to: recipientDoc.id, toEmail: recipientEmail,
            token: tokenKey, amount, type: 'transfer',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(), status: 'completed'
        });

        await batch.commit();
        userWallet.offchainBalances[tokenKey] = senderBal - amount;

        updateBalances();
        showToast(`✅ ${amount.toLocaleString()} ${tokenName} ${t('offchain.send_success', '전송 완료!')}\n→ ${recipientEmail}\n${t('offchain.zero_gas', '⚡ 가스비 0원 (오프체인)')}`);
    } catch (error) {
        console.error('❌ Off-chain transfer error:', error);
        showToast(t('offchain.send_failed', '전송 실패') + ': ' + error.message);
    }
}

// 브릿지 프리뷰
function updateBridgePreview() {
    const fromSelect = document.getElementById('bridge-from');
    const amountInput = document.getElementById('bridge-amount');
    const previewEl = document.getElementById('bridge-preview');
    const toSelect = document.getElementById('bridge-to');
    if (!fromSelect || !amountInput || !previewEl) return;

    const from = fromSelect.value;
    const amount = parseFloat(amountInput.value) || 0;

    if (toSelect) {
        toSelect.innerHTML = from === 'crny'
            ? '<option value="crtd">CRTD</option><option value="crac">CRAC</option><option value="crgc">CRGC</option><option value="creb">CREB</option>'
            : '<option value="crny">CRNY</option>';
    }
    if (amount <= 0) { previewEl.textContent = ''; return; }

    const tokenKey = from === 'crny' ? (toSelect?.value || 'crtd') : from;
    const rate = getTokenRate(tokenKey);

    if (from === 'crny') {
        previewEl.textContent = `${amount} CRNY → ${(amount * rate).toLocaleString()} ${(toSelect?.value || 'CRTD').toUpperCase()} ${t('offchain.points', '포인트')} (${t('offchain.rate', '비율')}: ${rate})`;
    } else {
        const result = amount / rate;
        previewEl.textContent = `${amount.toLocaleString()} ${from.toUpperCase()} → ${result.toFixed(2)} CRNY (${t('offchain.rate', '비율')}: ${rate})` + (amount < rate ? ` (${t('offchain.minimum', '최소')} ${rate} pt)` : '');
    }
}

// 브릿지 실행 (온체인 ↔ 오프체인)
async function executeBridge() {
    if (!userWallet || !currentUser) { showToast(t('wallet.connect_wallet_first', '지갑을 먼저 연결하세요')); return; }
    const from = document.getElementById('bridge-from').value;
    const to = document.getElementById('bridge-to')?.value || (from === 'crny' ? 'crtd' : 'crny');
    const amount = parseFloat(document.getElementById('bridge-amount').value) || 0;
    const tokenKey = from === 'crny' ? to : from;
    const rate = getTokenRate(tokenKey);
    if (amount <= 0) { showToast(t('offchain.enter_amount', '수량을 입력하세요')); return; }

    try {
        if (from === 'crny') {
            if (amount > (userWallet.balances.crny || 0)) { showToast(t('bridge.crny_insufficient', 'CRNY 잔액 부족')); return; }
            const pts = amount * rate;
            if (!confirm(`<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${amount} CRNY → ${pts.toLocaleString()} ${to.toUpperCase()}\n${t('bridge.execute_confirm', '실행?')}`)) return;

            const newCrny = userWallet.balances.crny - amount;
            await db.collection('users').doc(currentUser.uid)
                .collection('wallets').doc(currentWalletId)
                .update({ 'balances.crny': newCrny });
            userWallet.balances.crny = newCrny;

            const curPts = userWallet.offchainBalances[to] || 0;
            await db.collection('users').doc(currentUser.uid)
                .update({ [`offchainBalances.${to}`]: curPts + pts });
            userWallet.offchainBalances[to] = curPts + pts;

            await db.collection('bridge_transactions').add({
                userId: currentUser.uid, email: currentUser.email,
                direction: 'onchain_to_offchain', fromToken: 'crny', fromAmount: amount,
                toToken: to, toAmount: pts, rate,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast(`✅ ${amount} CRNY → ${pts.toLocaleString()} ${to.toUpperCase()}`);
        } else {
            const bal = userWallet.offchainBalances[from] || 0;
            if (amount > bal) { showToast(`${from.toUpperCase()} ${t('offchain.insufficient_balance', '잔액 부족')} (${bal})`); return; }
            if (amount < rate) { showToast(`${t('bridge.min_required', '최소')} ${rate} pt ${t('bridge.min_required_suffix', '필요')}`); return; }
            const crnyOut = Math.floor(amount / rate);
            const ptsUsed = crnyOut * rate;
            if (!confirm(`<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${ptsUsed.toLocaleString()} ${from.toUpperCase()} → ${crnyOut} CRNY\n${t('bridge.execute_confirm', '실행?')}`)) return;

            await db.collection('users').doc(currentUser.uid)
                .update({ [`offchainBalances.${from}`]: bal - ptsUsed });
            userWallet.offchainBalances[from] = bal - ptsUsed;

            const newCrny = (userWallet.balances.crny || 0) + crnyOut;
            await db.collection('users').doc(currentUser.uid)
                .collection('wallets').doc(currentWalletId)
                .update({ 'balances.crny': newCrny });
            userWallet.balances.crny = newCrny;

            await db.collection('bridge_transactions').add({
                userId: currentUser.uid, email: currentUser.email,
                direction: 'offchain_to_onchain', fromToken: from, fromAmount: ptsUsed,
                toToken: 'crny', toAmount: crnyOut, rate,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast(`✅ ${ptsUsed.toLocaleString()} ${from.toUpperCase()} → ${crnyOut} CRNY`);
        }
        updateBalances();
        document.getElementById('bridge-amount').value = '';
        document.getElementById('bridge-preview').textContent = '';
    } catch (error) {
        console.error('❌ Bridge error:', error);
        showToast(t('bridge.failed', '브릿지 실패') + ': ' + error.message);
    }
}

// 서비스별 포인트 적립 API
async function earnOffchainPoints(tokenKey, amount, reason) {
    if (!currentUser || !userWallet) return false;
    try {
        const cur = userWallet.offchainBalances[tokenKey] || 0;
        await db.collection('users').doc(currentUser.uid)
            .update({ [`offchainBalances.${tokenKey}`]: cur + amount });
        userWallet.offchainBalances[tokenKey] = cur + amount;

        await db.collection('offchain_transactions').add({
            userId: currentUser.uid, email: currentUser.email,
            token: tokenKey, amount, type: 'earn', reason,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        updateBalances();
        console.log(`✅ +${amount} ${tokenKey.toUpperCase()}: ${reason}`);
        return true;
    } catch (e) { console.error('Earn error:', e); return false; }
}

// 서비스별 포인트 차감 API
async function spendOffchainPoints(tokenKey, amount, reason) {
    if (!currentUser || !userWallet) return false;
    const bal = userWallet.offchainBalances[tokenKey] || 0;
    if (amount > bal) { showToast(`${tokenKey.toUpperCase()} ${t('offchain.insufficient_balance', '잔액 부족')} (${bal} pt)`); return false; }
    try {
        await db.collection('users').doc(currentUser.uid)
            .update({ [`offchainBalances.${tokenKey}`]: bal - amount });
        userWallet.offchainBalances[tokenKey] = bal - amount;

        await db.collection('offchain_transactions').add({
            userId: currentUser.uid, email: currentUser.email,
            token: tokenKey, amount: -amount, type: 'spend', reason,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        updateBalances();
        return true;
    } catch (e) { console.error('Spend error:', e); return false; }
}

// CRGC 결제 시 기부풀 자동 적립
async function autoGivingPoolContribution(paymentAmount) {
    if (!currentUser) return;
    const givingAmount = Math.ceil(paymentAmount * 0.05);
    try {
        const poolRef = db.collection('giving_pool').doc('global');
        const poolDoc = await poolRef.get();
        if (poolDoc.exists) {
            await poolRef.update({
                totalAmount: firebase.firestore.FieldValue.increment(givingAmount),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await poolRef.set({ totalAmount: givingAmount,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        await db.collection('giving_pool_logs').add({
            userId: currentUser.uid, email: currentUser.email,
            paymentAmount, givingAmount, rate: 0.05,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log(`🎁 Giving pool: +${givingAmount} CRGC`);
    } catch (e) { console.error('Giving pool error:', e); }
}

// 환전 (온·오프 통합)
async function swapTokens() {
    if (!currentUser || !userWallet) return;
    const from = document.getElementById('swap-from').value;
    const to = document.getElementById('swap-to').value;
    const amount = parseFloat(document.getElementById('swap-amount').value);
    if (!amount || amount <= 0) { showToast(t('offchain.enter_amount', '수량을 입력하세요')); return; }
    if (from === to) { showToast(t('offchain.same_token', '같은 토큰은 환전할 수 없습니다')); return; }

    const fromIsOff = isOffchainToken(from);
    const toIsOff = isOffchainToken(to);

    // 온↔오프는 브릿지로 안내
    if (fromIsOff !== toIsOff) {
        showToast(t('offchain.use_bridge', '온체인 ↔ 오프체인 교환은 "브릿지" 기능을 이용해주세요!'));
        return;
    }

    try {
        const walletRef = db.collection('users').doc(currentUser.uid).collection('wallets').doc(currentWalletId);

        if (fromIsOff) {
            // 오프체인 ↔ 오프체인 (1:1)
            const offBal = userWallet.offchainBalances || {};
            if ((offBal[from] || 0) < amount) { showToast(`${from.toUpperCase()} ${t('offchain.insufficient_balance', '잔액 부족')}`); return; }
            await db.collection('users').doc(currentUser.uid).update({
                [`offchainBalances.${from}`]: (offBal[from] || 0) - amount,
                [`offchainBalances.${to}`]: (offBal[to] || 0) + amount
            });
            userWallet.offchainBalances[from] = (offBal[from] || 0) - amount;
            userWallet.offchainBalances[to] = (offBal[to] || 0) + amount;
            showToast(`✅ ${amount} ${from.toUpperCase()} → ${amount} ${to.toUpperCase()} (1:1)`);
        } else {
            // 온체인 ↔ 온체인 (1:1, CRFN→FNC는 7:1)
            let fromBal = userWallet.balances[from] || 0;
            if (fromBal < amount) { showToast(`${from.toUpperCase()} ${t('offchain.insufficient_balance', '잔액 부족')}`); return; }

            let rate = 1;
            let actualOut = amount;
            if (from === 'crfn' && to === 'fnc') { rate = 7; actualOut = Math.floor(amount / 7); }

            await walletRef.update({
                [`balances.${from}`]: fromBal - (rate > 1 ? actualOut * rate : amount),
                [`balances.${to}`]: (userWallet.balances[to] || 0) + actualOut
            });
            userWallet.balances[from] = fromBal - (rate > 1 ? actualOut * rate : amount);
            userWallet.balances[to] = (userWallet.balances[to] || 0) + actualOut;

            if (rate > 1) showToast(`✅ ${actualOut * rate} CRFN → ${actualOut} FNC (7:1 ${t('offchain.swap', '스왑')})`);
            else showToast(`✅ ${amount} ${from.toUpperCase()} → ${amount} ${to.toUpperCase()}`);
        }

        await db.collection('offchain_transactions').add({
            userId: currentUser.uid, type: fromIsOff ? 'swap_offchain' : 'swap_onchain',
            fromToken: from, toToken: to, amount,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        updateBalances();
    } catch (e) { showToast(t('offchain.swap_failed', '환전 실패') + ': ' + e.message); }
}

// 쿠폰 사용
async function redeemCoupon() {
    if (!currentUser || !userWallet) { showToast(t('wallet.connect_wallet_first', '지갑을 먼저 연결하세요'), 'error'); return; }
    const codeInput = document.getElementById('coupon-code-input');
    const resultEl = document.getElementById('coupon-result');
    const code = (codeInput.value || '').trim().toUpperCase();
    if (!code) { resultEl.textContent = t('offchain.coupon_enter', '쿠폰 코드를 입력하세요'); return; }
    
    try {
        showLoading(t('offchain.coupon_checking', '쿠폰 확인 중...'));
        const coupons = await db.collection('coupons').where('code', '==', code).where('enabled', '==', true).get();
        if (coupons.empty) { hideLoading(); resultEl.textContent = t('offchain.coupon_invalid', '❌ 유효하지 않은 쿠폰 코드입니다'); return; }
        const couponDoc = coupons.docs[0];
        const coupon = couponDoc.data();
        if (coupon.expiresAt && coupon.expiresAt.toDate() < new Date()) { hideLoading(); resultEl.textContent = t('offchain.coupon_expired', '❌ 만료된 쿠폰입니다'); return; }
        if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) { hideLoading(); resultEl.textContent = t('offchain.coupon_maxed', '❌ 쿠폰 사용 한도 초과'); return; }
        const existing = await db.collection('coupon_redemptions').where('couponCode', '==', code).where('userId', '==', currentUser.uid).get();
        if (!existing.empty) { hideLoading(); resultEl.textContent = t('offchain.coupon_used', '❌ 이미 사용한 쿠폰입니다'); return; }
        const success = await earnOffchainPoints(coupon.tokenKey, coupon.amount, '쿠폰 사용: ' + code);
        if (!success) { hideLoading(); resultEl.textContent = t('offchain.coupon_earn_fail', '❌ 포인트 적립 실패'); return; }
        await db.collection('coupons').doc(couponDoc.id).update({ usedCount: firebase.firestore.FieldValue.increment(1) });
        await db.collection('coupon_redemptions').add({ couponId: couponDoc.id, couponCode: code, userId: currentUser.uid, userEmail: currentUser.email, tokenKey: coupon.tokenKey, amount: coupon.amount, redeemedAt: firebase.firestore.FieldValue.serverTimestamp() });
        hideLoading();
        const tokenInfo = getTokenInfo(coupon.tokenKey);
        resultEl.innerHTML = '✅ <strong>' + coupon.amount.toLocaleString() + ' ' + tokenInfo.name + '</strong> ' + t('offchain.coupon_earned', '적립 완료!');
        resultEl.style.color = '#6B8F3C';
        codeInput.value = '';
        showToast('🎟️ ' + coupon.amount.toLocaleString() + ' ' + tokenInfo.name + ' ' + t('offchain.coupon_redeemed', '쿠폰 적립!'), 'success');
    } catch (e) {
        hideLoading();
        console.error('Coupon redeem error:', e);
        resultEl.textContent = t('common.error', '❌ 오류') + ': ' + e.message;
    }
}

// Load User Data (Messages, Posts)
