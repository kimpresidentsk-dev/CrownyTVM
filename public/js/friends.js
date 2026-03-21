// ===== friends.js v2.0 - 친구 시스템, 팔로우, 프로필 뷰, 딥링크 (Server API) =====

function _authHeaders() {
    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}

// ========== FRIEND SYSTEM ==========
let friendsList = [];
let friendRequestsList = [];

// Send friend request
async function sendFriendRequest(targetUid) {
    if (!currentUser || targetUid === currentUser.uid) return;
    try {
        const resp = await fetch('/api/friends/request', {
            method: 'POST', headers: _authHeaders(),
            body: JSON.stringify({ targetUid })
        });
        const data = await resp.json();
        if (!resp.ok) { showToast(t('friends.request_fail', 'Friend request failed'), 'error'); return; }
        if (data.status === 'already_friends') { showToast(t('friends.already_friend', 'Already friends'), 'info'); return; }
        if (data.status === 'already_sent') { showToast(t('friends.request_already_sent', 'Friend request already sent'), 'info'); return; }
        if (data.status === 'auto_accepted') {
            showToast(`<i data-lucide="check-circle"></i> ${t('friends.accepted', 'You are now friends!')}`, 'success');
            loadFriendsGrid();
            loadFriendRequests();
            return;
        }
        showToast(t('friends.request_sent', 'Friend request sent'), 'success');
    } catch (e) {
        console.error('Friend request error:', e);
        showToast(t('friends.request_fail', 'Friend request failed'), 'error');
    }
}

// Accept friend request
async function acceptFriendRequest(requestId) {
    try {
        const resp = await fetch('/api/friends/accept', {
            method: 'POST', headers: _authHeaders(),
            body: JSON.stringify({ requestId })
        });
        if (!resp.ok) throw new Error('Accept failed');
        showToast(`<i data-lucide="check-circle"></i> ${t('friends.accepted', 'You are now friends!')}`, 'success');
        loadFriendsGrid();
        loadFriendRequests();
    } catch (e) {
        showToast(t('friends.accept_fail', 'Accept failed'), 'error');
    }
}

// Reject friend request
async function rejectFriendRequest(requestId) {
    try {
        const resp = await fetch('/api/friends/reject', {
            method: 'POST', headers: _authHeaders(),
            body: JSON.stringify({ requestId })
        });
        if (!resp.ok) throw new Error('Reject failed');
        showToast(t('friends.rejected', 'Friend request declined'), 'info');
        loadFriendRequests();
    } catch (e) {
        showToast(t('friends.reject_fail', 'Decline failed'), 'error');
    }
}

// Remove friend
async function removeFriend(friendUid, friendName) {
    if (!await showConfirmModal(t('friends.remove_title', 'Remove Friend'), `"${friendName}" ${t('friends.remove_confirm', ' will be removed from your friends. Continue?')}`)) return;
    try {
        const resp = await fetch('/api/friends/remove', {
            method: 'POST', headers: _authHeaders(),
            body: JSON.stringify({ friendUid })
        });
        if (!resp.ok) throw new Error('Remove failed');
        showToast(t('friends.removed', 'Friend removed'), 'info');
        loadFriendsGrid();
    } catch (e) {
        showToast(t('friends.remove_fail', 'Remove failed'), 'error');
    }
}

// Load friends grid (Instagram stories style)
async function loadFriendsGrid() {
    if (!currentUser) return;
    const grid = document.getElementById('friends-grid');
    if (!grid) return;

    try {
        const resp = await fetch('/api/friends/list', { headers: _authHeaders() });
        if (!resp.ok) throw new Error('Load failed');
        friendsList = await resp.json();

        let html = `<div class="friend-icon-item" onclick="showFriendSearchModal()">
            <div class="friend-add-btn">＋</div>
            <span class="friend-icon-name">${t('friends.add', 'Add')}</span>
        </div>`;

        for (const f of friendsList) {
            html += `<div class="friend-icon-item" onclick="showUserProfile('${f.uid}')">
                <div class="friend-avatar-wrap">${avatarHTML(f.photoURL, f.nickname, 56)}</div>
                <span class="friend-icon-name">${(f.nickname || '').substring(0, 6)}</span>
            </div>`;
        }
        grid.innerHTML = html;
    } catch (e) {
        console.error('Friends grid error:', e);
        grid.innerHTML = '';
    }
}

