// ===== search.js v1.0 - 통합 검색 =====

let searchCache = {};
let searchDebounceTimer = null;

function openGlobalSearch() {
    const overlay = document.getElementById('search-overlay');
    if (overlay) {
        overlay.classList.add('active');
        const input = document.getElementById('global-search-input');
        if (input) { input.value = ''; input.focus(); }
        document.getElementById('search-results').innerHTML = `<p class="search-hint">${t('search.hint', 'Enter your search...')}</p>`;
    }
}

function closeGlobalSearch() {
    const overlay = document.getElementById('search-overlay');
    if (overlay) overlay.classList.remove('active');
}

async function loadSearchCache() {
    if (!currentUser) return;
    
    const collections = [
        { key: 'products', col: 'products', fields: ['title', 'description'], icon: 'shopping-cart', page: 'mall' },
        { key: 'artworks', col: 'artworks', fields: ['title', 'artist'], icon: 'palette', page: 'art' },
        { key: 'artists', col: 'artists', fields: ['name', 'displayName'], icon: 'music', page: 'artist' },
        { key: 'books', col: 'books', fields: ['title', 'author'], icon: 'book', page: 'books' },
        { key: 'users', col: 'users', fields: ['nickname', 'email'], icon: 'user', page: 'social' },
        { key: 'campaigns', col: 'campaigns', fields: ['title'], icon: 'heart', page: 'fundraise' },
        { key: 'posts', col: 'posts', fields: ['text'], icon: 'file-text', page: 'social' },
    ];
    
    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    const _headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
    const promises = collections.map(async (c) => {
        try {
            const res = await fetch(`/api/db/${c.col}?orderBy=createdAt&orderDir=desc&limit=100`, { headers: _headers });
            const result = await res.json();
            searchCache[c.key] = (result.docs || []).map(d => ({ id: d.id, ...d.data, _meta: c }));
        } catch(e) {
            // Fallback without ordering
            try {
                const res2 = await fetch(`/api/db/${c.col}?limit=100`, { headers: _headers });
                const result2 = await res2.json();
                searchCache[c.key] = (result2.docs || []).map(d => ({ id: d.id, ...d.data, _meta: c }));
            } catch(e2) {
                searchCache[c.key] = [];
            }
        }
    });
    
    await Promise.all(promises);
}

function performSearch(query) {
    if (!query || query.length < 2) {
        document.getElementById('search-results').innerHTML = `<p class="search-hint">${t('search.hint', 'Enter your search...')}</p>`;
        return;
    }
    
    const q = query.toLowerCase();
    let html = '';
    let totalResults = 0;
    
    for (const [key, items] of Object.entries(searchCache)) {
        if (!items || !items.length) continue;
        const meta = items[0]?._meta;
        if (!meta) continue;
        
        const matched = items.filter(item => {
            return meta.fields.some(f => {
                const val = item[f];
                return val && String(val).toLowerCase().includes(q);
            });
        });
        
        if (matched.length === 0) continue;
        totalResults += matched.length;
        
        html += `<div class="search-category">
            <h4><i data-lucide="${meta.icon}"></i> ${key.toUpperCase()} (${matched.length})</h4>
            ${matched.slice(0, 10).map(item => {
                const label = meta.fields.map(f => item[f]).filter(Boolean).join(' · ');
                return `<div class="search-result-item" onclick="closeGlobalSearch(); showPage('${meta.page}');">
                    <span>${label}</span>
                </div>`;
            }).join('')}
        </div>`;
    }
    
    if (totalResults === 0) {
        html = `<p class="search-empty">${t('search.no_results', 'No results found')}</p>`;
    }
    
    document.getElementById('search-results').innerHTML = html;
}

function onSearchInput(e) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        performSearch(e.target.value.trim());
    }, 300);
}

// Load cache on auth
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('global-search-input');
    if (input) input.addEventListener('input', onSearchInput);
    
    // ESC to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeGlobalSearch();
    });
});
