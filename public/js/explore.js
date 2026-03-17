// ===== explore.js v1.0 - 탐색/발견 탭 (인스타그램 Explore) =====

let _exploreFilter = 'all';
let _exploreSearchQuery = '';

// ========== EXPLORE TAB CONTENT ==========
async function loadExploreTab() {
    if (!currentUser) return;
    const container = document.getElementById('explore-content');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--accent);"><i data-lucide="search"></i> 탐색 로딩 중...</p>';

    try {
        // Build explore content
        let html = '';

        // Search bar
        html += `<div style="margin-bottom:1rem;">
            <div style="display:flex;gap:0.5rem;">
                <input type="text" id="explore-search-input" placeholder="<i data-lucide=\"search\"></i> 사용자, 해시태그, 게시물 검색..." value="${_exploreSearchQuery}" style="flex:1;padding:0.7rem 1rem;border:1px solid var(--border);border-radius:12px;font-size:0.9rem;outline:none;" onkeypress="if(event.key==='Enter')runExploreSearch()">
                <button onclick="runExploreSearch()" style="padding:0.7rem 1rem;border:none;border-radius:12px;background:#3D2B1F;color:#FFF8F0;cursor:pointer;font-weight:600;">검색</button>
            </div>
        </div>`;

        // Category filters
        html += `<div style="display:flex;gap:0.4rem;margin-bottom:1rem;overflow-x:auto;padding-bottom:0.3rem;">
            ${['all','photo','video','service'].map(f => {
                const labels = { all:'전체', photo:'<i data-lucide="camera"></i> 사진', video:'<i data-lucide="video"></i> 영상', service:'<i data-lucide="link"></i> 서비스' };
                const active = _exploreFilter === f;
                return `<button onclick="setExploreFilter('${f}')" style="padding:0.4rem 0.8rem;border:1px solid ${active ? '#3D2B1F' : 'var(--border)'};border-radius:20px;background:${active ? '#3D2B1F' : '#FFF8F0'};color:${active ? '#FFF8F0' : 'var(--text)'};font-size:0.8rem;font-weight:600;cursor:pointer;white-space:nowrap;">${labels[f]}</button>`;
            }).join('')}
        </div>`;

        // Search results container
        html += '<div id="explore-search-results" style="display:none;margin-bottom:1.5rem;"></div>';

        // Trending hashtags
        html += '<div id="explore-trending" style="margin-bottom:1.5rem;"></div>';

        // Recommended users
        html += '<div id="explore-recommended" style="margin-bottom:1.5rem;"></div>';

        // Popular posts grid
        html += '<div id="explore-grid"></div>';

        container.innerHTML = html;

        // Load sections in parallel
        await Promise.all([
            loadTrendingHashtags(),
            loadRecommendedUsers(),
            loadExploreGrid()
        ]);
        if(window.lucide) lucide.createIcons();
    } catch (e) {
        console.error('Explore error:', e);
        container.innerHTML = `<p style="text-align:center;color:red;">탐색 로드 실패: ${e.message}</p>`;
    }
}

function setExploreFilter(filter) {
    _exploreFilter = filter;
    loadExploreGrid();
}

