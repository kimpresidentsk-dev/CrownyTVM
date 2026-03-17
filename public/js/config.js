// ===== config.js - 전역변수, 토큰설정, 슬롯/리스크 =====
// Cache Buster - Version 5.4 - Copy Trading + Fee Display + Trading Tier
// Global State
var currentUser = null;
var userWallet = null;

// ========== POLYGON ERC-20 토큰 컨트랙트 ==========
const POLYGON_TOKENS = {
    crny: {
        name: 'CRNY (크라우니코인)',
        address: '0xe56173b6a57680286253566B9C80Fcc175c88bE1',
        decimals: 18,
        symbol: 'CRNY'
    },
    fnc: {
        name: 'FNC (포네크레딧)',
        address: '0x68E3aA1049F583C2f1701fefc4443e398ebF32ee',
        decimals: 18,
        symbol: 'FNC'
    },
    crfn: {
        name: 'CRFN (크라우니포네)',
        address: '0x396DAd0C7625a4881cA0cd444Cd80A9bbce4A054',
        decimals: 18,
        symbol: 'CRFN'
    }
};

// ERC-20 최소 ABI (조회 + 전송)
const ERC20_ABI = [
    { "constant": true, "inputs": [{"name": "_owner", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "balance", "type": "uint256"}], "type": "function" },
    { "constant": false, "inputs": [{"name": "_to", "type": "address"},{"name": "_value", "type": "uint256"}], "name": "transfer", "outputs": [{"name": "", "type": "bool"}], "type": "function" },
    { "constant": true, "inputs": [], "name": "decimals", "outputs": [{"name": "", "type": "uint8"}], "type": "function" },
    { "constant": true, "inputs": [], "name": "symbol", "outputs": [{"name": "", "type": "string"}], "type": "function" }
];

const RISK_CONFIG = {
    dailyLossLimit: -500,      // 일일 손실 한도 ($)
    cumulativeLossLimit: -3000, // 누적 손실 한도 ($) - HTML 규칙과 일치
    tradeFeeRoundTrip: 2.00,   // 왕복 수수료 ($)
    mnqTickValue: 0.50,        // MNQ 1틱 가치 ($)
    mnqPointValue: 2,          // MNQ 1포인트 가치 ($)
    nqPointValue: 20           // NQ 1포인트 가치 ($)
};

