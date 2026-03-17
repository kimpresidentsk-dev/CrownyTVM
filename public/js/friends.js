// ===== friends.js v1.0 - 친구 시스템, 팔로우, 프로필 뷰, 딥링크 =====

// ========== FRIEND SYSTEM ==========
let friendsList = [];
let friendRequestsList = [];

// Send friend request
async function sendFriendRequest(targetUid) {
    if (!currentUser || targetUid === currentUser.uid) return;
    try {
        // Check if already friends
        const existing = await db.collection('users').doc(currentUser.uid).collection('friends').doc(targetUid).get();
        if (existing.exists) { showToast(t('friends.already_friend', '이미 친구입니다'), 'info'); return; }
        // Check if request already sent
        const existingReq = await db.collection('friend_requests')
            .where('from', '==', currentUser.uid).where('to', '==', targetUid).where('status', '==', 'pending').get();
        if (!existingReq.empty) { showToast(t('friends.request_already_sent', '이미 친구 요청을 보냈습니다'), 'info'); return; }
        // Check if reverse request exists (they sent to me)
        const reverseReq = await db.collection('friend_requests')
            .where('from', '==', targetUid).where('to', '==', currentUser.uid).where('status', '==', 'pending').get();
        if (!reverseReq.empty) {
            // Auto-accept
            await acceptFriendRequest(reverseReq.docs[0].id, targetUid);
            return;
        }
        await db.collection('friend_requests').add({
            from: currentUser.uid, to: targetUid, status: 'pending', timestamp: new Date()
        });
        // Notify target
        await db.collection('notifications').add({
            userId: targetUid, type: 'friend_request', message: '', fromUid: currentUser.uid, read: false, createdAt: new Date()
        });
        const myInfo = await getUserDisplayInfo(currentUser.uid);
        addNotification('social_like', `<i data-lucide="users"></i> ${myInfo.nickname}님에게 친구 요청을 보냈습니다`, {});
        showToast(t('friends.request_sent', '✅ 친구 요청을 보냈습니다'), 'success');
    } catch (e) {
        console.error('Friend request error:', e);
        showToast(t('friends.request_fail', '친구 요청 실패'), 'error');
    }
}

// Accept friend request
async function acceptFriendRequest(requestId, fromUid) {
    try {
        await db.collection('friend_requests').doc(requestId).update({ status: 'accepted' });
        const myInfo = await getUserDisplayInfo(currentUser.uid);
        const theirInfo = await getUserDisplayInfo(fromUid);
        // Add both directions
        await db.collection('users').doc(currentUser.uid).collection('friends').doc(fromUid).set({
            addedAt: new Date(), nickname: theirInfo.nickname
        });
        await db.collection('users').doc(fromUid).collection('friends').doc(currentUser.uid).set({
            addedAt: new Date(), nickname: myInfo.nickname
        });
        // Notify
        await db.collection('notifications').add({
            userId: fromUid, type: 'friend_accepted', message: '', fromUid: currentUser.uid, read: false, createdAt: new Date()
        });
        showToast(`<i data-lucide="check-circle"></i> ${t('friends.accepted', '친구가 되었습니다!')}`, 'success');
        loadFriendsGrid();
        loadFriendRequests();
    } catch (e) {
        showToast(t('friends.accept_fail', '수락 실패'), 'error');
    }
}

// Reject friend request
async function rejectFriendRequest(requestId) {
    try {
        await db.collection('friend_requests').doc(requestId).update({ status: 'rejected' });
        showToast(t('friends.rejected', '친구 요청을 거절했습니다'), 'info');
        loadFriendRequests();
    } catch (e) {
        showToast(t('friends.reject_fail', '거절 실패'), 'error');
    }
}

// Remove friend
async function removeFriend(friendUid, friendName) {
    if (!await showConfirmModal(t('friends.remove_title', '친구 삭제'), `"${friendName}" ${t('friends.remove_confirm', '님을 친구에서 삭제하시겠습니까?')}`)) return;
    try {
        await db.collection('users').doc(currentUser.uid).collection('friends').doc(friendUid).delete();
        await db.collection('users').doc(friendUid).collection('friends').doc(currentUser.uid).delete();
        showToast(t('friends.removed', '친구가 삭제되었습니다'), 'info');
        loadFriendsGrid();
    } catch (e) {
        showToast(t('friends.remove_fail', '삭제 실패'), 'error');
    }
}

