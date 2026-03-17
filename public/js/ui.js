// ===== ui.js - UI 헬퍼, 페이지 네비게이션 =====
// ========== UI HELPERS ==========
function updateLandingState(user) {
    const landing = document.getElementById('landing-page');
    if (!landing) return;
    
    if (user) {
        landing.classList.add('hidden');
        document.body.style.overflow = '';
        const authModal = document.getElementById('auth-modal');
        if (authModal) authModal.style.display = 'none';
        // 모든 모달 오버레이 정리 (로그인 후 회색 화면 방지)
        document.querySelectorAll('.modal').forEach(m => { if (m.id !== 'profile-edit-modal') m.style.display = 'none'; });
        document.querySelectorAll('.register-modal-overlay').forEach(m => m.classList.remove('active'));
    } else {
        // auth-modal이 이미 열려있으면 landing을 다시 띄우지 않음
        const authModal = document.getElementById('auth-modal');
        if (authModal && authModal.style.display === 'flex') return;
        
        landing.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        document.getElementById('sidebar').classList.remove('active');
    }
}

function toggleMenu() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('active');
    
    // 사이드바 열릴 때 오버레이 추가 (외부 클릭 시 닫기)
    let overlay = document.getElementById('sidebar-overlay');
    if (sidebar.classList.contains('active')) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'sidebar-overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.3);z-index:998;';
            overlay.onclick = function() { sidebar.classList.remove('active'); this.remove(); };
            document.body.appendChild(overlay);
        }
    } else if (overlay) {
        overlay.remove();
    }
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const el = document.getElementById(pageId);
    if (!el) return;
    el.classList.add('active');
    const navItem = document.querySelector(`[onclick="showPage('${pageId}')"]`);
    if (navItem) navItem.classList.add('active');
    
    // URL 앵커 업데이트 (뒤로가기/공유 지원)
    if (location.hash !== `#page=${pageId}`) {
        history.replaceState(null, '', `#page=${pageId}`);
    }
    
    document.getElementById('sidebar').classList.remove('active');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    if (sidebarOverlay) sidebarOverlay.remove();
    
    // Sync bottom tab bar highlight
    if (typeof updateBottomTab === 'function') updateBottomTab(pageId);
    
    // Load page-specific data
    if (pageId === 'social') {
        if (typeof loadSocialFeed === 'function') loadSocialFeed();
        if (typeof loadFriendsGrid === 'function') loadFriendsGrid();
        if (typeof loadFriendRequests === 'function') loadFriendRequests();
    }
    if (pageId === 'reels') {
        if (typeof SHORTFORM !== 'undefined' && SHORTFORM.initReels) SHORTFORM.initReels();
    }
    if (pageId === 'messenger') {
        if (typeof loadMessages === 'function') loadMessages();
        // Initialize Lucide icons after loading messenger content
        if (window.lucide) lucide.createIcons();
    }
    if (pageId === 'prop-trading') {
        loadPropTrading();
        // 자동 로드 + retry (auth 타이밍 문제 대응)
        loadTradingDashboard().then(() => {
            if (!myParticipation && currentUser) {
                // 1초 후 재시도
                setTimeout(() => loadTradingDashboard(), 1000);
            }
            // 버튼 상태 강제 갱신
            if (typeof updateTradeButtonState === 'function') updateTradeButtonState();
        });
    }
    if (pageId === 'admin') {
        // Admin is now a separate page
        window.location.href = 'admin.html';
        return;
    }
    if (pageId === 'dashboard') {
        if (typeof refreshBalancesFromDB === 'function') refreshBalancesFromDB();
        if (typeof loadDashboard === 'function') loadDashboard();
    }
    if (pageId === 'settings') {
        if (typeof loadSettings === 'function') loadSettings();
    }
    if (pageId === 'beauty-manager') {
        if (typeof BEAUTY !== 'undefined') BEAUTY.init();
    }
    if (pageId === 'brain') {
        if (typeof BRAIN !== 'undefined') BRAIN.init();
    }
    if (pageId === 'movement') {
        if (typeof MOVEMENT !== 'undefined') MOVEMENT.init();
    }
    if (pageId === 'art') {
        loadArtGallery();
    }
    if (pageId === 'wallet') {
        if (typeof refreshBalancesFromDB === 'function') refreshBalancesFromDB();
    }
    if (pageId === 'mall') {
        loadMallProducts();
        updateCartBadge();
    }
    if (pageId === 'my-shop') {
        if (typeof loadMyShopDashboard === 'function') loadMyShopDashboard();
    }
    if (pageId === 'cart') {
        if (typeof loadCart === 'function') loadCart();
    }
    if (pageId === 'wishlist') {
        if (typeof loadWishlist === 'function') loadWishlist();
    }
    if (pageId === 'fundraise') {
        loadCampaigns();
    }
    if (pageId === 'energy') {
        filterCrebCategory('all');
    }
    if (pageId === 'business') {
        if (typeof loadBusinesses === 'function') loadBusinesses();
    }
    if (pageId === 'artist') {
        if (typeof loadArtists === 'function') loadArtists();
    }
    if (pageId === 'books') {
        loadBooksList();
    }
    if (pageId === 'care') {
        if (typeof CARE !== 'undefined' && CARE.init) CARE.init();
    }
    if (pageId === 'ai-assistant') {
        if (typeof AI_ASSISTANT !== 'undefined' && AI_ASSISTANT.init) AI_ASSISTANT.init();
    }
    if (pageId === 'credit') {
        loadCreditInfo();
        loadPumasiList();
    }
}

