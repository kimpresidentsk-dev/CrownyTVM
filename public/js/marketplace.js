// ===== marketplace.js - 쇼핑몰, 모금, 에너지, 비즈니스, 아티스트, 출판, P2P크레딧 =====
// Migrated from Firestore to server REST APIs

function _mpHeaders() {
    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}
async function _mpGet(url) { const r = await fetch(url, { headers: _mpHeaders() }); if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || 'Request failed'); } return r.json(); }
async function _mpPost(url, data) { const r = await fetch(url, { method: 'POST', headers: _mpHeaders(), body: JSON.stringify(data) }); if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || 'Request failed'); } return r.json(); }
async function _mpPatch(url, data) { const r = await fetch(url, { method: 'PATCH', headers: _mpHeaders(), body: JSON.stringify(data) }); if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || 'Request failed'); } return r.json(); }
async function _mpDelete(url) { const r = await fetch(url, { method: 'DELETE', headers: _mpHeaders() }); if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || 'Request failed'); } return r.json(); }

const ORDER_STATUS_LABELS = { paid:t('mall.status_paid','<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Paid'), shipping:t('mall.status_shipping','<i data-lucide="truck" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Shipping'), delivered:t('mall.status_delivered','<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Delivered'), cancelled:t('mall.status_cancelled','<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Cancelled') };
const ORDER_STATUS_COLORS = { paid:'#C4841D', shipping:'#5B7B8C', delivered:'#5B7B8C', cancelled:'#B54534' };
const BRAND_SLOGANS = {
    present: t('brand.slogan_present','Gift of beauty'), doctor: t('brand.slogan_doctor','The start of a healthy life'), medical: t('brand.slogan_medical','Trustworthy medical care'),
    avls: t('brand.slogan_avls','Awaken your senses'), solution: t('brand.slogan_solution','Design safety'), architect: t('brand.slogan_architect','Create spaces'),
    mall: t('brand.slogan_mall','Everyday value'), designers: t('brand.slogan_designers','Wear your style')
};
const BRAND_COLORS = {
    present:'#F7F3ED', doctor:'#F7F3ED', medical:'#F7F3ED', avls:'#F7F3ED',
    solution:'#F7F3ED', architect:'#F7F3ED', mall:'#F7F3ED', designers:'#F7F3ED'
};
const BRAND_ICONS = {
    present:'<i data-lucide="sparkles" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', doctor:'<i data-lucide="pill" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', medical:'<i data-lucide="hospital" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', avls:'<i data-lucide="film" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', solution:'<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', architect:'<i data-lucide="building-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', mall:'<i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', designers:'<i data-lucide="shirt" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>'
};
const RETURN_REASONS = [t('marketplace.return_defective','Defective'),t('marketplace.return_wrong_delivery','Wrong delivery'),t('marketplace.return_change_of_mind','Change of mind'),t('marketplace.return_other','Other')];
const MAX_ORDER_AMOUNT = 10000; // 1회 최대 주문 금액 (CRGC)
let _orderInProgress = false; // 동시 주문 방지 플래그

const MALL_CATEGORIES = {
    'present':'<i data-lucide="sparkles" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('marketplace.category_present','Present'),'doctor':'<i data-lucide="pill" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('marketplace.category_doctor','For Doctor'),'medical':'<i data-lucide="hospital" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('marketplace.category_medical','Medical'),'avls':'<i data-lucide="film" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> AVLs',
    'solution':'<i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('marketplace.category_private','Private'),'architect':'<i data-lucide="building-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('marketplace.category_architect','Architect'),'mall':'<i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('marketplace.category_crowny_mall','Crowny Mall'),'designers':'<i data-lucide="shirt" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('marketplace.category_designers','Designers'),
    '뷰티':'<i data-lucide="sparkles" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('marketplace.category_beauty','Beauty'),'음향':'<i data-lucide="volume-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('marketplace.category_audio','Audio'),'헬스':'<i data-lucide="zap" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('marketplace.category_health','Health'),'생활':'<i data-lucide="coffee" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('marketplace.category_living','Living'),'전자':'<i data-lucide="battery" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('marketplace.category_electronics','Electronics'),'패션':'<i data-lucide="shirt" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('marketplace.category_fashion','Fashion'),'식품':'<i data-lucide="utensils" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('marketplace.category_food','Food'),'기타':'<i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('marketplace.category_other','Other')
};

function renderStars(rating, size='0.85rem') {
    let s = '';
    for (let i = 1; i <= 5; i++) s += `<span style="color:${i <= Math.round(rating) ? '#8B6914' : '#E8E0D8'}; font-size:${size};">★</span>`;
    return s;
}

// Helper: get product thumbnail (supports images[] array and legacy imageData)
function getProductThumb(p) {
    if (p.images && p.images.length > 0) return p.images[0];
    return p.imageData || '';
}

async function loadMallProducts() {
    const container = document.getElementById('mall-products');
    if (!container) return;
    container.innerHTML = `<p style="text-align:center; color:var(--accent); grid-column:1/-1;">${t('mall.loading','Loading...')}</p>`;
    try {
        const brandFilter = window._mallBrandFilter || null;
        let apiUrl = '/api/marketplace/products?status=active&limit=50';
        if (brandFilter) apiUrl += '&category=' + encodeURIComponent(brandFilter);
        const data = await _mpGet(apiUrl);
        let items = data.items || [];
        if (!items.length) { container.innerHTML = `<p style="text-align:center; color:var(--accent); grid-column:1/-1;">${t('mall.no_products','No products registered')}</p>`; return; }

        // 검색 필터 (상품명 + 설명 + 브랜드 + 카테고리 통합)
        const searchVal = (document.getElementById('mall-search')?.value || '').trim().toLowerCase();
        if (searchVal) items = items.filter(p =>
            p.title.toLowerCase().includes(searchVal) ||
            (p.description||'').toLowerCase().includes(searchVal) ||
            (p.category||'').toLowerCase().includes(searchVal) ||
            (MALL_CATEGORIES[p.category]||'').toLowerCase().includes(searchVal) ||
            (p.sellerNickname||'').toLowerCase().includes(searchVal)
        );

        // 고급 필터 적용
        if (typeof _mallFilters !== 'undefined') {
            if (_mallFilters.category) items = items.filter(p => p.category === _mallFilters.category);
            if (_mallFilters.priceMin) items = items.filter(p => p.price >= parseFloat(_mallFilters.priceMin));
            if (_mallFilters.priceMax) items = items.filter(p => p.price <= parseFloat(_mallFilters.priceMax));
            if (_mallFilters.ratingMin) items = items.filter(p => (p.avgRating||0) >= parseFloat(_mallFilters.ratingMin));
            if (_mallFilters.inStockOnly) items = items.filter(p => (p.stock - (p.sold||0)) > 0);
        }

        // 정렬
        const sortVal = document.getElementById('mall-sort')?.value || 'newest';
        if (sortVal === 'price-low') items.sort((a,b) => a.price - b.price);
        else if (sortVal === 'price-high') items.sort((a,b) => b.price - a.price);
        else if (sortVal === 'popular') items.sort((a,b) => (b.sold||0) - (a.sold||0));
        else if (sortVal === 'rating') items.sort((a,b) => (b.avgRating||0) - (a.avgRating||0));

        // 검색 결과 수 표시
        const countEl = document.getElementById('mall-result-count');
        if (countEl) countEl.textContent = `${items.length} ${t('mall.product_count','products')}`;

        if (items.length === 0) { container.innerHTML = `<p style="text-align:center; color:var(--accent); grid-column:1/-1;">${t('mall.no_results','No search results')}</p>`; return; }
        
        // 검색 초기화
        if (typeof initMallSearch === 'function') initMallSearch();
        container.innerHTML = '';
        // 검색 하이라이트 함수
        const highlightText = (text, query) => {
            if (!query || !text) return text;
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark style="background:#fff59d;padding:0 1px;border-radius:2px;">$1</mark>');
        };
        items.forEach(p => {
            const thumb = getProductThumb(p);
            const imgCount = (p.images && p.images.length > 1) ? `<span style="position:absolute; top:6px; left:6px; background:rgba(61,43,31,0.6); color:#FFF8F0; font-size:0.6rem; padding:0.15rem 0.4rem; border-radius:4px;"><i data-lucide="camera" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${p.images.length}</span>` : '';
            const ratingHtml = p.avgRating ? `<div style="margin-top:0.2rem;">${renderStars(p.avgRating, '0.7rem')} <span style="font-size:0.65rem; color:var(--accent);">(${p.reviewCount||0})</span></div>` : '';
            const displayTitle = searchVal ? highlightText(p.title, searchVal) : p.title;
            container.innerHTML += `
                <div onclick="viewProduct('${p.id}')" style="background:#FFF8F0; border-radius:10px; overflow:hidden; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.08); position:relative;">
                    <button onclick="event.stopPropagation(); toggleWishlist('${p.id}')" style="position:absolute; top:6px; right:6px; background:rgba(255,255,255,0.85); border:none; border-radius:50%; width:28px; height:28px; cursor:pointer; font-size:0.9rem; z-index:1;"><i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>
                    ${imgCount}
                    <div style="height:140px; overflow:hidden; background:#F7F3ED;">${thumb ? `<img src="${thumb}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2.5rem;color:#E8E0D8;"><i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></div>`}</div>
                    <div style="padding:0.6rem;">
                        <div style="font-weight:600; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${displayTitle}</div>
                        <div style="font-size:0.7rem; color:var(--accent);">${MALL_CATEGORIES[p.category] || p.category || ''} · <a onclick="event.stopPropagation(); viewStore('${p.sellerId}')" style="cursor:pointer; text-decoration:underline; color:var(--accent);">${p.sellerNickname || p.sellerEmail || t('mall.seller','Seller')}</a></div>
                        <div style="font-weight:700; color:#3D2B1F; margin-top:0.3rem;">${p.price} CRGC</div>
                        <div style="font-size:0.7rem; color:var(--accent);">${t('mall.stock','Stock')}: ${p.stock - (p.sold||0)}</div>
                        ${ratingHtml}
                        <button onclick="event.stopPropagation(); addToCart('${p.id}')" style="width:100%; margin-top:0.4rem; background:#3D2B1F; color:#FFF8F0; border:none; padding:0.35rem; border-radius:5px; cursor:pointer; font-size:0.75rem; font-weight:600;"><i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.add_to_cart_short','Add')}</button>
                    </div>
                </div>`;
        });
    } catch (e) { container.innerHTML = `<p style="color:red; grid-column:1/-1;">${e.message}</p>`; }
}

async function viewProduct(id) {
    // Navigate to full-page product detail
    history.replaceState(null, '', `#page=product-detail&id=${id}`);
    showPage('product-detail');
    renderProductDetail(id);
}

async function renderProductDetail(id) {
    const c = document.getElementById('product-detail-content');
    if (!c) return;
    c.innerHTML = `<p style="text-align:center; color:var(--accent); padding:2rem;">${t('common.loading','Loading...')}</p>`;
    try {
        const pData = await _mpGet('/api/marketplace/products/' + id);
        const p = pData.item;
        if (!p) { c.innerHTML = `<p style="text-align:center; color:red;">${t('mall.product_not_found','Product not found')}</p>`; return; }
        const isOwner = currentUser?.uid === p.sellerId;
        const remaining = p.stock - (p.sold || 0);

        // Check wishlist status
        let isWished = false;
        if (currentUser) {
            try {
                const wData = await _mpGet('/api/marketplace/wishlist');
                isWished = (wData.items || []).some(w => w.productId === id);
            } catch(e) {}
        }

        // Reviews
        let reviewsHtml = '';
        try {
            const revData = await _mpGet('/api/marketplace/reviews?productId=' + id + '&limit=30');
            const revs = revData.items || [];
            if (revs.length > 0) {
                const dist = [0,0,0,0,0];
                let totalR = 0;
                revs.forEach(rv => { const rt = rv.rating||5; dist[rt-1]++; totalR += rt; });
                const avgR = (totalR / revs.length).toFixed(1);
                let distHtml = '';
                for (let i = 5; i >= 1; i--) {
                    const pct = revs.length > 0 ? Math.round(dist[i-1] / revs.length * 100) : 0;
                    distHtml += `<div style="display:flex;align-items:center;gap:0.3rem;font-size:0.75rem;">
                        <span>${i}★</span>
                        <div style="flex:1;background:#e0e0e0;height:6px;border-radius:3px;"><div style="background:#8B6914;height:100%;border-radius:3px;width:${pct}%;"></div></div>
                        <span style="color:var(--accent);min-width:28px;text-align:right;">${dist[i-1]}</span>
                    </div>`;
                }

                reviewsHtml = `<div style="margin-top:1.5rem; background:#FFF8F0; padding:1.2rem; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                    <h4 style="margin-bottom:0.8rem;"><i data-lucide="file-text" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.reviews','Reviews')} (${revs.length})</h4>
                    <div style="display:flex;gap:1.5rem;align-items:center;margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid #E8E0D8;">
                        <div style="text-align:center;">
                            <div style="font-size:2rem;font-weight:800;color:#8B6914;">${avgR}</div>
                            <div>${renderStars(parseFloat(avgR),'1rem')}</div>
                            <div style="font-size:0.75rem;color:var(--accent);">${revs.length} ${t('mall.reviews','Reviews')}</div>
                        </div>
                        <div style="flex:1;">${distHtml}</div>
                    </div>`;
                revs.forEach(rv => {
                    const verifiedBadge = rv.verified ? `<span style="background:#F7F3ED;color:#5B7B8C;font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:4px;margin-left:0.3rem;"><i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.verified_purchase','Verified')}</span>` : '';
                    const dateStr = rv.createdAt ? new Date(rv.createdAt).toLocaleDateString('ko-KR') : '';
                    reviewsHtml += `<div style="background:var(--bg); padding:0.8rem; border-radius:8px; margin-bottom:0.5rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:0.85rem; font-weight:600;">${rv.buyerEmail?.split('@')[0] || t('mall.buyer','Buyer')}${verifiedBadge}</span>
                            <span>${renderStars(rv.rating, '0.8rem')}</span>
                        </div>
                        <div style="font-size:0.7rem; color:var(--accent); margin-top:0.1rem;">${dateStr}</div>
                        ${rv.comment ? `<p style="font-size:0.85rem; margin-top:0.3rem; color:#6B5744;">${rv.comment}</p>` : ''}
                        ${rv.imageData ? `<img src="${rv.imageData}" style="width:100px;height:100px;object-fit:cover;border-radius:8px;margin-top:0.4rem;cursor:pointer;" onclick="window.open(this.src)">` : ''}
                        <div style="margin-top:0.4rem;display:flex;gap:0.4rem;">
                            <button onclick="helpfulReview('${rv.id}')" style="background:none;border:1px solid #E8E0D8;border-radius:12px;padding:0.2rem 0.6rem;cursor:pointer;font-size:0.75rem;color:var(--accent);"><i data-lucide="thumbs-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.helpful','Helpful')} ${rv.helpful||0}</button>
                            ${currentUser && rv.buyerId !== currentUser.uid ? `<button onclick="event.stopPropagation();reportReview('${rv.id}')" style="background:none;border:1px solid #E8E0D8;border-radius:12px;padding:0.2rem 0.6rem;cursor:pointer;font-size:0.7rem;color:#B54534;"><i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>` : ''}
                        </div>
                    </div>`;
                });
                reviewsHtml += '</div>';
            }
        } catch(e) { console.warn("[catch]", e); }

        // Review button for delivered orders
        let reviewBtnHtml = '';
        if (currentUser && !isOwner) {
            try {
                const ordData = await _mpGet('/api/marketplace/orders?buyerId=' + currentUser.uid + '&productId=' + id + '&status=delivered&limit=1');
                if ((ordData.items || []).length > 0) {
                    const revData = await _mpGet('/api/marketplace/reviews?productId=' + id + '&buyerId=' + currentUser.uid);
                    if (!(revData.items || []).length) {
                        reviewBtnHtml = `<button onclick="writeReview('${id}')" style="background:#C4841D; color:#FFF8F0; border:none; padding:0.7rem; border-radius:8px; cursor:pointer; font-weight:600; width:100%; margin-top:0.5rem;"><i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.write_review','Write a review')}</button>`;
                    }
                }
            } catch(e) { console.warn("[catch]", e); }
        }

        const ratingDisplay = p.avgRating ? `<div style="margin:0.5rem 0;">${renderStars(p.avgRating, '1rem')} <span style="font-size:0.9rem; color:var(--accent);">${p.avgRating.toFixed(1)} (${p.reviewCount||0})</span></div>` : '';

        // Multi-image gallery
        const images = (p.images && p.images.length > 0) ? p.images : (p.imageData ? [p.imageData] : []);
        let galleryHtml = '';
        if (images.length > 1) {
            galleryHtml = `<div style="position:relative; background:#F7F3ED; border-radius:12px; overflow:hidden; margin-bottom:1rem;">
                <div id="pd-gallery" style="display:flex; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none;">
                    ${images.map((img, i) => `<img src="${img}" style="width:100%; max-height:50vh; object-fit:contain; flex-shrink:0; scroll-snap-align:start;" data-idx="${i}">`).join('')}
                </div>
                <div style="text-align:center; padding:0.4rem;">
                    ${images.map((_, i) => `<span class="pd-dot" data-idx="${i}" style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${i===0?'#3D2B1F':'#E8E0D8'}; margin:0 3px; cursor:pointer;"></span>`).join('')}
                </div>
                <button onclick="scrollPdGallery(-1)" style="position:absolute; left:4px; top:45%; background:rgba(0,0,0,0.4); color:#FFF8F0; border:none; border-radius:50%; width:32px; height:32px; cursor:pointer; font-size:1rem;">‹</button>
                <button onclick="scrollPdGallery(1)" style="position:absolute; right:4px; top:45%; background:rgba(0,0,0,0.4); color:#FFF8F0; border:none; border-radius:50%; width:32px; height:32px; cursor:pointer; font-size:1rem;">›</button>
            </div>`;
        } else if (images.length === 1) {
            galleryHtml = `<div style="background:#F7F3ED; border-radius:12px; overflow:hidden; margin-bottom:1rem;">
                <img src="${images[0]}" style="width:100%; max-height:50vh; object-fit:contain;">
            </div>`;
        } else {
            galleryHtml = `<div style="background:#F7F3ED; border-radius:12px; overflow:hidden; margin-bottom:1rem;">
                <div style="width:100%;height:250px;display:flex;align-items:center;justify-content:center;font-size:5rem;color:#E8E0D8;"><i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></div>
            </div>`;
        }

        // Seller link
        const sellerLink = p.sellerNickname || p.sellerEmail ? `<a onclick="viewStore('${p.sellerId}')" style="cursor:pointer; text-decoration:underline; color:#3D2B1F;">${t('mall.seller','Seller')}: ${p.sellerNickname||p.sellerEmail}</a>` : '';

        c.innerHTML = `
            <button onclick="showPage('mall')" style="background:none; border:none; font-size:1rem; cursor:pointer; margin-bottom:0.8rem; color:var(--accent);">← ${t('mall.back_to_list','Back to list')}</button>
            ${galleryHtml}
            <div style="background:#FFF8F0; padding:1.2rem; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <h2 style="margin:0; flex:1;">${p.title}</h2>
                    <button onclick="toggleWishlist('${id}')" id="wish-btn-${id}" style="background:none; border:none; font-size:1.5rem; cursor:pointer; padding:0.2rem;">${isWished ? '<i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>' : '<i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>'}</button>
                </div>
                <p style="color:var(--accent); font-size:0.85rem; margin:0.5rem 0;">${[MALL_CATEGORIES[p.category], sellerLink].filter(Boolean).join(' · ')}</p>
                ${ratingDisplay}
                ${p.description ? `<p style="font-size:0.95rem; margin:1rem 0; line-height:1.6; color:#6B5744;">${p.description}</p>` : ''}
                <div style="font-size:1.4rem; font-weight:700; color:#3D2B1F; margin:1rem 0;">${p.price} CRGC</div>
                <div style="font-size:0.85rem; color:var(--accent); margin-bottom:1rem;">${t('mall.stock','Stock')}: ${remaining} · ${t('mall.sold','Sold')}: ${p.sold||0}</div>
                ${!isOwner && remaining > 0 ? `
                <div style="display:flex; gap:0.5rem;">
                    <button onclick="buyProduct('${id}', this)" style="flex:2; background:#3D2B1F; color:#FFF8F0; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700; font-size:1rem;"><i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.buy_now','Buy Now')}</button>
                    <button onclick="addToCart('${id}')" style="flex:1; background:#FFF8F0; color:#3D2B1F; border:2px solid #3D2B1F; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700;">${t('mall.add_to_cart_short','Add')}</button>
                </div>` : ''}
                ${remaining <= 0 ? `<p style="color:#B54534; font-weight:700; text-align:center; font-size:1.1rem; margin:1rem 0;">${t('mall.sold_out','Sold Out')}</p>` : ''}
                ${reviewBtnHtml}
                ${!isOwner && currentUser ? `<button onclick="reportProduct('${id}')" style="background:none; color:#B54534; border:1px solid #B54534; padding:0.5rem; border-radius:8px; cursor:pointer; width:100%; margin-top:0.5rem; font-size:0.85rem;"><i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.report','Report')}</button>` : ''}
            </div>
            ${reviewsHtml}`;
    } catch(e) { c.innerHTML = `<p style="color:red; text-align:center;">${e.message}</p>`; }
}

async function writeReview(productId) {
    // Enhanced review modal with star picker + photo
    return new Promise((resolve) => {
        let selectedRating = 5;
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99998;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(); } };
        overlay.innerHTML = `<div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;max-width:420px;width:100%;max-height:90vh;overflow-y:auto;">
            <h3 style="margin-bottom:1rem;"><i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.write_review','Write a review')}</h3>
            <div style="text-align:center; margin-bottom:1rem;">
                <div id="review-stars" style="font-size:2rem; cursor:pointer;">
                    ${[1,2,3,4,5].map(i => `<span data-star="${i}" style="color:#8B6914;">★</span>`).join('')}
                </div>
                <div id="review-rating-label" style="font-size:0.85rem; color:var(--accent);">5/5</div>
            </div>
            <textarea id="review-comment" placeholder="${t('mall.review_placeholder','Write your review...')}" rows="3" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:6px;resize:vertical;box-sizing:border-box;margin-bottom:0.8rem;"></textarea>
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.85rem; color:var(--accent);"><i data-lucide="camera" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.attach_photo','Attach photo (optional)')}</label>
                <input type="file" id="review-photo" accept="image/*" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;margin-top:0.3rem;">
                <div id="review-photo-preview" style="margin-top:0.3rem;"></div>
            </div>
            <div style="display:flex; gap:0.5rem;">
                <button id="review-cancel" style="flex:1;padding:0.7rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#FFF8F0;">${t('common.cancel','Cancel')}</button>
                <button id="review-submit" style="flex:1;padding:0.7rem;border:none;border-radius:8px;cursor:pointer;background:#C4841D;color:#FFF8F0;font-weight:700;">${t('common.submit','Submit')}</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);

        // Star click handler
        overlay.querySelectorAll('#review-stars span').forEach(span => {
            span.onclick = () => {
                selectedRating = parseInt(span.dataset.star);
                overlay.querySelectorAll('#review-stars span').forEach((s, i) => {
                    s.style.color = i < selectedRating ? '#8B6914' : '#E8E0D8';
                });
                overlay.querySelector('#review-rating-label').textContent = selectedRating + '/5';
            };
        });

        // Photo preview
        overlay.querySelector('#review-photo').onchange = function() {
            const file = this.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                overlay.querySelector('#review-photo-preview').innerHTML = `<img src="${e.target.result}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;margin-top:0.3rem;">`;
            };
            reader.readAsDataURL(file);
        };

        overlay.querySelector('#review-cancel').onclick = () => { overlay.remove(); resolve(); };
        overlay.querySelector('#review-submit').onclick = async () => {
            const comment = overlay.querySelector('#review-comment').value.trim();
            const photoFile = overlay.querySelector('#review-photo').files[0];
            try {
                let imageData = '';
                if (photoFile) imageData = await fileToBase64Resized(photoFile, 400);

                // Check verified purchase
                const myOrders = await _mpGet('/api/marketplace/orders?buyerId=' + currentUser.uid + '&productId=' + productId + '&status=delivered&limit=1');
                const verified = (myOrders.items || []).length > 0;

                await _mpPost('/api/marketplace/reviews', {
                    productId, rating: selectedRating, comment: comment || '',
                    imageData, verified
                });
                showToast(`<i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.review_done','Review submitted!')}`, 'success');
                overlay.remove();
                viewProduct(productId);
                resolve();
            } catch (e) { showToast(t('mall.review_fail','Review failed') + ': ' + e.message, 'error'); }
        };
    });
}

