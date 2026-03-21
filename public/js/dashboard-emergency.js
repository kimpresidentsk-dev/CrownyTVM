// ===== Emergency Dashboard Fallback =====
// 최소한의 동작 보장용 간단 버전

function loadDashboardEmergency() {
    console.log('[Emergency Dashboard] ' + t('emergency.starting','Starting'));
    
    const container = document.getElementById('dashboard-content');
    if (!container) {
        console.error('[Emergency] Container not found');
        return;
    }
    
    // 즉시 기본 UI 표시
    container.innerHTML = `
        <div style="padding: 20px; text-align: center;">
            <h2 style="color: var(--gold); margin-bottom: 20px;">
                <i data-lucide="home" style="width:20px;height:20px;vertical-align:middle;"></i>
                ${t('emergency.dashboard','Dashboard')}
            </h2>
            <div style="background: #FFF8F0; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid var(--gold);">
                <p style="margin: 0; color: #3D2B1F;">
                    <i data-lucide="user" style="width:16px;height:16px;vertical-align:middle;"></i>
                    ${t('emergency.welcome_msg','Welcome! This is the Crowny dashboard.')}
                </p>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 30px;">
                <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h4 style="margin: 0 0 10px 0; color: var(--accent);">
                        <i data-lucide="wallet" style="width:16px;height:16px;vertical-align:middle;"></i>
                        ${t('emergency.wallet','Wallet')}
                    </h4>
                    <button onclick="showPage('wallet')" style="background: var(--gold); color: #FFF8F0; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                        ${t('emergency.go_wallet','Go to Wallet')}
                    </button>
                </div>

                <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h4 style="margin: 0 0 10px 0; color: var(--accent);">
                        <i data-lucide="bar-chart" style="width:16px;height:16px;vertical-align:middle;"></i>
                        ${t('emergency.trading','Trading')}
                    </h4>
                    <button onclick="showPage('prop-trading')" style="background: var(--gold); color: #FFF8F0; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                        ${t('emergency.start_trading','Start Trading')}
                    </button>
                </div>

                <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h4 style="margin: 0 0 10px 0; color: var(--accent);">
                        <i data-lucide="users" style="width:16px;height:16px;vertical-align:middle;"></i>
                        ${t('emergency.social','Social')}
                    </h4>
                    <button onclick="showPage('social')" style="background: var(--gold); color: #FFF8F0; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                        ${t('emergency.go_social','Go to Social')}
                    </button>
                </div>

                <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h4 style="margin: 0 0 10px 0; color: var(--accent);">
                        <i data-lucide="palette" style="width:16px;height:16px;vertical-align:middle;"></i>
                        ${t('emergency.art','Art')}
                    </h4>
                    <button onclick="showPage('art')" style="background: var(--gold); color: #FFF8F0; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                        ${t('emergency.go_art','Go to Art')}
                    </button>
                </div>
            </div>

            <p style="margin-top: 30px; color: #888; font-size: 0.9em;">
                <i data-lucide="info" style="width:14px;height:14px;vertical-align:middle;"></i>
                ${t('emergency.detail_info','Detailed information is available in each section.')}
            </p>
        </div>
    `;
    
    // Lucide 아이콘 활성화
    if (window.lucide) {
        lucide.createIcons();
    }
    
    console.log('[Emergency Dashboard] ' + t('emergency.load_complete','Loading complete'));
}

// 일반 대시보드가 실패하면 emergency 버전 실행
window.loadDashboardEmergency = loadDashboardEmergency;