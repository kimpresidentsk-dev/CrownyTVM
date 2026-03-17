// ===== admin.js - 관리자 패널 (레벨/탭/오프체인/온체인/챌린지/회원/기부풀/로그) =====
// ========== ADMIN FUNCTIONS ==========
async function loadTransferRequests() {
    if (currentUser.email !== 'kim.president.sk@gmail.com') return;
    
    const requests = await db.collection('transfer_requests')
        .where('status', '==', 'pending')
        .orderBy('requestedAt', 'desc')
        .get();
    
    console.log('Transfer requests:', requests.size);
    
    requests.forEach(doc => {
        const req = doc.data();
        console.log(`Request: ${req.fromEmail} → ${req.toEmail}: ${req.amount} ${req.token}`);
    });
}

async function adminMintTokens() {
    if (currentUser.email !== 'kim.president.sk@gmail.com') {
        showToast(t('admin.admin_only','관리자만 사용 가능합니다'), 'error');
        return;
    }
    
    const email = document.getElementById('admin-recipient')?.value;
    const token = document.getElementById('admin-token')?.value || 'CRNY';
    const amount = parseFloat(document.getElementById('admin-amount')?.value || 0);
    
    if (!email || amount <= 0) {
        showToast(t('admin.enter_email_amount','이메일과 수량을 입력하세요'), 'info');
        return;
    }
    
    const users = await db.collection('users').where('email', '==', email).get();
    
    if (users.empty) {
        showToast(t('social.user_not_found','사용자를 찾을 수 없습니다'), 'error');
        return;
    }
    
    const userDoc = users.docs[0];
    const userData = userDoc.data();
    const tokenKey = token.toLowerCase();
    
    await db.collection('users').doc(userDoc.id).update({
        [`balances.${tokenKey}`]: userData.balances[tokenKey] + amount
    });
    
    await db.collection('transactions').add({
        from: 'admin',
        to: userDoc.id,
        amount: amount,
        token: token,
        type: 'mint',
        timestamp: new Date()
    });
    
    showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${amount} ${token} 발급 완료!`, 'success');
    
    if (document.getElementById('admin-recipient')) {
        document.getElementById('admin-recipient').value = '';
        document.getElementById('admin-amount').value = '';
    }
}

// ========== 관리자 기능: 강제 청산/중단 ==========
// ========== 다단계 관리자 시스템 (계층형 임명) ==========
// 레벨 6: 수퍼관리자 — 토큰 발행/차감, 쿼터 설정, Lv5 임명 (무제한)
// 레벨 5: 국가관리자 — Lv4 임명 (쿼터 내), 온·오프체인, 챌린지
// 레벨 4: 사업관리자 — Lv3 임명 (쿼터 내), 온·오프체인, 챌린지
// 레벨 3: 서비스관리자 — Lv2 임명 (쿼터 내), 오프체인(조회), 챌린지
// 레벨 2: 운영관리자 — 오프체인(조회만), 발행/차감 불가
// 레벨 1: CS관리자 — 읽기 전용
// 레벨 0: 정회원
// 레벨 -1: 일반회원

const SUPER_ADMIN_EMAIL = 'kim.president.sk@gmail.com';
const ADMIN_EMAIL = SUPER_ADMIN_EMAIL; // 하위 호환

const ADMIN_LEVELS = {
    6: { name: t('admin.level.super','수퍼관리자'), icon: '<i data-lucide="crown" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#8B6914' },
    5: { name: t('admin.level.country','국가관리자'), icon: '<i data-lucide="globe" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#8B6914' },
    4: { name: t('admin.level.business','사업관리자'), icon: '<i data-lucide="briefcase" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#5B7B8C' },
    3: { name: t('admin.level.service','서비스관리자'), icon: '<i data-lucide="wrench" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#C4841D' },
    2: { name: t('admin.level.ops','운영관리자'), icon: '<i data-lucide="file-text" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#6B8F3C' },
    1: { name: t('admin.level.cs','CS관리자'), icon: '<i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#6B5744' },
    0: { name: t('admin.level.member','정회원'), icon: '<i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#795548' },
    '-1': { name: t('admin.level.basic','일반회원'), icon: '<i data-lucide="user" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#9E9E9E' }
};

// 현재 사용자 레벨 캐시
let currentUserLevel = -1;

// 사용자 레벨 로드 (Firestore에서)
async function loadUserLevel() {
    if (!currentUser) { currentUserLevel = -1; return; }
    
    // 수퍼관리자는 항상 레벨 6
    if (currentUser.email === SUPER_ADMIN_EMAIL) {
        currentUserLevel = 6;
        return;
    }
    
    try {
        console.log('[Admin] 사용자 레벨 로딩 시작:', currentUser.email);
        if (!window.db) {
            console.error('[Admin] Firestore DB가 초기화되지 않음');
            currentUserLevel = -1;
            return;
        }
        
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            currentUserLevel = userDoc.data().adminLevel ?? -1;
            console.log('[Admin] 사용자 레벨 로드 성공:', currentUserLevel);
        } else {
            console.log('[Admin] 사용자 문서 없음, 기본 레벨 적용');
            currentUserLevel = -1;
        }
    } catch (e) {
        console.error('[Admin] 레벨 로드 실패 - 기본값으로 복원:', e);
        currentUserLevel = -1;
        currentUserLevel = -1;
    }
}

// 권한 체크 함수들
function isAdmin() {
    return currentUserLevel >= 1;
}

function isSuperAdmin() {
    return currentUserLevel >= 6;
}

function hasLevel(minLevel) {
    return currentUserLevel >= minLevel;
}

function getLevelInfo(level) {
    return ADMIN_LEVELS[level] || ADMIN_LEVELS['-1'];
}

// 관리자 레벨 변경 — 계층형 임명 시스템
// 수퍼(6): Lv5까지 임명, 쿼터 무제한
// Lv5: Lv4 임명 (쿼터 내)
// Lv4: Lv3 임명 (쿼터 내)
// Lv3: Lv2 임명 (쿼터 내)
async function setUserAdminLevel(targetEmail, level) {
    if (targetEmail === SUPER_ADMIN_EMAIL) {
        showToast(t('admin.cant_change_super','수퍼관리자는 변경할 수 없습니다'), 'warning');
        return;
    }
    
    if (level < -1 || level > 5) {
        showToast(t('admin.level_range','레벨 범위: -1 ~ 5'), 'warning');
        return;
    }
    
    // ★ 권한 체크: 자기보다 1단계 아래까지만 임명 가능 (수퍼는 5까지)
    const maxAppointLevel = isSuperAdmin() ? 5 : currentUserLevel - 1;
    
    if (level > maxAppointLevel) {
        showToast(`<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 권한 부족 — 최대 임명: Lv${maxAppointLevel}, 요청: Lv${level}`, 'error');
        return;
    }
    
    // 강등은 자기 레벨 미만만 가능 (수퍼는 전부)
    if (!isSuperAdmin()) {
        // 대상의 현재 레벨 확인
        const users = await db.collection('users').where('email', '==', targetEmail).get();
        if (users.empty) { showToast('사용자를 찾을 수 없습니다: ' + targetEmail, 'error'); return; }
        const targetLevel = users.docs[0].data().adminLevel ?? -1;
        if (targetLevel >= currentUserLevel) {
            showToast(`<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 동급 이상 관리자는 변경할 수 없습니다 (대상: Lv${targetLevel})`, 'error');
            return;
        }
    }
    
    // ★ 쿼터 체크 (승급인 경우)
    if (level >= 1) {
        const quotaOk = await checkAdminQuota(level);
        if (!quotaOk) return;
        
        const personalOk = await checkPersonalQuota(level);
        if (!personalOk) return;
    }
    
    try {
        const users = await db.collection('users').where('email', '==', targetEmail).get();
        if (users.empty) {
            showToast('사용자를 찾을 수 없습니다: ' + targetEmail, 'error');
            return;
        }
        
        const targetDoc = users.docs[0];
        const targetData = targetDoc.data();
        const prevLevel = targetData.adminLevel ?? -1;
        
        const updateData = { 
            adminLevel: level,
            appointedBy: currentUser.email,
            appointedByLevel: currentUserLevel,
            appointedAt: new Date()
        };
        // Preserve existing admin assignment fields (normalize to arrays)
        if (targetData.adminCountry) updateData.adminCountry = normalizeToArray(targetData.adminCountry);
        if (targetData.adminBusiness) updateData.adminBusiness = normalizeToArray(targetData.adminBusiness);
        if (targetData.adminService) updateData.adminService = normalizeToArray(targetData.adminService);
        if (targetData.adminStartDate) updateData.adminStartDate = targetData.adminStartDate;
        if (targetData.adminEndDate !== undefined) updateData.adminEndDate = targetData.adminEndDate;
        
        await targetDoc.ref.update(updateData);
        
        const info = getLevelInfo(level);
        
        await db.collection('admin_log').add({
            action: 'set_admin_level',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            targetEmail: targetEmail,
            prevLevel: prevLevel,
            newLevel: level,
            levelName: info.name,
            timestamp: new Date()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${targetEmail} → ${info.icon} ${info.name} (Lv${level})`, 'success');
        loadAdminUserList();
    } catch (error) {
        showToast('권한 변경 실패: ' + error.message, 'error');
    }
}

// ★ 배열 정규화 헬퍼: 문자열이면 배열로 변환, 빈값이면 빈 배열
function normalizeToArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(v => v && v !== 'ALL');
    if (typeof val === 'string' && val !== 'ALL') return [val];
    return [];
}

// ★ 체크박스 그리드 HTML 생성
function buildCheckboxGrid(name, options, selectedArr) {
    return options.map(o => {
        const checked = selectedArr.includes(o.v) ? 'checked' : '';
        return `<label style="display:inline-flex;align-items:center;gap:0.2rem;padding:0.25rem 0.5rem;background:${checked ? '#F7F3ED' : '#F7F3ED'};border-radius:6px;cursor:pointer;font-size:0.78rem;border:1px solid ${checked ? '#E8E0D8' : '#E8E0D8'};transition:all 0.15s;">
            <input type="checkbox" name="${name}" value="${o.v}" ${checked} style="margin:0;accent-color:#5B7B8C;"> ${o.l}
        </label>`;
    }).join('');
}

// ★ 관리자 편집 모달 — 다중 선택 (체크박스 그리드)
async function showAdminEditModal(userId, userData) {
    const level = userData.adminLevel ?? -1;
    const maxAppointLevel = isSuperAdmin() ? 5 : currentUserLevel - 1;
    const canEdit = (level < currentUserLevel || isSuperAdmin()) && userData.email !== SUPER_ADMIN_EMAIL;
    
    if (!canEdit) { showToast(t('admin.cant_edit','이 사용자를 편집할 수 없습니다'), 'warning'); return; }
    
    let levelOptions = '';
    for (let lv = -1; lv <= maxAppointLevel; lv++) {
        const info = getLevelInfo(lv);
        levelOptions += `<option value="${lv}" ${lv === level ? 'selected' : ''}>${lv} ${info.name} ${info.icon}</option>`;
    }
    
    const countries = [
        {v:'KR',l:'🇰🇷 한국'},{v:'US',l:'🇺🇸 미국'},{v:'JP',l:'🇯🇵 일본'},{v:'CN',l:'🇨🇳 중국'},{v:'VN',l:'🇻🇳 베트남'},{v:'TH',l:'🇹🇭 태국'},{v:'PH',l:'🇵🇭 필리핀'},{v:'ID',l:'🇮🇩 인도네시아'},{v:'MY',l:'🇲🇾 말레이시아'},{v:'SG',l:'🇸🇬 싱가포르'},{v:'AU',l:'🇦🇺 호주'},{v:'UK',l:'🇬🇧 영국'},{v:'DE',l:'🇩🇪 독일'},{v:'FR',l:'🇫🇷 프랑스'},{v:'CA',l:'🇨🇦 캐나다'},{v:'OTHER',l:'기타'}
    ];
    const businesses = [
        {v:'trading',l:'<i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 트레이딩'},{v:'marketplace',l:'<i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 마켓플레이스'},{v:'energy',l:'<i data-lucide="sprout" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 에너지'},{v:'art',l:'<i data-lucide="theater" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 아트/NFT'},{v:'fundraise',l:'<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 펀드레이즈'},{v:'credit',l:'<i data-lucide="credit-card" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 크레딧'},{v:'social',l:'<i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 소셜'},{v:'messenger',l:'<i data-lucide="mail" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 메신저'},{v:'beauty',l:'<i data-lucide="sparkles" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 뷰티'},{v:'sound',l:'<i data-lucide="music" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 음향'},{v:'it',l:'<i data-lucide="laptop" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> IT'},{v:'fnb',l:'<i data-lucide="utensils" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> F&B'},{v:'edu',l:'<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 교육'},{v:'health',l:'<i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 헬스'}
    ];
    const services = [
        {v:'prop-trading',l:'프랍 트레이딩'},{v:'mall',l:'Mall'},{v:'art-gallery',l:'Art'},{v:'nft-mint',l:'NFT'},{v:'energy-invest',l:'Energy'},{v:'fundraise-campaign',l:'Fundraise'},{v:'p2p-credit',l:'Credit'},{v:'social',l:'Social'},{v:'books',l:'도서'},{v:'business',l:'비즈니스'},{v:'trading',l:'Trading'}
    ];
    
    const curCountry = normalizeToArray(userData.adminCountry);
    const curBusiness = normalizeToArray(userData.adminBusiness);
    const curService = normalizeToArray(userData.adminService);
    const curStart = userData.adminStartDate ? (userData.adminStartDate.toDate ? userData.adminStartDate.toDate() : new Date(userData.adminStartDate)) : new Date();
    const curEnd = userData.adminEndDate ? (userData.adminEndDate.toDate ? userData.adminEndDate.toDate() : new Date(userData.adminEndDate)) : null;
    
    const startStr = curStart.toISOString().slice(0,10);
    const endStr = curEnd ? curEnd.toISOString().slice(0,10) : '';
    
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;overflow-y:auto;';
    overlay.innerHTML = `
        <div style="background:#FFF8F0;padding:1.5rem;border-radius:16px;max-width:540px;width:100%;max-height:90vh;overflow-y:auto;">
            <h3 style="margin-bottom:0.3rem;">${t('admin.settings','<i data-lucide="settings" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> 관리자 설정')}</h3>
            <p style="font-size:0.85rem;color:#6B5744;margin-bottom:1rem;">${userData.nickname || t('admin.unnamed','이름없음')} · ${userData.email}</p>
            
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.8rem;color:#6B5744;display:block;margin-bottom:0.3rem;">${t('admin.admin_level','관리자 레벨')}</label>
                <select id="edit-admin-level" style="width:100%;padding:0.6rem;border:1px solid #E8E0D8;border-radius:8px;font-size:0.9rem;">${levelOptions}</select>
            </div>
            
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.8rem;color:#6B5744;display:block;margin-bottom:0.4rem;"><i data-lucide="globe" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 담당 국가 <span style="font-size:0.7rem;color:#6B5744;">(다중 선택)</span></label>
                <div id="edit-admin-country-grid" style="display:flex;flex-wrap:wrap;gap:0.3rem;">
                    ${buildCheckboxGrid('adminCountry', countries, curCountry)}
                </div>
            </div>
            
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.8rem;color:#6B5744;display:block;margin-bottom:0.4rem;"><i data-lucide="briefcase" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 담당 사업 <span style="font-size:0.7rem;color:#6B5744;">(다중 선택)</span></label>
                <div id="edit-admin-business-grid" style="display:flex;flex-wrap:wrap;gap:0.3rem;">
                    ${buildCheckboxGrid('adminBusiness', businesses, curBusiness)}
                </div>
            </div>
            
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.8rem;color:#6B5744;display:block;margin-bottom:0.4rem;"><i data-lucide="wrench" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 담당 서비스 <span style="font-size:0.7rem;color:#6B5744;">(다중 선택)</span></label>
                <div id="edit-admin-service-grid" style="display:flex;flex-wrap:wrap;gap:0.3rem;">
                    ${buildCheckboxGrid('adminService', services, curService)}
                </div>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-bottom:1rem;">
                <div>
                    <label style="font-size:0.8rem;color:#6B5744;display:block;margin-bottom:0.3rem;">📅 시작일</label>
                    <input type="date" id="edit-admin-start" value="${startStr}" style="width:100%;padding:0.6rem;border:1px solid #E8E0D8;border-radius:8px;box-sizing:border-box;">
                </div>
                <div>
                    <label style="font-size:0.8rem;color:#6B5744;display:block;margin-bottom:0.3rem;">📅 종료일 (비우면 무기한)</label>
                    <input type="date" id="edit-admin-end" value="${endStr}" style="width:100%;padding:0.6rem;border:1px solid #E8E0D8;border-radius:8px;box-sizing:border-box;">
                </div>
            </div>
            
            <div style="display:flex;gap:0.5rem;">
                <button id="edit-admin-save" style="flex:1;padding:0.7rem;background:#8B6914;color:#FFF8F0;border:none;border-radius:8px;cursor:pointer;font-weight:700;">${t('common.save','저장')}</button>
                <button id="edit-admin-cancel" style="flex:1;padding:0.7rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#FFF8F0;">${t('common.cancel','취소')}</button>
            </div>
        </div>`;
    
    document.body.appendChild(overlay);
    
    // 체크박스 토글 시 라벨 스타일 업데이트
    overlay.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            const lbl = cb.closest('label');
            if (cb.checked) { lbl.style.background = '#F7F3ED'; lbl.style.borderColor = '#E8E0D8'; }
            else { lbl.style.background = '#F7F3ED'; lbl.style.borderColor = '#E8E0D8'; }
        });
    });
    
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#edit-admin-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#edit-admin-save').onclick = async () => {
        const newLevel = parseInt(document.getElementById('edit-admin-level').value);
        const countryArr = [...overlay.querySelectorAll('input[name="adminCountry"]:checked')].map(c => c.value);
        const businessArr = [...overlay.querySelectorAll('input[name="adminBusiness"]:checked')].map(c => c.value);
        const serviceArr = [...overlay.querySelectorAll('input[name="adminService"]:checked')].map(c => c.value);
        const startDate = document.getElementById('edit-admin-start').value;
        const endDate = document.getElementById('edit-admin-end').value;
        
        if (newLevel >= 1 && newLevel > level) {
            const quotaOk = await checkAdminQuota(newLevel);
            if (!quotaOk) return;
            const personalOk = await checkPersonalQuota(newLevel);
            if (!personalOk) return;
        }
        
        try {
            const updateData = {
                adminLevel: newLevel,
                adminCountry: countryArr,
                adminBusiness: businessArr,
                adminService: serviceArr,
                adminStartDate: startDate ? firebase.firestore.Timestamp.fromDate(new Date(startDate)) : firebase.firestore.FieldValue.serverTimestamp(),
                appointedBy: currentUser.email,
                appointedByLevel: currentUserLevel,
                appointedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (endDate) {
                updateData.adminEndDate = firebase.firestore.Timestamp.fromDate(new Date(endDate + 'T23:59:59'));
            } else {
                updateData.adminEndDate = null;
            }
            
            await db.collection('users').doc(userId).update(updateData);
            
            const info = getLevelInfo(newLevel);
            await db.collection('admin_log').add({
                action: 'admin_edit',
                adminEmail: currentUser.email,
                adminLevel: currentUserLevel,
                targetEmail: userData.email,
                prevLevel: level,
                newLevel: newLevel,
                country: countryArr, business: businessArr, service: serviceArr,
                startDate: startDate || null,
                endDate: endDate || null,
                timestamp: new Date()
            });
            
            overlay.remove();
            const cLabel = countryArr.length ? countryArr.join(',') : t('common.all','전체');
            const bLabel = businessArr.length ? businessArr.join(',') : t('common.all','전체');
            const sLabel = serviceArr.length ? serviceArr.join(',') : t('common.all','전체');
            showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${userData.email} → ${info.icon} Lv${newLevel} (${cLabel}/${bLabel}/${sLabel})`, 'success');
            loadAdminUserList();
        } catch (e) {
            showToast(t('admin.settings_fail','설정 실패: ') + e.message, 'error');
        }
    };
}

// ★ 전체 쿼터 체크 (해당 레벨의 총 관리자 수)
async function checkAdminQuota(level) {
    try {
        const configDoc = await db.collection('admin_config').doc('settings').get();
        const quotas = configDoc.exists ? (configDoc.data().quotas || {}) : {};
        const levelQuota = quotas[`level${level}`] || {};
        const maxTotal = levelQuota.max || 999;
        
        // 현재 해당 레벨 관리자 수
        const current = await db.collection('users').where('adminLevel', '==', level).get();
        
        if (current.size >= maxTotal) {
            showToast(`<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Lv${level} 쿼터 초과\n\n최대: ${maxTotal}명\n현재: ${current.size}명\n\n수퍼관리자에게 쿼터 증가를 요청하세요.`, 'error');
            return false;
        }
        return true;
    } catch (e) {
        console.warn('쿼터 체크 실패 (허용):', e);
        return true;
    }
}

// ★ 개인 임명 쿼터 체크 (내가 임명한 해당 레벨 관리자 수)
async function checkPersonalQuota(level) {
    if (isSuperAdmin()) return true; // 수퍼는 무제한
    
    try {
        const configDoc = await db.collection('admin_config').doc('settings').get();
        const quotas = configDoc.exists ? (configDoc.data().quotas || {}) : {};
        const levelQuota = quotas[`level${level}`] || {};
        const perAdmin = levelQuota.perAdmin || 999;
        
        // 내가 임명한 해당 레벨 수
        const myAppointed = await db.collection('users')
            .where('appointedBy', '==', currentUser.email)
            .where('adminLevel', '==', level)
            .get();
        
        if (myAppointed.size >= perAdmin) {
            showToast(`<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 개인 임명 쿼터 초과\n\nLv${level} 최대 임명: ${perAdmin}명\n이미 임명: ${myAppointed.size}명`, 'error');
            return false;
        }
        return true;
    } catch (e) {
        console.warn('개인 쿼터 체크 실패 (허용):', e);
        return true;
    }
}

// ★ 쿼터 설정 (수퍼관리자 전용)
async function saveAdminQuotas() {
    if (!isSuperAdmin()) { showToast('수퍼관리자만 설정 가능합니다', 'info'); return; }
    
    const quotas = {};
    for (let lv = 1; lv <= 5; lv++) {
        const maxEl = document.getElementById(`quota-max-${lv}`);
        const perEl = document.getElementById(`quota-per-${lv}`);
        if (maxEl && perEl) {
            quotas[`level${lv}`] = {
                max: parseInt(maxEl.value) || 999,
                perAdmin: parseInt(perEl.value) || 999
            };
        }
    }
    
    try {
        await db.collection('admin_config').doc('settings').set({ quotas }, { merge: true });
        showToast('<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 관리자 쿼터 저장 완료', 'success');
        loadAdminUserList();
    } catch (e) {
        showToast('저장 실패: ' + e.message, 'info');
    }
}

// ★ 관리자 현황 통계 로드
async function loadAdminStats() {
    const stats = {};
    for (let lv = 1; lv <= 5; lv++) {
        try {
            const q = await db.collection('users').where('adminLevel', '==', lv).get();
            stats[lv] = q.size;
        } catch (e) { stats[lv] = '?'; }
    }
    return stats;
}

// ========== 소개자(레퍼럴) 시스템 ==========

// 소개 코드 생성 (정회원 이상) — CR-XXXXXX 고유 ID
async function generateReferralCode() {
    if (!currentUser) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.data();
        
        if (userData.referralCode) {
            const nick = userData.referralNickname || userData.nickname || '';
            const display = nick ? `${nick} (${userData.referralCode})` : userData.referralCode;
            showToast(`이미 소개 코드가 있습니다: ${display}`, 'info');
            // 소개코드 표시 업데이트
            const codeEl = document.getElementById('my-referral-code');
            if (codeEl) codeEl.textContent = userData.referralCode;
            return userData.referralCode;
        }
        
        // CR-XXXXXX 형식 고유 코드 생성 (변경 불가)
        let code;
        let exists = true;
        while (exists) {
            const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
            code = 'CR-' + rand;
            const dup = await db.collection('users').where('referralCode', '==', code).get();
            exists = !dup.empty;
        }
        
        // 소개 닉네임 입력
        const nickname = await showPromptModal(
            t('social.referral_nick_title', '소개 닉네임 설정'),
            t('social.referral_nick_desc', '소개 코드와 함께 표시될 닉네임을 입력하세요:\n(나중에 변경 가능)'),
            userData.nickname || ''
        );
        
        await db.collection('users').doc(currentUser.uid).update({
            referralCode: code,
            referralNickname: (nickname || '').trim() || userData.nickname || '',
            referralCount: 0,
            referralEarnings: { crny: 0, fnc: 0, crfn: 0, crtd: 0, crac: 0, crgc: 0, creb: 0 }
        });
        
        const displayNick = (nickname || '').trim() || userData.nickname || '';
        const display = displayNick ? `${displayNick} (${code})` : code;
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 소개 코드 생성: ${display}`, 'success');
        const codeEl = document.getElementById('my-referral-code');
        if (codeEl) codeEl.textContent = code;
        if (typeof loadReferralInfo === 'function') loadReferralInfo();
        return code;
    } catch (error) {
        showToast('코드 생성 실패: ' + error.message, 'error');
    }
}