async function buyProduct(id, btn) {
    if (!currentUser) return;
    // 이중 클릭 방지
    if (btn) { btn.disabled = true; setTimeout(() => { if(btn) btn.disabled = false; }, 3000); }
    // 동시 주문 방지
    if (_orderInProgress) { showToast(t('mall.order_in_progress','Order is being processed. Please wait.'), 'warning'); return; }
    _orderInProgress = true;
    try {
        // 1차 확인
        const pData = await _mpGet('/api/marketplace/products/' + id);
        const p = pData.item;
        if (!p || p.status !== 'active') { showToast(t('mall.cannot_buy','Cannot purchase this product'), 'warning'); return; }
        const price = p.price;
        if (!price || price <= 0 || !Number.isFinite(price)) { showToast(t('mall.invalid_price','Invalid price'), 'error'); return; }
        if (price > MAX_ORDER_AMOUNT) { showToast(t('mall.max_order_exceeded',`Maximum order amount is ${MAX_ORDER_AMOUNT} CRGC`), 'warning'); return; }
        if ((p.stock - (p.sold||0)) <= 0) { showToast(t('mall.sold_out','Sold Out'), 'warning'); return; }

        if (!await showConfirmModal(t('mall.confirm_buy','Confirm Purchase'), `"${p.title}"\n${price} CRGC — ${t('mall.confirm_buy_msg','Proceed with purchase?')}`)) return;

        const shippingInfo = await showShippingModal();
        if (!shippingInfo) return;

        // Server handles balance check, deduction, seller payment, stock update, order creation
        await _mpPost('/api/marketplace/orders', { productId: id, qty: 1, shippingInfo });

        if (typeof autoGivingPoolContribution === 'function') await autoGivingPoolContribution(price);
        if (typeof distributeReferralReward === 'function') await distributeReferralReward(currentUser.uid, price, 'CRGC');

        showToast(`<i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> "${p.title}" ${t('mall.purchase_done','Purchase complete!')}`, 'success');
        document.getElementById('product-modal')?.remove();
        loadMallProducts(); loadUserWallet();
    } catch (e) { showToast(t('mall.purchase_fail','Purchase failed') + ': ' + e.message, 'error'); } finally { _orderInProgress = false; }
}

async function loadMyOrders() {
    const c = document.getElementById('mall-my-list'); if (!c||!currentUser) return; c.innerHTML=t('common.loading','Loading...');
    try {
        const oData = await _mpGet('/api/marketplace/orders?buyerId=' + currentUser.uid + '&limit=20');
        const oItems = oData.items || [];
        if (!oItems.length) { c.innerHTML=`<p style="color:var(--accent);">${t('mall.no_orders','No orders yet')}</p>`; return; }
        c.innerHTML='';
        oItems.forEach(x => {
            const statusLabel = ORDER_STATUS_LABELS[x.status] || x.status;
            const statusColor = ORDER_STATUS_COLORS[x.status] || 'var(--accent)';
            const reviewBtn = x.status === 'delivered' ? `<button onclick="event.stopPropagation(); writeReview('${x.productId}')" style="background:#C4841D; color:#FFF8F0; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem; margin-left:0.5rem;"><i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.reviews','Reviews')}</button>` : '';
            c.innerHTML += `<div style="padding:0.6rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem; font-size:0.85rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                <div><strong>${x.productTitle}</strong> — ${x.amount} ${x.token}</div>
                <div><span style="color:${statusColor}; font-weight:600;">${statusLabel}</span>${reviewBtn}</div>
            </div>`;
        });
    } catch(e) { c.innerHTML=e.message; }
}

async function loadMyProducts() {
    const c = document.getElementById('mall-my-list'); if (!c||!currentUser) return; c.innerHTML=t('common.loading','Loading...');
    try {
        const oData = await _mpGet('/api/marketplace/products?sellerId=' + currentUser.uid + '&limit=20');
        const oItems = oData.items || [];
        if (!oItems.length) { c.innerHTML=`<p style="color:var(--accent);">${t('mall.no_products','No products registered')}</p>`; return; }
        c.innerHTML='';
        oItems.forEach(x => {
            const statusBadge = x.status === 'active' ? `<span style="color:#5B7B8C; font-size:0.75rem;">● ${t('mall.status_active','Active')}</span>` : x.status === 'pending' ? `<span style="color:#C4841D; font-size:0.75rem;">● ${t('mall.status_pending','Pending')}</span>` : x.status === 'rejected' ? `<span style="color:#B54534; font-size:0.75rem;">● ${t('mall.status_rejected','Rejected')}</span>` : `<span style="color:#6B5744; font-size:0.75rem;">● ${t('mall.status_inactive','Inactive')}</span>`;
            c.innerHTML += `<div style="padding:0.6rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem; font-size:0.85rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.3rem;">
                    <div><strong>${x.title}</strong> — ${x.price} CRGC · ${t('mall.sold','Sold')}: ${x.sold||0}/${x.stock} ${statusBadge}</div>
                    <div style="display:flex; gap:0.3rem;">
                        <button onclick="editProduct('${x.id}')" style="background:#5B7B8C; color:#FFF8F0; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">${t('mall.edit_btn','<i data-lucide="edit" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Edit')}</button>
                        <button onclick="toggleProduct('${x.id}','${x.status}')" style="background:${x.status==='active'?'#6B5744':'#5B7B8C'}; color:#FFF8F0; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">${x.status==='active'?t('mall.deactivate','<i data-lucide="pause" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Deactivate'):t('mall.activate','▶ Activate')}</button>
                        <button onclick="deleteProduct('${x.id}')" style="background:#B54534; color:#FFF8F0; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;"><i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>
                    </div>
                </div>
            </div>`;
        });
    } catch(e) { c.innerHTML=e.message; }
}

async function editProduct(id) {
    const pData = await _mpGet('/api/marketplace/products/' + id);
    if (!pData.item) return;
    const p = pData.item;
    const newPrice = await showPromptModal(t('mall.edit_price','Edit Price'), `${t('mall.current_price','Current price')}: ${p.price} ${p.priceToken}`, String(p.price));
    if (newPrice === null) return;
    const newStock = await showPromptModal(t('mall.edit_stock','Edit Stock'), `${t('mall.current_stock','Current stock')}: ${p.stock}`, String(p.stock));
    if (newStock === null) return;
    const newDesc = await showPromptModal(t('mall.edit_desc','Edit Description'), t('mall.product_desc','Product Description'), p.description || '');
    if (newDesc === null) return;
    try {
        const parsedPrice = parseFloat(newPrice);
        const parsedStock = parseInt(newStock);
        if (parsedPrice <= 0 || !Number.isFinite(parsedPrice)) { showToast(t('mall.price_must_positive','Price must be greater than 0'), 'warning'); return; }
        if (parsedStock < 0 || !Number.isFinite(parsedStock)) { showToast(t('mall.stock_must_positive','Stock must be 0 or more'), 'warning'); return; }
        await _mpPatch('/api/marketplace/products/' + id, {
            price: parsedPrice,
            stock: parsedStock,
            description: newDesc
        });
        showToast(t('mall.edit_done','<i data-lucide="edit" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Product updated'), 'success');
        loadMyProducts();
    } catch (e) { showToast(t('mall.edit_fail','Edit failed') + ': ' + e.message, 'error'); }
}

