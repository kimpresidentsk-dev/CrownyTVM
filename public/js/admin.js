// ===== admin.js - 관리자 패널 (레벨/탭/오프체인/온체인/챌린지/회원/기부풀/로그) =====

// ========== Auth helper for all admin API calls ==========
function _adminHeaders() {
    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}

// Generic DB API helpers
async function _dbGet(collection, docId) {
    const url = docId ? `/api/db/${collection}/${docId}` : `/api/db/${collection}`;
    const res = await fetch(url, { headers: _adminHeaders() });
    return res.json();
}
async function _dbQuery(collection, params = {}) {
    const qs = new URLSearchParams();
    if (params.where) {
        const w = Array.isArray(params.where[0]) ? params.where : [params.where];
        w.forEach(c => qs.append('where', c.join(',')));
    }
    if (params.orderBy) qs.append('orderBy', params.orderBy);
    if (params.limit) qs.append('limit', params.limit);
    const res = await fetch(`/api/db/${collection}?${qs.toString()}`, { headers: _adminHeaders() });
    return res.json();
}
async function _dbAdd(collection, data) {
    const res = await fetch(`/api/db/${collection}`, { method: 'POST', headers: _adminHeaders(), body: JSON.stringify(data) });
    return res.json();
}
async function _dbSet(collection, docId, data, merge = false) {
    const url = `/api/db/${collection}/${docId}${merge ? '?merge=true' : ''}`;
    const res = await fetch(url, { method: 'PUT', headers: _adminHeaders(), body: JSON.stringify(data) });
    return res.json();
}
async function _dbUpdate(collection, docId, data) {
    return _dbSet(collection, docId, data, true);
}
async function _dbDelete(collection, docId) {
    const res = await fetch(`/api/db/${collection}/${docId}`, { method: 'DELETE', headers: _adminHeaders() });
    return res.json();
}

// ========== ADMIN FUNCTIONS ==========
async function loadTransferRequests() {
    if (currentUser.email !== 'kps@crowny.org') return;

    const results = await _dbQuery('transfer_requests', {
        where: ['status', '==', 'pending'],
        orderBy: 'requestedAt,desc'
    });

    (results || []).forEach(doc => {
        const req = doc;
    });
}

async function adminMintTokens() {
    if (currentUser.email !== 'kps@crowny.org') {
        showToast(t('admin.admin_only','Admin only'), 'error');
        return;
    }
    
    const email = document.getElementById('admin-recipient')?.value;
    const token = document.getElementById('admin-token')?.value || 'CRNY';
    const amount = parseFloat(document.getElementById('admin-amount')?.value || 0);
    
    if (!email || amount <= 0) {
        showToast(t('admin.enter_email_amount','Enter email and amount'), 'info');
        return;
    }
    
    const users = await _dbQuery('users', { where: ['email', '==', email] });

    if (!users || users.length === 0) {
        showToast(t('social.user_not_found','User not found'), 'error');
        return;
    }

    const userDoc = users[0];
    const userData = userDoc;
    const tokenKey = token.toLowerCase();

    await _dbUpdate('users', userDoc.id, {
        [`balances.${tokenKey}`]: (userData.balances?.[tokenKey] || 0) + amount
    });

    await _dbAdd('transactions', {
        from: 'admin',
        to: userDoc.id,
        amount: amount,
        token: token,
        type: 'mint',
        timestamp: new Date().toISOString()
    });
    
    showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${amount} ${token} Issued!`, 'success');
    
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

const SUPER_ADMIN_EMAIL = 'kps@crowny.org';
const ADMIN_EMAIL = SUPER_ADMIN_EMAIL; // 하위 호환

const ADMIN_LEVELS = {
    6: { name: t('admin.level.super','Super Admin'), icon: '<i data-lucide="crown" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#8B6914' },
    5: { name: t('admin.level.country','Country Admin'), icon: '<i data-lucide="globe" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#8B6914' },
    4: { name: t('admin.level.business','Business Admin'), icon: '<i data-lucide="briefcase" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#5B7B8C' },
    3: { name: t('admin.level.service','Service Admin'), icon: '<i data-lucide="wrench" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#C4841D' },
    2: { name: t('admin.level.ops','Operations Admin'), icon: '<i data-lucide="file-text" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#5B7B8C' },
    1: { name: t('admin.level.cs','CS Admin'), icon: '<i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#6B5744' },
    0: { name: t('admin.level.member','Full Member'), icon: '<i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#795548' },
    '-1': { name: t('admin.level.basic','Basic Member'), icon: '<i data-lucide="user" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#9E9E9E' }
};

// 현재 사용자 레벨 캐시
let currentUserLevel = -1;

// 사용자 레벨 로드 (CrownyTVM 서버 API)
async function loadUserLevel() {
    if (!currentUser) { currentUserLevel = -1; return; }

    // ctvmMe에 isAdmin이 있으면 서버 API 기반으로 판단
    if (window.ctvmMe && window.ctvmMe.isAdmin) {
        currentUserLevel = 6;
        return;
    }

    // 수퍼관리자 이메일 체크
    if (currentUser.email === SUPER_ADMIN_EMAIL) {
        currentUserLevel = 6;
        return;
    }

    // 서버 프로필에서 관리자 여부 확인
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        if (token) {
            const res = await fetch('/api/profile', { headers: { 'Authorization': 'Bearer ' + token } });
            const profile = await res.json();
            if (profile && !profile.error && profile.isAdmin) {
                currentUserLevel = 6;
                return;
            }
        }
    } catch (e) {
        console.error('[Admin] ' + t('admin.level_load_fail','Level load failed') + ':', e);
    }

    currentUserLevel = -1;
}

// 권한 체크 함수들
function isAdmin() {
    if (window.ctvmMe && window.ctvmMe.isAdmin) return true;
    return currentUserLevel >= 1;
}

function isSuperAdmin() {
    if (window.ctvmMe && window.ctvmMe.isAdmin) return true;
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
        showToast(t('admin.cant_change_super','Cannot modify Super Admin'), 'warning');
        return;
    }
    
    if (level < -1 || level > 5) {
        showToast(t('admin.level_range','Level range: -1 to 5'), 'warning');
        return;
    }
    
    // ★ 권한 체크: 자기보다 1단계 아래까지만 임명 가능 (수퍼는 5까지)
    const maxAppointLevel = isSuperAdmin() ? 5 : currentUserLevel - 1;
    
    if (level > maxAppointLevel) {
        showToast(`<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Insufficient permission — Max appoint: Lv${maxAppointLevel}, Requested: Lv${level}`, 'error');
        return;
    }
    
    // 강등은 자기 레벨 미만만 가능 (수퍼는 전부)
    if (!isSuperAdmin()) {
        // 대상의 현재 레벨 확인
        const users = await _dbQuery('users', { where: ['email', '==', targetEmail] });
        if (!users || users.length === 0) { showToast('User not found: ' + targetEmail, 'error'); return; }
        const targetLevel = users[0].adminLevel ?? -1;
        if (targetLevel >= currentUserLevel) {
            showToast(`<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Cannot modify admin of equal or higher level (Target: Lv${targetLevel})`, 'error');
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
        const users = await _dbQuery('users', { where: ['email', '==', targetEmail] });
        if (!users || users.length === 0) {
            showToast('User not found: ' + targetEmail, 'error');
            return;
        }

        const targetDoc = users[0];
        const targetData = targetDoc;
        const prevLevel = targetData.adminLevel ?? -1;

        const updateData = {
            adminLevel: level,
            appointedBy: currentUser.email,
            appointedByLevel: currentUserLevel,
            appointedAt: new Date().toISOString()
        };
        // Preserve existing admin assignment fields (normalize to arrays)
        if (targetData.adminCountry) updateData.adminCountry = normalizeToArray(targetData.adminCountry);
        if (targetData.adminBusiness) updateData.adminBusiness = normalizeToArray(targetData.adminBusiness);
        if (targetData.adminService) updateData.adminService = normalizeToArray(targetData.adminService);
        if (targetData.adminStartDate) updateData.adminStartDate = targetData.adminStartDate;
        if (targetData.adminEndDate !== undefined) updateData.adminEndDate = targetData.adminEndDate;

        await _dbUpdate('users', targetDoc.id, updateData);

        const info = getLevelInfo(level);

        await _dbAdd('admin_log', {
            action: 'set_admin_level',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            targetEmail: targetEmail,
            prevLevel: prevLevel,
            newLevel: level,
            levelName: info.name,
            timestamp: new Date().toISOString()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${targetEmail} → ${info.icon} ${info.name} (Lv${level})`, 'success');
        loadAdminUserList();
    } catch (error) {
        showToast('Permission change failed: ' + error.message, 'error');
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
    
    if (!canEdit) { showToast(t('admin.cant_edit','Cannot edit this user'), 'warning'); return; }
    
    let levelOptions = '';
    for (let lv = -1; lv <= maxAppointLevel; lv++) {
        const info = getLevelInfo(lv);
        levelOptions += `<option value="${lv}" ${lv === level ? 'selected' : ''}>${lv} ${info.name} ${info.icon}</option>`;
    }
    
    const countries = [
        {v:'KR',l:'🇰🇷 Korea'},{v:'US',l:'🇺🇸 USA'},{v:'JP',l:'🇯🇵 Japan'},{v:'CN',l:'🇨🇳 China'},{v:'VN',l:'🇻🇳 Vietnam'},{v:'TH',l:'🇹🇭 Thailand'},{v:'PH',l:'🇵🇭 Philippines'},{v:'ID',l:'🇮🇩 Indonesia'},{v:'MY',l:'🇲🇾 Malaysia'},{v:'SG',l:'🇸🇬 Singapore'},{v:'AU',l:'🇦🇺 Australia'},{v:'UK',l:'🇬🇧 UK'},{v:'DE',l:'🇩🇪 Germany'},{v:'FR',l:'🇫🇷 France'},{v:'CA',l:'🇨🇦 Canada'},{v:'OTHER',l:'Other'}
    ];
    const businesses = [
        {v:'trading',l:'<i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Trading'},{v:'marketplace',l:'<i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Marketplace'},{v:'energy',l:'<i data-lucide="sprout" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Energy'},{v:'art',l:'<i data-lucide="theater" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Art/NFT'},{v:'fundraise',l:'<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Fundraise'},{v:'credit',l:'<i data-lucide="credit-card" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Credit'},{v:'social',l:'<i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Social'},{v:'messenger',l:'<i data-lucide="mail" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Messenger'},{v:'beauty',l:'<i data-lucide="sparkles" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Beauty'},{v:'sound',l:'<i data-lucide="music" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Sound'},{v:'it',l:'<i data-lucide="laptop" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> IT'},{v:'fnb',l:'<i data-lucide="utensils" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> F&B'},{v:'edu',l:'<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Education'},{v:'health',l:'<i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Health'}
    ];
    const services = [
        {v:'prop-trading',l:'Prop Trading'},{v:'mall',l:'Mall'},{v:'art-gallery',l:'Art'},{v:'nft-mint',l:'NFT'},{v:'energy-invest',l:'Energy'},{v:'fundraise-campaign',l:'Fundraise'},{v:'p2p-credit',l:'Credit'},{v:'social',l:'Social'},{v:'books',l:'Books'},{v:'business',l:'Business'},{v:'trading',l:'Trading'}
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
            <h3 style="margin-bottom:0.3rem;">${t('admin.settings','<i data-lucide="settings" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> Admin Settings')}</h3>
            <p style="font-size:0.85rem;color:#6B5744;margin-bottom:1rem;">${userData.nickname || t('admin.unnamed','Unnamed')} · ${userData.email}</p>
            
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.8rem;color:#6B5744;display:block;margin-bottom:0.3rem;">${t('admin.admin_level','Admin Level')}</label>
                <select id="edit-admin-level" style="width:100%;padding:0.6rem;border:1px solid #E8E0D8;border-radius:8px;font-size:0.9rem;">${levelOptions}</select>
            </div>
            
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.8rem;color:#6B5744;display:block;margin-bottom:0.4rem;"><i data-lucide="globe" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Assigned Country <span style="font-size:0.7rem;color:#6B5744;">(Multiple select)</span></label>
                <div id="edit-admin-country-grid" style="display:flex;flex-wrap:wrap;gap:0.3rem;">
                    ${buildCheckboxGrid('adminCountry', countries, curCountry)}
                </div>
            </div>
            
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.8rem;color:#6B5744;display:block;margin-bottom:0.4rem;"><i data-lucide="briefcase" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Assigned Business <span style="font-size:0.7rem;color:#6B5744;">(Multiple select)</span></label>
                <div id="edit-admin-business-grid" style="display:flex;flex-wrap:wrap;gap:0.3rem;">
                    ${buildCheckboxGrid('adminBusiness', businesses, curBusiness)}
                </div>
            </div>
            
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.8rem;color:#6B5744;display:block;margin-bottom:0.4rem;"><i data-lucide="wrench" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Assigned Service <span style="font-size:0.7rem;color:#6B5744;">(Multiple select)</span></label>
                <div id="edit-admin-service-grid" style="display:flex;flex-wrap:wrap;gap:0.3rem;">
                    ${buildCheckboxGrid('adminService', services, curService)}
                </div>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-bottom:1rem;">
                <div>
                    <label style="font-size:0.8rem;color:#6B5744;display:block;margin-bottom:0.3rem;">Start Date</label>
                    <input type="date" id="edit-admin-start" value="${startStr}" style="width:100%;padding:0.6rem;border:1px solid #E8E0D8;border-radius:8px;box-sizing:border-box;">
                </div>
                <div>
                    <label style="font-size:0.8rem;color:#6B5744;display:block;margin-bottom:0.3rem;">End Date (leave empty for unlimited)</label>
                    <input type="date" id="edit-admin-end" value="${endStr}" style="width:100%;padding:0.6rem;border:1px solid #E8E0D8;border-radius:8px;box-sizing:border-box;">
                </div>
            </div>
            
            <div style="display:flex;gap:0.5rem;">
                <button id="edit-admin-save" style="flex:1;padding:0.7rem;background:#8B6914;color:#FFF8F0;border:none;border-radius:8px;cursor:pointer;font-weight:700;">${t('common.save','Save')}</button>
                <button id="edit-admin-cancel" style="flex:1;padding:0.7rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#FFF8F0;">${t('common.cancel','Cancel')}</button>
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
                adminStartDate: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
                appointedBy: currentUser.email,
                appointedByLevel: currentUserLevel,
                appointedAt: new Date().toISOString()
            };
            if (endDate) {
                updateData.adminEndDate = new Date(endDate + 'T23:59:59').toISOString();
            } else {
                updateData.adminEndDate = null;
            }

            await _dbUpdate('users', userId, updateData);

            const info = getLevelInfo(newLevel);
            await _dbAdd('admin_log', {
                action: 'admin_edit',
                adminEmail: currentUser.email,
                adminLevel: currentUserLevel,
                targetEmail: userData.email,
                prevLevel: level,
                newLevel: newLevel,
                country: countryArr, business: businessArr, service: serviceArr,
                startDate: startDate || null,
                endDate: endDate || null,
                timestamp: new Date().toISOString()
            });
            
            overlay.remove();
            const cLabel = countryArr.length ? countryArr.join(',') : t('common.all','All');
            const bLabel = businessArr.length ? businessArr.join(',') : t('common.all','All');
            const sLabel = serviceArr.length ? serviceArr.join(',') : t('common.all','All');
            showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${userData.email} → ${info.icon} Lv${newLevel} (${cLabel}/${bLabel}/${sLabel})`, 'success');
            loadAdminUserList();
        } catch (e) {
            showToast(t('admin.settings_fail','Settings failed: ') + e.message, 'error');
        }
    };
}

// ★ 전체 쿼터 체크 (해당 레벨의 총 관리자 수)
async function checkAdminQuota(level) {
    try {
        const configDoc = await _dbGet('admin_config', 'settings');
        const quotas = (configDoc && !configDoc.error) ? (configDoc.quotas || {}) : {};
        const levelQuota = quotas[`level${level}`] || {};
        const maxTotal = levelQuota.max || 999;

        // 현재 해당 레벨 관리자 수
        const current = await _dbQuery('users', { where: ['adminLevel', '==', level] });
        const currentCount = (current || []).length;

        if (currentCount >= maxTotal) {
            showToast(`<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Lv${level} quota exceeded\n\nMax: ${maxTotal}\nCurrent: ${currentCount}\n\nRequest quota increase from Super Admin.`, 'error');
            return false;
        }
        return true;
    } catch (e) {
        console.warn(t('admin.quota_check_fail','Quota check failed (allowed)') + ':', e);
        return true;
    }
}

// ★ 개인 임명 쿼터 체크 (내가 임명한 해당 레벨 관리자 수)
async function checkPersonalQuota(level) {
    if (isSuperAdmin()) return true; // 수퍼는 무제한
    
    try {
        const configDoc = await _dbGet('admin_config', 'settings');
        const quotas = (configDoc && !configDoc.error) ? (configDoc.quotas || {}) : {};
        const levelQuota = quotas[`level${level}`] || {};
        const perAdmin = levelQuota.perAdmin || 999;

        // 내가 임명한 해당 레벨 수
        const myAppointed = await _dbQuery('users', {
            where: [['appointedBy', '==', currentUser.email], ['adminLevel', '==', level]]
        });
        const appointedCount = (myAppointed || []).length;

        if (appointedCount >= perAdmin) {
            showToast(`<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Personal appointment quota exceeded\n\nLv${level} max appointments: ${perAdmin}\nAlready appointed: ${appointedCount}`, 'error');
            return false;
        }
        return true;
    } catch (e) {
        console.warn(t('admin.personal_quota_fail','Personal quota check failed (allowed)') + ':', e);
        return true;
    }
}

// ★ 쿼터 설정 (수퍼관리자 전용)
async function saveAdminQuotas() {
    if (!isSuperAdmin()) { showToast('Super Admin only', 'info'); return; }
    
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
        await _dbSet('admin_config', 'settings', { quotas }, true);
        showToast('<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Admin quota saved', 'success');
        loadAdminUserList();
    } catch (e) {
        showToast('Save failed: ' + e.message, 'info');
    }
}

// ★ 관리자 현황 통계 로드
async function loadAdminStats() {
    const stats = {};
    for (let lv = 1; lv <= 5; lv++) {
        try {
            const q = await _dbQuery('users', { where: ['adminLevel', '==', lv] });
            stats[lv] = (q || []).length;
        } catch (e) { stats[lv] = '?'; }
    }
    return stats;
}

// ========== 소개자(레퍼럴) 시스템 ==========

// 소개 코드 생성 (정회원 이상) — CR-XXXXXX 고유 ID
async function generateReferralCode() {
    if (!currentUser) return;
    
    try {
        const userData = await _dbGet('users', currentUser.uid);

        if (userData.referralCode) {
            const nick = userData.referralNickname || userData.nickname || '';
            const display = nick ? `${nick} (${userData.referralCode})` : userData.referralCode;
            showToast(`Referral code already exists: ${display}`, 'info');
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
            const dup = await _dbQuery('users', { where: ['referralCode', '==', code] });
            exists = dup && dup.length > 0;
        }

        // 소개 닉네임 입력
        const nickname = await showPromptModal(
            t('social.referral_nick_title', 'Set Referral Nickname'),
            t('social.referral_nick_desc', 'Enter a nickname to display with your referral code:\n(Can be changed later)'),
            userData.nickname || ''
        );

        await _dbUpdate('users', currentUser.uid, {
            referralCode: code,
            referralNickname: (nickname || '').trim() || userData.nickname || '',
            referralCount: 0,
            referralEarnings: { crny: 0, fnc: 0, crfn: 0, crtd: 0, crac: 0, crgc: 0, creb: 0 }
        });
        
        const displayNick = (nickname || '').trim() || userData.nickname || '';
        const display = displayNick ? `${displayNick} (${code})` : code;
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Referral code created: ${display}`, 'success');
        const codeEl = document.getElementById('my-referral-code');
        if (codeEl) codeEl.textContent = code;
        if (typeof loadReferralInfo === 'function') loadReferralInfo();
        return code;
    } catch (error) {
        showToast('Code generation failed: ' + error.message, 'error');
    }
}

