// ========== BOOKS PLATFORM v1.0 ==========
// Interactive digital publishing platform with CSS effects, TTS, treasure hunt, limited editions, translations
// Token: CRGC only (offchain)

const BOOK_SOUNDS = {
    rain_ambient: 'https://assets.mixkit.co/active_storage/sfx/212/212-preview.mp3',
    ocean: 'https://assets.mixkit.co/active_storage/sfx/189/189-preview.mp3',
    forest: 'https://assets.mixkit.co/active_storage/sfx/178/178-preview.mp3',
    piano: 'https://assets.mixkit.co/active_storage/sfx/146/146-preview.mp3',
    fire_crackling: 'https://assets.mixkit.co/active_storage/sfx/185/185-preview.mp3'
};

function _getBookEffects() {
    return [
        { value: '', label: t('books.effect_none','None') },
        { value: 'snow', label: t('books.effect_snow','Snow') },
        { value: 'rain', label: t('books.effect_rain','Rain') },
        { value: 'cherry_blossom', label: t('books.effect_cherry','Cherry Blossom') },
        { value: 'firefly', label: t('books.effect_firefly','Firefly') },
        { value: 'stars', label: t('books.effect_stars','Stars') }
    ];
}

function _getBookSoundOptions() {
    return [
        { value: '', label: t('books.sound_none','None') },
        { value: 'rain_ambient', label: t('books.sound_rain','Rain') },
        { value: 'ocean', label: t('books.sound_ocean','Ocean') },
        { value: 'forest', label: t('books.sound_forest','Forest') },
        { value: 'piano', label: t('books.sound_piano','Piano') },
        { value: 'fire_crackling', label: t('books.sound_fire','Campfire') }
    ];
}

function _getBookGenres() {
    return {
        novel: '<i data-lucide="book-open" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('books.genre_novel','Novel'),
        essay: t('books.genre_essay','Essay'),
        selfhelp: t('books.genre_selfhelp','Self-help'),
        business: t('books.genre_business','Business'),
        tech: '<i data-lucide="monitor" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('books.genre_tech','Tech'),
        poetry: t('books.genre_poetry','Poetry'),
        children: t('books.genre_children','Children'),
        comic: t('books.genre_comic','Comic'),
        fantasy: t('books.genre_fantasy','Fantasy'),
        romance: t('books.genre_romance','Romance'),
        horror: t('books.genre_horror','Horror'),
        mystery: t('books.genre_mystery','Mystery'),
        other: t('books.genre_other','Other')
    };
}

// ========== State ==========
let _bookCreatorData = null;
let _bookReaderState = null;
let _bookAudio = null;
let _bookTTSActive = false;

// Helper function to create Lucide icon HTML
function createLucideIcon(name, size = 14) {
    return `<i data-lucide="${name}" style="width:${size}px;height:${size}px;display:inline-block;vertical-align:middle;"></i>`;
}

// ========== GALLERY (replaces loadBooksList) ==========

async function loadBooksGallery() {
    const c = document.getElementById('books-gallery-content');
    if (!c) return;
    c.innerHTML = '<p style="text-align:center;color:var(--accent);padding:2rem;">' + t('books.loading','Loading...') + '</p>';

    try {
        let snap;
        try {
            snap = await db.collection('books').where('status', 'in', ['published', 'active', 'soldout'])
                .orderBy('publishedAt', 'desc').limit(50).get();
        } catch (indexErr) {
            // fallback: createdAt 정렬 (publishedAt 인덱스 없을 때)
            snap = await db.collection('books').where('status', 'in', ['published', 'active', 'soldout'])
                .orderBy('createdAt', 'desc').limit(50).get();
        }

        if (snap.empty) {
            c.innerHTML = `<p style="text-align:center;color:var(--accent);padding:2rem;">${t('books.no_books','No books registered yet')}</p>`;
            return;
        }

        const books = [];
        snap.forEach(d => books.push({ id: d.id, ...d.data() }));

        const limited = books.filter(b => b.edition === 'limited');
        const recent = books.slice(0, 12);
        const popular = [...books].sort((a, b) => (b.soldCount || b.sold || 0) - (a.soldCount || a.sold || 0)).slice(0, 12);

        let html = '';

        if (limited.length) {
            html += _renderBookRow(t('books.limited_edition','Limited Edition'), limited);
        }
        html += _renderBookRow('🆕 ' + t('books.new_releases','New Releases'), recent);
        if (popular.length > 1) {
            html += _renderBookRow('<i data-lucide="flame" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ' + t('books.popular','Popular'), popular);
        }

        // Search & filter
        html = `<div style="display:flex;gap:0.5rem;margin-bottom:1rem;flex-wrap:wrap;">
            <input type="text" id="book-search-input" placeholder="${t('common.search','Search')}..." oninput="filterBooksGallery()" style="flex:1;min-width:150px;padding:0.6rem;border:1px solid var(--border);border-radius:8px;">
            <select id="book-genre-filter" onchange="filterBooksGallery()" style="padding:0.6rem;border:1px solid var(--border);border-radius:8px;">
                <option value="">${t('books.all_genres','All Genres')}</option>
                ${Object.entries(_getBookGenres()).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
        </div>
        <div id="books-filtered-grid" style="display:none;"></div>` + html;

        c.innerHTML = html;
        // Store for filtering
        c._allBooks = books;
        if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
    } catch (e) {
        c.innerHTML = `<p style="color:red;padding:1rem;">${e.message}</p>`;
    }
}

function _renderBookRow(title, books) {
    return `<div style="margin-bottom:1.5rem;">
        <h3 style="margin-bottom:0.5rem;font-size:1rem;">${title}</h3>
        <div style="display:flex;gap:0.8rem;overflow-x:auto;padding-bottom:0.5rem;" class="book-scroll-row">
            ${books.map(b => _renderBookCard(b)).join('')}
        </div>
    </div>`;
}

function _renderBookCard(b) {
    const price = b.basePrice || b.price || 0;
    const sold = b.soldCount || b.sold || 0;
    const supply = b.totalSupply || 0;
    const isSoldOut = b.status === 'soldout' || (b.edition === 'limited' && supply > 0 && sold >= supply);
    const coverBg = b.coverImage || b.imageData
        ? `<img src="${b.coverImage || b.imageData}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">`
        : `<div style="height:100%;display:flex;align-items:center;justify-content:center;font-size:3rem;background:#f5f0e8;">${(_getBookGenres()[b.genre] || t('books.genre_other','Other')).charAt(0)}</div>`;

    return `<div onclick="viewBookDetailV2('${b.id}')" style="min-width:130px;max-width:150px;background:#FFF8F0;border-radius:10px;overflow:hidden;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.08);flex-shrink:0;position:relative;">
        ${isSoldOut ? '<div style="position:absolute;top:8px;right:8px;background:red;color:#FFF8F0;font-size:0.6rem;padding:2px 6px;border-radius:4px;font-weight:700;z-index:1;">SOLD OUT</div>' : ''}
        ${b.edition === 'limited' ? '<div style="position:absolute;top:8px;left:8px;background:gold;color:#3D2B1F;font-size:0.6rem;padding:2px 6px;border-radius:4px;font-weight:700;z-index:1;">' + t('books.limited_edition','Limited Edition') + '</div>' : ''}
        <div style="height:180px;overflow:hidden;">${coverBg}</div>
        <div style="padding:0.5rem;">
            <div style="font-weight:600;font-size:0.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${b.title}</div>
            <div style="font-size:0.7rem;color:var(--accent);">${b.author || t('books.unknown_author','Unknown author')}</div>
            <div style="font-weight:700;color:#3D2B1F;font-size:0.85rem;margin-top:0.2rem;">${price > 0 ? price + ' CRGC' : t('books.free','Free')}</div>
            ${b.edition === 'limited' && supply > 0 ? `<div style="font-size:0.65rem;color:#6B5744;">${sold}/${supply}</div>` : ''}
        </div>
    </div>`;
}

function filterBooksGallery() {
    const c = document.getElementById('books-gallery-content');
    const grid = document.getElementById('books-filtered-grid');
    if (!c || !grid || !c._allBooks) return;

    const q = (document.getElementById('book-search-input')?.value || '').toLowerCase();
    const genre = document.getElementById('book-genre-filter')?.value || '';

    if (!q && !genre) {
        grid.style.display = 'none';
        document.querySelectorAll('.book-scroll-row').forEach(r => r.parentElement.style.display = '');
        return;
    }

    document.querySelectorAll('.book-scroll-row').forEach(r => r.parentElement.style.display = 'none');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(130px, 1fr))';
    grid.style.gap = '0.8rem';

    const filtered = c._allBooks.filter(b => {
        if (genre && b.genre !== genre) return false;
        if (q && !(b.title || '').toLowerCase().includes(q) && !(b.author || '').toLowerCase().includes(q)) return false;
        return true;
    });

    grid.innerHTML = filtered.length
        ? filtered.map(b => _renderBookCard(b)).join('')
        : '<p style="grid-column:1/-1;text-align:center;color:var(--accent);">' + t('books.no_results','No results found') + '</p>';
    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

// ========== BOOK DETAIL V2 ==========