async function toggleProduct(id, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const label = newStatus === 'active' ? t('mall.activate_label','Activate') : t('mall.deactivate_label','Deactivate');
    if (!await showConfirmModal(t('mall.product_status','Product Status'), `${t('mall.confirm_status_change','Change this product to')} ${label}?`)) return;
    try {
        await _mpPatch('/api/marketplace/products/' + id, { status: newStatus });
        showToast(`${t('mall.product_status','Product')} ${label} ${t('common.done','done')}`, 'success');
        loadMyProducts();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

async function deleteProduct(id) {
    if (!await showConfirmModal(t('mall.delete_product','Delete Product'), t('mall.confirm_delete_product','Are you sure you want to delete this product? This cannot be undone.'))) return;
    try {
        await _mpDelete('/api/marketplace/products/' + id);
        showToast(t('mall.deleted','<i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Product deleted'), 'success');
        loadMyProducts();
    } catch (e) { showToast(t('mall.delete_fail','Delete failed') + ': ' + e.message, 'error'); }
}

async function loadSellerOrders() {
    const c = document.getElementById('mall-my-list'); if (!c||!currentUser) return; c.innerHTML=t('common.loading','Loading...');
    try {
        const returnsHtml = await loadSellerReturns() || '';
        const oData = await _mpGet('/api/marketplace/orders?sellerId=' + currentUser.uid + '&limit=30');
        const oItems = oData.items || [];
        if (!oItems.length && !returnsHtml) { c.innerHTML=`<p style="color:var(--accent);">${t('mall.no_orders_received','No orders received')}</p>`; return; }
        c.innerHTML = returnsHtml;
        oItems.forEach(x => {
            const statusLabel = ORDER_STATUS_LABELS[x.status] || x.status;
            const statusColor = ORDER_STATUS_COLORS[x.status] || 'var(--accent)';
            const nextActions = [];
            if (x.status === 'paid') nextActions.push(`<button onclick="updateOrderStatus('${x.id}','shipping')" style="background:#5B7B8C; color:#FFF8F0; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">${t('mall.process_shipping','<i data-lucide="truck" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Ship')}</button>`);
            if (x.status === 'shipping') nextActions.push(`<button onclick="updateOrderStatus('${x.id}','delivered')" style="background:#5B7B8C; color:#FFF8F0; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">${t('mall.mark_delivered','<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Delivered')}</button>`);
            const shipInfo = x.shippingInfo ? `<div style="font-size:0.7rem; color:#6B5744; margin-top:0.2rem;"><i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${x.shippingInfo.name} · ${x.shippingInfo.phone} · ${x.shippingInfo.address}${x.shippingInfo.memo ? ' · '+x.shippingInfo.memo : ''}</div>` : '';
            c.innerHTML += `<div style="padding:0.6rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem; font-size:0.85rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.3rem;">
                    <div><strong>${x.productTitle}</strong> — ${x.amount} ${x.token}<br><span style="font-size:0.75rem; color:var(--accent);">${t('mall.buyer','Buyer')}: ${x.buyerEmail}</span>${shipInfo}</div>
                    <div style="display:flex; align-items:center; gap:0.3rem;">
                        <span style="color:${statusColor}; font-weight:600; font-size:0.8rem;">${statusLabel}</span>
                        ${nextActions.join('')}
                    </div>
                </div>
            </div>`;
        });
    } catch(e) { c.innerHTML=e.message; }
}

async function updateOrderStatus(orderId, newStatus) {
    const label = ORDER_STATUS_LABELS[newStatus] || newStatus;
    if (newStatus === 'shipping') {
        const trackingNo = await showPromptModal(t('mall.tracking_number','Tracking Number'), t('mall.enter_tracking','Enter tracking number (optional)'), '');
        if (!await showConfirmModal(t('mall.change_status','Change Order Status'), `${t('mall.change_to','Change to')} ${label}?`)) return;
        try {
            const patchData = { status: newStatus };
            if (trackingNo) patchData.trackingNumber = trackingNo;
            await _mpPatch('/api/marketplace/orders/' + orderId, patchData);
            showToast(`${label} ${t('common.done','done')}`, 'success');
            loadSellerOrders();
        } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
    } else {
        if (!await showConfirmModal(t('mall.change_status','Change Order Status'), `${t('mall.change_to','Change to')} ${label}?`)) return;
        try {
            await _mpPatch('/api/marketplace/orders/' + orderId, { status: newStatus });
            showToast(`${label} ${t('common.done','done')}`, 'success');
            loadSellerOrders();
        } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
    }
}

// ========== FUNDRAISE - 모금/기부 ==========

async function createCampaign() {
    if (!currentUser) { showToast(t('common.login_required','Login required'), 'warning'); return; }
    const title = document.getElementById('fund-title').value.trim();
    const goal = parseFloat(document.getElementById('fund-goal').value);
    if (!title || !goal) { showToast(t('fund.enter_title_goal','Please enter a title and goal amount'), 'warning'); return; }
    const imageFile = document.getElementById('fund-image').files[0];
    
    try {
        let imageData = '';
        if (imageFile) imageData = await fileToBase64Resized(imageFile, 600);
        const days = parseInt(document.getElementById('fund-days').value) || 30;
        const platformFee = parseFloat(document.getElementById('fund-fee')?.value) || 2.5;
        await _mpPost('/api/marketplace/campaigns', {
            title, description: document.getElementById('fund-desc').value.trim(),
            category: document.getElementById('fund-category').value,
            goal, imageData, platformFee, days
        });
        
        showToast(`<i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> "${title}" ${t('fund.campaign_started','campaign started!')}`, 'success');
        document.getElementById('fund-title').value = '';
        document.getElementById('fund-desc').value = '';
        loadCampaigns();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

async function loadCampaigns() {
    const c = document.getElementById('fund-campaigns');
    if (!c) return; c.innerHTML = t('common.loading','Loading...');
    try {
        const cData = await _mpGet('/api/marketplace/campaigns?status=active');
        const cItems = cData.items || [];
        if (!cItems.length) { c.innerHTML = `<p style="color:var(--accent);">${t('fund.no_campaigns','No campaigns yet. Create the first one!')}</p>`; return; }
        c.innerHTML = '';
        cItems.forEach(x => {
            const pct = Math.min(100, Math.round((x.raised / x.goal) * 100));
            const isCreator = currentUser?.uid === x.creatorId;
            c.innerHTML += `
                <div style="background:#FFF8F0; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08); cursor:pointer;" onclick="showCampaignDetail('${x.id}')">
                    ${x.imageData ? `<img src="${x.imageData}" loading="lazy" style="width:100%; height:180px; object-fit:cover;">` : ''}
                    <div style="padding:1rem;">
                        <h4 style="margin-bottom:0.3rem;">${x.title}</h4>
                        <p style="font-size:0.85rem; color:var(--accent); margin-bottom:0.5rem;">${x.creatorNickname || x.creatorEmail} · ${x.backerCount || x.backers || 0} ${t('fund.backers','backers')}</p>
                        <p style="font-size:0.75rem; color:#5B7B8C; margin-bottom:0.5rem;"><i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('fund.fee','Fee')} ${x.platformFee||2.5}% · ${t('fund.creator_receives','Creator receives')} ${100-(x.platformFee||2.5)}%</p>
                        <div style="background:#e0e0e0; height:8px; border-radius:4px; margin-bottom:0.5rem;">
                            <div style="background:#5B7B8C; height:100%; border-radius:4px; width:${pct}%;"></div>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
                            <span style="font-weight:700;">${x.raised} / ${x.goal} ${x.token}</span>
                            <span style="color:var(--accent);">${pct}%</span>
                        </div>
                        <div style="display:flex; gap:0.5rem; margin-top:0.8rem;">
                            <button onclick="event.stopPropagation(); donateCampaign('${x.id}')" style="background:#5B7B8C; color:#FFF8F0; border:none; padding:0.6rem; border-radius:6px; cursor:pointer; flex:1; font-weight:700;">${t('fundraise.donate_btn','<i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Donate')}</button>
                            ${isCreator ? `<button onclick="event.stopPropagation(); closeCampaign('${x.id}')" style="background:#e53935; color:#FFF8F0; border:none; padding:0.6rem; border-radius:6px; cursor:pointer; font-weight:700; font-size:0.8rem;">${t('fund.close','Close')}</button>` : ''}
                        </div>
                    </div>
                </div>`;
        });
    } catch (e) { c.innerHTML = e.message; }
}

async function donateCampaign(id) {
    const amountStr = await showPromptModal(t('fund.donate_amount','Donation Amount'), t('fund.enter_amount','Enter the amount to donate'), '');
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) return;
    try {
        // Server handles balance check, deduction, creator payment, campaign update, transaction logs
        await _mpPost('/api/marketplace/campaigns/' + id + '/donate', { amount });
        showToast(`<i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${amount} CRGC ${t('fund.donated','donated!')}`, 'success');
        loadCampaigns(); loadUserWallet();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

// ========== CREB LABS - 미래기술 투자 ==========

const CREB_CATEGORIES = {
    energy: { icon: '<i data-lucide="zap" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#C4841D', label: t('invest.impact_energy','Energy'), sdg: 'SDG 7' },
    genetics: { icon: '<i data-lucide="dna" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#B54534', label: t('invest.impact_genetics','Genetic Engineering'), sdg: 'SDG 3' },
    biotech: { icon: '<i data-lucide="microscope" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#5B7B8C', label: t('invest.impact_biotech','Biotechnology'), sdg: 'SDG 3' },
    ai_robotics: { icon: '<i data-lucide="bot" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', color: '#5B7B8C', label: t('invest.impact_ai_robotics','AI & Robotics'), sdg: 'SDG 9' }
};

const CREB_INVEST_TYPES = {
    return: { icon: '<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('invest.type_profit','Profit-type'), color: '#C4841D', bg: '#FFF3E0' },
    donation: { icon: '<i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('invest.type_donation','Donation & Good Investment'), color: '#5B7B8C', bg: '#E8F5E9' },
    hybrid: { icon: '<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>', label: t('invest.type_hybrid','Hybrid'), color: '#5B7B8C', bg: '#E3F2FD' }
};

const CREB_IMPACT = {
    energy: { unit: t('invest.unit_energy','kW clean energy produced'), factor: 0.5 },
    genetics: { unit: t('invest.unit_genetics','hours of rare disease research supported'), factor: 0.01 },
    biotech: { unit: t('invest.unit_biotech','stages of drug pipeline advanced'), factor: 0.005 },
    ai_robotics: { unit: t('invest.unit_ai','AI training data batches processed'), factor: 0.1 }
};

let _crebCurrentFilter = 'all';

function filterCrebCategory(cat) {
    _crebCurrentFilter = cat;
    document.querySelectorAll('.creb-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.cat === cat);
        if (b.dataset.cat === cat) { b.style.background = cat === 'all' ? '#3D2B1F' : (CREB_CATEGORIES[cat]?.color || '#3D2B1F'); b.style.color = 'white'; }
        else { b.style.background = 'white'; b.style.color = b.dataset.cat === 'all' ? '#6B5744' : (CREB_CATEGORIES[b.dataset.cat]?.color || '#6B5744'); }
    });
    loadEnergyProjects();
}

function getInvestType(x) {
    if (x.investType) return x.investType;
    if (x.returnRate > 0) return 'return';
    return 'return';
}

function renderInvestBadge(x) {
    const itype = getInvestType(x);
    const info = CREB_INVEST_TYPES[itype] || CREB_INVEST_TYPES['return'];
    return `<span style="display:inline-block; padding:0.15rem 0.5rem; border-radius:10px; font-size:0.7rem; background:${info.bg}; color:${info.color}; font-weight:600;">${info.icon} ${info.label}</span>`;
}

function renderMilestones(milestones) {
    if (!milestones || !milestones.length) return '';
    return milestones.map(m => {
        const pct = Math.min(100, Math.round((m.current / m.target) * 100));
        return `<div style="margin-top:0.3rem;"><div style="font-size:0.7rem; color:#6B5744;">${m.name} (${pct}%)</div><div style="background:#e0e0e0; height:4px; border-radius:2px;"><div style="background:#5B7B8C; height:100%; border-radius:2px; width:${pct}%;"></div></div></div>`;
    }).join('');
}

async function loadEnergyProjects() {
    const c = document.getElementById('energy-projects');
    if (!c) return; c.innerHTML = t('common.loading','Loading...');
    try {
        const epData = await _mpGet('/api/marketplace/energy-projects?status=active');
        const epItems = epData.items || [];
        if (!epItems.length) { c.innerHTML = `<p style="color:var(--accent);">${t('energy.no_projects','No projects registered')}</p>`; return; }
        c.innerHTML = '';
        epItems.forEach(x => {
            const cat = x.category || 'energy';
            if (_crebCurrentFilter !== 'all' && cat !== _crebCurrentFilter) return;
            const catInfo = CREB_CATEGORIES[cat] || CREB_CATEGORIES.energy;
            const xTitle = x.name || x.title || '';
            const xGoal = x.goal || x.targetAmount || 0;
            const xInvested = x.invested || x.currentAmount || 0;
            const xInvestors = x.investors || x.investorCount || 0;
            const pct = Math.min(100, Math.round((xInvested / xGoal)*100));
            const rate = x.returnRate || 0;
            const exMonthly = (100 * rate / 100 / 12).toFixed(2);
            const isAdmin = currentUser && (currentUser.email === 'admin@crowny.org' || currentUser.uid === x.creatorId);
            const itype = getInvestType(x);
            c.innerHTML += `<div style="background:var(--bg); padding:1rem; border-radius:8px; margin-bottom:0.8rem; border-left:4px solid ${catInfo.color};" onclick="openProjectDetail('${x.id}')" data-category="${cat}">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
                    <h4 style="margin:0;">${catInfo.icon} ${xTitle}</h4>
                    <span style="font-size:0.7rem; padding:0.15rem 0.5rem; border-radius:10px; background:${catInfo.color}15; color:${catInfo.color}; font-weight:600;">${catInfo.label}</span>
                </div>
                <div style="margin-bottom:0.3rem;">${renderInvestBadge(x)}</div>
                <p style="font-size:0.85rem; color:var(--accent); margin:0.3rem 0;">${x.location || ''} ${x.capacity ? '· ' + x.capacity + 'kW' : ''} ${rate > 0 ? '· ' + t('energy.expected_return','Expected return') + ' ' + rate + '%' : ''}</p>
                ${rate > 0 ? `<div style="font-size:0.8rem; color:#5B7B8C; margin-top:0.3rem;"><i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('invest.per_100_creb','100 CREB invested')} → ${t('invest.monthly_short','monthly')} ${exMonthly} CREB (${t('invest.annual_short','annual')} ${rate}%)</div>` : ''}
                ${itype === 'donation' ? `<div style="font-size:0.8rem; color:#5B7B8C; margin-top:0.3rem;"><i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('energy.pure_donation','Pure donation - investing in the future without returns')}</div>` : ''}
                ${itype === 'hybrid' ? `<div style="font-size:0.8rem; color:#5B7B8C; margin-top:0.3rem;"><i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('energy.hybrid_desc','50% returns + 50% reinvestment')}</div>` : ''}
                <div style="font-size:0.75rem; color:var(--accent);">${t('invest.investors','Investors')} ${xInvestors}${t('common.count_people','')}</div>
                <div style="background:#e0e0e0; height:6px; border-radius:3px; margin:0.5rem 0;"><div style="background:${catInfo.color}; height:100%; border-radius:3px; width:${pct}%;"></div></div>
                <div style="display:flex; justify-content:space-between; font-size:0.85rem;"><span>${xInvested}/${xGoal} CREB</span><span>${pct}%</span></div>
                ${renderMilestones(x.milestones)}
                <div style="display:flex; gap:0.5rem; margin-top:0.5rem;" onclick="event.stopPropagation();">
                    <button onclick="investEnergy('${x.id}')" style="background:${catInfo.color}; color:#FFF8F0; border:none; padding:0.5rem; border-radius:6px; cursor:pointer; flex:1;">${t('energy.invest_btn','Invest')}</button>
                    ${isAdmin ? `<button onclick="distributeEnergyReturns('${x.id}')" style="background:#8B6914; color:#FFF8F0; border:none; padding:0.5rem; border-radius:6px; cursor:pointer; flex:1; font-size:0.8rem;">${t('energy.distribute','<i data-lucide="bar-chart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Distribute Returns')}</button>` : ''}
                </div>
            </div>`; });
        if (!c.innerHTML.trim()) c.innerHTML = `<p style="color:var(--accent);">${t('energy.no_projects_category','No projects in this category')}</p>`;
    } catch (e) { c.innerHTML = e.message; }
}

// 프로젝트 상세 모달
async function openProjectDetail(projectId) {
    try {
        const epData = await _mpGet('/api/marketplace/energy-projects/' + projectId);
        if (!epData.item) return;
        const x = epData.item;
        const cat = x.category || 'energy';
        const catInfo = CREB_CATEGORIES[cat] || CREB_CATEGORIES.energy;
        const rate = x.returnRate || 0;
        const xTitle = x.name || x.title || '';
        const xGoal = x.goal || 0;
        const xInvested = x.invested || 0;
        const pct = Math.min(100, Math.round((xInvested/xGoal)*100));

        let teamHtml = '';
        if (x.teamMembers && x.teamMembers.length) {
            teamHtml = `<div style="margin-top:1rem;"><h4>${t('invest.team','Team')}</h4>${x.teamMembers.map(m => `<div style="padding:0.3rem 0; font-size:0.85rem;">${m.name} — ${m.role || ''}</div>`).join('')}</div>`;
        }

        let milestonesHtml = '';
        if (x.milestones && x.milestones.length) {
            milestonesHtml = `<div style="margin-top:1rem;"><h4><i data-lucide="clipboard-list" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> ${t('invest.milestones','Milestones')}</h4>${x.milestones.map(m => {
                const mp = Math.min(100, Math.round((m.current/m.target)*100));
                return `<div style="margin:0.5rem 0;"><div style="font-size:0.85rem; font-weight:600;">${m.name}</div><div style="background:#e0e0e0; height:6px; border-radius:3px; margin:0.3rem 0;"><div style="background:${catInfo.color}; height:100%; border-radius:3px; width:${mp}%;"></div></div><div style="font-size:0.75rem; color:var(--accent);">${m.current}/${m.target} (${mp}%)</div></div>`;
            }).join('')}</div>`;
        }

        // Load comments
        let commentsHtml = '';
        try {
            const cmtData = await _mpGet('/api/marketplace/energy-projects/' + projectId + '/comments');
            const cmtItems = cmtData.items || [];
            if (cmtItems.length) {
                commentsHtml = cmtItems.map(cd => {
                    const date = cd.createdAt ? new Date(cd.createdAt).toLocaleDateString('ko-KR') : '';
                    return `<div style="padding:0.5rem; background:var(--bg); border-radius:6px; margin-bottom:0.4rem;"><div style="font-size:0.75rem; color:var(--accent);">${cd.nickname || t('common.anonymous','Anonymous')} · ${date}</div><div style="font-size:0.85rem;">${cd.text}</div></div>`;
                }).join('');
            }
        } catch(e) { console.warn("[catch]", e); }

        // Load investors
        let investorsHtml = '';
        try {
            const invData = await _mpGet('/api/marketplace/energy-investments?projectId=' + projectId);
            const invItems = invData.items || [];
            if (invItems.length) {
                investorsHtml = `<div style="margin-top:1rem;"><h4><i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('energy.recent_investors','Recent investors')}</h4>${invItems.slice(0,10).map(id => {
                    return `<div style="font-size:0.8rem; padding:0.2rem 0;">${t('common.anonymous','Anonymous')} · ${id.amount} CREB</div>`;
                }).join('')}</div>`;
            }
        } catch(e) { console.warn("[catch]", e); }

        const modalHtml = `<div id="creb-project-modal" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(61,43,31,0.85); z-index:10000; display:flex; align-items:center; justify-content:center; padding:1rem;" onclick="if(event.target===this)this.remove();">
            <div style="background:#FFF8F0; border-radius:12px; max-width:550px; width:100%; max-height:90vh; overflow-y:auto; padding:1.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <h3 style="margin:0;">${catInfo.icon} ${xTitle}</h3>
                    <button onclick="document.getElementById('creb-project-modal').remove()" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
                </div>
                <div style="display:flex; gap:0.5rem; margin-bottom:0.8rem;">
                    <span style="padding:0.2rem 0.6rem; border-radius:10px; font-size:0.75rem; background:${catInfo.color}15; color:${catInfo.color}; font-weight:600;">${catInfo.label}</span>
                    ${renderInvestBadge(x)}
                    <span style="padding:0.2rem 0.6rem; border-radius:10px; font-size:0.75rem; background:#F7F3ED; color:#6B5744;">${catInfo.sdg}</span>
                </div>
                <p style="color:var(--accent);">${x.description || x.location || ''}</p>
                <div style="background:#e0e0e0; height:8px; border-radius:4px; margin:0.8rem 0;"><div style="background:${catInfo.color}; height:100%; border-radius:4px; width:${pct}%;"></div></div>
                <div style="display:flex; justify-content:space-between; margin-bottom:1rem;"><span>${xInvested}/${xGoal} CREB (${pct}%)</span><span>${t('energy.return_rate','Return rate')} ${rate}%</span></div>
                ${teamHtml}${milestonesHtml}${investorsHtml}
                <div style="margin-top:1rem;"><h4>${t('invest.comments','Comments')}</h4>
                    <div style="display:flex; gap:0.5rem; margin-bottom:0.8rem;">
                        <input type="text" id="creb-comment-input" placeholder="${t('energy.comment_placeholder','Questions or comments...')}" style="flex:1; padding:0.5rem; border:1px solid var(--border); border-radius:6px;">
                        <button onclick="postCrebComment('${projectId}')" style="background:${catInfo.color}; color:#FFF8F0; border:none; padding:0.5rem 1rem; border-radius:6px; cursor:pointer;">${t('common.submit','Submit')}</button>
                    </div>
                    ${commentsHtml}
                </div>
                <button onclick="investEnergy('${projectId}'); document.getElementById('creb-project-modal').remove();" class="btn-primary" style="width:100%; margin-top:1rem;"><i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('energy.invest_btn','Invest')}</button>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch(e) { console.error(e); }
}

async function postCrebComment(projectId) {
    if (!currentUser) { showToast(t('common.login_required','Login required'), 'warning'); return; }
    const input = document.getElementById('creb-comment-input');
    const text = input?.value.trim();
    if (!text) return;
    try {
        await _mpPost('/api/marketplace/energy-projects/' + projectId + '/comments', { text });
        showToast(t('common.comment_posted','Comment posted!'), 'success');
        document.getElementById('creb-project-modal')?.remove();
        openProjectDetail(projectId);
    } catch(e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

async function investEnergy(id) {
    const tk = 'creb';
    const tkName = 'CREB';
    const amountStr = await showPromptModal(t('energy.invest_amount','Investment Amount'), `${tkName} ${t('energy.enter_amount','Enter amount')}`, '');
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) return;
    try {
        // Server handles balance deduction, project update, investment logging
        await _mpPost('/api/marketplace/energy-projects/' + id + '/invest', { amount });
        showToast(`${amount} ${tkName} ${t('energy.invested','invested!')}`, 'success'); loadEnergyProjects(); loadUserWallet();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

// ========== BUSINESS - 크라우니 생태계 ==========

async function registerBusiness() {
    if (!currentUser) return;
    const name = document.getElementById('biz-name').value.trim();
    if (!name) { showToast(t('biz.enter_name','Please enter a business name'), 'warning'); return; }
    try {
        const imageFile = document.getElementById('biz-image').files[0];
        let imageData = '';
        if (imageFile) imageData = await fileToBase64Resized(imageFile, 600);
        await _mpPost('/api/marketplace/businesses', {
            name, description: document.getElementById('biz-desc').value.trim(),
            category: document.getElementById('biz-category').value,
            country: document.getElementById('biz-country').value.trim(),
            website: document.getElementById('biz-website').value.trim(),
            imageData
        });
        showToast(`"${name}" ${t('common.registered','registered!')}`, 'success');
        document.getElementById('biz-name').value = '';
        loadBusinessList();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

async function loadBusinessList() {
    const c = document.getElementById('business-list');
    if (!c) return; c.innerHTML = t('common.loading','Loading...');
    try {
        const bizData = await _mpGet('/api/marketplace/businesses?status=active');
        const bizItems = bizData.items || [];
        if (!bizItems.length) { c.innerHTML = `<p style="color:var(--accent);">${t('biz.no_businesses','No businesses registered')}</p>`; return; }
        const BIZ_CATS = {retail:'<i data-lucide="store" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',food:'<i data-lucide="utensils" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',service:'<i data-lucide="wrench" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',tech:'<i data-lucide="laptop" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',education:'<i data-lucide="book-open" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',health:'<i data-lucide="pill" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',logistics:'<i data-lucide="truck" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',entertainment:'<i data-lucide="theater" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',other:'<i data-lucide="building" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>'};
        c.innerHTML = '';
        bizItems.forEach(x => {
            c.innerHTML += `<div onclick="viewBusinessDetail('${x.id}')" style="background:#FFF8F0; padding:1rem; border-radius:10px; box-shadow:0 2px 8px rgba(0,0,0,0.08); display:flex; gap:1rem; align-items:center; cursor:pointer;">
                ${x.imageData ? `<img src="${x.imageData}" loading="lazy" style="width:70px; height:70px; border-radius:8px; object-fit:cover;">` : `<div style="width:70px; height:70px; background:var(--bg); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">${BIZ_CATS[x.category]||'<i data-lucide="building" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>'}</div>`}
                <div style="flex:1;"><h4>${x.name}</h4><p style="font-size:0.8rem; color:var(--accent);">${[BIZ_CATS[x.category], x.country, x.ownerNickname || x.ownerEmail].filter(Boolean).join(' · ')}</p>
                ${x.description ? `<p style="font-size:0.85rem; margin-top:0.3rem;">${x.description.slice(0,80)}${x.description.length>80?'...':''}</p>` : ''}
                <div style="font-size:0.75rem; color:var(--accent); margin-top:0.3rem;"><i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${x.reviews > 0 ? (x.rating/x.reviews).toFixed(1) : '-'} · ${x.reviews||0} ${t('mall.reviews','Reviews')}</div></div></div>`; });
    } catch (e) { c.innerHTML = e.message; }
}

// ========== ARTIST - 엔터테인먼트 ==========

async function registerArtist() {
    if (!currentUser) return;
    const name = document.getElementById('artist-name').value.trim();
    if (!name) { showToast(t('artist.enter_name','Please enter an artist name'), 'warning'); return; }
    try {
        const imageFile = document.getElementById('artist-photo').files[0];
        let imageData = '';
        if (imageFile) imageData = await fileToBase64Resized(imageFile, 400);
        await _mpPost('/api/marketplace/artists', {
            name, bio: document.getElementById('artist-bio').value.trim(),
            genre: document.getElementById('artist-genre').value,
            imageData
        });
        showToast(`<i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> "${name}" ${t('common.registered','registered!')}`, 'success');
        document.getElementById('artist-name').value = '';
        loadArtistList();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

async function loadArtistList() {
    const c = document.getElementById('artist-list');
    if (!c) return; c.innerHTML = `<p style="text-align:center; color:var(--accent); grid-column:1/-1;">${t('common.loading','Loading...')}</p>`;
    try {
        const artData = await _mpGet('/api/marketplace/artists?status=active');
        const artItems = artData.items || [];
        if (!artItems.length) { c.innerHTML = `<p style="text-align:center; color:var(--accent); grid-column:1/-1;">${t('artist.no_artists','No artists registered')}</p>`; return; }
        const GENRES = {music:'<i data-lucide="music" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',dance:'<i data-lucide="music" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',acting:'<i data-lucide="film" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',comedy:'<i data-lucide="smile" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',creator:'<i data-lucide="video" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',model:'<i data-lucide="camera" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',dj:'<i data-lucide="headphones" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',other:'<i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>'};
        c.innerHTML = '';
        artItems.forEach(x => {
            c.innerHTML += `<div onclick="viewArtistDetail('${x.id}')" style="background:#FFF8F0; border-radius:10px; overflow:hidden; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.08); cursor:pointer;">
                <div style="height:160px; overflow:hidden; background:linear-gradient(135deg,#8B6914,#6B5744);">
                ${x.imageData ? `<img src="${x.imageData}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">` : `<div style="height:100%; display:flex; align-items:center; justify-content:center; font-size:3rem; color:#FFF8F0;">${GENRES[x.genre]||'<i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>'}</div>`}</div>
                <div style="padding:0.6rem;"><div style="font-weight:700;">${x.name}</div>
                <div style="font-size:0.75rem; color:var(--accent);">${GENRES[x.genre]||''} · ${t('artist.fans','Fans')} ${x.fans}</div>
                <button onclick="event.stopPropagation(); supportArtist('${x.id}')" style="background:#B54534; color:#FFF8F0; border:none; padding:0.4rem 0.8rem; border-radius:6px; cursor:pointer; margin-top:0.4rem; font-size:0.8rem;">${t('artist.support_btn','<i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Support')}</button>
                </div></div>`; });
    } catch (e) { c.innerHTML = e.message; }
}

async function supportArtist(id) {
    const tk = 'crac';
    const tkName = 'CRAC';
    const amountStr = await showPromptModal(t('artist.support_amount','Support Amount'), `${tkName} ${t('energy.enter_amount','Enter amount')}`, '');
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) return;
    try {
        // Server handles balance deduction, artist payment, fan tracking, transaction logging
        const result = await _mpPost('/api/marketplace/artists/' + id + '/support', { amount });
        showToast(`${amount} ${tkName} ${t('artist.supported','supported')}!`, 'success'); loadArtistList(); loadUserWallet();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

// ========== BOOKS - 출판 ==========

async function registerBook() {
    if (!currentUser) return;
    const title = document.getElementById('book-title').value.trim();
    const price = parseFloat(document.getElementById('book-price').value);
    if (!title) { showToast(t('books.enter_title','Please enter a book title'), 'warning'); return; }
    try {
        const coverFile = document.getElementById('book-cover').files[0];
        let imageData = '';
        if (coverFile) imageData = await fileToBase64Resized(coverFile, 400);
        await _mpPost('/api/marketplace/books', {
            title, author: document.getElementById('book-author').value.trim(),
            description: document.getElementById('book-desc').value.trim(),
            genre: document.getElementById('book-genre').value,
            price: price || 0, imageData
        });
        showToast(`<i data-lucide="books" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> "${title}" ${t('common.registered','registered!')}`, 'success');
        document.getElementById('book-title').value = '';
        loadBooksList();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

async function loadBooksList() {
    const c = document.getElementById('books-list');
    if (!c) return; c.innerHTML = `<p style="text-align:center; color:var(--accent); grid-column:1/-1;">${t('common.loading','Loading...')}</p>`;
    try {
        const bkData = await _mpGet('/api/marketplace/books?status=active');
        const bkItems = bkData.items || [];
        if (!bkItems.length) { c.innerHTML = `<p style="text-align:center; color:var(--accent); grid-column:1/-1;">${t('books.no_books','No books registered')}</p>`; return; }
        const GENRES = {novel:'<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',essay:'<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',selfhelp:'<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',business:'<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',tech:'<i data-lucide="laptop" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',poetry:'<i data-lucide="pen-tool" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',children:'<i data-lucide="users" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',comic:'<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',other:'<i data-lucide="books" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>'};
        c.innerHTML = '';
        bkItems.forEach(x => {
            c.innerHTML += `<div onclick="viewBookDetail('${x.id}')" style="background:#FFF8F0; border-radius:10px; overflow:hidden; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <div style="height:180px; overflow:hidden; background:#f5f0e8;">
                ${x.imageData ? `<img src="${x.imageData}" loading="lazy" style="width:100%; height:100%; object-fit:contain;">` : `<div style="height:100%; display:flex; align-items:center; justify-content:center; font-size:3rem;">${GENRES[x.genre]||'<i data-lucide="books" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>'}</div>`}</div>
                <div style="padding:0.5rem;"><div style="font-weight:600; font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${x.title}</div>
                <div style="font-size:0.7rem; color:var(--accent);">${x.author||t('books.unknown_author','Unknown author')}</div>
                <div style="font-weight:700; color:#3D2B1F; font-size:0.85rem; margin-top:0.2rem;">${x.price>0 ? x.price+' CRGC' : t('books.free','Free')}</div></div></div>`; });
    } catch (e) { c.innerHTML = e.message; }
}

async function buyBook(id) {
    const bkData = await _mpGet('/api/marketplace/books/' + id);
    if (!bkData.item) return; const b = bkData.item;
    if (b.publisherId === currentUser?.uid) { showToast(t('books.own_book','This is your own book'), 'info'); return; }
    if (b.price <= 0) { showToast(`<i data-lucide="book-open" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> "${b.title}" — ${t('books.free_read','Free to read!')}`, 'info'); return; }
    if (!await showConfirmModal(t('books.buy_book','Buy Book'), `"${b.title}"\n${b.price} CRGC — ${t('mall.confirm_buy_msg','Proceed with purchase?')}`)) return;
    try {
        // Server handles balance deduction, publisher payment, sold increment, transaction log
        await _mpPost('/api/marketplace/books/' + id + '/buy', {});
        if (typeof distributeReferralReward === 'function') await distributeReferralReward(currentUser.uid, b.price, 'CRGC');
        showToast(`<i data-lucide="book-open" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> "${b.title}" ${t('mall.purchase_done','Purchase complete!')}`, 'success'); loadUserWallet();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

// ========== CREDIT - P2P 크레딧 ==========

// 보험 승인/거절 (관리자)
async function approveInsurance(id) {
    if (!currentUser) return;
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/credit/insurance/approve', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ insuranceId: id, approved: true })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed');
        showToast(t('credit.insurance_approved','Insurance approved'), 'success');
        loadInsuranceAdmin(); loadMyInsuranceClaims();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

async function rejectInsurance(id) {
    if (!currentUser) return;
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/credit/insurance/approve', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ insuranceId: id, approved: false })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed');
        showToast(t('credit.insurance_rejected','Insurance request rejected'), 'info');
        loadInsuranceAdmin(); loadMyInsuranceClaims();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

// 관리자용 보험 대기 목록
async function loadInsuranceAdmin() {
    const c = document.getElementById('insurance-admin-list');
    if (!c || !currentUser) return;
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/credit/insurance', { headers: { 'Authorization': 'Bearer ' + token } });
        if (!resp.ok) throw new Error('Failed');
        const { items, isAdmin } = await resp.json();
        if (!isAdmin) { c.style.display = 'none'; return; }
        c.style.display = 'block';
        const pending = items.filter(r => r.status === 'pending');
        if (!pending.length) { c.innerHTML = `<p style="color:var(--accent); font-size:0.85rem;">${t('credit.no_pending_insurance','No pending insurance requests')}</p>`; return; }
        const TYPES = { medical: t('credit.insurance_medical','Medical'), disaster: t('credit.insurance_disaster','Disaster'), education: t('credit.insurance_education','Education'), housing: t('credit.insurance_housing','Housing'), other: t('credit.insurance_other','Other') };
        c.innerHTML = `<h4><i data-lucide="hourglass"></i> ${t('credit.pending_insurance','Pending Insurance Requests')}</h4>`;
        pending.forEach(r => {
            c.innerHTML += `<div class="credit-list-item credit-list-item--pending">
                <div class="row">
                    <div><strong>${r.requesterName || r.requesterId}</strong> <span class="meta">${TYPES[r.type] || r.type}</span></div>
                    <span style="font-weight:700; color:#C4841D;">${r.amount} CRTD</span>
                </div>
                <p class="meta">${r.reason}</p>
                <div class="credit-admin-actions">
                    <button onclick="approveInsurance('${r.id}')" style="background:#5B7B8C;"><i data-lucide="check-circle"></i> ${t('credit.approve','Approve')}</button>
                    <button onclick="rejectInsurance('${r.id}')" style="background:#B54534;"><i data-lucide="x-circle"></i> ${t('credit.reject','Reject')}</button>
                </div>
            </div>`;
        });
    } catch (e) { c.innerHTML = e.message; }
}

// 내 보험 신청 내역
async function loadMyInsuranceClaims() {
    const c = document.getElementById('my-insurance-claims');
    if (!c || !currentUser) return;
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/credit/insurance', { headers: { 'Authorization': 'Bearer ' + token } });
        if (!resp.ok) throw new Error('Failed');
        const { items } = await resp.json();
        const mine = items.filter(r => r.requesterId === currentUser.uid);
        if (!mine.length) { c.innerHTML = `<p style="color:var(--accent); font-size:0.85rem;">${t('credit.no_insurance_claims','No insurance claims')}</p>`; return; }
        const STATUS = { pending: `<i data-lucide="hourglass"></i> ${t('credit.status_pending','Pending')}`, approved: `<i data-lucide="check-circle"></i> ${t('credit.status_approved','Approved')}`, rejected: `<i data-lucide="x-circle"></i> ${t('credit.status_rejected','Rejected')}` };
        const STATUS_COLOR = { pending: '#C4841D', approved: '#5B7B8C', rejected: '#B54534' };
        c.innerHTML = '';
        mine.forEach(r => {
            c.innerHTML += `<div class="credit-claim-item" style="border-left:3px solid ${STATUS_COLOR[r.status] || '#6B5744'};">
                <div class="row" style="font-size:0.85rem;">
                    <span><strong>${r.amount} CRNY</strong> — ${(r.reason || '').slice(0, 40)}</span>
                    <span style="color:${STATUS_COLOR[r.status]}; font-weight:600;">${STATUS[r.status] || r.status}</span>
                </div>
            </div>`;
        });
    } catch (e) { c.innerHTML = e.message; }
}

// 계모임 라운드 실행 (주최자만)
async function executeGyeRound(gyeId) {
    if (!currentUser) return;
    try {
        if (!await showConfirmModal(t('credit.execute_round','Execute Gye Round'), t('common.confirm_proceed','Proceed?'))) return;
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/credit/gye/round', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ gyeId })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed');
        showToast('Round ' + data.round + ' ' + t('credit.round_complete','complete!') + ' ' + data.recipient + ' ' + t('credit.received','received') + ' ' + data.totalPot + ' CRTD', 'success');
        loadGyeList();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

// 크레딧 점수 상세 분석
async function loadCreditScoreBreakdown() {
    const c = document.getElementById('credit-score-breakdown');
    if (!c || !currentUser) return;
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/credit/score', { headers: { 'Authorization': 'Bearer ' + token } });
        if (!resp.ok) throw new Error('Failed to load score');
        const data = await resp.json();
        const b = data.breakdown;
        const totalScore = data.score;

        c.innerHTML = `
            <div class="credit-breakdown">
                <div class="credit-breakdown-row"><span><i data-lucide="crown"></i> ${t('credit.crtd_held','CRTD Held')}</span><span>+${b.crtdHolding}${t('credit.points','pts')}</span></div>
                <div class="credit-breakdown-row"><span><i data-lucide="heart"></i> ${t('credit.donations','Donations')}</span><span>+${b.donationScore}${t('credit.points','pts')}</span></div>
                <div class="credit-breakdown-row"><span><i data-lucide="users"></i> ${t('credit.contributions','Contributions')}</span><span>+${b.contributionScore}${t('credit.points','pts')}</span></div>
                <div class="credit-breakdown-row"><span><i data-lucide="percent"></i> ${t('credit.repay_rate','Repay Rate')}</span><span>+${b.repaymentScore}${t('credit.points','pts')}</span></div>
                <div class="credit-breakdown-row"><span><i data-lucide="bar-chart"></i> ${t('credit.frequency','Frequency')}</span><span>+${b.frequencyScore}${t('credit.points','pts')}</span></div>
                <div class="credit-breakdown-total"><span><i data-lucide="trophy"></i> ${t('credit.total_score','Total Credit Score')}</span><span>${totalScore}</span></div>
            </div>`;
        const scoreEl = document.getElementById('credit-score');
        if (scoreEl) { scoreEl.textContent = totalScore; scoreEl.style.color = totalScore >= 700 ? '#5B7B8C' : totalScore >= 500 ? '#C4841D' : '#B54534'; }
    } catch (e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

// ========== BUSINESS 투자 & 상세 ==========

async function viewBusinessDetail(id) {
    const bizData = await _mpGet('/api/marketplace/businesses/' + id);
    if (!bizData.item) return;
    const b = bizData.item;
    const BIZ_CATS = {retail:'<i data-lucide="store" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('biz.cat_retail','Retail'),food:'<i data-lucide="utensils" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('biz.cat_food','Food & Beverage'),service:'<i data-lucide="wrench" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('biz.cat_service','Service'),tech:'<i data-lucide="laptop" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('biz.cat_tech','Tech'),education:'<i data-lucide="book-open" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('biz.cat_education','Education'),health:'<i data-lucide="pill" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('biz.cat_health','Health'),logistics:'<i data-lucide="truck" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('biz.cat_logistics','Logistics'),entertainment:'<i data-lucide="theater" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('biz.cat_entertainment','Entertainment'),other:'<i data-lucide="building" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('biz.cat_other','Other')};
    // 투자 현황
    const invData = await _mpGet('/api/marketplace/business-investments?businessId=' + id);
    const investments = invData.items || [];
    let totalInvested = 0, investorCount = 0;
    investments.forEach(inv => { totalInvested += inv.amount || 0; investorCount++; });
    // 평점
    const avgRating = b.reviews > 0 ? (b.rating / b.reviews).toFixed(1) : t('common.none','N/A');
    const stars = b.reviews > 0 ? '<i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>'.repeat(Math.round(b.rating / b.reviews)) : '';

    const modal = document.createElement('div');
    modal.id = 'biz-detail-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div style="background:#FFF8F0; border-radius:12px; max-width:500px; width:100%; max-height:90vh; overflow-y:auto;">
        ${b.imageData ? `<img src="${b.imageData}" loading="lazy" style="width:100%; border-radius:12px 12px 0 0; max-height:200px; object-fit:cover;">` : ''}
        <div style="padding:1.2rem;">
            <h3>${b.name}</h3>
            <p style="color:var(--accent); font-size:0.85rem; margin:0.3rem 0;">${[BIZ_CATS[b.category], b.country, b.ownerNickname || b.ownerEmail].filter(Boolean).join(' · ')}</p>
            ${b.description ? `<p style="font-size:0.9rem; margin:0.8rem 0;">${b.description}</p>` : ''}
            ${b.website ? `<a href="${b.website}" target="_blank" style="font-size:0.85rem;"><i data-lucide="external-link" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('biz.website','Website')}</a>` : ''}
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.5rem; margin:1rem 0;">
                <div style="background:var(--bg); padding:0.6rem; border-radius:8px; text-align:center;">
                    <div style="font-size:0.7rem; color:var(--accent);">${t('invest.total_invested','Total invested')}</div>
                    <div style="font-weight:700;">${totalInvested} CRGC</div>
                </div>
                <div style="background:var(--bg); padding:0.6rem; border-radius:8px; text-align:center;">
                    <div style="font-size:0.7rem; color:var(--accent);">${t('invest.investors','Investors')}</div>
                    <div style="font-weight:700;">${investorCount}${t('common.count_people','')}</div>
                </div>
                <div style="background:var(--bg); padding:0.6rem; border-radius:8px; text-align:center;">
                    <div style="font-size:0.7rem; color:var(--accent);">${t('biz.rating','Rating')}</div>
                    <div style="font-weight:700;">${avgRating} ${stars}</div>
                </div>
            </div>
            ${b.ownerId !== currentUser?.uid ? `<button onclick="investBusiness('${id}')" style="background:#3D2B1F; color:#FFF8F0; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700; width:100%; margin-bottom:0.5rem;"><i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('biz.invest','Invest')}</button>` : ''}
            <button onclick="document.getElementById('biz-detail-modal').remove()" style="background:#E8E0D8; border:none; padding:0.6rem; border-radius:8px; cursor:pointer; width:100%;">${t('common.close','Close')}</button>
        </div></div>`;
    document.body.appendChild(modal);
}

async function investBusiness(id) {
    if (!currentUser) return;
    const tk = 'crgc';
    const tkName = 'CRGC';
    const amountStr = await showPromptModal(t('biz.invest_amount','Investment Amount'), `${tkName} ${t('common.enter_amount','Enter amount')}`, '');
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) return;
    try {
        // Server handles balance deduction, owner payment, investment logging
        await _mpPost('/api/marketplace/business-investments', { businessId: id, amount });
        showToast('<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + amount + ' ' + tkName + ' ' + t('invest.invested_in','invested in') + ' ' + biz.name + '!', 'success');
        document.getElementById('biz-detail-modal')?.remove();
        loadBusinessList(); loadUserWallet();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

async function rateBusinessAfterInvest(businessId) {
    const ratingStr = await showPromptModal(t('biz.rate_business','Rate Business'), t('biz.enter_rating','Enter rating (1-5)'), '5');
    const rating = parseInt(ratingStr);
    if (!rating || rating < 1 || rating > 5) return;
    try {
        const bizData = await _mpGet('/api/marketplace/businesses/' + businessId);
        const biz = bizData.item;
        await _mpPatch('/api/marketplace/businesses/' + businessId, {
            rating: (biz.rating || 0) + rating,
            reviews: (biz.reviews || 0) + 1
        });
        showToast('<i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('biz.rating_done','Rating submitted') + ' ' + rating + '/5!', 'success');
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

// ========== ARTIST 상세 & 팬 추적 ==========

async function viewArtistDetail(id) {
    const artData = await _mpGet('/api/marketplace/artists/' + id);
    if (!artData.item) return;
    const a = artData.item;
    const GENRES = {music:'<i data-lucide="music" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('artist.genre_music','Music'),dance:'<i data-lucide="music" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('artist.genre_dance','Dance'),acting:'<i data-lucide="film" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('artist.genre_acting','Acting'),comedy:'<i data-lucide="smile" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('artist.genre_comedy','Comedy'),creator:'<i data-lucide="video" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('artist.genre_creator','Creator'),model:'<i data-lucide="camera" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('artist.genre_model','Model'),dj:'<i data-lucide="headphones" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> DJ',other:'<i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('artist.genre_other','Other')};
    // Support history
    const txData = await _mpGet('/api/marketplace/transactions?artistId=' + id + '&type=artist_support&limit=50');
    const txItems = txData.items || [];
    let supportHtml = '';
    txItems.slice(0, 10).forEach(s => {
        supportHtml += `<div style="font-size:0.8rem; padding:0.3rem 0; border-bottom:1px solid #E8E0D8;">${s.amount} ${s.token} · ${s.timestamp ? new Date(s.timestamp).toLocaleDateString() : ''}</div>`;
    });
    // 유니크 팬 수
    const uniqueFans = new Set();
    txItems.forEach(s => uniqueFans.add(s.from));

    const modal = document.createElement('div');
    modal.id = 'artist-detail-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div style="background:#FFF8F0; border-radius:12px; max-width:500px; width:100%; max-height:90vh; overflow-y:auto;">
        <div style="height:200px; background:linear-gradient(135deg,#8B6914,#6B5744); position:relative;">
            ${a.imageData ? `<img src="${a.imageData}" loading="lazy" style="width:100%; height:100%; object-fit:cover; border-radius:12px 12px 0 0;">` : ''}
        </div>
        <div style="padding:1.2rem;">
            <h3>${a.name}</h3>
            <p style="color:var(--accent); font-size:0.85rem;">${GENRES[a.genre] || ''} · ${t('artist.fans','Fans')} ${uniqueFans.size} · ${t('artist.total_support','Total support')} ${a.totalSupport || 0}</p>
            ${a.bio ? `<p style="font-size:0.9rem; margin:0.8rem 0;">${a.bio}</p>` : ''}
            <div style="margin:1rem 0;">
                <h4 style="font-size:0.85rem; margin-bottom:0.5rem;"><i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('artist.recent_support','Recent support')}</h4>
                ${supportHtml || `<p style="font-size:0.8rem; color:var(--accent);">${t('artist.no_support','No support history')}</p>`}
            </div>
            <button onclick="supportArtist('${id}'); document.getElementById('artist-detail-modal').remove();" style="background:#B54534; color:#FFF8F0; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700; width:100%; margin-bottom:0.5rem;"><i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('artist.support_action','Support')}</button>
            <button onclick="document.getElementById('artist-detail-modal').remove()" style="background:#E8E0D8; border:none; padding:0.6rem; border-radius:8px; cursor:pointer; width:100%;">${t('common.close','Close')}</button>
        </div></div>`;
    document.body.appendChild(modal);
}

// ========== BOOKS 상세 & 읽고 싶은 책 ==========

async function viewBookDetail(id) {
    const bkData = await _mpGet('/api/marketplace/books/' + id);
    if (!bkData.item) return;
    const b = bkData.item;
    const GENRES = {novel:'<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('books.genre_novel','Novel'),essay:'<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('books.genre_essay','Essay'),selfhelp:'<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('books.genre_selfhelp','Self-help'),business:'<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('books.genre_business','Business'),tech:'<i data-lucide="laptop" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('books.genre_tech','Technology'),poetry:'<i data-lucide="pen-tool" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('books.genre_poetry','Poetry'),children:'<i data-lucide="users" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('books.genre_children','Children'),comic:'<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('books.genre_comic','Comics'),other:'<i data-lucide="books" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('books.genre_other','Other')};
    const isOwner = currentUser?.uid === b.publisherId;

    const modal = document.createElement('div');
    modal.id = 'book-detail-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div style="background:#FFF8F0; border-radius:12px; max-width:500px; width:100%; max-height:90vh; overflow-y:auto;">
        <div style="height:250px; background:#f5f0e8; display:flex; align-items:center; justify-content:center;">
            ${b.imageData ? `<img src="${b.imageData}" loading="lazy" style="max-width:100%; max-height:100%; object-fit:contain;">` : `<span style="font-size:4rem;">${GENRES[b.genre]?.charAt(0) || '<i data-lucide="books" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>'}</span>`}
        </div>
        <div style="padding:1.2rem;">
            <h3>${b.title}</h3>
            <p style="color:var(--accent); font-size:0.85rem; margin:0.3rem 0;">${b.author || t('books.unknown_author','Unknown author')} · ${GENRES[b.genre] || ''} · ${t('mall.sold','Sold')} ${b.sold || 0}</p>
            <p style="font-size:1.1rem; font-weight:700; color:#3D2B1F; margin:0.5rem 0;">${b.price > 0 ? b.price + ' CRGC' : t('books.free','Free')}</p>
            ${b.description ? `<p style="font-size:0.9rem; margin:0.8rem 0; line-height:1.6;">${b.description}</p>` : ''}
            <div style="display:flex; gap:0.5rem; margin-top:1rem;">
                ${!isOwner && b.price > 0 ? `<button onclick="buyBook('${id}'); document.getElementById('book-detail-modal').remove();" style="flex:1; background:#3D2B1F; color:#FFF8F0; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700;"><i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.buy_now','Buy Now')}</button>` : ''}
                ${!isOwner && b.price <= 0 ? `<button onclick="showToast('<i data-lucide=\\'book-open\\' style=\\'width:14px;height:14px;display:inline-block;vertical-align:middle;\\'></i> ' + t('books.free_access','Free access!'), 'info'); document.getElementById('book-detail-modal').remove();" style="flex:1; background:#5B7B8C; color:#FFF8F0; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700;"><i data-lucide="book-open" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('books.free_read','Free read')}</button>` : ''}
                <button onclick="addToReadingList('${id}')" style="flex:1; background:#C4841D; color:#FFF8F0; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700;"><i data-lucide="books" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('books.want_to_read','Want to read')}</button>
            </div>
            <button onclick="document.getElementById('book-detail-modal').remove()" style="background:#E8E0D8; border:none; padding:0.6rem; border-radius:8px; cursor:pointer; width:100%; margin-top:0.5rem;">${t('common.close','Close')}</button>
        </div></div>`;
    document.body.appendChild(modal);
}

// addToReadingList, loadReadingList, removeFromReadingList — migrated to REST API
// Primary definitions now in books.js; marketplace.js provides fallback wrappers

function _mpBookHeaders() {
    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}

if (typeof addToReadingList === 'undefined') {
    window.addToReadingList = async function(bookId) {
        if (!currentUser) return;
        try {
            const res = await fetch('/api/books/reading-list/add', {
                method: 'POST', headers: _mpBookHeaders(),
                body: JSON.stringify({ bookId })
            });
            const data = await res.json();
            if (!res.ok) {
                if (data.error === 'already in list') showToast(t('books.already_in_list','Already in your reading list'), 'info');
                else showToast(t('common.fail','Failed') + ': ' + (data.error || ''), 'error');
                return;
            }
            const entry = data.entry || {};
            showToast('<i data-lucide="books" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> "' + (entry.bookTitle || '') + '" ' + t('books.added_to_reading_list','added to reading list!'), 'success');
        } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
    };
}

async function loadReadingList() {
    const c = document.getElementById('reading-list');
    if (!c || !currentUser) return;
    try {
        const res = await fetch('/api/books/reading-list', { headers: _mpBookHeaders() });
        const data = await res.json();
        const list = data.list || [];
        if (!list.length) { c.innerHTML = `<p style="color:var(--accent); font-size:0.85rem;">${t('books.no_reading_list','No books in reading list')}</p>`; return; }
        c.innerHTML = '';
        list.forEach(r => {
            c.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem; background:var(--bg); border-radius:6px; margin-bottom:0.3rem;">
                <div><strong style="font-size:0.85rem;">${r.bookTitle}</strong> <span style="font-size:0.75rem; color:var(--accent);">${r.bookAuthor}</span></div>
                <button onclick="removeFromReadingList('${r.id}')" style="background:none; border:none; cursor:pointer; font-size:0.8rem;"><i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>
            </div>`;
        });
    } catch (e) { c.innerHTML = e.message; }
}

if (typeof removeFromReadingList === 'undefined') {
    window.removeFromReadingList = async function(id) {
        try {
            const res = await fetch('/api/books/reading-list/' + id, { method: 'DELETE', headers: _mpBookHeaders() });
            if (!res.ok) { showToast(t('common.fail','Failed'), 'error'); return; }
            showToast(t('books.removed_from_list','Removed from reading list'), 'info');
            loadReadingList();
        } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
    };
}

function showCreditTab(tab) {
    document.querySelectorAll('.credit-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.credit-tab').forEach(b => b.classList.remove('active'));
    const panel = document.getElementById(`credit-${tab}`);
    if (panel) panel.style.display = 'block';
    const btn = document.getElementById(`tab-${tab}`);
    if (btn) btn.classList.add('active');
}

// Event delegation for credit tabs
document.getElementById('credit')?.addEventListener('click', e => {
    const tabBtn = e.target.closest('[data-action="credit-tab"]');
    if (tabBtn) { showCreditTab(tabBtn.dataset.tab); return; }
});

// 환전 (수수료 0%)
// swapTokens() → 위 오프체인 섹션으로 통합 이동됨

// 품앗이 요청 (무이자 P2P)
async function requestPumasi() {
    if (!currentUser) return;
    const amount = parseFloat(document.getElementById('pumasi-amount').value);
    const reason = document.getElementById('pumasi-reason').value.trim();
    const days = parseInt(document.getElementById('pumasi-days').value) || 30;
    const target = (document.getElementById('pumasi-target')?.value || '').trim();
    if (!amount || !reason) { showToast(t('credit.enter_amount_reason','Please enter amount and reason'), 'warning'); return; }

    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/credit/pumasi', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, reason, days, target })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed');
        showToast(t('credit.pumasi_requested','Pumasi request submitted') + ` ${amount} CRTD${target ? ' → ' + target : ''}`, 'success');
        document.getElementById('pumasi-target').value = '';
        document.getElementById('pumasi-amount').value = '';
        document.getElementById('pumasi-reason').value = '';
        loadPumasiList();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

async function loadPumasiList() {
    const c = document.getElementById('pumasi-list');
    if (!c) return; c.innerHTML = t('common.loading','Loading...');
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/credit/pumasi', { headers: { 'Authorization': 'Bearer ' + token } });
        if (!resp.ok) throw new Error('Failed');
        const { items } = await resp.json();
        if (!items.length) { c.innerHTML = `<p style="color:var(--accent);">${t('credit.no_requests','No requests')}</p>`; return; }
        c.innerHTML = '';
        items.filter(x => x.status === 'active').forEach(x => {
            const pct = Math.min(100, Math.round((x.raised / x.amount) * 100));
            const backerCount = Array.isArray(x.backers) ? x.backers.length : (x.backers || 0);
            c.innerHTML += `<div class="credit-list-item">
                <div class="row"><strong>${x.requesterName || x.requesterId}</strong><span style="font-weight:700;">${x.amount} CRTD</span></div>
                ${x.targetId ? `<p class="target">→ ${t('credit.target','Target')}: ${x.targetId}</p>` : `<p class="meta">${t('credit.public_request','Open to community')}</p>`}
                <p class="meta">${x.reason}</p>
                <div class="credit-progress"><div class="credit-progress-bar" style="width:${pct}%;"></div></div>
                <div class="row" style="font-size:0.8rem;"><span>${x.raised}/${x.amount} · ${backerCount}${t('common.people','')}</span><span class="credit-info">${t('credit.zero_interest','Interest 0%')}</span></div>
                ${x.requesterId !== currentUser?.uid ? `<button onclick="contributePumasi('${x.id}')" class="credit-action-btn credit-action-btn--green">${t('credit.help_btn','Help')}</button>` : ''}
            </div>`;
        });
    } catch (e) { c.innerHTML = e.message; }
}

async function contributePumasi(id) {
    const amountStr = await showPromptModal(t('credit.help_amount','Help Amount'), `CRTD ${t('common.enter_amount','Enter amount')}`, '');
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) return;
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/credit/pumasi/contribute', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ pumasiId: id, amount })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed');
        showToast(t('credit.help_complete','Contribution complete') + ` ${amount} CRTD`, 'success');
        loadPumasiList(); loadUserWallet();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

