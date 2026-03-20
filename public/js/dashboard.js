// ===== dashboard.js v1.1 - 대시보드 페이지 (방어적 로딩 + 안정화) =====

// Firebase 쿼리 타임아웃 헬퍼
async function withTimeout(promise, timeoutMs = 5000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), timeoutMs)
        )
    ]);
}

async function loadDashboard() {
    console.log('[Dashboard] 로딩 시작 v1.2');
    
    // currentUser가 아직 없으면 firebase에서 직접 가져오기
    if (!currentUser && window.auth && auth.currentUser) {
        currentUser = auth.currentUser;
        console.log('[Dashboard] currentUser를 auth.currentUser에서 복구:', currentUser.email);
    }
    
    // 그래도 없으면 짧게 대기 (페이지 새로고침 시 auth 복원 대기)
    if (!currentUser && window.auth) {
        console.log('[Dashboard] auth 상태 대기 중...');
        const container = document.getElementById('dashboard-content');
        if (container) container.innerHTML = '<p style="text-align:center;padding:2rem;color:#6B5744;">로딩 중...</p>';
        
        const user = await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(null), 8000);
            const unsub = auth.onAuthStateChanged((u) => {
                clearTimeout(timeout);
                unsub();
                resolve(u);
            });
        });
        if (user) currentUser = user;
    }
    
    // CrownyTVM 토큰 로그인 지원 (Firebase 없는 환경)
    const ctvmTk = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    if (!currentUser && ctvmTk) {
        try {
            const r = await fetch('/api/profile', { headers: { 'Authorization': 'Bearer ' + ctvmTk } });
            const profile = await r.json();
            if (profile && !profile.error) {
                currentUser = { uid: profile.username, email: profile.username + '@crowny.org', displayName: profile.displayName || profile.username };
                console.log('[Dashboard] CrownyTVM 토큰으로 인증:', currentUser.email);
            }
        } catch (e) { console.warn('[Dashboard] CrownyTVM 프로필 로드 실패:', e.message); }
    }

    if (!currentUser) {
        console.warn('[Dashboard] currentUser 없음 - 로그인 필요');
        const container = document.getElementById('dashboard-content');
        if (container) {
            container.innerHTML = `<div style="text-align:center;padding:2rem;color:#3D2B1F;">
                <h3 style="color:#3D2B1F;">로그인이 필요합니다</h3>
                <button onclick="document.getElementById('auth-modal').style.display='flex'" style="background:#3D2B1F;color:#FFF8F0;border:none;padding:0.8rem 1.5rem;border-radius:6px;margin-top:1rem;cursor:pointer;">로그인</button>
            </div>`;
        }
        return;
    }
    
    const container = document.getElementById('dashboard-content');
    if (!container) {
        console.error('[Dashboard] dashboard-content 컨테이너 없음');
        return;
    }
    
    // 초기 로딩 표시
    container.innerHTML = `<p style="text-align:center;padding:2rem;color:#3D2B1F;"><i data-lucide="loader" style="width:16px;height:16px;display:inline-block;vertical-align:middle;animation:spin 1s linear infinite;"></i> 대시보드 로딩 중...</p>`;
    if (window.lucide) lucide.createIcons();
    
    // 데이터 수집 변수들 (기본값으로 초기화)
    let userData = {};
    let nickname = 'Guest';
    let photoURL = '';
    let recentTx = [];
    let recentOrders = [];
    let recentSocial = [];
    let totalUsers = '—';
    let totalTx = '—';
    
    // 토큰 잔고 (항상 표시 가능하도록)
    const offchain = (userWallet && userWallet.offchainBalances) || {};
    const onchain = (userWallet && userWallet.balances) || { crny: 0, fnc: 0, crfn: 0 };
    console.log('[Dashboard] 토큰 잔고 준비됨:', { offchain, onchain });
    
    try {
    // 1. 사용자 데이터 로딩 (기본값 이미 설정됨)
    console.log('[Dashboard] Step 1: 사용자 데이터 로딩 중...');
    try {
        if (window.db) {
            const userDoc = await withTimeout(
                db.collection('users').doc(currentUser.uid).get(),
                5000
            );
            if (userDoc.exists) {
                userData = userDoc.data() || {};
                nickname = userData.nickname || userData.displayName || currentUser.email?.split('@')[0] || 'Guest';
                photoURL = userData.photoURL || '';
                console.log('[Dashboard] 사용자 데이터 로드 완료:', { nickname, hasPhoto: !!photoURL });
            } else {
                nickname = currentUser.email?.split('@')[0] || 'Guest';
                console.log('[Dashboard] 새 사용자 - 기본 닉네임 사용:', nickname);
            }
        } else {
            console.warn('[Dashboard] Firestore DB 없음 - 기본 닉네임 사용');
            nickname = currentUser.email?.split('@')[0] || 'Guest';
        }
    } catch (e) {
        console.warn('[Dashboard] 사용자 데이터 로드 실패 (계속 진행):', e.message);
        nickname = currentUser.email?.split('@')[0] || 'Guest';
        photoURL = '';
    }
    
    // 2. 최근 활동 데이터 (병렬 로딩 + 실패 시 빈 배열)
    console.log('[Dashboard] Step 2: 최근 활동 병렬 로딩 중...');
    const activityPromises = [];
    
    // 거래 내역 쿼리 (단순화: orderBy 제거하고 limit만 사용)
    if (window.db) {
        activityPromises.push(
            withTimeout(
                db.collection('transactions')
                    .where('userId', '==', currentUser.uid)
                    .limit(5).get()
                    .then(snap => ({ type: 'tx', data: snap.docs.map(d => ({ id: d.id, ...d.data() })) }))
                    .catch(e => {
                        console.warn('[Dashboard] 거래 내역 쿼리 실패:', e.message);
                        return { type: 'tx', data: [] };
                    }),
                5000
            )
        );
        
        // 주문 내역 쿼리 (단순화)
        activityPromises.push(
            withTimeout(
                db.collection('orders')
                    .where('buyerId', '==', currentUser.uid)
                    .limit(3).get()
                    .then(snap => ({ type: 'orders', data: snap.docs.map(d => ({ id: d.id, ...d.data() })) }))
                    .catch(e => {
                        console.warn('[Dashboard] 주문 내역 쿼리 실패:', e.message);
                        return { type: 'orders', data: [] };
                    }),
                5000
            )
        );
        
        // 소셜 알림 쿼리 (단순화)
        activityPromises.push(
            withTimeout(
                db.collection('social_notifications')
                    .where('targetUid', '==', currentUser.uid)
                    .limit(5).get()
                    .then(snap => ({ type: 'social', data: snap.docs.map(d => ({ id: d.id, ...d.data() })) }))
                    .catch(e => {
                        console.warn('[Dashboard] 소셜 알림 쿼리 실패:', e.message);
                        return { type: 'social', data: [] };
                    }),
                5000
            )
        );
        
        // 통계 데이터 쿼리
        activityPromises.push(
            withTimeout(
                db.collection('admin_config').doc('stats').get()
                    .then(statsDoc => {
                        if (statsDoc.exists) {
                            const s = statsDoc.data();
                            return { type: 'stats', data: { totalUsers: s.totalUsers || '—', totalTx: s.totalTransactions || '—' } };
                        } else {
                            return { type: 'stats', data: { totalUsers: '—', totalTx: '—' } };
                        }
                    })
                    .catch(e => {
                        console.warn('[Dashboard] 통계 쿼리 실패:', e.message);
                        return { type: 'stats', data: { totalUsers: '—', totalTx: '—' } };
                    }),
                5000
            )
        );
        
        // 모든 쿼리 병렬 실행
        try {
            const results = await Promise.allSettled(activityPromises);
            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    const { type, data } = result.value;
                    switch (type) {
                        case 'tx':
                            recentTx = data;
                            console.log('[Dashboard] 거래 내역:', recentTx.length, '건');
                            break;
                        case 'orders':
                            recentOrders = data;
                            console.log('[Dashboard] 주문 내역:', recentOrders.length, '건');
                            break;
                        case 'social':
                            recentSocial = data;
                            console.log('[Dashboard] 소셜 알림:', recentSocial.length, '건');
                            break;
                        case 'stats':
                            totalUsers = data.totalUsers;
                            totalTx = data.totalTx;
                            console.log('[Dashboard] 통계 로드 완료:', data);
                            break;
                    }
                } else {
                    console.warn('[Dashboard] 쿼리 실패:', result.reason?.message || 'Unknown error');
                }
            });
        } catch (e) {
            console.warn('[Dashboard] 병렬 쿼리 처리 중 에러:', e.message);
        }
    } else {
        console.warn('[Dashboard] Firestore DB 없음 - 활동 데이터 스킵');
    }
    
    // 3. 알림 데이터 (로컬)
    console.log('[Dashboard] Step 3: 알림 데이터 준비 중...');
    const unread = (typeof window.unreadCount !== 'undefined') ? window.unreadCount : 0;
    const recentNotifs = (typeof window.notifications !== 'undefined') ? window.notifications.slice(0, 3) : [];
    console.log('[Dashboard] 알림:', { unread, recentNotifs: recentNotifs.length });
    
    // 4. 트레이딩 포지션 확인
    console.log('[Dashboard] Step 4: 트레이딩 포지션 확인 중...');
    let positionSummary = '';
    if (typeof window.myParticipation !== 'undefined' && window.myParticipation) {
        const pos = window.myParticipation;
        console.log('[Dashboard] 트레이딩 포지션 발견:', pos);
        positionSummary = `
            <div style="background:#FFF8F0;padding:1.2rem;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid #E8E0D8;">
                <h4 style="margin-bottom:0.8rem;font-size:0.95rem;color:#3D2B1F;"><i data-lucide="bar-chart-3" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> 트레이딩 포지션</h4>
                <p style="color:#3D2B1F;margin:0.5rem 0;">잔고: <strong style="color:#3D2B1F;">$${(pos.balance || 0).toLocaleString()}</strong></p>
                <p style="color:#3D2B1F;margin:0.5rem 0;">수익: <strong style="color:${(pos.totalPnl || 0) >= 0 ? '#6B8F3C' : '#B54534'}">$${(pos.totalPnl || 0).toFixed(2)}</strong></p>
                <button onclick="showPage('prop-trading')" style="padding:0.5rem 1rem;border:1px solid #E8E0D8;border-radius:8px;background:#F7F3ED;cursor:pointer;font-size:0.85rem;transition:background 0.15s;color:#3D2B1F;margin-top:0.5rem;">→ 트레이딩으로</button>
            </div>`;
    } else {
        console.log('[Dashboard] 트레이딩 포지션 없음');
    }
    
    console.log('[Dashboard] Step 5: HTML 생성 중...');
    
    // Build HTML (하드코딩된 색상 사용)
    container.innerHTML = `
        <div style="display:flex;align-items:center;gap:1rem;padding:1.5rem;background:#F7F3ED;border-radius:16px;margin-bottom:1.5rem;">
            <div>
                ${photoURL ? `<img src="${photoURL}" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:3px solid #8B6914;" loading="lazy">` : '<div style="width:60px;height:60px;border-radius:50%;background:#E8E0D8;display:flex;align-items:center;justify-content:center;font-size:1.8rem;">👤</div>'}
            </div>
            <div>
                <h2 style="color:#3D2B1F;margin:0;">환영합니다, ${nickname}!</h2>
                <p style="font-size:0.85rem;color:#8B6914;margin:0.3rem 0 0 0;">크라우니에서의 활동을 한눈에 확인하세요</p>
            </div>
        </div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;" class="dashboard-grid">
            <!-- Token Portfolio -->
            <div style="grid-column:1/-1;background:#FFF8F0;padding:1.2rem;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid #E8E0D8;">
                <h4 style="margin-bottom:0.8rem;font-size:0.95rem;color:#3D2B1F;"><i data-lucide="gem" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 토큰 포트폴리오</h4>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:0.6rem;">
                    <div style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem;border-radius:10px;background:#F7F3ED;cursor:pointer;transition:transform 0.15s;border:1px solid #E8E0D8;" onclick="showPage('wallet')">
                        <span style="font-size:1.4rem;display:flex;align-items:center;"><i data-lucide="coins" style="width:20px;height:20px;color:#8B6914;"></i></span>
                        <div><strong style="font-size:1rem;color:#3D2B1F;">CRNY</strong><br><span style="font-size:1rem;color:#8B6914;font-weight:700;">${Number(onchain.crny || 0).toLocaleString()}</span></div>
                    </div>
                    <div style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem;border-radius:10px;background:#F7F3ED;cursor:pointer;transition:transform 0.15s;border:1px solid #E8E0D8;" onclick="showPage('wallet')">
                        <span style="font-size:1.4rem;display:flex;align-items:center;"><i data-lucide="target" style="width:20px;height:20px;color:#8B6914;"></i></span>
                        <div><strong style="font-size:1rem;color:#3D2B1F;">FNC</strong><br><span style="font-size:1rem;color:#8B6914;font-weight:700;">${Number(onchain.fnc || 0).toLocaleString()}</span></div>
                    </div>
                    <div style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem;border-radius:10px;background:#F7F3ED;cursor:pointer;transition:transform 0.15s;border:1px solid #E8E0D8;" onclick="showPage('wallet')">
                        <span style="font-size:1.4rem;display:flex;align-items:center;"><i data-lucide="link" style="width:20px;height:20px;color:#8B6914;"></i></span>
                        <div><strong style="font-size:1rem;color:#3D2B1F;">CRFN</strong><br><span style="font-size:1rem;color:#8B6914;font-weight:700;">${Number(onchain.crfn || 0).toLocaleString()}</span></div>
                    </div>
                    ${Object.entries(window.OFFCHAIN_TOKENS || {}).map(([key, tok]) => {
                        const iconMap = { CRTD: 'trending-up', CRAC: 'palette', CRGC: 'shopping-bag', CREB: 'leaf' };
                        const lucideIcon = iconMap[key] || 'circle';
                        return `
                        <div style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem;border-radius:10px;background:#F7F3ED;cursor:pointer;transition:transform 0.15s;border:1px solid #E8E0D8;" onclick="showPage('wallet')">
                            <span style="font-size:1.4rem;display:flex;align-items:center;"><i data-lucide="${lucideIcon}" style="width:20px;height:20px;color:#8B6914;"></i></span>
                            <div><strong style="font-size:1rem;color:#3D2B1F;">${key}</strong><br><span style="font-size:1rem;color:#8B6914;font-weight:700;">${Number(offchain[key] || 0).toLocaleString()}</span></div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
            
            <!-- Recent Activity -->
            <div style="background:#FFF8F0;padding:1.2rem;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid #E8E0D8;">
                <h4 style="margin-bottom:0.8rem;font-size:0.95rem;color:#3D2B1F;">📋 최근 활동</h4>
                ${recentTx.length === 0 && recentOrders.length === 0 ? `<p style="font-size:0.85rem;color:#8B6914;text-align:center;padding:0.5rem 0;">최근 활동이 없습니다</p>` : ''}
                ${recentTx.map(tx => `<div style="display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid #E8E0D8;font-size:0.85rem;color:#3D2B1F;">
                    <span>${tx.type === 'send' ? '📤' : '📥'} ${tx.tokenKey || 'CRNY'}</span>
                    <span>${Number(tx.amount || 0).toLocaleString()}</span>
                </div>`).join('')}
                ${recentOrders.map(o => `<div style="display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid #E8E0D8;font-size:0.85rem;color:#3D2B1F;">
                    <span><i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${o.productTitle || '주문'}</span>
                    <span>${o.status || ''}</span>
                </div>`).join('')}
            </div>
            
            <!-- Notifications -->
            <div style="background:#FFF8F0;padding:1.2rem;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid #E8E0D8;">
                <h4 style="margin-bottom:0.8rem;font-size:0.95rem;color:#3D2B1F;"><i data-lucide="bell" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> 알림 <span style="background:#e94560;color:#FFF8F0;font-size:0.75rem;padding:0.1rem 0.5rem;border-radius:10px;font-weight:700;">${unread}</span></h4>
                ${recentNotifs.length === 0 ? `<p style="font-size:0.85rem;color:#8B6914;text-align:center;padding:0.5rem 0;">새 알림 없음</p>` : ''}
                ${recentNotifs.map(n => `<div style="padding:0.4rem 0;font-size:0.85rem;border-bottom:1px solid #E8E0D8;color:#3D2B1F;${n.read ? '' : 'font-weight:600;'}">${n.message || n.text || ''}</div>`).join('')}
            </div>
            
            <!-- Quick Shortcuts -->
            <div style="background:#FFF8F0;padding:1.2rem;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid #E8E0D8;">
                <h4 style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.8rem;font-size:0.95rem;color:#3D2B1F;">
                    <span>⚡ 빠른 바로가기</span>
                    <button onclick="editShortcuts()" style="background:none;border:none;cursor:pointer;font-size:1rem;opacity:0.6;color:#3D2B1F;" title="편집"><i data-lucide="pencil" style="width:14px;height:14px;"></i></button>
                </h4>
                <div style="display:flex;flex-wrap:wrap;gap:0.5rem;" id="dash-shortcuts-container">
                    ${renderShortcuts()}
                </div>
            </div>
            
            <!-- Crowny Stats -->
            <div style="background:#FFF8F0;padding:1.2rem;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid #E8E0D8;">
                <h4 style="margin-bottom:0.8rem;font-size:0.95rem;color:#3D2B1F;"><i data-lucide="trending-up" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> 크라우니 통계</h4>
                <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #E8E0D8;font-size:0.9rem;color:#3D2B1F;">
                    <span>전체 사용자</span>
                    <strong>${totalUsers}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;padding:0.5rem 0;font-size:0.9rem;color:#3D2B1F;">
                    <span>전체 거래</span>
                    <strong>${totalTx}</strong>
                </div>
            </div>
            
            ${positionSummary}
            
            <!-- Invite Friends Card -->
            <div style="background:#3D2B1F;color:#FFF8F0;padding:1.2rem;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                <h4 style="color:#8B6914;margin-bottom:0.8rem;font-size:0.95rem;">🎉 친구 초대</h4>
                <p style="font-size:0.85rem;opacity:0.9;margin-bottom:0.8rem;color:#FFF8F0;">친구를 초대하고 CRTD 리워드를 받으세요!</p>
                <button onclick="if(typeof INVITE!=='undefined')INVITE.showInviteModal()" style="width:100%;padding:0.7rem;background:#8B6914;color:#FFF8F0;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.9rem;">
                    📨 친구 초대하기
                </button>
            </div>
        </div>
    `;
    // 모바일 반응형 CSS 추가
    if (!document.getElementById('dashboard-mobile-styles')) {
        const style = document.createElement('style');
        style.id = 'dashboard-mobile-styles';
        style.textContent = `
            @media (max-width: 768px) {
                .dashboard-grid {
                    grid-template-columns: 1fr !important;
                    gap: 0.8rem !important;
                }
                .dashboard-grid > div[style*="grid-column:1/-1"] {
                    grid-column: 1 !important;
                }
                .dashboard-grid > div[style*="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))"] {
                    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)) !important;
                }
            }
            @media (max-width: 480px) {
                .dashboard-grid > div[style*="grid-template-columns:repeat(auto-fill"] {
                    grid-template-columns: repeat(2, 1fr) !important;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Lucide 아이콘 렌더링
    if (window.lucide) lucide.createIcons();
    console.log('[Dashboard] 로딩 성공 완료');
    } catch(e) {
        console.error('[Dashboard] 로딩 중 치명적 에러:', e);
        
        // 개선된 fallback UI - 토큰 잔고와 기본 기능은 제공
        container.innerHTML = `<div style="text-align:center;padding:2rem;">
            <div style="display:flex;align-items:center;gap:1rem;padding:1.5rem;background:#F7F3ED;border-radius:16px;margin-bottom:1.5rem;justify-content:center;">
                <div>
                    ${photoURL ? `<img src="${photoURL}" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:3px solid #8B6914;" loading="lazy">` : '<div style="width:60px;height:60px;border-radius:50%;background:#E8E0D8;display:flex;align-items:center;justify-content:center;font-size:1.8rem;">👤</div>'}
                </div>
                <div style="text-align:left;">
                    <h2 style="color:#3D2B1F;margin:0;"><i data-lucide="bar-chart-3" style="width:20px;height:20px;display:inline-block;vertical-align:middle;"></i> DASHBOARD</h2>
                    <p style="margin:0.3rem 0 0 0;color:#8B6914;font-size:0.85rem;">환영합니다, ${nickname}님!</p>
                </div>
            </div>
            
            <!-- 토큰 잔고는 항상 표시 -->
            <div style="background:#FFF8F0;padding:1.2rem;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid #E8E0D8;margin-bottom:1.5rem;text-align:left;">
                <h4 style="margin-bottom:0.8rem;font-size:0.95rem;color:#3D2B1F;"><i data-lucide="gem" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 토큰 포트폴리오</h4>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:0.6rem;">
                    <div style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem;border-radius:10px;background:#F7F3ED;cursor:pointer;border:1px solid #E8E0D8;" onclick="showPage('wallet')">
                        <span style="font-size:1.4rem;"><i data-lucide="coins" style="width:20px;height:20px;color:#8B6914;"></i></span>
                        <div><strong style="font-size:1rem;color:#3D2B1F;">CRNY</strong><br><span style="font-size:1rem;color:#8B6914;font-weight:700;">${Number(onchain.crny || 0).toLocaleString()}</span></div>
                    </div>
                    <div style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem;border-radius:10px;background:#F7F3ED;cursor:pointer;border:1px solid #E8E0D8;" onclick="showPage('wallet')">
                        <span style="font-size:1.4rem;"><i data-lucide="target" style="width:20px;height:20px;color:#8B6914;"></i></span>
                        <div><strong style="font-size:1rem;color:#3D2B1F;">FNC</strong><br><span style="font-size:1rem;color:#8B6914;font-weight:700;">${Number(onchain.fnc || 0).toLocaleString()}</span></div>
                    </div>
                    <div style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem;border-radius:10px;background:#F7F3ED;cursor:pointer;border:1px solid #E8E0D8;" onclick="showPage('wallet')">
                        <span style="font-size:1.4rem;"><i data-lucide="link" style="width:20px;height:20px;color:#8B6914;"></i></span>
                        <div><strong style="font-size:1rem;color:#3D2B1F;">CRFN</strong><br><span style="font-size:1rem;color:#8B6914;font-weight:700;">${Number(onchain.crfn || 0).toLocaleString()}</span></div>
                    </div>
                    ${Object.entries(window.OFFCHAIN_TOKENS || {}).map(([key, tok]) => {
                        const iconMap = { CRTD: 'trending-up', CRAC: 'palette', CRGC: 'shopping-bag', CREB: 'leaf' };
                        const lucideIcon = iconMap[key] || 'circle';
                        return `
                        <div style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem;border-radius:10px;background:#F7F3ED;cursor:pointer;border:1px solid #E8E0D8;" onclick="showPage('wallet')">
                            <span style="font-size:1.4rem;"><i data-lucide="${lucideIcon}" style="width:20px;height:20px;color:#8B6914;"></i></span>
                            <div><strong style="font-size:1rem;color:#3D2B1F;">${key}</strong><br><span style="font-size:1rem;color:#8B6914;font-weight:700;">${Number(offchain[key] || 0).toLocaleString()}</span></div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
            
            <!-- 빠른 바로가기 -->
            <div style="background:#F7F3ED;border-radius:12px;padding:1.5rem;margin-bottom:1.5rem;text-align:left;">
                <h4 style="color:#3D2B1F;margin-bottom:1rem;"><i data-lucide="zap" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> 빠른 바로가기</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                    <button onclick="showPage('wallet')" style="background:#FFF8F0;border:1px solid #E8E0D8;border-radius:8px;padding:1rem;cursor:pointer;display:flex;align-items:center;gap:0.5rem;color:#3D2B1F;font-weight:600;font-size:0.9rem;transition:all 0.2s;">
                        <i data-lucide="coins" style="width:18px;height:18px;color:#8B6914;"></i> WALLET
                    </button>
                    <button onclick="showPage('social')" style="background:#FFF8F0;border:1px solid #E8E0D8;border-radius:8px;padding:1rem;cursor:pointer;display:flex;align-items:center;gap:0.5rem;color:#3D2B1F;font-weight:600;font-size:0.9rem;transition:all 0.2s;">
                        <i data-lucide="camera" style="width:18px;height:18px;color:#8B6914;"></i> SOCIAL
                    </button>
                    <button onclick="showPage('mall')" style="background:#FFF8F0;border:1px solid #E8E0D8;border-radius:8px;padding:1rem;cursor:pointer;display:flex;align-items:center;gap:0.5rem;color:#3D2B1F;font-weight:600;font-size:0.9rem;transition:all 0.2s;">
                        <i data-lucide="shopping-cart" style="width:18px;height:18px;color:#8B6914;"></i> MALL
                    </button>
                    <button onclick="showPage('prop-trading')" style="background:#FFF8F0;border:1px solid #E8E0D8;border-radius:8px;padding:1rem;cursor:pointer;display:flex;align-items:center;gap:0.5rem;color:#3D2B1F;font-weight:600;font-size:0.9rem;transition:all 0.2s;">
                        <i data-lucide="trending-up" style="width:18px;height:18px;color:#8B6914;"></i> TRADING
                    </button>
                </div>
            </div>
            
            <!-- 에러 정보 및 재시도 -->
            <div style="background:linear-gradient(135deg,#3D2B1F,#6B5744);color:#FFF8F0;border-radius:12px;padding:1.2rem;margin-bottom:1rem;">
                <h4 style="color:#8B6914;margin-bottom:0.5rem;"><i data-lucide="info" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> 대시보드 로딩 실패</h4>
                <p style="font-size:0.85rem;opacity:0.9;margin-bottom:0.8rem;">일부 데이터를 불러오지 못했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해보세요.</p>
                <div style="display:flex;gap:0.5rem;justify-content:center;">
                    <button onclick="loadDashboard()" style="background:#8B6914;color:#FFF8F0;border:none;border-radius:6px;padding:0.7rem 1.2rem;cursor:pointer;font-weight:600;font-size:0.85rem;display:flex;align-items:center;gap:0.3rem;">
                        <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> 다시 시도
                    </button>
                    <button onclick="location.reload()" style="background:transparent;color:#FFF8F0;border:1px solid #FFF8F0;border-radius:6px;padding:0.7rem 1.2rem;cursor:pointer;font-weight:600;font-size:0.85rem;">
                        전체 새로고침
                    </button>
                </div>
            </div>
            
            <!-- 디버그 정보 (개발용) -->
            <div style="background:#FFF8F0;border:1px solid #E8E0D8;border-radius:8px;padding:1rem;font-size:0.75rem;color:#6B5744;text-align:left;">
                <strong style="color:#3D2B1F;">Debug Info:</strong><br>
                Error: ${e.message || 'Unknown'}<br>
                User: ${currentUser?.uid || 'null'}<br>
                DB: ${!!window.db}<br>
                Wallet: ${!!window.userWallet}<br>
                Time: ${new Date().toLocaleTimeString()}
            </div>
        </div>`;
        
        // Lucide 아이콘 렌더링 (fallback UI용)
        if (window.lucide) lucide.createIcons();
        console.log('[Dashboard] 에러 발생 - 개선된 fallback UI 표시 (토큰 잔고 포함)');
    }
}

// ========== Quick Shortcuts (사용자 커스텀) ==========

const ALL_PAGES = [
    { id:'dashboard', icon:'<i data-lucide="bar-chart-3"></i>', label:'DASHBOARD' },
    { id:'today', icon:'<i data-lucide="home"></i>', label:'TODAY' },
    { id:'messenger', icon:'<i data-lucide="message-circle"></i>', label:'MESSENGER' },
    { id:'social', icon:'<i data-lucide="camera"></i>', label:'SOCIAL' },
    { id:'wallet', icon:'<i data-lucide="coins"></i>', label:'WALLET' },
    { id:'prop-trading', icon:'<i data-lucide="trending-up"></i>', label:'PROP TRADING' },
    { id:'credit', icon:'<i data-lucide="credit-card"></i>', label:'CREDIT' },
    { id:'mall', icon:'<i data-lucide="shopping-cart"></i>', label:'MALL' },
    { id:'art', icon:'<i data-lucide="palette"></i>', label:'ART' },
    { id:'books', icon:'<i data-lucide="book-open"></i>', label:'BOOKS' },
    { id:'artist', icon:'<i data-lucide="star"></i>', label:'ARTIST' },
    { id:'energy', icon:'<i data-lucide="zap"></i>', label:'ENERGY' },
    { id:'business', icon:'<i data-lucide="building"></i>', label:'BUSINESS' },
    { id:'fundraise', icon:'<i data-lucide="heart"></i>', label:'FUNDRAISE' },
    { id:'settings', icon:'<i data-lucide="settings"></i>', label:'SETTINGS' },
];

const DEFAULT_SHORTCUTS = ['prop-trading','messenger','social','wallet'];

function getShortcuts() {
    try {
        const saved = localStorage.getItem('crowny_shortcuts');
        if (saved) return JSON.parse(saved);
    } catch(e) { console.warn("[catch]", e); }
    return DEFAULT_SHORTCUTS;
}

function saveShortcuts(list) {
    localStorage.setItem('crowny_shortcuts', JSON.stringify(list));
}

function renderShortcuts() {
    const ids = getShortcuts();
    return ids.map(id => {
        const p = ALL_PAGES.find(x => x.id === id);
        if (!p) return '';
        const url = `${location.origin}${location.pathname}#page=${id}`;
        return `<button onclick="showPage('${id}')" style="padding:0.5rem 1rem;border:1px solid #E8E0D8;border-radius:8px;background:#F7F3ED;cursor:pointer;font-size:0.85rem;transition:background 0.15s;color:#3D2B1F;" title="${url}" onmouseover="this.style.background='#E8E0D8'" onmouseout="this.style.background='#F7F3ED'">${p.icon} ${p.label}</button>`;
    }).join('');
}

async function editShortcuts() {
    const current = getShortcuts();
    const modal = document.createElement('div');
    modal.id = 'shortcut-edit-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const items = ALL_PAGES.map(p => {
        const checked = current.includes(p.id) ? 'checked' : '';
        return `<label style="display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0;border-bottom:1px solid #F7F3ED;cursor:pointer;">
            <input type="checkbox" value="${p.id}" ${checked} style="width:18px;height:18px;accent-color:var(--gold,#8B6914);">
            <span style="font-size:1rem;">${p.icon}</span>
            <span style="font-size:0.9rem;font-weight:500;">${p.label}</span>
        </label>`;
    }).join('');

    modal.innerHTML = `<div style="background:#FFF8F0;border-radius:12px;max-width:400px;width:100%;max-height:80vh;overflow-y:auto;padding:1.2rem;">
        <h3 style="margin-bottom:0.8rem;">⚡ ${t('dashboard.edit_shortcuts','Edit Shortcuts')}</h3>
        <p style="font-size:0.8rem;color:#6B5744;margin-bottom:1rem;">${t('dashboard.shortcut_hint','Select your preferred menus (up to 8)')}</p>
        <div id="shortcut-checklist">${items}</div>
        <div style="display:flex;gap:0.5rem;margin-top:1rem;">
            <button onclick="saveShortcutEdit()" style="flex:1;background:#3D2B1F;color:#FFF8F0;border:none;padding:0.7rem;border-radius:8px;cursor:pointer;font-weight:700;">${t('common.save','Save')}</button>
            <button onclick="document.getElementById('shortcut-edit-modal').remove()" style="flex:1;background:#E8E0D8;border:none;padding:0.7rem;border-radius:8px;cursor:pointer;">${t('common.cancel','Cancel')}</button>
        </div>
        <div style="margin-top:0.8rem;padding-top:0.8rem;border-top:1px solid #E8E0D8;">
            <p style="font-size:0.75rem;color:#6B5744;">💡 ${t('dashboard.share_hint','Each page can be shared via link')}</p>
        </div>
    </div>`;
    document.body.appendChild(modal);
}

function saveShortcutEdit() {
    const checks = document.querySelectorAll('#shortcut-checklist input[type=checkbox]:checked');
    const selected = Array.from(checks).map(c => c.value).slice(0, 8);
    if (selected.length === 0) { showToast(t('dashboard.select_one','Please select at least 1'), 'warning'); return; }
    saveShortcuts(selected);
    const container = document.getElementById('dash-shortcuts-container');
    if (container) container.innerHTML = renderShortcuts();
    document.getElementById('shortcut-edit-modal')?.remove();
    showToast('⚡ ' + t('dashboard.shortcuts_saved','Shortcuts saved!'), 'success');
}

// ========== URL Anchor Routing ==========

function handleHashRoute() {
    const hash = location.hash;
    if (!hash) return;
    // invite hash 처리
    if (hash.includes('invite=') && typeof INVITE !== 'undefined') {
        INVITE.handleInviteHash();
        return;
    }
    const params = new URLSearchParams(hash.slice(1));
    const page = params.get('page');
    if (page && typeof showPage === 'function') {
        showPage(page);
        // product-detail with id
        if (page === 'product-detail') {
            const id = params.get('id');
            if (id && typeof renderProductDetail === 'function') renderProductDetail(id);
        }
        // store page with sellerId
        if (page === 'store') {
            const sellerId = params.get('sellerId');
            if (sellerId && typeof renderStorePage === 'function') renderStorePage(sellerId);
        }
        // buyer orders
        if (page === 'buyer-orders' && typeof loadBuyerOrders === 'function') loadBuyerOrders();
        // brand landing
        if (page === 'brand-landing') {
            const brand = params.get('brand');
            if (brand && typeof renderBrandLanding === 'function') renderBrandLanding(brand);
        }
    }
}

window.addEventListener('hashchange', handleHashRoute);
// 초기 로드 시에도 체크 (로그인 후)
document.addEventListener('crownyReady', handleHashRoute);
// 즉시 체크 (이미 로그인된 경우)
if (document.readyState === 'complete') setTimeout(handleHashRoute, 500);
