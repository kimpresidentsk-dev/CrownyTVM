// ===== trading.js v5.5 - 차트, 실시간데이터, 거래, 포지션, NinjaTrader =====
// ========== REAL-TIME CRYPTO TRADING ==========
let currentPrice = 0;
let priceWs = null;
let myParticipation = null;

// ========== Server API helper ==========
async function saveTradingState(updates) {
    if (!myParticipation) return;
    Object.assign(myParticipation, updates);
    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    try {
        await fetch('/api/trading/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify(updates)
        });
    } catch(e) { console.warn('Trading save error:', e); }
}

// ========== 트레이딩 시스템 초기화 버튼 ==========
async function reloadTradingSystem() {
    const statusEl = document.getElementById('trading-reload-status');
    const btn = document.getElementById('trading-reload-btn');
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.innerHTML = '<i data-lucide="hourglass" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('trading.initializing','Initializing...');
    
    try {
        // 1) 참가 데이터 재로드
        myParticipation = null;
        if (statusEl) statusEl.innerHTML = '<i data-lucide="hourglass" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('trading.loading_data','Loading participation data...');
        await loadTradingDashboard();
        
        // 2) 가격 피드 재시작
        if (statusEl) statusEl.innerHTML = '<i data-lucide="hourglass" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('trading.connecting_feed','Connecting price feed...');
        if (typeof connectPriceWebSocket === 'function') {
            connectPriceWebSocket();
        }
        
        // 3) 차트 재초기화
        if (statusEl) statusEl.innerHTML = '<i data-lucide="hourglass" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('trading.init_chart','Initializing chart...');
        try {
            if (typeof initTradingViewChart === 'function') {
                initTradingViewChart();
            }
        } catch(chartErr) { console.warn('차트 초기화 경고:', chartErr); }
        
        // 버튼 상태 업데이트
        if (typeof updateTradeButtonState === 'function') updateTradeButtonState();
        
        // 가격 수신 대기 (최대 5초)
        if (myParticipation && currentPrice < 1000) {
            if (statusEl) statusEl.innerHTML = '<i data-lucide="hourglass" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('trading.waiting_price','Waiting for price...');
            await new Promise(r => {
                let waited = 0;
                const iv = setInterval(() => {
                    waited += 500;
                    if (currentPrice > 1000 || waited >= 5000) { clearInterval(iv); r(); }
                }, 500);
            });
        }
        
        const ok = !!myParticipation && currentPrice > 1000;
        if (statusEl) statusEl.innerHTML = ok 
            ? `<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.complete','Ready!')} ${myParticipation?.participantId?.slice(0,8)}… $${currentPrice.toFixed(2)}`
            : `<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${!myParticipation ? t('trading.no_participation','No participation — join a challenge') : t('trading.waiting_connection','Waiting for price (connecting soon)')}`;
        if (statusEl) statusEl.style.color = ok ? '#5B7B8C' : '#C4841D';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        console.error('<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> reloadTradingSystem:', e);
        if (statusEl) statusEl.innerHTML = '<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('trading.error_prefix','Error: ') + e.message;
        if (statusEl) statusEl.style.color = '#B54534';
    }
    
    if (btn) btn.disabled = false;
}

// ========== 거래 권한 시스템 (tradingTier) ==========
// Firestore participant 필드:
//   tradingTier: { MNQ: 3, NQ: 0 }  ← 상품별 최대 계약 수 (0=불허)
//   하위호환: allowedProduct('MNQ'|'NQ'|'BOTH') + maxContracts(7)

function getTradingTier() {
    if (!myParticipation) return { MNQ: 1, NQ: 0 };
    
    // 새 방식: tradingTier 객체
    if (myParticipation.tradingTier) {
        return {
            MNQ: myParticipation.tradingTier.MNQ ?? 0,
            NQ: myParticipation.tradingTier.NQ ?? 0,
        };
    }
    
    // 하위호환: 기존 allowedProduct + maxContracts
    const allowed = myParticipation.allowedProduct || 'BOTH';
    const max = myParticipation.maxContracts || 1;
    
    if (allowed === 'MNQ') return { MNQ: max, NQ: 0 };
    if (allowed === 'NQ') return { MNQ: 0, NQ: max };
    return { MNQ: max, NQ: max }; // BOTH
}

function getMaxContracts(contract) {
    const tier = getTradingTier();
    return tier[contract] || 0;
}

function isProductAllowed(contract) {
    return getMaxContracts(contract) > 0;
}

// ========== 카피트레이딩 시스템 ==========
function getCopyAccounts() {
    if (!myParticipation) return 1;
    return myParticipation.copyAccounts || 1;
}

// 실효 계약수 (입력 × 카피계정)
function getEffectiveContracts(inputContracts) {
    return inputContracts * getCopyAccounts();
}

// 예상 수수료 계산
function getEstimatedFee(contracts) {
    const copyAccounts = getCopyAccounts();
    return RISK_CONFIG.tradeFeeRoundTrip * contracts * copyAccounts;
}

// 폼 UI에 권한 반영
function applyTradingPermissions() {
    const tier = getTradingTier();
    const dropdown = document.getElementById('futures-contract');
    const contractInput = document.getElementById('trade-contracts');
    const maxLabel = document.getElementById('contract-max-label');
    const badge = document.getElementById('trading-permission-badge');
    
    if (!dropdown) return;
    
    // 드롭다운 옵션 활성/비활성
    for (const opt of dropdown.options) {
        const max = tier[opt.value] || 0;
        opt.disabled = max === 0;
        opt.textContent = max > 0
            ? `${opt.value} (${t('trading.max','Max')} ${max} ${t('trading.contracts_unit','contracts')})`
            : `${opt.value} (${t('trading.not_allowed','Not Allowed')})`;
    }
    
    // 허용된 상품이 선택 안되어 있으면 자동 전환
    const currentVal = dropdown.value;
    if (!isProductAllowed(currentVal)) {
        if (tier.MNQ > 0) dropdown.value = 'MNQ';
        else if (tier.NQ > 0) dropdown.value = 'NQ';
    }
    
    // 계약 수 드롭다운 동적 생성
    const selected = dropdown.value;
    const max = getMaxContracts(selected);
    if (contractInput) {
        const currentVal = parseInt(contractInput.value) || 1;
        contractInput.innerHTML = '';
        for (let i = 1; i <= max; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = i;
            if (i === Math.min(currentVal, max)) opt.selected = true;
            contractInput.appendChild(opt);
        }
        if (max === 0) {
            contractInput.innerHTML = `<option value="0" disabled>${t('trading.unavailable','N/A')}</option>`;
        }
    }
    if (maxLabel) maxLabel.textContent = `(${t('trading.max','Max')} ${max})`;
    
    // 권한 배지 표시
    if (badge) {
        const mnqText = tier.MNQ > 0 ? `MNQ ×${tier.MNQ}` : 'MNQ <i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>';
        const nqText = tier.NQ > 0 ? `NQ ×${tier.NQ}` : 'NQ <i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>';
        const mnqColor = tier.MNQ > 0 ? '#00cc00' : '#6B5744';
        const nqColor = tier.NQ > 0 ? '#00cc00' : '#6B5744';
        const copyAccounts = getCopyAccounts();
        const copyBadge = copyAccounts > 1 ? `<span style="margin-left:8px; color:#C4841D; font-weight:600;"><i data-lucide="clipboard" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.copy','Copy')}: ${copyAccounts} ${t('trading.accounts','accounts')}</span>` : '';
        badge.style.display = 'block';
        badge.innerHTML = `
            ${t('trading.permission_label','Trading Permission:')}
            <span style="color:${mnqColor}; font-weight:600;">${mnqText}</span> · 
            <span style="color:${nqColor}; font-weight:600;">${nqText}</span>
            ${copyBadge}
            <span style="margin-left:8px; color:#6B5744;">| <i data-lucide="circle-dollar-sign" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> CRTD: ${(userWallet?.offchainBalances?.crtd || 0).toLocaleString()}</span>
        `;
    }
    
    // 수수료 & 카피 정보 업데이트
    updateFeeDisplay();
}

// ========== CRTD 프랍 트레이딩 시스템 ==========
// 참가비 CRTD → 가상 USD 계좌 → 프랍 스타일 정산
// -$liquidation 도달 → 청산 (참가비 소멸)
// +$profitThreshold 이상 → 초과분 1:1 CRTD 변환
// withdrawUnit CRTD 단위 인출 가능

// 챌린지 티어 (관리자가 설정, DB에서 로드)
const DEFAULT_TIERS = {
    A: { deposit: 100, account: 100000, liquidation: 3000, profitThreshold: 1000, withdrawUnit: 1000, label: t('trading.tier_a','🅰️ Basic') },
    B: { deposit: 200, account: 150000, liquidation: 5000, profitThreshold: 1500, withdrawUnit: 1000, label: t('trading.tier_b','🅱️ Intermediate') },
    C: { deposit: 500, account: 300000, liquidation: 10000, profitThreshold: 3000, withdrawUnit: 1000, label: t('trading.tier_c','🅲 Pro') },
};

function getCRTDConfig() {
    if (!myParticipation) return { 
        deposit: 100, account: 100000, liquidation: 3000, 
        profitThreshold: 1000, withdrawUnit: 1000, tier: 'A',
        withdrawn: 0, totalPnL: 0
    };
    
    return {
        tier: myParticipation.tier || 'A',
        deposit: myParticipation.crtdDeposit || 100,
        account: myParticipation.initialBalance || 100000,
        liquidation: myParticipation.liquidation || 3000,
        profitThreshold: myParticipation.profitThreshold || 1000,
        withdrawUnit: myParticipation.withdrawUnit || 1000,
        withdrawn: myParticipation.crtdWithdrawn || 0,
        totalPnL: (myParticipation.currentBalance || 100000) - (myParticipation.initialBalance || 100000)
    };
}

// 인출 가능한 CRTD 계산
function getWithdrawableCRTD() {
    const cfg = getCRTDConfig();
    if (cfg.totalPnL <= cfg.profitThreshold) return 0;
    
    // 초과분 1:1 → 이미 인출한 만큼 차감
    const excessProfit = cfg.totalPnL - cfg.profitThreshold;
    const availableRaw = Math.floor(excessProfit) - cfg.withdrawn;
    
    // withdrawUnit 단위로 절삭
    return Math.floor(availableRaw / cfg.withdrawUnit) * cfg.withdrawUnit;
}

// CRTD 인출
async function withdrawCRTD() {
    if (!myParticipation) return;
    
    const available = getWithdrawableCRTD();
    const cfg = getCRTDConfig();
    
    if (available < cfg.withdrawUnit) {
        const needed = cfg.profitThreshold + cfg.withdrawn + cfg.withdrawUnit;
        const currentPnL = cfg.totalPnL;
        showToast(`<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.withdraw_not_met','Withdrawal conditions not met')} — ${t('trading.withdrawable','Withdrawable')}: ${available} CRTD, ${t('trading.required_profit','Required profit')}: $${needed.toFixed(0)}`, 'warning');
        return;
    }
    
    // 인출할 단위 선택
    const maxUnits = Math.floor(available / cfg.withdrawUnit);
    const unitsStr = await showPromptModal(t('trading.crtd_withdraw','<i data-lucide="gem" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> CRTD Withdrawal'), `Withdrawable: ${available} CRTD\nUnit: ${cfg.withdrawUnit} CRTD\nMax ${maxUnits} withdrawals\n\nHow many units? (1~${maxUnits})`, '1');
    const units = parseInt(unitsStr);
    
    if (!units || units < 1 || units > maxUnits) return;
    
    const withdrawAmount = units * cfg.withdrawUnit;
    
    if (!await showConfirmModal(t('trading.crtd_withdraw','<i data-lucide="gem" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> CRTD Withdrawal'), `${withdrawAmount} CRTD ${t('trading.withdraw_confirm','will be withdrawn.\nDeposited to offchain CRTD.\nProceed?')}`)) return;
    
    try {
        // 오프체인 CRTD 적립
        await earnOffchainPoints('crtd', withdrawAmount, `Trading profit withdrawal: $${cfg.totalPnL.toFixed(0)} based`);
        
        // Server API 업데이트
        myParticipation.crtdWithdrawn = (cfg.withdrawn + withdrawAmount);
        await saveTradingState({ crtdWithdrawn: myParticipation.crtdWithdrawn });

        // Transaction logging handled server-side
        // CRTD withdraw logged server-side
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${withdrawAmount} CRTD ${t('trading.withdraw_done','Withdrawal complete!')}`, 'success');
        updateCRTDDisplay();
        loadUserWallet();
    } catch (e) {
        showToast(t('trading.withdraw_fail','Withdrawal failed: ') + e.message, 'error');
    }
}

// 청산 체크 (모든 포지션 청산 후 호출)
async function checkCRTDLiquidation() {
    if (!myParticipation) return;
    
    const cfg = getCRTDConfig();
    
    // 총 손실이 청산 기준 이상
    if (cfg.totalPnL <= -cfg.liquidation) {
        await showConfirmModal('<i data-lucide="alert" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('trading.crtd_liquidation','CRTD Liquidation'), `${t('trading.total_loss','Total Loss')}: $${Math.abs(cfg.totalPnL).toFixed(0)}\n${t('trading.liquidation_threshold','Liquidation Threshold')}: -$${cfg.liquidation}\n\n${t('trading.entry_fee_forfeit','Entry Fee')} ${cfg.deposit} ${t('trading.crtd_forfeit','CRTD will be forfeited.')} \n${t('trading.force_liquidation','All positions will be force-closed.')}`);
        
        // 모든 오픈 포지션 청산
        const trades = myParticipation.trades || [];
        for (let i = 0; i < trades.length; i++) {
            if (trades[i].status === 'open') {
                await autoClosePosition(i, 'CRTD Liquidation (-$' + cfg.liquidation + ')');
            }
        }
        
        // 참가자 상태 → liquidated
        myParticipation.status = 'liquidated';
        try {
            await saveTradingState({
                status: 'liquidated',
                liquidatedAt: new Date(),
                finalPnL: cfg.totalPnL,
                crtdLost: cfg.deposit
            });
        } catch (e) { console.error('청산 상태 저장 실패:', e); }
        
        updateCRTDDisplay();
    }
}

function updateCRTDDisplay() {
    const cfg = getCRTDConfig();
    const el = document.getElementById('crtd-balance-display');
    if (!el) return;
    
    // CRTD balance is tracked in trading participation, skip Firebase user doc
    if (currentUser && (!userWallet?.offchainBalances || userWallet.offchainBalances.crtd === undefined)) {
        if (!userWallet) userWallet = {};
        userWallet.offchainBalances = userWallet.offchainBalances || { crtd: 0, crac: 0, crgc: 0, creb: 0 };
    }
    
    const pnl = cfg.totalPnL;
    const withdrawable = getWithdrawableCRTD();
    const totalWithdrawn = cfg.withdrawn;
    
    // 생명력 게이지: 0(-liquidation) ~ 100%(0)
    const lifeRaw = Math.max(0, 1 + pnl / cfg.liquidation);
    const lifePct = Math.min(100, Math.round(lifeRaw * 100));
    const lifeColor = lifePct > 60 ? '#00cc00' : lifePct > 30 ? '#ffaa00' : '#B54534';
    
    // 수익 게이지: 0(threshold) ~ 100%(threshold + max)
    const profitAboveThreshold = Math.max(0, pnl - cfg.profitThreshold);
    const profitPct = pnl > 0 ? Math.min(100, Math.round((pnl / cfg.profitThreshold) * 100)) : 0;
    const profitColor = pnl >= cfg.profitThreshold ? '#00cc00' : pnl > 0 ? '#4488ff' : '#6B5744';
    
    const pnlSign = pnl >= 0 ? '+' : '';
    const pnlColor = pnl >= 0 ? '#00cc00' : '#B54534';
    
    el.innerHTML = `
        <div style="margin-bottom:0.6rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
                <span><i data-lucide="gem" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.tier_label','Tier')} ${cfg.tier} · ${cfg.deposit} CRTD</span>
                <strong style="color:${pnlColor}; font-size:1.05rem;">${pnlSign}$${pnl.toFixed(0)}</strong>
            </div>
            <div style="font-size:0.7rem; color:#6B5744; margin-bottom:0.3rem;"><i data-lucide="circle-dollar-sign" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> CRTD ${t('trading.crtd_balance','Balance')}: <strong style="color:#C4841D;">${(userWallet?.offchainBalances?.crtd || 0).toLocaleString()} pt</strong></div>
        </div>
        
        <!-- 생존 게이지 -->
        <div style="margin-bottom:0.5rem;">
            <div style="display:flex; justify-content:space-between; font-size:0.7rem; margin-bottom:0.15rem;">
                <span><i data-lucide="shield" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.survival','Survival')}</span>
                <span style="color:${lifeColor};">-$${cfg.liquidation} ${t('trading.until','until')} $${(cfg.liquidation + pnl).toFixed(0)} ${t('trading.remaining','left')}</span>
            </div>
            <div style="background:rgba(255,255,255,0.1); height:5px; border-radius:3px;">
                <div style="background:${lifeColor}; height:100%; border-radius:3px; width:${lifePct}%; transition:width 0.5s;"></div>
            </div>
        </div>
        
        <!-- 수익 게이지 -->
        <div style="margin-bottom:0.5rem;">
            <div style="display:flex; justify-content:space-between; font-size:0.7rem; margin-bottom:0.15rem;">
                <span><i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.profit_to_crtd','Profit → CRTD')}</span>
                <span style="color:${profitColor};">${pnl >= cfg.profitThreshold ? `<i data-lucide="circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.convert_zone','Convert Zone')} (+$${profitAboveThreshold.toFixed(0)} = ${Math.floor(profitAboveThreshold)} CRTD)` : `+$${cfg.profitThreshold} ${t('trading.activate_at','to activate')}`}</span>
            </div>
            <div style="background:rgba(255,255,255,0.1); height:5px; border-radius:3px;">
                <div style="background:${profitColor}; height:100%; border-radius:3px; width:${profitPct}%; transition:width 0.5s;"></div>
            </div>
        </div>
        
        <!-- 인출 정보 -->
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.72rem; padding-top:0.3rem; border-top:1px solid rgba(255,255,255,0.1);">
            <span><i data-lucide="wallet" style="width:16px;height:16px;margin-right:6px;"></i>${t('trading.withdrawable','Withdrawable')}: <strong style="color:${withdrawable > 0 ? '#5B7B8C' : '#6B5744'};">${withdrawable} CRTD</strong> (${cfg.withdrawUnit} ${t('trading.unit','unit')})</span>
            <span>${t('trading.withdrawn','Withdrawn')}: ${totalWithdrawn}</span>
        </div>
        ${withdrawable >= cfg.withdrawUnit ? `
        <button onclick="withdrawCRTD()" style="width:100%; margin-top:0.4rem; padding:0.5rem; background:#8B6914; color:#FFF8F0; border:none; border-radius:6px; cursor:pointer; font-weight:700; font-size:0.85rem;">
            <i data-lucide="gem" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${withdrawable} CRTD ${t('trading.withdraw_btn','Withdraw')}
        </button>` : ''}
    `;
    if (window.lucide) lucide.createIcons();
}

async function loadTradingDashboard() {
    if (!currentUser) return;
    // 챌린지 목록 로드
    if (typeof loadPropTrading === 'function') loadPropTrading();
    // Check if user has active participation via server API
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        if (!token) return;
        const res = await fetch('/api/trading/participation', { headers: { 'Authorization': 'Bearer ' + token } });
        const data = await res.json();
        const p = data?.participation;
        if (p && p.status === 'active') {
            myParticipation = p;
        }
    } catch (error) {
        _d('ERROR: API 실패 - ' + error.message);
        console.error('loadTradingDashboard error:', error);
    }
    
    document.getElementById('trading-dashboard').style.display = 'block';
    try {
        if (myParticipation) {
            const p = myParticipation;
            const tier = getTradingTier();
            const productParts = [];
            if (tier.MNQ > 0) productParts.push(`MNQ ×${tier.MNQ}`);
            if (tier.NQ > 0) productParts.push(`NQ ×${tier.NQ}`);
            const productText = productParts.length > 0 ? productParts.join(' + ') : t('trading.not_set','Not set');
            const rulesEl = document.getElementById('prop-rules-display');
            const cfg = getCRTDConfig();
            if (rulesEl) {
                rulesEl.innerHTML = `
                    <p><strong><i data-lucide="gem" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.tier_label','Tier')} ${cfg.tier}:</strong> ${cfg.deposit} CRTD ${t('trading.entry_fee','Entry Fee')}</p>
                    <p><strong><i data-lucide="dollar-sign" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.virtual_account','Virtual Account')}:</strong> $${(p.initialBalance || 100000).toLocaleString()} USD</p>
                    <p><strong><i data-lucide="bar-chart-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.tradable','Tradable')}:</strong> ${productText}</p>
                    <p><strong><i data-lucide="circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.daily_limit','Daily Limit')}:</strong> -$${p.dailyLossLimit || 500} ${t('trading.daily_limit_desc','suspended on loss')}</p>
                    <p><strong><i data-lucide="skull" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.liquidation','Liquidation')}:</strong> -$${cfg.liquidation.toLocaleString()} ${t('trading.liquidation_desc','account closed on loss')} (${cfg.deposit} CRTD ${t('trading.forfeited','forfeited')})</p>
                    <p><strong><i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.profit_convert','Profit Convert')}:</strong> +$${cfg.profitThreshold.toLocaleString()} ${t('trading.profit_convert_desc','excess → 1:1 CRTD')}</p>
                    <p><strong><i data-lucide="dollar-sign" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.withdraw_btn','Withdraw')}:</strong> ${cfg.withdrawUnit.toLocaleString()} CRTD ${t('trading.unit','unit')}</p>
                    <p style="margin-top:0.5rem; padding:0.5rem; background:rgba(255,165,0,0.1); border-radius:6px; border-left:3px solid #C4841D; font-size:0.82rem; color:#C4841D;"><i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.sltp_browser_warning','SL/TP auto-close only works when browser is open. Positions remain but auto-close won\'t execute if closed.')}</p>
                `;
            }
            try { checkDailyReset(); } catch(e) { console.warn('checkDailyReset:', e); }
            // updateSlotStatusUI removed (deprecated CRNY slot system)
            try { updateRiskGaugeUI(); } catch(e) { console.warn('updateRiskGaugeUI:', e); }
            try { updateTradingUI(); } catch(e) { console.warn('updateTradingUI:', e); }
            try { applyTradingPermissions(); } catch(e) { console.warn('applyTradingPermissions:', e); }
            try { updateCRTDDisplay(); } catch(e) { console.warn('updateCRTDDisplay:', e); }
            if (!myParticipation.dailyLocked) {
                ['btn-buy','btn-sell','btn-chart-buy','btn-chart-sell'].forEach(id => {
                    const btn = document.getElementById(id);
                    if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; btn.style.pointerEvents = 'auto'; }
                });
            }
            updateChartRulesOverlay();
        } else {
            const rulesEl = document.getElementById('prop-rules-display');
            if (rulesEl) {
                rulesEl.innerHTML = `<p>${t('trading.join_to_see_rules','Join a challenge below to see rules.')}</p>`;
            }
        }
    } catch (uiErr) {
        console.warn('Trading UI setup error (ignored):', uiErr);
    }

    // 차트 & 가격 피드는 참가 여부와 관계없이 항상 초기화
    // 차트 & 가격 피드는 참가 여부와 관계없이 항상 초기화
    const startChartInit = () => {
        const container = document.getElementById('live-candle-chart');
        if (!container) return;
        // 모바일에서 컨테이너 크기가 아직 0이면 강제 설정
        if (container.clientWidth < 10) {
            container.style.width = (window.innerWidth - 16) + 'px';
        }
        _initChartAndFeed();
    };
    // 최초 시도 (300ms 대기)
    setTimeout(() => {
        startChartInit();
        // 차트가 생성 안 됐으면 재시도 (1초, 2초, 3초)
        [1000, 2000, 3000].forEach(delay => {
            setTimeout(() => {
                if (!window.liveChart) startChartInit();
            }, delay);
        });
    }, 300);
}

function _initChartAndFeed() {
    // 컨테이너 크기 강제 확보 (모바일)
    const container = document.getElementById('live-candle-chart');
    if (container && container.clientWidth < 10) {
        container.style.width = (window.innerWidth - 16) + 'px';
    }
    if (!window.liveChart) initTradingViewChart();
    if (!window.nqPriceInterval) connectPriceWebSocket();
    // 차트 크기 보정
    setTimeout(() => {
        if (window.liveChart && container && container.clientWidth > 0) {
            window.liveChart.applyOptions({ width: container.clientWidth });
            window.liveChart.timeScale().fitContent();
        }
    }, 500);
}

function updateTradingUI() {
    if (!myParticipation) return;
    
    const cashBalance = myParticipation.currentBalance || 100000;
    const initial = myParticipation.initialBalance || 100000;
    const openTrades = (myParticipation.trades || []).filter(t => t.status === 'open');
    
    // 미실현 PnL + 잠긴 증거금 합산 → 총 자산(equity)
    let unrealizedPnL = 0;
    let lockedMargin = 0;
    for (const trade of openTrades) {
        const multiplier = trade.contract === 'NQ' ? 20 : 2;
        const effContracts = trade.effectiveContracts || (trade.contracts * (trade.copyAccounts || 1));
        const pnl = trade.side === 'BUY'
            ? (currentPrice - trade.entryPrice) * multiplier * effContracts
            : (trade.entryPrice - currentPrice) * multiplier * effContracts;
        unrealizedPnL += pnl;
        lockedMargin += (trade.margin || 0);
    }
    
    const equity = cashBalance + lockedMargin + unrealizedPnL;
    const profit = ((equity - initial) / initial * 100).toFixed(2);
    
    document.getElementById('trading-balance').textContent = `$${equity.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('trading-profit').textContent = `${profit >= 0 ? '+' : ''}${profit}%`;
    document.getElementById('trading-profit').style.color = profit >= 0 ? '#3D2B1F' : '#B54534';
    document.getElementById('trading-positions').textContent = openTrades.length;
}