// 보험 신청
async function requestInsurance() {
    if (!currentUser) return;
    const type = document.getElementById('insurance-type').value;
    const amount = parseFloat(document.getElementById('insurance-amount').value);
    const reason = document.getElementById('insurance-reason').value.trim();
    if (!amount || !reason) { showToast(t('credit.enter_amount_reason','Please enter amount and reason'), 'warning'); return; }

    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/credit/insurance', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, amount, reason })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed');
        showToast(t('credit.insurance_submitted','Insurance claim submitted for review'), 'success');
        loadMyInsuranceClaims();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

// 기부
async function quickDonate() {
    if (!currentUser) { showToast(t('common.login_required','Login required'), 'warning'); return; }
    const amount = parseFloat(document.getElementById('donate-amount').value);
    const targetType = document.getElementById('donate-target').value;
    if (!amount || amount < 1) { showToast(t('fund.min_donation','Minimum donation is 1'), 'warning'); return; }

    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const payload = { amount, targetType };
        if (targetType === 'designated') {
            payload.targetUsername = (document.getElementById('donate-target-email')?.value || '').trim();
        }
        const resp = await fetch('/api/credit/donate', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed');
        showToast(t('credit.donation_complete','Donation complete') + ` ${amount} CRTD`, 'success');
        loadUserWallet();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

async function loadCreditInfo() {
    if (!currentUser) return;
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/credit/score', { headers: { 'Authorization': 'Bearer ' + token } });
        if (!resp.ok) throw new Error('Failed');
        const data = await resp.json();

        const scoreEl = document.getElementById('credit-score');
        if (scoreEl) { scoreEl.textContent = data.score; scoreEl.style.color = data.score >= 700 ? '#5B7B8C' : data.score >= 500 ? '#C4841D' : '#B54534'; }

        const loansEl = document.getElementById('active-loans');
        if (loansEl) loansEl.textContent = data.activeLoans + t('common.count_items','');

        const donatedEl = document.getElementById('total-donated');
        if (donatedEl) donatedEl.textContent = data.totalDonated;

        loadCreditScoreBreakdown();
        loadMyInsuranceClaims();
        loadInsuranceAdmin();
    } catch (e) { console.error(e); }
}

// ========== ENERGY ADMIN ==========

async function createEnergyProject() {
    if (!currentUser) { showToast(t('common.login_required','Login required'), 'warning'); return; }
    const title = document.getElementById('energy-title')?.value.trim();
    const location = document.getElementById('energy-location')?.value.trim();
    const capacity = parseFloat(document.getElementById('energy-capacity')?.value) || 0;
    const returnRate = parseFloat(document.getElementById('energy-return')?.value) || 0;
    const goal = parseFloat(document.getElementById('energy-goal')?.value) || 0;
    const category = document.getElementById('energy-category')?.value || 'energy';
    const investType = document.getElementById('energy-invest-type')?.value || 'return';
    if (!title || !goal) { showToast(t('energy.enter_title_goal','Please enter project name and goal amount'), 'warning'); return; }
    try {
        await _mpPost('/api/marketplace/energy-projects', {
            title, location, capacity, returnRate, goal, category, investType
        });
        const catInfo = CREB_CATEGORIES[category] || CREB_CATEGORIES.energy;
        showToast(`${catInfo.icon} "${title}" ${t('energy.project_registered','project registered!')}`, 'success');
        document.getElementById('energy-title').value = '';
        loadEnergyProjects();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

// ========== GYE (계모임) ==========

async function createGye() {
    if (!currentUser) { showToast(t('common.login_required','Login required'), 'warning'); return; }
    const name = document.getElementById('gye-name')?.value.trim();
    const monthlyAmount = parseFloat(document.getElementById('gye-amount')?.value);
    const maxMembers = parseInt(document.getElementById('gye-members')?.value) || 10;
    if (!name || !monthlyAmount) { showToast(t('credit.enter_name_amount','Please enter name and monthly amount'), 'warning'); return; }
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/credit/gye', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, monthlyAmount, maxMembers })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed');
        showToast(t('credit.gye_created','Gye group created') + `: ${name}`, 'success');
        document.getElementById('gye-name').value = '';
        loadGyeList();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

async function loadGyeList() {
    const c = document.getElementById('gye-list');
    if (!c) return; c.innerHTML = t('common.loading','Loading...');
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/credit/gye', { headers: { 'Authorization': 'Bearer ' + token } });
        if (!resp.ok) throw new Error('Failed');
        const { items } = await resp.json();
        if (!items.length) { c.innerHTML = `<p style="color:var(--accent);">${t('credit.no_gye','No gye groups yet. Create the first one!')}</p>`; return; }
        c.innerHTML = '';
        items.forEach(g => {
            const isMember = g.members?.some(m => m.userId === currentUser?.uid);
            const memberCount = g.members?.length || 0;
            c.innerHTML += `<div class="credit-list-item credit-list-item--gye">
                <div class="row">
                    <div>
                        <strong><i data-lucide="refresh-cw"></i> ${g.name}</strong>
                        <div class="meta">${g.organizerId} · ${memberCount}/${g.maxMembers}${t('common.people','')}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700; color:#FF9800;">${g.monthlyAmount} CRTD/${t('common.month','mo')}</div>
                        <div class="meta">Round ${g.currentRound}</div>
                    </div>
                </div>
                ${!isMember && memberCount < g.maxMembers ? `<button onclick="joinGye('${g.id}')" class="credit-action-btn credit-action-btn--orange">${t('credit.join_btn','Join')}</button>` : ''}
                ${isMember ? `<div class="credit-status credit-status--active"><i data-lucide="check-circle"></i> ${t('credit.participating','Participating')}</div>` : ''}
                ${g.organizerId === currentUser?.uid && g.status === 'active' && g.currentRound < memberCount ? `<button onclick="executeGyeRound('${g.id}')" class="credit-action-btn credit-action-btn--red"><i data-lucide="refresh-cw"></i> Round ${g.currentRound + 1} ${t('credit.execute','Execute')}</button>` : ''}
                ${g.status === 'recruiting' && memberCount >= g.maxMembers ? `<div class="credit-status credit-status--done">${t('credit.recruitment_full','Recruitment complete')}</div>` : ''}
            </div>`;
        });
    } catch (e) { c.innerHTML = e.message; }
}

async function joinGye(gyeId) {
    if (!currentUser) return;
    try {
        const confirmed = await showConfirmModal(t('credit.join_gye','Join Gye'), t('common.confirm_proceed','Proceed?'));
        if (!confirmed) return;
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/credit/gye/join', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ gyeId })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed');
        showToast(t('credit.gye_joined','Joined gye group!'), 'success');
        loadGyeList();
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

// 몰 브랜드 필터
function filterMallBrand(brand) {
    if (brand) {
        // Navigate to brand landing page
        filterMallBrandLanding(brand);
        return;
    }
    // "전체" clicked — stay on mall page
    window._mallBrandFilter = null;
    
    // 활성 카드 하이라이트
    document.querySelectorAll('.mall-brand-card').forEach(c => {
        c.classList.remove('active');
        c.style.outline = 'none';
        c.style.opacity = '1';
    });
    const activeCard = document.querySelector(`.mall-brand-card[data-brand="all"]`);
    if (activeCard) {
        activeCard.classList.add('active');
        activeCard.style.outline = '2px solid var(--gold, #8B6914)';
    }
    document.querySelectorAll('.mall-brand-card:not(.active)').forEach(c => c.style.opacity = '0.6');
    
    loadMallProducts();
}

// ========== ENERGY - 내 투자 내역 + 수익 배분 ==========

async function loadMyEnergyInvestments() {
    if (!currentUser) { showToast(t('common.login_required','Login required'), 'warning'); return; }
    const c = document.getElementById('energy-my-investments');
    if (!c) return;
    c.innerHTML = `<p style="text-align:center; color:var(--accent);">${t('common.loading','Loading...')}</p>`;
    try {
        const eiData = await _mpGet('/api/marketplace/energy-investments?userId=' + currentUser.uid);
        const eiItems = eiData.items || [];
        if (!eiItems.length) { c.innerHTML = `<p style="color:var(--accent);">${t('energy.no_investments','No investments yet')}</p>`; document.getElementById('creb-impact-dashboard').style.display = 'none'; return; }
        const projCache = {};
        let totalInvested = 0, totalMonthly = 0;
        const catTotals = { energy: 0, genetics: 0, biotech: 0, ai_robotics: 0 };
        const projectIds = new Set();
        let rows = '';
        for (const inv of eiItems) {
            if (!projCache[inv.projectId]) {
                try { const pr = await _mpGet('/api/marketplace/energy-projects/' + inv.projectId); projCache[inv.projectId] = pr.item || { title: 'Deleted', returnRate: 0, category: 'energy' }; }
                catch(e) { projCache[inv.projectId] = { title: 'Deleted', returnRate: 0, category: 'energy' }; }
                if (!projCache[inv.projectId].title) projCache[inv.projectId].title = projCache[inv.projectId].name || 'Project';
            }
            const proj = projCache[inv.projectId];
            const cat = proj.category || 'energy';
            const catInfo = CREB_CATEGORIES[cat] || CREB_CATEGORIES.energy;
            const rate = proj.returnRate || 0;
            const monthlyReturn = (inv.amount * rate / 100 / 12);
            totalInvested += inv.amount;
            totalMonthly += monthlyReturn;
            catTotals[cat] = (catTotals[cat] || 0) + inv.amount;
            projectIds.add(inv.projectId);
            const dateStr = inv.timestamp ? new Date(inv.timestamp).toLocaleDateString('ko-KR') : '-';
            
            rows += `<div style="background:var(--bg); padding:0.8rem; border-radius:8px; margin-bottom:0.5rem; border-left:3px solid ${catInfo.color};">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${catInfo.icon} ${proj.title}</strong>
                        <div style="font-size:0.75rem; color:var(--accent);">${dateStr} · ${inv.token || 'CREB'}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700; color:${catInfo.color};">${inv.amount} ${inv.token || 'CREB'}</div>
                        ${rate > 0 ? `<div style="font-size:0.75rem; color:#5B7B8C;">${t('invest.monthly_short','monthly')} ${monthlyReturn.toFixed(2)} CREB (${t('invest.annual_short','annual')} ${rate}%)</div>` : `<div style="font-size:0.75rem; color:#5B7B8C;"><i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('invest.type_donation_short','Donation')}</div>`}
                    </div>
                </div>
            </div>`;
        }
        
        c.innerHTML = `
            <div style="background:#FFF8E1; padding:0.8rem; border-radius:8px; margin-bottom:0.8rem; display:flex; justify-content:space-around; text-align:center;">
                <div><div style="font-size:0.7rem; color:var(--accent);">${t('invest.total_invested','Total invested')}</div><strong>${totalInvested.toFixed(1)}</strong></div>
                <div><div style="font-size:0.7rem; color:var(--accent);">${t('invest.expected_monthly','Expected monthly')}</div><strong style="color:#5B7B8C;">${totalMonthly.toFixed(2)} CREB</strong></div>
                <div><div style="font-size:0.7rem; color:var(--accent);">${t('invest.expected_annual','Expected annual')}</div><strong style="color:#8B6914;">${(totalMonthly * 12).toFixed(2)} CREB</strong></div>
            </div>
            ${rows}`;
        
        // 상단 투자 현황
        const ei = document.getElementById('energy-invested');
        if (ei) ei.textContent = `${totalInvested.toFixed(1)} CREB`;
        const em = document.getElementById('energy-monthly');
        if (em) em.textContent = `${totalMonthly.toFixed(2)} CREB`;

        // 임팩트 대시보드
        const dashboard = document.getElementById('creb-impact-dashboard');
        if (dashboard) {
            dashboard.style.display = 'block';
            document.getElementById('impact-total-creb').textContent = `${totalInvested.toFixed(0)} CREB`;
            document.getElementById('impact-project-count').textContent = projectIds.size + t('common.count_items','');
            
            // 카테고리 바
            const barsEl = document.getElementById('impact-category-bars');
            let barsHtml = '';
            for (const [cat, amount] of Object.entries(catTotals)) {
                if (amount <= 0) continue;
                const ci = CREB_CATEGORIES[cat];
                const pct = Math.round((amount / totalInvested) * 100);
                barsHtml += `<div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.3rem;">
                    <span style="font-size:0.8rem; min-width:80px;">${ci.icon} ${ci.label}</span>
                    <div style="flex:1; background:#e0e0e0; height:8px; border-radius:4px;"><div style="background:${ci.color}; height:100%; border-radius:4px; width:${pct}%;"></div></div>
                    <span style="font-size:0.75rem; color:var(--accent); min-width:35px;">${pct}%</span>
                </div>`;
            }
            barsEl.innerHTML = barsHtml;
            
            // 임팩트 메시지
            const msgEl = document.getElementById('impact-messages');
            let msgs = '';
            for (const [cat, amount] of Object.entries(catTotals)) {
                if (amount <= 0) continue;
                const ci = CREB_CATEGORIES[cat];
                const imp = CREB_IMPACT[cat];
                const val = (amount * imp.factor).toFixed(1);
                msgs += `<div style="margin:0.2rem 0;">${ci.icon} ${val} ${imp.unit}</div>`;
            }
            msgEl.innerHTML = msgs;
            
            // SDG 배지
            const sdgEl = document.getElementById('impact-sdg-badges');
            const sdgs = new Set();
            for (const [cat, amount] of Object.entries(catTotals)) {
                if (amount > 0) sdgs.add(CREB_CATEGORIES[cat].sdg);
            }
            sdgEl.innerHTML = [...sdgs].map(s => `<span style="display:inline-block; padding:0.2rem 0.6rem; border-radius:12px; background:#E3F2FD; color:#1565C0; font-size:0.75rem; font-weight:600;"><i data-lucide="award" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${s}</span>`).join('');
        }
    } catch (e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

// 관리자: 에너지 수익 배분
async function distributeEnergyReturns(projectId) {
    if (!currentUser) return;
    try {
        const projData = await _mpGet('/api/marketplace/energy-projects/' + projectId);
        if (!projData.item) { showToast(t('energy.project_not_found','Project not found'), 'error'); return; }
        const proj = projData.item;
        const rate = proj.returnRate || 0;
        const eiData = await _mpGet('/api/marketplace/energy-investments?projectId=' + projectId);
        const investments = eiData.items || [];
        if (!investments.length) { showToast(t('energy.no_investors','No investors'), 'info'); return; }
        let totalInvested = 0;
        investments.forEach(i => totalInvested += i.amount);
        const confirmed = await showConfirmModal(t('invest.confirm_distribute','Confirm Distribution'), t('invest.project','Project') + ': ' + (proj.name || proj.title) + '\n' + t('invest.total_invested','Total invested') + ': ' + totalInvested + '\n' + t('energy.return_rate','Return rate') + ': ' + rate + '%\n' + t('invest.monthly_total','Monthly total') + ': ' + (totalInvested * rate / 100 / 12).toFixed(2) + ' CREB\n\n' + t('invest.distribute_to','Distribute to') + ' ' + investments.length + t('common.count_people','') + '?');
        if (!confirmed) return;
        // Server handles distribution to all investors
        const result = await _mpPost('/api/marketplace/energy-projects/' + projectId + '/distribute', {});
        showToast('<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + (result.distributed || 0).toFixed(2) + ' CREB ' + t('invest.distributed_to','distributed to') + ' ' + (result.investorCount || 0) + t('common.count_people','') + '!', 'success');
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

// ========== FUNDRAISE - 캠페인 종료 + 상세 모달 ==========

async function closeCampaign(id) {
    if (!currentUser) return;
    try {
        const campData = await _mpGet('/api/marketplace/campaigns/' + id);
        if (!campData.item) { showToast(t('fund.campaign_not_found','Campaign not found'), 'error'); return; }
        const camp = campData.item;
        if (camp.creatorId !== currentUser.uid) { showToast(t('fund.creator_only','Only the campaign creator can close it'), 'error'); return; }
        const fee = camp.platformFee || 2.5;
        const feeAmount = camp.raised * (fee / 100);
        const creatorAmount = camp.raised - feeAmount;
        const confirmed = await showConfirmModal(t('fund.close_campaign','Close Campaign'), '"' + camp.title + '"\n\n' + t('fund.total_raised','Total raised') + ': ' + camp.raised + ' ' + camp.token + '\n' + t('fund.fee','Fee') + ' (' + fee + '%): ' + feeAmount.toFixed(2) + ' ' + camp.token + '\n' + t('fund.creator_receives','Creator receives') + ': ' + creatorAmount.toFixed(2) + ' ' + camp.token + '\n\n' + t('common.confirm_proceed','Proceed?'));
        if (!confirmed) return;
        await _mpPatch('/api/marketplace/campaigns/' + id, { status: 'closed' });
        showToast('<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> "' + camp.title + '" ' + t('fund.campaign_closed','Campaign closed!') + ' ' + creatorAmount.toFixed(2) + ' ' + camp.token + ' ' + t('fund.received','received'), 'success');
        loadCampaigns();
        // 모달 닫기
        const modal = document.getElementById('campaign-detail-modal');
        if (modal) modal.style.display = 'none';
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

async function showCampaignDetail(id) {
    try {
        const campRes = await _mpGet('/api/marketplace/campaigns/' + id);
        const camp = campRes.item;
        if (!camp) return;
        const pct = Math.min(100, Math.round((camp.raised / camp.goal) * 100));
        const isCreator = currentUser?.uid === camp.creatorId;

        // 후원자 목록 로드
        const txRes = await _mpGet('/api/marketplace/transactions?campaignId=' + id + '&type=donation');
        const donorTxs = txRes.items || txRes;

        let donorList = '';
        if (donorTxs.length > 0) {
            donorTxs.forEach(tx => {
                const dateStr = tx.timestamp ? new Date(tx.timestamp).toLocaleDateString('ko-KR') : '-';
                donorList += `<div style="display:flex; justify-content:space-between; padding:0.4rem 0; border-bottom:1px solid #F7F3ED; font-size:0.82rem;">
                    <span style="color:var(--accent);">${dateStr}</span>
                    <span style="font-weight:600;">${tx.amount} ${tx.token}</span>
                </div>`;
            });
        } else {
            donorList = `<p style="color:var(--accent); font-size:0.85rem;">${t('fund.no_donors','No donors yet')}</p>`;
        }

        const fee = camp.platformFee || 2.5;
        const content = document.getElementById('campaign-detail-content');
        content.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                <h3 style="margin:0;">${camp.title}</h3>
                <button onclick="document.getElementById('campaign-detail-modal').style.display='none'" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">✕</button>
            </div>
            ${camp.imageData ? `<img src="${camp.imageData}" loading="lazy" style="width:100%; border-radius:8px; max-height:250px; object-fit:cover; margin-bottom:1rem;">` : ''}
            <p style="font-size:0.85rem; color:var(--accent); margin-bottom:0.5rem;">${camp.creatorNickname || camp.creatorEmail} · ${camp.category || ''}</p>
            ${camp.description ? `<p style="margin-bottom:1rem; font-size:0.9rem;">${camp.description}</p>` : ''}
            <div style="background:#F7F3ED; padding:1rem; border-radius:8px; margin-bottom:1rem;">
                <div style="background:#e0e0e0; height:10px; border-radius:5px; margin-bottom:0.5rem;">
                    <div style="background:#5B7B8C; height:100%; border-radius:5px; width:${pct}%;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.9rem;">
                    <span style="font-weight:700;">${camp.raised} / ${camp.goal} ${camp.token}</span>
                    <span>${pct}% · ${camp.backerCount || camp.backers || 0}${t('common.count_people','')}</span>
                </div>
                <div style="font-size:0.8rem; color:#5B7B8C; margin-top:0.5rem;"><i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('fund.fee','Fee')} ${fee}% · ${t('fund.creator_receives','Creator receives')} ${(100 - fee).toFixed(1)}%</div>
            </div>
            <button onclick="donateCampaign('${id}')" style="background:#5B7B8C; color:#FFF8F0; border:none; padding:0.7rem; border-radius:8px; cursor:pointer; width:100%; font-weight:700; margin-bottom:0.8rem;"><i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('fund.donate_btn','Donate')}</button>
            ${isCreator && camp.status === 'active' ? `<button onclick="closeCampaign('${id}')" style="background:#e53935; color:#FFF8F0; border:none; padding:0.7rem; border-radius:8px; cursor:pointer; width:100%; font-weight:700; margin-bottom:1rem;"><i data-lucide="lock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('fund.close_and_receive','Close campaign & receive funds')}</button>` : ''}
            <h4 style="margin-bottom:0.5rem;">${t('fund.donor_list','Donor list')} (${donorTxs.length}${t('common.count_people','')})</h4>
            ${donorList}`;

        const modal = document.getElementById('campaign-detail-modal');
        modal.style.display = 'flex';
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    } catch (e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

// ========== CART (장바구니) ==========

async function addToCart(productId) {
    if (!currentUser) { showToast(t('common.login_required','Login required'), 'warning'); return; }
    try {
        const result = await _mpPost('/api/marketplace/cart', { productId });
        showToast('<i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + (result.message || t('mall.added_to_cart','added to cart')), 'success');
        updateCartBadge();
    } catch(e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

async function updateCartBadge() {
    const badge = document.getElementById('cart-badge');
    if (!badge || !currentUser) return;
    try {
        const cartRes = await _mpGet('/api/marketplace/cart');
        const items = cartRes.items || cartRes;
        let total = 0;
        items.forEach(item => total += (item.qty || 1));
        if (total > 0) { badge.textContent = total; badge.style.display = 'block'; }
        else { badge.style.display = 'none'; }
    } catch(e) { badge.style.display = 'none'; }
}

async function loadCart() {
    const c = document.getElementById('cart-items');
    const summary = document.getElementById('cart-summary');
    if (!c) return;
    if (!currentUser) { c.innerHTML = `<p style="color:var(--accent); text-align:center;">${t('common.login_required','Login required')}</p>`; if(summary) summary.style.display='none'; return; }
    c.innerHTML = `<p style="text-align:center; color:var(--accent);">${t('common.loading','Loading...')}</p>`;
    try {
        const cartRes = await _mpGet('/api/marketplace/cart');
        const items = cartRes.items || cartRes;
        if (items.length === 0) {
            c.innerHTML = `<div style="text-align:center; padding:3rem; color:var(--accent);"><div style="font-size:3rem; margin-bottom:1rem;"><i data-lucide="shopping-cart"></i></div><p>${t('mall.cart_empty','Your cart is empty')}</p><button onclick="showPage('mall')" style="margin-top:1rem; background:#3D2B1F; color:#FFF8F0; border:none; padding:0.7rem 1.5rem; border-radius:8px; cursor:pointer;">${t('mall.go_shopping','Go shopping')}</button></div>`;
            if(summary) summary.style.display='none';
            return;
        }
        let total = 0;
        c.innerHTML = '';
        items.forEach(item => {
            const subtotal = item.price * (item.qty || 1);
            total += subtotal;
            c.innerHTML += `<div style="background:#FFF8F0; padding:0.8rem; border-radius:10px; margin-bottom:0.6rem; display:flex; gap:0.8rem; align-items:center; box-shadow:0 1px 4px rgba(0,0,0,0.06);">
                <div style="width:60px; height:60px; border-radius:8px; overflow:hidden; flex-shrink:0; background:#F7F3ED; display:flex; align-items:center; justify-content:center;">
                    ${item.imageData ? `<img src="${item.imageData}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">` : '<span style="font-size:1.5rem; color:#E8E0D8;"><i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></span>'}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.title}</div>
                    <div style="color:#3D2B1F; font-weight:700; font-size:0.85rem;">${item.price} CRGC</div>
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.3rem;">
                        <button onclick="updateCartQty('${item.id}', -1)" style="width:26px; height:26px; border:1px solid #E8E0D8; border-radius:4px; background:#FFF8F0; cursor:pointer; font-size:0.9rem;">−</button>
                        <span style="font-weight:600; min-width:20px; text-align:center;">${item.qty || 1}</span>
                        <button onclick="updateCartQty('${item.id}', 1)" style="width:26px; height:26px; border:1px solid #E8E0D8; border-radius:4px; background:#FFF8F0; cursor:pointer; font-size:0.9rem;">+</button>
                        <button onclick="removeFromCart('${item.id}')" style="background:none; border:none; cursor:pointer; color:#B54534; font-size:0.85rem; margin-left:auto;"><i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>
                    </div>
                </div>
            </div>`;
        });
        if (summary) { summary.style.display = 'block'; }
        const totalEl = document.getElementById('cart-total');
        if (totalEl) totalEl.textContent = total + ' CRGC';
        if(window.lucide) lucide.createIcons();
    } catch(e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

async function updateCartQty(cartDocId, delta) {
    if (!currentUser) return;
    try {
        await _mpPatch('/api/marketplace/cart/' + cartDocId, { delta });
        loadCart(); updateCartBadge();
    } catch(e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

async function removeFromCart(cartDocId) {
    if (!currentUser) return;
    try {
        await _mpDelete('/api/marketplace/cart/' + cartDocId);
        showToast(t('mall.removed_from_cart','Removed from cart'), 'info');
        loadCart(); updateCartBadge();
    } catch(e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

async function checkoutCart(btn) {
    if (!currentUser) return;
    // 이중 클릭 방지
    if (btn) { btn.disabled = true; setTimeout(() => { if(btn) btn.disabled = false; }, 3000); }
    // 동시 주문 방지
    if (_orderInProgress) { showToast(t('mall.order_in_progress','Order is being processed. Please wait.'), 'warning'); return; }
    _orderInProgress = true;
    try {
        const cartRes2 = await _mpGet('/api/marketplace/cart');
        const items = cartRes2.items || cartRes2;
        if (items.length === 0) { showToast(t('mall.cart_empty','Your cart is empty'), 'warning'); return; }
        let total = 0;
        items.forEach(it => { total += it.price * (it.qty || 1); });

        if (total <= 0 || !Number.isFinite(total)) { showToast(t('mall.invalid_price','Invalid price'), 'error'); return; }
        if (total > MAX_ORDER_AMOUNT) { showToast(t('mall.max_order_exceeded',`Maximum order amount is ${MAX_ORDER_AMOUNT} CRGC`), 'warning'); return; }
        if (!await showConfirmModal(t('mall.checkout','Checkout'), `${t('mall.cart_items','Cart items')}: ${items.length}\n${t('mall.total','Total')}: ${total} CRGC — ${t('common.confirm_proceed','Proceed?')}`)) return;

        const shippingInfo = await showShippingModal();
        if (!shippingInfo) return;

        // Server handles balance check, deduction, seller payment, order creation, cart clearing
        const result = await _mpPost('/api/marketplace/cart/checkout', { shippingInfo });
        showToast('<i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + (result.orderCount || items.length) + ' ' + t('mall.items_checkout_done','items checkout complete!'), 'success');
        loadCart(); updateCartBadge(); loadUserWallet();
    } catch(e) { showToast(t('mall.checkout_fail','Checkout failed') + ': ' + e.message, 'error'); } finally { _orderInProgress = false; }
}

// ========== WISHLIST (찜하기) ==========

async function toggleWishlist(productId) {
    if (!currentUser) { showToast(t('common.login_required','Login required'), 'warning'); return; }
    try {
        const result = await _mpPost('/api/marketplace/wishlist/toggle', { productId });
        if (result.action === 'removed') {
            showToast(t('mall.wishlist_removed','Removed from wishlist'), 'info');
        } else {
            showToast('<i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + (result.title ? '"' + result.title + '" ' : '') + t('mall.wishlisted','added to wishlist'), 'success');
        }
    } catch(e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

async function loadWishlist() {
    const c = document.getElementById('wishlist-items');
    if (!c) return;
    if (!currentUser) { c.innerHTML = `<p style="color:var(--accent); text-align:center;">${t('common.login_required','Login required')}</p>`; return; }
    c.innerHTML = `<p style="text-align:center; color:var(--accent);">${t('common.loading','Loading...')}</p>`;
    try {
        const wlRes = await _mpGet('/api/marketplace/wishlist');
        const items = wlRes.items || wlRes;
        if (items.length === 0) {
            c.innerHTML = `<div style="text-align:center; padding:3rem; color:var(--accent);"><div style="font-size:3rem; margin-bottom:1rem;"><i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></div><p>${t('mall.wishlist_empty','No wishlist items')}</p></div>`;
            return;
        }
        c.innerHTML = '';
        items.forEach(item => {
            c.innerHTML += `<div style="background:#FFF8F0; padding:0.8rem; border-radius:10px; margin-bottom:0.6rem; display:flex; gap:0.8rem; align-items:center; box-shadow:0 1px 4px rgba(0,0,0,0.06); cursor:pointer;" onclick="viewProduct('${item.productId}')">
                <div style="width:60px; height:60px; border-radius:8px; overflow:hidden; flex-shrink:0; background:#F7F3ED; display:flex; align-items:center; justify-content:center;">
                    ${item.imageData ? `<img src="${item.imageData}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">` : '<span style="font-size:1.5rem; color:#E8E0D8;"><i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></span>'}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.title}</div>
                    <div style="color:#3D2B1F; font-weight:700; font-size:0.85rem;">${item.price} CRGC</div>
                </div>
                <div style="display:flex; flex-direction:column; gap:0.3rem;">
                    <button onclick="event.stopPropagation(); addToCart('${item.productId}')" style="background:#3D2B1F; color:#FFF8F0; border:none; padding:0.4rem 0.6rem; border-radius:6px; cursor:pointer; font-size:0.75rem;"><i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.add_to_cart','Add')}</button>
                    <button onclick="event.stopPropagation(); toggleWishlist('${item.productId}'); setTimeout(loadWishlist, 500);" style="background:none; border:1px solid #e91e63; color:#e91e63; padding:0.3rem 0.6rem; border-radius:6px; cursor:pointer; font-size:0.75rem;"><i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>
                </div>
            </div>`;
        });
    } catch(e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

// ========== IMAGE GALLERY SCROLL ==========

function scrollPdGallery(dir) {
    const g = document.getElementById('pd-gallery');
    if (!g) return;
    const w = g.offsetWidth;
    g.scrollBy({ left: dir * w, behavior: 'smooth' });
    setTimeout(() => {
        const idx = Math.round(g.scrollLeft / w);
        document.querySelectorAll('.pd-dot').forEach(d => d.style.background = parseInt(d.dataset.idx) === idx ? '#3D2B1F' : '#E8E0D8');
    }, 350);
}

// ========== STORE PAGE ==========

function viewStore(sellerId) {
    history.replaceState(null, '', `#page=store&sellerId=${sellerId}`);
    showPage('store');
    renderStorePage(sellerId);
}

async function renderStorePage(sellerId) {
    const c = document.getElementById('store-content');
    if (!c) return;
    c.innerHTML = `<p style="text-align:center; color:var(--accent); padding:2rem;">${t('common.loading','Loading...')}</p>`;
    try {
        const storeData = await _mpGet('/api/marketplace/store/' + sellerId);
        const seller = storeData.seller || {};
        const storeName = seller.storeName || seller.nickname || seller.email?.split('@')[0] || t('mall.seller','Seller');
        const storeDesc = seller.storeDesc || '';
        const storeImage = seller.storeImage || seller.profileImage || '';
        const isOwner = currentUser?.uid === sellerId;

        // Products from server
        const prodItems = storeData.products || [];
        let totalSold = 0;
        let productsHtml = '';
        prodItems.forEach(p => {
            totalSold += (p.sold || 0);
            const thumb = getProductThumb(p);
            productsHtml += `<div onclick="viewProduct('${p.id}')" style="background:#FFF8F0; border-radius:10px; overflow:hidden; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <div style="height:130px; overflow:hidden; background:#F7F3ED;">${thumb ? `<img src="${thumb}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;color:#E8E0D8;"><i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></div>`}</div>
                <div style="padding:0.5rem;">
                    <div style="font-weight:600; font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.title}</div>
                    <div style="font-weight:700; color:#3D2B1F; font-size:0.85rem;">${p.price} CRGC</div>
                </div>
            </div>`;
        });

        let orderCount = storeData.orderCount || 0;

        c.innerHTML = `
            <button onclick="showPage('mall')" style="background:none; border:none; font-size:1rem; cursor:pointer; margin-bottom:0.8rem; color:var(--accent);">← ${t('mall.back_to_list','Back to list')}</button>
            <div style="background:#FFF8F0; padding:1.5rem; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.08); margin-bottom:1rem;">
                <div style="display:flex; gap:1rem; align-items:center;">
                    <div style="width:70px; height:70px; border-radius:50%; overflow:hidden; background:#F7F3ED; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                        ${storeImage ? `<img src="${storeImage}" style="width:100%; height:100%; object-fit:cover;">` : `<span style="font-size:2rem;"><i data-lucide="store" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></span>`}
                    </div>
                    <div style="flex:1;">
                        <h2 style="margin:0; font-size:1.3rem;">${storeName}</h2>
                        ${storeDesc ? `<p style="color:var(--accent); font-size:0.85rem; margin-top:0.3rem;">${storeDesc}</p>` : ''}
                        <div style="display:flex; gap:1rem; margin-top:0.5rem; font-size:0.8rem; color:var(--accent);">
                            <span><i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.products','Products')} ${prodItems.length}${t('common.count_items','')}</span>
                            <span><i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.total_sold','Total sold')} ${totalSold}${t('common.count_items','')}</span>
                            <span><i data-lucide="clipboard-list" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.orders','Orders')} ${orderCount}${t('common.count_items','')}</span>
                        </div>
                    </div>
                </div>
                ${isOwner ? `<button onclick="showStoreSettingsModal()" style="margin-top:0.8rem; background:#C4841D; color:#FFF8F0; border:none; padding:0.5rem 1rem; border-radius:8px; cursor:pointer; font-size:0.85rem; font-weight:600;"><i data-lucide="settings" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.store_settings','Store settings')}</button>` : (currentUser ? `<button onclick="reportSeller('${sellerId}')" style="margin-top:0.8rem; background:none; color:#B54534; border:1px solid #B54534; padding:0.4rem 0.8rem; border-radius:8px; cursor:pointer; font-size:0.8rem;"><i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.report_seller','Report Seller')}</button>` : '')}
            </div>
            <h3 style="margin-bottom:0.8rem;"><i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.product_list','Product list')}</h3>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:0.8rem;">
                ${productsHtml || `<p style="color:var(--accent); grid-column:1/-1; text-align:center;">${t('mall.no_products','No products registered')}</p>`}
            </div>`;
    } catch(e) { c.innerHTML = `<p style="color:red; text-align:center;">${e.message}</p>`; }
}

async function showStoreSettingsModal() {
    if (!currentUser) return;
    const data = await _mpGet('/api/marketplace/store-settings');

    const overlay = document.createElement('div');
    overlay.id = 'store-settings-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `<div style="background:#FFF8F0; border-radius:12px; max-width:450px; width:100%; max-height:90vh; overflow-y:auto; padding:1.5rem;">
        <h3 style="margin-bottom:1rem;"><i data-lucide="settings" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.store_settings','Store settings')}</h3>
        <div style="display:grid; gap:0.8rem;">
            <div>
                <label style="font-size:0.8rem; color:var(--accent);">${t('mall.store_name','Store name')}</label>
                <input type="text" id="store-set-name" value="${data.storeName || data.nickname || ''}" style="width:100%; padding:0.7rem; border:1px solid var(--border); border-radius:6px; box-sizing:border-box;">
            </div>
            <div>
                <label style="font-size:0.8rem; color:var(--accent);">${t('mall.store_description','Store description')}</label>
                <textarea id="store-set-desc" rows="3" style="width:100%; padding:0.7rem; border:1px solid var(--border); border-radius:6px; resize:vertical; box-sizing:border-box;">${data.storeDesc || ''}</textarea>
            </div>
            <div>
                <label style="font-size:0.8rem; color:var(--accent);">${t('mall.store_image','Store image')}</label>
                <input type="file" id="store-set-image" accept="image/*" style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:6px;">
            </div>
            <button onclick="saveStoreSettings()" style="background:#3D2B1F; color:#FFF8F0; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700;"><i data-lucide="save" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('common.save','Save')}</button>
            <button onclick="document.getElementById('store-settings-modal').remove()" style="background:#E8E0D8; border:none; padding:0.6rem; border-radius:8px; cursor:pointer;">${t('common.close','Close')}</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
}

async function saveStoreSettings() {
    if (!currentUser) return;
    try {
        const updateData = {
            storeName: document.getElementById('store-set-name').value.trim(),
            storeDesc: document.getElementById('store-set-desc').value.trim()
        };
        const imageFile = document.getElementById('store-set-image').files[0];
        if (imageFile) {
            updateData.storeImage = await fileToBase64Resized(imageFile, 400);
        }
        await _mpPost('/api/marketplace/store-settings', updateData);
        showToast(t('mall.store_settings_saved','Store settings saved!'), 'success');
        document.getElementById('store-settings-modal')?.remove();
        renderStorePage(currentUser.uid);
    } catch(e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

// ========== MY SHOP DASHBOARD ==========

async function loadMyShopDashboard() {
    const c = document.getElementById('my-shop-content');
    if (!c || !currentUser) { if(c) c.innerHTML = `<p style="text-align:center; color:var(--accent);">${t('common.login_required','Login required')}</p>`; return; }
    c.innerHTML = `<p style="text-align:center; color:var(--accent);">${t('common.loading','Loading...')}</p>`;
    try {
        // Load my products and orders from server
        const shopData = await _mpGet('/api/marketplace/store/' + currentUser.uid);
        const prodItems = shopData.products || [];
        const orderItems = shopData.orders || [];

        let totalRevenue = 0, monthlyRevenue = 0, totalOrders = 0;
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        orderItems.forEach(o => {
            totalRevenue += o.amount || 0;
            totalOrders++;
            const oDate = new Date(o.createdAt);
            if (oDate >= monthStart) monthlyRevenue += o.amount || 0;
        });

        // Products list
        let productsHtml = '';
        prodItems.forEach(p => {
            const remaining = p.stock - (p.sold || 0);
            const statusBadge = p.status === 'active' ? `<span style="color:#5B7B8C; font-size:0.7rem;">● ${t('mall.status_active','Active')}</span>` : `<span style="color:#6B5744; font-size:0.7rem;">● ${t('mall.status_inactive','Inactive')}</span>`;
            productsHtml += `<div style="padding:0.6rem; background:var(--bg); border-radius:8px; margin-bottom:0.4rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.3rem;">
                    <div><strong>${p.title}</strong> — ${p.price} CRGC · ${t('mall.sold','Sold')} ${p.sold||0}/${p.stock} · ${t('mall.stock','Stock')} ${remaining} ${statusBadge}</div>
                    <div style="display:flex; gap:0.3rem;">
                        <button onclick="editProductModal('${p.id}')" style="background:#5B7B8C; color:#FFF8F0; border:none; padding:0.25rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;"><i data-lucide="edit" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.edit','Edit')}</button>
                        <button onclick="toggleProduct('${p.id}','${p.status}')" style="background:${p.status==='active'?'#6B5744':'#5B7B8C'}; color:#FFF8F0; border:none; padding:0.25rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;">${p.status==='active'?'<i data-lucide="pause" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>':'▶'}</button>
                        <button onclick="deleteProduct('${p.id}')" style="background:#B54534; color:#FFF8F0; border:none; padding:0.25rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.75rem;"><i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>
                    </div>
                </div>
            </div>`;
        });

        // Orders list
        let ordersHtml = '';
        orderItems.forEach(o => {
            const statusLabel = ORDER_STATUS_LABELS[o.status] || o.status;
            const statusColor = ORDER_STATUS_COLORS[o.status] || 'var(--accent)';
            const nextActions = [];
            if (o.status === 'paid') nextActions.push(`<button onclick="updateOrderStatus('${o.id}','shipping')" style="background:#5B7B8C; color:#FFF8F0; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.7rem;"><i data-lucide="truck" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.ship','Ship')}</button>`);
            if (o.status === 'shipping') nextActions.push(`<button onclick="updateOrderStatus('${o.id}','delivered')" style="background:#5B7B8C; color:#FFF8F0; border:none; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.7rem;"><i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.complete','Complete')}</button>`);
            const shipInfo = o.shippingInfo ? `<div style="font-size:0.65rem; color:#6B5744;"><i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${o.shippingInfo.name} · ${o.shippingInfo.phone} · ${o.shippingInfo.address}</div>` : '';
            ordersHtml += `<div style="padding:0.5rem; background:var(--bg); border-radius:6px; margin-bottom:0.3rem; font-size:0.8rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.2rem;">
                    <div><strong>${o.productTitle}</strong> — ${o.amount} ${o.token}<br><span style="font-size:0.7rem; color:var(--accent);">${o.buyerEmail}</span>${shipInfo}</div>
                    <div style="display:flex; align-items:center; gap:0.2rem;">
                        <span style="color:${statusColor}; font-weight:600; font-size:0.75rem;">${statusLabel}</span>
                        ${nextActions.join('')}
                    </div>
                </div>
            </div>`;
        });

        c.innerHTML = `
            <button onclick="showPage('mall')" style="background:none; border:none; font-size:1rem; cursor:pointer; margin-bottom:0.8rem; color:var(--accent);">← ${t('mall.back_to_mall','Mall')}</button>
            <h2 style="margin-bottom:1rem;"><i data-lucide="store" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.my_shop','My shop')}</h2>
            
            <!-- 매출 통계 -->
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.8rem; margin-bottom:1.5rem;">
                <div style="background:linear-gradient(135deg,#8B6914,#6B5744); color:#FFF8F0; padding:1rem; border-radius:12px; text-align:center;">
                    <div style="font-size:0.7rem; opacity:0.8;">${t('mall.total_revenue','Total revenue')}</div>
                    <div style="font-size:1.3rem; font-weight:700;">${totalRevenue} CRGC</div>
                </div>
                <div style="background:linear-gradient(135deg,#8B6914,#6B5744); color:#FFF8F0; padding:1rem; border-radius:12px; text-align:center;">
                    <div style="font-size:0.7rem; opacity:0.8;">${t('mall.this_month','This month')}</div>
                    <div style="font-size:1.3rem; font-weight:700;">${monthlyRevenue} CRGC</div>
                </div>
                <div style="background:linear-gradient(135deg,#8B6914,#6B5744); color:#FFF8F0; padding:1rem; border-radius:12px; text-align:center;">
                    <div style="font-size:0.7rem; opacity:0.8;">${t('mall.total_orders','Total orders')}</div>
                    <div style="font-size:1.3rem; font-weight:700;">${totalOrders}${t('common.count_items','')}</div>
                </div>
            </div>
            
            <div style="display:flex; gap:0.5rem; margin-bottom:1rem;">
                <button onclick="viewStore('${currentUser.uid}')" style="background:#3D2B1F; color:#FFF8F0; border:none; padding:0.5rem 1rem; border-radius:8px; cursor:pointer; font-size:0.85rem;"><i data-lucide="store" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.view_my_store','View my store')}</button>
                <button onclick="showStoreSettingsModal()" style="background:#C4841D; color:#FFF8F0; border:none; padding:0.5rem 1rem; border-radius:8px; cursor:pointer; font-size:0.85rem;"><i data-lucide="settings" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.store_settings','Store settings')}</button>
            </div>
            
            <!-- 내 상품 -->
            <div style="background:#FFF8F0; padding:1.2rem; border-radius:12px; margin-bottom:1rem;">
                <h3 style="margin-bottom:0.8rem;"><i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.my_products','My products')} (${prodItems.length})</h3>
                ${productsHtml || `<p style="color:var(--accent); font-size:0.85rem;">${t('mall.no_products','No products registered')}</p>`}
            </div>
            
            <!-- 받은 주문 -->
            <div style="background:#FFF8F0; padding:1.2rem; border-radius:12px;">
                <h3 style="margin-bottom:0.8rem;"><i data-lucide="inbox" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> ${t('mall.received_orders','Received orders')} (${totalOrders})</h3>
                ${ordersHtml || `<p style="color:var(--accent); font-size:0.85rem;">${t('mall.no_orders_received','No orders received')}</p>`}
            </div>`;
    } catch(e) { c.innerHTML = `<p style="color:red; text-align:center;">${e.message}</p>`; }
}

// ========== PRODUCT EDIT MODAL (Enhanced) ==========

async function editProductModal(id) {
    const pData = await _mpGet('/api/marketplace/products/' + id);
    const p = pData.item;
    if (!p) return;

    const overlay = document.createElement('div');
    overlay.id = 'edit-product-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const images = (p.images && p.images.length > 0) ? p.images : (p.imageData ? [p.imageData] : []);
    const imgPreview = images.map((img, i) => `<img src="${img}" style="width:50px; height:50px; object-fit:cover; border-radius:4px; border:${i===0?'2px solid #3D2B1F':'1px solid #E8E0D8'};">`).join('');

    overlay.innerHTML = `<div style="background:#FFF8F0; border-radius:12px; max-width:450px; width:100%; max-height:90vh; overflow-y:auto; padding:1.5rem;">
        <h3 style="margin-bottom:1rem;"><i data-lucide="edit" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.edit_product','Edit product')}</h3>
        <div style="display:grid; gap:0.8rem;">
            <div>
                <label style="font-size:0.8rem; color:var(--accent);">${t('mall.product_name','Product name')}</label>
                <input type="text" id="ep-title" value="${p.title}" style="width:100%; padding:0.7rem; border:1px solid var(--border); border-radius:6px; box-sizing:border-box;">
            </div>
            <div>
                <label style="font-size:0.8rem; color:var(--accent);">${t('mall.description','Description')}</label>
                <textarea id="ep-desc" rows="3" style="width:100%; padding:0.7rem; border:1px solid var(--border); border-radius:6px; resize:vertical; box-sizing:border-box;">${p.description || ''}</textarea>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
                <div>
                    <label style="font-size:0.8rem; color:var(--accent);">${t('mall.price','Price')} (CRGC)</label>
                    <input type="number" id="ep-price" value="${p.price}" style="width:100%; padding:0.7rem; border:1px solid var(--border); border-radius:6px; box-sizing:border-box;">
                </div>
                <div>
                    <label style="font-size:0.8rem; color:var(--accent);">${t('mall.stock','Stock')}</label>
                    <input type="number" id="ep-stock" value="${p.stock}" style="width:100%; padding:0.7rem; border:1px solid var(--border); border-radius:6px; box-sizing:border-box;">
                </div>
            </div>
            <div>
                <label style="font-size:0.8rem; color:var(--accent);">${t('mall.current_images','Current images')}</label>
                <div style="display:flex; gap:0.3rem; margin-top:0.3rem;">${imgPreview || '<span style="color:var(--accent); font-size:0.85rem;">' + t('common.none','None') + '</span>'}</div>
            </div>
            <div>
                <label style="font-size:0.8rem; color:var(--accent);">${t('mall.new_images','New images (max 5, replaces current)')}</label>
                <input type="file" id="ep-images" accept="image/*" multiple style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:6px;">
            </div>
            <button onclick="saveEditProduct('${id}')" style="background:#3D2B1F; color:#FFF8F0; border:none; padding:0.8rem; border-radius:8px; cursor:pointer; font-weight:700;"><i data-lucide="save" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('common.save','Save')}</button>
            <button onclick="document.getElementById('edit-product-modal').remove()" style="background:#E8E0D8; border:none; padding:0.6rem; border-radius:8px; cursor:pointer;">${t('common.close','Close')}</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
}

async function saveEditProduct(id) {
    try {
        const parsedPrice = parseFloat(document.getElementById('ep-price').value);
        const parsedStock = parseInt(document.getElementById('ep-stock').value);
        if (!parsedPrice || parsedPrice <= 0 || !Number.isFinite(parsedPrice)) { showToast(t('mall.price_must_positive','Price must be greater than 0'), 'warning'); return; }
        if (parsedStock < 0 || !Number.isFinite(parsedStock)) { showToast(t('mall.stock_must_positive','Stock must be 0 or more'), 'warning'); return; }
        const updateData = {
            title: document.getElementById('ep-title').value.trim(),
            price: parsedPrice,
            stock: parsedStock,
            description: document.getElementById('ep-desc').value.trim()
        };
        const imageFiles = document.getElementById('ep-images').files;
        if (imageFiles && imageFiles.length > 0) {
            const images = [];
            for (let i = 0; i < Math.min(imageFiles.length, 5); i++) {
                images.push(await fileToBase64Resized(imageFiles[i], 400));
            }
            updateData.images = images;
            updateData.imageData = images[0];
        }
        await _mpPatch('/api/marketplace/products/' + id, updateData);
        showToast(t('mall.edit_done','<i data-lucide="edit" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Product updated'), 'success');
        document.getElementById('edit-product-modal')?.remove();
        if (typeof loadMyShopDashboard === 'function') loadMyShopDashboard();
        loadMallProducts();
    } catch(e) { showToast(t('mall.edit_fail','Edit failed') + ': ' + e.message, 'error'); }
}

// ========== SHIPPING INFO MODAL ==========

async function showShippingModal() {
    // Try to load last used address
    let lastAddr = {};
    if (currentUser) {
        try {
            const addrRes = await _mpGet('/api/marketplace/addresses');
            const addrs = addrRes.items || addrRes;
            if (addrs.length > 0) lastAddr = addrs[0];
        } catch(e) { console.warn("[catch]", e); }
    }

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.innerHTML = `
            <div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;max-width:420px;width:100%;max-height:90vh;overflow-y:auto;">
                <h3 style="margin-bottom:1rem;"><i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.shipping_info','Shipping information')}</h3>
                <div style="display:grid; gap:0.7rem;">
                    <input type="text" id="ship-name" placeholder="${t('mall.recipient_name','Recipient name')}" value="${lastAddr.name||''}" style="padding:0.7rem; border:1px solid var(--border); border-radius:6px;">
                    <input type="tel" id="ship-phone" placeholder="${t('mall.phone_number','Phone number')}" value="${lastAddr.phone||''}" style="padding:0.7rem; border:1px solid var(--border); border-radius:6px;">
                    <input type="text" id="ship-address" placeholder="${t('mall.shipping_address','Shipping address')}" value="${lastAddr.address||''}" style="padding:0.7rem; border:1px solid var(--border); border-radius:6px;">
                    <input type="text" id="ship-memo" placeholder="${t('mall.shipping_memo','Delivery memo (optional)')}" value="${lastAddr.memo||''}" style="padding:0.7rem; border:1px solid var(--border); border-radius:6px;">
                    <label style="font-size:0.8rem; display:flex; align-items:center; gap:0.3rem; color:var(--accent);">
                        <input type="checkbox" id="ship-save" checked> ${t('mall.save_address','Save this address')}
                    </label>
                </div>
                <div style="display:flex; gap:0.5rem; margin-top:1rem;">
                    <button id="ship-cancel" style="flex:1; padding:0.7rem; border:1px solid #E8E0D8; border-radius:8px; cursor:pointer; background:#FFF8F0;">${t('common.cancel','Cancel')}</button>
                    <button id="ship-ok" style="flex:1; padding:0.7rem; border:none; border-radius:8px; cursor:pointer; background:#3D2B1F; color:#FFF8F0; font-weight:700;">${t('common.confirm','Confirm')}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        overlay.querySelector('#ship-cancel').onclick = () => { document.body.removeChild(overlay); resolve(null); };
        overlay.querySelector('#ship-ok').onclick = async () => {
            const name = document.getElementById('ship-name').value.trim();
            const phone = document.getElementById('ship-phone').value.trim();
            const address = document.getElementById('ship-address').value.trim();
            const memo = document.getElementById('ship-memo').value.trim();
            if (!name || !phone || !address) { showToast(t('mall.enter_shipping','Please enter name, phone, and address'), 'warning'); return; }
            const info = { name, phone, address, memo };
            // Save address if checked
            if (document.getElementById('ship-save').checked && currentUser) {
                try {
                    await _mpPost('/api/marketplace/addresses', info);
                } catch(e) { console.warn("[catch]", e); }
            }
            document.body.removeChild(overlay);
            resolve(info);
        };
        overlay.onclick = (e) => { if (e.target === overlay) { document.body.removeChild(overlay); resolve(null); } };
    });
}

// ========== PRODUCT IMAGE PREVIEW (registration modal) ==========

document.addEventListener('DOMContentLoaded', () => {
    const imgInput = document.getElementById('product-image');
    if (imgInput) {
        imgInput.addEventListener('change', function() {
            const preview = document.getElementById('product-image-preview');
            if (!preview) return;
            preview.innerHTML = '';
            const files = this.files;
            if (files.length > 5) { showToast(t('mall.max_images','Maximum 5 images allowed'), 'warning'); this.value = ''; return; }
            for (let i = 0; i < Math.min(files.length, 5); i++) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    preview.innerHTML += `<div style="width:50px; height:50px; border-radius:6px; overflow:hidden; border:${i===0?'2px solid #3D2B1F':'1px solid #E8E0D8'};">
                        <img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover;">
                    </div>`;
                };
                reader.readAsDataURL(files[i]);
            }
        });
    }
});

// ========== HELPFUL REVIEW ==========

async function helpfulReview(reviewId) {
    if (!currentUser) { showToast(t('common.login_required','Login required'),'warning'); return; }
    try {
        await _mpPost('/api/marketplace/reviews/' + reviewId + '/helpful', {});
        showToast(`<i data-lucide="thumbs-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('common.thanks','Thank you!')}`,'success');
    } catch(e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

// ========== BUYER ORDERS PAGE ==========

async function loadBuyerOrders() {
    const c = document.getElementById('buyer-orders-content');
    if (!c || !currentUser) return;
    c.innerHTML = `<p style="text-align:center; color:var(--accent); padding:2rem;">${t('common.loading','Loading...')}</p>`;
    try {
        const ordRes = await _mpGet('/api/marketplace/orders?buyerId=' + currentUser.uid);
        const orders = ordRes.items || ordRes;
        if (orders.length === 0) {
            c.innerHTML = `<button onclick="showPage('mall')" style="background:none;border:none;font-size:1rem;cursor:pointer;margin-bottom:0.8rem;color:var(--accent);">← ${t('mall.back_to_mall','Mall')}</button>
                <div style="text-align:center;padding:3rem;color:var(--accent);"><div style="font-size:3rem;margin-bottom:1rem;"><i data-lucide="clipboard-list" style="width:48px;height:48px;"></i></div><p>${t('mall.no_orders','No orders yet')}</p></div>`;
            return;
        }
        let listHtml = '';
        orders.forEach(o => {
            const statusLabel = ORDER_STATUS_LABELS[o.status] || o.status;
            const statusColor = ORDER_STATUS_COLORS[o.status] || 'var(--accent)';
            const thumb = o.productImage || '';
            const dateStr = o.createdAt ? new Date(o.createdAt).toLocaleDateString('ko-KR') : '';
            listHtml += `<div onclick="showOrderDetail('${o.id}')" style="background:#FFF8F0;padding:0.8rem;border-radius:10px;margin-bottom:0.6rem;display:flex;gap:0.8rem;align-items:center;box-shadow:0 1px 4px rgba(0,0,0,0.06);cursor:pointer;">
                <div style="width:60px;height:60px;border-radius:8px;overflow:hidden;flex-shrink:0;background:#F7F3ED;display:flex;align-items:center;justify-content:center;">
                    ${thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;">` : '<span style="font-size:1.5rem;color:#E8E0D8;"><i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></span>'}
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${o.productTitle}</div>
                    <div style="font-size:0.75rem;color:var(--accent);">${dateStr} · ${o.qty||1}${t('common.count_items','')}</div>
                    <div style="font-weight:700;color:#3D2B1F;font-size:0.85rem;">${o.amount} CRGC</div>
                </div>
                <span style="background:${statusColor}15;color:${statusColor};font-size:0.75rem;font-weight:700;padding:0.3rem 0.6rem;border-radius:12px;white-space:nowrap;">${statusLabel}</span>
            </div>`;
        });
        c.innerHTML = `
            <button onclick="showPage('mall')" style="background:none;border:none;font-size:1rem;cursor:pointer;margin-bottom:0.8rem;color:var(--accent);">← ${t('mall.back_to_mall','Mall')}</button>
            <h2 style="margin-bottom:1rem;"><i data-lucide="clipboard-list" style="width:18px;height:18px;display:inline-block;vertical-align:middle;"></i> ${t('mall.my_orders','My orders')}</h2>
            ${listHtml}`;
    } catch(e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

async function showOrderDetail(orderId) {
    try {
        const o = await _mpGet('/api/marketplace/orders/' + orderId);
        if (!o) return;
        const statusLabel = ORDER_STATUS_LABELS[o.status] || o.status;
        const statusColor = ORDER_STATUS_COLORS[o.status] || 'var(--accent)';

        // Timeline
        const steps = ['paid','shipping','delivered'];
        const stepLabels = {paid:`<i data-lucide="coins" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.step_paid','Paid')}`, shipping:`<i data-lucide="truck" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.step_shipping','Shipping')}`, delivered:`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.step_delivered','Delivered')}`};
        const history = o.statusHistory || [{status:'paid', at: o.createdAt?.toDate ? o.createdAt.toDate().toISOString() : new Date().toISOString()}];
        const historyMap = {};
        history.forEach(h => { historyMap[h.status] = h.at; });
        const currentIdx = steps.indexOf(o.status);

        let timelineHtml = '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin:1.5rem 0;position:relative;">';
        // Connector line
        timelineHtml += `<div style="position:absolute;top:14px;left:16%;right:16%;height:3px;background:#e0e0e0;z-index:0;">
            <div style="width:${currentIdx >= 2 ? 100 : currentIdx === 1 ? 50 : 0}%;height:100%;background:#5B7B8C;transition:width 0.3s;"></div>
        </div>`;
        steps.forEach((step, i) => {
            const done = i <= currentIdx;
            const ts = historyMap[step];
            const dateStr = ts ? new Date(ts).toLocaleString('ko-KR', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
            timelineHtml += `<div style="text-align:center;flex:1;z-index:1;">
                <div style="width:28px;height:28px;border-radius:50%;margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:0.8rem;
                    background:${done ? '#5B7B8C' : '#e0e0e0'};color:${done ? 'white' : '#6B5744'};">${done ? '✓' : i+1}</div>
                <div style="font-size:0.7rem;font-weight:600;margin-top:0.3rem;color:${done ? '#333' : '#6B5744'};">${stepLabels[step]}</div>
                <div style="font-size:0.6rem;color:var(--accent);">${dateStr}</div>
            </div>`;
        });
        timelineHtml += '</div>';

        // Tracking number
        const trackingHtml = o.trackingNumber ? `<div style="background:#F7F3ED;padding:0.6rem;border-radius:8px;margin-bottom:1rem;font-size:0.85rem;"><i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.tracking_number','Tracking number')}: <strong>${o.trackingNumber}</strong></div>` : '';

        // Return status check
        let returnHtml = '';
        const retRes2 = await _mpGet('/api/marketplace/returns?orderId=' + orderId);
        const returnsList = retRes2.items || retRes2;
        const hasReturn = returnsList.length > 0;
        if (hasReturn) {
            const ret = returnsList[0];
            const retStatus = {requested:'<i data-lucide="hourglass" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('mall.return_requested','Return requested'),approved:'<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('mall.return_approved_label','Return approved'),rejected:'<i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('mall.return_rejected_label','Return rejected'),completed:'<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('mall.refund_complete','Refund complete')};
            const retColor = {requested:'#C4841D',approved:'#5B7B8C',rejected:'#B54534',completed:'#5B7B8C'};
            returnHtml = `<div style="background:${retColor[ret.status]}15;border-left:4px solid ${retColor[ret.status]};padding:0.8rem;border-radius:0 8px 8px 0;margin-bottom:1rem;">
                <div style="font-weight:700;color:${retColor[ret.status]};">${retStatus[ret.status] || ret.status}</div>
                <div style="font-size:0.8rem;color:#6B5744;margin-top:0.2rem;">${t('mall.reason','Reason')}: ${ret.reasonCategory} — ${ret.reasonDetail||''}</div>
            </div>`;
        }

        // Return button (delivered within 7 days, no existing return)
        let returnBtnHtml = '';
        if (o.status === 'delivered' && !hasReturn) {
            const deliveredAt = o.deliveredAt?.toDate ? o.deliveredAt.toDate() : (historyMap.delivered ? new Date(historyMap.delivered) : null);
            if (deliveredAt && (Date.now() - deliveredAt.getTime()) < 7 * 86400000) {
                returnBtnHtml = `<button onclick="requestReturn('${orderId}')" style="background:#B54534;color:#FFF8F0;border:none;padding:0.7rem;border-radius:8px;cursor:pointer;font-weight:600;width:100%;margin-bottom:0.5rem;"><i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.request_return','Request return/refund')}</button>`;
            }
        }

        // Review button
        let reviewBtnHtml = '';
        if (o.status === 'delivered') {
            const revRes = await _mpGet('/api/marketplace/reviews?productId=' + o.productId + '&buyerId=' + currentUser.uid);
            const existingReviews = revRes.items || revRes;
            if (existingReviews.length === 0) {
                reviewBtnHtml = `<button onclick="writeReview('${o.productId}')" style="background:#C4841D;color:#FFF8F0;border:none;padding:0.7rem;border-radius:8px;cursor:pointer;font-weight:600;width:100%;margin-bottom:0.5rem;"><i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.write_review','Write review')}</button>`;
            }
        }

        const overlay = document.createElement('div');
        overlay.id = 'order-detail-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        overlay.innerHTML = `<div style="background:#FFF8F0;border-radius:12px;max-width:500px;width:100%;max-height:90vh;overflow-y:auto;padding:1.5rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <h3 style="margin:0;">${t('mall.order_detail','Order detail')}</h3>
                <button onclick="document.getElementById('order-detail-modal').remove()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;">✕</button>
            </div>
            <div style="display:flex;gap:1rem;align-items:center;margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid #E8E0D8;">
                <div style="width:70px;height:70px;border-radius:8px;overflow:hidden;background:#F7F3ED;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
                    ${o.productImage ? `<img src="${o.productImage}" style="width:100%;height:100%;object-fit:cover;">` : '<span style="font-size:2rem;color:#E8E0D8;"><i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></span>'}
                </div>
                <div>
                    <div style="font-weight:700;font-size:1rem;">${o.productTitle}</div>
                    <div style="font-size:0.85rem;color:var(--accent);">${o.qty||1}${t('common.count_items','')} · ${o.amount} CRGC</div>
                    <span style="background:${statusColor}15;color:${statusColor};font-size:0.75rem;font-weight:700;padding:0.2rem 0.5rem;border-radius:8px;">${statusLabel}</span>
                </div>
            </div>
            ${timelineHtml}
            ${trackingHtml}
            ${returnHtml}
            ${o.shippingInfo ? `<div style="background:var(--bg);padding:0.8rem;border-radius:8px;margin-bottom:1rem;font-size:0.85rem;">
                <div style="font-weight:600;margin-bottom:0.3rem;"><i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.shipping_address','Shipping address')}</div>
                <div>${o.shippingInfo.name} · ${o.shippingInfo.phone}</div>
                <div>${o.shippingInfo.address}</div>
                ${o.shippingInfo.memo ? `<div style="color:var(--accent);">${t('mall.memo','Memo')}: ${o.shippingInfo.memo}</div>` : ''}
            </div>` : ''}
            ${returnBtnHtml}
            ${reviewBtnHtml}
            <button onclick="viewProduct('${o.productId}'); document.getElementById('order-detail-modal').remove();" style="background:#3D2B1F;color:#FFF8F0;border:none;padding:0.7rem;border-radius:8px;cursor:pointer;width:100%;font-weight:600;"><i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.view_product','View product')}</button>
        </div>`;
        document.body.appendChild(overlay);
    } catch(e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

// ========== RETURN / REFUND SYSTEM ==========

async function requestReturn(orderId) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(); } };
        overlay.innerHTML = `<div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;max-width:420px;width:100%;">
            <h3 style="margin-bottom:1rem;"><i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.request_return','Request return/refund')}</h3>
            <div style="display:grid;gap:0.8rem;">
                <div>
                    <label style="font-size:0.8rem;color:var(--accent);">${t('mall.return_reason','Return reason')}</label>
                    <select id="return-reason" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:6px;">
                        ${RETURN_REASONS.map(r => `<option value="${r}">${r}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--accent);">${t('mall.detail_reason','Detail reason')}</label>
                    <textarea id="return-detail" rows="3" placeholder="${t('mall.enter_detail_reason','Please enter the detailed reason...')}" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:6px;resize:vertical;box-sizing:border-box;"></textarea>
                </div>
                <div style="display:flex;gap:0.5rem;">
                    <button onclick="this.closest('div[style]').parentElement.parentElement.remove()" style="flex:1;padding:0.7rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#FFF8F0;">${t('common.cancel','Cancel')}</button>
                    <button id="return-submit" style="flex:1;padding:0.7rem;border:none;border-radius:8px;cursor:pointer;background:#B54534;color:#FFF8F0;font-weight:700;">${t('common.submit','Submit')}</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(overlay);

        overlay.querySelector('#return-submit').onclick = async () => {
            const reasonCategory = overlay.querySelector('#return-reason').value;
            const reasonDetail = overlay.querySelector('#return-detail').value.trim();
            if (!reasonDetail) { showToast(t('mall.enter_reason','Please enter a reason'),'warning'); return; }
            try {
                await _mpPost('/api/marketplace/returns', { orderId, reasonCategory, reasonDetail });
                showToast(`<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.return_submitted','Return request submitted')}`,'success');
                overlay.remove();
                document.getElementById('order-detail-modal')?.remove();
                loadBuyerOrders();
                resolve();
            } catch(e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
        };
    });
}

// Seller: handle returns in loadSellerOrders and loadMyShopDashboard
async function loadSellerReturns() {
    if (!currentUser) return;
    try {
        const retRes = await _mpGet('/api/marketplace/returns?sellerId=' + currentUser.uid + '&status=requested');
        const returns = retRes.items || retRes;
        if (returns.length === 0) return '';
        let html = '<div style="margin-top:1rem;"><h4 style="color:#B54534;margin-bottom:0.5rem;"><i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('mall.return_requests','Return requests') + ' ('+returns.length+')</h4>';
        returns.forEach(r => {
            const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString('ko-KR') : '';
            html += `<div style="background:#F7F3ED;padding:0.8rem;border-radius:8px;margin-bottom:0.5rem;border-left:4px solid #C4841D;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div><strong>${r.productTitle}</strong> — ${r.amount} ${r.token}</div>
                    <span style="font-size:0.75rem;color:var(--accent);">${dateStr}</span>
                </div>
                <div style="font-size:0.8rem;color:#6B5744;margin:0.3rem 0;">${r.buyerEmail} · ${r.reasonCategory}: ${r.reasonDetail||''}</div>
                <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                    <button onclick="approveReturn('${r.id}')" style="flex:1;background:#5B7B8C;color:#FFF8F0;border:none;padding:0.4rem;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.8rem;"><i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.approve_refund','Approve (refund)')}</button>
                    <button onclick="rejectReturn('${r.id}')" style="flex:1;background:#B54534;color:#FFF8F0;border:none;padding:0.4rem;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.8rem;"><i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.reject','Reject')}</button>
                </div>
            </div>`;
        });
        html += '</div>';
        return html;
    } catch(e) { return ''; }
}

async function approveReturn(returnId) {
    if (!await showConfirmModal(t('mall.approve_return','Approve Return'),t('mall.confirm_refund','Approve return and process refund?'))) return;
    try {
        await _mpPost('/api/marketplace/returns/' + returnId + '/approve', {});
        showToast(`<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.return_approved','Return approved and refund completed')}`,'success');
        loadSellerOrders();
    } catch(e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

async function rejectReturn(returnId) {
    const reason = await showPromptModal(t('mall.reject_reason','Rejection Reason'),t('mall.enter_reject_reason','Enter reason for rejection'),'');
    if (!reason) return;
    try {
        await _mpPost('/api/marketplace/returns/' + returnId + '/reject', { reason });
        showToast(t('mall.return_rejected','Return request rejected'),'info');
        loadSellerOrders();
    } catch(e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
}

// ========== BRAND LANDING PAGE ==========

function filterMallBrandLanding(brand) {
    if (!brand) { showPage('mall'); filterMallBrand(null); return; }
    history.replaceState(null, '', `#page=brand-landing&brand=${brand}`);
    showPage('brand-landing');
    renderBrandLanding(brand);
}

async function renderBrandLanding(brand) {
    const c = document.getElementById('brand-landing-content');
    if (!c) return;
    c.innerHTML = `<p style="text-align:center;color:var(--accent);padding:2rem;">${t('common.loading','Loading...')}</p>`;
    try {
        const brandName = MALL_CATEGORIES[brand] || brand;
        const slogan = BRAND_SLOGANS[brand] || '';
        const bgColor = BRAND_COLORS[brand] || '#F7F3ED';
        const icon = BRAND_ICONS[brand] || '<i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>';

        // Fetch all products in this category
        const prodRes = await _mpGet('/api/marketplace/products?status=active&category=' + encodeURIComponent(brand));
        const items = prodRes.items || [];

        // Popular (top 4 by sold)
        const popular = [...items].sort((a,b) => (b.sold||0)-(a.sold||0)).slice(0,4);
        // New (latest 4)
        const newest = items.slice(0,4);

        const renderCard = (p) => {
            const thumb = getProductThumb(p);
            return `<div onclick="viewProduct('${p.id}')" style="background:#FFF8F0;border-radius:10px;overflow:hidden;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.08);min-width:150px;flex-shrink:0;width:160px;">
                <div style="height:130px;overflow:hidden;background:#F7F3ED;">${thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;color:#E8E0D8;"><i data-lucide="shopping-cart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></div>`}</div>
                <div style="padding:0.5rem;">
                    <div style="font-weight:600;font-size:0.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.title}</div>
                    <div style="font-weight:700;color:#3D2B1F;font-size:0.85rem;">${p.price} CRGC</div>
                    ${p.avgRating ? `<div>${renderStars(p.avgRating,'0.65rem')}</div>` : ''}
                </div>
            </div>`;
        };

        const horizontalScroll = (items) => items.length > 0
            ? `<div style="display:flex;gap:0.8rem;overflow-x:auto;padding-bottom:0.5rem;scrollbar-width:none;">${items.map(renderCard).join('')}</div>`
            : `<p style="color:var(--accent);font-size:0.85rem;">${t('mall.no_products','No products registered')}</p>`;

        const gridHtml = items.length > 0
            ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:0.8rem;">${items.map(renderCard).join('')}</div>`
            : `<p style="color:var(--accent);text-align:center;">${t('mall.no_products','No products registered')}</p>`;

        c.innerHTML = `
            <button onclick="showPage('mall')" style="background:none;border:none;font-size:1rem;cursor:pointer;margin-bottom:0.8rem;color:var(--accent);">← ${t('mall.all_mall','All Mall')}</button>
            <!-- Banner -->
            <div style="background:${bgColor};padding:2rem 1.5rem;border-radius:16px;text-align:center;margin-bottom:1.5rem;position:relative;overflow:hidden;">
                <div style="font-size:3rem;margin-bottom:0.5rem;">${icon}</div>
                <h2 style="margin:0;font-size:1.5rem;">${brandName}</h2>
                <p style="color:#6B5744;font-size:0.95rem;margin-top:0.3rem;font-style:italic;">"${slogan}"</p>
                <div style="font-size:0.8rem;color:var(--accent);margin-top:0.5rem;">${items.length} ${t('mall.products','Products')}</div>
            </div>
            <!-- Popular -->
            ${popular.length > 0 ? `<div style="margin-bottom:1.5rem;">
                <h3 style="margin-bottom:0.8rem;"><i data-lucide="flame" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.popular_products','Popular products')}</h3>
                ${horizontalScroll(popular)}
            </div>` : ''}
            <!-- New -->
            ${newest.length > 0 ? `<div style="margin-bottom:1.5rem;">
                <h3 style="margin-bottom:0.8rem;">🆕 ${t('mall.new_products','New products')}</h3>
                ${horizontalScroll(newest)}
            </div>` : ''}
            <!-- All -->
            <h3 style="margin-bottom:0.8rem;"><i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.all_products','All products')}</h3>
            ${gridHtml}`;
    } catch(e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

// ========== 신고 시스템 ==========

async function reportProduct(productId) {
    if (!currentUser) { showToast(t('common.login_required','Login required'), 'warning'); return; }
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99998;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(); } };
        overlay.innerHTML = `<div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;max-width:400px;width:100%;">
            <h3 style="margin-bottom:1rem;"><i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.report_product','Report product')}</h3>
            <div style="display:grid;gap:0.8rem;">
                <select id="report-reason" style="padding:0.7rem;border:1px solid var(--border);border-radius:6px;">
                    <option value="fake">${t('mall.report_fake','Fake product')}</option>
                    <option value="inappropriate">${t('mall.report_inappropriate','Inappropriate')}</option>
                    <option value="scam">${t('mall.report_scam','Suspected scam')}</option>
                    <option value="other">${t('mall.report_other','Other')}</option>
                </select>
                <textarea id="report-detail" rows="3" placeholder="${t('mall.report_detail_placeholder','Details (optional)')}" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:6px;resize:vertical;box-sizing:border-box;"></textarea>
                <div style="display:flex;gap:0.5rem;">
                    <button onclick="this.closest('div[style*=fixed]').remove()" style="flex:1;padding:0.7rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#FFF8F0;">${t('common.cancel','Cancel')}</button>
                    <button id="report-submit-btn" style="flex:1;padding:0.7rem;border:none;border-radius:8px;cursor:pointer;background:#B54534;color:#FFF8F0;font-weight:700;">${t('mall.report','Report')}</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#report-submit-btn').onclick = async () => {
            try {
                await _mpPost('/api/marketplace/reports', {
                    targetType: 'product', targetId: productId,
                    reason: overlay.querySelector('#report-reason').value,
                    detail: overlay.querySelector('#report-detail').value.trim()
                });
                showToast(`<i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('mall.report_submitted','<i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Report submitted')}`, 'success');
                overlay.remove(); resolve();
            } catch(e) { showToast(t('common.fail','Failed') + ': ' + e.message, 'error'); }
        };
    });
}

// ========== 범용 신고 시스템 (리뷰/판매자) ==========

async function reportReview(reviewId) {
    if (!currentUser) { showToast(t('mall.login_required','Login required'), 'warning'); return; }
    return _showReportModal('review', reviewId, t('mall.report_review','Report Review'));
}

async function reportSeller(sellerId) {
    if (!currentUser) { showToast(t('mall.login_required','Login required'), 'warning'); return; }
    return _showReportModal('seller', sellerId, t('mall.report_seller','Report Seller'));
}

function _showReportModal(targetType, targetId, title) {
    return new Promise((resolve) => {
        const REASONS = { product: {fake:t('mall.report_fake','Fake Product'),inappropriate:t('mall.report_inappropriate','Inappropriate'),scam:t('mall.report_scam','Suspected Scam'),other:t('mall.report_other','Other')}, review: {fake:t('mall.report_fake_review','Fake Review'),inappropriate:t('mall.report_inappropriate','Inappropriate'),spam:t('mall.report_spam','Spam'),other:t('mall.report_other','Other')}, seller: {fraud:t('mall.report_fraud','Fraud'),inappropriate:t('mall.report_inappropriate','Inappropriate'),nondelivery:t('mall.report_nondelivery','Non-delivery'),other:t('mall.report_other','Other')} };
        const reasons = REASONS[targetType] || REASONS.product;
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99998;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(); } };
        overlay.innerHTML = `<div style="background:#FFF8F0;padding:1.5rem;border-radius:12px;max-width:400px;width:100%;">
            <h3 style="margin-bottom:1rem;"><i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${title}</h3>
            <div style="display:grid;gap:0.8rem;">
                <select id="report-reason-gen" style="padding:0.7rem;border:1px solid var(--border);border-radius:6px;">
                    ${Object.entries(reasons).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
                </select>
                <textarea id="report-detail-gen" rows="3" placeholder="${t('mall.report_detail_placeholder','Details (optional)')}" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:6px;resize:vertical;box-sizing:border-box;"></textarea>
                <div style="display:flex;gap:0.5rem;">
                    <button onclick="this.closest('div[style*=fixed]').remove()" style="flex:1;padding:0.7rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#FFF8F0;">${t('common.cancel','Cancel')}</button>
                    <button id="report-submit-gen" style="flex:1;padding:0.7rem;border:none;border-radius:8px;cursor:pointer;background:#B54534;color:#FFF8F0;font-weight:700;">${t('mall.report_submit','Report')}</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#report-submit-gen').onclick = async () => {
            try {
                await _mpPost('/api/marketplace/reports', {
                    targetType, targetId,
                    reason: overlay.querySelector('#report-reason-gen').value,
                    detail: overlay.querySelector('#report-detail-gen').value.trim()
                });
                showToast(t('mall.report_submitted','<i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Report submitted'), 'success');
                overlay.remove(); resolve();
            } catch(e) { showToast(t('mall.report_failed','Report failed') + ': ' + e.message, 'error'); }
        };
    });
}

// ========== 검색 고도화 ==========

let _mallSearchDebounce = null;

function initMallSearch() {
    const searchInput = document.getElementById('mall-search');
    if (!searchInput || searchInput._mallSearchInit) return;
    searchInput._mallSearchInit = true;
    
    // 자동완성 드롭다운 컨테이너
    let acContainer = document.getElementById('mall-autocomplete');
    if (!acContainer) {
        acContainer = document.createElement('div');
        acContainer.id = 'mall-autocomplete';
        acContainer.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:#FFF8F0;border:1px solid #E8E0D8;border-radius:0 0 8px 8px;max-height:200px;overflow-y:auto;display:none;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,0.1);';
        searchInput.parentElement.style.position = 'relative';
        searchInput.parentElement.appendChild(acContainer);
    }
    
    searchInput.addEventListener('input', () => {
        clearTimeout(_mallSearchDebounce);
        _mallSearchDebounce = setTimeout(() => mallAutocomplete(searchInput.value.trim()), 300);
    });
    
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            acContainer.style.display = 'none';
            saveMallRecentSearch(searchInput.value.trim());
            loadMallProducts();
        }
    });
    
    searchInput.addEventListener('focus', () => {
        if (!searchInput.value.trim()) showMallRecentSearches();
    });
    
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !acContainer.contains(e.target)) {
            acContainer.style.display = 'none';
        }
    });
}