// Load pending friend requests
async function loadFriendRequests() {
    if (!currentUser) return;
    const container = document.getElementById('friend-requests-list');
    if (!container) return;

    try {
        const resp = await fetch('/api/friends/requests', { headers: _authHeaders() });
        if (!resp.ok) throw new Error('Load failed');
        const pending = await resp.json();

        if (!pending.length) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }
        container.style.display = 'block';
        let html = `<div style="font-size:0.85rem;font-weight:700;margin-bottom:0.5rem;">${t('friends.pending_requests', 'Friend Requests')}</div>`;
        for (const req of pending) {
            html += `<div class="friend-request-item">
                ${avatarHTML(req.photoURL, req.nickname, 36)}
                <span style="flex:1;font-size:0.85rem;font-weight:600;">${req.nickname}</span>
                <button onclick="acceptFriendRequest('${req.id}')" class="btn-primary" style="padding:0.3rem 0.6rem;font-size:0.75rem;border-radius:6px;">${t('friends.accept', 'Accept')}</button>
                <button onclick="rejectFriendRequest('${req.id}')" style="padding:0.3rem 0.6rem;font-size:0.75rem;border-radius:6px;border:1px solid var(--border,#E8E0D8);background:var(--bg-card,#3D2B1F);cursor:pointer;">${t('friends.decline', 'Decline')}</button>
            </div>`;
        }
        container.innerHTML = html;
    } catch (e) {
        console.error('Friend requests error:', e);
    }
}