// 소개 코드로 가입 시 연결
async function applyReferralCode(newUserId, referralCode) {
    if (!referralCode) return;
    
    try {
        const referrers = await db.collection('users')
            .where('referralCode', '==', referralCode.toUpperCase()).get();
        
        if (referrers.empty) {
            console.log('⚠️ 유효하지 않은 소개 코드:', referralCode);
            return;
        }
        
        const referrer = referrers.docs[0];
        const referrerId = referrer.id;
        
        // 신규 사용자에 소개자 기록
        await db.collection('users').doc(newUserId).update({
            referredBy: referrerId,
            referredByEmail: referrer.data().email,
            referredByCode: referralCode.toUpperCase()
        });
        
        // 소개자 카운트 증가
        await referrer.ref.update({
            referralCount: (referrer.data().referralCount || 0) + 1
        });
        
        // ★ 소개자 보상 자동 지급 (Firestore 설정값 기반)
        await distributeSignupReferralReward(referrerId, newUserId, referrer.data().email);
        
        console.log(`✅ 소개 연결 + 보상 지급: ${referralCode} → 신규 사용자`);
    } catch (error) {
        console.error('소개 코드 적용 실패:', error);
    }
}

// ★ 회원가입 시 소개자 보상 자동 지급 (설정값 기반)
async function distributeSignupReferralReward(referrerId, newUserId, referrerEmail) {
    try {
        // Firestore에서 보상 설정 로드
        const configDoc = await db.collection('admin_config').doc('referral_rewards').get();
        const config = configDoc.exists ? configDoc.data() : {};
        const rewards = config.signupRewards || { crtd: 30, crac: 20, crgc: 30, creb: 20 };
        
        const referrerDoc = await db.collection('users').doc(referrerId).get();
        if (!referrerDoc.exists) return;
        const referrerData = referrerDoc.data();
        const off = referrerData.offchainBalances || {};
        const earnings = referrerData.referralEarnings || {};
        
        const updates = {};
        const tokenEntries = Object.entries(rewards).filter(([_, v]) => v > 0);
        
        for (const [token, amount] of tokenEntries) {
            updates[`offchainBalances.${token}`] = (off[token] || 0) + amount;
            updates[`referralEarnings.${token}`] = (earnings[token] || 0) + amount;
        }
        
        if (Object.keys(updates).length > 0) {
            await db.collection('users').doc(referrerId).update(updates);
        }
        
        // 거래 로그
        for (const [token, amount] of tokenEntries) {
            await db.collection('transactions').add({
                from: 'system:referral_signup',
                to: referrerId,
                toEmail: referrerEmail || '',
                amount: amount,
                token: token.toUpperCase(),
                type: 'referral_signup_reward',
                referredUser: newUserId,
                rewardConfig: rewards,
                timestamp: new Date()
            });
        }
        
        console.log(`<i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 소개 가입 보상 지급:`, rewards, `→ ${referrerId}`);
    } catch (e) {
        console.error('소개 가입 보상 지급 실패:', e);
    }
}

// ★ 소개자 보상 설정 UI (수퍼관리자)
async function loadReferralRewardConfig() {
    try {
        const doc = await db.collection('admin_config').doc('referral_rewards').get();
        const config = doc.exists ? doc.data() : {};
        const rewards = config.signupRewards || { crtd: 30, crac: 20, crgc: 30, creb: 20 };
        ['crtd','crac','crgc','creb'].forEach(tk => {
            const el = document.getElementById('referral-cfg-' + tk);
            if (el) el.value = rewards[tk] || 0;
        });
    } catch (e) {
        console.error('소개자 보상 설정 로드 실패:', e);
    }
}

async function saveReferralRewardConfig() {
    if (!isSuperAdmin()) { showToast('수퍼관리자만 변경 가능합니다', 'warning'); return; }
    const tokens = ['crtd','crac','crgc','creb'];
    const signupRewards = {};
    for (const tk of tokens) {
        const val = parseInt(document.getElementById('referral-cfg-' + tk)?.value);
        if (isNaN(val) || val < 0 || val > 10000) {
            showToast(`${tk.toUpperCase()} 수치가 유효하지 않습니다 (0~10,000)`, 'error');
            return;
        }
        signupRewards[tk] = val;
    }
    const confirmed = await showConfirmModal(
        '소개자 보상 수치 변경',
        `회원가입 시 소개자 보상을 다음과 같이 변경합니다:\n\nCRTD: ${signupRewards.crtd}\nCRAC: ${signupRewards.crac}\nCRGC: ${signupRewards.crgc}\nCREB: ${signupRewards.creb}\n\n변경하시겠습니까?`
    );
    if (!confirmed) return;
    try {
        await db.collection('admin_config').doc('referral_rewards').set({
            signupRewards,
            updatedAt: new Date(),
            updatedBy: currentUser.email
        }, { merge: true });
        await db.collection('admin_logs').add({
            action: 'referral_reward_config_change',
            newConfig: signupRewards,
            adminEmail: currentUser.email,
            adminUid: currentUser.uid,
            timestamp: new Date()
        });
        showToast('<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 소개자 보상 수치 저장 완료', 'success');
    } catch (e) {
        showToast('저장 실패: ' + e.message, 'error');
    }
}

// [v13] 챌린지 참가 시 소개자 수익 배분 — 비활성화 (회원가입 보상으로 통합)
// async function distributeReferralReward — deprecated
async function distributeReferralReward_DISABLED(userId, amount, token) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) return;
        
        const referredBy = userDoc.data().referredBy;
        if (!referredBy) return;
        
        const rewardAmount = Math.floor(amount);
        if (rewardAmount <= 0) return;
        
        const tokenKey = token.toLowerCase();
        
        // 소개자 문서 로드
        const referrerDoc = await db.collection('users').doc(referredBy).get();
        if (!referrerDoc.exists) return;
        const referrerData = referrerDoc.data();
        
        if (tokenKey === 'crtd') {
            // CRTD → 즉시 오프체인 지급
            const off = referrerData.offchainBalances || {};
            await db.collection('users').doc(referredBy).update({
                [`offchainBalances.crtd`]: (off.crtd || 0) + rewardAmount,
                [`referralEarnings.crtd`]: ((referrerData.referralEarnings || {}).crtd || 0) + rewardAmount
            });
            
            console.log(`<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 소개 CRTD 즉시 지급: ${rewardAmount} → ${referredBy}`);
        } else if (tokenKey === 'crny') {
            // CRNY → 30일 후 자동 지급 (pendingRewards)
            const releaseDate = new Date();
            releaseDate.setDate(releaseDate.getDate() + 30);
            
            await db.collection('users').doc(referredBy)
                .collection('pendingRewards').add({
                    token: 'crny',
                    amount: rewardAmount,
                    sourceUser: userId,
                    sourceAmount: amount,
                    type: 'referral_commission',
                    released: false,
                    releaseDate: releaseDate,
                    createdAt: new Date()
                });
            
            // 누적 수익에도 기록 (대기 표시)
            const earnings = referrerData.referralEarnings || {};
            await db.collection('users').doc(referredBy).update({
                [`referralEarnings.crny`]: (earnings.crny || 0) + rewardAmount
            });
            
            console.log(`⏳ 소개 CRNY 30일 후 지급 예정: ${rewardAmount} → ${referredBy}`);
        } else {
            // 기타 토큰: 오프체인 즉시 지급
            const off = referrerData.offchainBalances || {};
            await db.collection('users').doc(referredBy).update({
                [`offchainBalances.${tokenKey}`]: (off[tokenKey] || 0) + rewardAmount,
                [`referralEarnings.${tokenKey}`]: ((referrerData.referralEarnings || {}).tokenKey || 0) + rewardAmount
            });
        }
        
        await db.collection('transactions').add({
            from: 'system:referral_commission',
            to: referredBy,
            amount: rewardAmount,
            token: token,
            type: 'referral_commission',
            sourceUser: userId,
            sourceAmount: amount,
            commission: '10%',
            isPending: tokenKey === 'crny',
            timestamp: new Date()
        });
    } catch (error) {
        console.error('소개 수수료 배분 실패:', error);
    }
}

// 관리자: 특정 사용자 전체 포지션 강제 청산
async function adminForceCloseAll(targetUserId, targetParticipantId, challengeId) {
    if (!isAdmin()) {
        showToast(t('admin.admin_only','관리자만 사용 가능합니다'), 'error');
        return;
    }
    
    if (!window.confirm('<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 관리자 강제 청산\n\n이 사용자의 모든 포지션을 강제 청산합니다.\n진행하시겠습니까?')) return;
    
    try {
        const docRef = db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(targetParticipantId);
        const doc = await docRef.get();
        if (!doc.exists) { showToast('참가자를 찾을 수 없습니다', 'error'); return; }
        
        const data = doc.data();
        const trades = data.trades || [];
        let totalPnL = 0;
        
        for (const trade of trades) {
            if (trade.status === 'open') {
                const priceDiff = trade.side === 'BUY' 
                    ? (currentPrice - trade.entryPrice) 
                    : (trade.entryPrice - currentPrice);
                const pnl = priceDiff * trade.multiplier * trade.contracts;
                const fee = trade.fee || (RISK_CONFIG.tradeFeeRoundTrip * trade.contracts);
                
                trade.status = 'closed';
                trade.exitPrice = currentPrice;
                trade.pnl = pnl - fee;
                trade.fee = fee;
                trade.closedAt = new Date();
                trade.closeReason = 'ADMIN';
                totalPnL += pnl - fee + trade.margin;
            }
        }
        
        const newBalance = (data.currentBalance || 0) + totalPnL;
        
        await docRef.update({
            trades: trades,
            currentBalance: newBalance
        });
        
        // 관리자 로그
        await db.collection('admin_log').add({
            action: 'force_close_all',
            adminEmail: currentUser.email,
            targetUserId: targetUserId,
            targetParticipantId: targetParticipantId,
            challengeId: challengeId,
            totalPnL: totalPnL,
            timestamp: new Date()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 강제 청산 완료!\n손익: $${totalPnL.toFixed(2)}`, 'success');
    } catch (error) {
        showToast('강제 청산 실패: ' + error.message, 'info');
    }
}

// 관리자: 사용자 거래 중단 (dailyLocked 설정)
async function adminSuspendTrading(targetParticipantId, challengeId, reason) {
    if (!isAdmin()) {
        showToast(t('admin.admin_only','관리자만 사용 가능합니다'), 'error');
        return;
    }
    
    const suspendReason = reason || prompt(t('admin.enter_suspend_reason','중단 사유를 입력하세요:'));
    if (!suspendReason) return;
    
    try {
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(targetParticipantId)
            .update({
                dailyLocked: true,
                adminSuspended: true,
                suspendReason: suspendReason,
                suspendedAt: new Date(),
                suspendedBy: currentUser.email
            });
        
        await db.collection('admin_log').add({
            action: 'suspend_trading',
            adminEmail: currentUser.email,
            targetParticipantId: targetParticipantId,
            challengeId: challengeId,
            reason: suspendReason,
            timestamp: new Date()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('admin.suspended','거래 중단 처리 완료')}\n${t('admin.reason','사유')}: ${suspendReason}`, 'success');
    } catch (error) {
        showToast('중단 처리 실패: ' + error.message, 'info');
    }
}

// 관리자: 거래 중단 해제
async function adminResumeTrading(targetParticipantId, challengeId) {
    if (!isAdmin()) {
        showToast(t('admin.admin_only','관리자만 사용 가능합니다'), 'error');
        return;
    }
    
    try {
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(targetParticipantId)
            .update({
                dailyLocked: false,
                adminSuspended: false,
                suspendReason: null,
                suspendedAt: null,
                suspendedBy: null
            });
        
        await db.collection('admin_log').add({
            action: 'resume_trading',
            adminEmail: currentUser.email,
            targetParticipantId: targetParticipantId,
            challengeId: challengeId,
            timestamp: new Date()
        });
        
        showToast(t('admin.resumed','<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 거래 중단 해제 완료'), 'success');
        loadAdminParticipants(); // 새로고침
    } catch (error) {
        showToast('해제 실패: ' + error.message, 'info');
    }
}

// ========== 관리자 패널 UI ==========
// ═══════════════════════════════════════════════════════
// 관리자 탭 메뉴 시스템 — 권한 매트릭스
// ═══════════════════════════════════════════════════════
const ADMIN_TAB_CONFIG = [
    { id: 'dashboard', icon: '<i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.dashboard','대시보드'), minLevel: 3 },
    { id: 'offchain',  icon: '<i data-lucide="flame" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.offchain','오프체인'),  minLevel: 2 },
    { id: 'wallet',    icon: '<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.onchain','온체인'),    minLevel: 4 },
    { id: 'challenge', icon: '<i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.challenge','챌린지'),    minLevel: 3 },
    { id: 'users',     icon: '<i data-lucide="users" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.users','관리자'),    minLevel: 3 },
    { id: 'giving',    icon: '<i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.giving','기부풀'),    minLevel: 3 },
    { id: 'referral',  icon: '<i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.referral','소개자'),    minLevel: 6 },
    { id: 'rate',      icon: '<i data-lucide="scale" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.rate','비율'),      minLevel: 6 },
    { id: 'log',       icon: '<i data-lucide="clipboard-list" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.log','로그'),      minLevel: 3 },
    { id: 'coupon',    icon: '<i data-lucide="ticket" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.coupon','쿠폰'),      minLevel: 3 },
    { id: 'products',  icon: '<i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.products','상품승인'),  minLevel: 2 },
    { id: 'superwall', icon: '<i data-lucide="building-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.superwall','계좌관리'),  minLevel: 6 },
    { id: 'rewards',   icon: '<i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.rewards','리워드'),    minLevel: 3 },
    { id: 'ai',        icon: '<i data-lucide="crown" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.ai','크라우니 패널 설정'),     minLevel: 6 },
    { id: 'features',  icon: '<i data-lucide="wrench" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.features','기능 관리'),   minLevel: 5 }
];

let activeAdminTab = null;

function initAdminPage() {
    if (!isAdmin()) {
        document.getElementById('admin-not-authorized').style.display = 'block';
        document.getElementById('admin-panel').style.display = 'none';
        return;
    }
    
    document.getElementById('admin-not-authorized').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    
    // 레벨 뱃지 표시
    const info = getLevelInfo(currentUserLevel);
    document.getElementById('admin-level-badge').innerHTML = 
        `${info.icon} <strong>${info.name}</strong> (레벨 ${currentUserLevel}) — ${currentUser.email}`;
    
    // 권한별 탭 동적 생성
    const tabBar = document.getElementById('admin-tab-bar');
    tabBar.innerHTML = '';
    
    const availableTabs = ADMIN_TAB_CONFIG.filter(t => hasLevel(t.minLevel));
    
    availableTabs.forEach((tab, idx) => {
        const btn = document.createElement('button');
        btn.innerHTML = `${tab.icon} ${tab.label}`;
        btn.style.cssText = 'padding:0.5rem 0.8rem; border:none; border-radius:8px; cursor:pointer; font-size:0.8rem; font-weight:600; white-space:nowrap; background:transparent; color:#6B5744; transition:all 0.2s;';
        btn.onclick = () => switchAdminTab(tab.id);
        btn.id = `admin-tab-btn-${tab.id}`;
        tabBar.appendChild(btn);
    });
    
    // 첫 번째 탭 활성화
    if (availableTabs.length > 0) {
        switchAdminTab(availableTabs[0].id);
    }
    if (window.lucide) lucide.createIcons();
    
    // ★ 발행/차감/토큰관리/배포 섹션: 수퍼관리자만 표시
    const mintSection = document.getElementById('admin-mint-section');
    const burnSection = document.getElementById('admin-burn-section');
    const tokenMgmt = document.getElementById('admin-token-mgmt-section');
    const distSection = document.getElementById('admin-dist-section');
    if (mintSection) mintSection.style.display = isSuperAdmin() ? 'block' : 'none';
    if (burnSection) burnSection.style.display = isSuperAdmin() ? 'block' : 'none';
    if (tokenMgmt) tokenMgmt.style.display = isSuperAdmin() ? 'block' : 'none';
    if (distSection) distSection.style.display = isSuperAdmin() ? 'block' : 'none';
}

function switchAdminTab(tabId) {
    // 모든 탭 컨텐츠 숨기기
    document.querySelectorAll('.admin-tab-content').forEach(el => {
        el.style.display = 'none';
    });
    
    // 모든 탭 버튼 비활성화
    document.querySelectorAll('#admin-tab-bar button').forEach(btn => {
        btn.style.background = 'transparent';
        btn.style.color = '#6B5744';
    });
    
    // 선택 탭 활성화
    const content = document.getElementById(`admin-tab-${tabId}`);
    if (content) content.style.display = 'block';
    
    const btn = document.getElementById(`admin-tab-btn-${tabId}`);
    if (btn) {
        btn.style.background = '#3D2B1F';
        btn.style.color = '#FFF8F0';
    }
    
    activeAdminTab = tabId;
    
    // 탭 전환 시 데이터 로드
    if (tabId === 'dashboard') loadAdminDashboardStats();
    if (tabId === 'offchain') { refreshAllTokenDropdowns(); loadTokenList(); }
    if (tabId === 'wallet') loadAdminWallet();
    if (tabId === 'users') loadAdminUserList();
    if (tabId === 'challenge') loadAdminParticipants();
    if (tabId === 'giving') adminLoadGivingPool();
    if (tabId === 'referral') loadReferralRewardConfig();
    if (tabId === 'rate') loadExchangeRate();
    if (tabId === 'coupon') loadCouponList();
    if (tabId === 'products') { loadAdminPendingProducts(); loadAdminReports(); }
    if (tabId === 'superwall') loadSuperAdminWallets();
    if (tabId === 'rewards') loadRewardSettingsTab();
    if (tabId === 'ai' && typeof AI_ASSISTANT !== 'undefined') AI_ASSISTANT.loadAdminSettings();
}

// ═══════════════════════════════════════════════════════
// 오프체인 관리 함수들 (admin-tab-offchain)
// ═══════════════════════════════════════════════════════

// 유저 오프체인 잔액 조회
async function adminLookupOffchain() {
    const email = document.getElementById('admin-off-lookup-email').value.trim();
    const resultEl = document.getElementById('admin-off-lookup-result');
    if (!email) { resultEl.innerHTML = `<span style="color:red;">${t('admin.enter_email','이메일 입력')}</span>`; return; }
    
    try {
        const users = await db.collection('users').where('email', '==', email).get();
        if (users.empty) { resultEl.innerHTML = `<span style="color:red;">${t('admin.user_not_found','사용자 없음')}</span>`; return; }
        
        const data = users.docs[0].data();
        const off = data.offchainBalances || {};
        const nick = data.nickname || data.displayName || t('admin.unnamed','이름없음');
        
        let total = 0;
        let balHTML = '';
        for (const key of OFFCHAIN_TOKENS_LIST) {
            const bal = off[key] || 0;
            total += bal;
            const ti = getTokenInfo(key);
            if (bal > 0 || ti.isDefault) {
                balHTML += `<div>${ti.icon} ${ti.name}: <strong style="color:${ti.color};">${bal.toLocaleString()}</strong></div>`;
            }
        }
        // DB에 있지만 레지스트리에 없는 토큰도 표시
        for (const [key, val] of Object.entries(off)) {
            if (!OFFCHAIN_TOKENS_LIST.includes(key) && val > 0) {
                total += val;
                balHTML += `<div><i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${key.toUpperCase()}: <strong>${val.toLocaleString()}</strong></div>`;
            }
        }
        
        resultEl.innerHTML = `
            <div style="background:#FFF8F0; padding:0.8rem; border-radius:6px; border:1px solid var(--border);">
                <strong>${nick}</strong> <span style="color:var(--accent); font-size:0.8rem;">(${email})</span>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.3rem; margin-top:0.5rem; font-size:0.85rem;">
                    ${balHTML}
                </div>
                <div style="margin-top:0.4rem; font-size:0.8rem; color:var(--accent);">합계: ${total.toLocaleString()} pt</div>
            </div>`;
    } catch (e) {
        resultEl.innerHTML = `<span style="color:red;">조회 실패: ${e.message}</span>`;
    }
}