async function mallAutocomplete(query) {
    const ac = document.getElementById('mall-autocomplete');
    if (!ac) return;
    if (!query || query.length < 1) { showMallRecentSearches(); return; }
    
    try {
        const prodRes2 = await _mpGet('/api/marketplace/products?status=active');
        const products = prodRes2.items || [];
        const q = query.toLowerCase();
        const matches = [];
        products.forEach(p => {
            if (p.title.toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q) || (p.category||'').toLowerCase().includes(q) || (MALL_CATEGORIES[p.category]||'').toLowerCase().includes(q)) matches.push(p.title);
        });
        const unique = [...new Set(matches)].slice(0, 8);
        if (unique.length === 0) { ac.style.display = 'none'; return; }
        ac.style.display = 'block';
        ac.innerHTML = unique.map(t => `<div onclick="selectMallAutocomplete('${t.replace(/'/g,"\\'")}')" style="padding:0.6rem 0.8rem;cursor:pointer;font-size:0.85rem;border-bottom:1px solid #F7F3ED;" onmouseenter="this.style.background='#F7F3ED'" onmouseleave="this.style.background='white'">${t}</div>`).join('');
    } catch(e) { ac.style.display = 'none'; }
}

function selectMallAutocomplete(val) {
    const input = document.getElementById('mall-search');
    if (input) input.value = val;
    document.getElementById('mall-autocomplete').style.display = 'none';
    saveMallRecentSearch(val);
    loadMallProducts();
}