// ========== TRENDING HASHTAGS ==========
async function loadTrendingHashtags() {
    const container = document.getElementById('explore-trending');
    if (!container) return;

    try {
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const posts = await db.collection('posts')
            .where('timestamp', '>', oneWeekAgo)
            .limit(200)
            .get();

        const tagCounts = {};
        posts.docs.forEach(doc => {
            const hashtags = doc.data().hashtags || [];
            hashtags.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        });

        const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
        if (sorted.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `
            <div style="font-weight:700;font-size:0.9rem;margin-bottom:0.5rem;"><i data-lucide="flame"></i> 인기 해시태그</div>
            <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
                ${sorted.map(([tag, count]) =>
                    `<button onclick="filterByHashtag('${tag}');setSocialFilter('all');showExploreTab(false)" style="padding:0.4rem 0.8rem;border:1px solid var(--border);border-radius:20px;background:var(--bg);font-size:0.8rem;cursor:pointer;white-space:nowrap;">#${tag} <span style="color:var(--accent);font-size:0.7rem;">${count}</span></button>`
                ).join('')}
            </div>`;
    } catch (e) {
        container.innerHTML = '';
    }
}

// ========== RECOMMENDED USERS ==========
async function loadRecommendedUsers() {
    const container = document.getElementById('explore-recommended');
    if (!container) return;

    try {
        // Get users I'm following
        const followingSnap = await db.collection('users').doc(currentUser.uid).collection('following').get();
        const followingSet = new Set(followingSnap.docs.map(d => d.id));
        followingSet.add(currentUser.uid);

        // Get users with most followers (approximation: get users with most posts)
        const usersSnap = await db.collection('users').limit(50).get();
        const userScores = [];

        for (const doc of usersSnap.docs) {
            if (followingSet.has(doc.id)) continue;
            const followersSnap = await db.collection('users').doc(doc.id).collection('followers').get();
            userScores.push({ uid: doc.id, data: doc.data(), followers: followersSnap.size });
        }

        userScores.sort((a, b) => b.followers - a.followers);
        const top = userScores.slice(0, 5);

        if (top.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `
            <div style="font-weight:700;font-size:0.9rem;margin-bottom:0.5rem;"><i data-lucide="user"></i> 추천 사용자</div>
            <div style="display:flex;gap:0.8rem;overflow-x:auto;padding-bottom:0.5rem;">
                ${top.map(u => {
                    const nickname = u.data.nickname || u.data.email?.split('@')[0] || '사용자';
                    return `<div style="min-width:120px;text-align:center;padding:0.8rem;border:1px solid var(--border);border-radius:12px;background:#FFF8F0;">
                        <div onclick="showUserProfile('${u.uid}')" style="cursor:pointer;">
                            ${avatarHTML(u.data.photoURL, nickname, 48)}
                        </div>
                        <div style="font-size:0.8rem;font-weight:600;margin-top:0.3rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${nickname}</div>
                        <div style="font-size:0.7rem;color:var(--accent);">팔로워 ${u.followers}</div>
                        <button onclick="followUser('${u.uid}');this.textContent='팔로잉 ✓';this.disabled=true;" style="margin-top:0.4rem;padding:0.3rem 0.6rem;border:none;border-radius:6px;background:#3D2B1F;color:#FFF8F0;font-size:0.75rem;cursor:pointer;font-weight:600;">팔로우</button>
                    </div>`;
                }).join('')}
            </div>`;
    } catch (e) {
        container.innerHTML = '';
    }
}

// ========== EXPLORE GRID (POPULAR POSTS) ==========
async function loadExploreGrid() {
    const container = document.getElementById('explore-grid');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center;padding:1rem;color:var(--accent);">로딩...</p>';

    try {
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const postsSnap = await db.collection('posts')
            .where('timestamp', '>', oneWeekAgo)
            .limit(100)
            .get();

        let posts = postsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filter by category
        if (_exploreFilter === 'photo') posts = posts.filter(p => p.imageUrl && !p.videoUrl);
        else if (_exploreFilter === 'video') posts = posts.filter(p => p.videoUrl);
        else if (_exploreFilter === 'service') posts = posts.filter(p => p.serviceLink);

        // Sort by popularity (likes + comments)
        posts.sort((a, b) => ((b.likes || 0) + (b.commentCount || 0)) - ((a.likes || 0) + (a.commentCount || 0)));

        if (posts.length === 0) {
            container.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--accent);">게시물이 없습니다</p>';
            return;
        }

        // Mosaic grid
        let gridHTML = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px;">';
        for (const post of posts.slice(0, 30)) {
            let thumb = '';
            if (post.videoUrl) {
                thumb = `<div style="position:relative;"><video src="${post.videoUrl}" style="width:100%;aspect-ratio:1;object-fit:cover;display:block;" muted preload="metadata"></video><span style="position:absolute;top:6px;right:6px;color:#FFF8F0;font-size:0.8rem;text-shadow:0 1px 3px rgba(61,43,31,0.8);"><i data-lucide="video"></i></span></div>`;
            } else if (post.imageUrl) {
                thumb = `<img src="${post.imageUrl}" style="width:100%;aspect-ratio:1;object-fit:cover;display:block;" loading="lazy">`;
            } else {
                // Text only
                thumb = `<div style="width:100%;aspect-ratio:1;background:linear-gradient(135deg,#8B6914,#6B5744);display:flex;align-items:center;justify-content:center;padding:0.5rem;"><span style="color:#FFF8F0;font-size:0.7rem;text-align:center;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;">${(post.text || '').substring(0, 80)}</span></div>`;
            }

            gridHTML += `<div onclick="scrollToPostOrOpen('${post.id}')" style="cursor:pointer;position:relative;overflow:hidden;">
                ${thumb}
                <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(61,43,31,0.6));padding:4px 6px;display:flex;gap:0.4rem;align-items:center;">
                    <span style="color:#FFF8F0;font-size:0.65rem;"><i data-lucide="heart"></i>${post.likes || 0}</span>
                    <span style="color:#FFF8F0;font-size:0.65rem;"><i data-lucide="message-circle"></i>${post.commentCount || 0}</span>
                </div>
            </div>`;
        }
        gridHTML += '</div>';
        container.innerHTML = gridHTML;
    } catch (e) {
        container.innerHTML = `<p style="color:red;text-align:center;">${e.message}</p>`;
    }
}

function scrollToPostOrOpen(postId) {
    // Switch back to feed and scroll
    showExploreTab(false);
    setSocialFilter('all');
    setTimeout(() => {
        const el = document.querySelector(`[data-post-id="${postId}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.boxShadow = '0 0 0 3px #3D2B1F';
            setTimeout(() => el.style.boxShadow = '', 3000);
        }
    }, 500);
}