// 포인트 발행 (민팅) — ★ 수퍼관리자(레벨 6) 전용
async function adminMintOffchain() {
    if (!hasLevel(6)) { showToast(t('admin.super_only_mint','<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 수퍼관리자만 토큰을 발행할 수 있습니다'), 'error'); return; }
    
    const email = document.getElementById('admin-off-mint-email').value.trim();
    const tokenKey = document.getElementById('admin-off-mint-token').value;
    const amount = parseInt(document.getElementById('admin-off-mint-amount').value);
    const reason = document.getElementById('admin-off-mint-reason').value.trim() || t('admin.admin_mint','관리자 발행');
    
    if (!email || !amount || amount <= 0) { showToast(t('admin.enter_email_amount','이메일과 수량을 입력하세요'), 'info'); return; }
    
    try {
        const users = await db.collection('users').where('email', '==', email).get();
        if (users.empty) { showToast('사용자 없음: ' + email, 'error'); return; }
        
        const targetDoc = users.docs[0];
        const data = targetDoc.data();
        const off = data.offchainBalances || {};
        const curBal = off[tokenKey] || 0;
        
        if (!confirm(`<i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 포인트 발행\n\n대상: ${email}\n토큰: ${tokenKey.toUpperCase()}\n수량: +${amount.toLocaleString()}\n사유: ${reason}\n\n현재 잔액: ${curBal.toLocaleString()} → ${(curBal + amount).toLocaleString()}`)) return;
        
        await targetDoc.ref.update({
            [`offchainBalances.${tokenKey}`]: curBal + amount
        });
        
        // 트랜잭션 로그
        await db.collection('offchain_transactions').add({
            from: 'ADMIN', fromEmail: currentUser.email,
            to: targetDoc.id, toEmail: email,
            token: tokenKey, amount, type: 'admin_mint', reason,
            adminLevel: currentUserLevel,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // 관리자 활동 로그
        await db.collection('admin_log').add({
            action: 'offchain_mint', adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            targetEmail: email, token: tokenKey.toUpperCase(),
            amount, reason,
            timestamp: new Date()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${amount.toLocaleString()} ${tokenKey.toUpperCase()} 발행 → ${email}`, 'success');
        document.getElementById('admin-off-mint-email').value = '';
        document.getElementById('admin-off-mint-amount').value = '100';
        document.getElementById('admin-off-mint-reason').value = '';
    } catch (e) {
        showToast('발행 실패: ' + e.message, 'info');
    }
}

// 포인트 차감 (소각) — ★ 수퍼관리자(레벨 6) 전용
async function adminBurnOffchain() {
    if (!hasLevel(6)) { showToast(t('admin.super_only_burn','<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 수퍼관리자만 토큰을 차감할 수 있습니다'), 'error'); return; }
    
    const email = document.getElementById('admin-off-burn-email').value.trim();
    const tokenKey = document.getElementById('admin-off-burn-token').value;
    const amount = parseInt(document.getElementById('admin-off-burn-amount').value);
    const reason = document.getElementById('admin-off-burn-reason').value.trim() || t('admin.admin_burn_reason','관리자 차감');
    
    if (!email || !amount || amount <= 0) { showToast(t('admin.enter_email_amount','이메일과 수량을 입력하세요'), 'info'); return; }
    
    try {
        const users = await db.collection('users').where('email', '==', email).get();
        if (users.empty) { showToast('사용자 없음: ' + email, 'error'); return; }
        
        const targetDoc = users.docs[0];
        const data = targetDoc.data();
        const off = data.offchainBalances || {};
        const curBal = off[tokenKey] || 0;
        
        if (amount > curBal) {
            showToast(`<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 잔액 부족!\n${email}의 ${tokenKey.toUpperCase()}: ${curBal.toLocaleString()} pt\n차감 요청: ${amount.toLocaleString()} pt`, 'error');
            return;
        }
        
        if (!confirm(`<i data-lucide="trending-down" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 포인트 차감\n\n대상: ${email}\n토큰: ${tokenKey.toUpperCase()}\n수량: -${amount.toLocaleString()}\n사유: ${reason}\n\n현재 잔액: ${curBal.toLocaleString()} → ${(curBal - amount).toLocaleString()}`)) return;
        
        await targetDoc.ref.update({
            [`offchainBalances.${tokenKey}`]: curBal - amount
        });
        
        await db.collection('offchain_transactions').add({
            from: targetDoc.id, fromEmail: email,
            to: 'ADMIN', toEmail: currentUser.email,
            token: tokenKey, amount: -amount, type: 'admin_burn', reason,
            adminLevel: currentUserLevel,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await db.collection('admin_log').add({
            action: 'offchain_burn', adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            targetEmail: email, token: tokenKey.toUpperCase(),
            amount: -amount, reason,
            timestamp: new Date()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${amount.toLocaleString()} ${tokenKey.toUpperCase()} 차감 ← ${email}`, 'success');
        document.getElementById('admin-off-burn-email').value = '';
        document.getElementById('admin-off-burn-amount').value = '100';
        document.getElementById('admin-off-burn-reason').value = '';
    } catch (e) {
        showToast('차감 실패: ' + e.message, 'info');
    }
}

// ═══════════════════════════════════════════════════════
// ★ 토큰 생성 · 관리 · 일괄 배포 (수퍼관리자)
// ═══════════════════════════════════════════════════════

// 토큰 목록으로 select 옵션 생성 (동적)
function buildTokenOptions() {
    let html = '';
    for (const [key, info] of Object.entries(OFFCHAIN_TOKEN_REGISTRY)) {
        html += `<option value="${key}">${info.icon} ${info.name}</option>`;
    }
    return html;
}

// 모든 토큰 드롭다운 동적 업데이트
function refreshAllTokenDropdowns() {
    const opts = buildTokenOptions();
    ['admin-off-mint-token', 'admin-off-burn-token', 'admin-dist-token'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const prev = el.value;
            el.innerHTML = opts;
            if (prev && el.querySelector(`option[value="${prev}"]`)) el.value = prev;
        }
    });
}

// 등록된 토큰 목록 표시
async function loadTokenList() {
    const container = document.getElementById('admin-token-list');
    if (!container) return;
    
    let html = '<div style="display:grid; gap:0.4rem;">';
    for (const [key, info] of Object.entries(OFFCHAIN_TOKEN_REGISTRY)) {
        const badge = info.isDefault ? '<span style="font-size:0.6rem; background:#E8E0D8; padding:1px 4px; border-radius:2px;">기본</span>' : '<span style="font-size:0.6rem; background:#F7F3ED; padding:1px 4px; border-radius:2px;">커스텀</span>';
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0.6rem; background:var(--bg); border-radius:4px; border-left:3px solid ${info.color};">
                <span style="font-size:0.82rem;">${info.icon} <strong>${info.name}</strong> ${info.fullName} ${badge}</span>
                ${!info.isDefault && isSuperAdmin() ? `<button onclick="deleteCustomToken('${key}')" style="background:#B54534; color:#FFF8F0; border:none; padding:2px 6px; border-radius:3px; cursor:pointer; font-size:0.65rem;">삭제</button>` : ''}
            </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
}

// ★ 새 토큰 생성
async function createCustomToken() {
    if (!isSuperAdmin()) { showToast('<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 수퍼관리자만 토큰을 생성할 수 있습니다', 'error'); return; }
    
    const key = (document.getElementById('new-token-key').value || '').trim().toLowerCase();
    const name = (document.getElementById('new-token-name').value || '').trim().toUpperCase();
    const fullName = (document.getElementById('new-token-fullname').value || '').trim();
    const icon = (document.getElementById('new-token-icon').value || '').trim() || '<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>';
    const color = document.getElementById('new-token-color').value || '#6B5744';
    
    if (!key || !name) { showToast('토큰 KEY와 이름은 필수입니다', 'info'); return; }
    if (key.length < 2 || key.length > 10) { showToast('KEY는 2~10자 영문 소문자', 'info'); return; }
    if (!/^[a-z0-9]+$/.test(key)) { showToast('KEY는 영문 소문자 + 숫자만 가능', 'info'); return; }
    if (OFFCHAIN_TOKEN_REGISTRY[key]) { showToast(`이미 존재하는 토큰: ${key.toUpperCase()}`, 'info'); return; }
    
    const tokenData = { name, fullName, icon, color, isDefault: false, createdBy: currentUser.email, createdAt: new Date().toISOString() };
    
    if (!confirm(`<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 새 오프체인 토큰 생성\n\nKEY: ${key}\n이름: ${icon} ${name}\n설명: ${fullName}\n\n생성하시겠습니까?`)) return;
    
    try {
        // Firestore에 저장
        await db.collection('admin_config').doc('tokens').set({
            [`registry.${key}`]: tokenData
        }, { merge: true });
        
        // 로컬 레지스트리 업데이트
        OFFCHAIN_TOKEN_REGISTRY[key] = tokenData;
        OFFCHAIN_TOKENS_LIST = Object.keys(OFFCHAIN_TOKEN_REGISTRY);
        OFFCHAIN_TOKEN_NAMES[key] = `${name} (${fullName})`;
        
        // 관리자 로그
        await db.collection('admin_log').add({
            action: 'create_token', adminEmail: currentUser.email,
            tokenKey: key, tokenName: name, timestamp: new Date()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${icon} ${name} (${key}) 토큰 생성 완료!`, 'success');
        
        // UI 업데이트
        document.getElementById('new-token-key').value = '';
        document.getElementById('new-token-name').value = '';
        document.getElementById('new-token-fullname').value = '';
        refreshAllTokenDropdowns();
        loadTokenList();
    } catch (e) {
        showToast('토큰 생성 실패: ' + e.message, 'info');
    }
}

// 커스텀 토큰 삭제
async function deleteCustomToken(key) {
    if (!isSuperAdmin()) return;
    const info = OFFCHAIN_TOKEN_REGISTRY[key];
    if (!info || info.isDefault) { showToast('기본 토큰은 삭제할 수 없습니다', 'info'); return; }
    
    if (!confirm(`<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${info.icon} ${info.name} (${key}) 삭제\n\n이미 배포된 잔액은 유지되지만, 새 발행/거래가 불가합니다.\n삭제하시겠습니까?`)) return;
    
    try {
        await db.collection('admin_config').doc('tokens').update({
            [`registry.${key}`]: firebase.firestore.FieldValue.delete()
        });
        
        delete OFFCHAIN_TOKEN_REGISTRY[key];
        OFFCHAIN_TOKENS_LIST = Object.keys(OFFCHAIN_TOKEN_REGISTRY);
        delete OFFCHAIN_TOKEN_NAMES[key];
        
        await db.collection('admin_log').add({
            action: 'delete_token', adminEmail: currentUser.email,
            tokenKey: key, tokenName: info.name, timestamp: new Date()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${info.icon} ${info.name} 삭제 완료`, 'success');
        refreshAllTokenDropdowns();
        loadTokenList();
    } catch (e) {
        showToast('삭제 실패: ' + e.message, 'info');
    }
}

// ★ 일괄 배포 (여러 사용자에게 한번에)
async function adminBatchDistribute() {
    if (!hasLevel(6)) { showToast('<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 수퍼관리자만 일괄 배포할 수 있습니다', 'error'); return; }
    
    const tokenKey = document.getElementById('admin-dist-token').value;
    const amount = parseInt(document.getElementById('admin-dist-amount').value);
    const reason = document.getElementById('admin-dist-reason').value.trim() || '일괄 배포';
    const emailsRaw = document.getElementById('admin-dist-emails').value.trim();
    
    if (!tokenKey || !amount || amount <= 0) { showToast('토큰과 수량을 입력하세요', 'info'); return; }
    if (!emailsRaw) { showToast('이메일을 입력하세요 (줄바꿈 구분)', 'info'); return; }
    
    // 이메일 파싱 (줄바꿈, 쉼표, 세미콜론)
    const emails = emailsRaw.split(/[\n,;]+/).map(e => e.trim().toLowerCase()).filter(e => e && e.includes('@'));
    
    if (emails.length === 0) { showToast('유효한 이메일이 없습니다', 'info'); return; }
    
    const ti = getTokenInfo(tokenKey);
    const totalAmount = amount * emails.length;
    
    if (!confirm(`<i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 일괄 배포\n\n${ti.icon} ${ti.name}: ${amount.toLocaleString()} × ${emails.length}명\n총 발행: ${totalAmount.toLocaleString()}\n사유: ${reason}\n\n대상:\n${emails.slice(0, 5).join('\n')}${emails.length > 5 ? `\n... 외 ${emails.length - 5}명` : ''}\n\n실행하시겠습니까?`)) return;
    
    const resultEl = document.getElementById('admin-dist-result');
    resultEl.innerHTML = '<p style="color:var(--accent);">배포 중...</p>';
    
    let success = 0, fail = 0, failList = [];
    
    for (const email of emails) {
        try {
            const users = await db.collection('users').where('email', '==', email).get();
            if (users.empty) { fail++; failList.push(`${email} (사용자 없음)`); continue; }
            
            const targetDoc = users.docs[0];
            const off = targetDoc.data().offchainBalances || {};
            const curBal = off[tokenKey] || 0;
            
            await targetDoc.ref.update({
                [`offchainBalances.${tokenKey}`]: curBal + amount
            });
            
            await db.collection('offchain_transactions').add({
                from: 'ADMIN', fromEmail: currentUser.email,
                to: targetDoc.id, toEmail: email,
                token: tokenKey, amount, type: 'admin_batch_mint', reason,
                adminLevel: currentUserLevel,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            success++;
        } catch (e) {
            fail++;
            failList.push(`${email} (${e.message})`);
        }
    }
    
    // 관리자 로그 (한번에)
    await db.collection('admin_log').add({
        action: 'batch_distribute', adminEmail: currentUser.email,
        adminLevel: currentUserLevel,
        token: tokenKey.toUpperCase(), amountPerUser: amount,
        totalAmount: amount * success, targetCount: emails.length,
        successCount: success, failCount: fail, reason,
        timestamp: new Date()
    });
    
    resultEl.innerHTML = `
        <div style="padding:0.6rem; border-radius:6px; ${fail > 0 ? 'background:#F7F3ED; border:1px solid #ffcc80;' : 'background:#F7F3ED; border:1px solid #a5d6a7;'}">
            <strong><i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${success}명 성공</strong>${fail > 0 ? ` / <i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${fail}명 실패` : ''}
            <div style="font-size:0.78rem; margin-top:0.3rem;">총 발행: ${(amount * success).toLocaleString()} ${ti.name}</div>
            ${failList.length > 0 ? `<div style="font-size:0.72rem; color:#B54534; margin-top:0.3rem;">실패: ${failList.join(', ')}</div>` : ''}
        </div>`;
    
    document.getElementById('admin-dist-emails').value = '';
}

// ★ 전체 회원 배포
async function adminDistributeToAll() {
    if (!hasLevel(6)) { showToast('<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 수퍼관리자만 가능합니다', 'error'); return; }
    
    const tokenKey = document.getElementById('admin-dist-token').value;
    const amount = parseInt(document.getElementById('admin-dist-amount').value);
    const reason = document.getElementById('admin-dist-reason').value.trim() || '전체 배포';
    
    if (!tokenKey || !amount || amount <= 0) { showToast('토큰과 수량을 입력하세요', 'info'); return; }
    
    const ti = getTokenInfo(tokenKey);
    
    // 전체 사용자 수 확인
    const allUsers = await db.collection('users').get();
    const count = allUsers.size;
    
    if (!confirm(`<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 전체 회원 배포\n\n${ti.icon} ${ti.name}: ${amount.toLocaleString()} × ${count}명\n총 발행: ${(amount * count).toLocaleString()}\n\n정말 전체 ${count}명에게 배포하시겠습니까?`)) return;
    
    // 이메일 목록 추출 → 기존 배치 함수 활용
    const emails = [];
    allUsers.forEach(doc => {
        const email = doc.data().email;
        if (email) emails.push(email);
    });
    
    document.getElementById('admin-dist-emails').value = emails.join('\n');
    await adminBatchDistribute();
}

// 오프체인 거래 내역 로드
async function adminLoadOffchainTxLog() {
    if (!hasLevel(1)) return;
    const container = document.getElementById('admin-off-tx-log');
    container.innerHTML = '<p style="color:var(--accent); font-size:0.8rem;">로딩 중...</p>';
    
    try {
        const txs = await db.collection('offchain_transactions')
            .orderBy('timestamp', 'desc').limit(30).get();
        
        if (txs.empty) { container.innerHTML = '<p style="font-size:0.8rem;">거래 내역 없음</p>'; return; }
        
        const typeLabels = {
            'transfer': '전송', 'earn': '적립', 'spend': '사용',
            'admin_mint': '<i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>발행', 'admin_burn': '<i data-lucide="trending-down" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>차감',
            'swap_offchain': '<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>환전'
        };
        const typeColors = {
            'admin_mint': '#6B8F3C', 'admin_burn': '#B54534',
            'earn': '#5B7B8C', 'spend': '#ff6f00',
            'transfer': '#455a64', 'swap_offchain': '#6a1b9a'
        };
        
        let html = '';
        txs.forEach(doc => {
            const tx = doc.data();
            const time = tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleString('ko-KR') : '--';
            const label = typeLabels[tx.type] || tx.type;
            const color = typeColors[tx.type] || '#6B5744';
            const fromLabel = tx.fromEmail === 'ADMIN' ? '<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 관리자' : (tx.fromEmail || '--');
            const toLabel = tx.toEmail === 'ADMIN' ? '<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 관리자' : (tx.toEmail || '--');
            const amountSign = (tx.amount >= 0) ? '+' : '';
            
            html += `<div style="padding:0.5rem; border-bottom:1px solid #E8E0D8; font-size:0.78rem;">
                <div style="display:flex; justify-content:space-between;">
                    <span style="color:${color}; font-weight:700;">${label}</span>
                    <span style="color:var(--accent);">${time}</span>
                </div>
                <div>${tx.token?.toUpperCase()||'--'} <strong>${amountSign}${(tx.amount||0).toLocaleString()}</strong></div>
                <div style="color:#6B5744; font-size:0.72rem;">${fromLabel} → ${toLabel}</div>
                ${tx.reason ? `<div style="color:#6B5744; font-size:0.7rem; font-style:italic;">"${tx.reason}"</div>` : ''}
            </div>`;
        });
        
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<p style="color:red; font-size:0.8rem;">로드 실패: ${e.message}</p>`;
    }
}

// ═══════════════════════════════════════════════════════
// 기부풀 관리 (admin-tab-giving)
// ═══════════════════════════════════════════════════════

async function adminLoadGivingPool() {
    if (!hasLevel(3)) return;
    const infoEl = document.getElementById('admin-giving-pool-info');
    const logEl = document.getElementById('admin-giving-log');
    
    try {
        // 기부풀 현황
        const poolDoc = await db.collection('giving_pool').doc('global').get();
        if (poolDoc.exists) {
            const pool = poolDoc.data();
            const updated = pool.lastUpdated?.toDate ? pool.lastUpdated.toDate().toLocaleString('ko-KR') : '--';
            infoEl.innerHTML = `
                <div style="text-align:center;">
                    <div style="font-size:0.8rem; color:var(--accent);"><i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 글로벌 기부풀 잔액</div>
                    <div style="font-size:2rem; font-weight:800; color:#6B8F3C;">${(pool.totalAmount||0).toLocaleString()} <span style="font-size:0.9rem;">CRGC pt</span></div>
                    <div style="font-size:0.75rem; color:var(--accent);">≈ ${((pool.totalAmount||0)/100).toFixed(2)} CRNY · 최종: ${updated}</div>
                </div>`;
        } else {
            infoEl.innerHTML = '<p style="text-align:center; color:var(--accent);">아직 기부풀이 없습니다</p>';
        }
        
        // 기부풀 로그
        const logs = await db.collection('giving_pool_logs')
            .orderBy('timestamp', 'desc').limit(20).get();
        
        if (logs.empty) { logEl.innerHTML = '<p style="font-size:0.8rem;">기부 로그 없음</p>'; return; }
        
        let html = '';
        logs.forEach(doc => {
            const log = doc.data();
            const time = log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString('ko-KR') : '--';
            html += `<div style="padding:0.4rem; border-bottom:1px solid #E8E0D8; font-size:0.78rem;">
                <span style="color:#6B8F3C; font-weight:600;">+${(log.givingAmount||0).toLocaleString()}</span>
                <span style="color:var(--accent);"> from ${log.email||'--'}</span>
                <span style="color:#6B5744; float:right;">${time}</span>
            </div>`;
        });
        logEl.innerHTML = html;
    } catch (e) {
        infoEl.innerHTML = `<p style="color:red;">로드 실패: ${e.message}</p>`;
    }
}

// 기부풀 분배
async function adminDistributeGivingPool() {
    if (!hasLevel(3)) { showToast('권한 부족 (레벨 3+)', 'info'); return; }
    
    const email = document.getElementById('admin-giving-email').value.trim();
    const amount = parseInt(document.getElementById('admin-giving-amount').value);
    if (!email || !amount || amount <= 0) { showToast(t('admin.enter_email_amount','이메일과 수량을 입력하세요'), 'info'); return; }
    
    try {
        // 기부풀 잔액 확인
        const poolRef = db.collection('giving_pool').doc('global');
        const poolDoc = await poolRef.get();
        const poolBal = poolDoc.exists ? (poolDoc.data().totalAmount || 0) : 0;
        
        if (amount > poolBal) {
            showToast(`<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 기부풀 잔액 부족!\n현재: ${poolBal.toLocaleString()} pt\n요청: ${amount.toLocaleString()} pt`, 'error');
            return;
        }
        
        // 수신자 확인
        const users = await db.collection('users').where('email', '==', email).get();
        if (users.empty) { showToast('사용자 없음: ' + email, 'error'); return; }
        
        if (!confirm(`<i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 기부풀 분배\n\n대상: ${email}\n수량: ${amount.toLocaleString()} CRGC pt\n기부풀 잔액: ${poolBal.toLocaleString()} → ${(poolBal - amount).toLocaleString()}`)) return;
        
        const targetDoc = users.docs[0];
        const off = targetDoc.data().offchainBalances || {};
        
        // 기부풀 차감
        await poolRef.update({
            totalAmount: poolBal - amount,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // 수신자에게 CRGC 지급
        await targetDoc.ref.update({
            [`offchainBalances.crgc`]: (off.crgc || 0) + amount
        });
        
        // 로그
        await db.collection('offchain_transactions').add({
            from: 'GIVING_POOL', fromEmail: 'giving_pool',
            to: targetDoc.id, toEmail: email,
            token: 'crgc', amount, type: 'giving_distribute',
            adminEmail: currentUser.email, adminLevel: currentUserLevel,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await db.collection('admin_log').add({
            action: 'giving_distribute', adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            targetEmail: email, amount, timestamp: new Date()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${amount.toLocaleString()} CRGC 기부풀에서 ${email}에게 분배 완료`, 'success');
        adminLoadGivingPool();
    } catch (e) {
        showToast('분배 실패: ' + e.message, 'info');
    }
}

// 회원 목록 로드 (수퍼관리자)
async function loadAdminUserList() {
    if (!hasLevel(3)) return;
    
    const container = document.getElementById('admin-user-list');
    container.innerHTML = '<p style="color:var(--accent);">로딩 중...</p>';
    
    const maxAppointLevel = isSuperAdmin() ? 5 : currentUserLevel - 1;
    
    try {
        // ★ 쿼터 정보 + 관리자 현황
        const stats = await loadAdminStats();
        let configDoc = null;
        try {
            configDoc = await db.collection('admin_config').doc('settings').get();
        } catch(e) { console.warn("[catch]", e); }
        const quotas = configDoc?.exists ? (configDoc.data().quotas || {}) : {};
        
        // ★ 수퍼관리자: 쿼터 설정 UI
        let quotaHTML = '';
        if (isSuperAdmin()) {
            quotaHTML = `
            <div style="background:#F7F3ED; padding:1rem; border-radius:8px; margin-bottom:1rem;">
                <h4 style="font-size:0.85rem; margin-bottom:0.6rem;">⚙️ 관리자 쿼터 설정</h4>
                <table style="width:100%; border-collapse:collapse; font-size:0.78rem;">
                    <thead>
                        <tr style="background:var(--bg);">
                            <th style="padding:0.3rem;">레벨</th>
                            <th style="padding:0.3rem;">현재</th>
                            <th style="padding:0.3rem;">최대(전체)</th>
                            <th style="padding:0.3rem;">상위1인당</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${[5,4,3,2,1].map(lv => {
                            const q = quotas[`level${lv}`] || {};
                            const info = getLevelInfo(lv);
                            return `<tr>
                                <td style="padding:0.3rem;">${info.icon} Lv${lv}</td>
                                <td style="padding:0.3rem; text-align:center; font-weight:700;">${stats[lv] || 0}명</td>
                                <td style="padding:0.3rem;"><input type="number" id="quota-max-${lv}" value="${q.max || 999}" min="0" style="width:55px; padding:0.2rem; border:1px solid var(--border); border-radius:3px; text-align:center;"></td>
                                <td style="padding:0.3rem;"><input type="number" id="quota-per-${lv}" value="${q.perAdmin || 999}" min="0" style="width:55px; padding:0.2rem; border:1px solid var(--border); border-radius:3px; text-align:center;"></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                <button onclick="saveAdminQuotas()" style="margin-top:0.5rem; background:#C4841D; color:#FFF8F0; border:none; padding:0.4rem 1rem; border-radius:4px; cursor:pointer; font-size:0.8rem;"><i data-lucide="save" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 쿼터 저장</button>
            </div>`;
        }
        
        // ★ 임명 폼 (자기 레벨에 맞는 옵션만)
        let appointOptions = '';
        for (let lv = -1; lv <= maxAppointLevel; lv++) {
            const info = getLevelInfo(lv);
            appointOptions += `<option value="${lv}">${lv} ${info.name} ${info.icon}</option>`;
        }
        
        const appointHTML = `
        <div style="background:var(--bg); padding:1rem; border-radius:8px; margin-bottom:1rem;">
            <h4 style="font-size:0.85rem; margin-bottom:0.5rem;"><i data-lucide="user-check" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> 관리자 임명 (최대 Lv${maxAppointLevel}까지)</h4>
            <div style="display:grid; grid-template-columns:1fr auto auto; gap:0.5rem; align-items:end;">
                <div>
                    <label style="font-size:0.7rem;">이메일</label>
                    <input type="email" id="admin-level-email" placeholder="user@email.com" style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:4px;">
                </div>
                <div>
                    <label style="font-size:0.7rem;">레벨</label>
                    <select id="admin-level-select" style="padding:0.5rem; border:1px solid var(--border); border-radius:4px;">
                        ${appointOptions}
                    </select>
                </div>
                <button onclick="setUserAdminLevel(document.getElementById('admin-level-email').value, parseInt(document.getElementById('admin-level-select').value))" style="background:#8B6914; color:#FFF8F0; border:none; padding:0.5rem 1rem; border-radius:4px; cursor:pointer;">설정</button>
            </div>
        </div>`;
        
        // ★ 관리자 목록 (관리자인 사용자만 + 최근 가입)
        const admins = await db.collection('users').where('adminLevel', '>=', 1).get();
        const recentUsers = await db.collection('users').orderBy('createdAt', 'desc').limit(20).get();
        
        // 중복 제거
        const seenIds = new Set();
        const allUsers = [];
        admins.forEach(doc => { seenIds.add(doc.id); allUsers.push({ id: doc.id, ...doc.data() }); });
        recentUsers.forEach(doc => { if (!seenIds.has(doc.id)) { seenIds.add(doc.id); allUsers.push({ id: doc.id, ...doc.data() }); } });
        
        // 레벨 내림차순 정렬
        allUsers.sort((a, b) => (b.adminLevel ?? -1) - (a.adminLevel ?? -1));
        
        window._adminUserCache = {};
        let userHTML = '';
        for (const u of allUsers) {
            const level = u.adminLevel ?? -1;
            const info = getLevelInfo(level);
            const canManage = (level < currentUserLevel || isSuperAdmin()) && u.email !== SUPER_ADMIN_EMAIL;
            window._adminUserCache[u.id] = u;
            
            const countryArr = normalizeToArray(u.adminCountry);
            const businessArr = normalizeToArray(u.adminBusiness);
            const serviceArr = normalizeToArray(u.adminService);
            const countryBadge = countryArr.map(c => `<span style="font-size:0.6rem;background:#F7F3ED;color:#5B7B8C;padding:1px 4px;border-radius:3px;">${c}</span>`).join('');
            const businessBadge = businessArr.map(b => `<span style="font-size:0.6rem;background:#F7F3ED;color:#C4841D;padding:1px 4px;border-radius:3px;">${b}</span>`).join('');
            const serviceBadge = serviceArr.map(s => `<span style="font-size:0.6rem;background:#F7F3ED;color:#6B5744;padding:1px 4px;border-radius:3px;">${s}</span>`).join('');
            
            let periodText = '';
            if (u.adminEndDate) {
                const end = u.adminEndDate.toDate ? u.adminEndDate.toDate() : new Date(u.adminEndDate);
                const isExpired = end < new Date();
                periodText = isExpired 
                    ? `<span style="font-size:0.6rem;color:#B54534;font-weight:700;"><i data-lucide="clock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 만료됨</span>`
                    : `<span style="font-size:0.6rem;color:#6B5744;">~${end.toLocaleDateString('ko-KR')}</span>`;
            }
            
            userHTML += `
                <div style="padding:0.6rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem; border-left:4px solid ${info.color};">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.3rem;">
                        <div style="flex:1; min-width:150px;">
                            <strong style="font-size:0.85rem;">${u.nickname || t('admin.unnamed','이름없음')}</strong>
                            <span style="font-size:0.7rem; color:var(--accent); margin-left:0.3rem;">${u.email}</span>
                            <div style="display:flex;gap:0.3rem;margin-top:0.2rem;flex-wrap:wrap;">
                                ${countryBadge}${businessBadge}${serviceBadge}${periodText}
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:0.4rem;">
                            <span style="font-size:0.72rem; padding:2px 6px; background:${info.color}22; color:${info.color}; border-radius:3px;">
                                ${info.icon} Lv${level}
                            </span>
                            ${canManage ? `<button onclick="showAdminEditModal('${u.id}', window._adminUserCache['${u.id}'])" style="background:#8B6914;color:#FFF8F0;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:0.65rem;">편집</button>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = quotaHTML + appointHTML + `
            <h4 style="font-size:0.85rem; margin-bottom:0.5rem;"><i data-lucide="users" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 관리자 · 회원 목록 (${allUsers.length}명)</h4>
            ${userHTML}
        `;
    } catch (error) {
        container.innerHTML = `<p style="color:red;">로드 실패: ${error.message}</p>`;
    }
}

// 참가자 일일 한도 조정 (레벨 3+)
async function adminAdjustDailyLimit(participantId, challengeId) {
    if (!hasLevel(3)) return;
    
    try {
        // 기존 값 조회
        const doc = await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId).get();
        
        if (!doc.exists) { showToast('참가자를 찾을 수 없습니다', 'error'); return; }
        const data = doc.data();
        const currentLimit = data.dailyLossLimit || 500;
        const email = data.email || data.userId || participantId;
        
        const newLimit = prompt(`[${email}]\n현재 일일 손실 한도: $${currentLimit}\n\n새 일일 손실 한도 ($):`, currentLimit);
        if (!newLimit || isNaN(newLimit)) return;
        
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId)
            .update({ dailyLossLimit: Math.abs(parseFloat(newLimit)) });
        
        await db.collection('admin_log').add({
            action: 'adjust_daily_limit',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            participantId, challengeId,
            prevLimit: currentLimit,
            newLimit: Math.abs(parseFloat(newLimit)),
            timestamp: new Date()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 일일 한도 $${currentLimit} → $${newLimit} 변경 완료`, 'success');
        loadAdminParticipants();
    } catch (error) {
        showToast('변경 실패: ' + error.message, 'info');
        console.error('adminAdjustDailyLimit 에러:', error);
    }
}

// 거래 잠금 해제 (레벨 3+)
async function adminUnlockTrading(participantId, challengeId) {
    if (!hasLevel(3)) return;
    
    try {
        const doc = await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId).get();
        
        if (!doc.exists) { showToast('참가자를 찾을 수 없습니다', 'error'); return; }
        const data = doc.data();
        const email = data.email || data.userId || participantId;
        const locked = data.dailyLocked ? '<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 잠금 상태' : '<i data-lucide="unlock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 정상';
        const suspended = data.adminSuspended ? '<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 정지됨' : '활동중';
        
        if (!confirm(`[${email}]\n상태: ${locked} / ${suspended}\n일일 PnL: $${(data.dailyPnL||0).toFixed(2)}\n\n잠금 해제 + PnL 초기화?`)) return;
        
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId)
            .update({ 
                dailyLocked: false,
                adminSuspended: false,
                suspendReason: null,
                dailyPnL: 0
            });
        
        await db.collection('admin_log').add({
            action: 'unlock_trading',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            participantId, challengeId,
            timestamp: new Date()
        });
        
        showToast('<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 거래 잠금 해제 + 일일 PnL 초기화 완료', 'success');
        loadAdminParticipants();
    } catch (error) {
        showToast('해제 실패: ' + error.message, 'info');
        console.error('adminUnlockTrading 에러:', error);
    }
}

// 잔액 직접 조정 (레벨 4+)
async function adminAdjustBalance(participantId, challengeId) {
    if (!hasLevel(4)) return;
    
    try {
        const doc = await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId).get();
        
        if (!doc.exists) { showToast('참가자를 찾을 수 없습니다', 'error'); return; }
        const data = doc.data();
        const currentBalance = data.currentBalance || 0;
        const email = data.email || data.userId || participantId;
        
        const newBalance = prompt(`[${email}]\n현재 잔액: $${currentBalance.toLocaleString()}\n손익: $${((data.currentBalance||0) - (data.initialBalance||0)).toFixed(2)}\n\n새 잔액 ($):`, currentBalance);
        if (!newBalance || isNaN(newBalance)) return;
        
        if (!confirm(`잔액 변경 확인\n$${currentBalance.toLocaleString()} → $${parseFloat(newBalance).toLocaleString()}`)) return;
        
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId)
            .update({ currentBalance: parseFloat(newBalance) });
        
        await db.collection('admin_log').add({
            action: 'adjust_balance',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            participantId, challengeId,
            prevBalance: currentBalance,
            newBalance: parseFloat(newBalance),
            timestamp: new Date()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 잔액 $${currentBalance.toLocaleString()} → $${parseFloat(newBalance).toLocaleString()} 변경 완료`, 'success');
        loadAdminParticipants();
    } catch (error) {
        showToast('변경 실패: ' + error.message, 'info');
        console.error('adminAdjustBalance 에러:', error);
    }
}

// 누적 청산 한도 조정 (레벨 3+)
async function adminAdjustMaxDrawdown(participantId, challengeId) {
    if (!hasLevel(3)) return;
    
    try {
        const doc = await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId).get();
        
        if (!doc.exists) { showToast('참가자를 찾을 수 없습니다', 'error'); return; }
        const data = doc.data();
        const currentDD = data.maxDrawdown || 3000;
        const email = data.email || data.userId || participantId;
        const balance = data.currentBalance || 0;
        const pnl = balance - (data.initialBalance || 0);
        
        const newDD = prompt(`[${email}]\n현재 잔액: $${balance.toLocaleString()} (손익: $${pnl.toFixed(0)})\n현재 청산 한도: -$${currentDD.toLocaleString()}\n\n새 청산 한도 ($):`, currentDD);
        if (!newDD || isNaN(newDD)) return;
        
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId)
            .update({ maxDrawdown: Math.abs(parseFloat(newDD)) });
        
        await db.collection('admin_log').add({
            action: 'adjust_max_drawdown',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            participantId, challengeId,
            prevDrawdown: currentDD,
            newDrawdown: Math.abs(parseFloat(newDD)),
            timestamp: new Date()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 청산 한도 -$${currentDD.toLocaleString()} → -$${parseFloat(newDD).toLocaleString()} 변경 완료`, 'success');
        loadAdminParticipants();
    } catch (error) {
        showToast('변경 실패: ' + error.message, 'info');
        console.error('adminAdjustMaxDrawdown 에러:', error);
    }
}

// 카피트레이딩 계정 수 조정 (레벨 3+)
async function adminAdjustCopyAccounts(participantId, challengeId) {
    if (!hasLevel(3)) return;
    
    try {
        const doc = await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId).get();
        
        if (!doc.exists) { showToast('참가자를 찾을 수 없습니다', 'error'); return; }
        const data = doc.data();
        const currentCopy = data.copyAccounts || 1;
        const email = data.email || data.userId || participantId;
        
        const newCopy = prompt(`[${email}]\n현재 카피트레이딩 계정 수: ${currentCopy}\n\n새 카피 계정 수 (1~10):`, currentCopy);
        if (!newCopy || isNaN(newCopy)) return;
        
        const val = Math.min(10, Math.max(1, parseInt(newCopy)));
        
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId)
            .update({ copyAccounts: val });
        
        await db.collection('admin_log').add({
            action: 'adjust_copy_accounts',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            participantId, challengeId,
            prevCopyAccounts: currentCopy,
            newCopyAccounts: val,
            timestamp: new Date()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 카피 계정 ${currentCopy} → ${val} 변경 완료\n(실효 계약수 = 입력계약 × ${val})`, 'success');
        loadAdminParticipants();
    } catch (error) {
        showToast('변경 실패: ' + error.message, 'info');
    }
}

// 거래 티어 (MNQ/NQ 최대 계약수) 조정 (레벨 3+)
async function adminAdjustTradingTier(participantId, challengeId) {
    if (!hasLevel(3)) return;
    
    try {
        const doc = await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId).get();
        
        if (!doc.exists) { showToast('참가자를 찾을 수 없습니다', 'error'); return; }
        const data = doc.data();
        const currentTier = data.tradingTier || { MNQ: 1, NQ: 0 };
        const email = data.email || data.userId || participantId;
        
        const mnqMax = prompt(`[${email}]\n현재 MNQ 최대: ${currentTier.MNQ || 0}\nNQ 최대: ${currentTier.NQ || 0}\n\nMNQ 최대 계약수:`, currentTier.MNQ || 1);
        if (mnqMax === null) return;
        
        const nqMax = prompt(`NQ 최대 계약수:`, currentTier.NQ || 0);
        if (nqMax === null) return;
        
        const newTier = { MNQ: parseInt(mnqMax) || 0, NQ: parseInt(nqMax) || 0 };
        
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').doc(participantId)
            .update({ tradingTier: newTier });
        
        await db.collection('admin_log').add({
            action: 'adjust_trading_tier',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            participantId, challengeId,
            prevTier: currentTier,
            newTier: newTier,
            timestamp: new Date()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 거래 티어 변경 완료\nMNQ: ${currentTier.MNQ||0} → ${newTier.MNQ}\nNQ: ${currentTier.NQ||0} → ${newTier.NQ}`, 'success');
        loadAdminParticipants();
    } catch (error) {
        showToast('변경 실패: ' + error.message, 'info');
    }
}

// Admin 지갑 - 온체인 잔액 로드
// ═══════════════════════════════════════════════════════
// 삭제된 지갑 조회 (관리자)
// ═══════════════════════════════════════════════════════
async function adminLoadDeletedWallets() {
    if (!hasLevel(3)) { showToast('권한 부족 (레벨 3+)', 'warning'); return; }
    
    const container = document.getElementById('admin-deleted-wallets');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--accent);">삭제된 지갑 조회 중...</p>';
    
    try {
        const users = await db.collection('users').get();
        let html = '';
        let count = 0;
        
        for (const userDoc of users.docs) {
            const userData = userDoc.data();
            const wallets = await db.collection('users').doc(userDoc.id)
                .collection('wallets').where('status', '==', 'deleted').get();
            
            for (const wDoc of wallets.docs) {
                const w = wDoc.data();
                count++;
                const deletedAt = w.deletedAt?.toDate ? w.deletedAt.toDate().toLocaleString('ko-KR') : (w.deletedAt ? new Date(w.deletedAt).toLocaleString('ko-KR') : '--');
                html += `<div style="padding:0.6rem;background:#FFF8F0;border-radius:6px;margin-bottom:0.4rem;border-left:3px solid #B54534;">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.3rem;">
                        <div>
                            <strong style="font-size:0.85rem;">${w.name || '지갑'}</strong>
                            <span style="font-size:0.7rem;color:#6B5744;margin-left:0.3rem;">${userData.email || userDoc.id}</span>
                            <div style="font-size:0.72rem;color:#6B5744;font-family:monospace;">${w.walletAddress || '--'}</div>
                            <div style="font-size:0.68rem;color:#B54534;">삭제: ${deletedAt}</div>
                        </div>
                        ${hasLevel(4) ? `<button onclick="adminRestoreWallet('${userDoc.id}','${wDoc.id}')" style="background:#6B8F3C;color:#FFF8F0;border:none;padding:0.3rem 0.6rem;border-radius:4px;cursor:pointer;font-size:0.7rem;"><i data-lucide="rotate-ccw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 복구</button>` : ''}
                    </div>
                </div>`;
            }
        }
        
        container.innerHTML = html || '<p style="font-size:0.85rem;color:#6B5744;">삭제된 지갑이 없습니다.</p>';
        container.insertAdjacentHTML('beforebegin', `<div style="font-size:0.8rem;color:var(--accent);margin-bottom:0.3rem;">총 ${count}개 삭제된 지갑</div>`);
    } catch (e) {
        container.innerHTML = `<p style="color:red;">조회 실패: ${e.message}</p>`;
    }
}

// 삭제된 지갑 복구
async function adminRestoreWallet(userId, walletId) {
    if (!hasLevel(4)) return;
    if (!confirm('이 지갑을 복구하시겠습니까?')) return;
    try {
        await db.collection('users').doc(userId).collection('wallets').doc(walletId).update({
            status: firebase.firestore.FieldValue.delete(),
            deletedAt: firebase.firestore.FieldValue.delete(),
            restoredAt: new Date(),
            restoredBy: currentUser.email
        });
        await db.collection('admin_log').add({
            action: 'restore_wallet', adminEmail: currentUser.email,
            adminLevel: currentUserLevel, targetUserId: userId, walletId,
            timestamp: new Date()
        });
        showToast('<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 지갑 복구 완료', 'success');
        adminLoadDeletedWallets();
    } catch (e) {
        showToast('복구 실패: ' + e.message, 'error');
    }
}

async function loadAdminWallet() {
    if (!isAdmin()) return;
    
    const container = document.getElementById('admin-wallet-info');
    if (!container) { console.error('admin-wallet-info 없음'); return; }
    
    container.innerHTML = '<p style="color:var(--accent);"><i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 온체인 잔액 조회 중... (v4.0)</p>';
    
    try {
        // 1. Firestore에서 관리자 지갑 주소
        console.log('🔍 Admin wallet: Firestore 조회 시작');
        const wallets = await db.collection('users').doc(currentUser.uid)
            .collection('wallets').limit(1).get();
        
        if (wallets.empty) {
            container.innerHTML = '<p style="color:red;"><i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Firestore에 지갑 없음</p>';
            return;
        }
        
        const adminWalletData = wallets.docs[0].data();
        const adminAddress = adminWalletData.walletAddress;
        console.log('🔍 Admin wallet address:', adminAddress);
        
        if (!adminAddress) {
            container.innerHTML = '<p style="color:red;"><i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> walletAddress 필드 없음</p>';
            return;
        }
        
        // 2. 온체인 잔액 조회
        console.log('🔍 온체인 잔액 조회 시작...');
        const balances = await getAllOnchainBalances(adminAddress);
        console.log('🔍 잔액:', balances);
        
        // 3. POL 잔액 (가스비)
        const maticBalance = await web3.eth.getBalance(adminAddress);
        const maticFormatted = parseFloat(web3.utils.fromWei(maticBalance, 'ether')).toFixed(4);
        console.log('🔍 POL:', maticFormatted);
        
        container.innerHTML = `
            <div style="font-size:0.8rem; color:var(--accent); margin-bottom:0.5rem;">
                <i data-lucide="link" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> <span style="font-family:monospace;">${adminAddress.slice(0,6)}...${adminAddress.slice(-4)}</span>
                <span style="margin-left:0.5rem; color:#8e24aa;">Polygon</span>
            </div>
            <div style="display:flex; gap:0.8rem; flex-wrap:wrap; margin-bottom:0.5rem;">
                <div style="background:#F7F3ED; padding:0.6rem 1rem; border-radius:6px; text-align:center; min-width:80px;">
                    <div style="font-size:0.7rem; color:#C4841D;">CRNY</div>
                    <strong style="font-size:1.2rem;">${balances.crny.toLocaleString(undefined, {maximumFractionDigits:2})}</strong>
                </div>
                <div style="background:#F7F3ED; padding:0.6rem 1rem; border-radius:6px; text-align:center; min-width:80px;">
                    <div style="font-size:0.7rem; color:#5B7B8C;">FNC</div>
                    <strong style="font-size:1.2rem;">${balances.fnc.toLocaleString(undefined, {maximumFractionDigits:2})}</strong>
                </div>
                <div style="background:#F7F3ED; padding:0.6rem 1rem; border-radius:6px; text-align:center; min-width:80px;">
                    <div style="font-size:0.7rem; color:#6B8F3C;">CRFN</div>
                    <strong style="font-size:1.2rem;">${balances.crfn.toLocaleString(undefined, {maximumFractionDigits:2})}</strong>
                </div>
                <div style="background:#F7F3ED; padding:0.6rem 1rem; border-radius:6px; text-align:center; min-width:80px;">
                    <div style="font-size:0.7rem; color:#6a1b9a;">POL (가스)</div>
                    <strong style="font-size:1.2rem;">${maticFormatted}</strong>
                </div>
            </div>
            <button onclick="loadAdminWallet()" style="background:var(--accent); color:#FFF8F0; border:none; padding:0.4rem 0.8rem; border-radius:4px; cursor:pointer; font-size:0.8rem;"><i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 새로고침</button>
        `;
        
        // 전역에 저장
        window.adminWalletAddress = adminAddress;
        window.adminWalletId = wallets.docs[0].id;
        
    } catch (error) {
        console.error('Admin wallet load error:', error);
        container.innerHTML = `<p style="color:red;">잔액 조회 실패: ${error.message}</p>
            <button onclick="loadAdminWallet()" style="background:var(--accent); color:#FFF8F0; border:none; padding:0.4rem 0.8rem; border-radius:4px; cursor:pointer; font-size:0.8rem; margin-top:0.5rem;"><i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 다시 시도</button>`;
    }
}

// Admin: 온체인 ERC-20 토큰 전송
async function adminSendToken() {
    if (!isAdmin()) return;
    
    const email = document.getElementById('admin-send-email').value;
    const tokenKey = document.getElementById('admin-send-token').value;
    const amount = parseFloat(document.getElementById('admin-send-amount').value);
    
    if (!email || !amount || amount <= 0) {
        showToast(t('admin.enter_email_amount','이메일과 수량을 입력하세요'), 'info');
        return;
    }
    
    try {
        // 받는 사람 찾기
        const users = await db.collection('users').where('email', '==', email).get();
        if (users.empty) {
            showToast('사용자를 찾을 수 없습니다: ' + email, 'info');
            return;
        }
        
        const targetUser = users.docs[0];
        const targetUserId = targetUser.id;
        
        // 받는 사람의 지갑 주소 찾기
        const wallets = await db.collection('users').doc(targetUserId)
            .collection('wallets').limit(1).get();
        
        if (wallets.empty) {
            showToast('사용자의 지갑을 찾을 수 없습니다', 'error');
            return;
        }
        
        const targetWalletData = wallets.docs[0].data();
        const toAddress = targetWalletData.walletAddress;
        
        if (!toAddress) {
            showToast('받는 사람의 Polygon 지갑 주소가 없습니다', 'info');
            return;
        }
        
        // 관리자 private key 가져오기
        const adminWallets = await db.collection('users').doc(currentUser.uid)
            .collection('wallets').limit(1).get();
        
        if (adminWallets.empty) {
            showToast('관리자 지갑을 찾을 수 없습니다', 'error');
            return;
        }
        
        const adminWalletData = adminWallets.docs[0].data();
        const fromPrivateKey = adminWalletData.privateKey;
        const fromAddress = adminWalletData.walletAddress;
        
        if (!fromPrivateKey) {
            showToast('관리자 지갑의 개인키가 없습니다', 'info');
            return;
        }
        
        // 온체인 잔액 확인
        const balance = await getOnchainBalance(fromAddress, tokenKey);
        if (balance < amount) {
            showToast(`온체인 잔액 부족!\n보유: ${balance.toFixed(4)} ${tokenKey.toUpperCase()}\n필요: ${amount}`, 'error');
            return;
        }
        
        // MATIC 잔액 확인 (가스비)
        const maticBalance = await web3.eth.getBalance(fromAddress);
        const maticFormatted = parseFloat(web3.utils.fromWei(maticBalance, 'ether'));
        if (maticFormatted < 0.01) {
            showToast(`<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> POL(MATIC) 잔액 부족! 가스비가 필요합니다.\n보유: ${maticFormatted.toFixed(4)} POL\n최소 0.01 POL 필요`, 'error');
            return;
        }
        
        const tokenSymbol = tokenKey.toUpperCase();
        if (!window.confirm(
            `온체인 토큰 전송\n\n` +
            `보내는 사람: ${fromAddress.slice(0,6)}...${fromAddress.slice(-4)}\n` +
            `받는 사람: ${email}\n` +
            `  (${toAddress.slice(0,6)}...${toAddress.slice(-4)})\n` +
            `토큰: ${amount} ${tokenSymbol}\n` +
            `체인: Polygon\n\n` +
            `<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 온체인 트랜잭션은 취소할 수 없습니다.\n진행하시겠습니까?`
        )) return;
        
        // 전송 진행 UI
        const sendBtn = document.querySelector('[onclick="adminSendToken()"]');
        if (sendBtn) {
            sendBtn.textContent = '⏳ 전송 중...';
            sendBtn.disabled = true;
        }
        
        // 온체인 전송
        const receipt = await sendOnchainToken(fromPrivateKey, toAddress, tokenKey, amount);
        
        // Firestore에도 기록 (내부 잔액 동기화)
        const targetBalances = targetWalletData.balances || {};
        await db.collection('users').doc(targetUserId)
            .collection('wallets').doc(wallets.docs[0].id)
            .update({
                [`balances.${tokenKey}`]: (targetBalances[tokenKey] || 0) + amount
            });
        
        // 거래 기록
        await db.collection('transactions').add({
            from: currentUser.uid,
            fromEmail: ADMIN_EMAIL,
            fromAddress: fromAddress,
            to: targetUserId,
            toEmail: email,
            toAddress: toAddress,
            amount: amount,
            token: tokenSymbol,
            type: 'onchain_transfer',
            txHash: receipt.transactionHash,
            chain: 'polygon',
            timestamp: new Date()
        });
        
        await db.collection('admin_log').add({
            action: 'onchain_send_token',
            adminEmail: currentUser.email,
            targetEmail: email,
            token: tokenSymbol,
            amount: amount,
            txHash: receipt.transactionHash,
            timestamp: new Date()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 온체인 전송 완료! ${amount} ${tokenSymbol} → ${email}`, 'success');
        
        document.getElementById('admin-send-email').value = '';
        document.getElementById('admin-send-amount').value = '1';
        loadAdminWallet();
        
    } catch (error) {
        console.error('온체인 전송 실패:', error);
        showToast('전송 실패: ' + error.message, 'info');
    } finally {
        const sendBtn = document.querySelector('[onclick="adminSendToken()"]');
        if (sendBtn) {
            sendBtn.textContent = '보내기';
            sendBtn.disabled = false;
        }
    }
}

// 관리자: 모든 챌린지의 참가자 목록 로드
async function loadAdminParticipants() {
    if (!isAdmin()) return;
    
    const container = document.getElementById('admin-participants-list');
    container.innerHTML = '<p style="color:var(--accent);">로딩 중...</p>';
    
    try {
        // 모든 챌린지 가져오기
        const challenges = await db.collection('prop_challenges')
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();
        
        if (challenges.empty) {
            container.innerHTML = '<p style="color:var(--accent);">챌린지가 없습니다.</p>';
            return;
        }
        
        let html = '';
        
        for (const challengeDoc of challenges.docs) {
            const challenge = challengeDoc.data();
            const challengeId = challengeDoc.id;
            
            // 해당 챌린지의 참가자 가져오기
            const participants = await db.collection('prop_challenges').doc(challengeId)
                .collection('participants')
                .get();
            
            html += `
                <div style="border:1px solid var(--border); border-radius:8px; padding:1rem; margin-bottom:1rem;">
                    <h4 style="margin-bottom:0.5rem;"><i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${challenge.title || '챌린지'} <span style="font-size:0.75rem; color:var(--accent);">(${challengeId.slice(0,8)})</span></h4>
                    <p style="font-size:0.8rem; color:var(--accent); margin-bottom:0.8rem;">참가자: ${participants.size}명</p>
            `;
            
            if (participants.empty) {
                html += '<p style="font-size:0.85rem; color:var(--accent);">참가자 없음</p>';
            } else {
                for (const pDoc of participants.docs) {
                    const p = pDoc.data();
                    const participantId = pDoc.id;
                    const openTrades = (p.trades || []).filter(t => t.status === 'open');
                    const initial = p.initialBalance || 100000;
                    const current = p.currentBalance || 100000;
                    const pnl = current - initial;
                    const pnlColor = pnl >= 0 ? '#3D2B1F' : '#cc0000';
                    const isSuspended = p.adminSuspended || false;
                    const isLocked = p.dailyLocked || false;
                    
                    let statusBadge = '🟢 정상';
                    if (isSuspended) statusBadge = '<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 관리자 중단';
                    else if (isLocked) statusBadge = '<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 일일 제한';
                    
                    html += `
                        <div style="background:var(--bg); padding:0.8rem; border-radius:6px; margin-bottom:0.5rem; border-left:3px solid ${isSuspended ? '#cc0000' : '#3D2B1F'};">
                            <div style="display:flex; justify-content:space-between; align-items:start; flex-wrap:wrap; gap:0.5rem;">
                                <div>
                                    <strong style="font-size:0.9rem;">${p.email || p.userId || '알 수 없음'}</strong>
                                    <span style="font-size:0.75rem; margin-left:0.5rem;">${statusBadge}</span>
                                    <div style="font-size:0.8rem; color:var(--accent); margin-top:0.3rem;">
                                        잔액: $${current.toLocaleString()} | 
                                        손익: <span style="color:${pnlColor}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)}</span> | 
                                        포지션: ${openTrades.length}개
                                    </div>
                                    <div style="font-size:0.75rem; color:var(--accent); margin-top:0.2rem;">
                                        일일 PnL: <span style="color:${(p.dailyPnL || 0) < 0 ? '#cc0000' : '#3D2B1F'}">$${(p.dailyPnL || 0).toFixed(2)}</span> / 
                                        일일한도: <span style="font-weight:700;">$${p.dailyLossLimit || 500}</span> · 
                                        청산한도: <span style="font-weight:700;">$${(p.maxDrawdown || 3000).toLocaleString()}</span>
                                        ${p.copyAccounts > 1 ? ` · <span style="color:#C4841D; font-weight:700;">카피: ${p.copyAccounts}계정</span>` : ''}
                                        ${p.tradingTier ? ` · <span style="color:#8B6914;">MNQ×${p.tradingTier.MNQ||0} NQ×${p.tradingTier.NQ||0}</span>` : ''}
                                    </div>
                                    ${isSuspended ? `<div style="font-size:0.75rem; color:#cc0000; margin-top:0.2rem;">사유: ${p.suspendReason || '-'}</div>` : ''}
                                </div>
                                <div style="display:flex; gap:0.3rem; flex-wrap:wrap;">
                                    ${openTrades.length > 0 ? `
                                        <button onclick="adminForceCloseAll('${p.userId}', '${participantId}', '${challengeId}')" 
                                            style="background:#cc0000; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                            💥 강제 청산
                                        </button>
                                    ` : ''}
                                    ${!isSuspended ? `
                                        <button onclick="adminSuspendTrading('${participantId}', '${challengeId}')" 
                                            style="background:#C4841D; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                            <i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 거래 중단
                                        </button>
                                    ` : `
                                        <button onclick="adminResumeTrading('${participantId}', '${challengeId}')" 
                                            style="background:#6B8F3C; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                            <i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 중단 해제
                                        </button>
                                    `}
                                    ${isLocked ? `
                                        <button onclick="adminUnlockTrading('${participantId}', '${challengeId}')" 
                                            style="background:#5B7B8C; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                            <i data-lucide="unlock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 잠금 해제
                                        </button>
                                    ` : ''}
                                    <button onclick="adminAdjustDailyLimit('${participantId}', '${challengeId}')" 
                                        style="background:#6B5744; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                        <i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 일일한도
                                    </button>
                                    <button onclick="adminAdjustMaxDrawdown('${participantId}', '${challengeId}')" 
                                        style="background:#455A64; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                        <i data-lucide="skull" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 청산한도
                                    </button>
                                    <button onclick="adminAdjustBalance('${participantId}', '${challengeId}')" 
                                        style="background:#795548; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                        <i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 잔액 조정
                                    </button>
                                    <button onclick="adminAdjustCopyAccounts('${participantId}', '${challengeId}')" 
                                        style="background:#C4841D; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                        <i data-lucide="clipboard-list" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 카피계정
                                    </button>
                                    <button onclick="adminAdjustTradingTier('${participantId}', '${challengeId}')" 
                                        style="background:#8B6914; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                        <i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 거래티어
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }
            }
            
            html += '</div>';
        }
        
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<p style="color:red;">로드 실패: ${error.message}</p>`;
        console.error('Admin participants load error:', error);
    }
}

// 관리자: 활동 로그 로드
async function loadAdminLog() {
    if (!isAdmin()) return;
    
    const container = document.getElementById('admin-log-list');
    container.innerHTML = '<p style="color:var(--accent);">로딩 중...</p>';
    
    try {
        const logs = await db.collection('admin_log')
            .orderBy('timestamp', 'desc')
            .limit(20)
            .get();
        
        if (logs.empty) {
            container.innerHTML = '<p style="color:var(--accent);">로그가 없습니다.</p>';
            return;
        }
        
        let html = '';
        logs.forEach(doc => {
            const log = doc.data();
            const time = log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString('ko-KR') : '-';
            
            let actionText = '';
            let actionColor = '';
            switch (log.action) {
                case 'force_close_all':
                    actionText = '💥 강제 청산';
                    actionColor = '#cc0000';
                    break;
                case 'suspend_trading':
                    actionText = '<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 거래 중단';
                    actionColor = '#C4841D';
                    break;
                case 'resume_trading':
                    actionText = '<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 중단 해제';
                    actionColor = '#6B8F3C';
                    break;
                default:
                    actionText = log.action;
                    actionColor = '#6B5744';
            }
            
            html += `
                <div style="padding:0.6rem; border-bottom:1px solid var(--border); font-size:0.85rem;">
                    <span style="color:${actionColor}; font-weight:600;">${actionText}</span>
                    <span style="color:var(--accent); margin-left:0.5rem;">${time}</span>
                    ${log.reason ? `<div style="font-size:0.75rem; color:var(--accent); margin-top:0.2rem;">사유: ${log.reason}</div>` : ''}
                    ${log.totalPnL !== undefined ? `<div style="font-size:0.75rem; margin-top:0.2rem;">손익: $${log.totalPnL.toFixed(2)}</div>` : ''}
                </div>
            `;
        });
        
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<p style="color:red;">로그 로드 실패: ${error.message}</p>`;
    }
}

// ========== PROP TRADING ==========
async function loadPropTrading() {
    const container = document.getElementById('trading-challenges');
    container.innerHTML = '<p style="text-align:center; padding:2rem;">로딩 중...</p>';
    
    try {
        const challenges = await db.collection('prop_challenges')
            .where('status', '==', 'active')
            .get();
        
        container.innerHTML = '';
        
        if (challenges.empty) {
            container.innerHTML = `
                <div style="text-align:center; padding:3rem; color:var(--accent);">
                    <p style="font-size:3rem; margin-bottom:1rem;"><i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></p>
                    <p>진행 중인 챌린지가 없습니다</p>
                </div>
            `;
            return;
        }
        
        for (const doc of challenges.docs) {
            const ch = doc.data();
            const tiers = ch.tiers || {};
            const tierKeys = Object.keys(tiers).sort();
            
            // 티어 카드 생성
            let tierHTML = '';
            for (const key of tierKeys) {
                const t = tiers[key];
                tierHTML += `
                    <div style="background:var(--bg); padding:0.8rem; border-radius:8px; text-align:center; border:1px solid var(--border);">
                        <div style="font-size:1.3rem; font-weight:800; color:#8B2BE2;">${key}군</div>
                        <div style="font-size:1.4rem; font-weight:700; color:#3D2B1F; margin:0.3rem 0;">${t.deposit} CRTD</div>
                        <div style="font-size:0.75rem; color:var(--accent); line-height:1.6;">
                            <i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> $${(t.account||100000).toLocaleString()} 계좌<br>
                            <i data-lucide="skull" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> -$${(t.liquidation||3000).toLocaleString()} 청산<br>
                            <i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> +$${(t.profitThreshold||1000).toLocaleString()}~ → CRTD<br>
                            <i data-lucide="gem" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${(t.withdrawUnit||1000).toLocaleString()} 단위 인출
                        </div>
                        <button onclick="joinChallenge('${doc.id}','${key}')" class="btn-primary" style="width:100%; margin-top:0.5rem; padding:0.6rem; font-size:0.9rem;">
                            <i data-lucide="rocket" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${key}군 참가
                        </button>
                    </div>
                `;
            }
            
            // 티어가 없으면 기본값 (하위 호환)
            if (tierKeys.length === 0) {
                tierHTML = `
                    <div style="background:var(--bg); padding:0.8rem; border-radius:8px; text-align:center;">
                        <div style="font-size:1.2rem; font-weight:700; color:#3D2B1F;">${ch.entryFeeCRTD || 100} CRTD</div>
                        <button onclick="joinChallenge('${doc.id}','A')" class="btn-primary" style="width:100%; margin-top:0.5rem; padding:0.7rem;">
                            <i data-lucide="rocket" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 참가
                        </button>
                    </div>
                `;
            }
            
            const card = document.createElement('div');
            card.style.cssText = 'background:#FFF8F0; padding:1.5rem; border-radius:12px; margin-bottom:1rem; border:2px solid var(--border);';
            card.innerHTML = `
                <h3 style="margin-bottom:0.3rem;">${ch.name}</h3>
                <p style="color:var(--accent); margin-bottom:0.8rem; font-size:0.85rem;">${ch.description || ''}</p>
                
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:0.6rem; margin-bottom:0.8rem;">
                    ${tierHTML}
                </div>
                
                <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--accent); padding-top:0.5rem; border-top:1px solid var(--border);">
                    <span><i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${ch.allowedProduct || 'MNQ'} | 🔴 일일 -$${ch.dailyLossLimit || 500}</span>
                    <span><i data-lucide="users" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${ch.participants || 0}명 참가중</span>
                </div>
            `;
            container.appendChild(card);
        }
    } catch (error) {
        console.error('Load challenges error:', error);
        container.innerHTML = `<p style="text-align:center; color:red;">로딩 실패: ${error.code || error.message}</p>`;
    }
}

async function showCreateChallenge() {
    if (!isAdmin()) {
        showToast('관리자만 챌린지를 생성할 수 있습니다', 'info');
        return;
    }
    
    const formHTML = `
        <div id="create-challenge-form" style="background:#FFF8F0; padding:1.5rem; border-radius:12px; margin-top:1rem; border:2px solid var(--accent);">
            <h3 style="margin-bottom:1rem;"><i data-lucide="plus-circle" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> CRTD 프랍 챌린지 생성</h3>
            
            <div style="display:grid; gap:0.8rem;">
                <div>
                    <label style="font-size:0.85rem; font-weight:600;">챌린지 이름</label>
                    <input type="text" id="ch-name" value="교육게임 v1" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                </div>
                
                <!-- ★ 티어 설정 -->
                <div style="background:linear-gradient(135deg, rgba(139,105,20,0.05), rgba(107,87,68,0.05)); padding:1rem; border-radius:8px; border:1px solid rgba(139,105,20,0.2);">
                    <h4 style="margin-bottom:0.8rem;"><i data-lucide="gem" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> CRTD 티어 설정</h4>
                    <p style="font-size:0.75rem; color:var(--accent); margin-bottom:0.8rem;">사용하지 않을 티어는 참가비를 0으로 설정</p>
                    
                    <div style="overflow-x:auto; -webkit-overflow-scrolling:touch; max-width:100%;">
                        <table style="min-width:580px; border-collapse:collapse; font-size:0.82rem;">
                            <thead>
                                <tr style="background:var(--bg);">
                                    <th style="padding:0.4rem; text-align:left;">티어</th>
                                    <th style="padding:0.4rem;">참가비<br>(CRTD)</th>
                                    <th style="padding:0.4rem;">가상계좌<br>($)</th>
                                    <th style="padding:0.4rem;">청산선<br>(-$)</th>
                                    <th style="padding:0.4rem;">수익기준<br>(+$)</th>
                                    <th style="padding:0.4rem;">인출단위<br>(CRTD)</th>
                                    <th style="padding:0.4rem;">MNQ<br>최대</th>
                                    <th style="padding:0.4rem;">NQ<br>최대</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style="padding:0.4rem; font-weight:700;">🅰️ A군</td>
                                    <td><input type="number" id="tier-a-deposit" value="100" style="width:60px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-a-account" value="100000" style="width:75px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-a-liq" value="3000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-a-profit" value="1000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-a-unit" value="1000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-a-mnq" value="3" min="0" style="width:45px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-a-nq" value="0" min="0" style="width:45px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                </tr>
                                <tr style="background:var(--bg);">
                                    <td style="padding:0.4rem; font-weight:700;">🅱️ B군</td>
                                    <td><input type="number" id="tier-b-deposit" value="200" style="width:60px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-account" value="150000" style="width:75px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-liq" value="5000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-profit" value="1500" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-unit" value="1000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-mnq" value="5" min="0" style="width:45px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-nq" value="1" min="0" style="width:45px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                </tr>
                                <tr>
                                    <td style="padding:0.4rem; font-weight:700;">🅲 C군</td>
                                    <td><input type="number" id="tier-c-deposit" value="500" style="width:60px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-c-account" value="300000" style="width:75px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-c-liq" value="10000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-c-profit" value="3000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-c-unit" value="1000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-c-mnq" value="10" min="0" style="width:45px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-c-nq" value="3" min="0" style="width:45px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem;">
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;"><i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 상품 제한</label>
                        <select id="ch-product" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                            <option value="MNQ">MNQ (마이크로) 전용</option>
                            <option value="NQ">NQ (미니) 전용</option>
                            <option value="BOTH">MNQ + NQ 모두</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;"><i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 최대 계약 수</label>
                        <input type="number" id="ch-max-contracts" value="1" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem;">
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;">🔴 일일 손실 한도 ($)</label>
                        <input type="number" id="ch-daily-limit" value="500" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;"><i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 최대 동시 포지션</label>
                        <input type="number" id="ch-max-positions" value="5" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem;">
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;">⏳ 기간 (일)</label>
                        <input type="number" id="ch-duration" value="30" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;"><i data-lucide="clock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 정산</label>
                        <select id="ch-settlement" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem;">
                            <option value="EOD">EOD (End of Day)</option>
                            <option value="WEEKLY">주간</option>
                            <option value="MONTHLY">월간</option>
                        </select>
                    </div>
                </div>
                
                <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
                    <button onclick="submitCreateChallenge()" class="btn-primary" style="flex:1; padding:0.8rem;"><i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 챌린지 생성</button>
                    <button onclick="document.getElementById('create-challenge-form').remove()" style="flex:0.5; padding:0.8rem; background:var(--border); border:none; border-radius:6px; cursor:pointer;">취소</button>
                </div>
            </div>
        </div>
    `;
    
    const existing = document.getElementById('create-challenge-form');
    if (existing) existing.remove();
    
    const container = document.getElementById('trading-challenges');
    if (container) {
        container.insertAdjacentHTML('afterend', formHTML);
    }
}

function readTierInput(prefix) {
    const deposit = parseFloat(document.getElementById(`tier-${prefix}-deposit`).value) || 0;
    if (deposit <= 0) return null; // 0이면 비활성
    return {
        deposit: deposit,
        account: parseFloat(document.getElementById(`tier-${prefix}-account`).value) || 100000,
        liquidation: parseFloat(document.getElementById(`tier-${prefix}-liq`).value) || 3000,
        profitThreshold: parseFloat(document.getElementById(`tier-${prefix}-profit`).value) || 1000,
        withdrawUnit: parseFloat(document.getElementById(`tier-${prefix}-unit`).value) || 1000,
        mnqMax: parseInt(document.getElementById(`tier-${prefix}-mnq`)?.value) || 1,
        nqMax: parseInt(document.getElementById(`tier-${prefix}-nq`)?.value) || 0
    };
}

async function submitCreateChallenge() {
    if (!isAdmin()) return;
    
    const name = document.getElementById('ch-name').value;
    if (!name) { showToast('챌린지 이름을 입력하세요', 'info'); return; }
    
    // 티어 읽기
    const tiers = {};
    const tierA = readTierInput('a'); if (tierA) tiers.A = tierA;
    const tierB = readTierInput('b'); if (tierB) tiers.B = tierB;
    const tierC = readTierInput('c'); if (tierC) tiers.C = tierC;
    
    if (Object.keys(tiers).length === 0) {
        showToast('최소 1개 티어의 참가비를 설정하세요', 'info');
        return;
    }
    
    try {
        const challengeData = {
            name: name,
            description: name,
            tiers: tiers,
            // 공통 설정
            allowedProduct: document.getElementById('ch-product').value || 'MNQ',
            maxContracts: parseInt(document.getElementById('ch-max-contracts').value) || 1,
            dailyLossLimit: parseFloat(document.getElementById('ch-daily-limit').value) || 500,
            maxPositions: parseInt(document.getElementById('ch-max-positions').value) || 5,
            duration: parseInt(document.getElementById('ch-duration').value) || 30,
            settlement: document.getElementById('ch-settlement').value || 'EOD',
            rewardToken: 'CRTD',
            participants: 0,
            totalPool: 0,
            status: 'active',
            createdBy: currentUser.email,
            createdAt: new Date()
        };
        
        await db.collection('prop_challenges').add(challengeData);
        
        const tierSummary = Object.entries(tiers).map(([k,v]) => `${k}군=${v.deposit}CRTD`).join(', ');
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 챌린지 생성 완료!\n\n${name}\n티어: ${tierSummary}\n상품: ${challengeData.allowedProduct}`, 'success');
        
        document.getElementById('create-challenge-form')?.remove();
        loadPropTrading();
    } catch (error) {
        showToast('생성 실패: ' + error.message, 'info');
    }
}

async function joinChallenge(challengeId, tierKey) {
    console.log('🎯 joinChallenge called:', challengeId, tierKey);
    showToast('⏳ 참가 처리 중...', 'info', 2000);
    
    if (!currentUser) { showToast('<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 로그인이 필요합니다', 'error'); return; }
    
    try {
    const challenge = await db.collection('prop_challenges').doc(challengeId).get();
    if (!challenge.exists) { showToast('<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 챌린지를 찾을 수 없습니다', 'error'); return; }
    const data = challenge.data();
    
    // ★ 티어 정보 로드
    const tiers = data.tiers || {};
    const tier = tiers[tierKey] || { deposit: data.entryFeeCRTD || 100, account: data.initialBalance || 100000, liquidation: 3000, profitThreshold: 1000, withdrawUnit: 1000 };
    
    // 중복 참가 체크
    const existing = await db.collection('prop_challenges').doc(challengeId)
        .collection('participants').where('userId', '==', currentUser.uid).where('status', '==', 'active').get();
    if (!existing.empty) {
        showToast('<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 이미 이 챌린지에 참가 중입니다', 'warning');
        return;
    }
    
    // CRTD 잔고 확인 (offchainBalances는 users 루트 문서에 저장됨)
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const userData = userDoc.data() || {};
    const offchain = userData.offchainBalances || {};
    const crtdBalance = offchain.crtd || 0;
    
    console.log('🔍 joinChallenge 잔고체크:', { uid: currentUser.uid, offchain, crtdBalance, required: tier.deposit });
    
    if (crtdBalance < tier.deposit) {
        showToast(`<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> CRTD 잔액 부족 — 필요: ${tier.deposit}, 보유: ${crtdBalance}`, 'error', 5000);
        return;
    }
    
    const productText = data.allowedProduct === 'BOTH' ? 'MNQ + NQ' : (data.allowedProduct || 'MNQ');
    
    const confirmMsg = 
        `<i data-lucide="clipboard-list" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${data.name} (${tierKey}군)\n\n` +
        `<i data-lucide="gem" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 참가비: ${tier.deposit} CRTD\n` +
        `<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 가상 계좌: $${tier.account.toLocaleString()}\n` +
        `<i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 상품: ${productText}\n` +
        `<i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 포지션: 최대 ${data.maxPositions || 5}개\n\n` +
        `── 프랍 규칙 ──\n` +
        `<i data-lucide="skull" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> -$${tier.liquidation.toLocaleString()} → 계좌 청산 (${tier.deposit} CRTD 소멸)\n` +
        `<i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> +$${tier.profitThreshold.toLocaleString()} 초과분 → 1:1 CRTD 변환\n` +
        `<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${tier.withdrawUnit.toLocaleString()} CRTD 단위 인출 가능\n` +
        `🔴 일일 한도: -$${data.dailyLossLimit || 500}\n\n` +
        `참가하시겠습니까?`;
    
    const ok = typeof showConfirmModal === 'function' 
        ? await showConfirmModal('🎯 CRTD 프랍 트레이딩', confirmMsg)
        : window.confirm(confirmMsg);
    
    if (!ok) return;
    
    try {
        // CRTD 차감
        await spendOffchainPoints('crtd', tier.deposit, `챌린지 참가: ${data.name} (${tierKey}군)`);
        
        // 참가자 추가
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').add({
                userId: currentUser.uid,
                email: currentUser.email,
                walletId: currentWalletId,
                joinedAt: new Date(),
                // ★ 티어 정보
                tier: tierKey,
                crtdDeposit: tier.deposit,
                liquidation: tier.liquidation,
                profitThreshold: tier.profitThreshold,
                withdrawUnit: tier.withdrawUnit,
                crtdWithdrawn: 0,
                // 가상 계좌
                initialBalance: tier.account,
                currentBalance: tier.account,
                // 공통 설정
                allowedProduct: data.allowedProduct || 'MNQ',
                tradingTier: tier.mnqMax !== undefined ? { MNQ: tier.mnqMax || 1, NQ: tier.nqMax || 0 } : (data.tradingTier || null),
                maxContracts: Math.max(tier.mnqMax || 1, tier.nqMax || 0, data.maxContracts || 1),
                copyAccounts: 1,
                maxPositions: data.maxPositions || 5,
                dailyLossLimit: data.dailyLossLimit || 500,
                maxDrawdown: tier.liquidation,
                // 트레이딩 상태
                profitPercent: 0,
                dailyPnL: 0,
                totalPnL: 0,
                trades: [],
                status: 'active',
                lastEOD: new Date()
            });
        
        await db.collection('prop_challenges').doc(challengeId).update({
            participants: (data.participants || 0) + 1,
            totalPool: (data.totalPool || 0) + tier.deposit
        });
        
        // 거래 기록
        await db.collection('transactions').add({
            from: currentUser.uid, fromEmail: currentUser.email,
            to: 'system:challenge', amount: tier.deposit, token: 'CRTD',
            type: 'challenge_entry', challengeId: challengeId, tier: tierKey,
            timestamp: new Date()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${tierKey}군 참가 완료! ${tier.deposit} CRTD 차감`, 'success', 5000);
        
        // [v13] 챌린지 참가 시 소개자 수수료 제거 — 회원가입 보상으로 통합
        // await distributeReferralReward(currentUser.uid, Math.floor(tier.deposit * 0.1), 'CRTD');
        
        loadUserWallet();
        loadPropTrading();
        loadTradingDashboard();
    } catch (error) {
        console.error('Join error:', error);
        showToast('<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 참가 실패: ' + error.message, 'error', 5000);
    }
    } catch (outerError) {
        console.error('joinChallenge outer error:', outerError);
        showToast('<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 오류: ' + outerError.message, 'error', 5000);
    }
}

// ========== ART - 디지털 아트 거래소 ==========


// (ART 코드 → app-art.js로 분리됨)

// ========== MALL - 쇼핑몰 ==========

const MALL_CATEGORIES = { present:'<i data-lucide="sparkles" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 프레즌트', doctor:'💊 포닥터', medical:'<i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 메디컬', avls:'🎬 AVLs', solution:'<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 프라이빗', architect:'🏗️ 아키텍트', mall:'<i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 크라우니몰', designers:'👗 디자이너스', other:'<i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 기타' };

async function registerProduct() {
    if (!currentUser) { showToast('로그인 필요', 'warning'); return; }
    const title = document.getElementById('product-title').value.trim();
    const price = parseFloat(document.getElementById('product-price').value);
    const imageFiles = document.getElementById('product-image').files;
    if (!title || !price) { showToast('상품명과 가격을 입력하세요', 'warning'); return; }
    if (!imageFiles || imageFiles.length === 0) { showToast('상품 이미지를 선택하세요', 'warning'); return; }
    if (imageFiles.length > 5) { showToast('이미지는 최대 5장까지 가능합니다', 'warning'); return; }
    
    try {
        // Multi-image: resize all images
        const images = [];
        for (let i = 0; i < Math.min(imageFiles.length, 5); i++) {
            const resized = await fileToBase64Resized(imageFiles[i], 400);
            images.push(resized);
        }
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        
        await db.collection('products').add({
            title, description: document.getElementById('product-desc').value.trim(),
            category: document.getElementById('product-category').value,
            price, priceToken: 'CRGC',
            stock: parseInt(document.getElementById('product-stock').value) || 1,
            images, // 다중 이미지 배열
            imageData: images[0], // 하위 호환: 첫번째 이미지
            sellerId: currentUser.uid, sellerEmail: currentUser.email,
            sellerNickname: userDoc.data()?.nickname || '',
            sold: 0, status: (currentUser.email === 'kim.president.sk@gmail.com') ? 'active' : 'pending', createdAt: new Date()
        });
        
        showToast(`<i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> "${title}" 등록 완료!`, 'success');
        document.getElementById('product-title').value = '';
        document.getElementById('product-desc').value = '';
        document.getElementById('product-image').value = '';
        const preview = document.getElementById('product-image-preview');
        if (preview) preview.innerHTML = '';
        loadMallProducts();
    } catch (e) { showToast('등록 실패: ' + e.message, 'error'); }
}

// ========== 오프체인/CRNY 비율 관리 (수퍼관리자) ==========

// 현재 비율 로드 (토큰별 개별 비율)
async function loadExchangeRate() {
    try {
        const doc = await db.collection('admin_config').doc('exchange_rate').get();
        if (doc.exists) {
            const data = doc.data();
            const legacyRate = data.rate || 100;
            
            // Per-token rates
            window.OFFCHAIN_RATES = data.rates || {crtd: legacyRate, crac: legacyRate, crgc: legacyRate, creb: legacyRate};
            window.OFFCHAIN_RATE = legacyRate; // backward compat
            
            // Update UI inputs
            ['crtd','crac','crgc','creb'].forEach(t => {
                const el = document.getElementById('rate-' + t);
                if (el) el.value = window.OFFCHAIN_RATES[t] || legacyRate;
            });
            
            // History display (token info + reason)
            if (data.history && data.history.length > 0) {
                const histEl = document.getElementById('admin-rate-history');
                if (histEl) {
                    histEl.innerHTML = data.history.slice(-20).reverse().map(h => {
                        const date = h.timestamp?.toDate ? h.timestamp.toDate().toLocaleString('ko-KR') : new Date(h.timestamp).toLocaleString('ko-KR');
                        const tokenLabel = h.token ? h.token.toUpperCase() : '전체';
                        return `<div style="padding:0.5rem; background:var(--bg); border-radius:6px; margin-bottom:0.3rem; font-size:0.8rem;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div><span style="background:#F7F3ED; color:#5B7B8C; padding:0.1rem 0.4rem; border-radius:4px; font-size:0.7rem; font-weight:700;">${tokenLabel}</span> <strong>${h.oldRate} → ${h.newRate}</strong></div>
                                <span style="color:var(--accent); font-size:0.7rem;">${date}</span>
                            </div>
                            <div style="color:#6B5744; font-size:0.75rem; margin-top:0.2rem;"><i data-lucide="file-text" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${h.reason || '-'}</div>
                            <div style="color:var(--accent); font-size:0.7rem;">${h.adminEmail}</div>
                        </div>`;
                    }).join('');
                }
            }
        }
    } catch (e) {
        console.warn('비율 로드 실패:', e);
    }
}

// 비율 변경 요청 (토큰별 개별 비율, 2단계 확인)
async function requestRateChange() {
    if (!isSuperAdmin()) { showToast('수퍼관리자만 변경 가능합니다', 'warning'); return; }
    
    const reason = (document.getElementById('rate-change-reason')?.value || '').trim();
    if (!reason) { showToast('변경 사유를 입력하세요', 'warning'); return; }
    
    const tokens = ['crtd', 'crac', 'crgc', 'creb'];
    const currentRates = window.OFFCHAIN_RATES || {};
    const newRates = {};
    const changes = [];
    
    for (const t of tokens) {
        const val = parseInt(document.getElementById('rate-' + t)?.value);
        if (!val || val < 1 || val > 10000) {
            showToast(`${t.toUpperCase()} 비율이 유효하지 않습니다 (1~10,000)`, 'error');
            return;
        }
        newRates[t] = val;
        const oldVal = currentRates[t] || 100;
        if (val !== oldVal) {
            changes.push({token: t, oldRate: oldVal, newRate: val});
        }
    }
    
    if (changes.length === 0) { showToast('변경된 비율이 없습니다', 'info'); return; }
    
    const changeText = changes.map(c => `${c.token.toUpperCase()}: ${c.oldRate} → ${c.newRate}`).join('\n');
    const confirmed = await showConfirmModal('비율 변경 확인', `다음 비율이 변경됩니다:\n\n${changeText}\n\n사유: ${reason}\n\n모든 브릿지 거래에 즉시 적용됩니다.`);
    if (!confirmed) return;
    
    // 2차 확인
    const code = await showPromptModal('보안 확인', '"RATE" 를 정확히 입력하세요:', '');
    if (code !== 'RATE') { showToast('확인 코드 불일치. 변경 취소됨.', 'error'); return; }
    
    try {
        const doc = await db.collection('admin_config').doc('exchange_rate').get();
        const existingHistory = doc.exists ? (doc.data().history || []) : [];
        
        for (const c of changes) {
            existingHistory.push({
                token: c.token,
                oldRate: c.oldRate,
                newRate: c.newRate,
                reason: reason,
                adminEmail: currentUser.email,
                adminLevel: currentUserLevel,
                timestamp: new Date()
            });
        }
        
        await db.collection('admin_config').doc('exchange_rate').set({
            rates: newRates,
            rate: newRates.crtd, // legacy compat
            lastChangedBy: currentUser.email,
            lastChangedAt: new Date(),
            history: existingHistory
        });
        
        await db.collection('admin_log').add({
            action: 'exchange_rate_change',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            changes: changes,
            reason: reason,
            timestamp: new Date()
        });
        
        window.OFFCHAIN_RATES = newRates;
        window.OFFCHAIN_RATE = newRates.crtd;
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${changes.length}개 토큰 비율 변경 완료!`, 'success');
        document.getElementById('rate-change-reason').value = '';
        loadExchangeRate();
        
    } catch (e) {
        showToast('비율 변경 실패: ' + e.message, 'error');
    }
}

// ═══════════════════════════════════════════════════════
// 쿠폰 관리 (admin-tab-coupon)
// ═══════════════════════════════════════════════════════

async function createCoupon() {
    const name = (document.getElementById('coupon-name').value || '').trim();
    const code = (document.getElementById('coupon-code').value || '').trim().toUpperCase();
    const tokenKey = document.getElementById('coupon-token').value;
    const amount = parseInt(document.getElementById('coupon-amount').value);
    const maxUses = parseInt(document.getElementById('coupon-max-uses').value) || 0;
    const expiryVal = document.getElementById('coupon-expiry').value;
    const description = (document.getElementById('coupon-desc').value || '').trim();

    if (!name) { showToast('쿠폰 이름을 입력하세요', 'error'); return; }
    if (!code || code.length < 3) { showToast('쿠폰 코드는 3자 이상 영문/숫자로 입력하세요', 'error'); return; }
    if (!tokenKey) { showToast('토큰을 선택하세요', 'error'); return; }
    if (!amount || amount <= 0) { showToast('유효한 수량을 입력하세요', 'error'); return; }

    try {
        const existing = await db.collection('coupons').where('code', '==', code).get();
        if (!existing.empty) { showToast('이미 존재하는 쿠폰 코드입니다', 'error'); return; }

        await db.collection('coupons').add({
            name: name,
            code: code,
            tokenKey: tokenKey,
            amount: amount,
            maxUses: maxUses,
            usedCount: 0,
            expiresAt: expiryVal ? firebase.firestore.Timestamp.fromDate(new Date(expiryVal)) : null,
            createdBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            enabled: true,
            description: description
        });

        showToast('<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 쿠폰 생성 완료: ' + code, 'success');
        document.getElementById('coupon-name').value = '';
        document.getElementById('coupon-code').value = '';
        document.getElementById('coupon-amount').value = '';
        document.getElementById('coupon-desc').value = '';
        loadCouponList();
    } catch (e) {
        showToast(t('admin.coupon_fail','쿠폰 생성 실패: ') + e.message, 'error');
    }
}

async function loadCouponList() {
    const listEl = document.getElementById('coupon-list');
    if (!listEl) return;
    listEl.innerHTML = '<p>로딩 중...</p>';

    try {
        const snap = await db.collection('coupons').orderBy('createdAt', 'desc').get();
        if (snap.empty) { listEl.innerHTML = '<p style="color:#6B5744;">생성된 쿠폰이 없습니다</p>'; return; }

        const tokenNames = { crtd: 'CRTD', crac: 'CRAC', crgc: 'CRGC', creb: 'CREB' };
        let html = '<table style="width:100%; border-collapse:collapse; font-size:0.8rem;"><tr style="background:#F7F3ED;"><th style="padding:0.5rem; text-align:left;">쿠폰</th><th>토큰</th><th>수량</th><th>사용</th><th>상태</th><th>관리</th></tr>';

        snap.forEach(doc => {
            const c = doc.data();
            const expiry = c.expiresAt ? c.expiresAt.toDate().toLocaleDateString('ko-KR') : '무제한';
            const usageText = c.maxUses > 0 ? `${c.usedCount}/${c.maxUses}` : `${c.usedCount}/∞`;
            const statusColor = c.enabled ? '#6B8F3C' : '#B54534';
            const statusText = c.enabled ? '활성' : '비활성';
            const couponName = c.name || c.code;
            html += `<tr style="border-bottom:1px solid #E8E0D8;">
                <td style="padding:0.5rem;">
                    <div style="font-weight:700;">${couponName}</div>
                    <div style="font-size:0.7rem; color:#6B5744; font-family:monospace;">코드: ${c.code}</div>
                </td>
                <td style="text-align:center;">${tokenNames[c.tokenKey] || c.tokenKey}</td>
                <td style="text-align:center;">${c.amount.toLocaleString()}</td>
                <td style="text-align:center;">${usageText}</td>
                <td style="text-align:center; color:${statusColor}; font-weight:600;">${statusText}</td>
                <td style="text-align:center;">
                    <div style="display:flex; flex-direction:column; gap:3px; align-items:center;">
                        <button onclick="toggleCoupon('${doc.id}', ${!c.enabled})" style="padding:0.3rem 0.6rem; border:none; border-radius:4px; cursor:pointer; font-size:0.7rem; background:${c.enabled ? '#F7F3ED' : '#F7F3ED'}; color:${c.enabled ? '#B54534' : '#6B8F3C'}; width:100%;">${c.enabled ? '비활성화' : '활성화'}</button>
                        <button onclick="viewCouponLog('${doc.id}','${c.code}')" style="padding:0.3rem 0.6rem; border:none; border-radius:4px; cursor:pointer; font-size:0.7rem; background:#F7F3ED; color:#5B7B8C; width:100%;"><i data-lucide="scroll-text" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> 로그</button>
                        <button onclick="deleteCoupon('${doc.id}','${c.code}')" style="padding:0.3rem 0.6rem; border:none; border-radius:4px; cursor:pointer; font-size:0.7rem; background:#F7F3ED; color:#B54534; width:100%;"><i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 삭제</button>
                    </div>
                </td>
            </tr>`;
            if (c.description) {
                html += `<tr><td colspan="6" style="padding:0.2rem 0.5rem; font-size:0.7rem; color:#6B5744;"><i data-lucide="file-text" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${c.description} | 만료: ${expiry}</td></tr>`;
            }
        });
        html += '</table>';
        listEl.innerHTML = html;
    } catch (e) {
        listEl.innerHTML = '<p style="color:red;">로드 실패: ' + e.message + '</p>';
    }
}

async function toggleCoupon(couponId, enabled) {
    try {
        await db.collection('coupons').doc(couponId).update({ enabled: enabled });
        loadCouponList();
    } catch (e) {
        showToast('상태 변경 실패: ' + e.message, 'error');
    }
}

async function deleteCoupon(couponId, code) {
    if (typeof showConfirmModal === 'function') {
        showConfirmModal(`쿠폰 "${code}" 를 삭제하시겠습니까?\n사용 로그는 유지됩니다.`, async () => {
            try {
                await db.collection('coupons').doc(couponId).delete();
                showToast('<i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 쿠폰 삭제 완료', 'success');
                loadCouponList();
            } catch (e) { showToast('삭제 실패: ' + e.message, 'error'); }
        });
    } else {
        if (!confirm(`쿠폰 "${code}" 를 삭제하시겠습니까?`)) return;
        try {
            await db.collection('coupons').doc(couponId).delete();
            showToast('<i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 쿠폰 삭제 완료', 'success');
            loadCouponList();
        } catch (e) { showToast('삭제 실패: ' + e.message, 'error'); }
    }
}

async function viewCouponLog(couponId, code) {
    const section = document.getElementById('coupon-log-section');
    const listEl = document.getElementById('coupon-log-list');
    if (!section || !listEl) return;
    section.style.display = 'block';
    listEl.innerHTML = '<p>로딩 중...</p>';
    section.scrollIntoView({ behavior: 'smooth' });

    try {
        // coupon_logs 컬렉션에서 조회
        const snap = await db.collection('coupon_logs').where('couponId', '==', couponId).orderBy('usedAt', 'desc').limit(100).get();
        if (snap.empty) {
            // fallback: coupons/{id}/usage 서브컬렉션
            const snap2 = await db.collection('coupons').doc(couponId).collection('usage').orderBy('usedAt', 'desc').limit(100).get();
            if (snap2.empty) { listEl.innerHTML = `<p style="color:#6B5744;"><i data-lucide="scroll-text" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> "${code}" 사용 내역이 없습니다.</p>`; return; }
            renderCouponLog(snap2, listEl, code);
            return;
        }
        renderCouponLog(snap, listEl, code);
    } catch (e) {
        // index 없을 수 있으므로 orderBy 없이 재시도
        try {
            const snap = await db.collection('coupon_logs').where('couponId', '==', couponId).limit(100).get();
            if (snap.empty) { listEl.innerHTML = `<p style="color:#6B5744;"><i data-lucide="scroll-text" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> "${code}" 사용 내역이 없습니다.</p>`; return; }
            renderCouponLog(snap, listEl, code);
        } catch (e2) {
            listEl.innerHTML = `<p style="color:red;">로그 조회 실패: ${e2.message}</p>`;
        }
    }
}

function renderCouponLog(snap, listEl, code) {
    let html = `<p style="font-weight:700; margin-bottom:0.5rem;"><i data-lucide="scroll-text" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> "${code}" 사용 로그 (${snap.size}건)</p>`;
    html += '<table style="width:100%; border-collapse:collapse; font-size:0.75rem;"><tr style="background:#F7F3ED;"><th style="padding:0.4rem;">일시</th><th>사용자</th><th>수량</th></tr>';
    snap.forEach(doc => {
        const d = doc.data();
        const date = d.usedAt ? (d.usedAt.toDate ? d.usedAt.toDate() : new Date(d.usedAt)) : null;
        const dateStr = date ? date.toLocaleString('ko-KR') : '-';
        const user = d.userEmail || d.userId || '-';
        const amt = d.amount ? d.amount.toLocaleString() : '-';
        html += `<tr style="border-bottom:1px solid #E8E0D8;"><td style="padding:0.4rem; text-align:center;">${dateStr}</td><td style="text-align:center;">${user}</td><td style="text-align:center;">${amt}</td></tr>`;
    });
    html += '</table>';
    listEl.innerHTML = html;
}

function closeCouponLog() {
    const section = document.getElementById('coupon-log-section');
    if (section) section.style.display = 'none';
}

// ═══════════════════════════════════════════════════════
// 슈퍼관리자 계좌 관리 (오리지널 + 운영)
// ═══════════════════════════════════════════════════════

async function loadSuperAdminWallets() {
    if (!isSuperAdmin()) return;
    const container = document.getElementById('admin-tab-superwall');
    if (!container) return;
    
    container.style.display = 'block';
    container.innerHTML = '<div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;"><p style="color:var(--accent);"><i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 계좌 정보 로드 중...</p></div>';
    
    try {
        const uid = currentUser.uid;
        const walletsRef = db.collection('users').doc(uid).collection('wallets');
        
        // Load or create wallet docs
        const [originalDoc, operatingDoc, defaultDoc] = await Promise.all([
            walletsRef.doc('original').get(),
            walletsRef.doc('operating').get(),
            walletsRef.doc('default').get()
        ]);
        
        // Get active wallet setting
        const userDoc = await db.collection('users').doc(uid).get();
        const activeWallet = userDoc.data()?.activeWallet || 'default';
        
        const wallets = {
            original: originalDoc.exists ? originalDoc.data() : null,
            operating: operatingDoc.exists ? operatingDoc.data() : null,
            default: defaultDoc.exists ? defaultDoc.data() : null
        };
        
        // Format balances
        function formatBal(walletData) {
            if (!walletData) return '<span style="color:#6B5744;">미생성</span>';
            const bal = walletData.offchainBalances || walletData.balances || {};
            const entries = Object.entries(bal).filter(([,v]) => v > 0);
            if (entries.length === 0) return '<span style="color:#6B5744;">잔액 없음</span>';
            return entries.map(([k, v]) => `<span style="font-size:0.8rem;">${k.toUpperCase()}: <strong>${v.toLocaleString()}</strong></span>`).join(' · ');
        }
        
        function walletCard(type, label, icon, color, data) {
            const isActive = activeWallet === type;
            const exists = !!data;
            return `
                <div style="background:${isActive ? `linear-gradient(135deg,#8B691415,#8B691408)` : 'white'};padding:1.2rem;border-radius:12px;border:2px solid ${isActive ? '#8B6914' : '#E8E0D8'};position:relative;">
                    ${isActive ? `<span style="position:absolute;top:8px;right:8px;background:#8B6914;color:#FFF8F0;padding:2px 8px;border-radius:10px;font-size:0.65rem;font-weight:700;">활성</span>` : ''}
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.8rem;">
                        <span style="font-size:1.5rem;">${icon}</span>
                        <div>
                            <div style="font-weight:700;font-size:0.95rem;">${label}</div>
                            <div style="font-size:0.7rem;color:#6B5744;">${type === 'original' ? '원본 자산 보관 (안전 금고)' : type === 'operating' ? '일상 운영/거래용' : '기존 기본 지갑'}</div>
                        </div>
                    </div>
                    <div style="margin-bottom:0.8rem;">${formatBal(data)}</div>
                    <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                        ${!exists ? `<button onclick="createSuperWallet('${type}')" style="background:#8B6914;color:#FFF8F0;border:none;padding:0.4rem 0.8rem;border-radius:6px;cursor:pointer;font-size:0.78rem;font-weight:600;">➕ 생성</button>` : ''}
                        ${exists && !isActive ? `<button onclick="switchActiveWallet('${type}')" style="background:#8B6914;color:#FFF8F0;border:none;padding:0.4rem 0.8rem;border-radius:6px;cursor:pointer;font-size:0.78rem;font-weight:600;"><i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 활성화</button>` : ''}
                        ${exists ? `<button onclick="showInternalTransfer('${type}')" style="background:#455a64;color:#FFF8F0;border:none;padding:0.4rem 0.8rem;border-radius:6px;cursor:pointer;font-size:0.78rem;"><i data-lucide="arrow-left-right" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 이체</button>` : ''}
                    </div>
                </div>`;
        }
        
        container.innerHTML = `
            <div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;margin-bottom:1rem;">
                <h3 style="margin-bottom:0.3rem;"><i data-lucide="building-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 슈퍼관리자 계좌 관리</h3>
                <p style="font-size:0.78rem;color:#6B5744;margin-bottom:1.2rem;">오리지널 계좌(금고)와 운영 계좌를 분리 관리합니다. 오리지널 계좌 출금 시 2단계 확인이 필요합니다.</p>
                
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem;">
                    ${walletCard('original', '오리지널 계좌', '<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', '#8B6914', wallets.original)}
                    ${walletCard('operating', '운영 계좌', '<i data-lucide="zap" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', '#8B6914', wallets.operating)}
                    ${walletCard('default', '기본 지갑', '<i data-lucide="briefcase" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', '#8B6914', wallets.default)}
                </div>
            </div>
            
            <div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;">
                <h4 style="margin-bottom:0.8rem;"><i data-lucide="scroll-text" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> 내부 이체 로그</h4>
                <div id="super-wallet-log" style="max-height:300px;overflow-y:auto;"><p style="color:#6B5744;font-size:0.8rem;">로그 로딩 중...</p></div>
            </div>`;
        
        // Load transfer logs
        loadSuperWalletLog();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        container.innerHTML = `<div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;"><p style="color:red;">로드 실패: ${e.message}</p></div>`;
    }
}

async function createSuperWallet(type) {
    if (!isSuperAdmin()) return;
    const labels = { original: '오리지널 계좌 (금고)', operating: '운영 계좌', default: '기본 지갑' };
    const confirmed = await showConfirmModal('<i data-lucide="building-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 계좌 생성', `${labels[type]}을(를) 생성하시겠습니까?\n\n빈 잔액으로 생성됩니다.`);
    if (!confirmed) return;
    
    try {
        await db.collection('users').doc(currentUser.uid).collection('wallets').doc(type).set({
            type: type,
            offchainBalances: {},
            balances: {},
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: currentUser.email
        });
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${labels[type]} 생성 완료`, 'success');
        loadSuperAdminWallets();
    } catch (e) {
        showToast('생성 실패: ' + e.message, 'error');
    }
}

async function switchActiveWallet(type) {
    if (!isSuperAdmin()) return;
    try {
        await db.collection('users').doc(currentUser.uid).update({ activeWallet: type });
        showToast(`<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 활성 계좌 → ${type}`, 'success');
        loadSuperAdminWallets();
    } catch (e) {
        showToast('전환 실패: ' + e.message, 'error');
    }
}

async function showInternalTransfer(fromType) {
    if (!isSuperAdmin()) return;
    
    const targets = ['original', 'operating', 'default'].filter(t => t !== fromType);
    const labels = { original: '<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 오리지널', operating: '<i data-lucide="zap" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 운영', default: '<i data-lucide="briefcase" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 기본' };
    
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.innerHTML = `
        <div style="background:#FFF8F0;padding:1.5rem;border-radius:16px;max-width:400px;width:100%;">
            <h3 style="margin-bottom:0.5rem;"><i data-lucide="arrow-left-right" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 내부 이체</h3>
            <p style="font-size:0.8rem;color:#6B5744;margin-bottom:1rem;">보내는 계좌: <strong>${labels[fromType]}</strong></p>
            
            <div style="margin-bottom:0.8rem;">
                <label style="font-size:0.8rem;color:#6B5744;">받는 계좌</label>
                <select id="transfer-to" style="width:100%;padding:0.6rem;border:1px solid #E8E0D8;border-radius:8px;">
                    ${targets.map(t => `<option value="${t}">${labels[t]}</option>`).join('')}
                </select>
            </div>
            <div style="margin-bottom:0.8rem;">
                <label style="font-size:0.8rem;color:#6B5744;">토큰</label>
                <input type="text" id="transfer-token" placeholder="예: crtd" style="width:100%;padding:0.6rem;border:1px solid #E8E0D8;border-radius:8px;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.8rem;color:#6B5744;">수량</label>
                <input type="number" id="transfer-amount" min="1" placeholder="0" style="width:100%;padding:0.6rem;border:1px solid #E8E0D8;border-radius:8px;box-sizing:border-box;">
            </div>
            
            ${fromType === 'original' ? '<p style="font-size:0.75rem;color:#C4841D;margin-bottom:0.8rem;"><i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 오리지널 계좌 출금: 2단계 확인 필요</p>' : ''}
            
            <div style="display:flex;gap:0.5rem;">
                <button id="transfer-submit" style="flex:1;padding:0.7rem;background:#8B6914;color:#FFF8F0;border:none;border-radius:8px;cursor:pointer;font-weight:700;"><i data-lucide="send" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 이체</button>
                <button id="transfer-cancel" style="flex:1;padding:0.7rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#FFF8F0;">취소</button>
            </div>
        </div>`;
    
    document.body.appendChild(overlay);
    if (typeof lucide !== 'undefined') lucide.createIcons();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#transfer-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#transfer-submit').onclick = async () => {
        const toType = document.getElementById('transfer-to').value;
        const tokenKey = (document.getElementById('transfer-token').value || '').trim().toLowerCase();
        const amount = parseInt(document.getElementById('transfer-amount').value);
        
        if (!tokenKey || !amount || amount <= 0) { showToast('토큰과 수량을 입력하세요', 'warning'); return; }
        
        // Check balance
        const fromDoc = await db.collection('users').doc(currentUser.uid).collection('wallets').doc(fromType).get();
        if (!fromDoc.exists) { showToast('보내는 계좌가 없습니다', 'error'); return; }
        const fromBal = (fromDoc.data().offchainBalances || {})[tokenKey] || 0;
        if (fromBal < amount) { showToast(`잔액 부족: ${tokenKey.toUpperCase()} ${fromBal} < ${amount}`, 'error'); return; }
        
        // 2-step confirm for original account
        if (fromType === 'original') {
            const ok1 = await showConfirmModal('<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 오리지널 계좌 출금 확인', `오리지널 계좌(금고)에서 ${amount.toLocaleString()} ${tokenKey.toUpperCase()}를 ${labels[toType]}로 이체합니다.\n\n이 작업은 관리자 로그에 기록됩니다.`);
            if (!ok1) return;
            const code = await showPromptModal('보안 확인', '"CONFIRM"을 정확히 입력하세요:', '');
            if (code !== 'CONFIRM') { showToast('확인 코드 불일치. 이체 취소됨.', 'error'); return; }
        }
        
        try {
            const uid = currentUser.uid;
            const toDoc = await db.collection('users').doc(uid).collection('wallets').doc(toType).get();
            const toBal = toDoc.exists ? ((toDoc.data().offchainBalances || {})[tokenKey] || 0) : 0;
            
            // If target wallet doesn't exist, create it
            if (!toDoc.exists) {
                await db.collection('users').doc(uid).collection('wallets').doc(toType).set({
                    type: toType, offchainBalances: {}, balances: {},
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            // Update both wallets
            await db.collection('users').doc(uid).collection('wallets').doc(fromType).update({
                [`offchainBalances.${tokenKey}`]: fromBal - amount
            });
            await db.collection('users').doc(uid).collection('wallets').doc(toType).update({
                [`offchainBalances.${tokenKey}`]: toBal + amount
            });
            
            // Log
            await db.collection('admin_log').add({
                action: 'super_internal_transfer',
                adminEmail: currentUser.email,
                fromWallet: fromType,
                toWallet: toType,
                token: tokenKey,
                amount: amount,
                timestamp: new Date()
            });
            
            overlay.remove();
            showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${amount.toLocaleString()} ${tokenKey.toUpperCase()} 이체 완료 (${fromType} → ${toType})`, 'success');
            loadSuperAdminWallets();
        } catch (e) {
            showToast('이체 실패: ' + e.message, 'error');
        }
    };
}

async function loadSuperWalletLog() {
    const container = document.getElementById('super-wallet-log');
    if (!container) return;
    
    try {
        const logs = await db.collection('admin_log')
            .where('action', '==', 'super_internal_transfer')
            .orderBy('timestamp', 'desc').limit(20).get();
        
        if (logs.empty) { container.innerHTML = '<p style="font-size:0.8rem;color:#6B5744;">이체 내역 없음</p>'; return; }
        
        const labels = { original: '<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 오리지널', operating: '<i data-lucide="zap" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 운영', default: '<i data-lucide="briefcase" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 기본' };
        let html = '';
        logs.forEach(doc => {
            const d = doc.data();
            const time = d.timestamp?.toDate ? d.timestamp.toDate().toLocaleString('ko-KR') : '--';
            html += `<div style="padding:0.5rem;border-bottom:1px solid #E8E0D8;font-size:0.8rem;">
                <div style="display:flex;justify-content:space-between;">
                    <span><strong>${d.amount?.toLocaleString()} ${(d.token||'').toUpperCase()}</strong> ${labels[d.fromWallet]||d.fromWallet} → ${labels[d.toWallet]||d.toWallet}</span>
                    <span style="color:#6B5744;font-size:0.72rem;">${time}</span>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<p style="color:red;font-size:0.8rem;">로그 로드 실패: ${e.message}</p>`;
    }
}

// ═══════════════════════════════════════════════════════
// 대시보드 통계 (admin-tab-dashboard)
// ═══════════════════════════════════════════════════════

let _dashboardCache = null;
let _dashboardCacheTime = 0;
const DASHBOARD_CACHE_TTL = 5 * 60 * 1000; // 5분

async function loadAdminDashboardStats(forceRefresh = false) {
    if (!hasLevel(3)) return;

    const now = Date.now();

    // 로컬 메모리 캐시 체크
    if (!forceRefresh && _dashboardCache && (now - _dashboardCacheTime < DASHBOARD_CACHE_TTL)) {
        renderDashboardStats(_dashboardCache);
        return;
    }

    // Firestore 캐시 체크
    if (!forceRefresh) {
        try {
            const cacheDoc = await db.collection('admin_config').doc('dashboard_cache').get();
            if (cacheDoc.exists) {
                const cached = cacheDoc.data();
                const cachedAt = cached.cachedAt?.toMillis?.() || 0;
                if (now - cachedAt < DASHBOARD_CACHE_TTL) {
                    _dashboardCache = cached;
                    _dashboardCacheTime = cachedAt;
                    renderDashboardStats(cached);
                    return;
                }
            }
        } catch (e) { console.warn('대시보드 캐시 로드 실패:', e); }
    }

    // 데이터 수집
    const cacheInfoEl = document.getElementById('dashboard-cache-info');
    if (cacheInfoEl) cacheInfoEl.textContent = t('admin.dash_loading', '집계 중...');

    try {
        const stats = {};

        // 날짜 기준
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - weekStart.getDay());

        // 1) 사용자 통계
        const usersSnap = await db.collection('users').get();
        stats.totalUsers = usersSnap.size;
        let todayUsers = 0, weekUsers = 0;
        usersSnap.forEach(doc => {
            const d = doc.data();
            const created = d.createdAt?.toDate?.() || (d.createdAt ? new Date(d.createdAt) : null);
            if (created) {
                if (created >= todayStart) todayUsers++;
                if (created >= weekStart) weekUsers++;
            }
        });
        stats.todayUsers = todayUsers;
        stats.weekUsers = weekUsers;

        // 최근 7일 가입자 (일별)
        const signups7d = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date(todayStart); d.setDate(d.getDate() - i);
            signups7d[d.toISOString().slice(0,10)] = 0;
        }
        usersSnap.forEach(doc => {
            const d = doc.data();
            const created = d.createdAt?.toDate?.() || (d.createdAt ? new Date(d.createdAt) : null);
            if (created) {
                const key = created.toISOString().slice(0,10);
                if (key in signups7d) signups7d[key]++;
            }
        });
        stats.signups7d = signups7d;

        // 2) 거래 통계
        const txSnap = await db.collection('offchain_transactions').get();
        stats.totalTx = txSnap.size;
        let todayTx = 0;
        const txByToken = {};
        txSnap.forEach(doc => {
            const d = doc.data();
            const ts = d.timestamp?.toDate?.() || null;
            if (ts && ts >= todayStart) todayTx++;
            const tk = (d.token || 'unknown').toUpperCase();
            txByToken[tk] = (txByToken[tk] || 0) + Math.abs(d.amount || 0);
        });
        stats.todayTx = todayTx;
        stats.txByToken = txByToken;

        // 3) 섹션별 통계
        const sections = {};

        // MALL
        const productsSnap = await db.collection('products').get();
        const ordersSnap = await db.collection('orders').get();
        let mallRevenue = 0;
        ordersSnap.forEach(doc => { mallRevenue += doc.data().totalPrice || doc.data().price || 0; });
        sections.mall = { icon: '<i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: 'MALL', items: [
            { label: t('admin.dash.total_products','총 상품'), value: productsSnap.size },
            { label: t('admin.dash.total_orders','총 주문'), value: ordersSnap.size },
            { label: t('admin.dash.total_revenue','총 매출'), value: mallRevenue.toLocaleString() + ' pt' }
        ]};

        // ART
        let artCount = 0, artSold = 0;
        try {
            const artSnap = await db.collection('artworks').get();
            artCount = artSnap.size;
            artSnap.forEach(doc => { artSold += doc.data().sold || 0; });
        } catch(e) { console.warn("[catch]", e); }
        sections.art = { icon: '<i data-lucide="theater" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: 'ART', items: [
            { label: t('admin.dash.total_artworks','총 작품'), value: artCount },
            { label: t('admin.dash.total_art_sold','총 판매'), value: artSold }
        ]};

        // BOOKS
        let bookCount = 0, bookSold = 0;
        try {
            const bookSnap = await db.collection('books').get();
            bookCount = bookSnap.size;
            bookSnap.forEach(doc => { bookSold += doc.data().sold || 0; });
        } catch(e) { console.warn("[catch]", e); }
        sections.books = { icon: '<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: 'BOOKS', items: [
            { label: t('admin.dash.total_books','총 등록 책'), value: bookCount },
            { label: t('admin.dash.total_book_sold','총 판매'), value: bookSold }
        ]};

        // TRADING
        let activeChallenges = 0, totalParticipants = 0;
        try {
            const chSnap = await db.collection('prop_challenges').where('status', '==', 'active').get();
            activeChallenges = chSnap.size;
            for (const doc of chSnap.docs) {
                totalParticipants += doc.data().participants || 0;
            }
        } catch(e) { console.warn("[catch]", e); }
        sections.trading = { icon: '<i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: 'TRADING', items: [
            { label: t('admin.dash.active_challenges','활성 챌린지'), value: activeChallenges },
            { label: t('admin.dash.participants','참가자'), value: totalParticipants }
        ]};

        // SOCIAL
        let postCount = 0, commentCount = 0;
        try {
            const postSnap = await db.collection('posts').get();
            postCount = postSnap.size;
            // 댓글은 서브컬렉션이므로 대략적으로 카운트
            for (const doc of postSnap.docs) {
                const comments = await doc.ref.collection('comments').get();
                commentCount += comments.size;
                if (commentCount > 500) break; // 성능 보호
            }
        } catch(e) { console.warn("[catch]", e); }
        sections.social = { icon: '<i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: 'SOCIAL', items: [
            { label: t('admin.dash.total_posts','총 게시물'), value: postCount },
            { label: t('admin.dash.total_comments','총 댓글'), value: commentCount > 500 ? '500+' : commentCount }
        ]};

        stats.sections = sections;

        // Firestore에 캐시 저장
        try {
            await db.collection('admin_config').doc('dashboard_cache').set({
                ...stats,
                cachedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) { console.warn('대시보드 캐시 저장 실패:', e); }

        _dashboardCache = stats;
        _dashboardCacheTime = Date.now();
        renderDashboardStats(stats);

    } catch (e) {
        console.error('대시보드 통계 로드 실패:', e);
        if (cacheInfoEl) cacheInfoEl.textContent = '로드 실패: ' + e.message;
    }
}