// 소개 코드로 가입 시 연결
async function applyReferralCode(newUserId, referralCode) {
    if (!referralCode) return;
    
    try {
        const referrers = await _dbQuery('users', {
            where: ['referralCode', '==', referralCode.toUpperCase()]
        });

        if (!referrers || referrers.length === 0) {
            console.warn(t('admin.invalid_referral','Invalid referral code') + ':', referralCode);
            return;
        }

        const referrer = referrers[0];
        const referrerId = referrer.id;

        // 신규 사용자에 소개자 기록
        await _dbUpdate('users', newUserId, {
            referredBy: referrerId,
            referredByEmail: referrer.email,
            referredByCode: referralCode.toUpperCase()
        });

        // 소개자 카운트 증가
        await _dbUpdate('users', referrerId, {
            referralCount: (referrer.referralCount || 0) + 1
        });

        // ★ 소개자 보상 자동 지급 (Firestore 설정값 기반)
        await distributeSignupReferralReward(referrerId, newUserId, referrer.email);

    } catch (error) {
        console.error(t('admin.referral_apply_fail','Referral code apply failed') + ':', error);
    }
}

// ★ 회원가입 시 소개자 보상 자동 지급 (설정값 기반)
async function distributeSignupReferralReward(referrerId, newUserId, referrerEmail) {
    try {
        // 보상 설정 로드
        const configDoc = await _dbGet('admin_config', 'referral_rewards');
        const config = (configDoc && !configDoc.error) ? configDoc : {};
        const rewards = config.signupRewards || { crtd: 30, crac: 20, crgc: 30, creb: 20 };

        const referrerData = await _dbGet('users', referrerId);
        if (!referrerData || referrerData.error) return;
        const off = referrerData.offchainBalances || {};
        const earnings = referrerData.referralEarnings || {};

        const updates = {};
        const tokenEntries = Object.entries(rewards).filter(([_, v]) => v > 0);

        for (const [token, amount] of tokenEntries) {
            updates[`offchainBalances.${token}`] = (off[token] || 0) + amount;
            updates[`referralEarnings.${token}`] = (earnings[token] || 0) + amount;
        }

        if (Object.keys(updates).length > 0) {
            await _dbUpdate('users', referrerId, updates);
        }

        // 거래 로그
        for (const [token, amount] of tokenEntries) {
            await _dbAdd('transactions', {
                from: 'system:referral_signup',
                to: referrerId,
                toEmail: referrerEmail || '',
                amount: amount,
                token: token.toUpperCase(),
                type: 'referral_signup_reward',
                referredUser: newUserId,
                rewardConfig: rewards,
                timestamp: new Date().toISOString()
            });
        }

    } catch (e) {
        console.error(t('admin.referral_reward_fail','Referral signup reward failed') + ':', e);
    }
}

// ★ 소개자 보상 설정 UI (수퍼관리자)
async function loadReferralRewardConfig() {
    try {
        const configDoc = await _dbGet('admin_config', 'referral_rewards');
        const config = (configDoc && !configDoc.error) ? configDoc : {};
        const rewards = config.signupRewards || { crtd: 30, crac: 20, crgc: 30, creb: 20 };
        ['crtd','crac','crgc','creb'].forEach(tk => {
            const el = document.getElementById('referral-cfg-' + tk);
            if (el) el.value = rewards[tk] || 0;
        });
    } catch (e) {
        console.error(t('admin.referral_settings_fail','Referral reward settings load failed') + ':', e);
    }
}

async function saveReferralRewardConfig() {
    if (!isSuperAdmin()) { showToast('Super Admin only', 'warning'); return; }
    const tokens = ['crtd','crac','crgc','creb'];
    const signupRewards = {};
    for (const tk of tokens) {
        const val = parseInt(document.getElementById('referral-cfg-' + tk)?.value);
        if (isNaN(val) || val < 0 || val > 10000) {
            showToast(`${tk.toUpperCase()} value is invalid (0~10,000)`, 'error');
            return;
        }
        signupRewards[tk] = val;
    }
    const confirmed = await showConfirmModal(
        'Referral Reward Change',
        `Signup referral rewards will be changed to:\n\nCRTD: ${signupRewards.crtd}\nCRAC: ${signupRewards.crac}\nCRGC: ${signupRewards.crgc}\nCREB: ${signupRewards.creb}\n\nProceed?`
    );
    if (!confirmed) return;
    try {
        await _dbSet('admin_config', 'referral_rewards', {
            signupRewards,
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser.email
        }, true);
        await _dbAdd('admin_logs', {
            action: 'referral_reward_config_change',
            newConfig: signupRewards,
            adminEmail: currentUser.email,
            adminUid: currentUser.uid,
            timestamp: new Date().toISOString()
        });
        showToast('<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Referral reward settings saved', 'success');
    } catch (e) {
        showToast('Save failed: ' + e.message, 'error');
    }
}

// [v13] 챌린지 참가 시 소개자 수익 배분 — 비활성화 (회원가입 보상으로 통합)
// async function distributeReferralReward — deprecated
async function distributeReferralReward_DISABLED(userId, amount, token) {
    try {
        const userData = await _dbGet('users', userId);
        if (!userData || userData.error) return;

        const referredBy = userData.referredBy;
        if (!referredBy) return;

        const rewardAmount = Math.floor(amount);
        if (rewardAmount <= 0) return;

        const tokenKey = token.toLowerCase();

        // 소개자 문서 로드
        const referrerData = await _dbGet('users', referredBy);
        if (!referrerData || referrerData.error) return;

        if (tokenKey === 'crtd') {
            const off = referrerData.offchainBalances || {};
            await _dbUpdate('users', referredBy, {
                [`offchainBalances.crtd`]: (off.crtd || 0) + rewardAmount,
                [`referralEarnings.crtd`]: ((referrerData.referralEarnings || {}).crtd || 0) + rewardAmount
            });

        } else if (tokenKey === 'crny') {
            const releaseDate = new Date();
            releaseDate.setDate(releaseDate.getDate() + 30);

            // subcollection via generic DB API path
            await _dbAdd(`users/${referredBy}/pendingRewards`, {
                token: 'crny',
                amount: rewardAmount,
                sourceUser: userId,
                sourceAmount: amount,
                type: 'referral_commission',
                released: false,
                releaseDate: releaseDate.toISOString(),
                createdAt: new Date().toISOString()
            });

            const earnings = referrerData.referralEarnings || {};
            await _dbUpdate('users', referredBy, {
                [`referralEarnings.crny`]: (earnings.crny || 0) + rewardAmount
            });

        } else {
            const off = referrerData.offchainBalances || {};
            await _dbUpdate('users', referredBy, {
                [`offchainBalances.${tokenKey}`]: (off[tokenKey] || 0) + rewardAmount,
                [`referralEarnings.${tokenKey}`]: ((referrerData.referralEarnings || {}).tokenKey || 0) + rewardAmount
            });
        }

        await _dbAdd('transactions', {
            from: 'system:referral_commission',
            to: referredBy,
            amount: rewardAmount,
            token: token,
            type: 'referral_commission',
            sourceUser: userId,
            sourceAmount: amount,
            commission: '10%',
            isPending: tokenKey === 'crny',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(t('admin.referral_commission_fail','Referral commission distribution failed') + ':', error);
    }
}

// 관리자: 특정 사용자 전체 포지션 강제 청산
async function adminForceCloseAll(targetUserId, targetParticipantId, challengeId) {
    if (!isAdmin()) {
        showToast(t('admin.admin_only','Admin only'), 'error');
        return;
    }
    
    if (!window.confirm('<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Admin Force Close\n\nAll positions for this user will be force closed.\nProceed?')) return;
    
    try {
        const data = await _dbGet(`prop_challenges/${challengeId}/participants`, targetParticipantId);
        if (!data || data.error) { showToast('Participant not found', 'error'); return; }
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
        
        await _dbUpdate(`prop_challenges/${challengeId}/participants`, targetParticipantId, {
            trades: trades,
            currentBalance: newBalance
        });

        // 관리자 로그
        await _dbAdd('admin_log', {
            action: 'force_close_all',
            adminEmail: currentUser.email,
            targetUserId: targetUserId,
            targetParticipantId: targetParticipantId,
            challengeId: challengeId,
            totalPnL: totalPnL,
            timestamp: new Date().toISOString()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Force close complete!\nPnL: $${totalPnL.toFixed(2)}`, 'success');
    } catch (error) {
        showToast('Force close failed: ' + error.message, 'info');
    }
}

// 관리자: 사용자 Suspend Trading (dailyLocked 설정)
async function adminSuspendTrading(targetParticipantId, challengeId, reason) {
    if (!isAdmin()) {
        showToast(t('admin.admin_only','Admin only'), 'error');
        return;
    }
    
    const suspendReason = reason || prompt(t('admin.enter_suspend_reason','Enter suspension reason:'));
    if (!suspendReason) return;
    
    try {
        await _dbUpdate(`prop_challenges/${challengeId}/participants`, targetParticipantId, {
            dailyLocked: true,
            adminSuspended: true,
            suspendReason: suspendReason,
            suspendedAt: new Date().toISOString(),
            suspendedBy: currentUser.email
        });

        await _dbAdd('admin_log', {
            action: 'suspend_trading',
            adminEmail: currentUser.email,
            targetParticipantId: targetParticipantId,
            challengeId: challengeId,
            reason: suspendReason,
            timestamp: new Date().toISOString()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('admin.suspended','Trading suspended')}\n${t('admin.reason','Reason')}: ${suspendReason}`, 'success');
    } catch (error) {
        showToast('Suspension failed: ' + error.message, 'info');
    }
}

// 관리자: Suspend Trading 해제
async function adminResumeTrading(targetParticipantId, challengeId) {
    if (!isAdmin()) {
        showToast(t('admin.admin_only','Admin only'), 'error');
        return;
    }
    
    try {
        await _dbUpdate(`prop_challenges/${challengeId}/participants`, targetParticipantId, {
            dailyLocked: false,
            adminSuspended: false,
            suspendReason: null,
            suspendedAt: null,
            suspendedBy: null
        });

        await _dbAdd('admin_log', {
            action: 'resume_trading',
            adminEmail: currentUser.email,
            targetParticipantId: targetParticipantId,
            challengeId: challengeId,
            timestamp: new Date().toISOString()
        });
        
        showToast(t('admin.resumed','<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Trading resumed'), 'success');
        loadAdminParticipants(); // 새로고침
    } catch (error) {
        showToast('Release failed: ' + error.message, 'info');
    }
}

// ========== 관리자 패널 UI ==========
// ═══════════════════════════════════════════════════════
// 관리자 탭 메뉴 시스템 — 권한 매트릭스
// ═══════════════════════════════════════════════════════
const ADMIN_TAB_CONFIG = [
    { id: 'dashboard', icon: '<i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.dashboard','Dashboard'), minLevel: 3 },
    { id: 'offchain',  icon: '<i data-lucide="flame" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.offchain','Off-chain'),  minLevel: 2 },
    { id: 'wallet',    icon: '<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.onchain','On-chain'),    minLevel: 4 },
    { id: 'challenge', icon: '<i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.challenge','Challenge'),    minLevel: 3 },
    { id: 'users',     icon: '<i data-lucide="users" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.users','Admins'),    minLevel: 3 },
    { id: 'giving',    icon: '<i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.giving','Giving Pool'),    minLevel: 3 },
    { id: 'referral',  icon: '<i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.referral','Referral'),    minLevel: 6 },
    { id: 'rate',      icon: '<i data-lucide="scale" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.rate','Rate'),      minLevel: 6 },
    { id: 'log',       icon: '<i data-lucide="clipboard-list" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.log','Log'),      minLevel: 3 },
    { id: 'coupon',    icon: '<i data-lucide="ticket" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.coupon','Coupon'),      minLevel: 3 },
    { id: 'products',  icon: '<i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.products','Products'),  minLevel: 2 },
    { id: 'superwall', icon: '<i data-lucide="building-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.superwall','Accounts'),  minLevel: 6 },
    { id: 'rewards',   icon: '<i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.rewards','Rewards'),    minLevel: 3 },
    { id: 'ai',        icon: '<i data-lucide="crown" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.ai','Crowny Panel Settings'),     minLevel: 6 },
    { id: 'features',  icon: '<i data-lucide="wrench" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('admin.tab.features','Features'),   minLevel: 5 }
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
        `${info.icon} <strong>${info.name}</strong> (Level ${currentUserLevel}) — ${currentUser.email}`;
    
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
    if (!email) { resultEl.innerHTML = `<span style="color:red;">${t('admin.enter_email','Enter email')}</span>`; return; }
    
    try {
        const users = await _dbQuery('users', { where: ['email', '==', email] });
        if (!users || users.length === 0) { resultEl.innerHTML = `<span style="color:red;">${t('admin.user_not_found','User not found')}</span>`; return; }

        const data = users[0];
        const off = data.offchainBalances || {};
        const nick = data.nickname || data.displayName || t('admin.unnamed','Unnamed');
        
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
                <div style="margin-top:0.4rem; font-size:0.8rem; color:var(--accent);">Total: ${total.toLocaleString()} pt</div>
            </div>`;
    } catch (e) {
        resultEl.innerHTML = `<span style="color:red;">Lookup failed: ${e.message}</span>`;
    }
}

// 포인트 발행 (민팅) — ★ 수퍼관리자(레벨 6) 전용
async function adminMintOffchain() {
    if (!hasLevel(6)) { showToast(t('admin.super_only_mint','<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Only Super Admin can mint tokens'), 'error'); return; }
    
    const email = document.getElementById('admin-off-mint-email').value.trim();
    const tokenKey = document.getElementById('admin-off-mint-token').value;
    const amount = parseInt(document.getElementById('admin-off-mint-amount').value);
    const reason = document.getElementById('admin-off-mint-reason').value.trim() || t('admin.admin_mint','Admin mint');
    
    if (!email || !amount || amount <= 0) { showToast(t('admin.enter_email_amount','Enter email and amount'), 'info'); return; }
    
    try {
        const users = await _dbQuery('users', { where: ['email', '==', email] });
        if (!users || users.length === 0) { showToast('User not found: ' + email, 'error'); return; }

        const targetDoc = users[0];
        const data = targetDoc;
        const off = data.offchainBalances || {};
        const curBal = off[tokenKey] || 0;

        if (!confirm(`<i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Mint Points\n\nTarget: ${email}\nToken: ${tokenKey.toUpperCase()}\nAmount: +${amount.toLocaleString()}\nReason: ${reason}\n\nCurrent balance: ${curBal.toLocaleString()} → ${(curBal + amount).toLocaleString()}`)) return;

        await _dbUpdate('users', targetDoc.id, {
            [`offchainBalances.${tokenKey}`]: curBal + amount
        });

        // 트랜잭션 로그
        await _dbAdd('offchain_transactions', {
            from: 'ADMIN', fromEmail: currentUser.email,
            to: targetDoc.id, toEmail: email,
            token: tokenKey, amount, type: 'admin_mint', reason,
            adminLevel: currentUserLevel,
            timestamp: new Date().toISOString()
        });

        // 관리자 활동 로그
        await _dbAdd('admin_log', {
            action: 'offchain_mint', adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            targetEmail: email, token: tokenKey.toUpperCase(),
            amount, reason,
            timestamp: new Date().toISOString()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${amount.toLocaleString()} ${tokenKey.toUpperCase()} minted → ${email}`, 'success');
        document.getElementById('admin-off-mint-email').value = '';
        document.getElementById('admin-off-mint-amount').value = '100';
        document.getElementById('admin-off-mint-reason').value = '';
    } catch (e) {
        showToast('Mint failed: ' + e.message, 'info');
    }
}