async function viewBookDetailV2(id) {
    const doc = await db.collection('books').doc(id).get();
    if (!doc.exists) return;
    const b = doc.data();
    const isOwner = currentUser?.uid === b.authorId || currentUser?.uid === b.publisherId;
    const sold = b.soldCount || b.sold || 0;
    const supply = b.totalSupply || 0;
    const isSoldOut = b.status === 'soldout' || (b.edition === 'limited' && supply > 0 && sold >= supply);
    const price = b.basePrice || b.price || 0;
    const chapterCount = (b.chapters || []).length;

    // Check if user owns the book
    let userOwns = false;
    let editionNumber = null;
    if (currentUser) {
        const purchaseSnap = await db.collection('book_purchases')
            .where('userId', '==', currentUser.uid).where('bookId', '==', id).limit(1).get();
        if (!purchaseSnap.empty) {
            userOwns = true;
            editionNumber = purchaseSnap.docs[0].data().editionNumber;
        }
    }

    const modal = document.createElement('div');
    modal.id = 'book-detail-modal-v2';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const translations = b.availableTranslations || ['ko'];

    modal.innerHTML = `<div style="background:#FFF8F0;border-radius:16px;max-width:500px;width:100%;max-height:90vh;overflow-y:auto;">
        <div style="height:280px;background:#f5f0e8;display:flex;align-items:center;justify-content:center;position:relative;">
            ${b.coverImage || b.imageData ? `<img src="${b.coverImage || b.imageData}" loading="lazy" style="max-width:100%;max-height:100%;object-fit:contain;">` : `<span style="font-size:5rem;"><i data-lucide="book-open" style="width:48px;height:48px;display:inline-block;vertical-align:middle"></i></span>`}
            ${b.edition === 'limited' ? `<div style="position:absolute;top:12px;left:12px;background:gold;color:#3D2B1F;padding:4px 10px;border-radius:6px;font-weight:700;font-size:0.8rem;">${t('books.limited_edition','Limited Edition')} ${sold}/${supply}</div>` : ''}
            ${isSoldOut ? `<div style="position:absolute;top:12px;right:12px;background:red;color:#FFF8F0;padding:4px 10px;border-radius:6px;font-weight:700;font-size:0.8rem;">SOLD OUT</div>` : ''}
        </div>
        <div style="padding:1.5rem;">
            <h2 style="margin:0 0 0.3rem;">${b.title}</h2>
            <p style="color:var(--accent);font-size:0.9rem;margin:0 0 0.5rem;">${b.author || t('books.unknown_author','Unknown author')} · ${_getBookGenres()[b.genre] || ''} · ${chapterCount} ${t('books.chapters','chapters')}</p>
            <p style="font-size:1.2rem;font-weight:700;color:#3D2B1F;margin:0.5rem 0;">${price > 0 ? price + ' CRGC' : t('books.free','Free')}</p>
            ${editionNumber ? `<p style="font-size:0.8rem;color:#6B5744;margin:0;">${t('books.my_edition','My Edition')}: #${editionNumber} of ${supply || '∞'}</p>` : ''}
            ${b.description ? `<p style="font-size:0.9rem;margin:0.8rem 0;line-height:1.6;color:#6B5744;">${b.description}</p>` : ''}
            
            ${translations.length > 1 ? `<div style="margin:0.5rem 0;font-size:0.8rem;">${t('books.translations','Translations')}: ${translations.map(l => _langLabel(l)).join(', ')}</div>` : ''}
            
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.8rem;">
                ${b.featureCodes?.ttsEnabled ? '<span style="background:#F7F3ED;padding:2px 8px;border-radius:12px;font-size:0.75rem;">TTS</span>' : ''}
                ${b.featureCodes?.treasureHunt?.enabled ? '<span style="background:#F7F3ED;padding:2px 8px;border-radius:12px;font-size:0.75rem;">' + t('books.treasure_hunt','Treasure Hunt') + '</span>' : ''}
                ${(b.featureCodes?.effects || []).length ? '<span style="background:#f3e5f5;padding:2px 8px;border-radius:12px;font-size:0.75rem;">' + t('books.interactive','Interactive') + '</span>' : ''}
            </div>
            
            <div style="display:flex;gap:0.5rem;margin-top:1rem;">
                ${userOwns || isOwner || price <= 0 ? `<button onclick="openBookReader('${id}');document.getElementById('book-detail-modal-v2')?.remove();" style="flex:1;background:#3D2B1F;color:#FFF8F0;border:none;padding:0.8rem;border-radius:8px;cursor:pointer;font-weight:700;">${t('books.read_book','Read Book')}</button>` : ''}
                ${!userOwns && !isOwner && price > 0 && !isSoldOut ? `<button onclick="buyBookV2('${id}');document.getElementById('book-detail-modal-v2')?.remove();" style="flex:1;background:#3D2B1F;color:#FFF8F0;border:none;padding:0.8rem;border-radius:8px;cursor:pointer;font-weight:700;">${t('books.buy_book','Buy Book')} (${price} CRGC)</button>` : ''}
                ${isSoldOut && !userOwns ? '<button disabled style="flex:1;background:#E8E0D8;color:#6B5744;border:none;padding:0.8rem;border-radius:8px;font-weight:700;">' + t('books.sold_out','Sold out (limited edition)') + '</button>' : ''}
                <button onclick="addToReadingList('${id}')" style="background:#C4841D;color:#FFF8F0;border:none;padding:0.8rem;border-radius:8px;cursor:pointer;font-weight:700;"><i data-lucide="bookmark" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i></button>
            </div>
            ${!userOwns && !isOwner && price > 0 ? `<button onclick="requestTranslation('${id}')" style="background:none;border:1px solid var(--border);padding:0.5rem;border-radius:8px;cursor:pointer;width:100%;margin-top:0.5rem;font-size:0.85rem;">${t('books.request_translation','Request Translation')}</button>` : ''}
            <button onclick="document.getElementById('book-detail-modal-v2')?.remove()" style="background:#E8E0D8;border:none;padding:0.6rem;border-radius:8px;cursor:pointer;width:100%;margin-top:0.5rem;">${t('common.close','Close')}</button>
        </div>
    </div>`;
    document.body.appendChild(modal);
}

function _langLabel(code) {
    const map = { ko: '🇰🇷 ' + t('books.lang_korean','Korean'), en: '🇺🇸 English', ja: '🇯🇵 日本語', zh: '🇨🇳 中文', es: '🇪🇸 Español', fr: '🇫🇷 Français', de: '🇩🇪 Deutsch' };
    return map[code] || code;
}

// ========== BUY BOOK V2 (Limited Edition) ==========

async function buyBookV2(id) {
    if (!currentUser) { showToast(t('common.login_required','Login required'), 'warning'); return; }
    const doc = await db.collection('books').doc(id).get();
    if (!doc.exists) return;
    const b = doc.data();
    const price = b.basePrice || b.price || 0;

    if (b.authorId === currentUser.uid || b.publisherId === currentUser.uid) {
        showToast(t('books.own_book','This is your own book'), 'info'); return;
    }

    // Check already purchased
    const existing = await db.collection('book_purchases')
        .where('userId', '==', currentUser.uid).where('bookId', '==', id).limit(1).get();
    if (!existing.empty) {
        showToast(t('books.already_purchased','Already purchased'), 'info'); return;
    }

    // Check supply
    const sold = b.soldCount || b.sold || 0;
    if (b.edition === 'limited' && b.totalSupply > 0 && sold >= b.totalSupply) {
        showToast(t('books.sold_out','Sold out (limited edition)'), 'warning'); return;
    }

    if (price <= 0) {
        // Free book
        await _completePurchase(id, b, 0);
        return;
    }

    if (!await showConfirmModal(t('books.purchase', 'Purchase Book'), `"${b.title}"\nPurchase for ${price} CRGC?${b.edition === 'limited' ? `\nEdition #${sold + 1} of ${b.totalSupply}` : ''}`)) return;

    try {
        const success = await spendOffchainPoints('crgc', price, `${t('books.buy_book','Buy Book')}: ${b.title}`);
        if (!success) return;

        // Pay author
        const authorId = b.authorId || b.publisherId;
        if (authorId) {
            const pubDoc = await db.collection('users').doc(authorId).get();
            const pubBal = pubDoc.data()?.offchainBalances || {};
            await db.collection('users').doc(authorId).update({
                ['offchainBalances.crgc']: (pubBal.crgc || 0) + price
            });
        }

        await _completePurchase(id, b, price);
        if (typeof loadUserWallet === 'function') loadUserWallet();
    } catch (e) { showToast(t('books.purchase_fail','Purchase failed') + ': ' + e.message, 'error'); }
}

async function _completePurchase(bookId, bookData, price) {
    const sold = (bookData.soldCount || bookData.sold || 0) + 1;
    const editionNumber = sold;

    const updateData = { soldCount: sold, sold: sold };
    if (bookData.edition === 'limited' && bookData.totalSupply > 0 && sold >= bookData.totalSupply) {
        updateData.status = 'soldout';
    }
    await db.collection('books').doc(bookId).update(updateData);

    await db.collection('book_purchases').add({
        userId: currentUser.uid,
        bookId,
        bookTitle: bookData.title,
        editionNumber,
        price,
        token: 'CRGC',
        purchasedAt: new Date()
    });

    if (price > 0) {
        await db.collection('transactions').add({
            from: currentUser.uid, to: bookData.authorId || bookData.publisherId,
            amount: price, token: 'CRGC', type: 'book_purchase', bookId, timestamp: new Date()
        });
    }

    showToast(`"${bookData.title}" ${t('books.purchase_done','Purchase complete!')}${bookData.edition === 'limited' ? ` #${editionNumber} of ${bookData.totalSupply}` : ''}`, 'success');
}

// ========== BOOK CREATOR ==========

function showBookCreator(editBookId) {
    if (!currentUser) { showToast(t('common.login_required','Login required'), 'warning'); return; }

    _bookCreatorData = {
        step: 1,
        title: '', author: '', description: '', genre: 'novel',
        coverImage: '', edition: 'unlimited', totalSupply: 100,
        basePrice: 0, originalLanguage: 'ko',
        featureCodes: { effects: [], sounds: [], ttsEnabled: true, treasureHunt: { enabled: false, totalTreasures: 0, rewards: { token: 'CRGC', amount: 10 } } },
        chapters: [{ chapterNum: 1, title: t('books.chapter','Chapter') + ' 1', scenes: [{ sceneId: 'ch1_s1', content: '', effect: '', sound: '', treasureCode: '', imageUrl: '' }] }],
        editBookId: editBookId || null
    };

    if (editBookId) {
        _loadBookForEdit(editBookId);
        return;
    }
    _renderBookCreator();
}

async function _loadBookForEdit(id) {
    showLoading();
    try {
        const doc = await db.collection('books').doc(id).get();
        if (!doc.exists) { hideLoading(); showToast(t('books.not_found','Book not found'), 'error'); return; }
        const b = doc.data();
        Object.assign(_bookCreatorData, b, { editBookId: id, step: 1 });
        hideLoading();
        _renderBookCreator();
    } catch (e) { hideLoading(); showToast(e.message, 'error'); }
}

function _renderBookCreator() {
    const d = _bookCreatorData;
    let existing = document.getElementById('book-creator-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'book-creator-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#FFF8F0;z-index:10001;overflow-y:auto;';

    const steps = [t('books.step_info','Basic Info'), t('books.step_chapters','Chapters/Scenes'), t('books.step_preview','Preview'), t('books.step_publish','Publish')];
    const stepBar = `<div style="display:flex;gap:0;border-bottom:2px solid #E8E0D8;">
        ${steps.map((s, i) => `<div style="flex:1;text-align:center;padding:0.8rem 0.3rem;font-size:0.8rem;font-weight:${d.step === i + 1 ? '700' : '400'};color:${d.step === i + 1 ? '#3D2B1F' : '#6B5744'};border-bottom:${d.step === i + 1 ? '2px solid #3D2B1F' : 'none'};cursor:pointer;" onclick="_bookCreatorData.step=${i + 1};_renderBookCreator();">${i + 1}. ${s}</div>`).join('')}
    </div>`;

    let content = '';
    if (d.step === 1) content = _renderCreatorStep1();
    else if (d.step === 2) content = _renderCreatorStep2();
    else if (d.step === 3) content = _renderCreatorStep3();
    else if (d.step === 4) content = _renderCreatorStep4();

    modal.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:1rem;border-bottom:1px solid #E8E0D8;">
            <h2 style="margin:0;font-size:1.1rem;">${d.editBookId ? t('books.edit_book','Edit Book') : t('books.create_book','Create New Book')}</h2>
            <button onclick="document.getElementById('book-creator-modal')?.remove()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;">&times;</button>
        </div>
        ${stepBar}
        <div style="padding:1rem;max-width:700px;margin:0 auto;">${content}</div>
    `;
    document.body.appendChild(modal);
}