// ========================================
// 실시간 캔들차트 + 탭 시스템
// ========================================
const PRICE_SERVER = ''; // 로컬 서버 프록시 (Railway/Yahoo 자동 폴백)
const POLL_INTERVAL = 500; // 0.5초

const TIMEZONES = {
    'US': { label: '🇺🇸 New York (ET)', zone: 'America/New_York' },
    'KR': { label: '🇰🇷 Seoul (KST)', zone: 'Asia/Seoul' },
    'JP': { label: '🇯🇵 Tokyo (JST)', zone: 'Asia/Tokyo' },
    'UK': { label: '🇬🇧 London (GMT)', zone: 'Europe/London' },
    'UTC': { label: 'UTC', zone: 'UTC' }
};
let selectedTimezone = 'KR';

window.liveTicks = [];
window.liveChart = null;
window.liveCandleSeries = null;
window.liveEntryLine = null;

// ===== 차트 탭 시스템 =====
let chartTabs = [];
let activeTabId = 1;

function getDefaultTabs() {
    return [
        { id: 1, symbol: 'MNQ', chartType: 'time', interval: 60, tickCount: 100 },
        { id: 2, symbol: 'NQ', chartType: 'time', interval: 60, tickCount: 100 },
        { id: 3, symbol: 'MNQ', chartType: 'tick', interval: 60, tickCount: 100 },
    ];
}
function loadChartTabs() {
    try {
        const saved = localStorage.getItem('crowny_chart_tabs');
        chartTabs = saved ? JSON.parse(saved) : getDefaultTabs();
        if (!chartTabs.length) chartTabs = getDefaultTabs();
        activeTabId = parseInt(localStorage.getItem('crowny_active_tab')) || chartTabs[0]?.id || 1;
        if (!chartTabs.find(t => t.id === activeTabId)) activeTabId = chartTabs[0]?.id || 1;
    } catch (e) { chartTabs = getDefaultTabs(); activeTabId = 1; }
}
function saveChartTabs() {
    try {
        localStorage.setItem('crowny_chart_tabs', JSON.stringify(chartTabs));
        localStorage.setItem('crowny_active_tab', String(activeTabId));
    } catch (e) { /* optional */ }
}
function getActiveTab() { return chartTabs.find(t => t.id === activeTabId) || chartTabs[0]; }
function getActiveTabSymbol() { return (getActiveTab() || {}).symbol || 'MNQ'; }
function getCurrentInterval() { const t = getActiveTab(); return t?.chartType === 'time' ? (t.interval || 60) : 60; }

function renderChartTabs() {
    const bar = document.getElementById('chart-tab-bar');
    if (!bar) return;
    bar.innerHTML = '';
    chartTabs.forEach(tab => {
        const active = tab.id === activeTabId;
        const btn = document.createElement('button');
        btn.style.cssText = `background:${active?'#3D2B1F':'#E8E0D8'}; color:${active?'#FFF8F0':'#6B5744'}; border:1px solid ${active?'#3D2B1F':'#E8E0D8'}; border-radius:4px; padding:5px 10px; font-size:0.72rem; cursor:pointer; white-space:nowrap; font-weight:${active?'700':'400'};`;
        const icon = tab.chartType === 'tick' ? '<i data-lucide="bar-chart-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>' : '<i data-lucide="clock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>';
        const label = tab.chartType === 'tick' ? `${tab.tickCount}T` : `${(tab.interval||60)/60}m`;
        btn.innerHTML = `${tab.symbol} ${icon}${label}${chartTabs.length > 1 ? ` <span class="tab-close" style="margin-left:4px;color:${active?'#ffaaaa':'#6B5744'};font-size:0.65rem;cursor:pointer;"><i data-lucide="x" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></span>` : ''}`;
        btn.onclick = (e) => { if (e.target.classList.contains('tab-close')) return; switchChartTab(tab.id); };
        const closeBtn = btn.querySelector('.tab-close');
        if (closeBtn) closeBtn.onclick = async (e) => { e.stopPropagation(); if (await showConfirmModal(t('trading.delete_tab','Delete Tab'), `"${tab.symbol} ${label}" Delete?`)) removeChartTab(tab.id); };
        bar.appendChild(btn);
    });
    const addBtn = document.createElement('button');
    addBtn.style.cssText = 'background:#E8E0D8; color:#3D2B1F; border:1px solid #E8E0D8; border-radius:4px; padding:5px 8px; font-size:0.8rem; cursor:pointer;';
    addBtn.textContent = '+';
    addBtn.onclick = addChartTab;
    bar.appendChild(addBtn);
}

function switchChartTab(tabId) {
    activeTabId = tabId;
    const tab = getActiveTab();
    if (!tab) return;
    const symEl = document.getElementById('tab-symbol');
    const typeEl = document.getElementById('tab-chart-type');
    const intEl = document.getElementById('tab-interval');
    const tickEl = document.getElementById('tab-tick-count');
    if (symEl) symEl.value = tab.symbol;
    if (typeEl) typeEl.value = tab.chartType;
    if (intEl) { intEl.value = tab.interval || 60; intEl.style.display = tab.chartType==='time' ? '' : 'none'; }
    if (tickEl) { tickEl.value = tab.tickCount || 100; tickEl.style.display = tab.chartType==='tick' ? '' : 'none'; }
    // 하단 거래폼 동기화
    const fc = document.getElementById('futures-contract');
    if (fc) { fc.value = tab.symbol; if (typeof updateContractSpecs === 'function') updateContractSpecs(); }
    updateChartLabel();
    renderChartTabs();
    saveChartTabs();
    reloadChartData();
    drawPositionLinesLW();
}

function addChartTab() {
    if (chartTabs.length >= 8) { showToast(t('trading.max_tabs','Maximum 8 tabs allowed'), 'warning'); return; }
    const maxId = chartTabs.reduce((m, t) => Math.max(m, t.id), 0);
    const newTab = { id: maxId+1, symbol: 'MNQ', chartType: 'time', interval: 60, tickCount: 100 };
    chartTabs.push(newTab);
    switchChartTab(newTab.id);
}

function removeChartTab(tabId) {
    chartTabs = chartTabs.filter(t => t.id !== tabId);
    if (activeTabId === tabId) activeTabId = chartTabs[0]?.id || 1;
    renderChartTabs();
    switchChartTab(activeTabId);
}

function updateTabSetting(field) {
    const tab = getActiveTab();
    if (!tab) return;
    switch(field) {
        case 'symbol':
            tab.symbol = document.getElementById('tab-symbol').value;
            // 하단 거래폼도 동기화
            const fc = document.getElementById('futures-contract');
            if (fc) { fc.value = tab.symbol; if (typeof updateContractSpecs === 'function') updateContractSpecs(); }
            break;
        case 'chartType':
            tab.chartType = document.getElementById('tab-chart-type').value;
            document.getElementById('tab-interval').style.display = tab.chartType==='time' ? '' : 'none';
            document.getElementById('tab-tick-count').style.display = tab.chartType==='tick' ? '' : 'none';
            break;
        case 'interval': tab.interval = parseInt(document.getElementById('tab-interval').value)||60; break;
        case 'tickCount': tab.tickCount = parseInt(document.getElementById('tab-tick-count').value)||100; break;
    }
    updateChartLabel(); renderChartTabs(); saveChartTabs();
    if (field === 'symbol' || field === 'chartType') {
        reloadChartData();
    } else {
        updateLiveCandleChart();
    }
}

function updateChartLabel() {
    const tab = getActiveTab();
    if (!tab) return;
    const label = document.getElementById('chart-symbol-label');
    const mul = tab.symbol==='NQ' ? '$20' : '$2';
    if (label) {
        if (tab.chartType === 'time') {
            label.textContent = `${tab.symbol} ${(tab.interval||60)/60}m (×${mul})`;
        } else {
            label.textContent = `${tab.symbol} ${tab.tickCount||100}T (×${mul})`;
        }
    }
}

// 틱 기반 캔들 (N틱마다 1봉, 거래량 포함)
function aggregateTicksToTickCandles(ticks, ticksPerCandle) {
    if (!ticks.length || ticksPerCandle < 1) return [];
    const candles = [];
    let cur = null, cnt = 0;
    for (const tick of ticks) {
        if (!cur || cnt >= ticksPerCandle) {
            if (cur) candles.push(cur);
            cur = { time: tick.time, open: tick.price, high: tick.price, low: tick.price, close: tick.price, _tickCount: 1, _volume: tick.volume || 1 };
            cnt = 1;
        } else {
            cur.high = Math.max(cur.high, tick.price);
            cur.low = Math.min(cur.low, tick.price);
            cur.close = tick.price;
            cur._tickCount++; cur._volume = (cur._volume||0) + (tick.volume||1); cur.time = tick.time; cnt++;
        }
    }
    if (cur) candles.push(cur);
    for (let i = 1; i < candles.length; i++) {
        if (candles[i].time <= candles[i-1].time) candles[i].time = candles[i-1].time + 1;
    }
    return candles;
}

