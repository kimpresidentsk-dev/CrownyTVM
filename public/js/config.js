// ===== config.js - 전역변수, 토큰설정, 슬롯/리스크 =====
// Cache Buster - Version 5.4 - Copy Trading + Fee Display + Trading Tier
// Global State
var currentUser = null;
var userWallet = null;
var useIndependentDB = true; // CrownyTVM 독립 서버 모드 (Firebase 실패 시 자동 활성화)

// currentUser 설정 시 window/auth에도 동기화
function syncCurrentUser(user) {
    currentUser = user;
    window.currentUser = user;
    if (window.auth) window.auth.currentUser = user;
}

// ========== Crowny Network 토큰 설정 ==========
const CROWNY_TOKENS = {
    CRN: { get name() { return t('config.token_crn','Crowny'); }, symbol: 'CRN', priceKRW: 25500 },
    FNC: { get name() { return t('config.token_fnc','Phone'); }, symbol: 'FNC', priceKRW: 2550 },
    CRM: { get name() { return t('config.token_crm','Mom'); }, symbol: 'CRM', priceKRW: 25.5 }
};

const RISK_CONFIG = {
    dailyLossLimit: -500,      // 일일 손실 한도 ($)
    cumulativeLossLimit: -3000, // 누적 손실 한도 ($) - HTML 규칙과 일치
    tradeFeeRoundTrip: 2.00,   // 왕복 수수료 ($)
    mnqTickValue: 0.50,        // MNQ 1틱 가치 ($)
    mnqPointValue: 2,          // MNQ 1포인트 가치 ($)
    nqPointValue: 20           // NQ 1포인트 가치 ($)
};

// ========== RISK MANAGEMENT ==========