// Friend search modal
async function showFriendSearchModal() {
    const overlay = document.createElement('div');
    overlay.id = 'friend-search-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
    <div style="background:var(--bg-card,#3D2B1F);padding:1.5rem;border-radius:16px;max-width:420px;width:100%;max-height:80vh;overflow-y:auto;">
        <h3 style="margin-bottom:1rem;"><i data-lucide="users"></i> ${t('friends.search', 'Find Friends')}</h3>
        <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
            <input type="text" id="friend-search-input" placeholder="${t('friends.search_placeholder', 'Search by nickname or email')}" style="flex:1;padding:0.7rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;font-size:0.9rem;">
            <button onclick="searchFriends()" class="btn-primary" style="padding:0.7rem 1rem;border-radius:8px;font-size:0.85rem;"></button>
        </div>
        <div id="friend-search-results"></div>
    </div>`;
    document.body.appendChild(overlay);
    document.getElementById('friend-search-input').focus();
    document.getElementById('friend-search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchFriends();
    });
}

async function searchFriends() {
    const query = document.getElementById('friend-search-input').value.trim().toLowerCase();
    const results = document.getElementById('friend-search-results');
    if (!query) return;
    results.innerHTML = '<p style="text-align:center;color:var(--text-muted,#6B5744);">' + t('friends.searching', 'Searching...') + '</p>';

    try {
        const resp = await fetch('/api/users/search?q=' + encodeURIComponent(query), { headers: _authHeaders() });
        if (!resp.ok) throw new Error('Search failed');
        const userList = await resp.json();

        if (!userList.length) {
            results.innerHTML = `<p style="text-align:center;color:var(--text-muted,#6B5744);">${t('friends.no_results', 'No results found')}</p>`;
            return;
        }
        let html = '';
        for (const u of userList) {
            const isFriend = friendsList.some(f => f.uid === u.username);
            html += `<div style="display:flex;align-items:center;gap:0.8rem;padding:0.6rem 0;border-bottom:1px solid #F7F3ED;">
                ${avatarHTML(u.photoURL || '', u.displayName, 40)}
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:0.9rem;">${u.displayName}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted,#6B5744);">${u.statusMessage || ''}</div>
                </div>
                ${isFriend ? `<span style="font-size:0.75rem;color:#5B7B8C;"><i data-lucide="check-circle"></i> ${t('friends.friend', 'Friend')}</span>` :
                `<button onclick="sendFriendRequest('${u.username}');this.textContent='${t('friends.requested', 'Requested')}';this.disabled=true;" class="btn-primary" style="padding:0.3rem 0.8rem;font-size:0.8rem;border-radius:6px;">${t('friends.add_friend', 'Add Friend')}</button>`}
            </div>`;
        }
        results.innerHTML = html || `<p style="text-align:center;color:var(--text-muted,#6B5744);">${t('friends.no_results', 'No results found')}</p>`;
    } catch (e) {
        results.innerHTML = `<p style="color:red;">${t('friends.search_error', 'Search error')}: ${e.message}</p>`;
    }
}

// ========== FOLLOW SYSTEM ==========
async function followUser(targetUid) {
    if (!currentUser || targetUid === currentUser.uid) return;
    try {
        const resp = await fetch('/api/follow', {
            method: 'POST', headers: _authHeaders(),
            body: JSON.stringify({ targetUid })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error('Follow failed');
        if (data.followed) {
            showToast(`<i data-lucide="check-circle"></i> ${t('friends.followed', 'Followed')}`, 'success');
        } else {
            showToast(t('friends.unfollowed', 'Unfollowed'), 'info');
        }
    } catch (e) {
        showToast(t('friends.follow_fail', 'Follow failed'), 'error');
    }
}

async function getFollowCounts(uid) {
    try {
        const resp = await fetch('/api/follow/counts?uid=' + encodeURIComponent(uid), { headers: _authHeaders() });
        if (!resp.ok) return { followers: 0, following: 0 };
        return await resp.json();
    } catch (e) { return { followers: 0, following: 0 }; }
}

async function isFollowing(targetUid) {
    if (!currentUser) return false;
    try {
        const resp = await fetch('/api/follow/check?uid=' + encodeURIComponent(targetUid), { headers: _authHeaders() });
        if (!resp.ok) return false;
        const data = await resp.json();
        return data.isFollowing;
    } catch (e) { return false; }
}

async function isFriend(targetUid) {
    if (!currentUser) return false;
    try {
        const resp = await fetch('/api/friends/check?uid=' + encodeURIComponent(targetUid), { headers: _authHeaders() });
        if (!resp.ok) return false;
        const data = await resp.json();
        return data.isFriend;
    } catch (e) { return false; }
}

// ========== USER PROFILE MODAL ==========
async function showUserProfile(uid) {
    if (!uid) return;
    try {
        const resp = await fetch('/api/users/profile?uid=' + encodeURIComponent(uid), { headers: _authHeaders() });
        if (!resp.ok) throw new Error('Profile load failed');
        const profile = await resp.json();

        const isMe = currentUser && uid === currentUser.uid;

        const overlay = document.createElement('div');
        overlay.id = 'user-profile-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        overlay.innerHTML = `
        <div style="background:var(--bg-card,#3D2B1F);padding:1.5rem;border-radius:16px;max-width:400px;width:100%;">
            <div style="text-align:center;margin-bottom:1rem;">
                ${avatarHTML(profile.photoURL, profile.nickname, 80)}
                <h3 style="margin-top:0.5rem;margin-bottom:0.2rem;">${profile.nickname}</h3>
                ${profile.statusMessage ? `<p style="font-size:0.85rem;color:var(--text-muted,#6B5744);">${profile.statusMessage}</p>` : ''}
            </div>
            <div style="display:flex;justify-content:space-around;text-align:center;margin-bottom:1rem;padding:0.8rem 0;border-top:1px solid #E8E0D8;border-bottom:1px solid var(--border,#E8E0D8);">
                <div><div style="font-weight:700;font-size:1.1rem;">${profile.postCount}</div><div style="font-size:0.75rem;color:var(--text-muted,#6B5744);">${t('friends.posts', 'Posts')}</div></div>
                <div><div style="font-weight:700;font-size:1.1rem;">${profile.friendCount}</div><div style="font-size:0.75rem;color:var(--text-muted,#6B5744);">${t('friends.friends', 'Friends')}</div></div>
                <div><div style="font-weight:700;font-size:1.1rem;">${profile.followersCount}</div><div style="font-size:0.75rem;color:var(--text-muted,#6B5744);">${t('friends.followers', 'Followers')}</div></div>
                <div><div style="font-weight:700;font-size:1.1rem;">${profile.followingCount}</div><div style="font-size:0.75rem;color:var(--text-muted,#6B5744);">${t('friends.following', 'Following')}</div></div>
            </div>
            ${!isMe ? `
            <div style="display:flex;gap:0.5rem;">
                <button onclick="followUser('${uid}');document.getElementById('user-profile-modal')?.remove();" class="btn-primary" style="flex:1;padding:0.6rem;border-radius:8px;font-size:0.85rem;">${profile.isFollowing ? '<i data-lucide="check"></i> ' + t('friends.following', 'Following') : t('friends.follow', 'Follow')}</button>
                ${!profile.isFriend ? `<button onclick="sendFriendRequest('${uid}');document.getElementById('user-profile-modal')?.remove();" style="flex:1;padding:0.6rem;border-radius:8px;font-size:0.85rem;border:1px solid var(--border,#E8E0D8);background:var(--bg-card,#3D2B1F);cursor:pointer;">${t('friends.add_friend', 'Add Friend')}</button>` : `<span style="flex:1;display:flex;align-items:center;justify-content:center;font-size:0.85rem;color:#5B7B8C;"><i data-lucide="check-circle"></i> ${t('friends.friend', 'Friend')}</span>`}
                <button onclick="startChatFromProfile('${uid}');document.getElementById('user-profile-modal')?.remove();" style="flex:1;padding:0.6rem;border-radius:8px;font-size:0.85rem;border:1px solid var(--border,#E8E0D8);background:var(--bg-card,#3D2B1F);cursor:pointer;"><i data-lucide="message-circle"></i> ${t('friends.message', 'Message')}</button>
            </div>
            ` : ''}
            <button onclick="document.getElementById('user-profile-modal')?.remove()" style="width:100%;margin-top:0.8rem;padding:0.6rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;background:var(--bg-card,#3D2B1F);cursor:pointer;">${t('common.close', 'Close')}</button>
        </div>`;
        document.body.appendChild(overlay);
    } catch (e) {
        console.error('Profile error:', e);
        showToast(t('friends.profile_load_failed', 'Profile load failed'), 'error');
    }
}

async function startChatFromProfile(uid) {
    try {
        // uid is already the username, use it directly as email for chat
        const email = uid + '@crowny.org';
        if (typeof startNewChat === 'function') {
            await startNewChat(email);
            showPage('messenger');
        }
    } catch (e) {
        showToast(t('friends.chat_start_failed', 'Failed to start chat'), 'error');
    }
}

// ========== LINK PREVIEW ==========
const URL_REGEX = /(https?:\/\/[^\s<]+)/gi;
const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i;
const INSTAGRAM_REGEX = /instagram\.com\/(p|reel|tv)\/([\w-]+)/i;
const TIKTOK_REGEX = /tiktok\.com\/@[\w.]+\/video\/(\d+)|vm\.tiktok\.com\/[\w]+/i;

function parseLinkPreviews(text) {
    if (!text) return { html: text, previews: '' };

    const urls = text.match(URL_REGEX);
    if (!urls) return { html: escapeHtml(text), previews: '' };

    let processedText = escapeHtml(text);
    let previewCards = '';

    for (const url of urls) {
        const escapedUrl = escapeHtml(url);
        processedText = processedText.replace(escapedUrl, `<a href="${escapedUrl}" target="_blank" rel="noopener" style="color:#3D2B1F;text-decoration:none;">${escapedUrl}</a>`);

        const ytMatch = url.match(YOUTUBE_REGEX);
        if (ytMatch) {
            const videoId = ytMatch[1];
            previewCards += `
            <div class="link-preview-card youtube-preview" onclick="this.innerHTML='<iframe src=\\'https://www.youtube.com/embed/${videoId}\\' style=\\'width:100%;aspect-ratio:16/9;border:none;border-radius:8px;\\' allowfullscreen></iframe>'">
                <img src="https://img.youtube.com/vi/${videoId}/mqdefault.jpg" style="width:100%;border-radius:8px 8px 0 0;" loading="lazy">
                <div style="padding:0.5rem 0.8rem;display:flex;align-items:center;gap:0.5rem;">
                    <span style="font-size:1.2rem;">▶️</span>
                    <span style="font-size:0.8rem;color:var(--text-muted,#6B5744);">${t('friends.youtube_click_play', 'YouTube video · Click to play')}</span>
                </div>
            </div>`;
            continue;
        }

        if (INSTAGRAM_REGEX.test(url)) {
            previewCards += `
            <a href="${escapedUrl}" target="_blank" rel="noopener" class="link-preview-card" style="text-decoration:none;display:flex;align-items:center;gap:0.8rem;padding:0.8rem;">
                <span style="font-size:1.5rem;"></span>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:0.85rem;font-weight:600;color:var(--text,#3D2B1F);">Instagram</div>
                    <div style="font-size:0.75rem;color:var(--text-muted,#6B5744);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapedUrl}</div>
                </div>
                <span style="color:var(--text-muted,#6B5744);">→</span>
            </a>`;
            continue;
        }

        if (TIKTOK_REGEX.test(url)) {
            previewCards += `
            <a href="${escapedUrl}" target="_blank" rel="noopener" class="link-preview-card" style="text-decoration:none;display:flex;align-items:center;gap:0.8rem;padding:0.8rem;">
                <span style="font-size:1.5rem;"></span>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:0.85rem;font-weight:600;color:var(--text,#3D2B1F);">TikTok</div>
                    <div style="font-size:0.75rem;color:var(--text-muted,#6B5744);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapedUrl}</div>
                </div>
                <span style="color:var(--text-muted,#6B5744);">→</span>
            </a>`;
            continue;
        }
    }

    return { html: processedText, previews: previewCards };
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ========== HASHTAGS & MENTIONS ==========
function parseHashtagsAndMentions(text) {
    if (!text) return text;
    text = text.replace(/#([\wㄱ-ㅎㅏ-ㅣ가-힣]+)/g, '<a href="#" onclick="filterByHashtag(\'$1\');return false;" style="color:#3D2B1F;font-weight:600;">#$1</a>');
    text = text.replace(/@([\wㄱ-ㅎㅏ-ㅣ가-힣]+)/g, '<span style="color:#3D2B1F;font-weight:600;cursor:pointer;" onclick="searchAndShowProfile(\'$1\')">@$1</span>');
    return text;
}

function extractHashtags(text) {
    if (!text) return [];
    const matches = text.match(/#([\wㄱ-ㅎㅏ-ㅣ가-힣]+)/g);
    return matches ? matches.map(m => m.slice(1).toLowerCase()) : [];
}

function extractMentions(text) {
    if (!text) return [];
    const matches = text.match(/@([\wㄱ-ㅎㅏ-ㅣ가-힣]+)/g);
    return matches ? matches.map(m => m.slice(1)) : [];
}

async function filterByHashtag(tag) {
    window._socialHashtagFilter = tag;
    await loadSocialFeed();
}

function clearHashtagFilter() {
    window._socialHashtagFilter = null;
    loadSocialFeed();
}

async function searchAndShowProfile(nickname) {
    try {
        const resp = await fetch('/api/users/search?q=' + encodeURIComponent(nickname), { headers: _authHeaders() });
        if (!resp.ok) return;
        const results = await resp.json();
        if (results.length > 0) {
            showUserProfile(results[0].username);
        } else {
            showToast(t('friends.user_not_found', 'User not found'), 'info');
        }
    } catch (e) { console.error(e); }
}

// ========== DEEP LINKS / ANCHOR URLs ==========
function generateShareURL(type, id) {
    const base = 'https://crowny.org';
    if (type === 'post') return `${base}/#page=social&post=${id}`;
    if (type === 'user') return `${base}/#page=social&user=${id}`;
    if (type === 'page') return `${base}/#page=${id}`;
    return base;
}

async function copyShareURL(type, id) {
    const url = generateShareURL(type, id);
    try {
        await navigator.clipboard.writeText(url);
        showToast(t('social.link_copied', 'Link copied'), 'success');
    } catch (e) {
        await showPromptModal(t('social.share', 'Share'), t('social.copy_link', 'Copy the link'), url);
    }
}

function initDeepLinks() {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const postId = params.get('post');
    const userId = params.get('user');

    if (page) {
        const checkAuth = setInterval(() => {
            if (typeof currentUser !== 'undefined' && currentUser) {
                clearInterval(checkAuth);
                showPage(page);
                if (postId) {
                    setTimeout(() => scrollToPost(postId), 1000);
                }
                if (userId) {
                    setTimeout(() => showUserProfile(userId), 500);
                }
            }
        }, 300);
        setTimeout(() => clearInterval(checkAuth), 10000);
    }
}

function scrollToPost(postId) {
    const el = document.getElementById(`post-${postId}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.boxShadow = '0 0 0 3px #3D2B1F';
        setTimeout(() => el.style.boxShadow = '', 3000);
    }
}

// ========== SAVED POSTS (BOOKMARKS) ==========
async function toggleSavePost(postId) {
    if (!currentUser) return;
    try {
        const resp = await fetch('/api/social/save', {
            method: 'POST', headers: _authHeaders(),
            body: JSON.stringify({ postId })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error('Save failed');
        if (data.saved) {
            showToast(t('social.saved', 'Saved'), 'success');
        } else {
            showToast(t('social.unsaved', 'Bookmark removed'), 'info');
        }
        loadSocialFeed();
    } catch (e) {
        showToast(t('friends.save_failed', 'Save failed'), 'error');
    }
}

async function isPostSaved(postId) {
    if (!currentUser) return false;
    try {
        const resp = await fetch('/api/social/save/check?postId=' + encodeURIComponent(postId), { headers: _authHeaders() });
        if (!resp.ok) return false;
        const data = await resp.json();
        return data.saved;
    } catch (e) { return false; }
}

// ========== REPOST ==========
async function repostPost(postId) {
    if (!currentUser) return;
    try {
        const resp = await fetch('/api/social/repost', {
            method: 'POST', headers: _authHeaders(),
            body: JSON.stringify({ postId })
        });
        if (!resp.ok) throw new Error('Repost failed');
        showToast(t('social.reposted', '<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Reposted!'), 'success');
        loadSocialFeed();
    } catch (e) {
        showToast(t('friends.repost_failed', 'Repost failed'), 'error');
    }
}

// ========== COMMENT LIKES ==========
async function toggleCommentLike(postId, commentId) {
    if (!currentUser) return;
    try {
        const resp = await fetch('/api/social/comment/like', {
            method: 'POST', headers: _authHeaders(),
            body: JSON.stringify({ postId, commentId })
        });
        if (!resp.ok) throw new Error('Like failed');
        loadComments(postId);
    } catch (e) {
        console.error('Comment like error:', e);
    }
}

// Init on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    initDeepLinks();
});