function renderDashboardStats(stats) {
    // 사용자 통계
    const el = (id) => document.getElementById(id);
    if (el('dash-total-users')) el('dash-total-users').textContent = (stats.totalUsers || 0).toLocaleString();
    if (el('dash-today-users')) el('dash-today-users').textContent = (stats.todayUsers || 0).toLocaleString();
    if (el('dash-week-users')) el('dash-week-users').textContent = (stats.weekUsers || 0).toLocaleString();

    // 거래 통계
    if (el('dash-total-tx')) el('dash-total-tx').textContent = (stats.totalTx || 0).toLocaleString();
    if (el('dash-today-tx')) el('dash-today-tx').textContent = (stats.todayTx || 0).toLocaleString();

    // 토큰별 거래량
    const txByToken = stats.txByToken || {};
    const tokenEl = el('dash-tx-by-token');
    if (tokenEl) {
        tokenEl.innerHTML = Object.entries(txByToken).map(([tk, vol]) => {
            const info = typeof getTokenInfo === 'function' ? getTokenInfo(tk.toLowerCase()) : { icon: '<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#6B5744' };
            return `<div style="background:${info.color}11; border:1px solid ${info.color}33; padding:0.5rem; border-radius:8px; text-align:center;">
                <div style="font-size:0.7rem; color:${info.color};">${info.icon || '<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>'} ${tk}</div>
                <div style="font-size:1rem; font-weight:700;">${vol.toLocaleString()}</div>
            </div>`;
        }).join('');
    }

    // 섹션별 통계
    const sections = stats.sections || {};
    const sectionEl = el('dash-section-stats');
    if (sectionEl) {
        const colors = { mall: '#6B8F3C', art: '#B54534', books: '#C4841D', trading: '#C4841D', social: '#5B7B8C' };
        sectionEl.innerHTML = Object.entries(sections).map(([key, sec]) => {
            const color = colors[key] || '#6B5744';
            return `<div style="background:#FFF8F0; border:1px solid ${color}33; border-left:4px solid ${color}; padding:1rem; border-radius:10px;">
                <div style="font-weight:700; margin-bottom:0.5rem;">${sec.icon} ${sec.label}</div>
                ${(sec.items || []).map(item => `<div style="display:flex; justify-content:space-between; font-size:0.82rem; padding:0.2rem 0;">
                    <span style="color:#6B5744;">${item.label}</span>
                    <strong>${item.value}</strong>
                </div>`).join('')}
            </div>`;
        }).join('');
    }

    // 차트: 최근 7일 가입자 바 차트
    const signups7d = stats.signups7d || {};
    const chartEl = el('dash-chart-signups');
    if (chartEl) {
        const values = Object.values(signups7d);
        const maxVal = Math.max(...values, 1);
        chartEl.innerHTML = Object.entries(signups7d).map(([date, count]) => {
            const pct = Math.max((count / maxVal) * 100, 2);
            const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString('ko-KR', { weekday: 'short' });
            return `<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px;">
                <span style="font-size:0.7rem; font-weight:700; color:#5B7B8C;">${count}</span>
                <div style="width:100%; background:linear-gradient(180deg,#F0C060,#8B6914); border-radius:4px 4px 0 0; height:${pct}%; min-height:4px; transition:height 0.3s;"></div>
                <span style="font-size:0.65rem; color:#6B5744;">${dayLabel}</span>
            </div>`;
        }).join('');
    }

    // 차트: 토큰별 거래량 바 차트
    const chartTokenEl = el('dash-chart-tokens');
    if (chartTokenEl) {
        const entries = Object.entries(txByToken);
        if (entries.length === 0) {
            chartTokenEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;color:#6B5744;font-size:0.85rem;">거래 데이터 없음</div>';
        } else {
            const maxVol = Math.max(...entries.map(([,v]) => v), 1);
            const tokenColors = { CRTD: '#C4841D', CRAC: '#B54534', CRGC: '#6B8F3C', CREB: '#2E7D32' };
            chartTokenEl.innerHTML = entries.map(([tk, vol]) => {
                const pct = Math.max((vol / maxVol) * 100, 2);
                const color = tokenColors[tk] || '#6B5744';
                return `<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px;">
                    <span style="font-size:0.68rem; font-weight:700; color:${color};">${vol.toLocaleString()}</span>
                    <div style="width:100%; background:linear-gradient(180deg,${color}cc,${color}); border-radius:4px 4px 0 0; height:${pct}%; min-height:4px; transition:height 0.3s;"></div>
                    <span style="font-size:0.7rem; color:#6B5744; font-weight:600;">${tk}</span>
                </div>`;
            }).join('');
        }
    }

    // 캐시 정보
    const cacheInfoEl = el('dashboard-cache-info');
    if (cacheInfoEl) {
        const cacheTime = _dashboardCacheTime ? new Date(_dashboardCacheTime).toLocaleTimeString('ko-KR') : '';
        cacheInfoEl.textContent = cacheTime ? `캐시: ${cacheTime}` : '';
    }
}