// 일일 손실 리셋 체크 (자정 UTC 기준)
function checkDailyReset() {
    if (!myParticipation) return;
    
    const now = new Date();
    const todayUTC = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const lastReset = myParticipation.lastDailyReset || '';
    
    if (lastReset !== todayUTC) {
        // 새로운 날 → 일일 손실 리셋
        myParticipation.dailyPnL = 0;
        myParticipation.dailyLocked = false;
        myParticipation.lastDailyReset = todayUTC;
        
        // 서버 API 업데이트
        saveTradingState({ dailyPnL: 0, dailyLocked: false, lastDailyReset: todayUTC });
        
        console.log('<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('config.daily_loss_reset','Daily loss reset (new day)'));
    }
}

// 리스크 게이지 UI 업데이트
function updateRiskGaugeUI() {
    if (!myParticipation) return;
    
    const dailyPnL = myParticipation.dailyPnL || 0;
    const initial = myParticipation.initialBalance || 100000;
    const current = myParticipation.currentBalance || 100000;
    const cumulativePnL = current - initial;
    
    // 일일 손실 게이지 (참가자별 한도 사용)
    const actualDailyLimit = Math.abs(myParticipation.dailyLossLimit || RISK_CONFIG.dailyLossLimit);
    const actualCumulativeLimit = Math.abs(myParticipation.maxDrawdown || RISK_CONFIG.cumulativeLossLimit);
    
    const dailyPercent = Math.min(Math.abs(Math.min(dailyPnL, 0)) / actualDailyLimit * 100, 100);
    const dailyBar = document.getElementById('daily-loss-bar');
    const dailyText = document.getElementById('daily-loss-text');
    
    if (dailyBar) {
        dailyBar.style.width = dailyPercent + '%';
        dailyBar.style.background = dailyPercent >= 100 ? '#B54534' : dailyPercent >= 80 ? '#C4841D' : '#5A9A6E';
    }
    if (dailyText) {
        dailyText.textContent = `$${dailyPnL.toFixed(0)} / -$${actualDailyLimit}`;
        dailyText.style.color = dailyPnL < 0 ? '#B54534' : '#5A9A6E';
    }
    
    // 누적 손실 게이지 (참가자별 한도 사용)
    const cumulativePercent = Math.min(Math.abs(Math.min(cumulativePnL, 0)) / actualCumulativeLimit * 100, 100);
    const cumulativeBar = document.getElementById('cumulative-loss-bar');
    const cumulativeText = document.getElementById('cumulative-loss-text');
    
    if (cumulativeBar) {
        cumulativeBar.style.width = cumulativePercent + '%';
        cumulativeBar.style.background = cumulativePercent >= 100 ? '#B54534' : cumulativePercent >= 80 ? '#C4841D' : '#5A9A6E';
    }
    if (cumulativeText) {
        cumulativeText.textContent = `$${cumulativePnL.toFixed(0)} / -$${actualCumulativeLimit.toLocaleString()}`;
        cumulativeText.style.color = cumulativePnL < 0 ? '#B54534' : '#5A9A6E';
    }
    
    // 일일 한도 경고
    const warningEl = document.getElementById('daily-limit-warning');
    if (warningEl) {
        warningEl.style.display = (myParticipation.dailyLocked) ? 'block' : 'none';
    }
    
    // 버튼 활성/비활성
    updateTradeButtonState();
}

// 거래 버튼 상태 관리
function updateTradeButtonState() {
    const locked = myParticipation && myParticipation.dailyLocked;
    // CRTD 기반 시스템: CRNY 슬롯 체크 제거 (참가 = 100 CRTD 입금)
    const disabled = locked;
    
    const btnBuy = document.getElementById('btn-buy');
    const btnSell = document.getElementById('btn-sell');
    const btnChartBuy = document.getElementById('btn-chart-buy');
    const btnChartSell = document.getElementById('btn-chart-sell');
    
    [btnBuy, btnSell, btnChartBuy, btnChartSell].forEach(btn => {
        if (!btn) return;
        btn.disabled = disabled;
        btn.style.opacity = disabled ? '0.4' : '1';
        btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
    });
    
    if (locked && btnBuy) {
        btnBuy.innerHTML = '<i data-lucide="alert-triangle"></i> ' + t('config.trading_stopped','Trading suspended');
        btnSell.innerHTML = '<i data-lucide="alert-triangle"></i> ' + t('config.trading_stopped','Trading suspended');
    } else if (btnBuy) {
        btnBuy.innerHTML = '<i data-lucide="trending-up"></i> BUY';
        btnSell.innerHTML = '<i data-lucide="trending-down"></i> SELL';
    }
    
    // CLOSE/FLATTEN 버튼은 포지션이 있을 때만 활성
    const hasPositions = myParticipation?.trades?.some(t => t.status === 'open');
    const btnClose = document.getElementById('btn-close-last');
    const btnFlatten = document.getElementById('btn-flatten');
    
    [btnClose, btnFlatten].forEach(btn => {
        if (!btn) return;
        btn.disabled = !hasPositions;
        btn.style.opacity = hasPositions ? '1' : '0.4';
        btn.style.cursor = hasPositions ? 'pointer' : 'not-allowed';
    });
}

// 일일 손실 체크 & 락 처리 (dailyPnL은 호출자가 이미 업데이트)
async function checkDailyLossLimit() {
    if (!myParticipation) return false;
    
    // 서버에서 최신 한도/상태 동기화 (관리자 변경 반영)
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        if (token) {
            const res = await fetch('/api/trading/participation', { headers: { 'Authorization': 'Bearer ' + token } });
            const data = await res.json();
            const fresh = data?.participation;
            if (fresh) {
                if (fresh.dailyLossLimit !== undefined) myParticipation.dailyLossLimit = Math.abs(fresh.dailyLossLimit);
                if (fresh.maxDrawdown !== undefined) myParticipation.maxDrawdown = Math.abs(fresh.maxDrawdown);
                if (fresh.defaultSL !== undefined) myParticipation.defaultSL = fresh.defaultSL;
                if (fresh.defaultTP !== undefined) myParticipation.defaultTP = fresh.defaultTP;
                if (fresh.dailyLocked === false && myParticipation.dailyLocked === true) {
                    myParticipation.dailyLocked = false;
                    myParticipation.adminSuspended = false;
                    if (fresh.dailyPnL !== undefined) myParticipation.dailyPnL = fresh.dailyPnL;
                }
                if (fresh.dailyLocked === true) myParticipation.dailyLocked = true;
                if (fresh.adminSuspended === true) { myParticipation.dailyLocked = true; myParticipation.adminSuspended = true; }
                if (fresh.dailyLocked === false && fresh.adminSuspended === false) { myParticipation.dailyLocked = false; myParticipation.adminSuspended = false; }
            }
        }
    } catch (e) { console.warn(t('config.sync_fail','Sync failed') + ':', e); }
    
    // 참가자별 일일 한도 사용 (없으면 전역 RISK_CONFIG 사용)
    // ⚠️ Math.abs 필수: 음수로 저장된 경우 이중부정 방지
    const limitValue = Math.abs(myParticipation.dailyLossLimit || RISK_CONFIG.dailyLossLimit);
    const dailyLimit = -limitValue;
    
    if (myParticipation.dailyPnL <= dailyLimit) {
        myParticipation.dailyLocked = true;
        
        // 서버 API 업데이트
        await saveTradingState({ dailyPnL: myParticipation.dailyPnL, dailyLocked: true });
        
        updateRiskGaugeUI();
        showToast(`<i data-lucide="alert-octagon"></i> ${t('config.daily_limit_reached','Daily loss limit reached!')} (-$${limitValue})`, 'warning');
        return true; // locked
    }
    
    // 서버 API에 dailyPnL 업데이트
    await saveTradingState({ dailyPnL: myParticipation.dailyPnL });
    
    updateRiskGaugeUI();
    return false;
}