// ========== EXPLORE SEARCH ==========
async function runExploreSearch() {
    const query = document.getElementById('explore-search-input')?.value?.trim()?.toLowerCase();
    if (!query) return;
    _exploreSearchQuery = query;
    const container = document.getElementById('explore-search-results');
    if (!container) return;
    container.style.display = 'block';
    container.innerHTML = '<p style="text-align:center;color:var(--accent);">검색 중...</p>';

    try {
        let html = '';

        // Search users
        const usersSnap = await db.collection('users').orderBy('nickname').startAt(query).endAt(query + '\uf8ff').limit(5).get();
        if (!usersSnap.empty) {
            html += '<div style="font-weight:700;font-size:0.85rem;margin-bottom:0.4rem;"><i data-lucide="user"></i> 사용자</div>';
            for (const doc of usersSnap.docs) {
                const d = doc.data();
                const nickname = d.nickname || d.email?.split('@')[0] || '사용자';
                html += `<div onclick="showUserProfile('${doc.id}')" style="display:flex;align-items:center;gap:0.6rem;padding:0.4rem 0;cursor:pointer;">
                    ${avatarHTML(d.photoURL, nickname, 32)}
                    <span style="font-size:0.85rem;font-weight:600;">${nickname}</span>
                </div>`;
            }
        }

        // Search hashtags
        if (query.startsWith('#') || !query.startsWith('@')) {
            const tag = query.replace('#', '');
            const hashPosts = await db.collection('posts').where('hashtags', 'array-contains', tag).limit(5).get();
            if (!hashPosts.empty) {
                html += `<div style="font-weight:700;font-size:0.85rem;margin:0.6rem 0 0.4rem;"><i data-lucide="hash"></i> #${tag} (${hashPosts.size}개 게시물)</div>`;
                html += `<button onclick="filterByHashtag('${tag}');showExploreTab(false)" style="padding:0.4rem 0.8rem;border:none;border-radius:8px;background:#3D2B1F;color:#FFF8F0;font-size:0.8rem;cursor:pointer;">게시물 보기</button>`;
            }
        }

        // Search posts by text
        const textPosts = await db.collection('posts').orderBy('timestamp', 'desc').limit(50).get();
        const matchedPosts = textPosts.docs.filter(d => (d.data().text || '').toLowerCase().includes(query)).slice(0, 5);
        if (matchedPosts.length > 0) {
            html += '<div style="font-weight:700;font-size:0.85rem;margin:0.6rem 0 0.4rem;"><i data-lucide="file-text"></i> 게시물</div>';
            for (const doc of matchedPosts) {
                const p = doc.data();
                const info = await getUserDisplayInfo(p.userId);
                html += `<div onclick="scrollToPostOrOpen('${doc.id}')" style="padding:0.4rem 0;cursor:pointer;border-bottom:1px solid #F7F3ED;">
                    <div style="font-size:0.8rem;font-weight:600;">${info.nickname}</div>
                    <div style="font-size:0.75rem;color:var(--accent);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${(p.text || '').substring(0, 60)}</div>
                </div>`;
            }
        }

        container.innerHTML = html || '<p style="text-align:center;color:var(--accent);">검색 결과가 없습니다</p>';
    } catch (e) {
        container.innerHTML = `<p style="color:red;">${e.message}</p>`;
    }
}

// ========== TOGGLE EXPLORE VIEW ==========
let _exploreVisible = false;

function showExploreTab(show) {
    _exploreVisible = show !== undefined ? show : !_exploreVisible;
    const exploreContent = document.getElementById('explore-content');
    const feedContent = document.getElementById('social-feed-wrapper');
    const exploreTabBtn = document.querySelector('.social-filter-tab[data-filter="explore"]');

    if (exploreContent) exploreContent.style.display = _exploreVisible ? 'block' : 'none';
    if (feedContent) feedContent.style.display = _exploreVisible ? 'none' : 'block';

    // Update tab styles
    document.querySelectorAll('.social-filter-tab').forEach(b => {
        if (b.dataset.filter === 'explore') {
            b.style.color = _exploreVisible ? 'var(--text)' : '#6B5744';
            b.style.borderBottomColor = _exploreVisible ? 'var(--text)' : 'transparent';
            if (_exploreVisible) b.classList.add('active');
            else b.classList.remove('active');
        } else if (_exploreVisible) {
            b.classList.remove('active');
            b.style.color = '#6B5744';
            b.style.borderBottomColor = 'transparent';
        }
    });

    if (_exploreVisible) loadExploreTab();
}