// ========== 상품 승인 관리 (admin-tab-products) ==========

async function loadAdminPendingProducts() {
    const c = document.getElementById('admin-pending-products');
    if (!c) return;
    c.innerHTML = '로딩...';
    try {
        const snap = await db.collection('products').where('status', '==', 'pending').orderBy('createdAt', 'desc').limit(50).get();
        if (snap.empty) { c.innerHTML = '<p style="color:var(--accent);">대기 중인 상품이 없습니다 <i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></p>'; return; }
        c.innerHTML = '';
        snap.forEach(d => {
            const p = d.data();
            const thumb = p.images?.[0] || p.imageData || '';
            const dateStr = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('ko-KR') : '';
            c.innerHTML += `<div style="background:var(--bg);padding:0.8rem;border-radius:8px;margin-bottom:0.5rem;border-left:4px solid #C4841D;">
                <div style="display:flex;gap:0.8rem;align-items:center;">
                    <div style="width:60px;height:60px;border-radius:8px;overflow:hidden;background:#F7F3ED;flex-shrink:0;">
                        ${thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#E8E0D8;"><i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></div>'}
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:700;">${p.title}</div>
                        <div style="font-size:0.8rem;color:var(--accent);">${p.sellerNickname || p.sellerEmail} · ${p.price} CRGC · 재고 ${p.stock} · ${dateStr}</div>
                        ${p.description ? `<div style="font-size:0.8rem;color:#6B5744;margin-top:0.2rem;">${p.description.slice(0,80)}${p.description.length>80?'...':''}</div>` : ''}
                    </div>
                </div>
                <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                    <button onclick="approveProduct('${d.id}')" style="flex:1;background:#6B8F3C;color:#FFF8F0;border:none;padding:0.5rem;border-radius:6px;cursor:pointer;font-weight:600;"><i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 승인</button>
                    <button onclick="rejectProduct('${d.id}')" style="flex:1;background:#B54534;color:#FFF8F0;border:none;padding:0.5rem;border-radius:6px;cursor:pointer;font-weight:600;"><i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 거부</button>
                </div>
            </div>`;
        });
    } catch(e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

async function approveProduct(productId) {
    try {
        await db.collection('products').doc(productId).update({ status: 'active', approvedAt: new Date(), approvedBy: currentUser.uid });
        // 판매자에게 알림
        const pDoc = await db.collection('products').doc(productId).get();
        const p = pDoc.data();
        if (typeof createNotification === 'function') {
            await createNotification(p.sellerId, 'order_status', { message: `<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> "${p.title}" 상품이 승인되었습니다!`, link: `#page=product-detail&id=${productId}` });
        }
        showToast('<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 상품 승인 완료', 'success');
        loadAdminPendingProducts();
    } catch(e) { showToast('실패: ' + e.message, 'error'); }
}

async function rejectProduct(productId) {
    const reason = await showPromptModal('거부 사유', '거부 사유를 입력하세요', '');
    if (!reason) return;
    try {
        await db.collection('products').doc(productId).update({ status: 'rejected', rejectedAt: new Date(), rejectedBy: currentUser.uid, rejectReason: reason });
        const pDoc = await db.collection('products').doc(productId).get();
        const p = pDoc.data();
        if (typeof createNotification === 'function') {
            await createNotification(p.sellerId, 'order_status', { message: `<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> "${p.title}" 상품이 거부되었습니다. 사유: ${reason}`, link: '' });
        }
        showToast('상품 거부 완료', 'info');
        loadAdminPendingProducts();
    } catch(e) { showToast('실패: ' + e.message, 'error'); }
}

// ========== 신고 관리 ==========

async function loadAdminReports() {
    const c = document.getElementById('admin-reports-list');
    if (!c) return;
    c.innerHTML = '로딩...';
    try {
        const snap = await db.collection('reports').where('status', '==', 'pending').orderBy('createdAt', 'desc').limit(50).get();
        if (snap.empty) { c.innerHTML = '<p style="color:var(--accent);">대기 중인 신고가 없습니다 <i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></p>'; return; }
        c.innerHTML = '';
        const REPORT_REASONS = { fake: '허위상품', inappropriate: '부적절', scam: '사기의심', fraud: '사기', nondelivery: '미배송', fake_review: '허위 리뷰', spam: '스팸', other: '기타' };
        const TARGET_TYPE_LABELS = { product: '<i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 상품', review: '<i data-lucide="file-text" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 리뷰', seller: '🏪 판매자' };
        snap.forEach(d => {
            const r = d.data();
            const dateStr = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('ko-KR') : '';
            c.innerHTML += `<div style="background:#F7F3ED;padding:0.8rem;border-radius:8px;margin-bottom:0.5rem;border-left:4px solid #B54534;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <strong>🚨 ${REPORT_REASONS[r.reason] || r.reason}</strong>
                        <span style="font-size:0.75rem;color:var(--accent);margin-left:0.5rem;">${dateStr}</span>
                    </div>
                    <span style="font-size:0.8rem;color:var(--accent);">${TARGET_TYPE_LABELS[r.targetType] || r.targetType}: ${r.targetId?.slice(0,8)}...</span>
                </div>
                <div style="font-size:0.8rem;color:#6B5744;margin:0.3rem 0;">신고자: ${r.reporterEmail || r.reporterId?.slice(0,8)}</div>
                ${r.detail ? `<div style="font-size:0.8rem;color:#6B5744;">상세: ${r.detail}</div>` : ''}
                <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                    <button onclick="handleReport('${d.id}','confirmed')" style="flex:1;background:#B54534;color:#FFF8F0;border:none;padding:0.4rem;border-radius:6px;cursor:pointer;font-size:0.8rem;"><i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 삭제조치</button>
                    <button onclick="handleReport('${d.id}','dismissed')" style="flex:1;background:#6B5744;color:#FFF8F0;border:none;padding:0.4rem;border-radius:6px;cursor:pointer;font-size:0.8rem;">무시</button>
                </div>
            </div>`;
        });
    } catch(e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

async function handleReport(reportId, action) {
    try {
        const rDoc = await db.collection('reports').doc(reportId).get();
        const r = rDoc.data();
        await db.collection('reports').doc(reportId).update({ status: action, handledBy: currentUser.uid, handledAt: new Date() });
        if (action === 'confirmed' && r.targetId) {
            if (r.targetType === 'product') {
                await db.collection('products').doc(r.targetId).update({ status: 'removed', removedAt: new Date(), removedReason: '신고 확인' });
            } else if (r.targetType === 'review') {
                await db.collection('product_reviews').doc(r.targetId).delete();
            } else if (r.targetType === 'seller') {
                // 판매자 경고 기록
                await db.collection('users').doc(r.targetId).update({ reportWarnings: firebase.firestore.FieldValue.increment(1), lastWarningAt: new Date() });
            }
        }
        showToast(action === 'confirmed' ? '<i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 신고 확인 및 삭제 조치' : '신고 무시 처리', action === 'confirmed' ? 'warning' : 'info');
        loadAdminReports();
    } catch(e) { showToast('실패: ' + e.message, 'error'); }
}


// ═══════════════════════════════════════════════════════
// 리워드 설정 탭 (admin-tab-rewards)
// ═══════════════════════════════════════════════════════

async function loadRewardSettingsTab() {
    const container = document.getElementById('admin-tab-rewards');
    if (!container) return;

    // 설정 로드
    let rs = { signupEnabled: true, signupTiers: [{maxUsers:1000,amount:100},{maxUsers:10000,amount:30},{maxUsers:100000,amount:10}], inviteEnabled: true, inviteAmount: 0.5, inviteMaxPerUser: 100 };
    let is = {};
    try {
        const [rwDoc, invDoc] = await Promise.all([
            db.collection('admin_config').doc('reward_settings').get(),
            db.collection('admin_config').doc('invite_settings').get()
        ]);
        if (rwDoc.exists) rs = { ...rs, ...rwDoc.data() };
        if (invDoc.exists) is = invDoc.data();
    } catch(e) { console.warn("[catch]", e); }

    // 최근 로그
    let logs = [];
    try {
        const logSnap = await db.collection('reward_logs').orderBy('createdAt','desc').limit(50).get();
        logs = logSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) { console.warn("[catch]", e); }

    const tiersHTML = (rs.signupTiers || []).map((tier, i) => `
        <div style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.4rem;" data-tier-idx="${i}">
            <span style="font-size:0.8rem;white-space:nowrap;">~</span>
            <input type="number" class="rw-tier-max" value="${tier.maxUsers}" min="1" style="width:100px;padding:0.4rem;border:1px solid #E8E0D8;border-radius:6px;font-size:0.85rem;" placeholder="${t('admin.rw_max_users','최대 가입자 수')}">
            <span style="font-size:0.8rem;">${t('admin.rw_users','명')}</span>
            <input type="number" class="rw-tier-amt" value="${tier.amount}" min="0" step="0.1" style="width:80px;padding:0.4rem;border:1px solid #E8E0D8;border-radius:6px;font-size:0.85rem;" placeholder="CRTD">
            <span style="font-size:0.8rem;">CRTD</span>
            <button onclick="this.parentElement.remove()" style="background:#B54534;color:#FFF8F0;border:none;border-radius:4px;padding:0.2rem 0.5rem;cursor:pointer;font-size:0.75rem;">✕</button>
        </div>
    `).join('');

    const logsHTML = logs.length === 0 ? `<p style="color:#6B5744;font-size:0.85rem;">${t('admin.rw_no_logs','지급 내역 없음')}</p>` :
        `<div style="max-height:300px;overflow-y:auto;">
        <table style="width:100%;font-size:0.8rem;border-collapse:collapse;">
            <tr style="background:#F7F3ED;"><th style="padding:0.4rem;text-align:left;">UID</th><th>유형</th><th>금액</th><th>날짜</th></tr>
            ${logs.map(l => `<tr style="border-bottom:1px solid #E8E0D8;">
                <td style="padding:0.4rem;font-family:monospace;font-size:0.7rem;">${(l.uid||'').slice(0,12)}…</td>
                <td style="text-align:center;">${l.type === 'signup' ? '<i data-lucide="user-plus" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 가입' : '<i data-lucide="handshake" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 초대'}</td>
                <td style="text-align:center;font-weight:600;">${l.amount} CRTD</td>
                <td style="text-align:center;font-size:0.7rem;">${l.createdAt?.toDate ? l.createdAt.toDate().toLocaleDateString() : '—'}</td>
            </tr>`).join('')}
        </table></div>`;

    container.innerHTML = `
    <div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;margin-bottom:1rem;">
        <h3 style="margin-bottom:1rem;"><i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('admin.rw_title','리워드 설정')}</h3>

        <!-- 가입 리워드 -->
        <div style="margin-bottom:1.5rem;">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                <label style="font-weight:700;"><i data-lucide="user-plus" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> ${t('admin.rw_signup','가입 리워드')}</label>
                <label class="toggle-switch" style="margin-left:auto;">
                    <input type="checkbox" id="rw-signup-enabled" ${rs.signupEnabled ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <p style="font-size:0.75rem;color:#6B5744;margin-bottom:0.5rem;">${t('admin.rw_signup_desc','가입 순번에 따라 CRTD를 지급합니다.')}</p>
            <div id="rw-tiers-container">${tiersHTML}</div>
            <button onclick="addRewardTier()" style="background:#E8E0D8;border:none;padding:0.4rem 0.8rem;border-radius:6px;cursor:pointer;font-size:0.8rem;margin-top:0.3rem;">+ ${t('admin.rw_add_tier','구간 추가')}</button>
        </div>

        <!-- 초대 리워드 -->
        <div style="margin-bottom:1.5rem;">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                <label style="font-weight:700;"><i data-lucide="handshake" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('admin.rw_invite','초대 리워드')}</label>
                <label class="toggle-switch" style="margin-left:auto;">
                    <input type="checkbox" id="rw-invite-enabled" ${rs.inviteEnabled ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
                <div>
                    <label style="font-size:0.8rem;">${t('admin.rw_invite_amount','초대 1건당 (CRTD)')}</label>
                    <input type="number" id="rw-invite-amount" value="${rs.inviteAmount}" min="0" step="0.1" style="width:100%;padding:0.4rem;border:1px solid #E8E0D8;border-radius:6px;">
                </div>
                <div>
                    <label style="font-size:0.8rem;">${t('admin.rw_invite_max','1인 한도 (CRTD)')}</label>
                    <input type="number" id="rw-invite-max" value="${rs.inviteMaxPerUser}" min="0" style="width:100%;padding:0.4rem;border:1px solid #E8E0D8;border-radius:6px;">
                </div>
            </div>
        </div>

        <!-- 소셜 공유 키 -->
        <div style="margin-bottom:1.5rem;">
            <h4 style="margin-bottom:0.5rem;"><i data-lucide="key" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> ${t('admin.rw_social_keys','소셜 공유 설정')}</h4>
            <div style="margin-bottom:0.5rem;">
                <label style="font-size:0.8rem;"><i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('admin.rw_kakao_key','카카오 앱 키 (JavaScript)')}</label>
                <input type="text" id="rw-kakao-key" value="${is.kakaoAppKey || ''}" placeholder="카카오 JavaScript 앱 키" style="width:100%;padding:0.4rem;border:1px solid #E8E0D8;border-radius:6px;font-size:0.85rem;">
            </div>
            <div>
                <label style="font-size:0.8rem;"><i data-lucide="globe" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('admin.rw_fb_id','페이스북 앱 ID')}</label>
                <input type="text" id="rw-fb-id" value="${is.facebookAppId || ''}" placeholder="Facebook App ID" style="width:100%;padding:0.4rem;border:1px solid #E8E0D8;border-radius:6px;font-size:0.85rem;">
            </div>
        </div>

        <button onclick="saveRewardSettings()" class="btn-primary" style="width:100%;padding:0.7rem;"><i data-lucide="save" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('admin.rw_save','리워드 설정 저장')}</button>
    </div>

    <!-- 지급 내역 -->
    <div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;">
        <h3 style="margin-bottom:1rem;"><i data-lucide="clipboard-list" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('admin.rw_logs','최근 리워드 지급 내역')}</h3>
        ${logsHTML}
    </div>`;

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function addRewardTier() {
    const container = document.getElementById('rw-tiers-container');
    if (!container) return;
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;gap:0.5rem;align-items:center;margin-bottom:0.4rem;';
    div.innerHTML = `
        <span style="font-size:0.8rem;white-space:nowrap;">~</span>
        <input type="number" class="rw-tier-max" value="" min="1" style="width:100px;padding:0.4rem;border:1px solid #E8E0D8;border-radius:6px;font-size:0.85rem;" placeholder="최대 가입자">
        <span style="font-size:0.8rem;">명</span>
        <input type="number" class="rw-tier-amt" value="" min="0" step="0.1" style="width:80px;padding:0.4rem;border:1px solid #E8E0D8;border-radius:6px;font-size:0.85rem;" placeholder="CRTD">
        <span style="font-size:0.8rem;">CRTD</span>
        <button onclick="this.parentElement.remove()" style="background:#B54534;color:#FFF8F0;border:none;border-radius:4px;padding:0.2rem 0.5rem;cursor:pointer;font-size:0.75rem;">✕</button>
    `;
    container.appendChild(div);
}

async function saveRewardSettings() {
    if (!hasLevel(3)) { showToast('권한 없음', 'warning'); return; }

    const signupEnabled = document.getElementById('rw-signup-enabled')?.checked || false;
    const inviteEnabled = document.getElementById('rw-invite-enabled')?.checked || false;
    const inviteAmount = parseFloat(document.getElementById('rw-invite-amount')?.value) || 0.5;
    const inviteMaxPerUser = parseFloat(document.getElementById('rw-invite-max')?.value) || 100;

    // tiers
    const tierEls = document.querySelectorAll('#rw-tiers-container > div');
    const signupTiers = [];
    tierEls.forEach(el => {
        const max = parseInt(el.querySelector('.rw-tier-max')?.value);
        const amt = parseFloat(el.querySelector('.rw-tier-amt')?.value);
        if (max > 0 && amt >= 0) signupTiers.push({ maxUsers: max, amount: amt });
    });
    signupTiers.sort((a, b) => a.maxUsers - b.maxUsers);

    const kakaoAppKey = document.getElementById('rw-kakao-key')?.value.trim() || '';
    const facebookAppId = document.getElementById('rw-fb-id')?.value.trim() || '';

    try {
        await db.collection('admin_config').doc('reward_settings').set({
            signupEnabled, signupTiers, inviteEnabled, inviteAmount, inviteMaxPerUser,
            updatedAt: new Date(), updatedBy: currentUser.email
        }, { merge: true });

        await db.collection('admin_config').doc('invite_settings').set({
            kakaoAppKey, facebookAppId,
            updatedAt: new Date(), updatedBy: currentUser.email
        }, { merge: true });

        await db.collection('admin_logs').add({
            action: 'reward_settings_change',
            adminEmail: currentUser.email,
            adminUid: currentUser.uid,
            timestamp: new Date()
        });

        showToast('<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 리워드 설정 저장 완료', 'success');
    } catch (e) {
        showToast('저장 실패: ' + e.message, 'error');
    }
}

// ★ Lucide 아이콘 렌더링 초기화
if (typeof lucide !== 'undefined' && lucide.createIcons) {
    // DOM이 준비되면 아이콘 초기화
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            lucide.createIcons();
        });
    } else {
        lucide.createIcons();
    }
}