// 누적 청산 체크 (CRTD 기반 — CRNY 소각 제거됨)
async function checkCumulativeLiquidation() {
    if (!myParticipation) return false;
    
    const initial = myParticipation.initialBalance || 100000;
    const current = myParticipation.currentBalance || 100000;
    const cumulativeLoss = current - initial;
    
    if (cumulativeLoss <= -Math.abs(myParticipation.maxDrawdown || RISK_CONFIG.cumulativeLossLimit)) {
        // CRTD 청산은 checkCRTDLiquidation()에서 처리
        // 누적 손실 리셋 (계좌 다시 시작)
        myParticipation.currentBalance = initial;
        myParticipation.dailyPnL = 0;
        
        await saveTradingState({ currentBalance: initial, dailyPnL: 0 });
        
        updateRiskGaugeUI();
        updateTradingUI();
        
        showToast(`<i data-lucide="skull" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('config.cumulative_loss','Cumulative loss')} -$${Math.abs(RISK_CONFIG.cumulativeLossLimit).toLocaleString()} ${t('config.reached','reached')}!`, 'error');
        
        return true;
    }
    
    return false;
}

// Auth State Listener
auth.onAuthStateChanged(async (user) => {
    // Landing State Update (Jamie)
    if (typeof updateLandingState === 'function') {
        updateLandingState(user);
    }

    if (user) {
        currentUser = user;
        _loginInitDone = true;
        useIndependentDB = false; // Firebase 인증 성공 → Firebase DB 사용
        // document.getElementById('auth-modal').style.display = 'none'; // handled by updateLandingState
        document.getElementById('user-email').textContent = user.email;
        document.getElementById('user-info').style.display = 'block';
        
        // 관리자 레벨 로드 (실패해도 로그인 계속 진행)
        try {
            await loadUserLevel();
        } catch (e) {
            console.error('[Config] ' + t('config.admin_level_fail','Admin level load failed - continuing') + ':', e);
            window.currentUserLevel = -1;
        }
        
        // 권한별 메뉴 가시성 적용
        if (typeof applyMenuVisibility === 'function') applyMenuVisibility(currentUserLevel);
        
        // ★ 동적 토큰 레지스트리 로드
        if (typeof loadTokenRegistry === 'function') await loadTokenRegistry();
        
        // ★ 비율 로드
        if (typeof loadExchangeRate === 'function') await loadExchangeRate();
        
        // 관리자 메뉴 표시 (레벨 1 이상)
        if (currentUserLevel >= 1) {
            const adminNav = document.getElementById('admin-nav-item');
            if (adminNav) adminNav.style.display = 'block';
        }
        
        // 등록 버튼 표시 (레벨 2 이상)
        if (typeof updateAdminRegisterButtons === 'function') updateAdminRegisterButtons();
        
        if (typeof loadUserWallet === 'function') await loadUserWallet();
        if (typeof startOffchainListener === 'function') startOffchainListener();
        if (typeof loadUserData === 'function') await loadUserData();
        
        // ★ 알림 시스템 초기화
        if (typeof initNotifications === 'function') initNotifications();
        
        // ★ FCM 푸시 알림 권한 요청
        if (typeof requestNotificationPermission === 'function') requestNotificationPermission();
        
        // ★ 현재 보이는 섹션이 prop-trading이면 자동 로드
        const activePage = document.querySelector('.page.active');
        if (activePage && activePage.id === 'prop-trading') {
            if (typeof loadTradingDashboard === 'function') loadTradingDashboard();
        }
        
        // ★ 대시보드를 기본 랜딩 페이지로
        if (typeof showPage === 'function') showPage('today');
        
        // ★ 검색 캐시 로드
        if (typeof loadSearchCache === 'function') loadSearchCache();
        
        // ★ AI 도우미 초기화
        if (typeof AI_ASSISTANT !== 'undefined') AI_ASSISTANT.init();
        
        // ★ 초대 시스템 초기화
        if (typeof INVITE !== 'undefined') INVITE.init();
    } else {
        // Firebase 인증 없음 → CrownyTVM 토큰으로 독립 모드 시도
        const ctvmTk = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        if (ctvmTk) {
            try {
                const r = await fetch('/api/profile', { headers: { 'Authorization': 'Bearer ' + ctvmTk } });
                const profile = await r.json();
                if (profile && !profile.error) {
                    syncCurrentUser({ uid: profile.username, email: profile.username + '@crowny.org', displayName: profile.displayName || profile.username, photoURL: profile.photoURL || '' });
                    useIndependentDB = true;
                    // 메신저용 username 보장
                    localStorage.setItem('crowny_username', profile.username);
                    console.log('[Config] ' + t('config.independent_mode','CrownyTVM independent mode activated') + ':', currentUser.email);

                    document.getElementById('user-email').textContent = currentUser.email;
                    document.getElementById('user-info').style.display = 'block';

                    if (typeof updateLandingState === 'function') updateLandingState(currentUser);

                    // 관리자 메뉴 표시
                    if (profile.isAdmin) {
                        ctvmShowAdminMenu();
                    }

                    if (typeof loadUserData === 'function') await loadUserData();
                    if (typeof showPage === 'function') showPage('today');
                    if (typeof loadSearchCache === 'function') loadSearchCache();
                    return; // 독립 모드 초기화 완료
                }
            } catch (e) { console.warn('[Config] ' + t('config.profile_load_fail','CrownyTVM profile load failed') + ':', e.message); }
        }

        // Jamie: Landing 페이지 활성화를 위해 자동 모달 팝업 제거
        // document.getElementById('auth-modal').style.display = 'flex';
        document.getElementById('user-info').style.display = 'none';
        // 관리자 메뉴 숨기기
        const adminNav = document.getElementById('admin-nav-item');
        if (adminNav) adminNav.style.display = 'none';
        if (typeof updateAdminRegisterButtons === 'function') updateAdminRegisterButtons();
    }
});