// 포인트 차감 (소각) — ★ 수퍼관리자(레벨 6) 전용
async function adminBurnOffchain() {
    if (!hasLevel(6)) { showToast(t('admin.super_only_burn','<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Only Super Admin can burn tokens'), 'error'); return; }
    
    const email = document.getElementById('admin-off-burn-email').value.trim();
    const tokenKey = document.getElementById('admin-off-burn-token').value;
    const amount = parseInt(document.getElementById('admin-off-burn-amount').value);
    const reason = document.getElementById('admin-off-burn-reason').value.trim() || t('admin.admin_burn_reason','Admin burn');
    
    if (!email || !amount || amount <= 0) { showToast(t('admin.enter_email_amount','Enter email and amount'), 'info'); return; }
    
    try {
        const users = await _dbQuery('users', { where: ['email', '==', email] });
        if (!users || users.length === 0) { showToast('User not found: ' + email, 'error'); return; }

        const targetDoc = users[0];
        const data = targetDoc;
        const off = data.offchainBalances || {};
        const curBal = off[tokenKey] || 0;

        if (amount > curBal) {
            showToast(`<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Insufficient balance!\n${email} ${tokenKey.toUpperCase()}: ${curBal.toLocaleString()} pt\nBurn requested: ${amount.toLocaleString()} pt`, 'error');
            return;
        }

        if (!confirm(`<i data-lucide="trending-down" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Burn Points\n\nTarget: ${email}\nToken: ${tokenKey.toUpperCase()}\nAmount: -${amount.toLocaleString()}\nReason: ${reason}\n\nCurrent balance: ${curBal.toLocaleString()} → ${(curBal - amount).toLocaleString()}`)) return;

        await _dbUpdate('users', targetDoc.id, {
            [`offchainBalances.${tokenKey}`]: curBal - amount
        });

        await _dbAdd('offchain_transactions', {
            from: targetDoc.id, fromEmail: email,
            to: 'ADMIN', toEmail: currentUser.email,
            token: tokenKey, amount: -amount, type: 'admin_burn', reason,
            adminLevel: currentUserLevel,
            timestamp: new Date().toISOString()
        });

        await _dbAdd('admin_log', {
            action: 'offchain_burn', adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            targetEmail: email, token: tokenKey.toUpperCase(),
            amount: -amount, reason,
            timestamp: new Date().toISOString()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${amount.toLocaleString()} ${tokenKey.toUpperCase()} burned ← ${email}`, 'success');
        document.getElementById('admin-off-burn-email').value = '';
        document.getElementById('admin-off-burn-amount').value = '100';
        document.getElementById('admin-off-burn-reason').value = '';
    } catch (e) {
        showToast('Burn failed: ' + e.message, 'info');
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
        const badge = info.isDefault ? '<span style="font-size:0.6rem; background:#E8E0D8; padding:1px 4px; border-radius:2px;">Default</span>' : '<span style="font-size:0.6rem; background:#F7F3ED; padding:1px 4px; border-radius:2px;">Custom</span>';
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0.6rem; background:var(--bg); border-radius:4px; border-left:3px solid ${info.color};">
                <span style="font-size:0.82rem;">${info.icon} <strong>${info.name}</strong> ${info.fullName} ${badge}</span>
                ${!info.isDefault && isSuperAdmin() ? `<button onclick="deleteCustomToken('${key}')" style="background:#B54534; color:#FFF8F0; border:none; padding:2px 6px; border-radius:3px; cursor:pointer; font-size:0.65rem;">Delete</button>` : ''}
            </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
}

// ★ 새 토큰 생성
async function createCustomToken() {
    if (!isSuperAdmin()) { showToast('<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Only Super Admin can create tokens', 'error'); return; }
    
    const key = (document.getElementById('new-token-key').value || '').trim().toLowerCase();
    const name = (document.getElementById('new-token-name').value || '').trim().toUpperCase();
    const fullName = (document.getElementById('new-token-fullname').value || '').trim();
    const icon = (document.getElementById('new-token-icon').value || '').trim() || '<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>';
    const color = document.getElementById('new-token-color').value || '#6B5744';
    
    if (!key || !name) { showToast('Token KEY and name are required', 'info'); return; }
    if (key.length < 2 || key.length > 10) { showToast('KEY must be 2-10 lowercase letters', 'info'); return; }
    if (!/^[a-z0-9]+$/.test(key)) { showToast('KEY must be lowercase letters + numbers only', 'info'); return; }
    if (OFFCHAIN_TOKEN_REGISTRY[key]) { showToast(`Token already exists: ${key.toUpperCase()}`, 'info'); return; }
    
    const tokenData = { name, fullName, icon, color, isDefault: false, createdBy: currentUser.email, createdAt: new Date().toISOString() };
    
    if (!confirm(`<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Create New Off-chain Token\n\nKEY: ${key}\nName: ${icon} ${name}\nDescription: ${fullName}\n\nProceed?`)) return;
    
    try {
        // 서버에 저장
        await _dbSet('admin_config', 'tokens', {
            [`registry.${key}`]: tokenData
        }, true);

        // 로컬 레지스트리 업데이트
        OFFCHAIN_TOKEN_REGISTRY[key] = tokenData;
        OFFCHAIN_TOKENS_LIST = Object.keys(OFFCHAIN_TOKEN_REGISTRY);
        OFFCHAIN_TOKEN_NAMES[key] = `${name} (${fullName})`;

        // 관리자 로그
        await _dbAdd('admin_log', {
            action: 'create_token', adminEmail: currentUser.email,
            tokenKey: key, tokenName: name, timestamp: new Date().toISOString()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${icon} ${name} (${key}) token created!`, 'success');
        
        // UI 업데이트
        document.getElementById('new-token-key').value = '';
        document.getElementById('new-token-name').value = '';
        document.getElementById('new-token-fullname').value = '';
        refreshAllTokenDropdowns();
        loadTokenList();
    } catch (e) {
        showToast('Token creation failed: ' + e.message, 'info');
    }
}

// 커스텀 토큰 삭제
async function deleteCustomToken(key) {
    if (!isSuperAdmin()) return;
    const info = OFFCHAIN_TOKEN_REGISTRY[key];
    if (!info || info.isDefault) { showToast('Default tokens cannot be deleted', 'info'); return; }
    
    if (!confirm(`<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Delete ${info.icon} ${info.name} (${key})\n\nExisting balances will be kept, but new minting/trading will be disabled.\nProceed?`)) return;
    
    try {
        await _dbUpdate('admin_config', 'tokens', {
            [`registry.${key}`]: { __fieldValue: 'delete' }
        });

        delete OFFCHAIN_TOKEN_REGISTRY[key];
        OFFCHAIN_TOKENS_LIST = Object.keys(OFFCHAIN_TOKEN_REGISTRY);
        delete OFFCHAIN_TOKEN_NAMES[key];

        await _dbAdd('admin_log', {
            action: 'delete_token', adminEmail: currentUser.email,
            tokenKey: key, tokenName: info.name, timestamp: new Date().toISOString()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${info.icon} ${info.name} deleted`, 'success');
        refreshAllTokenDropdowns();
        loadTokenList();
    } catch (e) {
        showToast('Delete failed: ' + e.message, 'info');
    }
}

// ★ 일괄 배포 (여러 사용자에게 한번에)
async function adminBatchDistribute() {
    if (!hasLevel(6)) { showToast('<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Only Super Admin can batch distribute', 'error'); return; }
    
    const tokenKey = document.getElementById('admin-dist-token').value;
    const amount = parseInt(document.getElementById('admin-dist-amount').value);
    const reason = document.getElementById('admin-dist-reason').value.trim() || 'Batch distribution';
    const emailsRaw = document.getElementById('admin-dist-emails').value.trim();
    
    if (!tokenKey || !amount || amount <= 0) { showToast('Enter token and amount', 'info'); return; }
    if (!emailsRaw) { showToast('Enter emails (one per line)', 'info'); return; }
    
    // 이메일 파싱 (줄바꿈, 쉼표, 세미콜론)
    const emails = emailsRaw.split(/[\n,;]+/).map(e => e.trim().toLowerCase()).filter(e => e && e.includes('@'));
    
    if (emails.length === 0) { showToast('No valid emails found', 'info'); return; }
    
    const ti = getTokenInfo(tokenKey);
    const totalAmount = amount * emails.length;
    
    if (!confirm(`<i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Batch Distribution\n\n${ti.icon} ${ti.name}: ${amount.toLocaleString()} x ${emails.length} users\nTotal mint: ${totalAmount.toLocaleString()}\nReason: ${reason}\n\nTargets:\n${emails.slice(0, 5).join('\n')}${emails.length > 5 ? `\n... and ${emails.length - 5} more` : ''}\n\nProceed?`)) return;
    
    const resultEl = document.getElementById('admin-dist-result');
    resultEl.innerHTML = '<p style="color:var(--accent);">Distributing...</p>';
    
    let success = 0, fail = 0, failList = [];
    
    for (const email of emails) {
        try {
            const users = await _dbQuery('users', { where: ['email', '==', email] });
            if (!users || users.length === 0) { fail++; failList.push(`${email} (user not found)`); continue; }

            const targetDoc = users[0];
            const off = targetDoc.offchainBalances || {};
            const curBal = off[tokenKey] || 0;

            await _dbUpdate('users', targetDoc.id, {
                [`offchainBalances.${tokenKey}`]: curBal + amount
            });

            await _dbAdd('offchain_transactions', {
                from: 'ADMIN', fromEmail: currentUser.email,
                to: targetDoc.id, toEmail: email,
                token: tokenKey, amount, type: 'admin_batch_mint', reason,
                adminLevel: currentUserLevel,
                timestamp: new Date().toISOString()
            });

            success++;
        } catch (e) {
            fail++;
            failList.push(`${email} (${e.message})`);
        }
    }

    // 관리자 로그 (한번에)
    await _dbAdd('admin_log', {
        action: 'batch_distribute', adminEmail: currentUser.email,
        adminLevel: currentUserLevel,
        token: tokenKey.toUpperCase(), amountPerUser: amount,
        totalAmount: amount * success, targetCount: emails.length,
        successCount: success, failCount: fail, reason,
        timestamp: new Date().toISOString()
    });
    
    resultEl.innerHTML = `
        <div style="padding:0.6rem; border-radius:6px; ${fail > 0 ? 'background:#F7F3ED; border:1px solid #ffcc80;' : 'background:#F7F3ED; border:1px solid #a5d6a7;'}">
            <strong><i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${success} succeeded</strong>${fail > 0 ? ` / <i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${fail} failed` : ''}
            <div style="font-size:0.78rem; margin-top:0.3rem;">Total minted: ${(amount * success).toLocaleString()} ${ti.name}</div>
            ${failList.length > 0 ? `<div style="font-size:0.72rem; color:#B54534; margin-top:0.3rem;">Failed: ${failList.join(', ')}</div>` : ''}
        </div>`;
    
    document.getElementById('admin-dist-emails').value = '';
}

// ★ 전체 회원 배포
async function adminDistributeToAll() {
    if (!hasLevel(6)) { showToast('<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Super Admin only', 'error'); return; }
    
    const tokenKey = document.getElementById('admin-dist-token').value;
    const amount = parseInt(document.getElementById('admin-dist-amount').value);
    const reason = document.getElementById('admin-dist-reason').value.trim() || 'Distribute to all';
    
    if (!tokenKey || !amount || amount <= 0) { showToast('Enter token and amount', 'info'); return; }
    
    const ti = getTokenInfo(tokenKey);
    
    // 전체 사용자 수 확인
    const allUsers = await _dbQuery('users', {});
    const count = (allUsers || []).length;

    if (!confirm(`<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Distribute to All Users\n\n${ti.icon} ${ti.name}: ${amount.toLocaleString()} x ${count} users\nTotal mint: ${(amount * count).toLocaleString()}\n\nDistribute to all ${count} users?`)) return;

    // 이메일 목록 추출 → 기존 배치 함수 활용
    const emails = [];
    (allUsers || []).forEach(u => {
        if (u.email) emails.push(u.email);
    });
    
    document.getElementById('admin-dist-emails').value = emails.join('\n');
    await adminBatchDistribute();
}

// 오프체인 거래 내역 로드
async function adminLoadOffchainTxLog() {
    if (!hasLevel(1)) return;
    const container = document.getElementById('admin-off-tx-log');
    container.innerHTML = '<p style="color:var(--accent); font-size:0.8rem;">Loading...</p>';

    try {
        const txs = await _dbQuery('offchain_transactions', {
            orderBy: 'timestamp,desc', limit: 30
        });

        if (!txs || txs.length === 0) { container.innerHTML = '<p style="font-size:0.8rem;">No transaction history</p>'; return; }

        const typeLabels = {
            'transfer': 'Transfer', 'earn': 'Earn', 'spend': 'Spend',
            'admin_mint': '<i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>Mint', 'admin_burn': '<i data-lucide="trending-down" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>Burn',
            'swap_offchain': '<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>Swap'
        };
        const typeColors = {
            'admin_mint': '#5B7B8C', 'admin_burn': '#B54534',
            'earn': '#5B7B8C', 'spend': '#ff6f00',
            'transfer': '#455a64', 'swap_offchain': '#6a1b9a'
        };

        let html = '';
        txs.forEach(tx => {
            const time = tx.timestamp ? new Date(tx.timestamp).toLocaleString('ko-KR') : '--';
            const label = typeLabels[tx.type] || tx.type;
            const color = typeColors[tx.type] || '#6B5744';
            const fromLabel = tx.fromEmail === 'ADMIN' ? '<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Admin' : (tx.fromEmail || '--');
            const toLabel = tx.toEmail === 'ADMIN' ? '<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Admin' : (tx.toEmail || '--');
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
        container.innerHTML = `<p style="color:red; font-size:0.8rem;">Load failed: ${e.message}</p>`;
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
        const pool = await _dbGet('giving_pool', 'global');
        if (pool && !pool.error) {
            const updated = pool.lastUpdated ? new Date(pool.lastUpdated).toLocaleString('ko-KR') : '--';
            infoEl.innerHTML = `
                <div style="text-align:center;">
                    <div style="font-size:0.8rem; color:var(--accent);"><i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Global Giving Pool Balance</div>
                    <div style="font-size:2rem; font-weight:800; color:#5B7B8C;">${(pool.totalAmount||0).toLocaleString()} <span style="font-size:0.9rem;">CRGC pt</span></div>
                    <div style="font-size:0.75rem; color:var(--accent);">≈ ${((pool.totalAmount||0)/100).toFixed(2)} CRNY · Last updated: ${updated}</div>
                </div>`;
        } else {
            infoEl.innerHTML = '<p style="text-align:center; color:var(--accent);">No giving pool yet</p>';
        }
        
        // 기부풀 로그
        const logs = await _dbQuery('giving_pool_logs', {
            orderBy: 'timestamp,desc', limit: 20
        });

        if (!logs || logs.length === 0) { logEl.innerHTML = '<p style="font-size:0.8rem;">No donation logs</p>'; return; }

        let html = '';
        logs.forEach(log => {
            const time = log.timestamp ? new Date(log.timestamp).toLocaleString('ko-KR') : '--';
            html += `<div style="padding:0.4rem; border-bottom:1px solid #E8E0D8; font-size:0.78rem;">
                <span style="color:#5B7B8C; font-weight:600;">+${(log.givingAmount||0).toLocaleString()}</span>
                <span style="color:var(--accent);"> from ${log.email||'--'}</span>
                <span style="color:#6B5744; float:right;">${time}</span>
            </div>`;
        });
        logEl.innerHTML = html;
    } catch (e) {
        infoEl.innerHTML = `<p style="color:red;">Load failed: ${e.message}</p>`;
    }
}

// 기부풀 분배
async function adminDistributeGivingPool() {
    if (!hasLevel(3)) { showToast('Insufficient permission (Level 3+)', 'info'); return; }

    const email = document.getElementById('admin-giving-email').value.trim();
    const amount = parseInt(document.getElementById('admin-giving-amount').value);
    if (!email || !amount || amount <= 0) { showToast(t('admin.enter_email_amount','Enter email and amount'), 'info'); return; }
    
    try {
        // 기부풀 잔액 확인
        const poolData = await _dbGet('giving_pool', 'global');
        const poolBal = (poolData && !poolData.error) ? (poolData.totalAmount || 0) : 0;
        
        if (amount > poolBal) {
            showToast(`<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Insufficient giving pool balance!\nCurrent: ${poolBal.toLocaleString()} pt\nRequested: ${amount.toLocaleString()} pt`, 'error');
            return;
        }
        
        // 수신자 확인
        const users = await _dbQuery('users', { where: ['email', '==', email] });
        if (!users || users.length === 0) { showToast('User not found: ' + email, 'error'); return; }

        if (!confirm(`<i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Giving Pool Distribution\n\nTarget: ${email}\nAmount: ${amount.toLocaleString()} CRGC pt\nPool balance: ${poolBal.toLocaleString()} → ${(poolBal - amount).toLocaleString()}`)) return;

        const targetDoc = users[0];
        const off = targetDoc.offchainBalances || {};

        // 기부풀 차감
        await _dbUpdate('giving_pool', 'global', {
            totalAmount: poolBal - amount,
            lastUpdated: new Date().toISOString()
        });

        // 수신자에게 CRGC 지급
        await _dbUpdate('users', targetDoc.id, {
            [`offchainBalances.crgc`]: (off.crgc || 0) + amount
        });

        // 로그
        await _dbAdd('offchain_transactions', {
            from: 'GIVING_POOL', fromEmail: 'giving_pool',
            to: targetDoc.id, toEmail: email,
            token: 'crgc', amount, type: 'giving_distribute',
            adminEmail: currentUser.email, adminLevel: currentUserLevel,
            timestamp: new Date().toISOString()
        });

        await _dbAdd('admin_log', {
            action: 'giving_distribute', adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            targetEmail: email, amount, timestamp: new Date().toISOString()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${amount.toLocaleString()} CRGC distributed from giving pool to ${email}`, 'success');
        adminLoadGivingPool();
    } catch (e) {
        showToast('Distribution failed: ' + e.message, 'info');
    }
}

// 회원 목록 로드 (수퍼관리자)
async function loadAdminUserList() {
    if (!hasLevel(3)) return;
    
    const container = document.getElementById('admin-user-list');
    container.innerHTML = '<p style="color:var(--accent);">Loading...</p>';

    const maxAppointLevel = isSuperAdmin() ? 5 : currentUserLevel - 1;
    
    try {
        // ★ 쿼터 정보 + 관리자 현황
        const stats = await loadAdminStats();
        let configDoc = null;
        try {
            configDoc = await _dbGet('admin_config', 'settings');
        } catch(e) { console.warn("[catch]", e); }
        const quotas = (configDoc && !configDoc.error) ? (configDoc.quotas || {}) : {};
        
        // ★ 수퍼관리자: 쿼터 설정 UI
        let quotaHTML = '';
        if (isSuperAdmin()) {
            quotaHTML = `
            <div style="background:#F7F3ED; padding:1rem; border-radius:8px; margin-bottom:1rem;">
                <h4 style="font-size:0.85rem; margin-bottom:0.6rem;">Admin Quota Settings</h4>
                <table style="width:100%; border-collapse:collapse; font-size:0.78rem;">
                    <thead>
                        <tr style="background:var(--bg);">
                            <th style="padding:0.3rem;">Level</th>
                            <th style="padding:0.3rem;">Current</th>
                            <th style="padding:0.3rem;">Max (Total)</th>
                            <th style="padding:0.3rem;">Per Superior</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${[5,4,3,2,1].map(lv => {
                            const q = quotas[`level${lv}`] || {};
                            const info = getLevelInfo(lv);
                            return `<tr>
                                <td style="padding:0.3rem;">${info.icon} Lv${lv}</td>
                                <td style="padding:0.3rem; text-align:center; font-weight:700;">${stats[lv] || 0}</td>
                                <td style="padding:0.3rem;"><input type="number" id="quota-max-${lv}" value="${q.max || 999}" min="0" style="width:55px; padding:0.2rem; border:1px solid var(--border); border-radius:3px; text-align:center;"></td>
                                <td style="padding:0.3rem;"><input type="number" id="quota-per-${lv}" value="${q.perAdmin || 999}" min="0" style="width:55px; padding:0.2rem; border:1px solid var(--border); border-radius:3px; text-align:center;"></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                <button onclick="saveAdminQuotas()" style="margin-top:0.5rem; background:#C4841D; color:#FFF8F0; border:none; padding:0.4rem 1rem; border-radius:4px; cursor:pointer; font-size:0.8rem;"><i data-lucide="save" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Save Quotas</button>
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
            <h4 style="font-size:0.85rem; margin-bottom:0.5rem;"><i data-lucide="user-check" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> Admin Appointment (up to Lv${maxAppointLevel})</h4>
            <div style="display:grid; grid-template-columns:1fr auto auto; gap:0.5rem; align-items:end;">
                <div>
                    <label style="font-size:0.7rem;">Email</label>
                    <input type="email" id="admin-level-email" placeholder="user@email.com" style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:4px;">
                </div>
                <div>
                    <label style="font-size:0.7rem;">Level</label>
                    <select id="admin-level-select" style="padding:0.5rem; border:1px solid var(--border); border-radius:4px;">
                        ${appointOptions}
                    </select>
                </div>
                <button onclick="setUserAdminLevel(document.getElementById('admin-level-email').value, parseInt(document.getElementById('admin-level-select').value))" style="background:#8B6914; color:#FFF8F0; border:none; padding:0.5rem 1rem; border-radius:4px; cursor:pointer;">Set</button>
            </div>
        </div>`;
        
        // ★ 관리자 목록 (관리자인 사용자만 + 최근 가입)
        const admins = await _dbQuery('users', { where: ['adminLevel', '>=', 1] });
        const recentUsers = await _dbQuery('users', { orderBy: 'createdAt,desc', limit: 20 });

        // 중복 제거
        const seenIds = new Set();
        const allUsers = [];
        (admins || []).forEach(u => { seenIds.add(u.id); allUsers.push(u); });
        (recentUsers || []).forEach(u => { if (!seenIds.has(u.id)) { seenIds.add(u.id); allUsers.push(u); } });
        
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
                    ? `<span style="font-size:0.6rem;color:#B54534;font-weight:700;"><i data-lucide="clock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Expired</span>`
                    : `<span style="font-size:0.6rem;color:#6B5744;">~${end.toLocaleDateString('ko-KR')}</span>`;
            }
            
            userHTML += `
                <div style="padding:0.6rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem; border-left:4px solid ${info.color};">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.3rem;">
                        <div style="flex:1; min-width:150px;">
                            <strong style="font-size:0.85rem;">${u.nickname || t('admin.unnamed','Unnamed')}</strong>
                            <span style="font-size:0.7rem; color:var(--accent); margin-left:0.3rem;">${u.email}</span>
                            <div style="display:flex;gap:0.3rem;margin-top:0.2rem;flex-wrap:wrap;">
                                ${countryBadge}${businessBadge}${serviceBadge}${periodText}
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:0.4rem;">
                            <span style="font-size:0.72rem; padding:2px 6px; background:${info.color}22; color:${info.color}; border-radius:3px;">
                                ${info.icon} Lv${level}
                            </span>
                            ${canManage ? `<button onclick="showAdminEditModal('${u.id}', window._adminUserCache['${u.id}'])" style="background:#8B6914;color:#FFF8F0;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:0.65rem;">Edit</button>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = quotaHTML + appointHTML + `
            <h4 style="font-size:0.85rem; margin-bottom:0.5rem;"><i data-lucide="users" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Admin &amp; Member List (${allUsers.length})</h4>
            ${userHTML}
        `;
    } catch (error) {
        container.innerHTML = `<p style="color:red;">Load failed: ${error.message}</p>`;
    }
}

// 참가자 일일 한도 조정 (레벨 3+)
async function adminAdjustDailyLimit(participantId, challengeId) {
    if (!hasLevel(3)) return;
    
    try {
        // 기존 값 조회
        const data = await _dbGet(`prop_challenges/${challengeId}/participants`, participantId);

        if (!data || data.error) { showToast('Participant not found', 'error'); return; }
        const currentLimit = data.dailyLossLimit || 500;
        const email = data.email || data.userId || participantId;

        const newLimit = prompt(`[${email}]\nCurrent daily loss limit: $${currentLimit}\n\nNew daily loss limit ($):`, currentLimit);
        if (!newLimit || isNaN(newLimit)) return;

        await _dbUpdate(`prop_challenges/${challengeId}/participants`, participantId, { dailyLossLimit: Math.abs(parseFloat(newLimit)) });

        await _dbAdd('admin_log', {
            action: 'adjust_daily_limit',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            participantId, challengeId,
            prevLimit: currentLimit,
            newLimit: Math.abs(parseFloat(newLimit)),
            timestamp: new Date().toISOString()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Daily limit $${currentLimit} → $${newLimit} updated`, 'success');
        loadAdminParticipants();
    } catch (error) {
        showToast('Update failed: ' + error.message, 'info');
        console.error('adminAdjustDailyLimit 에러:', error);
    }
}

// 거래 Unlock (레벨 3+)
async function adminUnlockTrading(participantId, challengeId) {
    if (!hasLevel(3)) return;
    
    try {
        const data = await _dbGet(`prop_challenges/${challengeId}/participants`, participantId);

        if (!data || data.error) { showToast('Participant not found', 'error'); return; }
        const email = data.email || data.userId || participantId;
        const locked = data.dailyLocked ? '<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Locked' : '<i data-lucide="unlock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Normal';
        const suspended = data.adminSuspended ? '<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Suspended' : 'Active';

        if (!confirm(`[${email}]\nStatus: ${locked} / ${suspended}\nDaily PnL: $${(data.dailyPnL||0).toFixed(2)}\n\nUnlock + reset daily PnL?`)) return;

        await _dbUpdate(`prop_challenges/${challengeId}/participants`, participantId, {
            dailyLocked: false,
            adminSuspended: false,
            suspendReason: null,
            dailyPnL: 0
        });

        await _dbAdd('admin_log', {
            action: 'unlock_trading',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            participantId, challengeId,
            timestamp: new Date().toISOString()
        });
        
        showToast('<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Trading unlocked + daily PnL reset', 'success');
        loadAdminParticipants();
    } catch (error) {
        showToast('Unlock failed: ' + error.message, 'info');
        console.error('adminUnlockTrading 에러:', error);
    }
}

// 잔액 직접 조정 (레벨 4+)
async function adminAdjustBalance(participantId, challengeId) {
    if (!hasLevel(4)) return;
    
    try {
        const data = await _dbGet(`prop_challenges/${challengeId}/participants`, participantId);

        if (!data || data.error) { showToast('Participant not found', 'error'); return; }
        const currentBalance = data.currentBalance || 0;
        const email = data.email || data.userId || participantId;

        const newBalance = prompt(`[${email}]\nCurrent balance: $${currentBalance.toLocaleString()}\nPnL: $${((data.currentBalance||0) - (data.initialBalance||0)).toFixed(2)}\n\nNew balance ($):`, currentBalance);
        if (!newBalance || isNaN(newBalance)) return;

        if (!confirm(`Confirm balance change\n$${currentBalance.toLocaleString()} → $${parseFloat(newBalance).toLocaleString()}`)) return;

        await _dbUpdate(`prop_challenges/${challengeId}/participants`, participantId, { currentBalance: parseFloat(newBalance) });

        await _dbAdd('admin_log', {
            action: 'adjust_balance',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            participantId, challengeId,
            prevBalance: currentBalance,
            newBalance: parseFloat(newBalance),
            timestamp: new Date().toISOString()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Balance $${currentBalance.toLocaleString()} → $${parseFloat(newBalance).toLocaleString()} updated`, 'success');
        loadAdminParticipants();
    } catch (error) {
        showToast('Update failed: ' + error.message, 'info');
        console.error('adminAdjustBalance 에러:', error);
    }
}

// 누적 청산 한도 조정 (레벨 3+)
async function adminAdjustMaxDrawdown(participantId, challengeId) {
    if (!hasLevel(3)) return;
    
    try {
        const data = await _dbGet(`prop_challenges/${challengeId}/participants`, participantId);

        if (!data || data.error) { showToast('Participant not found', 'error'); return; }
        const currentDD = data.maxDrawdown || 3000;
        const email = data.email || data.userId || participantId;
        const balance = data.currentBalance || 0;
        const pnl = balance - (data.initialBalance || 0);

        const newDD = prompt(`[${email}]\nCurrent balance: $${balance.toLocaleString()} (PnL: $${pnl.toFixed(0)})\nCurrent liquidation limit: -$${currentDD.toLocaleString()}\n\nNew liquidation limit ($):`, currentDD);
        if (!newDD || isNaN(newDD)) return;

        await _dbUpdate(`prop_challenges/${challengeId}/participants`, participantId, { maxDrawdown: Math.abs(parseFloat(newDD)) });

        await _dbAdd('admin_log', {
            action: 'adjust_max_drawdown',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            participantId, challengeId,
            prevDrawdown: currentDD,
            newDrawdown: Math.abs(parseFloat(newDD)),
            timestamp: new Date().toISOString()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Liquidation limit -$${currentDD.toLocaleString()} → -$${parseFloat(newDD).toLocaleString()} updated`, 'success');
        loadAdminParticipants();
    } catch (error) {
        showToast('Update failed: ' + error.message, 'info');
        console.error('adminAdjustMaxDrawdown 에러:', error);
    }
}

// 카피트레이딩 계정 수 조정 (레벨 3+)
async function adminAdjustCopyAccounts(participantId, challengeId) {
    if (!hasLevel(3)) return;
    
    try {
        const data = await _dbGet(`prop_challenges/${challengeId}/participants`, participantId);

        if (!data || data.error) { showToast('Participant not found', 'error'); return; }
        const currentCopy = data.copyAccounts || 1;
        const email = data.email || data.userId || participantId;

        const newCopy = prompt(`[${email}]\nCurrent copy trading accounts: ${currentCopy}\n\nNew copy account count (1~10):`, currentCopy);
        if (!newCopy || isNaN(newCopy)) return;

        const val = Math.min(10, Math.max(1, parseInt(newCopy)));

        await _dbUpdate(`prop_challenges/${challengeId}/participants`, participantId, { copyAccounts: val });

        await _dbAdd('admin_log', {
            action: 'adjust_copy_accounts',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            participantId, challengeId,
            prevCopyAccounts: currentCopy,
            newCopyAccounts: val,
            timestamp: new Date().toISOString()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Copy accounts ${currentCopy} → ${val} updated\n(Effective contracts = input contracts x ${val})`, 'success');
        loadAdminParticipants();
    } catch (error) {
        showToast('Update failed: ' + error.message, 'info');
    }
}

// 거래 티어 (MNQ/NQ 최대 계약수) 조정 (레벨 3+)
async function adminAdjustTradingTier(participantId, challengeId) {
    if (!hasLevel(3)) return;
    
    try {
        const data = await _dbGet(`prop_challenges/${challengeId}/participants`, participantId);

        if (!data || data.error) { showToast('Participant not found', 'error'); return; }
        const currentTier = data.tradingTier || { MNQ: 1, NQ: 0 };
        const email = data.email || data.userId || participantId;

        const mnqMax = prompt(`[${email}]\nCurrent MNQ max: ${currentTier.MNQ || 0}\nNQ max: ${currentTier.NQ || 0}\n\nMNQ max contracts:`, currentTier.MNQ || 1);
        if (mnqMax === null) return;
        
        const nqMax = prompt(`NQ max contracts:`, currentTier.NQ || 0);
        if (nqMax === null) return;
        
        const newTier = { MNQ: parseInt(mnqMax) || 0, NQ: parseInt(nqMax) || 0 };
        
        await _dbUpdate(`prop_challenges/${challengeId}/participants`, participantId, { tradingTier: newTier });

        await _dbAdd('admin_log', {
            action: 'adjust_trading_tier',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            participantId, challengeId,
            prevTier: currentTier,
            newTier: newTier,
            timestamp: new Date().toISOString()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Trading tier updated\nMNQ: ${currentTier.MNQ||0} → ${newTier.MNQ}\nNQ: ${currentTier.NQ||0} → ${newTier.NQ}`, 'success');
        loadAdminParticipants();
    } catch (error) {
        showToast('Update failed: ' + error.message, 'info');
    }
}

// Admin 지갑 - 온체인 잔액 로드
// ═══════════════════════════════════════════════════════
// 삭제된 지갑 조회 (관리자)
// ═══════════════════════════════════════════════════════
async function adminLoadDeletedWallets() {
    if (!hasLevel(3)) { showToast('Insufficient permission (Level 3+)', 'warning'); return; }

    const container = document.getElementById('admin-deleted-wallets');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--accent);">Loading deleted wallets...</p>';
    
    try {
        const users = await _dbQuery('users', {});
        let html = '';
        let count = 0;

        for (const userData of (users || [])) {
            const wallets = await _dbQuery(`users/${userData.id}/wallets`, { where: ['status', '==', 'deleted'] });

            for (const w of (wallets || [])) {
                count++;
                const deletedAt = w.deletedAt ? new Date(w.deletedAt).toLocaleString('ko-KR') : '--';
                html += `<div style="padding:0.6rem;background:#FFF8F0;border-radius:6px;margin-bottom:0.4rem;border-left:3px solid #B54534;">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.3rem;">
                        <div>
                            <strong style="font-size:0.85rem;">${w.name || 'Wallet'}</strong>
                            <span style="font-size:0.7rem;color:#6B5744;margin-left:0.3rem;">${userData.email || userData.id}</span>
                            <div style="font-size:0.72rem;color:#6B5744;font-family:monospace;">${w.walletAddress || '--'}</div>
                            <div style="font-size:0.68rem;color:#B54534;">Deleted: ${deletedAt}</div>
                        </div>
                        ${hasLevel(4) ? `<button onclick="adminRestoreWallet('${userData.id}','${w.id}')" style="background:#5B7B8C;color:#FFF8F0;border:none;padding:0.3rem 0.6rem;border-radius:4px;cursor:pointer;font-size:0.7rem;"><i data-lucide="rotate-ccw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Restore</button>` : ''}
                    </div>
                </div>`;
            }
        }
        
        container.innerHTML = html || '<p style="font-size:0.85rem;color:#6B5744;">No deleted wallets found.</p>';
        container.insertAdjacentHTML('beforebegin', `<div style="font-size:0.8rem;color:var(--accent);margin-bottom:0.3rem;">${count} deleted wallet(s) found</div>`);
    } catch (e) {
        container.innerHTML = `<p style="color:red;">Lookup failed: ${e.message}</p>`;
    }
}

// 삭제된 지갑 복구
async function adminRestoreWallet(userId, walletId) {
    if (!hasLevel(4)) return;
    if (!confirm('Restore this wallet?')) return;
    try {
        await _dbUpdate(`users/${userId}/wallets`, walletId, {
            status: { __fieldValue: 'delete' },
            deletedAt: { __fieldValue: 'delete' },
            restoredAt: new Date().toISOString(),
            restoredBy: currentUser.email
        });
        await _dbAdd('admin_log', {
            action: 'restore_wallet', adminEmail: currentUser.email,
            adminLevel: currentUserLevel, targetUserId: userId, walletId,
            timestamp: new Date().toISOString()
        });
        showToast('<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Wallet restored', 'success');
        adminLoadDeletedWallets();
    } catch (e) {
        showToast('Restore failed: ' + e.message, 'error');
    }
}

async function loadAdminWallet() {
    if (!isAdmin()) return;
    
    const container = document.getElementById('admin-wallet-info');
    if (!container) { console.error(t('admin.wallet_info_missing','admin-wallet-info not found')); return; }
    
    container.innerHTML = '<p style="color:var(--accent);"><i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Loading on-chain balances... (v4.0)</p>';
    
    try {
        // 1. 서버에서 관리자 지갑 주소
        const wallets = await _dbQuery(`users/${currentUser.uid}/wallets`, { limit: 1 });

        if (!wallets || wallets.length === 0) {
            container.innerHTML = '<p style="color:red;"><i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> No wallet found</p>';
            return;
        }

        const adminWalletData = wallets[0];
        const adminAddress = adminWalletData.walletAddress;
        
        if (!adminAddress) {
            container.innerHTML = '<p style="color:red;"><i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> walletAddress field missing</p>';
            return;
        }
        
        // 2. 온체인 잔액 조회
        const balances = await getAllOnchainBalances(adminAddress);
        
        // 3. POL 잔액 (가스비)
        const maticBalance = await web3.eth.getBalance(adminAddress);
        const maticFormatted = parseFloat(web3.utils.fromWei(maticBalance, 'ether')).toFixed(4);
        
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
                    <div style="font-size:0.7rem; color:#5B7B8C;">CRFN</div>
                    <strong style="font-size:1.2rem;">${balances.crfn.toLocaleString(undefined, {maximumFractionDigits:2})}</strong>
                </div>
                <div style="background:#F7F3ED; padding:0.6rem 1rem; border-radius:6px; text-align:center; min-width:80px;">
                    <div style="font-size:0.7rem; color:#6a1b9a;">POL (Gas)</div>
                    <strong style="font-size:1.2rem;">${maticFormatted}</strong>
                </div>
            </div>
            <button onclick="loadAdminWallet()" style="background:var(--accent); color:#FFF8F0; border:none; padding:0.4rem 0.8rem; border-radius:4px; cursor:pointer; font-size:0.8rem;"><i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Refresh</button>
        `;
        
        // 전역에 저장
        window.adminWalletAddress = adminAddress;
        window.adminWalletId = wallets[0].id;
        
    } catch (error) {
        console.error('Admin wallet load error:', error);
        container.innerHTML = `<p style="color:red;">Balance lookup failed: ${error.message}</p>
            <button onclick="loadAdminWallet()" style="background:var(--accent); color:#FFF8F0; border:none; padding:0.4rem 0.8rem; border-radius:4px; cursor:pointer; font-size:0.8rem; margin-top:0.5rem;"><i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Retry</button>`;
    }
}

// Admin: 온체인 ERC-20 토큰 전송
async function adminSendToken() {
    if (!isAdmin()) return;
    
    const email = document.getElementById('admin-send-email').value;
    const tokenKey = document.getElementById('admin-send-token').value;
    const amount = parseFloat(document.getElementById('admin-send-amount').value);
    
    if (!email || !amount || amount <= 0) {
        showToast(t('admin.enter_email_amount','Enter email and amount'), 'info');
        return;
    }
    
    try {
        // 받는 사람 찾기
        const users = await _dbQuery('users', { where: ['email', '==', email] });
        if (!users || users.length === 0) {
            showToast('User not found: ' + email, 'info');
            return;
        }

        const targetUser = users[0];
        const targetUserId = targetUser.id;

        // 받는 사람의 지갑 주소 찾기
        const wallets = await _dbQuery(`users/${targetUserId}/wallets`, { limit: 1 });

        if (!wallets || wallets.length === 0) {
            showToast('User wallet not found', 'error');
            return;
        }

        const targetWalletData = wallets[0];
        const toAddress = targetWalletData.walletAddress;
        
        if (!toAddress) {
            showToast('Recipient has no Polygon wallet address', 'info');
            return;
        }
        
        // 관리자 private key 가져오기
        const adminWallets = await _dbQuery(`users/${currentUser.uid}/wallets`, { limit: 1 });

        if (!adminWallets || adminWallets.length === 0) {
            showToast('Admin wallet not found', 'error');
            return;
        }

        const adminWalletData = adminWallets[0];
        const fromPrivateKey = adminWalletData.privateKey;
        const fromAddress = adminWalletData.walletAddress;
        
        if (!fromPrivateKey) {
            showToast('Admin wallet private key not found', 'info');
            return;
        }
        
        // 온체인 잔액 확인
        const balance = await getOnchainBalance(fromAddress, tokenKey);
        if (balance < amount) {
            showToast(`Insufficient on-chain balance!\nHave: ${balance.toFixed(4)} ${tokenKey.toUpperCase()}\nNeed: ${amount}`, 'error');
            return;
        }
        
        // MATIC 잔액 확인 (가스비)
        const maticBalance = await web3.eth.getBalance(fromAddress);
        const maticFormatted = parseFloat(web3.utils.fromWei(maticBalance, 'ether'));
        if (maticFormatted < 0.01) {
            showToast(`<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Insufficient POL(MATIC) for gas!\nHave: ${maticFormatted.toFixed(4)} POL\nMinimum 0.01 POL required`, 'error');
            return;
        }
        
        const tokenSymbol = tokenKey.toUpperCase();
        if (!window.confirm(
            `On-chain Token Transfer\n\n` +
            `From: ${fromAddress.slice(0,6)}...${fromAddress.slice(-4)}\n` +
            `To: ${email}\n` +
            `  (${toAddress.slice(0,6)}...${toAddress.slice(-4)})\n` +
            `Token: ${amount} ${tokenSymbol}\n` +
            `Chain: Polygon\n\n` +
            `<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> On-chain transactions cannot be reversed.\nProceed?`
        )) return;
        
        // 전송 진행 UI
        const sendBtn = document.querySelector('[onclick="adminSendToken()"]');
        if (sendBtn) {
            sendBtn.textContent = '⏳ Sending...';
            sendBtn.disabled = true;
        }
        
        // 온체인 전송
        const receipt = await sendOnchainToken(fromPrivateKey, toAddress, tokenKey, amount);
        
        // 서버에도 기록 (내부 잔액 동기화)
        const targetBalances = targetWalletData.balances || {};
        await _dbUpdate(`users/${targetUserId}/wallets`, wallets[0].id, {
            [`balances.${tokenKey}`]: (targetBalances[tokenKey] || 0) + amount
        });

        // 거래 기록
        await _dbAdd('transactions', {
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
            timestamp: new Date().toISOString()
        });

        await _dbAdd('admin_log', {
            action: 'onchain_send_token',
            adminEmail: currentUser.email,
            targetEmail: email,
            token: tokenSymbol,
            amount: amount,
            txHash: receipt.transactionHash,
            timestamp: new Date().toISOString()
        });
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> On-chain transfer complete! ${amount} ${tokenSymbol} → ${email}`, 'success');
        
        document.getElementById('admin-send-email').value = '';
        document.getElementById('admin-send-amount').value = '1';
        loadAdminWallet();
        
    } catch (error) {
        console.error(t('admin.onchain_transfer_fail','On-chain transfer failed') + ':', error);
        showToast('Transfer failed: ' + error.message, 'info');
    } finally {
        const sendBtn = document.querySelector('[onclick="adminSendToken()"]');
        if (sendBtn) {
            sendBtn.textContent = 'Send';
            sendBtn.disabled = false;
        }
    }
}

// 관리자: 모든 챌린지의 참가자 목록 로드
async function loadAdminParticipants() {
    if (!isAdmin()) return;
    
    const container = document.getElementById('admin-participants-list');
    container.innerHTML = '<p style="color:var(--accent);">Loading...</p>';

    try {
        // 모든 챌린지 가져오기
        const challenges = await _dbQuery('prop_challenges', {
            orderBy: 'createdAt,desc', limit: 5
        });

        if (!challenges || challenges.length === 0) {
            container.innerHTML = '<p style="color:var(--accent);">No challenges found.</p>';
            return;
        }

        let html = '';

        for (const challenge of challenges) {
            const challengeId = challenge.id;

            // 해당 챌린지의 참가자 가져오기
            const participants = await _dbQuery(`prop_challenges/${challengeId}/participants`, {});
            
            html += `
                <div style="border:1px solid var(--border); border-radius:8px; padding:1rem; margin-bottom:1rem;">
                    <h4 style="margin-bottom:0.5rem;"><i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${challenge.title || 'Challenge'} <span style="font-size:0.75rem; color:var(--accent);">(${challengeId.slice(0,8)})</span></h4>
                    <p style="font-size:0.8rem; color:var(--accent); margin-bottom:0.8rem;">Participants: ${(participants || []).length}</p>
            `;

            if (!participants || participants.length === 0) {
                html += '<p style="font-size:0.85rem; color:var(--accent);">No participants</p>';
            } else {
                for (const p of participants) {
                    const participantId = p.id;
                    const openTrades = (p.trades || []).filter(t => t.status === 'open');
                    const initial = p.initialBalance || 100000;
                    const current = p.currentBalance || 100000;
                    const pnl = current - initial;
                    const pnlColor = pnl >= 0 ? '#3D2B1F' : '#cc0000';
                    const isSuspended = p.adminSuspended || false;
                    const isLocked = p.dailyLocked || false;
                    
                    let statusBadge = '🟢 Normal';
                    if (isSuspended) statusBadge = '<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Admin Suspended';
                    else if (isLocked) statusBadge = '<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Daily Limit';
                    
                    html += `
                        <div style="background:var(--bg); padding:0.8rem; border-radius:6px; margin-bottom:0.5rem; border-left:3px solid ${isSuspended ? '#cc0000' : '#3D2B1F'};">
                            <div style="display:flex; justify-content:space-between; align-items:start; flex-wrap:wrap; gap:0.5rem;">
                                <div>
                                    <strong style="font-size:0.9rem;">${p.email || p.userId || 'Unknown'}</strong>
                                    <span style="font-size:0.75rem; margin-left:0.5rem;">${statusBadge}</span>
                                    <div style="font-size:0.8rem; color:var(--accent); margin-top:0.3rem;">
                                        Balance: $${current.toLocaleString()} |
                                        PnL: <span style="color:${pnlColor}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)}</span> |
                                        Positions: ${openTrades.length}
                                    </div>
                                    <div style="font-size:0.75rem; color:var(--accent); margin-top:0.2rem;">
                                        Daily PnL: <span style="color:${(p.dailyPnL || 0) < 0 ? '#cc0000' : '#3D2B1F'}">$${(p.dailyPnL || 0).toFixed(2)}</span> /
                                        Daily limit: <span style="font-weight:700;">$${p.dailyLossLimit || 500}</span> ·
                                        Liquidation: <span style="font-weight:700;">$${(p.maxDrawdown || 3000).toLocaleString()}</span>
                                        ${p.copyAccounts > 1 ? ` · <span style="color:#C4841D; font-weight:700;">Copy: ${p.copyAccounts} accts</span>` : ''}
                                        ${p.tradingTier ? ` · <span style="color:#8B6914;">MNQ×${p.tradingTier.MNQ||0} NQ×${p.tradingTier.NQ||0}</span>` : ''}
                                    </div>
                                    ${isSuspended ? `<div style="font-size:0.75rem; color:#cc0000; margin-top:0.2rem;">Reason: ${p.suspendReason || '-'}</div>` : ''}
                                </div>
                                <div style="display:flex; gap:0.3rem; flex-wrap:wrap;">
                                    ${openTrades.length > 0 ? `
                                        <button onclick="adminForceCloseAll('${p.userId}', '${participantId}', '${challengeId}')" 
                                            style="background:#cc0000; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                            × Force Close
                                        </button>
                                    ` : ''}
                                    ${!isSuspended ? `
                                        <button onclick="adminSuspendTrading('${participantId}', '${challengeId}')" 
                                            style="background:#C4841D; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                            <i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Suspend Trading
                                        </button>
                                    ` : `
                                        <button onclick="adminResumeTrading('${participantId}', '${challengeId}')" 
                                            style="background:#5B7B8C; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                            <i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Resume Trading
                                        </button>
                                    `}
                                    ${isLocked ? `
                                        <button onclick="adminUnlockTrading('${participantId}', '${challengeId}')" 
                                            style="background:#5B7B8C; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                            <i data-lucide="unlock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Unlock
                                        </button>
                                    ` : ''}
                                    <button onclick="adminAdjustDailyLimit('${participantId}', '${challengeId}')" 
                                        style="background:#6B5744; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                        <i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Daily Limit
                                    </button>
                                    <button onclick="adminAdjustMaxDrawdown('${participantId}', '${challengeId}')" 
                                        style="background:#455A64; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                        <i data-lucide="skull" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Max DD
                                    </button>
                                    <button onclick="adminAdjustBalance('${participantId}', '${challengeId}')" 
                                        style="background:#795548; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                        <i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Adjust Balance
                                    </button>
                                    <button onclick="adminAdjustCopyAccounts('${participantId}', '${challengeId}')" 
                                        style="background:#C4841D; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                        <i data-lucide="clipboard-list" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Copy Accts
                                    </button>
                                    <button onclick="adminAdjustTradingTier('${participantId}', '${challengeId}')" 
                                        style="background:#8B6914; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                                        <i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Trading Tier
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
        container.innerHTML = `<p style="color:red;">Load failed: ${error.message}</p>`;
        console.error('Admin participants load error:', error);
    }
}

// 관리자: 활동 로그 로드
async function loadAdminLog() {
    if (!isAdmin()) return;
    
    const container = document.getElementById('admin-log-list');
    container.innerHTML = '<p style="color:var(--accent);">Loading...</p>';

    try {
        const logs = await _dbQuery('admin_log', {
            orderBy: 'timestamp,desc', limit: 20
        });

        if (!logs || logs.length === 0) {
            container.innerHTML = '<p style="color:var(--accent);">No logs found.</p>';
            return;
        }

        let html = '';
        logs.forEach(log => {
            const time = log.timestamp ? new Date(log.timestamp).toLocaleString('ko-KR') : '-';
            
            let actionText = '';
            let actionColor = '';
            switch (log.action) {
                case 'force_close_all':
                    actionText = '× Force Close';
                    actionColor = '#cc0000';
                    break;
                case 'suspend_trading':
                    actionText = '<i data-lucide="octagon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Suspend Trading';
                    actionColor = '#C4841D';
                    break;
                case 'resume_trading':
                    actionText = '<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Resume Trading';
                    actionColor = '#5B7B8C';
                    break;
                default:
                    actionText = log.action;
                    actionColor = '#6B5744';
            }
            
            html += `
                <div style="padding:0.6rem; border-bottom:1px solid var(--border); font-size:0.85rem;">
                    <span style="color:${actionColor}; font-weight:600;">${actionText}</span>
                    <span style="color:var(--accent); margin-left:0.5rem;">${time}</span>
                    ${log.reason ? `<div style="font-size:0.75rem; color:var(--accent); margin-top:0.2rem;">Reason: ${log.reason}</div>` : ''}
                    ${log.totalPnL !== undefined ? `<div style="font-size:0.75rem; margin-top:0.2rem;">PnL: $${log.totalPnL.toFixed(2)}</div>` : ''}
                </div>
            `;
        });
        
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<p style="color:red;">Log load failed: ${error.message}</p>`;
    }
}

// ========== PROP TRADING ==========
async function loadPropTrading() {
    const container = document.getElementById('trading-challenges');
    if (!container) return;
    container.innerHTML = `<p style="text-align:center; padding:2rem;">${window.t ? window.t('common.loading','Loading...') : 'Loading...'}</p>`;

    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const res = await fetch('/api/challenges', { headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
        const challengeList = await res.json();

        container.innerHTML = '';

        if (!challengeList || challengeList.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:3rem; color:var(--accent);">
                    <p style="font-size:3rem; margin-bottom:1rem;"><i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></p>
                    <p>${window.t ? window.t('challenge.no_challenges','No active challenges') : 'No active challenges'}</p>
                </div>
            `;
            return;
        }

        for (const ch of challengeList) {
            const tiers = ch.tiers || {};
            const tierKeys = Object.keys(tiers).sort();
            
            // 티어 카드 생성
            let tierHTML = '';
            for (const key of tierKeys) {
                const t = tiers[key];
                tierHTML += `
                    <div style="background:var(--bg); padding:0.8rem; border-radius:8px; text-align:center; border:1px solid var(--border);">
                        <div style="font-size:1.3rem; font-weight:800; color:#8B2BE2;">${window.t ? window.t('challenge.tier','Tier') : 'Tier'} ${key}</div>
                        <div style="font-size:1.4rem; font-weight:700; color:#3D2B1F; margin:0.3rem 0;">${t.deposit} CRTD</div>
                        <div style="font-size:0.75rem; color:var(--accent); line-height:1.6;">
                            <i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> $${(t.account||100000).toLocaleString()} ${window.t ? window.t('challenge.account','Account') : 'Account'}<br>
                            <i data-lucide="skull" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> -$${(t.liquidation||3000).toLocaleString()} ${window.t ? window.t('challenge.liquidation','Liquidation') : 'Liquidation'}<br>
                            <i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> +$${(t.profitThreshold||1000).toLocaleString()}~ → CRTD<br>
                            <i data-lucide="gem" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${(t.withdrawUnit||1000).toLocaleString()} ${window.t ? window.t('challenge.withdraw_unit','unit withdraw') : 'unit withdraw'}
                        </div>
                        <button onclick="joinChallenge('${ch.id}','${key}')" class="btn-primary" style="width:100%; margin-top:0.5rem; padding:0.6rem; font-size:0.9rem;">
                            <i data-lucide="rocket" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${window.t ? window.t('challenge.join','Join') : 'Join'} ${key}
                        </button>
                    </div>
                `;
            }
            
            // 티어가 없으면 기본값 (하위 호환)
            if (tierKeys.length === 0) {
                tierHTML = `
                    <div style="background:var(--bg); padding:0.8rem; border-radius:8px; text-align:center;">
                        <div style="font-size:1.2rem; font-weight:700; color:#3D2B1F;">${ch.entryFeeCRTD || 100} CRTD</div>
                        <button onclick="joinChallenge('${ch.id}','A')" class="btn-primary" style="width:100%; margin-top:0.5rem; padding:0.7rem;">
                            <i data-lucide="rocket" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${window.t ? window.t('challenge.join','Join') : 'Join'}
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
                    <span><i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${ch.allowedProduct || 'MNQ'} | <span style="color:var(--error)">●</span> ${window.t ? window.t('challenge.daily_limit','Daily') : 'Daily'} -$${ch.dailyLossLimit || 500}</span>
                    <span><i data-lucide="users" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${ch.participants || 0} ${window.t ? window.t('challenge.participants','participants') : 'participants'}</span>
                </div>
            `;
            container.appendChild(card);
        }
    } catch (error) {
        console.error('Load challenges error:', error);
        container.innerHTML = `<p style="text-align:center; color:red;">${window.t ? window.t('challenge.load_failed','Load failed') : 'Load failed'}: ${error.code || error.message}</p>`;
    }
}

async function showCreateChallenge() {
    if (!isAdmin()) {
        showToast(window.t ? window.t('challenge.admin_only','Only admins can create challenges') : 'Only admins can create challenges', 'info');
        return;
    }
    
    const formHTML = `
        <div id="create-challenge-form" style="background:#FFF8F0; padding:1rem; border-radius:12px; margin-top:1rem; border:2px solid var(--accent); box-sizing:border-box; max-width:100%; overflow:hidden;">
            <h3 style="margin-bottom:1rem;"><i data-lucide="plus-circle" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> ${window.t ? window.t('challenge.create_title','Create CRTD Challenge') : 'Create CRTD Challenge'}</h3>

            <div style="display:grid; gap:0.8rem;">
                <div>
                    <label style="font-size:0.85rem; font-weight:600;">${window.t ? window.t('challenge.name_label','Challenge Name') : 'Challenge Name'}</label>
                    <input type="text" id="ch-name" value="Trading Game v1" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem; box-sizing:border-box;">
                </div>
                
                <!-- ★ 티어 설정 -->
                <div style="background:linear-gradient(135deg, rgba(139,105,20,0.05), rgba(107,87,68,0.05)); padding:1rem; border-radius:8px; border:1px solid rgba(139,105,20,0.2);">
                    <h4 style="margin-bottom:0.8rem;"><i data-lucide="gem" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${window.t ? window.t('challenge.tier_settings','CRTD Tier Settings') : 'CRTD Tier Settings'}</h4>
                    <p style="font-size:0.75rem; color:var(--accent); margin-bottom:0.8rem;">${window.t ? window.t('challenge.tier_hint','Set entry fee to 0 to disable a tier') : 'Set entry fee to 0 to disable a tier'}</p>
                    
                    <div style="overflow-x:auto; -webkit-overflow-scrolling:touch; max-width:100%;">
                        <table style="min-width:580px; border-collapse:collapse; font-size:0.82rem;">
                            <thead>
                                <tr style="background:var(--bg);">
                                    <th style="padding:0.4rem; text-align:left;">Tier</th>
                                    <th style="padding:0.4rem;">Entry<br>(CRTD)</th>
                                    <th style="padding:0.4rem;">Account<br>($)</th>
                                    <th style="padding:0.4rem;">Liq.<br>(-$)</th>
                                    <th style="padding:0.4rem;">Profit<br>(+$)</th>
                                    <th style="padding:0.4rem;">Withdraw<br>(CRTD)</th>
                                    <th style="padding:0.4rem;">MNQ<br>Max</th>
                                    <th style="padding:0.4rem;">NQ<br>Max</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style="padding:0.4rem; font-weight:700;">A Tier A</td>
                                    <td><input type="number" id="tier-a-deposit" value="100" style="width:60px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-a-account" value="100000" style="width:75px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-a-liq" value="3000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-a-profit" value="1000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-a-unit" value="1000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-a-mnq" value="3" min="0" style="width:45px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-a-nq" value="0" min="0" style="width:45px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                </tr>
                                <tr style="background:var(--bg);">
                                    <td style="padding:0.4rem; font-weight:700;">B Tier B</td>
                                    <td><input type="number" id="tier-b-deposit" value="200" style="width:60px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-account" value="150000" style="width:75px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-liq" value="5000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-profit" value="1500" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-unit" value="1000" style="width:65px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-mnq" value="5" min="0" style="width:45px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                    <td><input type="number" id="tier-b-nq" value="1" min="0" style="width:45px; padding:0.3rem; border:1px solid var(--border); border-radius:4px; text-align:center;"></td>
                                </tr>
                                <tr>
                                    <td style="padding:0.4rem; font-weight:700;">🅲 Tier C</td>
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
                        <label style="font-size:0.85rem; font-weight:600;"><i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${window.t ? window.t('challenge.product_limit','Product') : 'Product'}</label>
                        <select id="ch-product" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem; box-sizing:border-box;">
                            <option value="MNQ">MNQ (Micro)</option>
                            <option value="NQ">NQ (E-mini)</option>
                            <option value="BOTH">MNQ + NQ</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;"><i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${window.t ? window.t('challenge.max_contracts','Max Contracts') : 'Max Contracts'}</label>
                        <input type="number" id="ch-max-contracts" value="1" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem; box-sizing:border-box;">
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem;">
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;"><span style="color:var(--error)">●</span> ${window.t ? window.t('challenge.daily_loss_limit','Daily Loss Limit') : 'Daily Loss Limit'} ($)</label>
                        <input type="number" id="ch-daily-limit" value="500" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;"><i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${window.t ? window.t('challenge.max_positions','Max Positions') : 'Max Positions'}</label>
                        <input type="number" id="ch-max-positions" value="5" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem; box-sizing:border-box;">
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem;">
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;">⏳ ${window.t ? window.t('challenge.duration','Duration (days)') : 'Duration (days)'}</label>
                        <input type="number" id="ch-duration" value="30" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:600;"><i data-lucide="clock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${window.t ? window.t('challenge.settlement','Settlement') : 'Settlement'}</label>
                        <select id="ch-settlement" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:6px; margin-top:0.3rem; box-sizing:border-box;">
                            <option value="EOD">EOD (End of Day)</option>
                            <option value="WEEKLY">Weekly</option>
                            <option value="MONTHLY">Monthly</option>
                        </select>
                    </div>
                </div>
                
                <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
                    <button onclick="submitCreateChallenge()" class="btn-primary" style="flex:1; padding:0.8rem;"><i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${window.t ? window.t('challenge.create_btn','Create Challenge') : 'Create Challenge'}</button>
                    <button onclick="document.getElementById('create-challenge-form').remove()" style="flex:0.5; padding:0.8rem; background:var(--border); border:none; border-radius:6px; cursor:pointer;">${window.t ? window.t('challenge.cancel','Cancel') : 'Cancel'}</button>
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
    if (!name) { showToast('Enter challenge name', 'info'); return; }
    
    // 티어 읽기
    const tiers = {};
    const tierA = readTierInput('a'); if (tierA) tiers.A = tierA;
    const tierB = readTierInput('b'); if (tierB) tiers.B = tierB;
    const tierC = readTierInput('c'); if (tierC) tiers.C = tierC;
    
    if (Object.keys(tiers).length === 0) {
        showToast('Set entry fee for at least 1 tier', 'info');
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
        
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/challenges', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify(challengeData)
        });
        const result = await resp.json();
        if (result.error) { showToast(result.error, 'error'); return; }

        const tierSummary = Object.entries(tiers).map(([k,v]) => `${k}=${v.deposit}CRTD`).join(', ');
        showToast(`Challenge created! ${name} / Tiers: ${tierSummary}`, 'success');

        document.getElementById('create-challenge-form')?.remove();
        loadPropTrading();
    } catch (error) {
        showToast('Creation failed: ' + error.message, 'info');
    }
}

async function joinChallenge(challengeId, tierKey) {
    if (!currentUser) { showToast('Login required', 'error'); return; }

    const ok = typeof showConfirmModal === 'function'
        ? await showConfirmModal('CRTD Prop Trading', `Join Tier ${tierKey} challenge?`)
        : window.confirm(`Join Tier ${tierKey} challenge?`);
    if (!ok) return;

    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const res = await fetch('/api/challenges/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ challengeId, tierKey })
        });
        const result = await res.json();
        if (result.error) { showToast(result.error, 'error'); return; }

        showToast(`Tier ${tierKey} joined!`, 'success');
        loadPropTrading();
        if (typeof loadTradingDashboard === 'function') loadTradingDashboard();
    } catch (error) {
        console.error('joinChallenge error:', error);
        showToast('Join failed: ' + error.message, 'error');
    }
}

// ========== ART - 디지털 아트 거래소 ==========


// (ART 코드 → app-art.js로 분리됨)

// ========== MALL - 쇼핑몰 ==========

// MALL_CATEGORIES는 marketplace.js에서 정의됨 (중복 선언 방지)
if (typeof MALL_CATEGORIES === 'undefined') var MALL_CATEGORIES = { present:'Present', doctor:'Doctor', medical:'Medical', avls:'AVLs', solution:'Private', architect:'Architect', mall:'Crowny Mall', designers:'Designers', other:'Other' };

async function registerProduct() {
    if (!currentUser) { showToast('Login required', 'warning'); return; }
    const title = document.getElementById('product-title').value.trim();
    const price = parseFloat(document.getElementById('product-price').value);
    const imageFiles = document.getElementById('product-image').files;
    if (!title || !price) { showToast('Enter product name and price', 'warning'); return; }
    if (!imageFiles || imageFiles.length === 0) { showToast('Select product image', 'warning'); return; }
    if (imageFiles.length > 5) { showToast('Maximum 5 images allowed', 'warning'); return; }
    
    try {
        // Multi-image: resize all images
        const images = [];
        for (let i = 0; i < Math.min(imageFiles.length, 5); i++) {
            const resized = await fileToBase64Resized(imageFiles[i], 400);
            images.push(resized);
        }
        const userData = await _dbGet('users', currentUser.uid);

        await _dbAdd('products', {
            title, description: document.getElementById('product-desc').value.trim(),
            category: document.getElementById('product-category').value,
            price, priceToken: 'CRGC',
            stock: parseInt(document.getElementById('product-stock').value) || 1,
            images,
            imageData: images[0],
            sellerId: currentUser.uid, sellerEmail: currentUser.email,
            sellerNickname: userData?.nickname || '',
            sold: 0, status: (currentUser.email === 'kps@crowny.org') ? 'active' : 'pending', createdAt: new Date().toISOString()
        });
        
        showToast(`<i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> "${title}" registered!`, 'success');
        document.getElementById('product-title').value = '';
        document.getElementById('product-desc').value = '';
        document.getElementById('product-image').value = '';
        const preview = document.getElementById('product-image-preview');
        if (preview) preview.innerHTML = '';
        loadMallProducts();
    } catch (e) { showToast('Registration failed: ' + e.message, 'error'); }
}

// ========== 오프체인/CRNY 비율 관리 (수퍼관리자) ==========

// 현재 비율 로드 (토큰별 개별 비율)
async function loadExchangeRate() {
    try {
        const data = await _dbGet('admin_config', 'exchange_rate');
        if (data && !data.error) {
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
                        const date = h.timestamp ? new Date(h.timestamp).toLocaleString('ko-KR') : '--';
                        const tokenLabel = h.token ? h.token.toUpperCase() : 'All';
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
        console.warn(t('admin.ratio_load_fail','Ratio load failed') + ':', e);
    }
}

// 비율 변경 요청 (토큰별 개별 비율, 2단계 확인)
async function requestRateChange() {
    if (!isSuperAdmin()) { showToast('Super Admin only', 'warning'); return; }
    
    const reason = (document.getElementById('rate-change-reason')?.value || '').trim();
    if (!reason) { showToast('Enter reason for change', 'warning'); return; }
    
    const tokens = ['crtd', 'crac', 'crgc', 'creb'];
    const currentRates = window.OFFCHAIN_RATES || {};
    const newRates = {};
    const changes = [];
    
    for (const t of tokens) {
        const val = parseInt(document.getElementById('rate-' + t)?.value);
        if (!val || val < 1 || val > 10000) {
            showToast(`${t.toUpperCase()} rate is invalid (1~10,000)`, 'error');
            return;
        }
        newRates[t] = val;
        const oldVal = currentRates[t] || 100;
        if (val !== oldVal) {
            changes.push({token: t, oldRate: oldVal, newRate: val});
        }
    }
    
    if (changes.length === 0) { showToast('No rates changed', 'info'); return; }
    
    const changeText = changes.map(c => `${c.token.toUpperCase()}: ${c.oldRate} → ${c.newRate}`).join('\n');
    const confirmed = await showConfirmModal('Confirm Rate Change', `The following rates will change:\n\n${changeText}\n\nReason: ${reason}\n\nThis will apply immediately to all bridge transactions.`);
    if (!confirmed) return;
    
    // 2차 확인
    const code = await showPromptModal('Security Verification', 'Type "RATE" exactly to confirm:', '');
    if (code !== 'RATE') { showToast('Confirmation code mismatch. Change cancelled.', 'error'); return; }
    
    try {
        const rateDoc = await _dbGet('admin_config', 'exchange_rate');
        const existingHistory = (rateDoc && !rateDoc.error) ? (rateDoc.history || []) : [];
        
        for (const c of changes) {
            existingHistory.push({
                token: c.token,
                oldRate: c.oldRate,
                newRate: c.newRate,
                reason: reason,
                adminEmail: currentUser.email,
                adminLevel: currentUserLevel,
                timestamp: new Date().toISOString()
            });
        }

        await _dbSet('admin_config', 'exchange_rate', {
            rates: newRates,
            rate: newRates.crtd,
            lastChangedBy: currentUser.email,
            lastChangedAt: new Date().toISOString(),
            history: existingHistory
        });

        await _dbAdd('admin_log', {
            action: 'exchange_rate_change',
            adminEmail: currentUser.email,
            adminLevel: currentUserLevel,
            changes: changes,
            reason: reason,
            timestamp: new Date().toISOString()
        });
        
        window.OFFCHAIN_RATES = newRates;
        window.OFFCHAIN_RATE = newRates.crtd;
        
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${changes.length} token rate(s) updated!`, 'success');
        document.getElementById('rate-change-reason').value = '';
        loadExchangeRate();
        
    } catch (e) {
        showToast('Rate change failed: ' + e.message, 'error');
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

    if (!name) { showToast('Enter coupon name', 'error'); return; }
    if (!code || code.length < 3) { showToast('Coupon code must be 3+ alphanumeric characters', 'error'); return; }
    if (!tokenKey) { showToast('Select a token', 'error'); return; }
    if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }

    try {
        const existing = await _dbQuery('coupons', { where: ['code', '==', code] });
        if (existing && existing.length > 0) { showToast('Coupon code already exists', 'error'); return; }

        await _dbAdd('coupons', {
            name: name,
            code: code,
            tokenKey: tokenKey,
            amount: amount,
            maxUses: maxUses,
            usedCount: 0,
            expiresAt: expiryVal ? new Date(expiryVal).toISOString() : null,
            createdBy: currentUser.uid,
            createdAt: new Date().toISOString(),
            enabled: true,
            description: description
        });

        showToast('<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Coupon created: ' + code, 'success');
        document.getElementById('coupon-name').value = '';
        document.getElementById('coupon-code').value = '';
        document.getElementById('coupon-amount').value = '';
        document.getElementById('coupon-desc').value = '';
        loadCouponList();
    } catch (e) {
        showToast(t('admin.coupon_fail','Coupon creation failed: ') + e.message, 'error');
    }
}

async function loadCouponList() {
    const listEl = document.getElementById('coupon-list');
    if (!listEl) return;
    listEl.innerHTML = '<p>Loading...</p>';

    try {
        const coupons = await _dbQuery('coupons', { orderBy: 'createdAt,desc' });
        if (!coupons || coupons.length === 0) { listEl.innerHTML = '<p style="color:#6B5744;">No coupons created</p>'; return; }

        const tokenNames = { crtd: 'CRTD', crac: 'CRAC', crgc: 'CRGC', creb: 'CREB' };
        let html = '<table style="width:100%; border-collapse:collapse; font-size:0.8rem;"><tr style="background:#F7F3ED;"><th style="padding:0.5rem; text-align:left;">Coupon</th><th>Token</th><th>Amount</th><th>Used</th><th>Status</th><th>Manage</th></tr>';

        coupons.forEach(c => {
            const expiry = c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('en-US') : 'Unlimited';
            const usageText = c.maxUses > 0 ? `${c.usedCount}/${c.maxUses}` : `${c.usedCount}/∞`;
            const statusColor = c.enabled ? '#5B7B8C' : '#B54534';
            const statusText = c.enabled ? 'Active' : 'Inactive';
            const couponName = c.name || c.code;
            html += `<tr style="border-bottom:1px solid #E8E0D8;">
                <td style="padding:0.5rem;">
                    <div style="font-weight:700;">${couponName}</div>
                    <div style="font-size:0.7rem; color:#6B5744; font-family:monospace;">Code: ${c.code}</div>
                </td>
                <td style="text-align:center;">${tokenNames[c.tokenKey] || c.tokenKey}</td>
                <td style="text-align:center;">${c.amount.toLocaleString()}</td>
                <td style="text-align:center;">${usageText}</td>
                <td style="text-align:center; color:${statusColor}; font-weight:600;">${statusText}</td>
                <td style="text-align:center;">
                    <div style="display:flex; flex-direction:column; gap:3px; align-items:center;">
                        <button onclick="toggleCoupon('${c.id}', ${!c.enabled})" style="padding:0.3rem 0.6rem; border:none; border-radius:4px; cursor:pointer; font-size:0.7rem; background:${c.enabled ? '#F7F3ED' : '#F7F3ED'}; color:${c.enabled ? '#B54534' : '#5B7B8C'}; width:100%;">${c.enabled ? 'Disable' : 'Enable'}</button>
                        <button onclick="viewCouponLog('${c.id}','${c.code}')" style="padding:0.3rem 0.6rem; border:none; border-radius:4px; cursor:pointer; font-size:0.7rem; background:#F7F3ED; color:#5B7B8C; width:100%;"><i data-lucide="scroll-text" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> Log</button>
                        <button onclick="deleteCoupon('${c.id}','${c.code}')" style="padding:0.3rem 0.6rem; border:none; border-radius:4px; cursor:pointer; font-size:0.7rem; background:#F7F3ED; color:#B54534; width:100%;"><i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Delete</button>
                    </div>
                </td>
            </tr>`;
            if (c.description) {
                html += `<tr><td colspan="6" style="padding:0.2rem 0.5rem; font-size:0.7rem; color:#6B5744;"><i data-lucide="file-text" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${c.description} | Expires: ${expiry}</td></tr>`;
            }
        });
        html += '</table>';
        listEl.innerHTML = html;
    } catch (e) {
        listEl.innerHTML = '<p style="color:red;">Load failed: ' + e.message + '</p>';
    }
}

async function toggleCoupon(couponId, enabled) {
    try {
        await _dbUpdate('coupons', couponId, { enabled: enabled });
        loadCouponList();
    } catch (e) {
        showToast('Status change failed: ' + e.message, 'error');
    }
}

async function deleteCoupon(couponId, code) {
    if (typeof showConfirmModal === 'function') {
        showConfirmModal(`Delete coupon "${code}"?\nUsage logs will be kept.`, async () => {
            try {
                await _dbDelete('coupons', couponId);
                showToast('<i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Coupon deleted', 'success');
                loadCouponList();
            } catch (e) { showToast('Delete failed: ' + e.message, 'error'); }
        });
    } else {
        if (!confirm(`Delete coupon "${code}"?`)) return;
        try {
            await _dbDelete('coupons', couponId);
            showToast('<i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Coupon deleted', 'success');
            loadCouponList();
        } catch (e) { showToast('Delete failed: ' + e.message, 'error'); }
    }
}

async function viewCouponLog(couponId, code) {
    const section = document.getElementById('coupon-log-section');
    const listEl = document.getElementById('coupon-log-list');
    if (!section || !listEl) return;
    section.style.display = 'block';
    listEl.innerHTML = '<p>Loading...</p>';
    section.scrollIntoView({ behavior: 'smooth' });

    try {
        // coupon_logs 컬렉션에서 조회
        let logs = await _dbQuery('coupon_logs', { where: ['couponId', '==', couponId], orderBy: 'usedAt,desc', limit: 100 });
        if (!logs || logs.length === 0) {
            // fallback: coupons/{id}/usage 서브컬렉션
            logs = await _dbQuery(`coupons/${couponId}/usage`, { orderBy: 'usedAt,desc', limit: 100 });
            if (!logs || logs.length === 0) { listEl.innerHTML = `<p style="color:#6B5744;"><i data-lucide="scroll-text" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> "${code}" has no usage history.</p>`; return; }
        }
        renderCouponLogFromArray(logs, listEl, code);
    } catch (e) {
        try {
            const logs = await _dbQuery('coupon_logs', { where: ['couponId', '==', couponId], limit: 100 });
            if (!logs || logs.length === 0) { listEl.innerHTML = `<p style="color:#6B5744;"><i data-lucide="scroll-text" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> "${code}" has no usage history.</p>`; return; }
            renderCouponLogFromArray(logs, listEl, code);
        } catch (e2) {
            listEl.innerHTML = `<p style="color:red;">Log lookup failed: ${e2.message}</p>`;
        }
    }
}

function renderCouponLog(snap, listEl, code) {
    // Legacy compatibility wrapper
    const items = [];
    snap.forEach(doc => items.push(doc.data ? doc.data() : doc));
    renderCouponLogFromArray(items, listEl, code);
}

function renderCouponLogFromArray(items, listEl, code) {
    let html = `<p style="font-weight:700; margin-bottom:0.5rem;"><i data-lucide="scroll-text" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> "${code}" Usage Log (${items.length} entries)</p>`;
    html += '<table style="width:100%; border-collapse:collapse; font-size:0.75rem;"><tr style="background:#F7F3ED;"><th style="padding:0.4rem;">Date</th><th>User</th><th>Amount</th></tr>';
    items.forEach(d => {
        const date = d.usedAt ? new Date(d.usedAt) : null;
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
// Super Admin Account Management (오리지널 + 운영)
// ═══════════════════════════════════════════════════════

async function loadSuperAdminWallets() {
    if (!isSuperAdmin()) return;
    const container = document.getElementById('admin-tab-superwall');
    if (!container) return;
    
    container.style.display = 'block';
    container.innerHTML = '<div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;"><p style="color:var(--accent);"><i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Loading account info...</p></div>';
    
    try {
        const uid = currentUser.uid;
        const walletsPath = `users/${uid}/wallets`;

        // Load or create wallet docs
        const [originalDoc, operatingDoc, defaultDoc] = await Promise.all([
            _dbGet(walletsPath, 'original'),
            _dbGet(walletsPath, 'operating'),
            _dbGet(walletsPath, 'default')
        ]);

        // Get active wallet setting
        const userDoc = await _dbGet('users', uid);
        const activeWallet = userDoc?.activeWallet || 'default';

        const wallets = {
            original: (originalDoc && !originalDoc.error) ? originalDoc : null,
            operating: (operatingDoc && !operatingDoc.error) ? operatingDoc : null,
            default: (defaultDoc && !defaultDoc.error) ? defaultDoc : null
        };
        
        // Format balances
        function formatBal(walletData) {
            if (!walletData) return '<span style="color:#6B5744;">Not created</span>';
            const bal = walletData.offchainBalances || walletData.balances || {};
            const entries = Object.entries(bal).filter(([,v]) => v > 0);
            if (entries.length === 0) return '<span style="color:#6B5744;">No balance</span>';
            return entries.map(([k, v]) => `<span style="font-size:0.8rem;">${k.toUpperCase()}: <strong>${v.toLocaleString()}</strong></span>`).join(' · ');
        }
        
        function walletCard(type, label, icon, color, data) {
            const isActive = activeWallet === type;
            const exists = !!data;
            return `
                <div style="background:${isActive ? `linear-gradient(135deg,#8B691415,#8B691408)` : 'white'};padding:1.2rem;border-radius:12px;border:2px solid ${isActive ? '#8B6914' : '#E8E0D8'};position:relative;">
                    ${isActive ? `<span style="position:absolute;top:8px;right:8px;background:#8B6914;color:#FFF8F0;padding:2px 8px;border-radius:10px;font-size:0.65rem;font-weight:700;">Active</span>` : ''}
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.8rem;">
                        <span style="font-size:1.5rem;">${icon}</span>
                        <div>
                            <div style="font-weight:700;font-size:0.95rem;">${label}</div>
                            <div style="font-size:0.7rem;color:#6B5744;">${type === 'original' ? 'Original asset storage (vault)' : type === 'operating' ? 'Daily operations/trading' : 'Default wallet'}</div>
                        </div>
                    </div>
                    <div style="margin-bottom:0.8rem;">${formatBal(data)}</div>
                    <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                        ${!exists ? `<button onclick="createSuperWallet('${type}')" style="background:#8B6914;color:#FFF8F0;border:none;padding:0.4rem 0.8rem;border-radius:6px;cursor:pointer;font-size:0.78rem;font-weight:600;">➕ Create</button>` : ''}
                        ${exists && !isActive ? `<button onclick="switchActiveWallet('${type}')" style="background:#8B6914;color:#FFF8F0;border:none;padding:0.4rem 0.8rem;border-radius:6px;cursor:pointer;font-size:0.78rem;font-weight:600;"><i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Activate</button>` : ''}
                        ${exists ? `<button onclick="showInternalTransfer('${type}')" style="background:#455a64;color:#FFF8F0;border:none;padding:0.4rem 0.8rem;border-radius:6px;cursor:pointer;font-size:0.78rem;"><i data-lucide="arrow-left-right" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Transfer</button>` : ''}
                    </div>
                </div>`;
        }
        
        container.innerHTML = `
            <div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;margin-bottom:1rem;">
                <h3 style="margin-bottom:0.3rem;"><i data-lucide="building-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Super Admin Account Management</h3>
                <p style="font-size:0.78rem;color:#6B5744;margin-bottom:1.2rem;">Manage Original (vault) and Operating accounts separately. Withdrawals from the Original account require 2-step verification.</p>
                
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem;">
                    ${walletCard('original', 'Original Account', '<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', '#8B6914', wallets.original)}
                    ${walletCard('operating', 'Operating Account', '<i data-lucide="zap" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', '#8B6914', wallets.operating)}
                    ${walletCard('default', 'Default Wallet', '<i data-lucide="briefcase" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', '#8B6914', wallets.default)}
                </div>
            </div>
            
            <div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;">
                <h4 style="margin-bottom:0.8rem;"><i data-lucide="scroll-text" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> Internal Transfer Log</h4>
                <div id="super-wallet-log" style="max-height:300px;overflow-y:auto;"><p style="color:#6B5744;font-size:0.8rem;">Loading logs...</p></div>
            </div>`;
        
        // Load transfer logs
        loadSuperWalletLog();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        container.innerHTML = `<div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;"><p style="color:red;">Load failed: ${e.message}</p></div>`;
    }
}

async function createSuperWallet(type) {
    if (!isSuperAdmin()) return;
    const labels = { original: 'Original Account (Vault)', operating: 'Operating Account', default: 'Default Wallet' };
    const confirmed = await showConfirmModal('<i data-lucide="building-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Create Account', `Create ${labels[type]}?\n\nIt will be created with zero balance.`);
    if (!confirmed) return;
    
    try {
        await _dbSet(`users/${currentUser.uid}/wallets`, type, {
            type: type,
            offchainBalances: {},
            balances: {},
            createdAt: new Date().toISOString(),
            createdBy: currentUser.email
        });
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${labels[type]} created`, 'success');
        loadSuperAdminWallets();
    } catch (e) {
        showToast('Creation failed: ' + e.message, 'error');
    }
}

async function switchActiveWallet(type) {
    if (!isSuperAdmin()) return;
    try {
        await _dbUpdate('users', currentUser.uid, { activeWallet: type });
        showToast(`<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Active account → ${type}`, 'success');
        loadSuperAdminWallets();
    } catch (e) {
        showToast('Switch failed: ' + e.message, 'error');
    }
}

async function showInternalTransfer(fromType) {
    if (!isSuperAdmin()) return;
    
    const targets = ['original', 'operating', 'default'].filter(t => t !== fromType);
    const labels = { original: '<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Original', operating: '<i data-lucide="zap" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Operating', default: '<i data-lucide="briefcase" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Default' };
    
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.innerHTML = `
        <div style="background:#FFF8F0;padding:1.5rem;border-radius:16px;max-width:400px;width:100%;">
            <h3 style="margin-bottom:0.5rem;"><i data-lucide="arrow-left-right" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Internal Transfer</h3>
            <p style="font-size:0.8rem;color:#6B5744;margin-bottom:1rem;">From: <strong>${labels[fromType]}</strong></p>
            
            <div style="margin-bottom:0.8rem;">
                <label style="font-size:0.8rem;color:#6B5744;">To Account</label>
                <select id="transfer-to" style="width:100%;padding:0.6rem;border:1px solid #E8E0D8;border-radius:8px;">
                    ${targets.map(t => `<option value="${t}">${labels[t]}</option>`).join('')}
                </select>
            </div>
            <div style="margin-bottom:0.8rem;">
                <label style="font-size:0.8rem;color:#6B5744;">Token</label>
                <input type="text" id="transfer-token" placeholder="e.g. crtd" style="width:100%;padding:0.6rem;border:1px solid #E8E0D8;border-radius:8px;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.8rem;color:#6B5744;">Amount</label>
                <input type="number" id="transfer-amount" min="1" placeholder="0" style="width:100%;padding:0.6rem;border:1px solid #E8E0D8;border-radius:8px;box-sizing:border-box;">
            </div>
            
            ${fromType === 'original' ? '<p style="font-size:0.75rem;color:#C4841D;margin-bottom:0.8rem;"><i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Original account withdrawal: 2-step verification required</p>' : ''}
            
            <div style="display:flex;gap:0.5rem;">
                <button id="transfer-submit" style="flex:1;padding:0.7rem;background:#8B6914;color:#FFF8F0;border:none;border-radius:8px;cursor:pointer;font-weight:700;"><i data-lucide="send" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Transfer</button>
                <button id="transfer-cancel" style="flex:1;padding:0.7rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#FFF8F0;">Cancel</button>
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
        
        if (!tokenKey || !amount || amount <= 0) { showToast('Please enter token and amount', 'warning'); return; }
        
        // Check balance
        const fromDoc = await _dbGet(`users/${currentUser.uid}/wallets`, fromType);
        if (!fromDoc || fromDoc.error) { showToast('Source account not found', 'error'); return; }
        const fromBal = (fromDoc.offchainBalances || {})[tokenKey] || 0;
        if (fromBal < amount) { showToast(`Insufficient balance: ${tokenKey.toUpperCase()} ${fromBal} < ${amount}`, 'error'); return; }
        
        // 2-step confirm for original account
        if (fromType === 'original') {
            const ok1 = await showConfirmModal('<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Confirm Original Account Withdrawal', `Transfer ${amount.toLocaleString()} ${tokenKey.toUpperCase()} from Original (vault) to ${labels[toType]}.\n\nThis action will be recorded in admin logs.`);
            if (!ok1) return;
            const code = await showPromptModal('Security Verification', 'Type "CONFIRM" exactly to confirm:', '');
            if (code !== 'CONFIRM') { showToast('Confirmation code mismatch. Transfer cancelled.', 'error'); return; }
        }
        
        try {
            const uid = currentUser.uid;
            const walletsPath = `users/${uid}/wallets`;
            const toDoc = await _dbGet(walletsPath, toType);
            const toBal = (toDoc && !toDoc.error) ? ((toDoc.offchainBalances || {})[tokenKey] || 0) : 0;

            // If target wallet doesn't exist, create it
            if (!toDoc || toDoc.error) {
                await _dbSet(walletsPath, toType, {
                    type: toType, offchainBalances: {}, balances: {},
                    createdAt: new Date().toISOString()
                });
            }

            // Update both wallets
            await _dbUpdate(walletsPath, fromType, {
                [`offchainBalances.${tokenKey}`]: fromBal - amount
            });
            await _dbUpdate(walletsPath, toType, {
                [`offchainBalances.${tokenKey}`]: toBal + amount
            });

            // Log
            await _dbAdd('admin_log', {
                action: 'super_internal_transfer',
                adminEmail: currentUser.email,
                fromWallet: fromType,
                toWallet: toType,
                token: tokenKey,
                amount: amount,
                timestamp: new Date().toISOString()
            });
            
            overlay.remove();
            showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${amount.toLocaleString()} ${tokenKey.toUpperCase()} transferred (${fromType} → ${toType})`, 'success');
            loadSuperAdminWallets();
        } catch (e) {
            showToast('Transfer failed: ' + e.message, 'error');
        }
    };
}

async function loadSuperWalletLog() {
    const container = document.getElementById('super-wallet-log');
    if (!container) return;
    
    try {
        const logs = await _dbQuery('admin_log', {
            where: ['action', '==', 'super_internal_transfer'],
            orderBy: 'timestamp,desc', limit: 20
        });

        if (!logs || logs.length === 0) { container.innerHTML = '<p style="font-size:0.8rem;color:#6B5744;">No transfer history</p>'; return; }

        const labels = { original: '<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Original', operating: '<i data-lucide="zap" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Operating', default: '<i data-lucide="briefcase" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Default' };
        let html = '';
        logs.forEach(d => {
            const time = d.timestamp ? new Date(d.timestamp).toLocaleString('ko-KR') : '--';
            html += `<div style="padding:0.5rem;border-bottom:1px solid #E8E0D8;font-size:0.8rem;">
                <div style="display:flex;justify-content:space-between;">
                    <span><strong>${d.amount?.toLocaleString()} ${(d.token||'').toUpperCase()}</strong> ${labels[d.fromWallet]||d.fromWallet} → ${labels[d.toWallet]||d.toWallet}</span>
                    <span style="color:#6B5744;font-size:0.72rem;">${time}</span>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<p style="color:red;font-size:0.8rem;">Log load failed: ${e.message}</p>`;
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

    // 서버 캐시 체크
    if (!forceRefresh) {
        try {
            const cached = await _dbGet('admin_config', 'dashboard_cache');
            if (cached && !cached.error) {
                const cachedAt = cached.cachedAt ? new Date(cached.cachedAt).getTime() : 0;
                if (now - cachedAt < DASHBOARD_CACHE_TTL) {
                    _dashboardCache = cached;
                    _dashboardCacheTime = cachedAt;
                    renderDashboardStats(cached);
                    return;
                }
            }
        } catch (e) { console.warn(t('admin.dash_cache_load_fail','Dashboard cache load failed') + ':', e); }
    }

    // 데이터 수집
    const cacheInfoEl = document.getElementById('dashboard-cache-info');
    if (cacheInfoEl) cacheInfoEl.textContent = t('admin.dash_loading', 'Loading stats...');

    try {
        const stats = {};

        // 날짜 기준
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - weekStart.getDay());

        // 1) 사용자 통계
        const usersSnap = await _dbQuery('users', {});
        stats.totalUsers = (usersSnap || []).length;
        let todayUsers = 0, weekUsers = 0;
        (usersSnap || []).forEach(d => {
            const created = d.createdAt ? new Date(d.createdAt) : null;
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
        (usersSnap || []).forEach(d => {
            const created = d.createdAt ? new Date(d.createdAt) : null;
            if (created) {
                const key = created.toISOString().slice(0,10);
                if (key in signups7d) signups7d[key]++;
            }
        });
        stats.signups7d = signups7d;

        // 2) 거래 통계
        const txSnap = await _dbQuery('offchain_transactions', {});
        stats.totalTx = (txSnap || []).length;
        let todayTx = 0;
        const txByToken = {};
        (txSnap || []).forEach(d => {
            const ts = d.timestamp ? new Date(d.timestamp) : null;
            if (ts && ts >= todayStart) todayTx++;
            const tk = (d.token || 'unknown').toUpperCase();
            txByToken[tk] = (txByToken[tk] || 0) + Math.abs(d.amount || 0);
        });
        stats.todayTx = todayTx;
        stats.txByToken = txByToken;

        // 3) 섹션별 통계
        const sections = {};

        // MALL
        const productsSnap = await _dbQuery('products', {});
        const ordersSnap = await _dbQuery('orders', {});
        let mallRevenue = 0;
        (ordersSnap || []).forEach(d => { mallRevenue += d.totalPrice || d.price || 0; });
        sections.mall = { icon: '<i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: 'MALL', items: [
            { label: t('admin.dash.total_products','Total Products'), value: (productsSnap || []).length },
            { label: t('admin.dash.total_orders','Total Orders'), value: (ordersSnap || []).length },
            { label: t('admin.dash.total_revenue','Total Revenue'), value: mallRevenue.toLocaleString() + ' pt' }
        ]};

        // ART
        let artCount = 0, artSold = 0;
        try {
            const artSnap = await _dbQuery('artworks', {});
            artCount = (artSnap || []).length;
            (artSnap || []).forEach(d => { artSold += d.sold || 0; });
        } catch(e) { console.warn("[catch]", e); }
        sections.art = { icon: '<i data-lucide="theater" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: 'ART', items: [
            { label: t('admin.dash.total_artworks','Total Artworks'), value: artCount },
            { label: t('admin.dash.total_art_sold','Total Sold'), value: artSold }
        ]};

        // BOOKS
        let bookCount = 0, bookSold = 0;
        try {
            const bookSnap = await _dbQuery('books', {});
            bookCount = (bookSnap || []).length;
            (bookSnap || []).forEach(d => { bookSold += d.sold || 0; });
        } catch(e) { console.warn("[catch]", e); }
        sections.books = { icon: '<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: 'BOOKS', items: [
            { label: t('admin.dash.total_books','Total Books'), value: bookCount },
            { label: t('admin.dash.total_book_sold','Total Sold'), value: bookSold }
        ]};

        // TRADING
        let activeChallenges = 0, totalParticipants = 0;
        try {
            const chSnap = await _dbQuery('prop_challenges', { where: ['status', '==', 'active'] });
            activeChallenges = (chSnap || []).length;
            for (const ch of (chSnap || [])) {
                totalParticipants += ch.participants || 0;
            }
        } catch(e) { console.warn("[catch]", e); }
        sections.trading = { icon: '<i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: 'TRADING', items: [
            { label: t('admin.dash.active_challenges','Active Challenges'), value: activeChallenges },
            { label: t('admin.dash.participants','Participants'), value: totalParticipants }
        ]};

        // SOCIAL
        let postCount = 0, commentCount = 0;
        try {
            const postSnap = await _dbQuery('posts', {});
            postCount = (postSnap || []).length;
            // 댓글은 서브컬렉션이므로 대략적으로 카운트
            for (const post of (postSnap || [])) {
                const comments = await _dbQuery(`posts/${post.id}/comments`, {});
                commentCount += (comments || []).length;
                if (commentCount > 500) break; // 성능 보호
            }
        } catch(e) { console.warn("[catch]", e); }
        sections.social = { icon: '<i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: 'SOCIAL', items: [
            { label: t('admin.dash.total_posts','Total Posts'), value: postCount },
            { label: t('admin.dash.total_comments','Total Comments'), value: commentCount > 500 ? '500+' : commentCount }
        ]};

        stats.sections = sections;

        // 서버에 캐시 저장
        try {
            await _dbSet('admin_config', 'dashboard_cache', {
                ...stats,
                cachedAt: new Date().toISOString()
            });
        } catch (e) { console.warn(t('admin.dash_cache_save_fail','Dashboard cache save failed') + ':', e); }

        _dashboardCache = stats;
        _dashboardCacheTime = Date.now();
        renderDashboardStats(stats);

    } catch (e) {
        console.error(t('admin.dash_stats_load_fail','Dashboard stats load failed') + ':', e);
        if (cacheInfoEl) cacheInfoEl.textContent = 'Load failed: ' + e.message;
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
        const colors = { mall: '#5B7B8C', art: '#B54534', books: '#C4841D', trading: '#C4841D', social: '#5B7B8C' };
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
            chartTokenEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;color:#6B5744;font-size:0.85rem;">No transaction data</div>';
        } else {
            const maxVol = Math.max(...entries.map(([,v]) => v), 1);
            const tokenColors = { CRTD: '#C4841D', CRAC: '#B54534', CRGC: '#5B7B8C', CREB: '#2E7D32' };
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
        cacheInfoEl.textContent = cacheTime ? `Cache: ${cacheTime}` : '';
    }
}

// ========== 상품 승인 관리 (admin-tab-products) ==========

async function loadAdminPendingProducts() {
    const c = document.getElementById('admin-pending-products');
    if (!c) return;
    c.innerHTML = 'Loading...';
    try {
        const prods = await _dbQuery('products', { where: ['status', '==', 'pending'], orderBy: 'createdAt,desc', limit: 50 });
        if (!prods || prods.length === 0) { c.innerHTML = '<p style="color:var(--accent);">No pending products <i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></p>'; return; }
        c.innerHTML = '';
        prods.forEach(p => {
            const thumb = p.images?.[0] || p.imageData || '';
            const dateStr = p.createdAt ? new Date(p.createdAt).toLocaleDateString('ko-KR') : '';
            c.innerHTML += `<div style="background:var(--bg);padding:0.8rem;border-radius:8px;margin-bottom:0.5rem;border-left:4px solid #C4841D;">
                <div style="display:flex;gap:0.8rem;align-items:center;">
                    <div style="width:60px;height:60px;border-radius:8px;overflow:hidden;background:#F7F3ED;flex-shrink:0;">
                        ${thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#E8E0D8;"><i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></div>'}
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:700;">${p.title}</div>
                        <div style="font-size:0.8rem;color:var(--accent);">${p.sellerNickname || p.sellerEmail} · ${p.price} CRGC · Stock ${p.stock} · ${dateStr}</div>
                        ${p.description ? `<div style="font-size:0.8rem;color:#6B5744;margin-top:0.2rem;">${p.description.slice(0,80)}${p.description.length>80?'...':''}</div>` : ''}
                    </div>
                </div>
                <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                    <button onclick="approveProduct('${p.id}')" style="flex:1;background:#5B7B8C;color:#FFF8F0;border:none;padding:0.5rem;border-radius:6px;cursor:pointer;font-weight:600;"><i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Approve</button>
                    <button onclick="rejectProduct('${p.id}')" style="flex:1;background:#B54534;color:#FFF8F0;border:none;padding:0.5rem;border-radius:6px;cursor:pointer;font-weight:600;"><i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Reject</button>
                </div>
            </div>`;
        });
    } catch(e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

async function approveProduct(productId) {
    try {
        await _dbUpdate('products', productId, { status: 'active', approvedAt: new Date().toISOString(), approvedBy: currentUser.uid });
        // 판매자에게 알림
        const p = await _dbGet('products', productId);
        if (typeof createNotification === 'function') {
            await createNotification(p.sellerId, 'order_status', { message: `<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> "${p.title}" has been approved!`, link: `#page=product-detail&id=${productId}` });
        }
        showToast('<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Product approved', 'success');
        loadAdminPendingProducts();
    } catch(e) { showToast('Failed: ' + e.message, 'error'); }
}

async function rejectProduct(productId) {
    const reason = await showPromptModal('Rejection Reason', 'Enter reason for rejection', '');
    if (!reason) return;
    try {
        await _dbUpdate('products', productId, { status: 'rejected', rejectedAt: new Date().toISOString(), rejectedBy: currentUser.uid, rejectReason: reason });
        const p = await _dbGet('products', productId);
        if (typeof createNotification === 'function') {
            await createNotification(p.sellerId, 'order_status', { message: `<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> "${p.title}" has been rejected. Reason: ${reason}`, link: '' });
        }
        showToast('Product rejected', 'info');
        loadAdminPendingProducts();
    } catch(e) { showToast('Failed: ' + e.message, 'error'); }
}

// ========== 신고 관리 ==========

async function loadAdminReports() {
    const c = document.getElementById('admin-reports-list');
    if (!c) return;
    c.innerHTML = 'Loading...';
    try {
        const reports = await _dbQuery('reports', { where: ['status', '==', 'pending'], orderBy: 'createdAt,desc', limit: 50 });
        if (!reports || reports.length === 0) { c.innerHTML = '<p style="color:var(--accent);">No pending reports <i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></p>'; return; }
        c.innerHTML = '';
        const REPORT_REASONS = { fake: 'Counterfeit', inappropriate: 'Inappropriate', scam: 'Suspected Scam', fraud: 'Fraud', nondelivery: 'Non-delivery', fake_review: 'Fake Review', spam: 'Spam', other: 'Other' };
        const TARGET_TYPE_LABELS = { product: '<i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Product', review: '<i data-lucide="file-text" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Review', seller: 'Seller' };
        reports.forEach(r => {
            const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString('ko-KR') : '';
            c.innerHTML += `<div style="background:#F7F3ED;padding:0.8rem;border-radius:8px;margin-bottom:0.5rem;border-left:4px solid #B54534;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <strong>${REPORT_REASONS[r.reason] || r.reason}</strong>
                        <span style="font-size:0.75rem;color:var(--accent);margin-left:0.5rem;">${dateStr}</span>
                    </div>
                    <span style="font-size:0.8rem;color:var(--accent);">${TARGET_TYPE_LABELS[r.targetType] || r.targetType}: ${r.targetId?.slice(0,8)}...</span>
                </div>
                <div style="font-size:0.8rem;color:#6B5744;margin:0.3rem 0;">Reporter: ${r.reporterEmail || r.reporterId?.slice(0,8)}</div>
                ${r.detail ? `<div style="font-size:0.8rem;color:#6B5744;">Details: ${r.detail}</div>` : ''}
                <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                    <button onclick="handleReport('${r.id}','confirmed')" style="flex:1;background:#B54534;color:#FFF8F0;border:none;padding:0.4rem;border-radius:6px;cursor:pointer;font-size:0.8rem;"><i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Remove</button>
                    <button onclick="handleReport('${r.id}','dismissed')" style="flex:1;background:#6B5744;color:#FFF8F0;border:none;padding:0.4rem;border-radius:6px;cursor:pointer;font-size:0.8rem;">Dismiss</button>
                </div>
            </div>`;
        });
    } catch(e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

async function handleReport(reportId, action) {
    try {
        const r = await _dbGet('reports', reportId);
        await _dbUpdate('reports', reportId, { status: action, handledBy: currentUser.uid, handledAt: new Date().toISOString() });
        if (action === 'confirmed' && r.targetId) {
            if (r.targetType === 'product') {
                await _dbUpdate('products', r.targetId, { status: 'removed', removedAt: new Date().toISOString(), removedReason: 'Report confirmed' });
            } else if (r.targetType === 'review') {
                await _dbDelete('product_reviews', r.targetId);
            } else if (r.targetType === 'seller') {
                // 판매자 경고 기록
                await _dbUpdate('users', r.targetId, { reportWarnings: { __fieldValue: 'increment', operand: 1 }, lastWarningAt: new Date().toISOString() });
            }
        }
        showToast(action === 'confirmed' ? '<i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Report confirmed and removed' : 'Report dismissed', action === 'confirmed' ? 'warning' : 'info');
        loadAdminReports();
    } catch(e) { showToast('Failed: ' + e.message, 'error'); }
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
            _dbGet('admin_config', 'reward_settings'),
            _dbGet('admin_config', 'invite_settings')
        ]);
        if (rwDoc && !rwDoc.error) rs = { ...rs, ...rwDoc };
        if (invDoc && !invDoc.error) is = invDoc;
    } catch(e) { console.warn("[catch]", e); }

    // 최근 로그
    let logs = [];
    try {
        const logSnap = await _dbQuery('reward_logs', { orderBy: 'createdAt,desc', limit: 50 });
        logs = logSnap || [];
    } catch(e) { console.warn("[catch]", e); }

    const tiersHTML = (rs.signupTiers || []).map((tier, i) => `
        <div style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.4rem;" data-tier-idx="${i}">
            <span style="font-size:0.8rem;white-space:nowrap;">~</span>
            <input type="number" class="rw-tier-max" value="${tier.maxUsers}" min="1" style="width:100px;padding:0.4rem;border:1px solid #E8E0D8;border-radius:6px;font-size:0.85rem;" placeholder="${t('admin.rw_max_users','Max users')}">
            <span style="font-size:0.8rem;">${t('admin.rw_users','users')}</span>
            <input type="number" class="rw-tier-amt" value="${tier.amount}" min="0" step="0.1" style="width:80px;padding:0.4rem;border:1px solid #E8E0D8;border-radius:6px;font-size:0.85rem;" placeholder="CRTD">
            <span style="font-size:0.8rem;">CRTD</span>
            <button onclick="this.parentElement.remove()" style="background:#B54534;color:#FFF8F0;border:none;border-radius:4px;padding:0.2rem 0.5rem;cursor:pointer;font-size:0.75rem;">✕</button>
        </div>
    `).join('');

    const logsHTML = logs.length === 0 ? `<p style="color:#6B5744;font-size:0.85rem;">${t('admin.rw_no_logs','No reward history')}</p>` :
        `<div style="max-height:300px;overflow-y:auto;">
        <table style="width:100%;font-size:0.8rem;border-collapse:collapse;">
            <tr style="background:#F7F3ED;"><th style="padding:0.4rem;text-align:left;">UID</th><th>Type</th><th>Amount</th><th>Date</th></tr>
            ${logs.map(l => `<tr style="border-bottom:1px solid #E8E0D8;">
                <td style="padding:0.4rem;font-family:monospace;font-size:0.7rem;">${(l.uid||'').slice(0,12)}…</td>
                <td style="text-align:center;">${l.type === 'signup' ? '<i data-lucide="user-plus" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Signup' : '<i data-lucide="handshake" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Invite'}</td>
                <td style="text-align:center;font-weight:600;">${l.amount} CRTD</td>
                <td style="text-align:center;font-size:0.7rem;">${l.createdAt ? new Date(l.createdAt).toLocaleDateString() : '—'}</td>
            </tr>`).join('')}
        </table></div>`;

    container.innerHTML = `
    <div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;margin-bottom:1rem;">
        <h3 style="margin-bottom:1rem;"><i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('admin.rw_title','Reward Settings')}</h3>

        <!-- 가입 리워드 -->
        <div style="margin-bottom:1.5rem;">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                <label style="font-weight:700;"><i data-lucide="user-plus" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> ${t('admin.rw_signup','Signup Reward')}</label>
                <label class="toggle-switch" style="margin-left:auto;">
                    <input type="checkbox" id="rw-signup-enabled" ${rs.signupEnabled ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <p style="font-size:0.75rem;color:#6B5744;margin-bottom:0.5rem;">${t('admin.rw_signup_desc','CRTD is awarded based on signup order.')}</p>
            <div id="rw-tiers-container">${tiersHTML}</div>
            <button onclick="addRewardTier()" style="background:#E8E0D8;border:none;padding:0.4rem 0.8rem;border-radius:6px;cursor:pointer;font-size:0.8rem;margin-top:0.3rem;">+ ${t('admin.rw_add_tier','Add Tier')}</button>
        </div>

        <!-- 초대 리워드 -->
        <div style="margin-bottom:1.5rem;">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                <label style="font-weight:700;"><i data-lucide="handshake" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('admin.rw_invite','Invite Reward')}</label>
                <label class="toggle-switch" style="margin-left:auto;">
                    <input type="checkbox" id="rw-invite-enabled" ${rs.inviteEnabled ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
                <div>
                    <label style="font-size:0.8rem;">${t('admin.rw_invite_amount','Per invite (CRTD)')}</label>
                    <input type="number" id="rw-invite-amount" value="${rs.inviteAmount}" min="0" step="0.1" style="width:100%;padding:0.4rem;border:1px solid #E8E0D8;border-radius:6px;">
                </div>
                <div>
                    <label style="font-size:0.8rem;">${t('admin.rw_invite_max','Per-user limit (CRTD)')}</label>
                    <input type="number" id="rw-invite-max" value="${rs.inviteMaxPerUser}" min="0" style="width:100%;padding:0.4rem;border:1px solid #E8E0D8;border-radius:6px;">
                </div>
            </div>
        </div>

        <!-- 소셜 공유 키 -->
        <div style="margin-bottom:1.5rem;">
            <h4 style="margin-bottom:0.5rem;"><i data-lucide="key" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> ${t('admin.rw_social_keys','Social Share Settings')}</h4>
            <div style="margin-bottom:0.5rem;">
                <label style="font-size:0.8rem;"><i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('admin.rw_kakao_key','Kakao App Key (JavaScript)')}</label>
                <input type="text" id="rw-kakao-key" value="${is.kakaoAppKey || ''}" placeholder="Kakao JavaScript App Key" style="width:100%;padding:0.4rem;border:1px solid #E8E0D8;border-radius:6px;font-size:0.85rem;">
            </div>
            <div>
                <label style="font-size:0.8rem;"><i data-lucide="globe" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('admin.rw_fb_id','Facebook App ID')}</label>
                <input type="text" id="rw-fb-id" value="${is.facebookAppId || ''}" placeholder="Facebook App ID" style="width:100%;padding:0.4rem;border:1px solid #E8E0D8;border-radius:6px;font-size:0.85rem;">
            </div>
        </div>

        <button onclick="saveRewardSettings()" class="btn-primary" style="width:100%;padding:0.7rem;"><i data-lucide="save" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('admin.rw_save','Save Reward Settings')}</button>
    </div>

    <!-- 지급 내역 -->
    <div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;">
        <h3 style="margin-bottom:1rem;"><i data-lucide="clipboard-list" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('admin.rw_logs','Recent Reward History')}</h3>
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
        <input type="number" class="rw-tier-max" value="" min="1" style="width:100px;padding:0.4rem;border:1px solid #E8E0D8;border-radius:6px;font-size:0.85rem;" placeholder="Max users">
        <span style="font-size:0.8rem;">users</span>
        <input type="number" class="rw-tier-amt" value="" min="0" step="0.1" style="width:80px;padding:0.4rem;border:1px solid #E8E0D8;border-radius:6px;font-size:0.85rem;" placeholder="CRTD">
        <span style="font-size:0.8rem;">CRTD</span>
        <button onclick="this.parentElement.remove()" style="background:#B54534;color:#FFF8F0;border:none;border-radius:4px;padding:0.2rem 0.5rem;cursor:pointer;font-size:0.75rem;">✕</button>
    `;
    container.appendChild(div);
}

async function saveRewardSettings() {
    if (!hasLevel(3)) { showToast('No permission', 'warning'); return; }

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
        await _dbSet('admin_config', 'reward_settings', {
            signupEnabled, signupTiers, inviteEnabled, inviteAmount, inviteMaxPerUser,
            updatedAt: new Date().toISOString(), updatedBy: currentUser.email
        }, true);

        await _dbSet('admin_config', 'invite_settings', {
            kakaoAppKey, facebookAppId,
            updatedAt: new Date().toISOString(), updatedBy: currentUser.email
        }, true);

        await _dbAdd('admin_logs', {
            action: 'reward_settings_change',
            adminEmail: currentUser.email,
            adminUid: currentUser.uid,
            timestamp: new Date().toISOString()
        });

        showToast('<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Reward settings saved', 'success');
    } catch (e) {
        showToast('Save failed: ' + e.message, 'error');
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

// ========== E5: Monitoring Dashboard ==========
async function loadMonitoringDashboard() {
    const container = document.getElementById('admin-monitoring');
    if (!container) return;
    container.innerHTML = '<p style="padding:1rem;color:var(--text-secondary);">Loading...</p>';
    try {
        const res = await fetch('/api/admin/monitoring', { headers: _adminHeaders() });
        const d = await res.json();
        if (d.error) { container.innerHTML = `<p style="color:#B54534;">${d.error}</p>`; return; }
        const s = d.summary || {};

        container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.8rem;margin-bottom:1.5rem;">
            <div class="stat-card"><div class="stat-value">${s.totalUsers || 0}</div><div class="stat-label">${t('admin.users','Users')}</div></div>
            <div class="stat-card"><div class="stat-value">${Math.floor((s.serverUptime || 0) / 3600)}h</div><div class="stat-label">${t('admin.uptime','Uptime')}</div></div>
            <div class="stat-card"><div class="stat-value">${s.serverMemory || 0}MB</div><div class="stat-label">${t('admin.memory','Memory')}</div></div>
            <div class="stat-card"><div class="stat-value">${s.activeConnections || 0}</div><div class="stat-label">${t('admin.connections','Connections')}</div></div>
            <div class="stat-card"><div class="stat-value">${s.totalPageLoads || 0}</div><div class="stat-label">${t('admin.page_loads','Page Loads')}</div></div>
            <div class="stat-card"><div class="stat-value">${s.avgLoadTime || 0}ms</div><div class="stat-label">${t('admin.avg_load','Avg Load')}</div></div>
            <div class="stat-card"><div class="stat-value">${s.avgFCP || 0}ms</div><div class="stat-label">FCP</div></div>
            <div class="stat-card"><div class="stat-value">${s.p95LoadTime || 0}ms</div><div class="stat-label">P95 Load</div></div>
        </div>

        <h4 style="margin:1rem 0 0.5rem;">${t('admin.connection_types','Connection Types')}</h4>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
            ${Object.entries(s.connectionTypes || {}).map(([k, v]) =>
                `<span style="padding:0.3rem 0.8rem;border-radius:12px;background:var(--bg-card);border:1px solid var(--border);">${k}: ${v}</span>`
            ).join('')}
            ${s.dataSaverUsers ? `<span style="padding:0.3rem 0.8rem;border-radius:12px;background:#C4841D22;border:1px solid #C4841D;">Data Saver: ${s.dataSaverUsers}</span>` : ''}
        </div>

        <h4 style="margin:1rem 0 0.5rem;">${t('admin.top_errors','Top Errors')} (${s.totalErrors || 0} total)</h4>
        <div style="max-height:300px;overflow-y:auto;">
            <table style="width:100%;font-size:0.8rem;border-collapse:collapse;">
                <tr style="border-bottom:1px solid var(--border);"><th style="text-align:left;padding:0.4rem;">Error</th><th style="width:60px;">Count</th></tr>
                ${(s.errorCounts || []).map(([msg, count]) =>
                    `<tr style="border-bottom:1px solid var(--border,#eee);"><td style="padding:0.4rem;word-break:break-all;">${escHtml ? escHtml(msg) : msg}</td><td style="text-align:center;">${count}</td></tr>`
                ).join('')}
            </table>
        </div>

        <h4 style="margin:1rem 0 0.5rem;">${t('admin.recent_errors','Recent Errors')}</h4>
        <div style="max-height:300px;overflow-y:auto;font-size:0.75rem;font-family:monospace;background:var(--bg);padding:0.5rem;border-radius:8px;">
            ${(d.errors || []).slice(-20).reverse().map(e =>
                `<div style="padding:0.3rem 0;border-bottom:1px solid var(--border,#eee);"><span style="color:var(--text-secondary);">${e.ts?.substring(5,16) || ''}</span> <span style="color:#B54534;">${escHtml ? escHtml(e.msg || '') : (e.msg || '')}</span> <span style="color:var(--text-secondary);">${e.src ? e.src.split('/').pop() + ':' + e.line : ''}</span></div>`
            ).join('')}
        </div>`;
    } catch (e) {
        container.innerHTML = `<p style="color:#B54534;">Failed: ${e.message}</p>`;
    }
}