function saveMallRecentSearch(query) {
    if (!query) return;
    let recent = JSON.parse(localStorage.getItem('mall_recent_searches') || '[]');
    recent = recent.filter(s => s !== query);
    recent.unshift(query);
    if (recent.length > 5) recent = recent.slice(0, 5);
    localStorage.setItem('mall_recent_searches', JSON.stringify(recent));
}

function showMallRecentSearches() {
    const ac = document.getElementById('mall-autocomplete');
    if (!ac) return;
    const recent = JSON.parse(localStorage.getItem('mall_recent_searches') || '[]');
    if (recent.length === 0) { ac.style.display = 'none'; return; }
    ac.style.display = 'block';
    ac.innerHTML = `<div style="padding:0.4rem 0.8rem;font-size:0.75rem;color:var(--accent);font-weight:600;">${t('mall.recent_searches','Recent searches')}</div>` +
        recent.map(s => `<div onclick="selectMallAutocomplete('${s.replace(/'/g,"\\'")}')" style="padding:0.5rem 0.8rem;cursor:pointer;font-size:0.85rem;border-bottom:1px solid #F7F3ED;display:flex;justify-content:space-between;" onmouseenter="this.style.background='#F7F3ED'" onmouseleave="this.style.background='white'">
            <span><i data-lucide="clock" style="width:12px;height:12px;display:inline-block;vertical-align:middle;"></i> ${s}</span>
            <span onclick="event.stopPropagation();removeMallRecentSearch('${s.replace(/'/g,"\\'")}')" style="color:#6B5744;font-size:0.75rem;">✕</span>
        </div>`).join('');
}