async function initTradingViewChart() {
    const container = document.getElementById('live-candle-chart');
    if (!container) { console.error('차트 컨테이너 없음'); return; }

    // LightweightCharts CDN이 아직 로드되지 않았으면 대기
    if (typeof LightweightCharts === 'undefined') {
        console.warn('LightweightCharts not loaded yet, retrying in 1s...');
        setTimeout(() => initTradingViewChart(), 1000);
        return;
    }
    
    // 탭 시스템 초기화
    loadChartTabs();
    renderChartTabs();
    // UI 동기화
    const tab = getActiveTab();
    if (tab) {
        const symEl = document.getElementById('tab-symbol');
        const typeEl = document.getElementById('tab-chart-type');
        const intEl = document.getElementById('tab-interval');
        const tickEl = document.getElementById('tab-tick-count');
        if (symEl) symEl.value = tab.symbol;
        if (typeEl) typeEl.value = tab.chartType;
        if (intEl) { intEl.value = tab.interval||60; intEl.style.display = tab.chartType==='time'?'':'none'; }
        if (tickEl) { tickEl.value = tab.tickCount||100; tickEl.style.display = tab.chartType==='tick'?'':'none'; }
        // ★ 하단 거래폼도 탭과 동기화
        const fc = document.getElementById('futures-contract');
        if (fc) fc.value = tab.symbol;
        updateChartLabel();
    }
    
    const chartHeight = window.innerWidth < 768 ? Math.min(window.innerHeight * 0.5, 400) : 500;
    const chartWidth = container.clientWidth > 10 ? container.clientWidth : (window.innerWidth - 20);
    container.innerHTML = '';
    container.style.minHeight = chartHeight + 'px';
    container.style.background = '#FFF8F0';

    try {
        const tzOffset = getTimezoneOffsetSeconds(selectedTimezone);

        const chart = LightweightCharts.createChart(container, {
            width: chartWidth,
            height: chartHeight,
            layout: { background: { color: '#FFF8F0' }, textColor: '#3D2B1F', fontFamily: "'Consolas','Monaco',monospace", fontSize: window.innerWidth < 768 ? 9 : 11 },
            grid: { vertLines: { color: '#E8E0D8', style: 1 }, horzLines: { color: '#E8E0D8', style: 1 } },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
                vertLine: { color: '#FFF8F044', width: 1, style: 2, labelBackgroundColor: '#3D2B1F' },
                horzLine: { color: '#FFF8F044', width: 1, style: 2, labelBackgroundColor: '#3D2B1F' },
            },
            rightPriceScale: { borderColor: '#3D2B1F', scaleMargins: { top: 0.05, bottom: 0.15 }, autoScale: true },
            timeScale: {
                borderColor: '#3D2B1F', timeVisible: true, secondsVisible: false,
                barSpacing: 6, minBarSpacing: 3, rightOffset: 5,
                tickMarkFormatter: (time) => {
                    const d = new Date((time + tzOffset) * 1000);
                    return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
                },
            },
            localization: {
                timeFormatter: (time) => {
                    const d = new Date((time + tzOffset) * 1000);
                    return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
                },
            },
        });
        
        const volumeSeries = chart.addHistogramSeries({
            color: '#26a69a', priceFormat: { type: 'volume' },
            priceScaleId: 'volume', scaleMargins: { top: 0.85, bottom: 0 },
        });
        chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 }, drawTicks: false, borderVisible: false });
        window.volumeSeries = volumeSeries;
        
        const candleSeries = chart.addCandlestickSeries({
            upColor: '#1E88E5', downColor: '#B54534',
            wickUpColor: '#1E88E5', wickDownColor: '#B54534',
            borderUpColor: '#1E88E5', borderDownColor: '#B54534',
        });
        
        window.liveChart = chart;
        window.liveCandleSeries = candleSeries;
        window.candleSeries = candleSeries;
        window.lwChart = chart;
        
        // MA 라인
        window.ma1Series = chart.addLineSeries({ color: '#ffeb3b', lineWidth: 2, lineStyle: 0, priceLineVisible: false, lastValueVisible: false, title: '' });
        window.ma2Series = chart.addLineSeries({ color: '#FFA500', lineWidth: 2, lineStyle: 0, priceLineVisible: false, lastValueVisible: false, title: '' });
        window.ma3Series = chart.addLineSeries({ color: '#FF3333', lineWidth: 2, lineStyle: 0, priceLineVisible: false, lastValueVisible: false, title: '' });
        
        window.addEventListener('resize', () => {
            const w = container.clientWidth > 10 ? container.clientWidth : (window.innerWidth - 20);
            chart.applyOptions({ width: w });
        });
        // ResizeObserver for mobile (handles delayed layout)
        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(() => {
                const w = container.clientWidth;
                if (w > 10) chart.applyOptions({ width: w });
            });
            ro.observe(container);
        }
        loadMASettings();
        setTimeout(() => applyMASettings(), 500);
        startClockTimer();
        startLiveDataFeed();
        
        return chart;
    } catch (error) {
        console.error('차트 로드 실패:', error);
        container.innerHTML = `<p style="text-align:center; padding:2rem; color:#B54534;">Chart error: ${error.message}<br><small>w=${chartWidth}, h=${chartHeight}, LWC=${typeof LightweightCharts}</small></p>`;
    }
}

// 타임존 오프셋 (초 단위)
function getTimezoneOffsetSeconds(tzKey) {
    const tz = TIMEZONES[tzKey]?.zone || 'Asia/Seoul';
    const now = new Date();
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = now.toLocaleString('en-US', { timeZone: tz });
    const diff = (new Date(tzStr) - new Date(utcStr)) / 1000;
    return diff;
}

// 타임존 변경
function changeTimezone(tzKey) {
    selectedTimezone = tzKey;
    // 차트 재생성
    if (window.liveChart) {
        initTradingViewChart();
    }
    updateLiveClockDisplay();
}

// 현재 시간 표시 업데이트
function updateLiveClockDisplay() {
    const clockEl = document.getElementById('live-clock');
    if (!clockEl) return;
    
    const tz = TIMEZONES[selectedTimezone];
    const now = new Date();
    const timeStr = now.toLocaleString('ko-KR', { 
        timeZone: tz.zone,
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });
    const dateStr = now.toLocaleString('ko-KR', {
        timeZone: tz.zone,
        month: '2-digit', day: '2-digit',
        weekday: 'short'
    });
    
    clockEl.innerHTML = `<span style="color:#5B7B8C; font-weight:700;">${timeStr}</span> <span style="color:#6B5744; font-size:0.65rem;">${dateStr} ${tz.label}</span>`;
}

// 차트 자동 정렬 (최신 캔들로 스크롤)
function scrollToLatest() {
    if (window.liveChart) window.liveChart.timeScale().scrollToRealTime();
}

// 시간 타이머 시작
function startClockTimer() {
    if (window.clockInterval) clearInterval(window.clockInterval);
    updateLiveClockDisplay();
    window.clockInterval = setInterval(updateLiveClockDisplay, 1000);
}

// 실시간 데이터 수신 + 틱 보간
// Yahoo는 ~2초마다 갱신 → 서버 폴링 2초 + 클라이언트에서 200ms마다 마이크로틱 생성
let _lastRealPrice = 0;
let _targetPrice = 0;
let _microTickTimer = null;

function startLiveDataFeed() {
    if (window.liveDataInterval) clearInterval(window.liveDataInterval);
    if (_microTickTimer) clearInterval(_microTickTimer);
    reloadChartData().then(() => {
        fetchLiveTick();
        // 서버 폴링: 2초 간격으로 실제 가격 갱신
        window.liveDataInterval = setInterval(fetchLiveTick, 2000);
        // 마이크로틱: 200ms마다 보간 틱 생성 (차트 움직임 유지)
        _microTickTimer = setInterval(generateMicroTick, 500);
    });
}

// Live candle state for micro-tick updates (avoids full setData every 200ms)
let _liveCandle = null;

function generateMicroTick() {
    if (!_lastRealPrice || !window.liveCandleSeries) return;
    const now = Math.floor(Date.now() / 1000);
    const tickSize = 0.25;
    const maxDrift = 1.0;

    const lastTick = window.liveTicks.length > 0 ? window.liveTicks[window.liveTicks.length - 1].price : _lastRealPrice;

    // Spring force toward real price
    const distFromReal = lastTick - _lastRealPrice;
    const pullback = -distFromReal * 0.5;
    const noise = (Math.random() - 0.5) * tickSize + pullback;
    let rawPrice = lastTick + noise;
    rawPrice = Math.max(_lastRealPrice - maxDrift, Math.min(_lastRealPrice + maxDrift, rawPrice));
    const price = Math.round(rawPrice / tickSize) * tickSize;

    window.liveTicks.push({ time: now, price, bid: price - tickSize, ask: price + tickSize, volume: 1 });
    if (window.liveTicks.length > 86400) window.liveTicks.shift();

    currentPrice = price;

    // Update only the current live candle (lightweight, no full setData)
    const candleTime = Math.floor(now / 60) * 60;
    if (!_liveCandle || _liveCandle.time !== candleTime) {
        _liveCandle = { time: candleTime, open: price, high: price, low: price, close: price };
    } else {
        _liveCandle.high = Math.max(_liveCandle.high, price);
        _liveCandle.low = Math.min(_liveCandle.low, price);
        _liveCandle.close = price;
    }
    try { window.liveCandleSeries.update(_liveCandle); } catch(e) { console.warn(e.message); }

    updateNQPriceDisplay();
    updateOpenPositions();
    updateLivePnL();
}

// ★ 심볼 전환 시 데이터 재로드
async function reloadChartData() {
    const tab = getActiveTab();
    if (!tab) return;
    if (tab.chartType === 'tick') {
        await loadTickData(tab.symbol);
    } else {
        await loadCandleHistory(tab.symbol);
    }
}

// 서버에서 1분 캔들 히스토리 로드 (심볼별)
async function loadCandleHistory(symbol) {
    try {
        symbol = symbol || getActiveTabSymbol();
        // console.log(`<i data-lucide="bar-chart-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${symbol} 캔들 히스토리 로딩...`);
        const res = await fetch(`${PRICE_SERVER}/api/market/candles?symbol=${symbol}&limit=1440`);
        const data = await res.json();
        
        if (data && data.candles && data.candles.length > 0) {
            // 너무 오래된 캔들 필터 (1시간 이상 갭이면 오래된 것만 버림)
            const now = Math.floor(Date.now() / 1000);
            let candles = data.candles;
            if (candles.length > 1) {
                const lastTime = candles[candles.length - 1].time;
                const secondLastTime = candles[candles.length - 2].time;
                // 마지막 캔들과 그 전 캔들 사이 갭이 1시간 이상이면 → 오래된 데이터 + 현재가
                if (lastTime - secondLastTime > 3600) {
                    // 현재가 캔들만 사용 (오래된 히스토리 제거)
                    candles = candles.filter(c => now - c.time < 3600);
                    if (candles.length === 0) candles = [data.candles[data.candles.length - 1]];
                }
            }
            // ★ 서버 캔들을 직접 저장 (틱 분해 안 함)
            window._serverCandles = [];
            let prevClose = 0;
            for (const candle of candles) {
                // 에러 데이터 필터: 단일 캔들 범위가 비정상적인 경우만
                if (Math.abs(candle.high - candle.low) > 500) {
                    continue;
                }
                // 큰 갭 (소스 전환)이면 이전 캔들 초기화하고 새 소스부터 시작
                if (prevClose > 0 && Math.abs(candle.open - prevClose) > 500) {
                    window._serverCandles = [];
                }
                window._serverCandles.push({
                    time: candle.time,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                    _volume: candle.volume || candle.tick_count || 1,
                    _tickCount: candle.tick_count || 1,
                });
                prevClose = candle.close;
            }
            // liveTicks도 유지 (틱차트/멘토용) — close 값만
            window.liveTicks = window._serverCandles.map(c => ({
                time: c.time + 59, price: c.close, volume: c._volume || 1,
            }));
            updateLiveCandleChart();
            scrollToLatest();
            // console.log(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${symbol} ${data.count}개 캔들 로드`);
        }
    } catch (err) {
        console.warn('<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 캔들 히스토리 로드 실패:', err.message);
    }
}

// ★ 서버에서 틱 데이터 로드 (틱차트용, 가격+거래량)
async function loadTickData(symbol) {
    try {
        symbol = symbol || getActiveTabSymbol();
        // console.log(`<i data-lucide="bar-chart-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${symbol} 틱 데이터 로딩...`);
        const res = await fetch(`${PRICE_SERVER}/api/market/ticks?symbol=${symbol}&limit=5000`);
        const data = await res.json();
        if (data && data.ticks && data.ticks.length > 0) {
            // 스파이크 필터 적용
            const filtered = [];
            for (const tick of data.ticks) {
                if (filtered.length > 0 && Math.abs(tick.price - filtered[filtered.length - 1].price) > 100) continue;
                filtered.push({ time: tick.time, price: tick.price, volume: tick.volume || 1 });
            }
            window.liveTicks = filtered;
            updateLiveCandleChart();
            scrollToLatest();
            // console.log(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${symbol} ${data.count}개 틱 로드`);
        }
    } catch (err) {
        console.warn('<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 틱 데이터 로드 실패:', err.message);
    }
}

async function fetchLiveTick() {
    try {
        const res = await fetch('/api/market/nq');
        const data = await res.json();

        if (!data || !data.price || data.price < 1000) return;
        
        const now = Math.floor(Date.now() / 1000);
        
        // 클라이언트 스파이크 필터: 소스 전환 시 큰 갭은 허용 (틱 리셋)
        if (window.liveTicks.length > 0) {
            const lastPrice = window.liveTicks[window.liveTicks.length - 1].price;
            const diff = Math.abs(data.price - lastPrice);
            if (diff > 500) {
                // 소스 전환 등으로 큰 갭 → 이전 틱 초기화하고 새 가격 수용
                console.warn(`소스 전환 감지: ${lastPrice} → ${data.price} (diff=${diff.toFixed(2)}), 틱 리셋`);
                window.liveTicks = [];
            }
        }
        
        // NQ/MNQ 개별 가격 저장
        if (data.nq_price) window._nqPrice = data.nq_price;
        if (data.mnq_price) window._mnqPrice = data.mnq_price;

        // 실제 가격으로 보간 앵커 업데이트
        _targetPrice = data.price;
        if (!_lastRealPrice) _lastRealPrice = data.price;
        _lastRealPrice = data.price;

        // 틱 저장 (볼륨 포함)
        window.liveTicks.push({
            time: now,
            price: data.price,
            bid: data.bid,
            ask: data.ask,
            volume: data.volume || 1,
        });

        if (window.liveTicks.length > 86400) window.liveTicks.shift();

        currentPrice = data.price;

        updateLivePriceDisplay(data);
        updateLiveCandleChart();
        updateNQPriceDisplay();
        checkPendingOrders();
        updateOpenPositions();
        updateLivePnL();
        updateLiveStatus(true);
        
    } catch (err) {
        console.error('<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 데이터 수신 실패:', err);
        updateLiveStatus(false);
    }
}

// 가격 표시 업데이트
function updateLivePriceDisplay(data) {
    const priceEl = document.getElementById('live-price');
    const bidEl = document.getElementById('live-bid');
    const askEl = document.getElementById('live-ask');
    const spreadEl = document.getElementById('live-spread');
    
    if (!priceEl) return;
    
    priceEl.textContent = data.price.toFixed(2);
    
    // 가격 색상 (이전 대비)
    if (window.liveTicks.length >= 2) {
        const prev = window.liveTicks[window.liveTicks.length - 2].price;
        priceEl.style.color = data.price > prev ? '#5B7B8C' : data.price < prev ? '#B54534' : '#5B7B8C';
    }
    
    if (bidEl) bidEl.textContent = data.bid ? data.bid.toFixed(2) : '--';
    if (askEl) askEl.textContent = data.ask ? data.ask.toFixed(2) : '--';
    
    if (spreadEl && data.bid && data.ask) {
        spreadEl.textContent = (data.ask - data.bid).toFixed(2);
    }
}

// 탭 설정에 따라 캔들 생성 + 차트 업데이트
function updateLiveCandleChart() {
    if (!window.liveCandleSeries || window.liveTicks.length < 2) return;
    
    const tab = getActiveTab();
    let candles;
    
    if (tab && tab.chartType === 'tick') {
        // 틱차트: N틱마다 1봉
        candles = aggregateTicksToTickCandles(window.liveTicks, tab.tickCount || 100);
    } else {
        const interval = (tab && tab.interval) ? tab.interval : 60;
        // ★ 서버 캔들이 있고 1분봉이면 직접 사용 (틱 분해 왜곡 방지)
        if (window._serverCandles && window._serverCandles.length > 0 && interval === 60) {
            candles = [...window._serverCandles];
            // 실시간 틱으로 마지막 캔들 업데이트
            if (window.liveTicks.length > 0 && candles.length > 0) {
                const lastServerTime = candles[candles.length - 1].time;
                const realtimeTicks = window.liveTicks.filter(t => t.time > lastServerTime + 59);
                if (realtimeTicks.length > 0) {
                    const now = Math.floor(Date.now() / 1000);
                    const currentCandleTime = Math.floor(now / 60) * 60;
                    let liveCandle = candles.find(c => c.time === currentCandleTime);
                    if (!liveCandle) {
                        liveCandle = { time: currentCandleTime, open: realtimeTicks[0].price, high: realtimeTicks[0].price, low: realtimeTicks[0].price, close: realtimeTicks[0].price, _volume: 0, _tickCount: 0 };
                        candles.push(liveCandle);
                    }
                    for (const tick of realtimeTicks) {
                        liveCandle.high = Math.max(liveCandle.high, tick.price);
                        liveCandle.low = Math.min(liveCandle.low, tick.price);
                        liveCandle.close = tick.price;
                        liveCandle._volume += tick.volume || 1;
                        liveCandle._tickCount++;
                    }
                }
            }
        } else if (window._serverCandles && window._serverCandles.length > 0 && interval > 60) {
            // 상위 타임프레임: 서버 캔들을 집계
            candles = [];
            let cur = null;
            for (const sc of window._serverCandles) {
                const ct = Math.floor(sc.time / interval) * interval;
                if (!cur || cur.time !== ct) {
                    if (cur) candles.push(cur);
                    cur = { time: ct, open: sc.open, high: sc.high, low: sc.low, close: sc.close, _volume: sc._volume, _tickCount: sc._tickCount };
                } else {
                    cur.high = Math.max(cur.high, sc.high);
                    cur.low = Math.min(cur.low, sc.low);
                    cur.close = sc.close;
                    cur._volume += sc._volume;
                    cur._tickCount += sc._tickCount;
                }
            }
            if (cur) candles.push(cur);
        } else {
            // 폴백: 틱 기반 집계
            candles = aggregateTicksToCandles(window.liveTicks, interval);
        }
    }
    
    if (candles.length > 0) {
        // ★ 추세 약한 캔들 (도지/팽이) 회색 처리
        for (const c of candles) {
            const body = Math.abs(c.close - c.open);
            const range = c.high - c.low;
            if (range > 0 && body / range < 0.2) {
                // body가 전체 범위의 20% 미만 → 회색 (도지/팽이)
                c.color = '#6B5744';
                c.borderColor = '#6B5744';
                c.wickColor = '#6B5744';
            }
        }
        window.liveCandleSeries.setData(candles);
        
        const volData = candles.map(c => ({
            time: c.time,
            value: c._volume || c._tickCount || 1,
            color: c.close >= c.open ? '#3D2B1F33' : '#B5453433',
        }));
        if (window.volumeSeries) window.volumeSeries.setData(volData);
        
        updateMALines(candles);
    }
}

// MA 계산
function calculateMA(candles, period, type = 'SMA') {
    if (candles.length < period) return [];
    if (type === 'EMA') return calculateEMAFromCandles(candles, period);
    // SMA
    const result = [];
    for (let i = period - 1; i < candles.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += candles[i - j].close;
        }
        result.push({ time: candles[i].time, value: sum / period });
    }
    return result;
}

function calculateEMAFromCandles(candles, period) {
    if (candles.length < period) return [];
    const k = 2 / (period + 1);
    // 첫 EMA = 첫 period의 SMA
    let sum = 0;
    for (let i = 0; i < period; i++) sum += candles[i].close;
    let ema = sum / period;
    const result = [{ time: candles[period - 1].time, value: ema }];
    for (let i = period; i < candles.length; i++) {
        ema = candles[i].close * k + ema * (1 - k);
        result.push({ time: candles[i].time, value: ema });
    }
    return result;
}