function _renderCreatorStep1() {
    const d = _bookCreatorData;
    return `<div style="display:grid;gap:1rem;">
        <div><label style="font-size:0.85rem;font-weight:600;">${t('books.title','Title')} *</label>
        <input type="text" id="bc-title" value="${_esc(d.title)}" onchange="_bookCreatorData.title=this.value" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:8px;box-sizing:border-box;"></div>
        
        <div><label style="font-size:0.85rem;font-weight:600;">${t('books.author','Author')}</label>
        <input type="text" id="bc-author" value="${_esc(d.author)}" onchange="_bookCreatorData.author=this.value" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:8px;box-sizing:border-box;"></div>
        
        <div><label style="font-size:0.85rem;font-weight:600;">${t('books.genre','Genre')}</label>
        <select id="bc-genre" onchange="_bookCreatorData.genre=this.value" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:8px;">
            ${Object.entries(_getBookGenres()).map(([k, v]) => `<option value="${k}" ${d.genre === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select></div>
        
        <div><label style="font-size:0.85rem;font-weight:600;">${t('books.description','Description')}</label>
        <textarea id="bc-desc" rows="3" onchange="_bookCreatorData.description=this.value" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:8px;box-sizing:border-box;">${_esc(d.description)}</textarea></div>
        
        <div><label style="font-size:0.85rem;font-weight:600;">${t('books.cover_image','Cover Image')}</label>
        <input type="file" id="bc-cover" accept="image/*" onchange="_handleCoverUpload(this)" style="padding:0.5rem;border:1px solid var(--border);border-radius:8px;width:100%;box-sizing:border-box;">
        ${d.coverImage ? `<img src="${d.coverImage}" loading="lazy" style="height:100px;margin-top:0.5rem;border-radius:8px;">` : ''}</div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
            <div><label style="font-size:0.85rem;font-weight:600;">${t('books.edition','Edition')}</label>
            <select onchange="_bookCreatorData.edition=this.value;_renderBookCreator();" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:8px;">
                <option value="unlimited" ${d.edition === 'unlimited' ? 'selected' : ''}>${t('books.unlimited','Unlimited')}</option>
                <option value="limited" ${d.edition === 'limited' ? 'selected' : ''}>${t('books.limited_edition','Limited Edition')}</option>
            </select></div>
            ${d.edition === 'limited' ? `<div><label style="font-size:0.85rem;font-weight:600;">${t('books.total_supply','Total Supply')}</label>
            <input type="number" value="${d.totalSupply}" onchange="_bookCreatorData.totalSupply=parseInt(this.value)||100" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:8px;box-sizing:border-box;"></div>` : '<div></div>'}
        </div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
            <div><label style="font-size:0.85rem;font-weight:600;">${t('books.tts_reading','TTS Reading')}</label>
            <select onchange="_bookCreatorData.featureCodes.ttsEnabled=this.value==='true'" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:8px;">
                <option value="true" ${d.featureCodes.ttsEnabled ? 'selected' : ''}>${t('books.enabled','Enabled')}</option>
                <option value="false" ${!d.featureCodes.ttsEnabled ? 'selected' : ''}>${t('books.disabled','Disabled')}</option>
            </select></div>
            <div><label style="font-size:0.85rem;font-weight:600;">${t('books.treasure_hunt','Treasure Hunt')}</label>
            <select onchange="_bookCreatorData.featureCodes.treasureHunt.enabled=this.value==='true';_renderBookCreator();" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:8px;">
                <option value="false" ${!d.featureCodes.treasureHunt.enabled ? 'selected' : ''}>${t('books.disabled','Disabled')}</option>
                <option value="true" ${d.featureCodes.treasureHunt.enabled ? 'selected' : ''}>${t('books.enabled','Enabled')}</option>
            </select></div>
        </div>
        ${d.featureCodes.treasureHunt.enabled ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
            <div><label style="font-size:0.85rem;">${t('books.treasure_reward','Treasure Reward')} (CRGC)</label>
            <input type="number" value="${d.featureCodes.treasureHunt.rewards.amount}" onchange="_bookCreatorData.featureCodes.treasureHunt.rewards.amount=parseInt(this.value)||10" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:8px;box-sizing:border-box;"></div>
            <div></div>
        </div>` : ''}
        
        <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:1rem;">
            <button onclick="_saveBookDraft()" style="padding:0.7rem 1.5rem;border:1px solid var(--border);background:#FFF8F0;border-radius:8px;cursor:pointer;">${t('books.save_draft','Save Draft')}</button>
            <button onclick="_bookCreatorData.step=2;_renderBookCreator();" style="padding:0.7rem 1.5rem;background:#3D2B1F;color:#FFF8F0;border:none;border-radius:8px;cursor:pointer;">${t('books.next','Next')} →</button>
        </div>
    </div>`;
}

function _renderCreatorStep2() {
    const d = _bookCreatorData;
    let html = '<div style="display:grid;gap:1rem;">';

    d.chapters.forEach((ch, ci) => {
        html += `<div style="background:#f9f9f9;border-radius:12px;padding:1rem;border:1px solid #E8E0D8;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                <div style="display:flex;align-items:center;gap:0.5rem;">
                    ${ci > 0 ? `<button onclick="_moveChapter(${ci},-1)" style="background:none;border:none;cursor:pointer;">▲</button>` : ''}
                    ${ci < d.chapters.length - 1 ? `<button onclick="_moveChapter(${ci},1)" style="background:none;border:none;cursor:pointer;">▼</button>` : ''}
                    <input type="text" value="${_esc(ch.title)}" onchange="_bookCreatorData.chapters[${ci}].title=this.value" style="font-weight:700;font-size:1rem;border:none;background:transparent;width:150px;">
                </div>
                ${d.chapters.length > 1 ? `<button onclick="_bookCreatorData.chapters.splice(${ci},1);_renderBookCreator();" style="background:#ff5252;color:#FFF8F0;border:none;padding:0.3rem 0.6rem;border-radius:6px;cursor:pointer;font-size:0.75rem;">${t('common.delete','Delete')}</button>` : ''}
            </div>`;

        ch.scenes.forEach((sc, si) => {
            html += `<div style="background:#FFF8F0;border-radius:8px;padding:0.8rem;margin-bottom:0.5rem;border:1px solid #e0e0e0;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem;">
                    <span style="font-size:0.8rem;font-weight:600;">${t('books.scene','Scene')} ${si + 1}</span>
                    ${ch.scenes.length > 1 ? `<button onclick="_bookCreatorData.chapters[${ci}].scenes.splice(${si},1);_renderBookCreator();" style="background:none;border:none;cursor:pointer;font-size:0.7rem;color:red;">✕</button>` : ''}
                </div>
                <textarea rows="4" onchange="_bookCreatorData.chapters[${ci}].scenes[${si}].content=this.value" placeholder="${t('books.scene_placeholder','Enter scene content...')}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;box-sizing:border-box;font-size:0.9rem;line-height:1.6;">${_esc(sc.content)}</textarea>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.3rem;margin-top:0.3rem;">
                    <select onchange="_bookCreatorData.chapters[${ci}].scenes[${si}].effect=this.value" style="padding:0.4rem;border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">
                        ${_getBookEffects().map(e => `<option value="${e.value}" ${sc.effect === e.value ? 'selected' : ''}>${e.label}</option>`).join('')}
                    </select>
                    <select onchange="_bookCreatorData.chapters[${ci}].scenes[${si}].sound=this.value" style="padding:0.4rem;border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">
                        ${_getBookSoundOptions().map(s => `<option value="${s.value}" ${sc.sound === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
                    </select>
                </div>
                <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.3rem;">
                    <label style="font-size:0.75rem;display:flex;align-items:center;gap:0.3rem;">
                        <input type="checkbox" ${sc.treasureCode ? 'checked' : ''} onchange="_bookCreatorData.chapters[${ci}].scenes[${si}].treasureCode=this.checked?'TREASURE_'+Date.now():'';"> ${t('books.treasure','Treasure')}
                 </label>
                    <label style="font-size:0.75rem;display:flex;align-items:center;gap:0.3rem;">${t('books.illustration','Illustration')}
                        <input type="file" accept="image/*" onchange="_handleSceneImage(this,${ci},${si})" style="font-size:0.7rem;width:120px;">
                    </label>
                </div>
                ${sc.imageUrl ? `<img src="${sc.imageUrl}" loading="lazy" style="height:60px;margin-top:0.3rem;border-radius:4px;">` : ''}
            </div>`;
        });

        html += `<button onclick="_addScene(${ci})" style="width:100%;padding:0.4rem;border:1px dashed #E8E0D8;background:none;border-radius:6px;cursor:pointer;font-size:0.8rem;color:#6B5744;">+ ${t('books.add_scene','Add Scene')}</button>
        </div>`;
    });

    html += `<button onclick="_addChapter()" style="width:100%;padding:0.7rem;border:2px dashed #E8E0D8;background:none;border-radius:10px;cursor:pointer;font-size:0.9rem;color:#6B5744;">+ ${t('books.add_chapter','Add Chapter')}</button>`;

    html += `<div style="display:flex;justify-content:space-between;margin-top:1rem;">
        <button onclick="_bookCreatorData.step=1;_renderBookCreator();" style="padding:0.7rem 1.5rem;border:1px solid var(--border);background:#FFF8F0;border-radius:8px;cursor:pointer;">← ${t('books.previous','Previous')}</button>
        <div style="display:flex;gap:0.5rem;">
            <button onclick="_saveBookDraft()" style="padding:0.7rem 1.5rem;border:1px solid var(--border);background:#FFF8F0;border-radius:8px;cursor:pointer;">${t('books.save_draft','Save Draft')}</button>
            <button onclick="_bookCreatorData.step=3;_renderBookCreator();" style="padding:0.7rem 1.5rem;background:#3D2B1F;color:#FFF8F0;border:none;border-radius:8px;cursor:pointer;">${t('books.step_preview','Preview')} →</button>
        </div>
    </div></div>`;
    return html;
}

function _renderCreatorStep3() {
    const d = _bookCreatorData;
    return `<div>
        <p style="text-align:center;color:var(--accent);margin-bottom:1rem;">${t('books.preview_desc','Reader view preview (test effects/sounds)')}</p>
        <div id="book-preview-container" style="background:#3D2B1F;border-radius:12px;overflow:hidden;height:60vh;position:relative;">
            <div id="book-preview-content" style="padding:2rem;color:#e0e0e0;font-size:1rem;line-height:1.8;height:100%;overflow-y:auto;"></div>
            <div id="book-preview-effects" style="position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;overflow:hidden;"></div>
        </div>
        <div style="display:flex;gap:0.5rem;margin-top:0.5rem;justify-content:center;">
            <button onclick="_previewScene(-1)" style="padding:0.5rem 1rem;border:1px solid var(--border);background:#FFF8F0;border-radius:6px;cursor:pointer;">← ${t('books.prev_scene','Previous Scene')}</button>
            <span id="preview-scene-info" style="padding:0.5rem;font-size:0.85rem;color:var(--accent);"></span>
            <button onclick="_previewScene(1)" style="padding:0.5rem 1rem;border:1px solid var(--border);background:#FFF8F0;border-radius:6px;cursor:pointer;">${t('books.next_scene','Next Scene')} →</button>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:1rem;">
            <button onclick="_bookCreatorData.step=2;_renderBookCreator();" style="padding:0.7rem 1.5rem;border:1px solid var(--border);background:#FFF8F0;border-radius:8px;cursor:pointer;">← ${t('books.previous','Previous')}</button>
            <button onclick="_bookCreatorData.step=4;_renderBookCreator();" style="padding:0.7rem 1.5rem;background:#3D2B1F;color:#FFF8F0;border:none;border-radius:8px;cursor:pointer;">${t('books.publish_settings','Publish Settings')} →</button>
        </div>
    </div>`;
}

function _renderCreatorStep4() {
    const d = _bookCreatorData;
    const totalScenes = d.chapters.reduce((s, c) => s + c.scenes.length, 0);
    const treasures = d.chapters.reduce((s, c) => s + c.scenes.filter(sc => sc.treasureCode).length, 0);

    return `<div style="display:grid;gap:1rem;">
        <div style="background:#f0f7ff;padding:1.5rem;border-radius:12px;">
            <h3 style="margin:0 0 0.5rem;">${t('books.publish_summary','Publish Summary')}</h3>
            <p><strong>${d.title}</strong> — ${d.author}</p>
            <p style="font-size:0.85rem;color:var(--accent);">${d.chapters.length} ${t('books.chapters','chapters')} · ${totalScenes} ${t('books.scenes','scenes')} · ${treasures} ${t('books.treasures','treasures')}</p>
            <p style="font-size:0.85rem;color:var(--accent);">${d.edition === 'limited' ? `${t('books.limited_edition','Limited Edition')} ${d.totalSupply}` : t('books.unlimited_edition','Unlimited Edition')}</p>
        </div>
        
        <div><label style="font-size:0.85rem;font-weight:600;">${t('books.sale_price','Sale Price')} (CRGC)</label>
        <input type="number" id="bc-price" value="${d.basePrice}" onchange="_bookCreatorData.basePrice=parseFloat(this.value)||0" style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:8px;box-sizing:border-box;">
        <p style="font-size:0.75rem;color:var(--accent);">0 = ${t('books.free','Free')}</p></div>
        
        <div style="display:flex;justify-content:space-between;margin-top:1rem;">
            <button onclick="_bookCreatorData.step=3;_renderBookCreator();" style="padding:0.7rem 1.5rem;border:1px solid var(--border);background:#FFF8F0;border-radius:8px;cursor:pointer;">← ${t('books.previous','Previous')}</button>
            <div style="display:flex;gap:0.5rem;">
                <button onclick="_saveBookDraft()" style="padding:0.7rem 1.5rem;border:1px solid var(--border);background:#FFF8F0;border-radius:8px;cursor:pointer;">${t('books.save_draft','Save Draft')}</button>
                <button onclick="_publishBook()" style="padding:0.7rem 1.5rem;background:#3D2B1F;color:#FFF8F0;border:none;border-radius:8px;cursor:pointer;font-weight:700;">${t('books.publish','Publish')}</button>
            </div>
        </div>
    </div>`;
}

// Creator helpers
async function _handleCoverUpload(input) {
    if (!input.files[0]) return;
    try {
        const file = input.files[0];
        const storagePath = `books/covers/${Date.now()}_${file.name}`;
        const resized = (typeof resizeAndUploadImage === 'function')
            ? await resizeAndUploadImage(file, 600, storagePath)
            : await _fileToBase64(file);
        _bookCreatorData.coverImage = resized;
        _renderBookCreator();
    } catch (e) { showToast(t('books.image_fail','Image processing failed'), 'error'); }
}

async function _handleSceneImage(input, ci, si) {
    if (!input.files[0]) return;
    try {
        const file = input.files[0];
        const storagePath = `books/scenes/${Date.now()}_${file.name}`;
        const resized = (typeof resizeAndUploadImage === 'function')
            ? await resizeAndUploadImage(file, 400, storagePath)
            : await _fileToBase64(file);
        _bookCreatorData.chapters[ci].scenes[si].imageUrl = resized;
        _renderBookCreator();
    } catch (e) { showToast(t('books.image_fail','Image processing failed'), 'error'); }
}

function _fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function _addChapter() {
    const n = _bookCreatorData.chapters.length + 1;
    _bookCreatorData.chapters.push({
        chapterNum: n, title: `${t('books.chapter','Chapter')} ${n}`,
        scenes: [{ sceneId: `ch${n}_s1`, content: '', effect: '', sound: '', treasureCode: '', imageUrl: '' }]
    });
    _renderBookCreator();
}

function _addScene(ci) {
    const ch = _bookCreatorData.chapters[ci];
    const n = ch.scenes.length + 1;
    ch.scenes.push({ sceneId: `ch${ci + 1}_s${n}`, content: '', effect: '', sound: '', treasureCode: '', imageUrl: '' });
    _renderBookCreator();
}

function _moveChapter(ci, dir) {
    const chs = _bookCreatorData.chapters;
    const ni = ci + dir;
    if (ni < 0 || ni >= chs.length) return;
    [chs[ci], chs[ni]] = [chs[ni], chs[ci]];
    chs.forEach((c, i) => c.chapterNum = i + 1);
    _renderBookCreator();
}

function _esc(s) { return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

let _previewSceneIndex = 0;
function _previewScene(dir) {
    const d = _bookCreatorData;
    const allScenes = [];
    d.chapters.forEach(ch => ch.scenes.forEach(sc => allScenes.push({ ...sc, chapterTitle: ch.title })));
    if (!allScenes.length) return;

    if (dir !== undefined) _previewSceneIndex = Math.max(0, Math.min(allScenes.length - 1, _previewSceneIndex + dir));
    const sc = allScenes[_previewSceneIndex];

    const contentEl = document.getElementById('book-preview-content');
    const effectsEl = document.getElementById('book-preview-effects');
    const infoEl = document.getElementById('preview-scene-info');

    if (contentEl) {
        contentEl.innerHTML = `<div style="font-size:0.8rem;color:#6B5744;margin-bottom:1rem;">${sc.chapterTitle}</div>
            ${sc.imageUrl ? `<img src="${sc.imageUrl}" loading="lazy" style="max-width:100%;border-radius:8px;margin-bottom:1rem;">` : ''}
            <div style="white-space:pre-wrap;">${sc.content || t('books.no_content','(No content)')}</div>`;
    }
    if (infoEl) infoEl.textContent = `${_previewSceneIndex + 1} / ${allScenes.length}`;
    if (effectsEl) _applyEffect(effectsEl, sc.effect);
    _playSound(sc.sound);
}

// ========== SAVE / PUBLISH ==========

async function _saveBookDraft() {
    if (!currentUser) return;
    const d = _bookCreatorData;
    if (!d.title.trim()) { showToast(t('books.enter_title','Please enter a title'), 'warning'); return; }

    showLoading();
    try {
        // Count treasures
        let treasureCount = 0;
        d.chapters.forEach(ch => ch.scenes.forEach(sc => { if (sc.treasureCode) treasureCount++; }));
        d.featureCodes.treasureHunt.totalTreasures = treasureCount;

        // Collect used effects/sounds
        const usedEffects = new Set();
        const usedSounds = new Set();
        d.chapters.forEach(ch => ch.scenes.forEach(sc => {
            if (sc.effect) usedEffects.add(sc.effect);
            if (sc.sound) usedSounds.add(sc.sound);
        }));
        d.featureCodes.effects = [...usedEffects];
        d.featureCodes.sounds = [...usedSounds];

        const bookData = {
            title: d.title, author: d.author || currentUser.displayName || '',
            authorId: currentUser.uid, description: d.description,
            genre: d.genre, coverImage: d.coverImage,
            totalSupply: d.edition === 'limited' ? d.totalSupply : 0,
            soldCount: 0, edition: d.edition,
            basePrice: d.basePrice || 0, price: d.basePrice || 0, priceToken: 'CRGC',
            originalLanguage: 'ko', availableTranslations: ['ko'],
            translationStatus: {}, featureCodes: d.featureCodes,
            chapters: d.chapters, status: 'draft',
            createdAt: d.editBookId ? undefined : new Date(), updatedAt: new Date()
        };

        // Remove undefined
        Object.keys(bookData).forEach(k => bookData[k] === undefined && delete bookData[k]);

        if (d.editBookId) {
            await db.collection('books').doc(d.editBookId).update(bookData);
        } else {
            bookData.createdAt = new Date();
            bookData.publisherId = currentUser.uid;
            bookData.publisherEmail = currentUser.email;
            bookData.sold = 0;
            const ref = await db.collection('books').add(bookData);
            _bookCreatorData.editBookId = ref.id;
        }
        hideLoading();
        showToast(t('books.draft_saved','Draft saved!'), 'success');
    } catch (e) { hideLoading(); showToast(t('books.save_fail','Save failed') + ': ' + e.message, 'error'); }
}

async function _publishBook() {
    const d = _bookCreatorData;
    if (!d.title.trim()) { showToast(t('books.enter_title','Please enter a title'), 'warning'); return; }

    // Validate content
    let hasContent = false;
    d.chapters.forEach(ch => ch.scenes.forEach(sc => { if (sc.content.trim()) hasContent = true; }));
    if (!hasContent) { showToast(t('books.enter_content','Please enter content in at least one scene'), 'warning'); return; }

    if (!await showConfirmModal(t('books.publish','Publish'), `"${d.title}"\n${t('books.confirm_publish','Publish this book?')}\n${d.basePrice > 0 ? d.basePrice + ' CRGC' : t('books.free','Free')}${d.edition === 'limited' ? ` · ${t('books.limited_edition','Limited Edition')} ${d.totalSupply}` : ''}`)) return;

    d.basePrice = parseFloat(document.getElementById('bc-price')?.value) || d.basePrice;
    await _saveBookDraft();

    try {
        await db.collection('books').doc(_bookCreatorData.editBookId).update({
            status: 'published', publishedAt: new Date()
        });
        showToast(`"${d.title}" ${t('books.published','Published!')}`, 'success');
        document.getElementById('book-creator-modal')?.remove();
        loadBooksGallery();
    } catch (e) { showToast(t('books.publish_fail','Publish failed') + ': ' + e.message, 'error'); }
}

// ========== BOOK READER ==========

async function openBookReader(bookId) {
    showLoading();
    try {
        const doc = await db.collection('books').doc(bookId).get();
        if (!doc.exists) { hideLoading(); showToast(t('books.not_found','Book not found'), 'error'); return; }
        const book = doc.data();

        // Load reading progress
        let lastScene = 0;
        if (currentUser) {
            try {
                const progDoc = await db.collection('users').doc(currentUser.uid)
                    .collection('reading_progress').doc(bookId).get();
                if (progDoc.exists) lastScene = progDoc.data().sceneIndex || 0;
            } catch (e) { /* ignore */ }
        }

        // Flatten scenes
        const allScenes = [];
        (book.chapters || []).forEach(ch => {
            (ch.scenes || []).forEach(sc => {
                allScenes.push({ ...sc, chapterTitle: ch.title, chapterNum: ch.chapterNum });
            });
        });

        if (!allScenes.length) {
            hideLoading();
            showToast(t('books.no_content_yet','This book has no content yet'), 'info');
            return;
        }

        _bookReaderState = {
            bookId, book, allScenes,
            currentScene: Math.min(lastScene, allScenes.length - 1),
            fontSize: 1, fontFamily: 'default',
            ttsActive: false, ttsRate: 1,
            soundEnabled: true, effectsEnabled: true
        };

        hideLoading();
        _renderBookReader();
    } catch (e) { hideLoading(); showToast(t('books.load_fail','Loading failed') + ': ' + e.message, 'error'); }
}

function _renderBookReader() {
    const s = _bookReaderState;
    if (!s) return;

    let existing = document.getElementById('book-reader-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'book-reader-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#3D2B1F;z-index:10002;display:flex;flex-direction:column;';

    const progress = ((s.currentScene + 1) / s.allScenes.length * 100).toFixed(0);
    const sc = s.allScenes[s.currentScene];

    modal.innerHTML = `
        <div style="background:rgba(0,0,0,0.3);padding:0.5rem 1rem;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
            <button onclick="_closeReader()" style="background:none;border:none;color:#FFF8F0;font-size:1.2rem;cursor:pointer;">✕</button>
            <span style="color:#6B5744;font-size:0.8rem;">${s.book.title}</span>
            <button onclick="_toggleReaderSettings()" style="background:none;border:none;color:#FFF8F0;font-size:1.2rem;cursor:pointer;"><i data-lucide="settings" style="width:16px;height:16px;display:inline-block;vertical-align:middle"></i></button>
        </div>
        <div style="height:2px;background:#3D2B1F;flex-shrink:0;"><div style="height:100%;background:#8B6914;width:${progress}%;transition:width 0.3s;"></div></div>
        
        <div id="reader-settings-panel" style="display:none;background:rgba(61,43,31,0.5);padding:0.8rem 1rem;flex-shrink:0;">
            <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
                <button onclick="_adjustFontSize(-0.1)" style="background:#3D2B1F;color:#FFF8F0;border:none;padding:0.3rem 0.6rem;border-radius:4px;cursor:pointer;">A-</button>
                <button onclick="_adjustFontSize(0.1)" style="background:#3D2B1F;color:#FFF8F0;border:none;padding:0.3rem 0.6rem;border-radius:4px;cursor:pointer;">A+</button>
                <button onclick="_toggleEffects()" id="btn-effects-toggle" style="background:${s.effectsEnabled ? '#8B6914' : '#6B5744'};color:#FFF8F0;border:none;padding:0.3rem 0.6rem;border-radius:4px;cursor:pointer;"><i data-lucide="zap" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i></button>
                <button onclick="_toggleSound()" id="btn-sound-toggle" style="background:${s.soundEnabled ? '#8B6914' : '#6B5744'};color:#FFF8F0;border:none;padding:0.3rem 0.6rem;border-radius:4px;cursor:pointer;"><i data-lucide="volume-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i></button>
                ${s.book.featureCodes?.ttsEnabled ? `<button onclick="_toggleTTS()" id="btn-tts-toggle" style="background:${s.ttsActive ? '#C4841D' : '#6B5744'};color:#FFF8F0;border:none;padding:0.3rem 0.6rem;border-radius:4px;cursor:pointer;">TTS</button>
                <select onchange="_bookReaderState.ttsRate=parseFloat(this.value)" style="background:#3D2B1F;color:#FFF8F0;border:none;padding:0.3rem;border-radius:4px;">
                    <option value="0.7">0.7x</option><option value="1" selected>1x</option><option value="1.3">1.3x</option><option value="1.5">1.5x</option><option value="2">2x</option>
                </select>` : ''}
            </div>
        </div>
        
        <div id="reader-scene-container" style="flex:1;overflow-y:auto;position:relative;">
            <div id="reader-effects-layer" style="position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;overflow:hidden;z-index:1;"></div>
            <div id="reader-content" style="position:relative;z-index:2;padding:1.5rem;color:#e0e0e0;font-size:${s.fontSize}rem;line-height:1.8;max-width:700px;margin:0 auto;" onclick="_handleReaderClick(event)">
                <div style="font-size:0.75rem;color:#6B5744;margin-bottom:1rem;">${sc.chapterTitle || ''}</div>
                ${sc.imageUrl ? `<img src="${sc.imageUrl}" loading="lazy" style="max-width:100%;border-radius:8px;margin-bottom:1rem;">` : ''}
                <div id="reader-text">${_renderSceneText(sc)}</div>
            </div>
        </div>
        
        <div style="background:rgba(0,0,0,0.3);padding:0.8rem 1rem;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
            <button onclick="_navigateScene(-1)" style="background:${s.currentScene > 0 ? '#3D2B1F' : '#6B5744'};color:${s.currentScene > 0 ? '#FFF8F0' : '#6B5744'};border:none;padding:0.5rem 1.5rem;border-radius:8px;cursor:pointer;" ${s.currentScene <= 0 ? 'disabled' : ''}>← ${t('books.previous','Previous')}</button>
            <span style="color:#6B5744;font-size:0.8rem;">${s.currentScene + 1} / ${s.allScenes.length}</span>
            <button onclick="_navigateScene(1)" style="background:${s.currentScene < s.allScenes.length - 1 ? '#3D2B1F' : '#6B5744'};color:${s.currentScene < s.allScenes.length - 1 ? '#FFF8F0' : '#6B5744'};border:none;padding:0.5rem 1.5rem;border-radius:8px;cursor:pointer;" ${s.currentScene >= s.allScenes.length - 1 ? 'disabled' : ''}>${t('books.next','Next')} →</button>
        </div>
    `;
    document.body.appendChild(modal);

    // Apply effects
    if (s.effectsEnabled) {
        _applyEffect(document.getElementById('reader-effects-layer'), sc.effect);
    }
    if (s.soundEnabled) {
        _playSound(sc.sound);
    }

    // Swipe support
    _setupSwipe(document.getElementById('reader-scene-container'));

    // Keyboard
    _readerKeyHandler = (e) => {
        if (e.key === 'ArrowLeft') _navigateScene(-1);
        else if (e.key === 'ArrowRight') _navigateScene(1);
        else if (e.key === 'Escape') _closeReader();
    };
    document.addEventListener('keydown', _readerKeyHandler);
}

let _readerKeyHandler = null;

function _renderSceneText(sc) {
    let text = _esc(sc.content || '');
    // Insert treasure word triggers (hidden in text)
    if (sc.treasureCode) {
        // Make every word clickable for treasure detection
        // The "treasure" is finding the right word — we mark it with data attribute
        const words = text.split(/(\s+)/);
        const treasureWordIndex = Math.floor(words.filter(w => w.trim()).length * 0.618); // Golden ratio position
        let wordCount = 0;
        text = words.map(w => {
            if (!w.trim()) return w;
            wordCount++;
            if (wordCount === treasureWordIndex) {
                return `<span class="book-treasure-word" data-treasure="${sc.treasureCode}" data-scene="${sc.sceneId}">${w}</span>`;
            }
            return `<span class="book-word">${w}</span>`;
        }).join('');
    }
    return text.replace(/\n/g, '<br>');
}

function _handleReaderClick(e) {
    const tw = e.target.closest('.book-treasure-word');
    if (tw) {
        const code = tw.dataset.treasure;
        const sceneId = tw.dataset.scene;
        _claimTreasure(code, sceneId);
    }
}

async function _claimTreasure(code, sceneId) {
    if (!currentUser || !_bookReaderState) return;
    const bookId = _bookReaderState.bookId;
    const treasureId = `${bookId}_${sceneId}`;

    try {
        // Check duplicate
        const existing = await db.collection('users').doc(currentUser.uid)
            .collection('foundTreasures').doc(treasureId).get();
        if (existing.exists) {
            showToast(t('books.treasure_already_found','Treasure already found!'), 'info');
            return;
        }

        const reward = _bookReaderState.book.featureCodes?.treasureHunt?.rewards?.amount || 10;

        // Award treasure
        await db.collection('users').doc(currentUser.uid)
            .collection('foundTreasures').doc(treasureId).set({
                bookId, sceneId, code, foundAt: new Date(), reward
            });

        // Give CRGC reward
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const bal = userDoc.data()?.offchainBalances || {};
        await db.collection('users').doc(currentUser.uid).update({
            ['offchainBalances.crgc']: (bal.crgc || 0) + reward
        });

        // Celebration modal
        _showTreasureModal(reward);
    } catch (e) { showToast(t('books.treasure_claim_fail','Treasure claim failed') + ': ' + e.message, 'error'); }
}

function _showTreasureModal(reward) {
    const m = document.createElement('div');
    m.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.8);z-index:10010;display:flex;align-items:center;justify-content:center;';
    m.onclick = () => m.remove();
    m.innerHTML = `<div style="background:#FFF8F0;border-radius:20px;padding:2rem;text-align:center;max-width:300px;animation:bounceIn 0.5s;">
        <div style="font-size:4rem;"><i data-lucide="trophy" style="width:48px;height:48px;display:inline-block;vertical-align:middle"></i></div>
        <h2 style="margin:0.5rem 0;">${t('books.treasure_found','Treasure Found!')}</h2>
        <p style="color:#3D2B1F;font-size:1.5rem;font-weight:700;">${reward} CRGC ${t('books.earned','earned!')}!</p>
        <p style="color:var(--accent);font-size:0.85rem;">${t('books.treasure_found_desc','You found a hidden treasure!')}</p>
    </div>`;
    document.body.appendChild(m);
    setTimeout(() => m.remove(), 3000);
}

function _navigateScene(dir) {
    const s = _bookReaderState;
    if (!s) return;
    const next = s.currentScene + dir;
    if (next < 0 || next >= s.allScenes.length) return;

    // Stop TTS
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    _bookTTSActive = false;

    s.currentScene = next;
    _saveReadingProgress();
    _renderBookReader();
}

function _saveReadingProgress() {
    if (!currentUser || !_bookReaderState) return;
    const { bookId, currentScene } = _bookReaderState;
    db.collection('users').doc(currentUser.uid)
        .collection('reading_progress').doc(bookId)
        .set({ sceneIndex: currentScene, updatedAt: new Date() }, { merge: true })
        .catch(e => console.warn(e.message));
}

function _closeReader() {
    _saveReadingProgress();
    _stopSound();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (_readerKeyHandler) document.removeEventListener('keydown', _readerKeyHandler);
    document.getElementById('book-reader-modal')?.remove();
    _bookReaderState = null;
}

function _toggleReaderSettings() {
    const p = document.getElementById('reader-settings-panel');
    if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

function _adjustFontSize(delta) {
    if (!_bookReaderState) return;
    _bookReaderState.fontSize = Math.max(0.7, Math.min(2, _bookReaderState.fontSize + delta));
    const el = document.getElementById('reader-content');
    if (el) el.style.fontSize = _bookReaderState.fontSize + 'rem';
}

function _toggleEffects() {
    if (!_bookReaderState) return;
    _bookReaderState.effectsEnabled = !_bookReaderState.effectsEnabled;
    const btn = document.getElementById('btn-effects-toggle');
    if (btn) btn.style.background = _bookReaderState.effectsEnabled ? '#8B6914' : '#6B5744';
    const layer = document.getElementById('reader-effects-layer');
    if (layer) {
        if (_bookReaderState.effectsEnabled) {
            _applyEffect(layer, _bookReaderState.allScenes[_bookReaderState.currentScene]?.effect);
        } else {
            layer.innerHTML = '';
        }
    }
}

function _toggleSound() {
    if (!_bookReaderState) return;
    _bookReaderState.soundEnabled = !_bookReaderState.soundEnabled;
    const btn = document.getElementById('btn-sound-toggle');
    if (btn) btn.style.background = _bookReaderState.soundEnabled ? '#8B6914' : '#6B5744';
    if (!_bookReaderState.soundEnabled) _stopSound();
    else _playSound(_bookReaderState.allScenes[_bookReaderState.currentScene]?.sound);
}

function _toggleTTS() {
    if (!_bookReaderState) return;
    _bookReaderState.ttsActive = !_bookReaderState.ttsActive;
    const btn = document.getElementById('btn-tts-toggle');
    if (btn) btn.style.background = _bookReaderState.ttsActive ? '#C4841D' : '#6B5744';

    if (_bookReaderState.ttsActive) {
        _startTTS();
    } else {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    }
}

function _startTTS() {
    if (!_bookReaderState || !_bookReaderState.ttsActive) return;
    if (!window.speechSynthesis) { showToast(t('books.tts_not_supported','Text-to-speech not supported'), 'warning'); return; }

    const sc = _bookReaderState.allScenes[_bookReaderState.currentScene];
    const text = sc.content || '';
    if (!text.trim()) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = _bookReaderState.ttsRate;
    utterance.lang = 'ko-KR';

    // Highlight current sentence
    const sentences = text.split(/(?<=[.!?。])\s*/);
    let sentenceIndex = 0;

    utterance.onboundary = (e) => {
        if (e.name === 'sentence') {
            _highlightSentence(sentenceIndex);
            sentenceIndex++;
        }
    };

    utterance.onend = () => {
        _bookReaderState.ttsActive = false;
        const btn = document.getElementById('btn-tts-toggle');
        if (btn) btn.style.background = '#6B5744';
        _clearHighlight();
    };

    window.speechSynthesis.speak(utterance);
}

function _highlightSentence(index) {
    const textEl = document.getElementById('reader-text');
    if (!textEl) return;
    // Simple highlight by wrapping
    const sc = _bookReaderState?.allScenes[_bookReaderState.currentScene];
    if (!sc) return;
    const sentences = (sc.content || '').split(/(?<=[.!?。])\s*/);
    if (index >= sentences.length) return;

    const html = sentences.map((s, i) =>
        i === index ? `<span style="background:rgba(255,165,0,0.3);border-radius:4px;padding:0 2px;">${_esc(s)}</span>` : _esc(s)
    ).join(' ');
    textEl.innerHTML = html;
}

function _clearHighlight() {
    const sc = _bookReaderState?.allScenes[_bookReaderState?.currentScene];
    if (sc) {
        const textEl = document.getElementById('reader-text');
        if (textEl) textEl.innerHTML = _renderSceneText(sc);
    }
}

// Swipe
function _setupSwipe(el) {
    if (!el) return;
    let startX = 0;
    el.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 60) _navigateScene(dx < 0 ? 1 : -1);
    }, { passive: true });
}

// ========== CSS EFFECTS ENGINE ==========

function _applyEffect(container, effect) {
    if (!container) return;
    container.innerHTML = '';
    if (!effect) return;

    const count = { snow: 30, rain: 60, cherry_blossom: 20, firefly: 25, stars: 40 }[effect] || 0;

    for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        const left = Math.random() * 100;
        const delay = Math.random() * 5;
        const duration = 3 + Math.random() * 5;
        const size = 0.5 + Math.random() * 1;

        if (effect === 'snow') {
            el.className = 'snowflake';
            el.textContent = ['❄', '❅', '❆', '•'][Math.floor(Math.random() * 4)];
            el.style.cssText = `position:absolute;color:#FFF8F0;font-size:${size}em;left:${left}%;top:-5%;opacity:${0.5 + Math.random() * 0.5};pointer-events:none;animation:snowfall ${duration}s linear ${delay}s infinite;`;
        } else if (effect === 'rain') {
            el.style.cssText = `position:absolute;width:1px;height:${10 + Math.random() * 20}px;background:rgba(174,194,224,${0.3 + Math.random() * 0.4});left:${left}%;top:-5%;pointer-events:none;animation:rainfall ${0.5 + Math.random() * 0.5}s linear ${delay * 0.2}s infinite;`;
        } else if (effect === 'cherry_blossom') {
            el.textContent = ['🌸', '🩷', '✿'][Math.floor(Math.random() * 3)];
            el.style.cssText = `position:absolute;font-size:${size}em;left:${left}%;top:-5%;opacity:${0.6 + Math.random() * 0.4};pointer-events:none;animation:cherryfall ${duration + 2}s linear ${delay}s infinite;`;
        } else if (effect === 'firefly') {
            el.style.cssText = `position:absolute;width:${3 + Math.random() * 4}px;height:${3 + Math.random() * 4}px;background:rgba(255,255,100,0.8);border-radius:50%;left:${left}%;top:${Math.random() * 100}%;pointer-events:none;box-shadow:0 0 6px rgba(255,255,100,0.6);animation:fireflyGlow ${2 + Math.random() * 3}s ease-in-out ${delay}s infinite alternate;`;
        } else if (effect === 'stars') {
            el.textContent = ['✦', '★', '·', '⋆'][Math.floor(Math.random() * 4)];
            el.style.cssText = `position:absolute;color:#FFF8F0;font-size:${size * 0.6}em;left:${left}%;top:${Math.random() * 100}%;pointer-events:none;animation:starTwinkle ${1.5 + Math.random() * 3}s ease-in-out ${delay}s infinite alternate;`;
        }
        container.appendChild(el);
    }
}

// ========== SOUND ENGINE ==========

function _playSound(soundKey) {
    _stopSound();
    if (!soundKey || !BOOK_SOUNDS[soundKey]) return;

    _bookAudio = new Audio(BOOK_SOUNDS[soundKey]);
    _bookAudio.loop = true;
    _bookAudio.volume = 0;
    _bookAudio.play().catch(e => console.warn(e.message));

    // Fade in
    let vol = 0;
    const fadeIn = setInterval(() => {
        vol += 0.05;
        if (_bookAudio) _bookAudio.volume = Math.min(vol, 0.4);
        if (vol >= 0.4) clearInterval(fadeIn);
    }, 100);
}

function _stopSound() {
    if (_bookAudio) {
        // Fade out
        let vol = _bookAudio.volume;
        const fadeOut = setInterval(() => {
            vol -= 0.05;
            if (_bookAudio) _bookAudio.volume = Math.max(vol, 0);
            if (vol <= 0) { clearInterval(fadeOut); if (_bookAudio) { _bookAudio.pause(); _bookAudio = null; } }
        }, 50);
    }
}

// ========== MY LIBRARY ==========

async function showMyLibrary() {
    if (!currentUser) { showToast(t('common.login_required','Login required'), 'warning'); return; }

    const modal = document.createElement('div');
    modal.id = 'my-library-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#FFF8F0;z-index:10001;overflow-y:auto;';

    modal.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;padding:1rem;border-bottom:1px solid #E8E0D8;">
        <h2 style="margin:0;font-size:1.1rem;">${t('books.my_library','My Library')}</h2>
        <button onclick="document.getElementById('my-library-modal')?.remove()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;">&times;</button>
    </div>
    <div style="display:flex;border-bottom:1px solid #E8E0D8;">
        <button onclick="_showLibraryTab('purchased')" class="lib-tab active" style="flex:1;padding:0.8rem;border:none;background:#FFF8F0;cursor:pointer;font-weight:700;border-bottom:2px solid #3D2B1F;">${t('books.purchased','Purchased')}</button>
        <button onclick="_showLibraryTab('wishlist')" class="lib-tab" style="flex:1;padding:0.8rem;border:none;background:#FFF8F0;cursor:pointer;"><i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('books.wishlist','Wishlist')}</button>
        <button onclick="_showLibraryTab('treasures')" class="lib-tab" style="flex:1;padding:0.8rem;border:none;background:#FFF8F0;cursor:pointer;">${t('books.treasures','Treasures')}</button>
        <button onclick="_showLibraryTab('translations')" class="lib-tab" style="flex:1;padding:0.8rem;border:none;background:#FFF8F0;cursor:pointer;">${t('books.translations','Translations')}</button>
    </div>
    <div id="library-content" style="padding:1rem;">${t('books.loading','Loading...')}</div>`;

    document.body.appendChild(modal);
    _loadLibraryPurchased();
}

function _showLibraryTab(tab) {
    document.querySelectorAll('.lib-tab').forEach(t => { t.style.fontWeight = '400'; t.style.borderBottom = 'none'; });
    event.target.style.fontWeight = '700';
    event.target.style.borderBottom = '2px solid #3D2B1F';

    if (tab === 'purchased') _loadLibraryPurchased();
    else if (tab === 'wishlist') _loadLibraryWishlist();
    else if (tab === 'treasures') _loadLibraryTreasures();
    else if (tab === 'translations') _loadLibraryTranslations();
}

async function _loadLibraryPurchased() {
    const c = document.getElementById('library-content');
    if (!c) return;
    c.innerHTML = t('books.loading','Loading...');
    try {
        const snap = await db.collection('book_purchases').where('userId', '==', currentUser.uid).orderBy('purchasedAt', 'desc').limit(50).get();
        if (snap.empty) { c.innerHTML = '<p style="color:var(--accent);text-align:center;padding:2rem;">' + t('books.no_library','No books in your library') + '</p>'; return; }

        let html = '<div style="display:grid;gap:0.8rem;">';
        for (const d of snap.docs) {
            const p = d.data();
            // Get progress
            let progress = 0;
            try {
                const progDoc = await db.collection('users').doc(currentUser.uid).collection('reading_progress').doc(p.bookId).get();
                if (progDoc.exists) {
                    const bookDoc = await db.collection('books').doc(p.bookId).get();
                    if (bookDoc.exists) {
                        const totalScenes = (bookDoc.data().chapters || []).reduce((s, ch) => s + (ch.scenes || []).length, 0);
                        progress = totalScenes > 0 ? Math.round((progDoc.data().sceneIndex + 1) / totalScenes * 100) : 0;
                    }
                }
            } catch (e) { console.warn(e.message); }

            html += `<div onclick="openBookReader('${p.bookId}')" style="display:flex;gap:0.8rem;padding:0.8rem;background:#f9f9f9;border-radius:10px;cursor:pointer;align-items:center;">
                <div style="flex-shrink:0;width:50px;height:65px;background:#e0e0e0;border-radius:6px;display:flex;align-items:center;justify-content:center;"><i data-lucide="book-open" style="width:20px;height:20px;display:inline-block;vertical-align:middle"></i></div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:0.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.bookTitle}</div>
                    ${p.editionNumber ? `<div style="font-size:0.75rem;color:#6B5744;">#${p.editionNumber}</div>` : ''}
                    <div style="height:4px;background:#e0e0e0;border-radius:2px;margin-top:0.3rem;">
                        <div style="height:100%;background:#8B6914;border-radius:2px;width:${progress}%;"></div>
                    </div>
                    <div style="font-size:0.7rem;color:var(--accent);margin-top:0.1rem;">${progress}% ${t('books.read_progress','read')}</div>
                </div>
            </div>`;
        }
        c.innerHTML = html + '</div>';
    } catch (e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

async function _loadLibraryWishlist() {
    const c = document.getElementById('library-content');
    if (!c) return;
    c.innerHTML = t('books.loading','Loading...');
    try {
        const snap = await db.collection('reading_list').where('userId', '==', currentUser.uid).orderBy('addedAt', 'desc').limit(50).get();
        if (snap.empty) { c.innerHTML = '<p style="color:var(--accent);text-align:center;padding:2rem;">' + t('books.wishlist_empty','Wishlist is empty') + '</p>'; return; }
        let html = '<div style="display:grid;gap:0.5rem;">';
        snap.forEach(d => {
            const r = d.data();
            html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.6rem;background:#f9f9f9;border-radius:8px;">
                <div onclick="viewBookDetailV2('${r.bookId}')" style="cursor:pointer;"><strong>${r.bookTitle}</strong> <span style="color:var(--accent);font-size:0.8rem;">${r.bookAuthor}</span></div>
                <button onclick="removeFromReadingList('${d.id}')" style="background:none;border:none;cursor:pointer;">✕</button>
            </div>`;
        });
        c.innerHTML = html + '</div>';
    } catch (e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

async function _loadLibraryTreasures() {
    const c = document.getElementById('library-content');
    if (!c) return;
    c.innerHTML = t('books.loading','Loading...');
    try {
        const snap = await db.collection('users').doc(currentUser.uid).collection('foundTreasures').orderBy('foundAt', 'desc').limit(50).get();
        if (snap.empty) { c.innerHTML = `<p style="color:var(--accent);text-align:center;padding:2rem;">${t('books.no_treasures','No treasures found yet')}<br>${t('books.find_treasures','Read books and find hidden treasures!')} ${createLucideIcon('target')}</p>`; return; }
        let html = '<div style="display:grid;gap:0.5rem;">';
        let total = 0;
        snap.forEach(d => {
            const t = d.data();
            total += t.reward || 0;
            html += `<div style="display:flex;justify-content:space-between;padding:0.6rem;background:#F7F3ED;border-radius:8px;">
                <span>${t.bookId}</span><span style="color:#C4841D;font-weight:700;">+${t.reward} CRGC</span>
            </div>`;
        });
        html = `<div style="background:#C4841D;color:#FFF8F0;padding:1rem;border-radius:10px;text-align:center;margin-bottom:1rem;"><h3 style="margin:0;">${t('books.total_treasure_reward','Total Treasure Reward')}: ${total} CRGC</h3></div>` + html;
        c.innerHTML = html + '</div>';
        if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
    } catch (e) { c.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

async function _loadLibraryTranslations() {
    const c = document.getElementById('library-content');
    if (!c) return;
    c.innerHTML = '<p style="color:var(--accent);text-align:center;padding:2rem;">' + t('books.translations_coming','Translation contribution feature coming soon...') + '</p>';
}

// ========== TRANSLATION SYSTEM ==========

async function requestTranslation(bookId) {
    if (!currentUser) { showToast(t('common.login_required','Login required'), 'warning'); return; }

    const lang = await _selectLanguage();
    if (!lang) return;

    try {
        const existing = await db.collection('translation_requests')
            .where('bookId', '==', bookId).where('targetLang', '==', lang).limit(1).get();
        if (!existing.empty) {
            showToast(t('books.translation_already_requested','Translation already requested for this language'), 'info');
            return;
        }

        await db.collection('translation_requests').add({
            bookId, requesterId: currentUser.uid,
            targetLang: lang, status: 'pending',
            createdAt: new Date()
        });

        showToast(`${_langLabel(lang)} ${t('books.translation_requested','translation requested!')}`, 'success');
    } catch (e) { showToast(t('books.request_fail','Request failed') + ': ' + e.message, 'error'); }
}

function _selectLanguage() {
    return new Promise((resolve) => {
        const langs = [
            { code: 'en', label: '🇺🇸 English' },
            { code: 'ja', label: '🇯🇵 日本語' },
            { code: 'zh', label: '🇨🇳 中文' },
            { code: 'es', label: '🇪🇸 Español' },
            { code: 'fr', label: '🇫🇷 Français' },
            { code: 'de', label: '🇩🇪 Deutsch' }
        ];

        const m = document.createElement('div');
        m.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.5);z-index:10010;display:flex;align-items:center;justify-content:center;';
        m.innerHTML = `<div style="background:#FFF8F0;border-radius:12px;padding:1.5rem;max-width:300px;width:90%;">
            <h3 style="margin:0 0 1rem;">${t('books.select_language','Select Translation Language')}</h3>
            <div style="display:grid;gap:0.5rem;">
                ${langs.map(l => `<button onclick="this.closest('div').closest('div').closest('div')._resolve('${l.code}')" style="padding:0.7rem;border:1px solid var(--border);background:#FFF8F0;border-radius:8px;cursor:pointer;text-align:left;font-size:1rem;">${l.label}</button>`).join('')}
            </div>
            <button onclick="this.closest('div').closest('div')._resolve(null)" style="width:100%;margin-top:0.5rem;padding:0.5rem;border:none;background:#E8E0D8;border-radius:8px;cursor:pointer;">${t('common.cancel','Cancel')}</button>
        </div>`;
        m._resolve = (val) => { m.remove(); resolve(val); };
        document.body.appendChild(m);
    });
}

// ========== OVERRIDE OLD FUNCTIONS ==========

// Override old loadBooksList to use new gallery
const _origLoadBooksList = typeof loadBooksList === 'function' ? loadBooksList : null;
window.loadBooksList = function() {
    if (document.getElementById('books-gallery-content')) {
        loadBooksGallery();
    } else if (_origLoadBooksList) {
        _origLoadBooksList();
    }
};

// Override viewBookDetail
window.viewBookDetail = viewBookDetailV2;

// Override buyBook
window.buyBook = buyBookV2;

// ========== INIT ==========

// Auto-load gallery when books page shown
const _origShowPage = typeof showPage === 'function' ? showPage : null;
if (_origShowPage) {
    const _wrappedShowPage = window.showPage;
    window.showPage = function(page) {
        _wrappedShowPage(page);
        if (page === 'books') {
            setTimeout(() => loadBooksGallery(), 100);
        }
    };
}

// Preview init on step 3
document.addEventListener('DOMNodeInserted', function(e) {
    if (e.target.id === 'book-preview-content' || (e.target.querySelector && e.target.querySelector('#book-preview-content'))) {
        setTimeout(() => { _previewSceneIndex = 0; _previewScene(0); }, 100);
    }
});

console.log('📚 Books Platform v1.0 loaded');
