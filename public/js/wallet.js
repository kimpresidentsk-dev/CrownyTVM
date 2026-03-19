// ===== wallet.js - CrownyTVM Wallet (Crowny Network) =====
// 독립 서버 모드 전용. Firebase/Polygon 의존성 없음.

let _walletData = null;
let _walletLoading = false;

// ═══ 지갑 로드 (CrownyTVM 서버 API) ═══
async function ctvmLoadWallet() {
    if (_walletLoading) return;
    _walletLoading = true;
    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    const username = localStorage.getItem('crowny_username');
    if (!token) {
        _walletLoading = false;
        return;
    }
    try {
        const res = await fetch('/api/wallet', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) throw new Error('API error');
        _walletData = await res.json();

        // UI 업데이트
        const usernameEl = document.getElementById('wallet-username');
        const addrEl = document.getElementById('wallet-address-full');
        const totalEl = document.getElementById('total-asset-crn');
        const crnEl = document.getElementById('crn-balance');
        const fncEl = document.getElementById('fnc-balance');
        const crmEl = document.getElementById('crm-balance');

        if (usernameEl) usernameEl.textContent = _walletData.username || username || '--';
        if (addrEl) addrEl.textContent = _walletData.walletAddress || '--';

        const bal = _walletData.balances || { CRN: 0, FNC: 0, CRM: 0 };
        if (crnEl) crnEl.textContent = (bal.CRN || 0).toLocaleString();
        if (fncEl) fncEl.textContent = (bal.FNC || 0).toLocaleString();
        if (crmEl) crmEl.textContent = (bal.CRM || 0).toLocaleString();

        // CRN 환산: 10 FNC = 1 CRN, 1000 CRM = 1 CRN
        const totalCRN = (bal.CRN || 0) + (bal.FNC || 0) / 10 + (bal.CRM || 0) / 1000;
        if (totalEl) totalEl.textContent = totalCRN.toFixed(2) + ' CRN';

        // 거래 내역
        renderTransactions(_walletData.transactions || []);

        // Lucide 아이콘 갱신
        if (typeof lucide !== 'undefined') {
            const walletSection = document.getElementById('wallet');
            if (walletSection) lucide.createIcons({ nodes: [walletSection] });
        }

        // userWallet 전역 호환 (다른 코드에서 참조할 수 있으므로)
        window.userWallet = {
            walletAddress: _walletData.walletAddress,
            balances: { crny: bal.CRN || 0, fnc: bal.FNC || 0, crm: bal.CRM || 0 }
        };
    } catch (e) {
        console.error('[WALLET] 로드 실패:', e);
    }
    _walletLoading = false;
}

// ═══ 잔액 새로고침 ═══
async function ctvmRefreshWallet() {
    if (typeof showToast === 'function') showToast('새로고침 중...', 'info');
    await ctvmLoadWallet();
    if (typeof showToast === 'function') showToast('잔액이 업데이트되었습니다', 'success');
}

// ═══ 주소 복사 ═══
function ctvmCopyAddress() {
    const addr = _walletData?.walletAddress;
    if (!addr) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(addr).then(() => {
            if (typeof showToast === 'function') showToast('주소가 복사되었습니다', 'success');
        });
    } else {
        const t = document.createElement('textarea');
        t.value = addr; t.style.position = 'fixed'; t.style.left = '-9999px';
        document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); if (typeof showToast === 'function') showToast('주소가 복사되었습니다', 'success'); } catch(e) {}
        document.body.removeChild(t);
    }
}