// MA 라인 업데이트 (통합 차트)
function updateMALines(candles) {
    const ma1P = parseInt(document.getElementById('nq-ma1-period')?.value) || 5;
    const ma2P = parseInt(document.getElementById('nq-ma2-period')?.value) || 20;
    const ma3P = parseInt(document.getElementById('nq-ma3-period')?.value) || 60;
    const ma1Show = document.getElementById('nq-ma1-show')?.checked !== false;
    const ma2Show = document.getElementById('nq-ma2-show')?.checked !== false;
    const ma3Show = document.getElementById('nq-ma3-show')?.checked !== false;
    
    const ma1Type = document.getElementById('nq-ma1-type')?.value || 'SMA';
    const ma2Type = document.getElementById('nq-ma2-type')?.value || 'SMA';
    const ma3Type = document.getElementById('nq-ma3-type')?.value || 'SMA';
    
    if (window.ma1Series) window.ma1Series.setData(ma1Show ? calculateMA(candles, ma1P, ma1Type) : []);
    if (window.ma2Series) window.ma2Series.setData(ma2Show ? calculateMA(candles, ma2P, ma2Type) : []);
    if (window.ma3Series) window.ma3Series.setData(ma3Show ? calculateMA(candles, ma3P, ma3Type) : []);
}

// MA 정보 표시
function updateMAInfoDisplay() {
    // (no longer needed as separate display)
}

