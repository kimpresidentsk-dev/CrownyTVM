// ===== Emergency Dashboard Fallback =====
// 최소한의 동작 보장용 간단 버전

function loadDashboardEmergency() {
    console.log('[Emergency Dashboard] 시작');
    
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
                대시보드
            </h2>
            <div style="background: #FFF8F0; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid var(--gold);">
                <p style="margin: 0; color: #3D2B1F;">
                    <i data-lucide="user" style="width:16px;height:16px;vertical-align:middle;"></i>
                    환영합니다! 크라우니 대시보드입니다.
                </p>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 30px;">
                <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h4 style="margin: 0 0 10px 0; color: var(--accent);">
                        <i data-lucide="wallet" style="width:16px;height:16px;vertical-align:middle;"></i>
                        지갑
                    </h4>
                    <button onclick="showPage('wallet')" style="background: var(--gold); color: #FFF8F0; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                        지갑으로 이동
                    </button>
                </div>
                
                <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h4 style="margin: 0 0 10px 0; color: var(--accent);">
                        <i data-lucide="bar-chart" style="width:16px;height:16px;vertical-align:middle;"></i>
                        트레이딩
                    </h4>
                    <button onclick="showPage('prop-trading')" style="background: var(--gold); color: #FFF8F0; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                        트레이딩 시작
                    </button>
                </div>
                
                <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h4 style="margin: 0 0 10px 0; color: var(--accent);">
                        <i data-lucide="users" style="width:16px;height:16px;vertical-align:middle;"></i>
                        소셜
                    </h4>
                    <button onclick="showPage('social')" style="background: var(--gold); color: #FFF8F0; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                        소셜로 이동
                    </button>
                </div>
                
                <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h4 style="margin: 0 0 10px 0; color: var(--accent);">
                        <i data-lucide="palette" style="width:16px;height:16px;vertical-align:middle;"></i>
                        아트
                    </h4>
                    <button onclick="showPage('art')" style="background: var(--gold); color: #FFF8F0; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                        아트로 이동
                    </button>
                </div>
            </div>
            
            <p style="margin-top: 30px; color: #888; font-size: 0.9em;">
                <i data-lucide="info" style="width:14px;height:14px;vertical-align:middle;"></i>
                상세 정보는 각 섹션에서 확인하실 수 있습니다.
            </p>
        </div>
    `;
    
    // Lucide 아이콘 활성화
    if (window.lucide) {
        lucide.createIcons();
    }
    
    console.log('[Emergency Dashboard] 로딩 완료');
}

// 일반 대시보드가 실패하면 emergency 버전 실행
window.loadDashboardEmergency = loadDashboardEmergency;