// Load friends grid (Instagram stories style)
async function loadFriendsGrid() {
    if (!currentUser) return;
    const grid = document.getElementById('friends-grid');
    if (!grid) return;
    
    try {
        const friendsSnap = await db.collection('users').doc(currentUser.uid).collection('friends').get();
        friendsList = friendsSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
        
        let html = `<div class="friend-icon-item" onclick="showFriendSearchModal()">
            <div class="friend-add-btn">＋</div>
            <span class="friend-icon-name">${t('friends.add', '추가')}</span>
        </div>`;
        
        for (const f of friendsList) {
            const info = await getUserDisplayInfo(f.uid);
            html += `<div class="friend-icon-item" onclick="showUserProfile('${f.uid}')">
                <div class="friend-avatar-wrap">${avatarHTML(info.photoURL, info.nickname, 56)}</div>
                <span class="friend-icon-name">${(info.nickname || '').substring(0, 6)}</span>
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
        const reqs = await db.collection('friend_requests')
            .where('to', '==', currentUser.uid).where('status', '==', 'pending').get();
        
        if (reqs.empty) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }
        container.style.display = 'block';
        let html = `<div style="font-size:0.85rem;font-weight:700;margin-bottom:0.5rem;">📬 ${t('friends.pending_requests', '친구 요청')}</div>`;
        for (const doc of reqs.docs) {
            const req = doc.data();
            const info = await getUserDisplayInfo(req.from);
            html += `<div class="friend-request-item">
                ${avatarHTML(info.photoURL, info.nickname, 36)}
                <span style="flex:1;font-size:0.85rem;font-weight:600;">${info.nickname}</span>
                <button onclick="acceptFriendRequest('${doc.id}','${req.from}')" class="btn-primary" style="padding:0.3rem 0.6rem;font-size:0.75rem;border-radius:6px;">수락</button>
                <button onclick="rejectFriendRequest('${doc.id}')" style="padding:0.3rem 0.6rem;font-size:0.75rem;border-radius:6px;border:1px solid var(--border,#E8E0D8);background:var(--bg-card,#3D2B1F);cursor:pointer;">거절</button>
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
        <h3 style="margin-bottom:1rem;"><i data-lucide="users"></i> ${t('friends.search', '친구 찾기')}</h3>
        <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
            <input type="text" id="friend-search-input" placeholder="${t('friends.search_placeholder', '닉네임 또는 이메일로 검색')}" style="flex:1;padding:0.7rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;font-size:0.9rem;">
            <button onclick="searchFriends()" class="btn-primary" style="padding:0.7rem 1rem;border-radius:8px;font-size:0.85rem;">🔍</button>
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
    results.innerHTML = '<p style="text-align:center;color:var(--text-muted,#6B5744);">검색 중...</p>';
    
    try {
        // Search by email
        let users = await db.collection('users').where('email', '==', query).get();
        // Also search by nickname (starts with)
        if (users.empty) {
            users = await db.collection('users').orderBy('nickname').startAt(query).endAt(query + '\uf8ff').limit(10).get();
        }
        if (users.empty) {
            results.innerHTML = `<p style="text-align:center;color:var(--text-muted,#6B5744);">${t('friends.no_results', '검색 결과가 없습니다')}</p>`;
            return;
        }
        let html = '';
        for (const doc of users.docs) {
            if (doc.id === currentUser.uid) continue;
            const data = doc.data();
            const info = { nickname: data.nickname || data.email?.split('@')[0] || '사용자', photoURL: data.photoURL || '' };
            const isFriend = friendsList.some(f => f.uid === doc.id);
            html += `<div style="display:flex;align-items:center;gap:0.8rem;padding:0.6rem 0;border-bottom:1px solid #F7F3ED;">
                ${avatarHTML(info.photoURL, info.nickname, 40)}
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:0.9rem;">${info.nickname}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted,#6B5744);">${data.statusMessage || ''}</div>
                </div>
                ${isFriend ? `<span style="font-size:0.75rem;color:#6B8F3C;"><i data-lucide="check-circle"></i> 친구</span>` :
                `<button onclick="sendFriendRequest('${doc.id}');this.textContent='요청됨';this.disabled=true;" class="btn-primary" style="padding:0.3rem 0.8rem;font-size:0.8rem;border-radius:6px;">친구 추가</button>`}
            </div>`;
        }
        results.innerHTML = html || `<p style="text-align:center;color:var(--text-muted,#6B5744);">${t('friends.no_results', '검색 결과가 없습니다')}</p>`;
    } catch (e) {
        results.innerHTML = `<p style="color:red;">검색 오류: ${e.message}</p>`;
    }
}

// ========== FOLLOW SYSTEM ==========
async function followUser(targetUid) {
    if (!currentUser || targetUid === currentUser.uid) return;
    try {
        const existingFollow = await db.collection('users').doc(currentUser.uid).collection('following').doc(targetUid).get();
        if (existingFollow.exists) {
            // Unfollow
            await db.collection('users').doc(currentUser.uid).collection('following').doc(targetUid).delete();
            await db.collection('users').doc(targetUid).collection('followers').doc(currentUser.uid).delete();
            showToast(t('friends.unfollowed', '팔로우를 취소했습니다'), 'info');
        } else {
            // Follow
            await db.collection('users').doc(currentUser.uid).collection('following').doc(targetUid).set({ followedAt: new Date() });
            await db.collection('users').doc(targetUid).collection('followers').doc(currentUser.uid).set({ followedAt: new Date() });
            const myInfo = await getUserDisplayInfo(currentUser.uid);
            await db.collection('notifications').add({
                userId: targetUid, type: 'new_follower', message: '', fromUid: currentUser.uid, read: false, createdAt: new Date()
            });
            // Social notification
            if (typeof createSocialNotification === 'function') {
                createSocialNotification(targetUid, 'follow', `${myInfo.nickname}님이 팔로우했습니다`, {});
            }
            showToast(`<i data-lucide="check-circle"></i> ${t('friends.followed', '팔로우했습니다')}`, 'success');
        }
    } catch (e) {
        showToast(t('friends.follow_fail', '팔로우 실패'), 'error');
    }
}

async function getFollowCounts(uid) {
    try {
        const [followers, following] = await Promise.all([
            db.collection('users').doc(uid).collection('followers').get(),
            db.collection('users').doc(uid).collection('following').get()
        ]);
        return { followers: followers.size, following: following.size };
    } catch (e) { return { followers: 0, following: 0 }; }
}

async function isFollowing(targetUid) {
    if (!currentUser) return false;
    try {
        const doc = await db.collection('users').doc(currentUser.uid).collection('following').doc(targetUid).get();
        return doc.exists;
    } catch (e) { return false; }
}

async function isFriend(targetUid) {
    if (!currentUser) return false;
    try {
        const doc = await db.collection('users').doc(currentUser.uid).collection('friends').doc(targetUid).get();
        return doc.exists;
    } catch (e) { return false; }
}

// ========== USER PROFILE MODAL ==========
async function showUserProfile(uid) {
    if (!uid) return;
    try {
        const info = await getUserDisplayInfo(uid);
        const followCounts = await getFollowCounts(uid);
        const friendsSnap = await db.collection('users').doc(uid).collection('friends').get();
        const friendCount = friendsSnap.size;
        const postsSnap = await db.collection('posts').where('userId', '==', uid).get();
        const postCount = postsSnap.size;
        const isMe = currentUser && uid === currentUser.uid;
        const amFollowing = isMe ? false : await isFollowing(uid);
        const amFriend = isMe ? false : await isFriend(uid);
        
        const overlay = document.createElement('div');
        overlay.id = 'user-profile-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        overlay.innerHTML = `
        <div style="background:var(--bg-card,#3D2B1F);padding:1.5rem;border-radius:16px;max-width:400px;width:100%;">
            <div style="text-align:center;margin-bottom:1rem;">
                ${avatarHTML(info.photoURL, info.nickname, 80)}
                <h3 style="margin-top:0.5rem;margin-bottom:0.2rem;">${info.nickname}</h3>
                ${info.statusMessage ? `<p style="font-size:0.85rem;color:var(--text-muted,#6B5744);">${info.statusMessage}</p>` : ''}
            </div>
            <div style="display:flex;justify-content:space-around;text-align:center;margin-bottom:1rem;padding:0.8rem 0;border-top:1px solid #E8E0D8;border-bottom:1px solid var(--border,#E8E0D8);">
                <div><div style="font-weight:700;font-size:1.1rem;">${postCount}</div><div style="font-size:0.75rem;color:var(--text-muted,#6B5744);">게시물</div></div>
                <div><div style="font-weight:700;font-size:1.1rem;">${friendCount}</div><div style="font-size:0.75rem;color:var(--text-muted,#6B5744);">친구</div></div>
                <div><div style="font-weight:700;font-size:1.1rem;">${followCounts.followers}</div><div style="font-size:0.75rem;color:var(--text-muted,#6B5744);">팔로워</div></div>
                <div><div style="font-weight:700;font-size:1.1rem;">${followCounts.following}</div><div style="font-size:0.75rem;color:var(--text-muted,#6B5744);">팔로잉</div></div>
            </div>
            ${!isMe ? `
            <div style="display:flex;gap:0.5rem;">
                <button onclick="followUser('${uid}');document.getElementById('user-profile-modal')?.remove();" class="btn-primary" style="flex:1;padding:0.6rem;border-radius:8px;font-size:0.85rem;">${amFollowing ? '<i data-lucide="check"></i> 팔로잉' : '팔로우'}</button>
                ${!amFriend ? `<button onclick="sendFriendRequest('${uid}');document.getElementById('user-profile-modal')?.remove();" style="flex:1;padding:0.6rem;border-radius:8px;font-size:0.85rem;border:1px solid var(--border,#E8E0D8);background:var(--bg-card,#3D2B1F);cursor:pointer;">친구 추가</button>` : `<span style="flex:1;display:flex;align-items:center;justify-content:center;font-size:0.85rem;color:#6B8F3C;"><i data-lucide="check-circle"></i> 친구</span>`}
                <button onclick="startChatFromProfile('${uid}');document.getElementById('user-profile-modal')?.remove();" style="flex:1;padding:0.6rem;border-radius:8px;font-size:0.85rem;border:1px solid var(--border,#E8E0D8);background:var(--bg-card,#3D2B1F);cursor:pointer;"><i data-lucide="message-circle"></i> 메시지</button>
            </div>
            ` : ''}
            <button onclick="document.getElementById('user-profile-modal')?.remove()" style="width:100%;margin-top:0.8rem;padding:0.6rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;background:var(--bg-card,#3D2B1F);cursor:pointer;">${t('common.close', '닫기')}</button>
        </div>`;
        document.body.appendChild(overlay);
    } catch (e) {
        console.error('Profile error:', e);
        showToast('프로필 로드 실패', 'error');
    }
}

async function startChatFromProfile(uid) {
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        const email = userDoc.data()?.email;
        if (email) {
            await startNewChat(email);
            showPage('messenger');
        }
    } catch (e) {
        showToast('채팅 시작 실패', 'error');
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
        // Make URL clickable
        processedText = processedText.replace(escapedUrl, `<a href="${escapedUrl}" target="_blank" rel="noopener" style="color:#3D2B1F;text-decoration:none;">${escapedUrl}</a>`);
        
        const ytMatch = url.match(YOUTUBE_REGEX);
        if (ytMatch) {
            const videoId = ytMatch[1];
            previewCards += `
            <div class="link-preview-card youtube-preview" onclick="this.innerHTML='<iframe src=\\'https://www.youtube.com/embed/${videoId}\\' style=\\'width:100%;aspect-ratio:16/9;border:none;border-radius:8px;\\' allowfullscreen></iframe>'">
                <img src="https://img.youtube.com/vi/${videoId}/mqdefault.jpg" style="width:100%;border-radius:8px 8px 0 0;" loading="lazy">
                <div style="padding:0.5rem 0.8rem;display:flex;align-items:center;gap:0.5rem;">
                    <span style="font-size:1.2rem;">▶️</span>
                    <span style="font-size:0.8rem;color:var(--text-muted,#6B5744);">YouTube 동영상 · 클릭하여 재생</span>
                </div>
            </div>`;
            continue;
        }
        
        if (INSTAGRAM_REGEX.test(url)) {
            previewCards += `
            <a href="${escapedUrl}" target="_blank" rel="noopener" class="link-preview-card" style="text-decoration:none;display:flex;align-items:center;gap:0.8rem;padding:0.8rem;">
                <span style="font-size:1.5rem;">📸</span>
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
                <span style="font-size:1.5rem;">🎵</span>
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
    // #hashtag
    text = text.replace(/#([\wㄱ-ㅎㅏ-ㅣ가-힣]+)/g, '<a href="#" onclick="filterByHashtag(\'$1\');return false;" style="color:#3D2B1F;font-weight:600;">#$1</a>');
    // @mention
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
        const users = await db.collection('users').where('nickname', '==', nickname).limit(1).get();
        if (!users.empty) {
            showUserProfile(users.docs[0].id);
        } else {
            showToast(t('friends.user_not_found', '사용자를 찾을 수 없습니다'), 'info');
        }
    } catch (e) { console.error(e); }
}

// ========== DEEP LINKS / ANCHOR URLs ==========
function generateShareURL(type, id) {
    const base = 'https://crowny-org.vercel.app';
    if (type === 'post') return `${base}/#page=social&post=${id}`;
    if (type === 'user') return `${base}/#page=social&user=${id}`;
    if (type === 'page') return `${base}/#page=${id}`;
    return base;
}

async function copyShareURL(type, id) {
    const url = generateShareURL(type, id);
    try {
        await navigator.clipboard.writeText(url);
        showToast(t('social.link_copied', '🔗 링크가 복사되었습니다'), 'success');
    } catch (e) {
        await showPromptModal(t('social.share', '공유'), t('social.copy_link', '링크를 복사하세요'), url);
    }
}

function initDeepLinks() {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const postId = params.get('post');
    const userId = params.get('user');
    
    if (page) {
        // Wait for auth then navigate
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
        setTimeout(() => clearInterval(checkAuth), 10000); // 10s timeout
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
        const ref = db.collection('users').doc(currentUser.uid).collection('savedPosts').doc(postId);
        const doc = await ref.get();
        if (doc.exists) {
            await ref.delete();
            showToast(t('social.unsaved', '북마크 해제'), 'info');
        } else {
            await ref.set({ savedAt: new Date() });
            showToast(t('social.saved', '🔖 저장됨'), 'success');
        }
        loadSocialFeed();
    } catch (e) {
        showToast('저장 실패', 'error');
    }
}

async function isPostSaved(postId) {
    if (!currentUser) return false;
    try {
        const doc = await db.collection('users').doc(currentUser.uid).collection('savedPosts').doc(postId).get();
        return doc.exists;
    } catch (e) { return false; }
}

// ========== REPOST ==========
async function repostPost(postId) {
    if (!currentUser) return;
    try {
        const original = await db.collection('posts').doc(postId).get();
        if (!original.exists) return;
        const data = original.data();
        await db.collection('posts').add({
            userId: currentUser.uid,
            text: data.text || '',
            imageUrl: data.imageUrl || null,
            images: data.images || [],
            likes: 0, likedBy: [], commentCount: 0,
            repostOf: postId,
            repostBy: currentUser.uid,
            originalUserId: data.userId,
            hashtags: data.hashtags || [],
            mentions: data.mentions || [],
            timestamp: new Date()
        });
        showToast(t('social.reposted', '<i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 리포스트 완료!'), 'success');
        loadSocialFeed();
    } catch (e) {
        showToast('리포스트 실패', 'error');
    }
}

// ========== COMMENT LIKES ==========
async function toggleCommentLike(postId, commentId) {
    if (!currentUser) return;
    try {
        const ref = db.collection('posts').doc(postId).collection('comments').doc(commentId);
        const doc = await ref.get();
        const data = doc.data();
        let likedBy = data.likedBy || [];
        let likes = data.likes || 0;
        if (likedBy.includes(currentUser.uid)) {
            likedBy = likedBy.filter(u => u !== currentUser.uid);
            likes = Math.max(0, likes - 1);
        } else {
            likedBy.push(currentUser.uid);
            likes++;
        }
        await ref.update({ likedBy, likes });
        loadComments(postId);
    } catch (e) {
        console.error('Comment like error:', e);
    }
}

// Init on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    initDeepLinks();
});