function removeMallRecentSearch(query) {
    let recent = JSON.parse(localStorage.getItem('mall_recent_searches') || '[]');
    recent = recent.filter(s => s !== query);
    localStorage.setItem('mall_recent_searches', JSON.stringify(recent));
    showMallRecentSearches();
}

// ========== 필터 시스템 ==========

let _mallFilters = { category: '', priceMin: '', priceMax: '', ratingMin: '', inStockOnly: false };

function toggleMallFilters() {
    const panel = document.getElementById('mall-filter-panel');
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function updatePriceRangeLabel() {
    const min = document.getElementById('mall-filter-price-min')?.value || '0';
    const max = document.getElementById('mall-filter-price-max')?.value || '10000';
    const label = document.getElementById('mall-price-range-label');
    if (label) label.textContent = `${min} ~ ${max === '10000' ? '∞' : max} CRGC`;
}

function applyMallFilters() {
    _mallFilters.category = document.getElementById('mall-filter-category')?.value || '';
    const minEl = document.getElementById('mall-filter-price-min');
    const maxEl = document.getElementById('mall-filter-price-max');
    _mallFilters.priceMin = (minEl && minEl.value !== '0') ? minEl.value : '';
    _mallFilters.priceMax = (maxEl && maxEl.value !== '10000') ? maxEl.value : '';
    _mallFilters.ratingMin = document.getElementById('mall-filter-rating')?.value || '';
    _mallFilters.inStockOnly = document.getElementById('mall-filter-instock')?.checked || false;
    loadMallProducts();
}

function resetMallFilters() {
    _mallFilters = { category: '', priceMin: '', priceMax: '', ratingMin: '', inStockOnly: false };
    const el = (id) => document.getElementById(id);
    if (el('mall-filter-category')) el('mall-filter-category').value = '';
    if (el('mall-filter-price-min')) el('mall-filter-price-min').value = '';
    if (el('mall-filter-price-max')) el('mall-filter-price-max').value = '';
    if (el('mall-filter-rating')) el('mall-filter-rating').value = '';
    if (el('mall-filter-instock')) el('mall-filter-instock').checked = false;
    loadMallProducts();
}

// 공통 이미지 리사이즈 유틸
async function fileToBase64Resized(file, maxSize) {
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

${min} ~ ${max === '10000' ? '∞' : max} CRGC`;
}

function applyMallFilters() {
    _mallFilters.category = document.getElementById('mall-filter-category')?.value || '';
    const minEl = document.getElementById('mall-filter-price-min');
    const maxEl = document.getElementById('mall-filter-price-max');
    _mallFilters.priceMin = (minEl && minEl.value !== '0') ? minEl.value : '';
    _mallFilters.priceMax = (maxEl && maxEl.value !== '10000') ? maxEl.value : '';
    _mallFilters.ratingMin = document.getElementById('mall-filter-rating')?.value || '';
    _mallFilters.inStockOnly = document.getElementById('mall-filter-instock')?.checked || false;
    loadMallProducts();
}

function resetMallFilters() {
    _mallFilters = { category: '', priceMin: '', priceMax: '', ratingMin: '', inStockOnly: false };
    const el = (id) => document.getElementById(id);
    if (el('mall-filter-category')) el('mall-filter-category').value = '';
    if (el('mall-filter-price-min')) el('mall-filter-price-min').value = '';
    if (el('mall-filter-price-max')) el('mall-filter-price-max').value = '';
    if (el('mall-filter-rating')) el('mall-filter-rating').value = '';
    if (el('mall-filter-instock')) el('mall-filter-instock').checked = false;
    loadMallProducts();
}

// 공통 이미지 리사이즈 유틸
async function fileToBase64Resized(file, maxSize) {
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

lse;
    loadMallProducts();
}

// 공통 이미지 리사이즈 유틸
async function fileToBase64Resized(file, maxSize) {
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

Image(dataUrl, maxSize);
}

;
}



lters.category = document.getElementById('mall-filter-category')?.value || '';
    const minEl = document.getElementById('mall-filter-price-min');
    const maxEl = document.getElementById('mall-filter-price-max');
    _mallFilters.priceMin = (minEl && minEl.value !== '0') ? minEl.value : '';
    _mallFilters.priceMax = (maxEl && maxEl.value !== '10000') ? maxEl.value : '';
    _mallFilters.ratingMin = document.getElementById('mall-filter-rating')?.value || '';
    _mallFilters.inStockOnly = document.getElementById('mall-filter-instock')?.checked || false;
    loadMallProducts();
}

function resetMallFilters() {
    _mallFilters = { category: '', priceMin: '', priceMax: '', ratingMin: '', inStockOnly: false };
    const el = (id) => document.getElementById(id);
    if (el('mall-filter-category')) el('mall-filter-category').value = '';
    if (el('mall-filter-price-min')) el('mall-filter-price-min').value = '';
    if (el('mall-filter-price-max')) el('mall-filter-price-max').value = '';
    if (el('mall-filter-rating')) el('mall-filter-rating').value = '';
    if (el('mall-filter-instock')) el('mall-filter-instock').checked = false;
    loadMallProducts();
}

// 공통 이미지 리사이즈 유틸
async function fileToBase64Resized(file, maxSize) {
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

lse;
    loadMallProducts();
}

// 공통 이미지 리사이즈 유틸
async function fileToBase64Resized(file, maxSize) {
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

Image(dataUrl, maxSize);
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}



rror = rej; r.readAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

Image(dataUrl, maxSize);
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}



file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

lse;
    loadMallProducts();
}

// 공통 이미지 리사이즈 유틸
async function fileToBase64Resized(file, maxSize) {
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

Image(dataUrl, maxSize);
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}



rror = rej; r.readAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

Image(dataUrl, maxSize);
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}



adAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

Image(dataUrl, maxSize);
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



sult); r.onerror = rej; r.readAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

Image(dataUrl, maxSize);
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}



rror = rej; r.readAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

Image(dataUrl, maxSize);
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}



file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

lse;
    loadMallProducts();
}

// 공통 이미지 리사이즈 유틸
async function fileToBase64Resized(file, maxSize) {
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

Image(dataUrl, maxSize);
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}



rror = rej; r.readAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

Image(dataUrl, maxSize);
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}



adAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

Image(dataUrl, maxSize);
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



xSize);
}

;
}



Size);
}

;
}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}



resizeImage(dataUrl, maxSize);
}

;
}

Image(dataUrl, maxSize);
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}



adAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

Image(dataUrl, maxSize);
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



xSize);
}

;
}



Size);
}

;
}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}



axSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}



adAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

Image(dataUrl, maxSize);
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



xSize);
}

;
}



Size);
}

;
}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}



resizeImage(dataUrl, maxSize);
}

;
}

Image(dataUrl, maxSize);
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}



adAsDataURL(file); });
    return resizeImage(dataUrl, maxSize);
}

;
}

urn resizeImage(dataUrl, maxSize);
}

;
}

Image(dataUrl, maxSize);
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



xSize);
}

;
}



Size);
}

;
}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}




Size);
}

;
}




}

;
}




}



}

;
}




}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}




}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



xSize);
}

;
}



Size);
}

;
}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}




Size);
}

;
}




}

;
}




}



}

;
}




}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}



}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}




Size);
}

;
}




}

;
}




}



}

;
}




}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}



);
}

;
}




}

;
}




}



}

;
}




}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}






}

;
}




}



}

;
}




}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}




Size);
}

;
}




}

;
}




}



}

;
}




}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}



}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}




Size);
}

;
}




}

;
}




}



}

;
}




}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}



);
}

;
}




}

;
}




}



}

;
}




}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}



;
}




}



}

;
}




}





}




}

;
}




}



}

;
}




}





}



;
}




}



}

;
}




}





}



taUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}



;
}




}



}

;
}




}





}




}

;
}




}



}

;
}




}





}



;
}




}



}

;
}




}





}





}



}

;
}




}





}



;
}




}



}

;
}




}





}




;
}




}





}





}



}

;
}




}





}



;
}




}



}

;
}




}





}






;
}




}



}

;
}




}





}




}






}





}




}







;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}



);
}

;
}




}

;
}




}



}

;
}




}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}



;
}




}



}

;
}




}





}




}

;
}




}



}

;
}




}





}



;
}




}



}

;
}




}





}



taUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}



;
}




}



}

;
}




}





}




}

;
}




}



}

;
}




}





}



;
}




}



}

;
}




}





}





}



}

;
}




}





}



;
}




}



}

;
}




}





}




;
}




}





}





}



}

;
}




}





}



;
}




}



}

;
}




}





}






;
}




}



}

;
}




}





}




}






}





}




}




}



}

;
}




}





}






;
}




}



}

;
}




}





}




}






}





}




}






}



}

;
}




}




Size);
}

;
}




}

;
}




}



}

;
}




}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}



}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}




Size);
}

;
}




}

;
}




}



}

;
}




}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}



);
}

;
}




}

;
}




}



}

;
}




}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}



;
}




}



}

;
}




}





}




}

;
}




}



}

;
}




}





}



;
}




}



}

;
}




}





}



taUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}



;
}




}



}

;
}




}





}




}

;
}




}



}

;
}




}





}



;
}




}



}

;
}




}





}





}



}

;
}




}





}



;
}




}



}

;
}




}





}




;
}




}





}





}



}

;
}




}





}



;
}




}



}

;
}




}





}






;
}




}



}

;
}




}





}




}






}





}




}







;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}



);
}

;
}




}

;
}




}



}

;
}




}




}

;
}



;
}

Image(dataUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}



;
}




}



}

;
}




}





}




}

;
}




}



}

;
}




}





}



;
}




}



}

;
}




}





}



taUrl, maxSize);
}

;
}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}



;
}




}



}

;
}




}





}




}

;
}




}



}

;
}




}





}



;
}




}



}

;
}




}





}





}



}

;
}




}





}



;
}




}



}

;
}




}





}




;
}




}





}





}



}

;
}




}





}



;
}




}



}

;
}




}





}






;
}




}



}

;
}




}





}




}






}





}




}




}



}

;
}




}





}






;
}




}



}

;
}




}





}




}






}





}




}



;
}

;
}



}

;
}

Image(dataUrl, maxSize);
}

;
}



Size);
}

;
}




}

;
}




}



}

;
}




}





}



;
}




}



}

;
}




}





}




}

;
}




}



}

;
}




}





}



;
}




}



}

;
}




}





}





}



}

;
}




}





}



;
}




}



}

;
}




}





}




;
}




}





}





}



}

;
}




}





}



;
}




}



}

;
}




}





}






;
}




}



}

;
}




}





}




}






}





}




}




}



}

;
}




}





}






;
}




}



}

;
}




}





}




}






}





}




}



}




}






}





}




}




}



}

;
}




}





}






;
}




}



}

;
}




}





}




}






}





}




}



}




}



}




}






}





}




}




}



}

;
}




}





}






;
}




}



}

;
}




}





}




}






}





}




}



}




}



}




}






}





}




}




}



}

;
}




}





}






;
}




}



}

;
}




}





}




}






}





}




}






;
}




}



}

;
}




}





}




}






}





}




}









}





}




}