function showSignup() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('signup-form').style.display = 'block';
}

function showLogin() {
    document.getElementById('signup-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
}

// 범용 프롬프트 모달 (input 대체)
function showPromptModal(title, message, defaultValue, isPassword) {
    return new Promise((resolve) => {
        const inputType = isPassword ? 'password' : 'text';
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.innerHTML = `
            <div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;max-width:400px;width:100%;box-shadow:0 8px 32px rgba(61,43,31,0.3);">
                <h3 style="margin-bottom:0.8rem;color:#3D2B1F;">${title}</h3>
                <p style="color:#6B5744;margin-bottom:1rem;white-space:pre-line;font-size:0.9rem;">${message}</p>
                <input type="${inputType}" id="prompt-modal-input" value="${defaultValue || ''}" style="width:100%;padding:0.7rem;border:1px solid #E8E0D8;border-radius:8px;font-size:1rem;box-sizing:border-box;margin-bottom:1rem;background:#F7F3ED;color:#3D2B1F;">
                <div style="display:flex;gap:0.5rem;">
                    <button id="prompt-cancel" style="flex:1;padding:0.7rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#F7F3ED;color:#3D2B1F;">${t('common.cancel', '취소')}</button>
                    <button id="prompt-ok" style="flex:1;padding:0.7rem;border:none;border-radius:8px;cursor:pointer;background:#3D2B1F;color:#FFF8F0;font-weight:700;">${t('common.confirm', '확인')}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const input = overlay.querySelector('#prompt-modal-input');
        input.focus();
        input.select();
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { document.body.removeChild(overlay); resolve(input.value); } if (e.key === 'Escape') { document.body.removeChild(overlay); resolve(null); } });
        overlay.querySelector('#prompt-cancel').onclick = () => { document.body.removeChild(overlay); resolve(null); };
        overlay.querySelector('#prompt-ok').onclick = () => { document.body.removeChild(overlay); resolve(input.value); };
    });
}

// ===== 확인 모달 (confirm 대체) =====
function showConfirmModal(title, message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.innerHTML = `
            <div style="background:var(--card,#FFF8F0);padding:1.5rem;border-radius:12px;max-width:420px;width:100%;color:var(--text,#3D2B1F);">
                <h3 style="margin-bottom:0.8rem;">${title}</h3>
                <p style="color:var(--text-muted,#6B5744);margin-bottom:1.2rem;white-space:pre-line;font-size:0.9rem;line-height:1.5;max-height:50vh;overflow-y:auto;">${message}</p>
                <div style="display:flex;gap:0.5rem;">
                    <button id="confirm-cancel" style="flex:1;padding:0.7rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;cursor:pointer;background:transparent;color:var(--text,#3D2B1F);font-size:0.95rem;">${t('common.cancel', '취소')}</button>
                    <button id="confirm-ok" style="flex:1;padding:0.7rem;border:none;border-radius:8px;cursor:pointer;background:#3D2B1F;color:#FFF8F0;font-weight:700;font-size:0.95rem;">${t('common.confirm', '확인')}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#confirm-cancel').onclick = () => { document.body.removeChild(overlay); resolve(false); };
        overlay.querySelector('#confirm-ok').onclick = () => { document.body.removeChild(overlay); resolve(true); };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) { document.body.removeChild(overlay); resolve(false); } });
    });
}