// (CRNY 슬롯 시스템 제거됨 — CRTD 기반으로 전환)
function updateSlotStatusUI() { /* no-op: CRNY 슬롯 제거됨 */ }
function calculateSlots() { return 0; /* deprecated */ }

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
        
        // Firestore 업데이트
        if (myParticipation.challengeId && myParticipation.participantId) {
            db.collection('prop_challenges').doc(myParticipation.challengeId)
                .collection('participants').doc(myParticipation.participantId)
                .update({
                    dailyPnL: 0,
                    dailyLocked: false,
                    lastDailyReset: todayUTC
                }).catch(err => console.error('Daily reset error:', err));
        }
        
        console.log('<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 일일 손실 리셋 (새로운 날)');
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
        dailyBar.style.background = dailyPercent >= 100 ? '#B54534' : dailyPercent >= 80 ? '#C4841D' : '#6B8F3C';
    }
    if (dailyText) {
        dailyText.textContent = `$${dailyPnL.toFixed(0)} / -$${actualDailyLimit}`;
        dailyText.style.color = dailyPnL < 0 ? '#B54534' : '#6B8F3C';
    }
    
    // 누적 손실 게이지 (참가자별 한도 사용)
    const cumulativePercent = Math.min(Math.abs(Math.min(cumulativePnL, 0)) / actualCumulativeLimit * 100, 100);
    const cumulativeBar = document.getElementById('cumulative-loss-bar');
    const cumulativeText = document.getElementById('cumulative-loss-text');
    
    if (cumulativeBar) {
        cumulativeBar.style.width = cumulativePercent + '%';
        cumulativeBar.style.background = cumulativePercent >= 100 ? '#B54534' : cumulativePercent >= 80 ? '#C4841D' : '#6B8F3C';
    }
    if (cumulativeText) {
        cumulativeText.textContent = `$${cumulativePnL.toFixed(0)} / -$${actualCumulativeLimit.toLocaleString()}`;
        cumulativeText.style.color = cumulativePnL < 0 ? '#B54534' : '#6B8F3C';
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
        btnBuy.innerHTML = '<i data-lucide="alert-triangle"></i> ' + t('config.trading_stopped','거래 정지');
        btnSell.innerHTML = '<i data-lucide="alert-triangle"></i> ' + t('config.trading_stopped','거래 정지');
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
    
    // Firestore에서 최신 한도/상태 동기화 (관리자 변경 반영)
    try {
        const freshDoc = await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId).get();
        if (freshDoc.exists) {
            const fresh = freshDoc.data();
            // 관리자가 변경 가능한 필드만 동기화
            if (fresh.dailyLossLimit !== undefined) {
                myParticipation.dailyLossLimit = Math.abs(fresh.dailyLossLimit);
                // 음수로 저장된 경우 자동 수정
                if (fresh.dailyLossLimit < 0) {
                    db.collection('prop_challenges').doc(myParticipation.challengeId)
                        .collection('participants').doc(myParticipation.participantId)
                        .update({ dailyLossLimit: Math.abs(fresh.dailyLossLimit) }).catch(() => {});
                    console.log(`⚠️ dailyLossLimit 음수 자동 수정: ${fresh.dailyLossLimit} → ${Math.abs(fresh.dailyLossLimit)}`);
                }
            }
            if (fresh.maxDrawdown !== undefined) {
                myParticipation.maxDrawdown = Math.abs(fresh.maxDrawdown);
                if (fresh.maxDrawdown < 0) {
                    db.collection('prop_challenges').doc(myParticipation.challengeId)
                        .collection('participants').doc(myParticipation.participantId)
                        .update({ maxDrawdown: Math.abs(fresh.maxDrawdown) }).catch(() => {});
                    console.log(`⚠️ maxDrawdown 음수 자동 수정: ${fresh.maxDrawdown} → ${Math.abs(fresh.maxDrawdown)}`);
                }
            }
            if (fresh.defaultSL !== undefined) myParticipation.defaultSL = fresh.defaultSL;
            if (fresh.defaultTP !== undefined) myParticipation.defaultTP = fresh.defaultTP;
            
            // 관리자가 잠금 해제 + PnL 초기화한 경우 동기화
            if (fresh.dailyLocked === false && myParticipation.dailyLocked === true) {
                myParticipation.dailyLocked = false;
                myParticipation.adminSuspended = false;
                // PnL도 서버 값으로 동기화 (관리자가 0으로 리셋했을 수 있음)
                if (fresh.dailyPnL !== undefined) {
                    myParticipation.dailyPnL = fresh.dailyPnL;
                }
                console.log('🔓 관리자 잠금 해제 감지 → 동기화 완료');
            }
            
            if (fresh.dailyLocked === true && !myParticipation.dailyLocked) {
                myParticipation.dailyLocked = true; // 관리자가 잠금
            }
            if (fresh.adminSuspended === true) {
                myParticipation.dailyLocked = true;
                myParticipation.adminSuspended = true;
            }
            // 관리자가 잠금 해제한 경우
            if (fresh.dailyLocked === false && fresh.adminSuspended === false) {
                myParticipation.dailyLocked = false;
                myParticipation.adminSuspended = false;
            }
        }
    } catch (e) { console.warn('동기화 실패:', e); }
    
    // 참가자별 일일 한도 사용 (없으면 전역 RISK_CONFIG 사용)
    // ⚠️ Math.abs 필수: 음수로 저장된 경우 이중부정 방지
    const limitValue = Math.abs(myParticipation.dailyLossLimit || RISK_CONFIG.dailyLossLimit);
    const dailyLimit = -limitValue;
    
    if (myParticipation.dailyPnL <= dailyLimit) {
        myParticipation.dailyLocked = true;
        
        // Firestore 업데이트
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({
                dailyPnL: myParticipation.dailyPnL,
                dailyLocked: true
            });
        
        updateRiskGaugeUI();
        showToast(`<i data-lucide="alert-octagon"></i> ${t('config.daily_limit_reached','일일 손실 한도 도달!')} (-$${limitValue})`, 'warning');
        return true; // locked
    }
    
    // Firestore에 dailyPnL만 업데이트
    await db.collection('prop_challenges').doc(myParticipation.challengeId)
        .collection('participants').doc(myParticipation.participantId)
        .update({ dailyPnL: myParticipation.dailyPnL });
    
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
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({
                currentBalance: initial,
                dailyPnL: 0
            });
        
        updateRiskGaugeUI();
        updateTradingUI();
        
        showToast(`<i data-lucide="skull" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('config.cumulative_loss','누적 손실')} -$${Math.abs(RISK_CONFIG.cumulativeLossLimit).toLocaleString()} ${t('config.reached','도달')}!`, 'error');
        
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
        // document.getElementById('auth-modal').style.display = 'none'; // handled by updateLandingState
        document.getElementById('user-email').textContent = user.email;
        document.getElementById('user-info').style.display = 'block';
        
        // 관리자 레벨 로드 (실패해도 로그인 계속 진행)
        try {
            await loadUserLevel();
        } catch (e) {
            console.error('[Config] 관리자 레벨 로드 실패 - 계속 진행:', e);
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
        // Jamie: Landing 페이지 활성화를 위해 자동 모달 팝업 제거
        // document.getElementById('auth-modal').style.display = 'flex'; 
        document.getElementById('user-info').style.display = 'none';
        // 관리자 메뉴 숨기기
        const adminNav = document.getElementById('admin-nav-item');
        if (adminNav) adminNav.style.display = 'none';
        if (typeof updateAdminRegisterButtons === 'function') updateAdminRegisterButtons();
    }
});

// Signup