// MA 세팅 토글
function toggleMASettings() {
    const panel = document.getElementById('ma-settings');
    if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// MA 세팅 적용 + localStorage 저장
function applyMASettings() {
    const ma1Color = document.getElementById('nq-ma1-color')?.value || '#ffeb3b';
    const ma2Color = document.getElementById('nq-ma2-color')?.value || '#FFA500';
    const ma3Color = document.getElementById('nq-ma3-color')?.value || '#FF3333';
    const ma1Name = document.getElementById('nq-ma1-name')?.value || 'MA1';
    const ma2Name = document.getElementById('nq-ma2-name')?.value || 'MA2';
    const ma3Name = document.getElementById('nq-ma3-name')?.value || 'MA3';
    const ma1Period = document.getElementById('nq-ma1-period')?.value || '5';
    const ma2Period = document.getElementById('nq-ma2-period')?.value || '20';
    const ma3Period = document.getElementById('nq-ma3-period')?.value || '60';
    const ma1Show = document.getElementById('nq-ma1-show')?.checked !== false;
    const ma2Show = document.getElementById('nq-ma2-show')?.checked !== false;
    const ma3Show = document.getElementById('nq-ma3-show')?.checked !== false;
    const labelShow = document.getElementById('nq-ma-label-show')?.checked !== false;
    
    if (window.ma1Series) window.ma1Series.applyOptions({ color: ma1Color, title: labelShow ? ma1Name : '', lastValueVisible: labelShow });
    if (window.ma2Series) window.ma2Series.applyOptions({ color: ma2Color, title: labelShow ? ma2Name : '', lastValueVisible: labelShow });
    if (window.ma3Series) window.ma3Series.applyOptions({ color: ma3Color, title: labelShow ? ma3Name : '', lastValueVisible: labelShow });
    
    const ma1Type = document.getElementById('nq-ma1-type')?.value || 'SMA';
    const ma2Type = document.getElementById('nq-ma2-type')?.value || 'SMA';
    const ma3Type = document.getElementById('nq-ma3-type')?.value || 'SMA';
    
    const settings = {
        nq: {
            ma1: { color: ma1Color, name: ma1Name, period: ma1Period, show: ma1Show, type: ma1Type },
            ma2: { color: ma2Color, name: ma2Name, period: ma2Period, show: ma2Show, type: ma2Type },
            ma3: { color: ma3Color, name: ma3Name, period: ma3Period, show: ma3Show, type: ma3Type },
            labelShow: labelShow
        }
    };
    try { localStorage.setItem('crowny_ma_settings', JSON.stringify(settings)); } catch(e) { console.warn("[catch]", e); }
    
    // 현재 탭 설정으로 MA 재계산
    updateLiveCandleChart();
    // console.log('<i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> MA 설정 적용 완료');
}

// localStorage에서 MA 설정 로드 (없으면 기본값 적용)
function loadMASettings() {
    try {
        const raw = localStorage.getItem('crowny_ma_settings');
        if (!raw) {
            // ★ 기본값 강제 적용 (새 기기/브라우저)
            applyMASettings();
            return;
        }
        const s = JSON.parse(raw);
        
        if (s.nq) {
            if (s.nq.ma1) {
                const el = document.getElementById('nq-ma1-color'); if (el) el.value = s.nq.ma1.color;
                const p = document.getElementById('nq-ma1-period'); if (p) p.value = s.nq.ma1.period;
                const sh = document.getElementById('nq-ma1-show'); if (sh) sh.checked = s.nq.ma1.show;
                const tp = document.getElementById('nq-ma1-type'); if (tp && s.nq.ma1.type) tp.value = s.nq.ma1.type;
            }
            if (s.nq.ma2) {
                const el = document.getElementById('nq-ma2-color'); if (el) el.value = s.nq.ma2.color;
                const p = document.getElementById('nq-ma2-period'); if (p) p.value = s.nq.ma2.period;
                const sh = document.getElementById('nq-ma2-show'); if (sh) sh.checked = s.nq.ma2.show;
                const tp = document.getElementById('nq-ma2-type'); if (tp && s.nq.ma2.type) tp.value = s.nq.ma2.type;
            }
            if (s.nq.ma3) {
                const el = document.getElementById('nq-ma3-color'); if (el) el.value = s.nq.ma3.color;
                const p = document.getElementById('nq-ma3-period'); if (p) p.value = s.nq.ma3.period;
                const sh = document.getElementById('nq-ma3-show'); if (sh) sh.checked = s.nq.ma3.show;
                const tp = document.getElementById('nq-ma3-type'); if (tp && s.nq.ma3.type) tp.value = s.nq.ma3.type;
            }
            const lb = document.getElementById('nq-ma-label-show'); if (lb) lb.checked = s.nq.labelShow;
        }
        // console.log('<i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> MA 설정 로드 완료');
    } catch(e) { console.warn("[catch]", e); }
}

// 틱 데이터를 캔들로 집계 (거래량 포함)
function aggregateTicksToCandles(ticks, intervalSec) {
    if (ticks.length === 0) return [];
    
    const candles = [];
    let currentCandle = null;
    let prevPrice = 0;
    
    for (const tick of ticks) {
        // 틱 레벨 스파이크 필터 (진짜 에러만: 100pt+)
        if (prevPrice > 0 && Math.abs(tick.price - prevPrice) > 100) continue;
        prevPrice = tick.price;
        const candleTime = Math.floor(tick.time / intervalSec) * intervalSec;
        
        if (!currentCandle || currentCandle.time !== candleTime) {
            if (currentCandle) candles.push(currentCandle);
            currentCandle = {
                time: candleTime,
                open: tick.price, high: tick.price, low: tick.price, close: tick.price,
                _tickCount: 1,
                _volume: tick.volume || 1,
            };
        } else {
            currentCandle.high = Math.max(currentCandle.high, tick.price);
            currentCandle.low = Math.min(currentCandle.low, tick.price);
            currentCandle.close = tick.price;
            currentCandle._tickCount = (currentCandle._tickCount || 0) + 1;
            currentCandle._volume = (currentCandle._volume || 0) + (tick.volume || 1);
        }
    }
    if (currentCandle) candles.push(currentCandle);
    
    return candles;
}

// 연결 상태 표시
function updateLiveStatus(connected) {
    const dot = document.getElementById('live-status-dot');
    const text = document.getElementById('live-status-text');
    if (dot) dot.style.background = connected ? '#5B7B8C' : '#B54534';
    if (text) text.textContent = connected ? `Databento Live · ${window.liveTicks.length} ticks` : t('trading.disconnected','Disconnected');
}

// 실시간 손익 표시
function updateLivePnL() {
    const pnlBar = document.getElementById('live-pnl-bar');
    const pnlEl = document.getElementById('live-pnl');
    
    if (!pnlBar || !pnlEl) return;
    
    // 오픈 포지션 확인
    if (!myParticipation || !myParticipation.trades) {
        pnlBar.style.display = 'none';
        return;
    }
    
    const openTrades = myParticipation.trades.filter(t => t.status === 'open');
    if (openTrades.length === 0) {
        pnlBar.style.display = 'none';
        return;
    }
    
    pnlBar.style.display = 'block';
    
    let totalPnL = 0;
    for (const trade of openTrades) {
        const multiplier = trade.contract === 'MNQ' ? 2 : 20;
        const effContracts = trade.effectiveContracts || (trade.contracts * (trade.copyAccounts || 1));
        if (trade.side === 'BUY') {
            totalPnL += (currentPrice - trade.entryPrice) * multiplier * effContracts;
        } else {
            totalPnL += (trade.entryPrice - currentPrice) * multiplier * effContracts;
        }
    }
    
    pnlEl.textContent = `${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}`;
    pnlEl.style.color = totalPnL > 0 ? '#5B7B8C' : totalPnL < 0 ? '#B54534' : '#6B5744';
    
    // ★ CRTD 프랍 — 실시간 상태
    const cfg = getCRTDConfig();
    const realTimePnL = (myParticipation?.currentBalance || 100000) - (myParticipation?.initialBalance || 100000) + totalPnL;
    const crtdEstEl = document.getElementById('live-crtd-est');
    if (crtdEstEl) {
        if (realTimePnL >= cfg.profitThreshold) {
            const excess = realTimePnL - cfg.profitThreshold;
            crtdEstEl.innerHTML = `<i data-lucide="gem" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>+${Math.floor(excess)} CRTD ${t('trading.conversion_zone','Convert Zone')}`;
            crtdEstEl.style.color = '#5B7B8C';
        } else if (realTimePnL < 0) {
            const left = cfg.liquidation + realTimePnL;
            crtdEstEl.innerHTML = `<i data-lucide="shield" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> -$${cfg.liquidation}${t('trading.until','until')} $${left.toFixed(0)} ${t('trading.remaining','left')}`; if(typeof lucide!=='undefined') lucide.createIcons();
            crtdEstEl.style.color = left < cfg.liquidation * 0.3 ? '#B54534' : '#ffaa00';
        } else {
            crtdEstEl.innerHTML = `<i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> +$${cfg.profitThreshold}${t('trading.until','until')} $${(cfg.profitThreshold - realTimePnL).toFixed(0)}`;
            crtdEstEl.style.color = '#4488ff';
        }
    }
}

// 하위 호환성 유지
function startRealPriceUpdates() {
    // startLiveDataFeed에서 처리하므로 여기서는 아무것도 안 함
    // console.log('ℹ️ 실시간 업데이트는 startLiveDataFeed에서 처리');
}

function fetchRealNQData() {
    return { candles: [], volume: [] };
}

function generateSampleData() {
    return { candles: [], volume: [] };
}

// 차트에 포지션 라인 그리기 (간소화 버전)
// 손절가 업데이트 (차트에서 드래그)
async function updateTradeStopLoss(tradeIndex, newPrice) {
    try {
        myParticipation.trades[tradeIndex].stopLoss = newPrice;

        await saveTradingState({ trades: myParticipation.trades });
        
        // console.log(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> SL 업데이트: ${newPrice.toFixed(2)}`);
        updateOpenPositions();
    } catch (error) {
        console.error('SL 업데이트 실패:', error);
    }
}

// 익절가 업데이트 (차트에서 드래그)
async function updateTradeTakeProfit(tradeIndex, newPrice) {
    try {
        myParticipation.trades[tradeIndex].takeProfit = newPrice;

        await saveTradingState({ trades: myParticipation.trades });
        
        // console.log(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> TP 업데이트: ${newPrice.toFixed(2)}`);
        updateOpenPositions();
    } catch (error) {
        console.error('TP 업데이트 실패:', error);
    }
}

function updatePriceFromChart(chart) {
    // TradingView 차트에서 현재 가격 가져오기
    chart.getSeries().then(series => {
        // 마지막 바 데이터 가져오기
        const lastBar = series.lastBar();
        if (lastBar) {
            currentPrice = lastBar.close;
            updateNQPriceDisplay();
        }
    }).catch(err => {
        // console.log('차트 데이터 로드 중...');
        // Fallback: 모의 데이터
        updateNQPrice();
    });
}

let priceFetchFailCount = 0;

function connectPriceWebSocket() {
    updateNQPrice();

    if (window.nqPriceInterval) clearInterval(window.nqPriceInterval);
    window.nqPriceInterval = setInterval(updateNQPrice, 500); // 0.5초 간격
}

// 가격 서버 장애 시 interval 늘리기
function adjustPriceInterval() {
    if (priceFetchFailCount >= 5) {
        clearInterval(window.nqPriceInterval);
        const backoffMs = Math.min(5000 * Math.pow(2, priceFetchFailCount - 4), 60000);
        window.nqPriceInterval = setInterval(updateNQPrice, backoffMs);
        console.warn(`<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 가격 서버 연속 실패 ${priceFetchFailCount}회 — ${backoffMs/1000}초 간격으로 조정`);
    }
}

async function updateNQPrice() {
    try {
        // CrownyTVM 서버 프록시 (Databento → Yahoo → TwelveData 자동 폴백)
        const response = await fetch('/api/market/nq');
        const data = await response.json();

        if (data && data.price) {
            currentPrice = data.price;
            window._nqPriceSource = data.source || 'unknown';
            if (priceFetchFailCount > 0) {
                priceFetchFailCount = 0;
                clearInterval(window.nqPriceInterval);
                window.nqPriceInterval = setInterval(updateNQPrice, 500);
            }
        } else {
            if (!currentPrice) currentPrice = 25400;
        }

        updateNQPriceDisplay();

    } catch (error) {
        priceFetchFailCount++;
        console.error(`Price fetch error (#${priceFetchFailCount}):`, error.message);
        if (!currentPrice) currentPrice = 25400;
        updateNQPriceDisplay();
        adjustPriceInterval();
    }
}

function updateNQPriceDisplay() {
    const contract = document.getElementById('futures-contract')?.value || 'MNQ';
    const contracts = parseInt(document.getElementById('trade-contracts')?.value) || 1;
    const multiplier = contract === 'NQ' ? 20 : 2;
    const tickSize = 0.25;
    const tickValue = multiplier * tickSize;
    
    const priceEl = document.getElementById('current-nq-price');
    const tickSizeEl = document.getElementById('tick-size');
    const pointValueEl = document.getElementById('point-value');
    const tickValueEl = document.getElementById('tick-value');
    
    const copyAccounts = getCopyAccounts();
    const effectiveContracts = contracts * copyAccounts;
    
    if (priceEl) priceEl.textContent = currentPrice.toFixed(2);
    if (tickSizeEl) tickSizeEl.textContent = tickSize.toFixed(2);
    if (pointValueEl) {
        if (effectiveContracts > 1) {
            pointValueEl.textContent = `$${multiplier} ×${effectiveContracts} = $${multiplier * effectiveContracts}`;
        } else {
            pointValueEl.textContent = `$${multiplier}`;
        }
    }
    if (tickValueEl) {
        if (effectiveContracts > 1) {
            tickValueEl.textContent = `$${tickValue.toFixed(2)} ×${effectiveContracts} = $${(tickValue * effectiveContracts).toFixed(2)}`;
        } else {
            tickValueEl.textContent = `$${tickValue.toFixed(2)}`;
        }
    }
    
    updateFeeDisplay();
    updateOpenPositions();
}

// 수수료 & 카피트레이딩 표시 업데이트
function updateFeeDisplay() {
    const contract = document.getElementById('futures-contract')?.value || 'MNQ';
    const contracts = parseInt(document.getElementById('trade-contracts')?.value) || 1;
    const copyAccounts = getCopyAccounts();
    const effectiveContracts = contracts * copyAccounts;
    const fee = RISK_CONFIG.tradeFeeRoundTrip * effectiveContracts;
    
    // 수수료 표시
    const feeEl = document.getElementById('trade-fee-display');
    if (feeEl) {
        feeEl.innerHTML = `<i data-lucide="coins"></i> ${t('trading.est_fee','Est. Fee')}: <strong>$${fee.toFixed(2)}</strong>` +
            (copyAccounts > 1 ? ` <span style="color:#C4841D;">(${contracts} contracts × ${copyAccounts} accounts = ${effectiveContracts} contracts)</span>` : '');
    }
    
    // 카피트레이딩 표시
    const copyEl = document.getElementById('copy-trade-display');
    if (copyEl) {
        if (copyAccounts > 1) {
            copyEl.style.display = 'block';
            copyEl.innerHTML = `<i data-lucide="clipboard"></i> ${t('trading.copy_trading','Copy Trading')}: <strong>${copyAccounts}${t('trading.accounts','accounts')}</strong> × ${contracts}${t('trading.contracts','contracts')} = <strong style="color:#C4841D;">${effectiveContracts}${t('trading.contracts','contracts')}</strong> ${t('trading.effective','effective')}`;
        } else {
            copyEl.style.display = 'none';
        }
    }
    if(window.lucide) lucide.createIcons();
}

function updateContractSpecs() {
    const formContract = document.getElementById('futures-contract')?.value;
    if (!formContract) return;
    
    // 권한 체크 — 비허용 상품 선택 방지
    if (!isProductAllowed(formContract)) {
        showToast(`<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${formContract} ${t('trading.no_permission','No trading permission')}`, 'warning');
        const tier = getTradingTier();
        const fallback = tier.MNQ > 0 ? 'MNQ' : tier.NQ > 0 ? 'NQ' : 'MNQ';
        document.getElementById('futures-contract').value = fallback;
        return updateContractSpecs(); // 재귀
    }
    
    // 계약 수 입력 최대값 갱신
    const max = getMaxContracts(formContract);
    const contractInput = document.getElementById('trade-contracts');
    const maxLabel = document.getElementById('contract-max-label');
    if (contractInput) {
        contractInput.max = max;
        if (parseInt(contractInput.value) > max) contractInput.value = max;
    }
    if (maxLabel) maxLabel.textContent = `(${t('trading.max','Max')} ${max})`;
    
    // 탭 심볼 동기화
    const tab = getActiveTab();
    if (tab && tab.symbol !== formContract) {
        tab.symbol = formContract;
        const tabSym = document.getElementById('tab-symbol');
        if (tabSym) tabSym.value = formContract;
        updateChartLabel();
        renderChartTabs();
        saveChartTabs();
        reloadChartData();
        drawPositionLinesLW();
    }
    
    updateNQPriceDisplay();
}

// (첫 번째 executeFuturesTrade 제거됨 - 아래 고급 버전이 최종)

// SL/TP 자동 청산 (confirm 없이)
async function autoClosePosition(tradeIndex, reason) {
    if (!myParticipation) return;
    
    const trade = myParticipation.trades[tradeIndex];
    if (trade.status !== 'open') return;
    
    const exitPrice = reason === 'SL' ? trade.stopLoss : 
                      reason === 'TRAIL-SL' ? trade.stopLoss :
                      reason === 'TP' ? trade.takeProfit : currentPrice;
    
    const priceDiff = trade.side === 'BUY' 
        ? (exitPrice - trade.entryPrice) 
        : (trade.entryPrice - exitPrice);
    
    const effContracts = trade.effectiveContracts || (trade.contracts * (trade.copyAccounts || 1));
    const pnl = priceDiff * trade.multiplier * effContracts;
    const fee = trade.fee || (RISK_CONFIG.tradeFeeRoundTrip * effContracts);
    const netPnl = pnl - fee;
    
    try {
        trade.status = 'closed';
        trade.exitPrice = exitPrice;
        trade.pnl = netPnl;
        trade.fee = fee;
        trade.closedAt = new Date();
        trade.closeReason = reason; // 'SL', 'TP', 'ADMIN'
        
        const newBalance = myParticipation.currentBalance + trade.margin + netPnl;
        myParticipation.currentBalance = newBalance;
        
        // 일일 PnL 누적
        myParticipation.dailyPnL = (myParticipation.dailyPnL || 0) + netPnl;

        await saveTradingState({
            trades: myParticipation.trades,
            currentBalance: newBalance,
            dailyPnL: myParticipation.dailyPnL
        });

        const emoji = reason === 'TP' ? '<i data-lucide="circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>' : reason === 'TRAIL-SL' ? '<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>' : '<i data-lucide="circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>';
        // console.log(`${emoji} 자동 청산 (${reason}): ${trade.contract} ${trade.side} @ ${exitPrice.toFixed(2)} → $${netPnl.toFixed(2)}`);
        
        // ★ CRTD 프랍 — 청산 체크 + 디스플레이
        if (reason !== 'CRTD Liquidation') {
            updateCRTDDisplay();
            await checkCRTDLiquidation();
        }
        
        // 알림
        const reasonText = reason === 'TRAIL-SL' ? t('trading.trailing_stop','Trailing Stop') : reason;
        showToast(`${emoji} ${reasonText} ${t('trading.auto_liquidated','Auto-liquidated!')} ${trade.contract} ${trade.side} ×${trade.contracts} ${t('trading.pnl','P&L')}: $${netPnl.toFixed(2)}`, netPnl >= 0 ? 'success' : 'warning');
        
        updateTradingUI();
        updateOpenPositions();
        loadTradeHistory();
        
        // 차트 라인 정리
        setTimeout(() => { drawPositionLinesLW(); }, 300);
        
        await checkDailyLossLimit();
        await checkCumulativeLiquidation();
        updateRiskGaugeUI();
        
    } catch (error) {
        console.error('자동 청산 실패:', error);
    }
}

async function closePosition(tradeIndex) {
    if (!myParticipation) return;
    
    const trade = myParticipation.trades[tradeIndex];
    if (!trade || trade.status !== 'open') return;
    
    const priceDiff = trade.side === 'BUY' 
        ? (currentPrice - trade.entryPrice) 
        : (trade.entryPrice - currentPrice);
    
    const effContracts = trade.effectiveContracts || (trade.contracts * (trade.copyAccounts || 1));
    const pnl = priceDiff * trade.multiplier * effContracts;
    const fee = trade.fee || (RISK_CONFIG.tradeFeeRoundTrip * effContracts);
    const netPnl = pnl - fee;
    
    try {
        trade.status = 'closed';
        trade.exitPrice = currentPrice;
        trade.pnl = netPnl;
        trade.fee = fee;
        trade.closedAt = new Date();
        
        // 증거금 반환 + 순손익 반영
        const newBalance = myParticipation.currentBalance + trade.margin + netPnl;
        myParticipation.currentBalance = newBalance;
        
        // 일일 PnL 누적
        myParticipation.dailyPnL = (myParticipation.dailyPnL || 0) + netPnl;

        await saveTradingState({
            trades: myParticipation.trades,
            currentBalance: newBalance,
            dailyPnL: myParticipation.dailyPnL
        });

        // console.log(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 청산: ${trade.side} ${trade.contract} x${trade.contracts} | PnL: $${netPnl.toFixed(2)}`);
        
        // ★ CRTD 프랍 — 청산 체크 + 디스플레이
        updateCRTDDisplay();
        await checkCRTDLiquidation();
        
        updateTradingUI();
        updateOpenPositions();
        loadTradeHistory();
        
        // ===== RISK CHECK: 일일 손실 한도 =====
        await checkDailyLossLimit();
        
        // ===== RISK CHECK: 누적 청산 =====
        await checkCumulativeLiquidation();
        
        updateRiskGaugeUI();
        
        // 차트 라인 업데이트 + 자동 정렬
        setTimeout(() => { drawPositionLinesLW(); scrollToLatest(); }, 500);
    } catch (error) {
        showToast(t('trading.close_failed','Close failed: ') + error.message, 'error');
    }
}

function updateOpenPositions() {
    if (!myParticipation || !myParticipation.trades) return;
    
    const container = document.getElementById('open-positions');
    const openTrades = myParticipation.trades.filter(t => t.status === 'open');
    
    // ===== 트레일링 스탑 처리 =====
    let trailingUpdated = false;
    for (let i = 0; i < myParticipation.trades.length; i++) {
        const trade = myParticipation.trades[i];
        if (trade.status !== 'open' || !currentPrice || !trade.trailingStop || !trade.trailingStop.enabled) continue;
        
        const ts = trade.trailingStop;
        
        if (trade.side === 'BUY') {
            // BUY: 가격이 올라가면 SL도 따라 올림
            const profit = currentPrice - trade.entryPrice;
            
            // 활성화 체크
            if (!ts.activated && profit >= ts.activation) {
                ts.activated = true;
                // console.log(`<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 트레일링 활성화 (BUY #${i}): 수익 ${profit.toFixed(2)}pt ≥ ${ts.activation}pt`);
            }
            
            if (ts.activated) {
                // 최고가 갱신
                if (currentPrice > (ts.highWaterMark || trade.entryPrice)) {
                    ts.highWaterMark = currentPrice;
                    const newSL = currentPrice - ts.distance;
                    // SL은 위로만 움직임 (더 유리한 방향)
                    if (!trade.stopLoss || newSL > trade.stopLoss) {
                        trade.stopLoss = Math.round(newSL * 4) / 4; // 0.25 단위로 반올림
                        trailingUpdated = true;
                        // console.log(`<i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 트레일링 SL 상향: ${trade.stopLoss.toFixed(2)} (최고: ${ts.highWaterMark.toFixed(2)})`);
                    }
                }
            }
        } else {
            // SELL: 가격이 내려가면 SL도 따라 내림
            const profit = trade.entryPrice - currentPrice;
            
            // 활성화 체크
            if (!ts.activated && profit >= ts.activation) {
                ts.activated = true;
                // console.log(`<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 트레일링 활성화 (SELL #${i}): 수익 ${profit.toFixed(2)}pt ≥ ${ts.activation}pt`);
            }
            
            if (ts.activated) {
                // 최저가 갱신
                if (currentPrice < (ts.highWaterMark || trade.entryPrice)) {
                    ts.highWaterMark = currentPrice;
                    const newSL = currentPrice + ts.distance;
                    // SL은 아래로만 움직임 (더 유리한 방향)
                    if (!trade.stopLoss || newSL < trade.stopLoss) {
                        trade.stopLoss = Math.round(newSL * 4) / 4;
                        trailingUpdated = true;
                        // console.log(`<i data-lucide="trending-down" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 트레일링 SL 하향: ${trade.stopLoss.toFixed(2)} (최저: ${ts.highWaterMark.toFixed(2)})`);
                    }
                }
            }
        }
    }
    
    // 트레일링 SL 변경 시 Firestore 저장 + 차트 라인 갱신 (쓰로틀)
    if (trailingUpdated) {
        // Server save (디바운스 500ms)
        if (window._trailingSaveTimer) clearTimeout(window._trailingSaveTimer);
        window._trailingSaveTimer = setTimeout(async () => {
            try {
                await saveTradingState({ trades: myParticipation.trades });
            } catch (e) { console.warn('트레일링 저장 실패:', e); }
        }, 500);
        
        // 차트 라인 즉시 갱신
        drawPositionLinesLW();
    }
    
    // ===== SL/TP 자동 트리거 =====
    for (let i = 0; i < myParticipation.trades.length; i++) {
        const trade = myParticipation.trades[i];
        if (trade.status !== 'open' || !currentPrice) continue;
        
        let shouldClose = false;
        let reason = '';
        
        if (trade.stopLoss) {
            const slHit = trade.side === 'BUY' 
                ? currentPrice <= trade.stopLoss 
                : currentPrice >= trade.stopLoss;
            if (slHit) {
                shouldClose = true;
                reason = trade.trailingStop?.activated ? 'TRAIL-SL' : 'SL';
            }
        }
        
        if (trade.takeProfit) {
            const tpHit = trade.side === 'BUY' 
                ? currentPrice >= trade.takeProfit 
                : currentPrice <= trade.takeProfit;
            if (tpHit) {
                shouldClose = true;
                reason = 'TP';
            }
        }
        
        if (shouldClose) {
            autoClosePosition(i, reason);
            return; // 재귀 방지: 한 번에 하나씩
        }
    }
    
    // 포지션 카운트 바 업데이트
    updatePositionCountBar();
    
    if (openTrades.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--accent); padding:1rem;">${t('trading.no_positions','No open positions')}</p>`;
        return;
    }
    
    container.innerHTML = '';
    
    openTrades.forEach((trade, index) => {
        const actualIndex = myParticipation.trades.indexOf(trade);
        const priceDiff = trade.side === 'BUY' 
            ? (currentPrice - trade.entryPrice) 
            : (trade.entryPrice - currentPrice);
        
        const effContracts = trade.effectiveContracts || (trade.contracts * (trade.copyAccounts || 1));
        const pnl = priceDiff * trade.multiplier * effContracts;
        const tradeFee = trade.fee || (RISK_CONFIG.tradeFeeRoundTrip * effContracts);
        const pnlColor = pnl >= 0 ? '#3D2B1F' : '#B54534';
        
        const div = document.createElement('div');
        div.style.cssText = 'padding:1rem; background:var(--bg); border-radius:6px; margin-bottom:0.5rem; border-left:4px solid ' + (trade.side === 'BUY' ? '#3D2B1F' : '#B54534');
        
        // SL/TP 인라인 수정 UI
        const ts = trade.trailingStop;
        const trailBadge = (ts && ts.enabled) 
            ? `<span style="display:inline-block; background:${ts.activated ? '#C4841D' : '#6B5744'}; color:#FFF8F0; font-size:0.6rem; padding:1px 4px; border-radius:3px; margin-left:4px;">${ts.activated ? '<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> TRAIL' : '<i data-lucide="hourglass" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('trading.pending','Pending')}</span>` 
            : '';
        
        let slTPHTML = `
            <div style="display:flex; gap:4px; margin-top:6px; font-size:0.8rem; flex-wrap:wrap; align-items:center;">
                <span style="color:#B54534;">SL:</span>
                <button onclick="adjustSLTP(${actualIndex},'sl',-0.25)" style="background:#6B5744; color:#FFF8F0; border:none; border-radius:3px; padding:1px 6px; cursor:pointer; font-size:0.7rem;">−</button>
                <span id="sl-val-${actualIndex}" style="color:#B54534; font-weight:700; min-width:60px; text-align:center; cursor:pointer;" onclick="editSLTP(${actualIndex},'sl')">${trade.stopLoss ? trade.stopLoss.toFixed(2) : '-'}</span>
                <button onclick="adjustSLTP(${actualIndex},'sl',+0.25)" style="background:#3D2B1F; color:#B54534; border:none; border-radius:3px; padding:1px 6px; cursor:pointer; font-size:0.7rem;">+</button>
                <span style="margin-left:6px; color:#00cc00;">TP:</span>
                <button onclick="adjustSLTP(${actualIndex},'tp',-0.25)" style="background:#3D2B1F; color:#00cc00; border:none; border-radius:3px; padding:1px 6px; cursor:pointer; font-size:0.7rem;">−</button>
                <span id="tp-val-${actualIndex}" style="color:#00cc00; font-weight:700; min-width:60px; text-align:center; cursor:pointer;" onclick="editSLTP(${actualIndex},'tp')">${trade.takeProfit ? trade.takeProfit.toFixed(2) : '-'}</span>
                <button onclick="adjustSLTP(${actualIndex},'tp',+0.25)" style="background:#3D2B1F; color:#00cc00; border:none; border-radius:3px; padding:1px 6px; cursor:pointer; font-size:0.7rem;">+</button>
                ${trailBadge}
            </div>
        `;
        
        if (ts && ts.enabled && ts.activated) {
            const hwm = ts.highWaterMark || trade.entryPrice;
            slTPHTML += `<div style="font-size:0.7rem; color:#C4841D; margin-top:2px;"><i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${trade.side === 'BUY' ? 'High' : 'Low'}: ${hwm.toFixed(2)} | Dist: ${ts.distance}pt</div>`;
        }
        
        // 분할 청산 버튼 (2계약 이상)
        const partialCloseBtn = trade.contracts > 1 
            ? `<button onclick="partialClosePosition(${actualIndex})" style="background:#886600; color:#FFF8F0; border:none; padding:0.3rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.7rem;"><i data-lucide="bar-chart-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.partial','Partial')}</button>`
            : '';
        
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <div style="flex:1;">
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.3rem;">
                        <strong style="color:${trade.side === 'BUY' ? '#3D2B1F' : '#B54534'}">${trade.side}</strong> 
                        <span>${trade.contract} × ${trade.contracts}${(trade.copyAccounts || 1) > 1 ? ` <span style="color:#C4841D; font-size:0.75rem;">×${trade.copyAccounts}=${effContracts}</span>` : ''}</span>
                        <span style="font-size:0.75rem; color:var(--accent);">${trade.orderType}</span>
                    </div>
                    <div style="font-size:0.85rem;">
                        ${t('trading.entry','Entry')}: ${trade.entryPrice.toFixed(2)} → ${t('trading.current','Now')}: ${currentPrice.toFixed(2)}
                    </div>
                    ${slTPHTML}
                    <div style="margin-top:0.5rem;">
                        <strong style="color:${pnlColor}; font-size:1.2rem;">
                            ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}
                        </strong>
                        <span style="font-size:0.8rem; color:var(--accent); margin-left:0.5rem;">
                            (${((pnl / trade.margin) * 100).toFixed(2)}%)
                        </span>
                        <span style="font-size:0.7rem; color:#6B5744; margin-left:0.5rem;">
                            ${t('trading.fee','Fee')}: $${tradeFee.toFixed(2)}
                        </span>
                    </div>
                </div>
                <div style="display:flex; flex-direction:column; gap:0.3rem;">
                    <button onclick="closePosition(${actualIndex})" style="background:#B54534; color:#FFF8F0; border:none; padding:0.5rem 0.8rem; border-radius:4px; cursor:pointer; font-size:0.8rem; font-weight:bold;">
                        <i data-lucide="x" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> CLOSE
                    </button>
                    ${partialCloseBtn}
                    ${(ts && ts.enabled) ? `
                        <button onclick="toggleTrailingForTrade(${actualIndex})" style="background:${ts.activated ? '#C4841D' : '#6B5744'}; color:#FFF8F0; border:none; padding:0.3rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.7rem;">
                            ${ts.activated ? '<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ON' : '⏸ OFF'}
                        </button>
                    ` : `
                        <button onclick="enableTrailingForTrade(${actualIndex})" style="background:#6B5744; color:#6B5744; border:none; padding:0.3rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.7rem;">
                            +Trail
                        </button>
                    `}
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

async function modifyPosition(tradeIndex) {
    const trade = myParticipation.trades[tradeIndex];
    if (trade.status !== 'open') return;
    
    const newSL = await showPromptModal(t('trading.edit_sl','Edit Stop Loss'), `${t('trading.current','Current')}: ${trade.stopLoss ? trade.stopLoss.toFixed(2) : '-'}`, trade.stopLoss || '');
    const newTP = await showPromptModal(t('trading.edit_tp','Edit Take Profit'), `${t('trading.current','Current')}: ${trade.takeProfit ? trade.takeProfit.toFixed(2) : '-'}`, trade.takeProfit || '');
    
    try {
        trade.stopLoss = newSL ? parseFloat(newSL) : null;
        trade.takeProfit = newTP ? parseFloat(newTP) : null;

        await saveTradingState({ trades: myParticipation.trades });

        updateOpenPositions();
        drawPositionLinesLW();
    } catch (error) {
        showToast(t('trading.edit_fail','Edit failed: ') + error.message, 'error');
    }
}

// ★ SL/TP 인라인 ±0.25 조정
async function adjustSLTP(tradeIndex, type, delta) {
    const trade = myParticipation.trades[tradeIndex];
    if (!trade || trade.status !== 'open') return;
    
    if (type === 'sl') {
        trade.stopLoss = Math.round(((trade.stopLoss || trade.entryPrice) + delta) * 4) / 4;
    } else {
        trade.takeProfit = Math.round(((trade.takeProfit || trade.entryPrice) + delta) * 4) / 4;
    }
    
    const el = document.getElementById(`${type === 'sl' ? 'sl' : 'tp'}-val-${tradeIndex}`);
    if (el) el.textContent = (type === 'sl' ? trade.stopLoss : trade.takeProfit).toFixed(2);
    
    drawPositionLinesLW();
    
    if (window._sltpSaveTimer) clearTimeout(window._sltpSaveTimer);
    window._sltpSaveTimer = setTimeout(async () => {
        try {
            await saveTradingState({ trades: myParticipation.trades });
        } catch (e) { console.warn('SL/TP 저장 실패:', e); }
    }, 500);
}

// ★ SL/TP 직접 입력
async function editSLTP(tradeIndex, type) {
    const trade = myParticipation.trades[tradeIndex];
    if (!trade || trade.status !== 'open') return;
    
    const label = type === 'sl' ? t('trading.stop_loss','Stop Loss') : t('trading.take_profit','Take Profit');
    const current = type === 'sl' ? trade.stopLoss : trade.takeProfit;
    const input = await showPromptModal(`${label} ${t('trading.direct_input','Manual Input')}`, `${t('trading.current','Current')}: ${current ? current.toFixed(2) : t('trading.none','None')}`, current ? current.toFixed(2) : '');
    if (!input) return;
    
    const val = parseFloat(input);
    if (isNaN(val) || val < 1000) { showToast(t('trading.invalid_price','Invalid price'), 'error'); return; }
    
    if (type === 'sl') trade.stopLoss = val;
    else trade.takeProfit = val;
    
    drawPositionLinesLW();
    
    try {
        await saveTradingState({ trades: myParticipation.trades });
    } catch (e) { showToast(t('trading.save_failed','Save failed: ') + e.message, 'error'); }
    updateOpenPositions();
}

// ★ 분할 청산
async function partialClosePosition(tradeIndex) {
    const trade = myParticipation.trades[tradeIndex];
    if (!trade || trade.status !== 'open' || trade.contracts <= 1) return;
    
    const input = await showPromptModal(t('trading.partial_close','Partial Close'), `${t('trading.current','Current')}: ${trade.side} ${trade.contract} × ${trade.contracts}${t('trading.contracts','contracts')}\n${t('trading.how_many_close','How many contracts to close?')} (1 ~ ${trade.contracts - 1})`, '1');
    if (!input) return;
    
    const closeCount = parseInt(input);
    if (isNaN(closeCount) || closeCount < 1 || closeCount >= trade.contracts) {
        showToast(t('trading.enter_number_between',`Enter a number between 1 and ${trade.contracts - 1}`), 'error');
        return;
    }
    
    const remainCount = trade.contracts - closeCount;
    const priceDiff = trade.side === 'BUY' ? (currentPrice - trade.entryPrice) : (trade.entryPrice - currentPrice);
    const closePnl = priceDiff * trade.multiplier * closeCount;
    const closeFee = (trade.fee / trade.contracts) * closeCount;
    const netPnl = closePnl - closeFee;
    const closeMargin = (trade.margin / trade.contracts) * closeCount;
    
    try {
        trade.contracts = remainCount;
        trade.margin = trade.margin - closeMargin;
        trade.fee = trade.fee - closeFee;
        
        const closedTrade = {
            ...JSON.parse(JSON.stringify(trade)),
            contracts: closeCount, margin: closeMargin, fee: closeFee,
            exitPrice: currentPrice, pnl: netPnl, status: 'closed',
            closedAt: new Date(), closeReason: `Partial close (${closeCount}/${closeCount + remainCount})`,
        };
        
        myParticipation.trades.push(closedTrade);
        myParticipation.currentBalance += closeMargin + netPnl;

        await saveTradingState({ trades: myParticipation.trades, currentBalance: myParticipation.currentBalance });
        
        // console.log(`<i data-lucide="bar-chart-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 분할 청산: ${closeCount}계약 청산, ${remainCount}계약 유지`);
        
        // ★ CRTD 프랍 — 청산 체크 + 디스플레이
        updateCRTDDisplay();
        await checkCRTDLiquidation();
        
        updateTradingUI(); updateOpenPositions(); updateRiskGaugeUI(); drawPositionLinesLW();
    } catch (error) {
        showToast(t('trading.partial_close_failed','Partial close failed: ') + error.message, 'error');
    }
}

// 기존 포지션에 트레일링 스탑 활성화/비활성화
async function toggleTrailingForTrade(tradeIndex) {
    const trade = myParticipation.trades[tradeIndex];
    if (!trade || trade.status !== 'open' || !trade.trailingStop) return;
    
    trade.trailingStop.enabled = !trade.trailingStop.enabled;
    if (!trade.trailingStop.enabled) {
        trade.trailingStop.activated = false;
    }
    
    try {
        await saveTradingState({ trades: myParticipation.trades });

        const status = trade.trailingStop.enabled ? t('trading.enabled','Enabled') : t('trading.disabled','Disabled');
        // console.log(`<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 트레일링 ${status}: Trade #${tradeIndex}`);
        updateOpenPositions();
    } catch (e) {
        console.error('트레일링 토글 실패:', e);
    }
}

// 트레일링 없는 포지션에 트레일링 추가
async function enableTrailingForTrade(tradeIndex) {
    const trade = myParticipation.trades[tradeIndex];
    if (!trade || trade.status !== 'open') return;
    
    const distance = await showPromptModal(t('trading.trailing_stop','Trailing Stop'), t('trading.trail_distance','Trailing distance (points)'), '30');
    if (!distance) return;
    
    const activation = await showPromptModal(t('trading.trailing_stop','Trailing Stop'), t('trading.trail_activation','Activation profit (points, 0=immediate)'), '10');
    
    const distVal = parseFloat(distance) || 30;
    const actVal = parseFloat(activation) || 0;
    
    trade.trailingStop = {
        enabled: true,
        distance: distVal,
        activation: actVal,
        highWaterMark: trade.side === 'BUY' ? Math.max(currentPrice, trade.entryPrice) : Math.min(currentPrice, trade.entryPrice),
        activated: actVal === 0
    };
    
    // SL이 없으면 자동 설정
    if (!trade.stopLoss) {
        if (trade.side === 'BUY') {
            trade.stopLoss = Math.round((currentPrice - distVal) * 4) / 4;
        } else {
            trade.stopLoss = Math.round((currentPrice + distVal) * 4) / 4;
        }
    }
    
    try {
        await saveTradingState({ trades: myParticipation.trades });

        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.trailing_stop_added','Trailing Stop added!')} ${t('trading.distance','Distance')}: ${distVal}pt, SL: ${trade.stopLoss.toFixed(2)}`, 'success');
        updateOpenPositions();
        drawPositionLinesLW();
    } catch (e) {
        showToast(t('trading.setting_failed','Setting failed: ') + e.message, 'error');
    }
}

async function loadTradeHistory() {
    if (!myParticipation || !myParticipation.trades) return;
    
    const container = document.getElementById('trade-history');
    container.innerHTML = '';
    
    const closedTrades = myParticipation.trades.filter(t => t.status === 'closed');
    
    if (closedTrades.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--accent); padding:1rem;">${t('trading.no_history','No trade history')}</p>`;
        return;
    }
    
    closedTrades.slice().reverse().forEach((trade) => {
        const div = document.createElement('div');
        div.style.cssText = 'padding:0.8rem; background:var(--bg); border-radius:6px; margin-bottom:0.5rem;';
        
        const sideColor = trade.side === 'BUY' ? '#3D2B1F' : '#B54534';
        const pnlColor = trade.pnl >= 0 ? '#3D2B1F' : '#B54534';
        
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <div>
                    <strong style="color:${sideColor}">${trade.side}</strong> ${trade.contract} × ${trade.contracts}
                    <br>
                    <span style="font-size:0.85rem; color:var(--accent);">
                        ${trade.entryPrice.toFixed(2)} → ${trade.exitPrice.toFixed(2)}
                    </span>
                </div>
                <div style="text-align:right;">
                    <strong style="color:${pnlColor}; font-size:1.1rem;">
                        ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}
                    </strong>
                    <br>
                    <span style="font-size:0.75rem; color:var(--accent);">
                        ${new Date(trade.closedAt?.seconds ? trade.closedAt.seconds * 1000 : trade.closedAt).toLocaleString()}
                    </span>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

// Remove crypto pair change listener
document.addEventListener('DOMContentLoaded', () => {
    // NQ futures - no pair selection needed
});

// Re-render dynamic UI when language changes
document.addEventListener('languageChanged', () => {
    // Always re-render challenge cards
    if (typeof loadPropTrading === 'function') loadPropTrading();
    // Re-render trading UI if user has participation
    if (myParticipation) {
        applyTradingPermissions();
        updateCRTDPanel();
        // Re-render rules
        if (typeof loadTradingDashboard === 'function') loadTradingDashboard();
    }
    // Re-render mentor panel
    if (typeof renderMentorPanel === 'function') renderMentorPanel();
});

// ========== NINJATRADER-STYLE FEATURES ==========

function toggleOrderInputs() {
    const orderType = document.getElementById('order-type').value;
    const priceInputs = document.getElementById('price-inputs');
    const limitDiv = document.getElementById('limit-price-div');
    const stopDiv = document.getElementById('stop-price-div');
    
    if (orderType === 'MARKET') {
        priceInputs.style.display = 'none';
    } else if (orderType === 'LIMIT') {
        priceInputs.style.display = 'block';
        limitDiv.style.display = 'block';
        stopDiv.style.display = 'none';
        document.getElementById('limit-price').value = currentPrice.toFixed(2);
    } else if (orderType === 'STOP') {
        priceInputs.style.display = 'block';
        limitDiv.style.display = 'none';
        stopDiv.style.display = 'block';
        document.getElementById('stop-price').value = currentPrice.toFixed(2);
    } else if (orderType === 'STOP_LIMIT') {
        priceInputs.style.display = 'block';
        limitDiv.style.display = 'block';
        stopDiv.style.display = 'block';
        document.getElementById('limit-price').value = currentPrice.toFixed(2);
        document.getElementById('stop-price').value = currentPrice.toFixed(2);
    }
}

function toggleSLTP() {
    const useSLTP = document.getElementById('use-sl-tp').checked;
    const inputs = document.getElementById('sl-tp-inputs');
    inputs.style.display = useSLTP ? 'block' : 'none';
}

// 트레일링 스탑 옵션 토글
function toggleTrailingOptions() {
    const use = document.getElementById('use-trailing-stop').checked;
    const opts = document.getElementById('trailing-options');
    if (opts) opts.style.display = use ? 'block' : 'none';
}

// CLOSE 버튼 — 가장 최근 오픈 포지션 청산
async function closeLastPosition() {
    if (window._closeLoading) return;
    window._closeLoading = true;
    setTimeout(() => { window._closeLoading = false; }, 1000);
    if (!myParticipation || !myParticipation.trades) {
        showToast(t('trading.no_open','No open positions'), 'info');
        return;
    }
    
    // 가장 최근 open 포지션 찾기
    let lastIndex = -1;
    for (let i = myParticipation.trades.length - 1; i >= 0; i--) {
        if (myParticipation.trades[i].status === 'open') {
            lastIndex = i;
            break;
        }
    }
    
    if (lastIndex === -1) {
        showToast(t('trading.no_open','No open positions'), 'info');
        return;
    }
    
    const trade = myParticipation.trades[lastIndex];
    const effContracts = trade.effectiveContracts || (trade.contracts * (trade.copyAccounts || 1));
    const priceDiff = trade.side === 'BUY' 
        ? (currentPrice - trade.entryPrice) 
        : (trade.entryPrice - currentPrice);
    const pnl = priceDiff * trade.multiplier * effContracts;
    const copyLabel = (trade.copyAccounts || 1) > 1 ? ` (×${trade.copyAccounts}${t('trading.accounts_suffix','accounts')}=${effContracts}${t('trading.contracts','contracts')})` : '';
    
    if (!await showConfirmModal(t('trading.close_last_position','Close last position'), `${trade.side} ${trade.contract} ×${trade.contracts}${copyLabel}\n${t('trading.entry','Entry')}: ${trade.entryPrice.toFixed(2)} → ${t('trading.current','Current')}: ${currentPrice.toFixed(2)}\n${t('trading.expected_pnl','Expected P&L')}: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}\n\n${t('trading.confirm_close','Close position?')}`)) return;
    
    await closePosition(lastIndex);
}

// FLATTEN 버튼 — 전체 포지션 즉시 청산
async function flattenAllPositions() {
    if (!myParticipation || !myParticipation.trades) {
        showToast(t('trading.no_open','No open positions'), 'info');
        return;
    }
    
    const openTrades = myParticipation.trades.filter(t => t.status === 'open');
    if (openTrades.length === 0) {
        showToast(t('trading.no_open','No open positions'), 'info');
        return;
    }
    
    let totalPnL = 0;
    for (const trade of openTrades) {
        const priceDiff = trade.side === 'BUY' 
            ? (currentPrice - trade.entryPrice) 
            : (trade.entryPrice - currentPrice);
        const effContracts = trade.effectiveContracts || (trade.contracts * (trade.copyAccounts || 1));
        totalPnL += priceDiff * trade.multiplier * effContracts;
    }
    
    if (!await showConfirmModal('<i data-lucide="alert" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('trading.flatten_all','Flatten All'), `${t('trading.open','Open')}: ${openTrades.length}${t('trading.count_suffix','')}\n${t('trading.expected_total_pnl','Expected total P&L')}: ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}\n\n${t('trading.confirm_close_all','Close all positions?')}`)) return;
    
    await closeAllPositions();
}

// 포지션 카운트 바 업데이트
function updatePositionCountBar() {
    const bar = document.getElementById('position-count-bar');
    const text = document.getElementById('position-count-text');
    if (!bar || !text) return;
    
    if (!myParticipation || !myParticipation.trades) {
        bar.style.display = 'none';
        return;
    }
    
    const openTrades = myParticipation.trades.filter(t => t.status === 'open');
    
    if (openTrades.length === 0) {
        bar.style.display = 'none';
        return;
    }
    
    bar.style.display = 'block';
    
    let totalPnL = 0;
    let buyCount = 0, sellCount = 0;
    for (const trade of openTrades) {
        const priceDiff = trade.side === 'BUY' 
            ? (currentPrice - trade.entryPrice) 
            : (trade.entryPrice - currentPrice);
        const effContracts = trade.effectiveContracts || (trade.contracts * (trade.copyAccounts || 1));
        totalPnL += priceDiff * trade.multiplier * effContracts;
        if (trade.side === 'BUY') buyCount++; else sellCount++;
    }
    
    const pnlColor = totalPnL >= 0 ? '#3D2B1F' : '#B54534';
    text.innerHTML = `<i data-lucide="circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${openTrades.length}${t('trading.positions_count',' positions')} (B:${buyCount} S:${sellCount}) | <strong style="color:${pnlColor}">${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}</strong>`;
}

async function closeAllPositions(contractFilter) {
    if (window._flattenLoading) return;
    window._flattenLoading = true;
    setTimeout(() => { window._flattenLoading = false; }, 1000);
    
    if (!myParticipation || !myParticipation.trades) return;
    
    // contract 필터: 특정 상품만 또는 전체
    const openTrades = myParticipation.trades.filter(t => 
        t.status === 'open' && (!contractFilter || t.contract === contractFilter)
    );
    
    if (openTrades.length === 0) {
        showToast(`${contractFilter || t('trading.all','All')} ${t('trading.no_open_positions','No open positions')}`, 'info');
        return;
    }
    
    try {
        let totalPnL = 0;
        let totalNetPnL = 0;
        
        for (let i = 0; i < myParticipation.trades.length; i++) {
            const trade = myParticipation.trades[i];
            if (trade.status === 'open' && (!contractFilter || trade.contract === contractFilter)) {
                const priceDiff = trade.side === 'BUY' 
                    ? (currentPrice - trade.entryPrice) 
                    : (trade.entryPrice - currentPrice);
                
                const effContracts = trade.effectiveContracts || (trade.contracts * (trade.copyAccounts || 1));
                const pnl = priceDiff * trade.multiplier * effContracts;
                const fee = trade.fee || (RISK_CONFIG.tradeFeeRoundTrip * effContracts);
                const netPnl = pnl - fee;
                
                trade.status = 'closed';
                trade.exitPrice = currentPrice;
                trade.pnl = netPnl;
                trade.fee = fee;
                trade.closedAt = new Date();
                
                totalPnL += netPnl + trade.margin;
                totalNetPnL += netPnl;
            }
        }
        
        myParticipation.currentBalance += totalPnL;
        myParticipation.dailyPnL = (myParticipation.dailyPnL || 0) + totalNetPnL;

        await saveTradingState({
            trades: myParticipation.trades,
            currentBalance: myParticipation.currentBalance,
            dailyPnL: myParticipation.dailyPnL
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${contractFilter || t('trading.all','All')} ${t('trading.positions_closed','Positions closed!')} ${t('trading.pnl','P&L')}: $${totalNetPnL.toFixed(2)}`, 'success');
        updateTradingUI();
        updateOpenPositions();
        loadTradeHistory();
        
        // 차트 라인 정리
        setTimeout(() => { drawPositionLinesLW(); scrollToLatest(); }, 300);
        
        // ===== RISK CHECK =====
        await checkDailyLossLimit();
        await checkCumulativeLiquidation();
        updateRiskGaugeUI();
    } catch (error) {
        showToast(t('trading.close_failed','Close failed: ') + error.message, 'error');
    }
}

// Modify executeFuturesTrade to support advanced order types + SLOT SYSTEM + RISK CHECK
async function executeFuturesTrade(side) {
    // console.log('<i data-lucide="search" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> executeFuturesTrade 호출:', side, 'myParticipation:', !!myParticipation, 'currentPrice:', currentPrice);
    // 더블클릭 방지 (3초) + UI 피드백
    if (window._tradeLoading) { showToast('<i data-lucide="hourglass" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('trading.order_processing','Processing order...'), 'warning', 1000); return; }
    window._tradeLoading = true;
    const btns2 = ['btn-buy','btn-sell','btn-chart-buy','btn-chart-sell'].map(id => document.getElementById(id)).filter(Boolean);
    btns2.forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
    const unlockBtns2 = () => { window._tradeLoading = false; btns2.forEach(b => { b.disabled = false; b.style.opacity = '1'; }); };
    setTimeout(unlockBtns2, 3000);
    
    if (!myParticipation) {
        showToast(t('trading.join_first','Join a challenge first'), 'warning');
        return;
    }
    
    // ===== RISK CHECK: 일일 한도 =====
    if (myParticipation.dailyLocked) {
        const reason = myParticipation.adminSuspended 
            ? t('trading.admin_suspended','<i data-lucide="ban" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Trading suspended by admin')
            : t('trading.daily_ended','<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Trading ended for today');
        showToast(reason, 'warning');
        return;
    }
    
    const contract = document.getElementById('futures-contract').value;
    
    // ===== 상품별 권한 체크 (tradingTier) =====
    if (!isProductAllowed(contract)) {
        showToast(`<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${contract} ${t('trading.no_permission','No trading permission')}`, 'warning');
        return;
    }

    // ===== 계약 수: 유저 입력 → 권한 검증 (CRTD 시스템: 슬롯 불필요) =====
    const tierMax = getMaxContracts(contract);
    const inputContracts = parseInt(document.getElementById('trade-contracts')?.value) || 1;
    const contracts = Math.min(inputContracts, tierMax);
    
    if (inputContracts > tierMax) {
        showToast(`<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.max_contracts_adjusted',`Max ${tierMax} contracts → adjusted to ${contracts}`)}`, 'warning');
    }
    
    const orderType = document.getElementById('order-type').value;
    const multiplier = contract === 'NQ' ? 20 : 2;
    const margin = contract === 'NQ' ? 15000 : 1500;
    const requiredMargin = margin * contracts;
    
    // ===== 최대 동시 포지션 체크 =====
    const maxPositions = myParticipation.maxPositions || 5;
    const openCount = (myParticipation.trades || []).filter(t => t.status === 'open').length;
    if (openCount >= maxPositions) {
        showToast(`<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.max_positions_reached',`Max ${maxPositions} simultaneous positions reached!`)}`, 'warning');
        return;
    }

    if (requiredMargin > myParticipation.currentBalance) {
        showToast(`${t('trading.insufficient_margin','Insufficient margin')} — ${t('trading.required','Required')}: $${requiredMargin.toLocaleString()}, ${t('trading.held','Held')}: $${myParticipation.currentBalance.toLocaleString()}`, 'warning');
        return;
    }
    
    // 거래 제한 체크
    if (!checkTradingLimits(contracts, contract)) return;
    
    let entryPrice = currentPrice;
    let orderTypeText = t('trading.market_order','Market');

    // Get prices based on order type
    if (orderType === 'LIMIT') {
        entryPrice = parseFloat(document.getElementById('limit-price').value);
        orderTypeText = `${t('trading.limit_order','Limit')} ${entryPrice.toFixed(2)}`;
    } else if (orderType === 'STOP') {
        entryPrice = parseFloat(document.getElementById('stop-price').value);
        orderTypeText = `${t('trading.stop_order','Stop')} ${entryPrice.toFixed(2)}`;
    } else if (orderType === 'STOP_LIMIT') {
        const stopPrice = parseFloat(document.getElementById('stop-price').value);
        entryPrice = parseFloat(document.getElementById('limit-price').value);
        orderTypeText = `${t('trading.stop_limit_order','Stop Limit')} ${stopPrice.toFixed(2)}/${entryPrice.toFixed(2)}`;
    }
    
    // Get SL/TP settings
    const useSLTP = document.getElementById('use-sl-tp').checked;
    let stopLoss = null;
    let takeProfit = null;
    let trailingStop = null;
    
    if (useSLTP) {
        const slPoints = parseFloat(document.getElementById('stop-loss-points').value) || 0;
        const tpPoints = parseFloat(document.getElementById('take-profit-points').value) || 0;
        
        if (side === 'BUY') {
            stopLoss = entryPrice - slPoints;
            takeProfit = entryPrice + tpPoints;
        } else {
            stopLoss = entryPrice + slPoints;
            takeProfit = entryPrice - tpPoints;
        }
        
        // 트레일링 스탑 설정
        const useTrailing = document.getElementById('use-trailing-stop')?.checked;
        if (useTrailing) {
            const trailDist = parseFloat(document.getElementById('trailing-distance').value) || 30;
            const trailActivation = parseFloat(document.getElementById('trailing-activation').value) || 10;
            trailingStop = {
                enabled: true,
                distance: trailDist,          // SL이 현재가로부터 유지할 거리
                activation: trailActivation,   // 이만큼 수익 나야 트레일링 시작
                highWaterMark: entryPrice,      // BUY: 최고가 추적 / SELL: 최저가 추적
                activated: false                // 활성화 여부
            };
        }
    }
    
    const copyAccounts = getCopyAccounts();
    const effectiveContracts = contracts * copyAccounts;
    const tradeFee = RISK_CONFIG.tradeFeeRoundTrip * effectiveContracts;
    
    let confirmMsg = `${side} ${t('trading.confirm_entry','Enter position')}\n\n` +
        `${t('trading.product','Product')}: ${contract}\n` +
        `${t('trading.contracts','contracts')}: ${contracts}${t('trading.count_unit','')}` + (copyAccounts > 1 ? ` × ${copyAccounts}${t('trading.accounts','accounts')} = ${effectiveContracts}${t('trading.contracts_effective','contracts effective')}` : '') + `\n` +
        `${t('trading.order_type','Order')}: ${orderTypeText}\n` +
        `${t('trading.margin','Margin')}: $${requiredMargin.toLocaleString()}\n` +
        `${t('trading.per_point','Per point')}: $${multiplier * effectiveContracts}\n` +
        `${t('trading.fee','Fee')}: $${tradeFee.toFixed(2)}`;
    
    if (useSLTP) {
        confirmMsg += `\n\nSL: ${stopLoss.toFixed(2)}\nTP: ${takeProfit.toFixed(2)}`;
        if (trailingStop) {
            confirmMsg += `\n<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Trailing: ${trailingStop.distance}pt (${trailingStop.activation}pt ${t('trading.after_profit','after profit')})`;
        }
    }

    const crtdCfg = getCRTDConfig();
    confirmMsg += `\n\n── CRTD (${crtdCfg.tier}${t('trading.tier_label',' Tier')}) ──`;
    confirmMsg += `\n<i data-lucide="gem" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.entry_fee','Entry fee')}: ${crtdCfg.deposit} CRTD`;
    confirmMsg += `\n<i data-lucide="skull" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.liquidation','Liquidation')}: -$${crtdCfg.liquidation} | <i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.profit_convert','Conversion')}: +$${crtdCfg.profitThreshold}~`;

    confirmMsg += `\n\n${t('trading.confirm_execute','Execute?')}`;
    
    if (!await showConfirmModal(`${side} ${t('trading.position_entry','Enter position')}`, confirmMsg)) return;
    
    try {
        const trade = {
            contract: contract,
            side: side,
            contracts: contracts,
            copyAccounts: copyAccounts,
            effectiveContracts: effectiveContracts,
            orderType: orderType,
            entryPrice: entryPrice,
            currentPrice: currentPrice,
            multiplier: multiplier,
            margin: requiredMargin,
            stopLoss: stopLoss,
            takeProfit: takeProfit,
            trailingStop: trailingStop,
            
            
            fee: tradeFee,
            timestamp: new Date(),
            status: orderType === 'MARKET' ? 'open' : 'pending',
            pnl: 0
        };
        
        const trades = myParticipation.trades || [];
        trades.push(trade);
        
        const newBalance = myParticipation.currentBalance - requiredMargin;
        
        myParticipation.trades = trades;
        myParticipation.currentBalance = newBalance;
        await saveTradingState({ trades: trades, currentBalance: newBalance });

        const statusText = orderType === 'MARKET' ? t('trading.filled','Filled') : t('trading.accepted','Accepted');
        const copyLabel = copyAccounts > 1 ? ` (×${copyAccounts}${t('trading.accounts_suffix','accounts')})` : '';
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${side} ${t('trading.order','Order')} ${statusText}! ${contract} ${contracts}${t('trading.contracts','contracts')}${copyLabel} @ ${entryPrice.toFixed(2)}`, 'success');
        
        try { updateTradingUI(); updateOpenPositions(); updateRiskGaugeUI(); loadTradeHistory(); setTimeout(() => { drawPositionLinesLW(); scrollToLatest(); }, 1000); } catch(uiErr) { console.warn("UI update warning:", uiErr); }







    } catch (error) {
        showToast(t('trading.trade_failed','Trade failed: ') + error.message, 'error');
    }
}

// Quick chart trade (SLOT-based market order with default SL/TP)
async function quickChartTrade(side, contractOverride) {
    // console.log('<i data-lucide="search" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> quickChartTrade 호출:', side, 'myParticipation:', !!myParticipation, 'currentPrice:', currentPrice);
    // 더블클릭 방지 (3초) + UI 피드백
    if (window._quickTradeLoading) { showToast('<i data-lucide="hourglass" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('trading.order_processing','Processing order...'), 'warning', 1000); return; }
    window._quickTradeLoading = true;
    // BUY/SELL 버튼 임시 비활성화
    const btns = ['btn-buy','btn-sell','btn-chart-buy','btn-chart-sell'].map(id => document.getElementById(id)).filter(Boolean);
    btns.forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
    const unlockBtns = () => { window._quickTradeLoading = false; btns.forEach(b => { b.disabled = false; b.style.opacity = '1'; }); };
    setTimeout(unlockBtns, 3000);
    
    if (!myParticipation) {
        showToast(t('trading.join_first','Join a challenge first'), 'warning');
        return;
    }
    
    // ===== RISK CHECK =====
    if (myParticipation.dailyLocked) {
        const reason = myParticipation.adminSuspended 
            ? `<i data-lucide="ban" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Trading suspended by admin`
            : t('trading.daily_ended','<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Trading ended for today');
        showToast(reason, 'warning');
        return;
    }
    
    // ★ 탭 심볼을 직접 사용
    const contract = getActiveTabSymbol() || document.getElementById('futures-contract')?.value || 'MNQ';
    
    // ===== 상품별 권한 체크 (tradingTier) =====
    if (!isProductAllowed(contract)) {
        showToast(`<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${contract} ${t('trading.no_permission','No trading permission')}`, 'warning');
        return;
    }

    // 계약 수: 폼 입력 → 권한 검증 (CRTD 시스템: 슬롯 불필요)
    const tierMax = getMaxContracts(contract);
    const inputContracts = parseInt(document.getElementById('trade-contracts')?.value) || 1;
    const contracts = Math.min(inputContracts, tierMax);
    
    // 포지션 수 체크
    const maxPositions = myParticipation.maxPositions || 5;
    const openCount = (myParticipation.trades || []).filter(t => t.status === 'open').length;
    if (openCount >= maxPositions) {
        showToast(`<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.max_positions_reached',`Max ${maxPositions} simultaneous positions reached!`)}`, 'warning');
        return;
    }

    const multiplier = contract === 'NQ' ? 20 : 2;
    const margin = (contract === 'NQ' ? 15000 : 1500) * contracts;
    
    if (margin > myParticipation.currentBalance) {
        showToast(`${t('trading.insufficient_margin','Insufficient margin')} — ${t('trading.required','Required')}: $${margin.toLocaleString()}, ${t('trading.held','Held')}: $${myParticipation.currentBalance.toLocaleString()}`, 'warning');
        return;
    }
    
    // ★ SL/TP: 항상 폼에서 읽기 (기본: SL 50, TP 100)
    const slPoints = parseFloat(document.getElementById('stop-loss-points')?.value) || 50;
    const tpPoints = parseFloat(document.getElementById('take-profit-points')?.value) || 100;
    
    let stopLoss = null;
    let takeProfit = null;
    let trailingStop = null;
    
    if (slPoints > 0) {
        stopLoss = side === 'BUY' ? currentPrice - slPoints : currentPrice + slPoints;
    }
    if (tpPoints > 0) {
        takeProfit = side === 'BUY' ? currentPrice + tpPoints : currentPrice - tpPoints;
    }
    
    // 트레일링 스탑
    const useTrailing = document.getElementById('use-trailing-stop')?.checked;
    if (useTrailing && slPoints > 0) {
        trailingStop = {
            enabled: true, activated: false,
            activation: parseFloat(document.getElementById('trailing-activation')?.value) || 10,
            distance: parseFloat(document.getElementById('trailing-distance')?.value) || slPoints,
            highWaterMark: currentPrice,
        };
    }
    
    const copyAccounts = getCopyAccounts();
    const effectiveContracts = contracts * copyAccounts;
    const tradeFee = RISK_CONFIG.tradeFeeRoundTrip * effectiveContracts;
    
    try {
        const trade = {
            contract: contract,
            side: side,
            contracts: contracts,
            copyAccounts: copyAccounts,
            effectiveContracts: effectiveContracts,
            orderType: 'MARKET',
            entryPrice: currentPrice,
            currentPrice: currentPrice,
            multiplier: multiplier,
            margin: margin,
            stopLoss: stopLoss,
            takeProfit: takeProfit,
            trailingStop: trailingStop,
            
            
            fee: tradeFee,
            timestamp: new Date(),
            status: 'open',
            pnl: 0
        };
        
        const trades = myParticipation.trades || [];
        trades.push(trade);
        
        const newBalance = myParticipation.currentBalance - margin;
        
        myParticipation.trades = trades;
        myParticipation.currentBalance = newBalance;
        await saveTradingState({ trades: trades, currentBalance: newBalance });
        
        // console.log(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 차트 ${side} 주문 체결! 카피:${copyAccounts}, SL: ${stopLoss.toFixed(2)}, TP: ${takeProfit.toFixed(2)}`);
        
        try { updateTradingUI(); updateOpenPositions(); updateRiskGaugeUI(); setTimeout(() => { drawPositionLinesLW(); scrollToLatest(); }, 500); } catch(uiErr) { console.warn("UI update warning:", uiErr); }









    } catch (error) {
        showToast(t('trading.trade_failed','Trade failed: ') + error.message, 'error');
    }
}

// Lightweight Charts용 포지션 라인 그리기 (NQ + MNQ 양쪽)
// ─── 차트 내 규칙 오버레이 ───
function updateChartRulesOverlay() {
    const container = document.getElementById('live-candle-chart');
    if (!container || !myParticipation) return;
    
    // 기존 오버레이 제거
    const old = container.querySelector('.chart-rules-overlay');
    if (old) old.remove();
    
    const p = myParticipation;
    const cfg = getCRTDConfig();
    const tier = getTradingTier();
    const products = [];
    if (tier.MNQ > 0) products.push(`MNQ×${tier.MNQ}`);
    if (tier.NQ > 0) products.push(`NQ×${tier.NQ}`);
    
    const overlay = document.createElement('div');
    overlay.className = 'chart-rules-overlay';
    Object.assign(overlay.style, {
        position: 'absolute',
        top: '8px',
        left: '8px',
        zIndex: '50',
        background: '#3D2B1F',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        borderRadius: '8px',
        padding: '8px 12px',
        fontSize: '0.72rem',
        lineHeight: '1.6',
        color: '#E8E0D8',
        pointerEvents: 'none',
        maxWidth: '220px',
        border: '1px solid rgba(255,255,255,0.08)',
    });
    
    overlay.innerHTML = `
        <div style="font-weight:700; color:#8B6914; margin-bottom:3px; font-size:0.76rem;"><i data-lucide="gem" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${cfg.tier} · ${cfg.deposit} CRTD</div>
        <div><i data-lucide="bar-chart-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${products.join(' + ') || 'Not set'}</div>
        <div style="color:#B54534;"><i data-lucide="circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Daily -$${p.dailyLossLimit || 500}</div>
        <div style="color:#B54534;"><i data-lucide="skull" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Liq -$${cfg.liquidation.toLocaleString()}</div>
        <div style="color:#00cc66;"><i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Profit +$${cfg.profitThreshold.toLocaleString()}</div>
    `;
    
    container.style.position = 'relative';
    container.appendChild(overlay);
}

function drawPositionLinesLW() {
    // 항상 먼저 기존 라인 제거
    if (window.positionLines && window.candleSeries) {
        window.positionLines.forEach(line => {
            try { window.candleSeries.removePriceLine(line); } catch (e) { console.warn(e.message); }
        });
    }
    window.positionLines = [];
    
    if (!window.candleSeries || !myParticipation || !myParticipation.trades) return;
    
    // 현재 탭의 심볼에 해당하는 포지션만 표시
    const tabSymbol = getActiveTabSymbol();
    const openTrades = myParticipation.trades.filter(t => t.status === 'open' && t.contract === tabSymbol);
    
    if (openTrades.length === 0) return;
    
    openTrades.forEach((trade) => {
        const entryLine = window.candleSeries.createPriceLine({
            price: trade.entryPrice,
            color: trade.side === 'BUY' ? '#3D2B1F' : '#B54534',
            lineWidth: 2,
            lineStyle: LightweightCharts.LineStyle.Solid,
            axisLabelVisible: true,
            title: `${trade.side} ${trade.contract} ${trade.contracts}`,
        });
        window.positionLines.push(entryLine);
        
        if (trade.stopLoss) {
            const isTrailing = trade.trailingStop?.activated;
            const slLine = window.candleSeries.createPriceLine({
                price: trade.stopLoss,
                color: isTrailing ? '#C4841D' : '#B54534',
                lineWidth: 2,
                lineStyle: isTrailing ? LightweightCharts.LineStyle.SparseDotted : LightweightCharts.LineStyle.Dashed,
                axisLabelVisible: true,
                title: isTrailing ? '<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> TRAIL' : 'SL',
            });
            window.positionLines.push(slLine);
        }
        
        if (trade.takeProfit) {
            const tpLine = window.candleSeries.createPriceLine({
                price: trade.takeProfit,
                color: '#00cc00',
                lineWidth: 2,
                lineStyle: LightweightCharts.LineStyle.Dashed,
                axisLabelVisible: true,
                title: 'TP',
            });
            window.positionLines.push(tpLine);
        }
    });
    
    // console.log(`<i data-lucide="bar-chart-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${tabSymbol} ${openTrades.length}개 포지션 라인 표시`);
    
    // 드래그 핸들 업데이트
    updateDragHandles(openTrades);
}

// ─── SL/TP 드래그 이동 시스템 ───
(function initDragSystem() {
    let _dragState = null; // { handle, type, tradeIndex, startY, startPrice }
    
    window._sltpDragHandles = [];
    
    function getChartContainer() {
        return document.getElementById('live-candle-chart');
    }
    
    function coordToPrice(y) {
        if (!window.candleSeries) return null;
        const container = getChartContainer();
        if (!container) return null;
        const rect = container.getBoundingClientRect();
        const relY = y - rect.top;
        try {
            return window.candleSeries.coordinateToPrice(relY);
        } catch(e) { return null; }
    }
    
    function priceToCoord(price) {
        if (!window.candleSeries) return null;
        try {
            const coord = window.candleSeries.priceToCoordinate(price);
            return coord;
        } catch(e) { return null; }
    }
    
    function roundPrice(p) {
        return Math.round(p * 4) / 4; // 0.25 단위
    }
    
    function createHandle(type, trade, tradeIdx) {
        const container = getChartContainer();
        if (!container) return null;
        
        const price = type === 'sl' ? trade.stopLoss : trade.takeProfit;
        if (!price) return null;
        
        const y = priceToCoord(price);
        if (y === null || y === undefined) return null;
        
        const handle = document.createElement('div');
        handle.className = 'sltp-drag-handle';
        handle.dataset.type = type;
        handle.dataset.tradeIndex = tradeIdx;
        
        const color = type === 'sl' ? '#B54534' : '#00cc00';
        const isTrailing = type === 'sl' && trade.trailingStop?.activated;
        const displayColor = isTrailing ? '#C4841D' : color;
        
        const isMobile = window.innerWidth < 768;
        const handleW = isMobile ? '80px' : '60px';
        const handleH = isMobile ? '36px' : '24px';
        const fontSize = isMobile ? '12px' : '10px';
        
        Object.assign(handle.style, {
            position: 'absolute',
            right: '0px',
            top: (y - (isMobile ? 18 : 12)) + 'px',
            width: handleW,
            height: handleH,
            background: displayColor + '44',
            border: `2px solid ${displayColor}`,
            borderRadius: isMobile ? '6px' : '4px',
            cursor: 'ns-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: fontSize,
            fontFamily: 'Consolas, Monaco, monospace',
            fontWeight: '700',
            color: displayColor,
            zIndex: '100',
            userSelect: 'none',
            touchAction: 'none',
            WebkitUserSelect: 'none',
            transition: 'none',
            boxShadow: isMobile ? `0 0 6px ${displayColor}55` : 'none',
        });
        // 터치 영역 확장 (최소 44px 히트 영역)
        if (isMobile) {
            handle.style.minHeight = '44px';
            handle.style.padding = '0 6px';
        }
        handle.textContent = `☰ ${price.toFixed(2)}`;
        handle.title = `Drag to move ${type.toUpperCase()}`;
        
        container.style.position = 'relative';
        container.appendChild(handle);
        
        return handle;
    }
    
    window.updateDragHandles = function(openTrades) {
        // 기존 핸들 제거
        window._sltpDragHandles.forEach(h => h.remove());
        window._sltpDragHandles = [];
        
        if (!openTrades || !window.candleSeries) return;
        
        openTrades.forEach(trade => {
            const actualIndex = myParticipation.trades.indexOf(trade);
            
            const slHandle = createHandle('sl', trade, actualIndex);
            if (slHandle) window._sltpDragHandles.push(slHandle);
            
            const tpHandle = createHandle('tp', trade, actualIndex);
            if (tpHandle) window._sltpDragHandles.push(tpHandle);
        });
    };
    
    // 드래그 중 가격 라벨 (툴팁)
    let _dragLabel = null;
    function showDragLabel(container, y, price, type) {
        if (!_dragLabel) {
            _dragLabel = document.createElement('div');
            Object.assign(_dragLabel.style, {
                position: 'absolute',
                right: '65px',
                padding: '3px 8px',
                borderRadius: '3px',
                fontSize: '11px',
                fontFamily: 'Consolas, Monaco, monospace',
                fontWeight: '700',
                zIndex: '101',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
            });
            container.appendChild(_dragLabel);
        }
        const color = type === 'sl' ? '#B54534' : '#00cc00';
        _dragLabel.style.top = (y - 10) + 'px';
        _dragLabel.style.background = '#3D2B1F';
        _dragLabel.style.border = `1px solid ${color}`;
        _dragLabel.style.color = color;
        _dragLabel.textContent = `${type.toUpperCase()}: ${price.toFixed(2)}`;
        _dragLabel.style.display = 'block';
    }
    function hideDragLabel() {
        if (_dragLabel) { _dragLabel.style.display = 'none'; }
    }
    
    function onDragStart(e) {
        const handle = e.target.closest('.sltp-drag-handle');
        if (!handle) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const type = handle.dataset.type;
        const tradeIndex = parseInt(handle.dataset.tradeIndex);
        const trade = myParticipation.trades[tradeIndex];
        const startPrice = type === 'sl' ? trade.stopLoss : trade.takeProfit;
        
        _dragState = { handle, type, tradeIndex, startY: clientY, startPrice, currentPrice: startPrice };
        
        // 차트 스크롤/크로스헤어 비활성화
        if (window.lwChart) {
            window.lwChart.applyOptions({ handleScroll: false, handleScale: false });
        }
        
        // 모바일 햅틱 피드백
        if (navigator.vibrate) navigator.vibrate(30);
        
        handle.style.opacity = '0.95';
        handle.style.transform = 'scale(1.15)';
        handle.style.boxShadow = '0 0 12px ' + (type === 'sl' ? '#B54534aa' : '#00cc00aa');
    }
    
    function onDragMove(e) {
        if (!_dragState) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const newPrice = coordToPrice(clientY);
        if (newPrice === null) return;
        
        const rounded = roundPrice(newPrice);
        _dragState.currentPrice = rounded;
        
        const container = getChartContainer();
        const rect = container.getBoundingClientRect();
        const relY = clientY - rect.top;
        
        // 핸들 위치 업데이트
        const dragOffset = window.innerWidth < 768 ? 18 : 12;
        _dragState.handle.style.top = (relY - dragOffset) + 'px';
        _dragState.handle.textContent = `☰ ${rounded.toFixed(2)}`;
        
        // 라벨 표시
        showDragLabel(container, relY, rounded, _dragState.type);
        
        // 실시간으로 priceLine 업데이트
        updateDraggedPriceLine(_dragState.type, _dragState.tradeIndex, rounded);
    }
    
    function updateDraggedPriceLine(type, tradeIndex, newPrice) {
        const trade = myParticipation.trades[tradeIndex];
        if (!trade || !window.candleSeries) return;
        
        // 임시로 가격 변경 후 라인 다시 그리기 (성능을 위해 해당 라인만)
        if (type === 'sl') trade.stopLoss = newPrice;
        else trade.takeProfit = newPrice;
        
        // 전체 라인 다시 그리기 (간단하게)
        if (window.positionLines) {
            window.positionLines.forEach(line => {
                try { window.candleSeries.removePriceLine(line); } catch(e) { console.warn("[catch]", e); }
            });
        }
        window.positionLines = [];
        
        const tabSymbol = getActiveTabSymbol();
        const openTrades = myParticipation.trades.filter(t => t.status === 'open' && t.contract === tabSymbol);
        openTrades.forEach(t => {
            const entryLine = window.candleSeries.createPriceLine({
                price: t.entryPrice,
                color: t.side === 'BUY' ? '#3D2B1F' : '#B54534',
                lineWidth: 2, lineStyle: LightweightCharts.LineStyle.Solid,
                axisLabelVisible: true,
                title: `${t.side} ${t.contract} ${t.contracts}`,
            });
            window.positionLines.push(entryLine);
            if (t.stopLoss) {
                const isTrailing = t.trailingStop?.activated;
                window.positionLines.push(window.candleSeries.createPriceLine({
                    price: t.stopLoss,
                    color: isTrailing ? '#C4841D' : '#B54534',
                    lineWidth: 2,
                    lineStyle: isTrailing ? LightweightCharts.LineStyle.SparseDotted : LightweightCharts.LineStyle.Dashed,
                    axisLabelVisible: true, title: isTrailing ? '<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> TRAIL' : 'SL',
                }));
            }
            if (t.takeProfit) {
                window.positionLines.push(window.candleSeries.createPriceLine({
                    price: t.takeProfit,
                    color: '#00cc00', lineWidth: 2,
                    lineStyle: LightweightCharts.LineStyle.Dashed,
                    axisLabelVisible: true, title: 'TP',
                }));
            }
        });
    }
    
    async function onDragEnd(e) {
        if (!_dragState) return;
        
        e.preventDefault();
        
        const { type, tradeIndex, startPrice, currentPrice } = _dragState;
        const handle = _dragState.handle;
        
        // 차트 인터랙션 복원
        if (window.lwChart) {
            window.lwChart.applyOptions({ handleScroll: true, handleScale: true });
        }
        
        handle.style.opacity = '1';
        handle.style.transform = 'scale(1)';
        handle.style.boxShadow = 'none';
        hideDragLabel();
        
        // 저장 완료 햅틱
        if (navigator.vibrate && currentPrice !== startPrice) navigator.vibrate([20, 50, 20]);
        
        _dragState = null;
        
        // 가격이 변경되었으면 Firestore 저장
        if (currentPrice !== startPrice && currentPrice > 0) {
            try {
                if (type === 'sl') {
                    await updateTradeStopLoss(tradeIndex, currentPrice);
                    showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> SL → ${currentPrice.toFixed(2)}`, 'success');
                } else {
                    await updateTradeTakeProfit(tradeIndex, currentPrice);
                    showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> TP → ${currentPrice.toFixed(2)}`, 'success');
                }
                // UI 갱신
                drawPositionLinesLW();
                updateOpenPositions();
            } catch(err) {
                console.error('SL/TP 저장 실패:', err);
                // 원래 값 복원
                const trade = myParticipation.trades[tradeIndex];
                if (type === 'sl') trade.stopLoss = startPrice;
                else trade.takeProfit = startPrice;
                drawPositionLinesLW();
                showToast(`<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${type.toUpperCase()} ${t('trading.save_failed_short','Save failed')}`, 'error');
            }
        } else {
            // 변경 없음 - 라인 원복
            drawPositionLinesLW();
        }
    }
    
    // 이벤트 등록 (document 레벨)
    document.addEventListener('mousedown', onDragStart, { passive: false });
    document.addEventListener('mousemove', onDragMove, { passive: false });
    document.addEventListener('mouseup', onDragEnd, { passive: false });
    document.addEventListener('touchstart', onDragStart, { passive: false });
    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('touchend', onDragEnd, { passive: false });
    
    // 차트 크기 변경 시 핸들 위치 업데이트
    window.addEventListener('resize', () => {
        if (window._sltpDragHandles.length > 0) {
            drawPositionLinesLW();
        }
    });
    
    // crosshairMove로도 핸들 위치 싱크 (스크롤/줌 시)
    let _syncTimer = null;
    const origDrawPositionLines = window.drawPositionLinesLW || drawPositionLinesLW;
    // 차트 스크롤 시 핸들 위치 업데이트를 위해 주기적 체크
    setInterval(() => {
        if (!_dragState && window._sltpDragHandles.length > 0 && window.candleSeries) {
            window._sltpDragHandles.forEach(h => {
                const idx = parseInt(h.dataset.tradeIndex);
                const type = h.dataset.type;
                const trade = myParticipation?.trades?.[idx];
                if (!trade) return;
                const price = type === 'sl' ? trade.stopLoss : trade.takeProfit;
                if (!price) return;
                const y = priceToCoord(price);
                if (y !== null && y !== undefined) {
                    const offset = window.innerWidth < 768 ? 18 : 12;
                    h.style.top = (y - offset) + 'px';
                }
            });
        }
    }, 200);
    
    // console.log('<i data-lucide="target" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> SL/TP 드래그 시스템 초기화 완료');
})();

// 거래 제한 확인
function checkTradingLimits(contracts, contract) {
    if (!myParticipation) return false;
    
    const tierMax = contract ? getMaxContracts(contract) : 99;
    const maxPositions = myParticipation.maxPositions || 20;
    const maxDrawdown = myParticipation.maxDrawdown || 3000;
    
    // 계약 수 확인 (tradingTier 기반)
    if (contract && contracts > tierMax) {
        showToast(`<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${contract} ${t('trading.max_contracts',`Max ${tierMax} contracts allowed`)}`, 'warning');
        return false;
    }
    
    // 포지션 수 확인
    const openPositions = myParticipation.trades?.filter(t => t.status === 'open').length || 0;
    if (openPositions >= maxPositions) {
        showToast(`<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.max_positions_available',`Max ${maxPositions} positions allowed`)} (${t('trading.current','Current')}: ${openPositions}${t('trading.count_suffix','')})`, 'warning');
        return false;
    }
    
    // Drawdown 확인
    const initialBalance = myParticipation.initialBalance || 100000;
    const currentBalance = myParticipation.currentBalance || 100000;
    const drawdown = initialBalance - currentBalance;
    
    if (drawdown >= maxDrawdown) {
        showToast(`<i data-lucide="alert" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('trading.liquidation_reached','Liquidation threshold reached!')} ${t('trading.max_loss','Max loss')}: -$${maxDrawdown}, ${t('trading.current','Current')}: -$${drawdown.toFixed(2)}`, 'warning');
        return false;
    }
    
    return true;
}

// EOD 정산
async function processEOD() {
    if (!myParticipation) return;
    
    const totalPnL = myParticipation.currentBalance - myParticipation.initialBalance;
    const cfg = getCRTDConfig();
    
    // console.log(`<i data-lucide="bar-chart-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> EOD 정산: USD PnL = $${totalPnL.toFixed(2)} | 인출가능: ${getWithdrawableCRTD()} CRTD`);
    
    // lastEOD 업데이트
    await saveTradingState({
        lastEOD: new Date(),
        dailyPnL: totalPnL
    });
    
    updateCRTDDisplay();
}

// ========== POLYGON.IO 실시간 CME 데이터 ==========

let polygonWS = null;
let massiveReconnectAttempts = 0;
const MASSIVE_MAX_RECONNECT_DELAY = 60000; // 최대 60초

// Massive WebSocket 연결
function connectMassiveRealtime() {
    if (!window.MASSIVE_CONFIG || !window.MASSIVE_CONFIG.enabled) {
        // console.log('<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Massive 비활성화 - Yahoo Finance 사용');
        return;
    }
    
    const apiKey = window.MASSIVE_CONFIG.apiKey;
    
    if (apiKey === 'YOUR_POLYGON_API_KEY') {
        console.error('<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Massive API Key를 설정하세요!');
        return;
    }
    
    polygonWS = new WebSocket('wss://socket.polygon.io/futures');
    
    polygonWS.onopen = () => {
        massiveReconnectAttempts = 0; // 연결 성공 시 리셋
        // Massive connected
        
        // 인증
        polygonWS.send(JSON.stringify({
            action: 'auth',
            params: apiKey
        }));
    };
    
    polygonWS.onmessage = (event) => {
        const messages = JSON.parse(event.data);
        
        messages.forEach(msg => {
            if (msg.ev === 'status' && msg.status === 'auth_success') {
                // console.log('<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Massive 인증 성공');
                
                // NQ 선물 구독
                polygonWS.send(JSON.stringify({
                    action: 'subscribe',
                    params: 'AM.C:NQ*' // NQ 전체 (1분, 5분 등)
                }));
                
                // console.log('<i data-lucide="bar-chart-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> NQ 선물 구독 완료');
            }
            
            if (msg.ev === 'AM') {
                // Aggregate Minute (1분봉)
                handleMassiveAggregate(msg);
            }
        });
    };
    
    polygonWS.onerror = (error) => {
        console.error('<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Massive 연결 오류:', error);
    };
    
    polygonWS.onclose = () => {
        massiveReconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, massiveReconnectAttempts), MASSIVE_MAX_RECONNECT_DELAY);
        console.warn(`<i data-lucide="power" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Massive 연결 종료 — ${delay/1000}초 후 재연결 (시도 #${massiveReconnectAttempts})`);
        setTimeout(() => connectMassiveRealtime(), delay);
    };
}

// Massive 데이터 처리
function handleMassiveAggregate(data) {
    if (!window.candleSeries) return;
    
    const candle = {
        time: Math.floor(data.s / 1000), // 밀리초 → 초
        open: data.o,
        high: data.h,
        low: data.l,
        close: data.c
    };
    
    // 차트 업데이트
    window.candleSeries.update(candle);
    
    // 현재가 업데이트
    currentPrice = data.c;
    updateNQPriceDisplay();
    updateOpenPositions();
    
    // console.log(`<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Massive 실시간: ${data.c.toFixed(2)}`);
}

// Massive REST API로 히스토리 데이터
async function fetchMassiveHistory() {
    if (!window.MASSIVE_CONFIG || !window.MASSIVE_CONFIG.enabled) {
        return null;
    }
    
    const apiKey = window.MASSIVE_CONFIG.apiKey;
    
    try {
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const url = `/api/market/candles?ticker=C:NQ&from=${startDate}&to=${endDate}&timespan=5min`;

        const response = await fetch(url);
        const data = await response.json();
        
        if (data.results) {
            const candles = data.results.map(r => ({
                time: Math.floor(r.t / 1000),
                open: r.o,
                high: r.h,
                low: r.l,
                close: r.c
            }));
            
            const volume = data.results.map(r => ({
                time: Math.floor(r.t / 1000),
                value: r.v,
                color: r.c > r.o ? '#26a69a' : '#ef5350'
            }));
            
            // console.log('<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Massive 히스토리 데이터:', candles.length, '개');
            
            return { candles, volume };
        }
    } catch (error) {
        console.error('<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Massive 히스토리 로드 실패:', error);
    }
    
    return null;
}

// ========== PENDING ORDER EXECUTION ==========
// 지정가/스탑/스탑리밋 주문 체결 로직 (매 틱마다 호출)
async function checkPendingOrders() {
    if (!myParticipation || !myParticipation.trades || !currentPrice || currentPrice < 1000) return;
    
    let filled = false;
    
    for (let i = 0; i < myParticipation.trades.length; i++) {
        const trade = myParticipation.trades[i];
        if (trade.status !== 'pending') continue;
        
        let shouldFill = false;
        let fillPrice = trade.entryPrice;
        
        switch (trade.orderType) {
            case 'LIMIT':
                if (trade.side === 'BUY' && currentPrice <= trade.entryPrice) {
                    shouldFill = true;
                    fillPrice = trade.entryPrice;
                } else if (trade.side === 'SELL' && currentPrice >= trade.entryPrice) {
                    shouldFill = true;
                    fillPrice = trade.entryPrice;
                }
                break;
                
            case 'STOP':
                if (trade.side === 'BUY' && currentPrice >= trade.entryPrice) {
                    shouldFill = true;
                    fillPrice = currentPrice; // 스탑은 시장가로 체결
                } else if (trade.side === 'SELL' && currentPrice <= trade.entryPrice) {
                    shouldFill = true;
                    fillPrice = currentPrice;
                }
                break;
                
            case 'STOP_LIMIT':
                // stopPrice 도달 시 리밋 주문으로 전환
                const stopPrice = trade._stopPrice || trade.entryPrice;
                const limitPrice = trade._limitPrice || trade.entryPrice;
                
                if (!trade._stopTriggered) {
                    // 스탑 트리거 체크
                    if (trade.side === 'BUY' && currentPrice >= stopPrice) {
                        trade._stopTriggered = true;
                        trade.entryPrice = limitPrice; // 리밋가로 전환
                        // console.log(`⚡ STOP_LIMIT 트리거: BUY @ ${limitPrice.toFixed(2)}`);
                    } else if (trade.side === 'SELL' && currentPrice <= stopPrice) {
                        trade._stopTriggered = true;
                        trade.entryPrice = limitPrice;
                        // console.log(`⚡ STOP_LIMIT 트리거: SELL @ ${limitPrice.toFixed(2)}`);
                    }
                } else {
                    // 리밋 체결 체크
                    if (trade.side === 'BUY' && currentPrice <= limitPrice) {
                        shouldFill = true;
                        fillPrice = limitPrice;
                    } else if (trade.side === 'SELL' && currentPrice >= limitPrice) {
                        shouldFill = true;
                        fillPrice = limitPrice;
                    }
                }
                break;
        }
        
        if (shouldFill) {
            trade.status = 'open';
            trade.entryPrice = fillPrice;
            trade.currentPrice = currentPrice;
            trade.filledAt = new Date();
            filled = true;
            
            // console.log(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 주문 체결: ${trade.side} ${trade.contract} ×${trade.contracts} @ ${fillPrice.toFixed(2)} (${trade.orderType})`);
            showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${trade.orderType} ${t('trading.order_filled','Order filled!')} ${trade.side} ${trade.contract} ×${trade.contracts} @ ${fillPrice.toFixed(2)}`, 'success');
        }
    }
    
    if (filled) {
        try {
            await saveTradingState({ trades: myParticipation.trades });
        } catch (e) { console.error('주문 체결 저장 실패:', e); }
        
        updateTradingUI();
        updateOpenPositions();
        drawPositionLinesLW();
    }
}