// CrownyTVM API 로그인 성공 콜백 (auth.js에서 호출)
var _loginInitDone = false;
// ═══ CrownyTVM 관리자 메뉴 공통 ═══
function ctvmShowAdminMenu() {
    window.currentUserLevel = 6;
    const adminNav = document.getElementById('admin-nav-item');
    if (adminNav) adminNav.style.display = 'block';
    if (typeof applyMenuVisibility === 'function') applyMenuVisibility(2);
    console.log('[Config] ' + t('config.admin_menu_activated','Admin menu activated'));
}

async function ctvmCheckAdmin() {
    const tk = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    if (!tk) return;
    try {
        const r = await fetch('/api/profile', { headers: { 'Authorization': 'Bearer ' + tk } });
        const p = await r.json();
        if (p && !p.error) window.ctvmMe = p;
        if (p && p.isAdmin) ctvmShowAdminMenu();
    } catch(e) { console.warn('[Config] ' + t('config.admin_check_fail','Admin check failed') + ':', e.message); }
}

async function onLoginSuccess(data) {
    if (_loginInitDone) return; // onAuthStateChanged에서 이미 처리됨
    _loginInitDone = true;
    if (!currentUser || currentUser.uid !== data.username) {
        syncCurrentUser({ uid: data.username, email: (data.email || data.username + '@crowny.org'), displayName: data.displayName || data.username, photoURL: data.photoURL || '' });
    }
    useIndependentDB = true;
    console.log('[Config] onLoginSuccess → ' + t('config.independent_mode_short','independent mode') + ':', currentUser.email);

    document.getElementById('user-email').textContent = currentUser.email;
    document.getElementById('user-info').style.display = 'block';

    if (typeof updateLandingState === 'function') updateLandingState(currentUser);

    // 관리자 메뉴 표시
    await ctvmCheckAdmin();

    if (typeof showToast === 'function') showToast(t('auth.login_success', 'Login successful'), 'success');
    if (typeof loadUserData === 'function') await loadUserData();
    if (typeof showPage === 'function') showPage('today');
}

// Signup