// ===== 이미지 리사이즈 유틸리티 =====
function resizeImage(dataUrl, maxSize) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxSize || h > maxSize) {
                if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                else { w = Math.round(w * maxSize / h); h = maxSize; }
            }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

// ===== Firebase Storage 이미지 업로드 헬퍼 =====
async function resizeAndUploadImage(file, maxSize, storagePath) {
    try {
        // 파일을 data URL로 변환
        const dataUrl = await new Promise((res, rej) => {
            const r = new FileReader(); 
            r.onload = () => res(r.result); 
            r.onerror = rej; 
            r.readAsDataURL(file); 
        });
        
        // 이미지 리사이즈
        const resizedDataUrl = await resizeImage(dataUrl, maxSize);
        
        // data URL을 Blob으로 변환
        const response = await fetch(resizedDataUrl);
        const blob = await response.blob();
        
        // Firebase Storage에 업로드
        if (typeof uploadToStorage === 'function') {
            return await uploadToStorage(storagePath, blob);
        } else {
            console.warn('[Firebase Storage] uploadToStorage 함수 없음, base64 반환');
            return resizedDataUrl;
        }
    } catch (error) {
        console.error('[Firebase Storage] 업로드 실패:', error);
        // 실패 시 원본 파일로 fallback
        if (typeof uploadToStorage === 'function') {
            return await uploadToStorage(storagePath, file);
        }
        throw error;
    }
}

// ===== Registration Modal Helpers =====
function openRegisterModal(section) {
    const modal = document.getElementById('modal-' + section);
    if (modal) modal.classList.add('active');
}

function closeRegisterModal(section) {
    const modal = document.getElementById('modal-' + section);
    if (modal) modal.classList.remove('active');
}

// Close modal on overlay click
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('register-modal-overlay')) {
        e.target.classList.remove('active');
    }
});

// Show/hide admin register buttons based on user level
function updateAdminRegisterButtons() {
    const isAdmin = (typeof currentUserLevel !== 'undefined') && currentUserLevel >= 2;
    const btnIds = ['mall-register-btn', 'art-register-btn', 'fundraise-register-btn', 'energy-register-btn', 'business-register-btn', 'artist-register-btn', 'books-register-btn'];
    btnIds.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = isAdmin ? 'inline-block' : 'none';
    });
}

// ========== HASH ROUTING (딥링크 지원) ==========
// URL 형식: #page=messenger, #page=wallet 등
function navigateFromHash() {
    const hash = location.hash; // e.g. "#page=messenger" or "#messenger"
    if (!hash) return false;
    let pageId = null;
    if (hash.startsWith('#page=')) {
        pageId = hash.replace('#page=', '');
    } else if (hash.startsWith('#')) {
        pageId = hash.substring(1);
    }
    if (pageId) {
        const el = document.getElementById(pageId);
        if (el && el.classList.contains('page')) {
            showPage(pageId);
            return true;
        }
    }
    return false;
}

// 페이지 로드 시 hash 확인
document.addEventListener('DOMContentLoaded', () => {
    // auth 완료 후 hash 라우팅 (Firebase onAuthStateChanged보다 늦게 실행)
    setTimeout(() => { navigateFromHash(); }, 300);
});

// 브라우저 뒤로가기/앞으로가기 지원
window.addEventListener('hashchange', () => { navigateFromHash(); });

// Init Web3 (Polygon) - fallback RPC