// ═══ 송금 ═══
async function ctvmSendToken() {
    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    if (!token) { showToast('로그인이 필요합니다', 'error'); return; }

    const toUser = (document.getElementById('send-to')?.value || '').trim();
    const amount = parseFloat(document.getElementById('send-amount')?.value || 0);
    const currency = document.getElementById('send-currency')?.value || 'CRN';
    const memo = (document.getElementById('send-memo')?.value || '').trim();

    if (!toUser) { showToast('받는 사람을 입력하세요', 'warning'); return; }
    if (!amount || amount <= 0) { showToast('수량을 입력하세요', 'warning'); return; }

    const bal = _walletData?.balances?.[currency] || 0;
    if (amount > bal) { showToast(`${currency} 잔액 부족 (보유: ${bal})`, 'error'); return; }

    const confirmed = typeof showConfirmModal === 'function'
        ? await showConfirmModal('송금 확인', `${toUser}에게 ${amount} ${currency} 전송\n${memo ? '메모: ' + memo : ''}`)
        : confirm(`${toUser}에게 ${amount} ${currency} 전송하시겠습니까?`);
    if (!confirmed) return;

    try {
        const res = await fetch('/api/wallet/transact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ type: 'send', amount, to: toUser, memo, currency })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error, 'error'); return; }

        showToast(`${amount} ${currency} → ${toUser} 전송 완료!`, 'success');
        document.getElementById('send-to').value = '';
        document.getElementById('send-amount').value = '';
        document.getElementById('send-memo').value = '';
        await ctvmLoadWallet();
    } catch (e) {
        showToast('전송 실패: ' + e.message, 'error');
    }
}

// ═══ 스왑 ═══
async function ctvmSwapToken() {
    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    if (!token) { showToast('로그인이 필요합니다', 'error'); return; }

    const from = document.getElementById('swap-from')?.value || 'CRM';
    const to = document.getElementById('swap-to')?.value || 'FNC';
    const amount = parseFloat(document.getElementById('swap-amount')?.value || 0);

    if (!amount || amount <= 0) { showToast('수량을 입력하세요', 'warning'); return; }

    const confirmed = typeof showConfirmModal === 'function'
        ? await showConfirmModal('스왑 확인', `${amount} ${from} → ${to} 스왑`)
        : confirm(`${amount} ${from} → ${to} 스왑하시겠습니까?`);
    if (!confirmed) return;

    try {
        const res = await fetch('/api/wallet/swap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ from, to, amount })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error, 'error'); return; }

        showToast(`${data.sent} ${data.sentCurrency} → ${data.received} ${data.receivedCurrency} 스왑 완료!`, 'success');
        document.getElementById('swap-amount').value = '';
        await ctvmLoadWallet();
    } catch (e) {
        showToast('스왑 실패: ' + e.message, 'error');
    }
}

// ═══ 거래 내역 렌더링 ═══
function renderTransactions(txns) {
    const container = document.getElementById('wallet-transactions');
    if (!container) return;

    if (!txns || txns.length === 0) {
        container.innerHTML = '<p style="color:var(--accent); font-size:0.85rem; text-align:center; padding:1rem;">거래 내역이 없습니다.</p>';
        return;
    }

    container.innerHTML = txns.map(tx => {
        const isIn = tx.txType === 'receive' || tx.txType === 'deposit' || tx.txType === 'swap_in';
        const icon = isIn ? 'arrow-down-left' : 'arrow-up-right';
        const color = isIn ? '#6B8F3C' : '#B54534';
        const sign = isIn ? '+' : '-';
        const currency = tx.currency || 'CRN';
        const date = new Date(tx.created).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const label = tx.memo || tx.txType || '';
        return `<div style="display:flex; align-items:center; gap:0.6rem; padding:0.6rem 0; border-bottom:1px solid #F7F3ED;">
            <div style="width:28px; height:28px; background:${color}15; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i data-lucide="${icon}" style="width:14px;height:14px;color:${color};"></i></div>
            <div style="flex:1; min-width:0;">
                <div style="font-size:0.8rem; font-weight:600; color:#3D2B1F; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${label}</div>
                <div style="font-size:0.65rem; color:var(--accent);">${date}</div>
            </div>
            <div style="font-size:0.85rem; font-weight:700; color:${color};">${sign}${(tx.value || 0).toLocaleString()} ${currency}</div>
        </div>`;
    }).join('');
}

// ═══ 호환 함수 (다른 코드에서 호출할 수 있음) ═══
async function loadUserWallet() {
    if (typeof useIndependentDB !== 'undefined' && useIndependentDB) {
        await ctvmLoadWallet();
    }
}

function refreshAllBalances() { ctvmRefreshWallet(); }
function copyAddress() { ctvmCopyAddress(); }
function updateBalances() { /* no-op in independent mode */ }
function updateBalancesUI() { /* no-op in independent mode */ }
function selectToken() { /* no-op */ }
function showSendModal() { document.getElementById('send-to')?.focus(); }
function showAddWalletModal() { showToast('CrownyTVM은 계정당 1개 지갑입니다', 'info'); }
function switchWallet() { /* no-op */ }
function displayCurrentWallet() { ctvmLoadWallet(); }
function renameCurrentWallet() { /* no-op */ }
function deleteCurrentWallet() { /* no-op */ }
function showMaticDeposit() { /* no-op */ }
function showMaticSend() { /* no-op */ }
function loadMaticBalance() { /* no-op */ }
function loadRealBalances() { /* no-op */ }
function loadOffchainBalances() { /* no-op */ }
function checkWalletSecurityOnLogin() { /* no-op */ }
async function refreshBalancesFromDB() { await ctvmLoadWallet(); }
