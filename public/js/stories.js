// ===== stories.js v1.0 - 인스타그램 스타일 스토리 기능 =====

let _storiesCache = [];
let _currentStoryViewer = null;
let _storyViewerIndex = 0;
let _storyItemIndex = 0;
let _storyProgressTimer = null;

// ========== STORY UPLOAD ==========
async function openStoryUpload() {
    const overlay = document.createElement('div');
    overlay.id = 'story-upload-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.85);z-index:99998;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
    <div style="background:var(--bg-card,#3D2B1F);padding:1.5rem;border-radius:20px;max-width:400px;width:100%;">
        <h3 style="margin-bottom:1rem;text-align:center;">📸 스토리 만들기</h3>
        <div id="story-preview-area" style="width:100%;aspect-ratio:9/16;max-height:50vh;background:#3D2B1F;border-radius:12px;margin-bottom:1rem;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;">
            <span style="color:var(--text-muted,#6B5744);font-size:0.9rem;">사진 또는 영상을 선택하세요</span>
        </div>
        <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
            <label style="flex:1;text-align:center;padding:0.7rem;background:var(--bg);border-radius:10px;cursor:pointer;font-size:0.85rem;border:1px solid var(--border);">
                📷 사진
                <input type="file" id="story-photo-input" accept="image/*" style="display:none;" onchange="previewStoryMedia(this,'image')">
            </label>
            <label style="flex:1;text-align:center;padding:0.7rem;background:var(--bg);border-radius:10px;cursor:pointer;font-size:0.85rem;border:1px solid var(--border);">
                🎬 영상 (15초)
                <input type="file" id="story-video-input" accept="video/*" style="display:none;" onchange="previewStoryMedia(this,'video')">
            </label>
        </div>
        <input type="text" id="story-text-input" placeholder="텍스트 추가..." style="width:100%;padding:0.7rem;border:1px solid var(--border);border-radius:10px;font-size:0.9rem;margin-bottom:0.8rem;box-sizing:border-box;">
        <div style="display:flex;gap:0.5rem;">
            <button onclick="document.getElementById('story-upload-modal')?.remove()" style="flex:1;padding:0.7rem;border:1px solid var(--border,#E8E0D8);border-radius:10px;background:var(--bg-card,#3D2B1F);cursor:pointer;">취소</button>
            <button id="story-upload-btn" onclick="uploadStory()" style="flex:1;padding:0.7rem;border:none;border-radius:10px;background:#3D2B1F;color:#FFF8F0;font-weight:700;cursor:pointer;" disabled>스토리 올리기</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
}

let _storyMediaFile = null;
let _storyMediaType = null;

function previewStoryMedia(input, type) {
    const file = input.files[0];
    if (!file) return;
    _storyMediaFile = file;
    _storyMediaType = type;
    const area = document.getElementById('story-preview-area');
    const url = URL.createObjectURL(file);

    if (type === 'video') {
        if (file.size > 30 * 1024 * 1024) {
            showToast('영상은 30MB 이하만 가능합니다', 'warning');
            return;
        }
        area.innerHTML = `<video src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;" muted autoplay loop></video>`;
        const v = area.querySelector('video');
        v.onloadedmetadata = () => {
            if (v.duration > 15) {
                showToast('스토리 영상은 15초 이하만 가능합니다', 'warning');
                _storyMediaFile = null;
                area.innerHTML = '<span style="color:var(--text-muted,#6B5744);">15초 이하 영상만 가능합니다</span>';
                document.getElementById('story-upload-btn').disabled = true;
                return;
            }
            document.getElementById('story-upload-btn').disabled = false;
        };
    } else {
        if (file.size > 10 * 1024 * 1024) {
            showToast('사진은 10MB 이하만 가능합니다', 'warning');
            return;
        }
        area.innerHTML = `<img src="${url}" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`;
        document.getElementById('story-upload-btn').disabled = false;
    }
}

async function uploadStory() {
    if (!currentUser || !_storyMediaFile) return;
    const btn = document.getElementById('story-upload-btn');
    btn.disabled = true;
    btn.textContent = '업로드 중...';

    try {
        const text = document.getElementById('story-text-input')?.value?.trim() || '';
        const ext = _storyMediaFile.name.split('.').pop();
        const fileName = `stories/${currentUser.uid}/${Date.now()}.${ext}`;
        const ref = firebase.storage().ref(fileName);
        await ref.put(_storyMediaFile);
        const mediaUrl = await ref.getDownloadURL();

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

        await db.collection('stories').add({
            userId: currentUser.uid,
            mediaUrl,
            mediaType: _storyMediaType,
            text,
            viewers: [],
            expiresAt,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToast('📸 스토리가 올라갔습니다!', 'success');
        document.getElementById('story-upload-modal')?.remove();
        _storyMediaFile = null;
        loadStoryRing();
    } catch (e) {
        console.error('Story upload error:', e);
        showToast('스토리 업로드 실패: ' + e.message, 'error');
        btn.disabled = false;
        btn.textContent = '스토리 올리기';
    }
}

// ========== STORY RING (TOP OF FEED) ==========
async function loadStoryRing() {
    if (!currentUser) return;
    const container = document.getElementById('story-ring-container');
    if (!container) return;

    try {
        const now = new Date();
        // Get active stories (not expired)
        const storiesSnap = await db.collection('stories')
            .where('expiresAt', '>', now)
            .orderBy('expiresAt')
            .limit(100)
            .get();

        // Group by user
        const userStories = {};
        storiesSnap.docs.forEach(doc => {
            const d = doc.data();
            if (!userStories[d.userId]) userStories[d.userId] = [];
            userStories[d.userId].push({ id: doc.id, ...d });
        });

        _storiesCache = userStories;

        // Build ring HTML - my story first
        let html = '';

        // My story (+ button)
        const myStories = userStories[currentUser.uid] || [];
        const myInfo = await getUserDisplayInfo(currentUser.uid);
        html += `<div class="story-ring-item" onclick="${myStories.length > 0 ? `openStoryViewer('${currentUser.uid}')` : 'openStoryUpload()'}">
            <div class="story-avatar-wrap ${myStories.length > 0 ? 'has-story' : ''}" style="position:relative;">
                ${avatarHTML(myInfo.photoURL, myInfo.nickname, 60)}
                ${myStories.length === 0 ? '<div class="story-add-badge">+</div>' : ''}
            </div>
            <span class="story-username">내 스토리</span>
        </div>`;

        // Get following list for prioritization
        const followingSnap = await db.collection('users').doc(currentUser.uid).collection('following').get();
        const followingSet = new Set(followingSnap.docs.map(d => d.id));
        // Also friends
        const friendsSnap = await db.collection('users').doc(currentUser.uid).collection('friends').get();
        friendsSnap.docs.forEach(d => followingSet.add(d.id));

        // Other users' stories (following/friends first)
        const otherUsers = Object.keys(userStories).filter(uid => uid !== currentUser.uid);
        otherUsers.sort((a, b) => {
            const aFollow = followingSet.has(a) ? 0 : 1;
            const bFollow = followingSet.has(b) ? 0 : 1;
            return aFollow - bFollow;
        });

        for (const uid of otherUsers) {
            const stories = userStories[uid];
            const info = await getUserDisplayInfo(uid);
            const viewed = stories.every(s => s.viewers?.includes(currentUser.uid));
            html += `<div class="story-ring-item" onclick="openStoryViewer('${uid}')">
                <div class="story-avatar-wrap ${viewed ? 'viewed' : 'has-story'}">
                    ${avatarHTML(info.photoURL, info.nickname, 60)}
                </div>
                <span class="story-username">${(info.nickname || '').substring(0, 8)}</span>
            </div>`;
        }

        container.innerHTML = html;
        container.style.display = Object.keys(userStories).length > 0 || true ? 'flex' : 'none';
    } catch (e) {
        console.error('Story ring error:', e);
        container.innerHTML = '';
    }
}

// ========== STORY VIEWER (FULLSCREEN) ==========
function openStoryViewer(userId) {
    const userStories = _storiesCache[userId];
    if (!userStories || userStories.length === 0) {
        if (userId === currentUser.uid) openStoryUpload();
        return;
    }

    const allUsers = Object.keys(_storiesCache);
    _storyViewerIndex = allUsers.indexOf(userId);
    _storyItemIndex = 0;

    showStoryContent(userId, 0);
}

async function showStoryContent(userId, itemIdx) {
    const stories = _storiesCache[userId];
    if (!stories || itemIdx >= stories.length) {
        // Move to next user
        const allUsers = Object.keys(_storiesCache);
        const curIdx = allUsers.indexOf(userId);
        if (curIdx < allUsers.length - 1) {
            const nextUser = allUsers[curIdx + 1];
            _storyViewerIndex = curIdx + 1;
            _storyItemIndex = 0;
            showStoryContent(nextUser, 0);
        } else {
            closeStoryViewer();
        }
        return;
    }
    if (itemIdx < 0) {
        // Move to prev user
        const allUsers = Object.keys(_storiesCache);
        const curIdx = allUsers.indexOf(userId);
        if (curIdx > 0) {
            const prevUser = allUsers[curIdx - 1];
            const prevStories = _storiesCache[prevUser];
            _storyViewerIndex = curIdx - 1;
            _storyItemIndex = prevStories.length - 1;
            showStoryContent(prevUser, prevStories.length - 1);
        }
        return;
    }

    _storyItemIndex = itemIdx;
    const story = stories[itemIdx];
    const info = await getUserDisplayInfo(userId);
    const timeAgo = getTimeAgo(story.createdAt?.toDate?.() || new Date());
    const isMe = userId === currentUser.uid;

    // Mark as viewed
    if (!isMe && !story.viewers?.includes(currentUser.uid)) {
        db.collection('stories').doc(story.id).update({
            viewers: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        }).catch(() => {});
    }

    // Remove existing viewer
    document.getElementById('story-viewer-overlay')?.remove();
    clearInterval(_storyProgressTimer);

    const overlay = document.createElement('div');
    overlay.id = 'story-viewer-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#3D2B1F;z-index:99999;display:flex;flex-direction:column;';

    // Progress bars
    let progressHTML = '<div style="display:flex;gap:3px;padding:8px 12px 4px;">';
    for (let i = 0; i < stories.length; i++) {
        progressHTML += `<div style="flex:1;height:2px;background:rgba(255,255,255,0.3);border-radius:1px;overflow:hidden;">
            <div id="story-progress-${i}" style="height:100%;background:var(--bg-card,#3D2B1F);width:${i < itemIdx ? '100' : '0'}%;transition:width 0.1s linear;border-radius:1px;"></div>
        </div>`;
    }
    progressHTML += '</div>';

    const mediaHTML = story.mediaType === 'video'
        ? `<video id="story-media" src="${story.mediaUrl}" style="width:100%;height:100%;object-fit:contain;" autoplay playsinline></video>`
        : `<img id="story-media" src="${story.mediaUrl}" style="width:100%;height:100%;object-fit:contain;">`;

    overlay.innerHTML = `
        ${progressHTML}
        <div style="display:flex;align-items:center;gap:0.6rem;padding:8px 12px;">
            ${avatarHTML(info.photoURL, info.nickname, 32)}
            <span style="color:#FFF8F0;font-weight:600;font-size:0.9rem;flex:1;">${info.nickname}</span>
            <span style="color:rgba(255,255,255,0.6);font-size:0.75rem;">${timeAgo}</span>
            ${isMe ? `<button onclick="showStoryViewers('${story.id}')" style="background:none;border:none;color:#FFF8F0;cursor:pointer;font-size:0.8rem;">👁 ${story.viewers?.length || 0}</button>` : ''}
            <button onclick="closeStoryViewer()" style="background:none;border:none;color:#FFF8F0;cursor:pointer;font-size:1.5rem;padding:0 4px;">✕</button>
        </div>
        <div style="flex:1;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;">
            ${mediaHTML}
            ${story.text ? `<div style="position:absolute;bottom:80px;left:0;right:0;text-align:center;padding:0.8rem;font-size:1.1rem;font-weight:600;color:#FFF8F0;text-shadow:0 2px 8px rgba(61,43,31,0.8);">${story.text}</div>` : ''}
            <div onclick="storyTapLeft()" style="position:absolute;left:0;top:0;width:30%;height:100%;cursor:pointer;"></div>
            <div onclick="storyTapRight()" style="position:absolute;right:0;top:0;width:70%;height:100%;cursor:pointer;"></div>
        </div>
        ${!isMe ? `<div style="display:flex;gap:0.5rem;padding:12px;align-items:center;">
            <input type="text" id="story-reply-input" placeholder="답장 보내기..." style="flex:1;padding:0.6rem 1rem;border:1px solid rgba(255,255,255,0.3);border-radius:20px;background:transparent;color:#FFF8F0;font-size:0.9rem;outline:none;" onkeypress="if(event.key==='Enter')sendStoryReply('${userId}','${story.id}')">
            <button onclick="sendStoryReply('${userId}','${story.id}')" style="background:none;border:none;color:#FFF8F0;cursor:pointer;font-size:1.3rem;">📤</button>
        </div>` : '<div style="height:12px;"></div>'}`;

    document.body.appendChild(overlay);

    // Start progress timer
    const duration = story.mediaType === 'video' ? 15000 : 5000;
    const progressBar = document.getElementById(`story-progress-${itemIdx}`);
    let elapsed = 0;
    const interval = 50;
    _storyProgressTimer = setInterval(() => {
        elapsed += interval;
        if (progressBar) progressBar.style.width = `${(elapsed / duration) * 100}%`;
        if (elapsed >= duration) {
            clearInterval(_storyProgressTimer);
            storyTapRight();
        }
    }, interval);
}

function storyTapRight() {
    clearInterval(_storyProgressTimer);
    const allUsers = Object.keys(_storiesCache);
    const userId = allUsers[_storyViewerIndex];
    showStoryContent(userId, _storyItemIndex + 1);
}

function storyTapLeft() {
    clearInterval(_storyProgressTimer);
    const allUsers = Object.keys(_storiesCache);
    const userId = allUsers[_storyViewerIndex];
    showStoryContent(userId, _storyItemIndex - 1);
}

function closeStoryViewer() {
    clearInterval(_storyProgressTimer);
    document.getElementById('story-viewer-overlay')?.remove();
    loadStoryRing(); // Refresh viewed state
}

async function sendStoryReply(userId, storyId) {
    const input = document.getElementById('story-reply-input');
    const text = input?.value?.trim();
    if (!text) return;

    try {
        // Send as DM via messenger
        const userDoc = await db.collection('users').doc(userId).get();
        const email = userDoc.data()?.email;
        if (email) {
            // Find or create chat
            const chatsSnap = await db.collection('chats')
                .where('participants', 'array-contains', currentUser.uid)
                .get();
            let chatId = null;
            chatsSnap.docs.forEach(doc => {
                if (doc.data().participants.includes(userId)) chatId = doc.id;
            });
            if (!chatId) {
                const newChat = await db.collection('chats').add({
                    participants: [currentUser.uid, userId],
                    lastMessage: '',
                    lastMessageTime: new Date(),
                    createdAt: new Date()
                });
                chatId = newChat.id;
            }
            await db.collection('chats').doc(chatId).collection('messages').add({
                senderId: currentUser.uid,
                text: `📸 스토리에 답장: ${text}`,
                timestamp: new Date(),
                type: 'text'
            });
            await db.collection('chats').doc(chatId).update({
                lastMessage: `📸 스토리에 답장: ${text}`,
                lastMessageTime: new Date()
            });

            // Create notification
            await createNotification(userId, 'social_comment', {
                message: `📸 스토리에 답장이 왔습니다`,
                fromUid: currentUser.uid,
                storyId
            });
        }
        input.value = '';
        showToast('📤 답장을 보냈습니다', 'success');
    } catch (e) {
        showToast('답장 실패', 'error');
    }
}

async function showStoryViewers(storyId) {
    try {
        const doc = await db.collection('stories').doc(storyId).get();
        const viewers = doc.data()?.viewers || [];
        if (viewers.length === 0) {
            showToast('아직 조회한 사람이 없습니다', 'info');
            return;
        }

        let html = '';
        for (const uid of viewers) {
            const info = await getUserDisplayInfo(uid);
            html += `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0;">
                ${avatarHTML(info.photoURL, info.nickname, 36)}
                <span style="font-size:0.9rem;font-weight:600;">${info.nickname}</span>
            </div>`;
        }

        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.7);z-index:100000;display:flex;align-items:center;justify-content:center;padding:1rem;';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        modal.innerHTML = `<div style="background:var(--bg-card,#3D2B1F);padding:1.2rem;border-radius:16px;max-width:340px;width:100%;max-height:60vh;overflow-y:auto;">
            <h4 style="margin-bottom:0.8rem;">👁 조회 ${viewers.length}명</h4>
            ${html}
            <button onclick="this.parentElement.parentElement.remove()" style="width:100%;margin-top:0.8rem;padding:0.6rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;background:var(--bg-card,#3D2B1F);cursor:pointer;">닫기</button>
        </div>`;
        document.body.appendChild(modal);
    } catch (e) {
        showToast('조회 목록 로드 실패', 'error');
    }
}

// ========== DELETE EXPIRED STORIES (client-side cleanup) ==========
async function cleanupExpiredStories() {
    try {
        const now = new Date();
        const expired = await db.collection('stories')
            .where('expiresAt', '<', now)
            .where('userId', '==', currentUser?.uid)
            .limit(20)
            .get();
        for (const doc of expired.docs) {
            await db.collection('stories').doc(doc.id).delete();
        }
    } catch (e) { /* silent */ }
}

// Init
function initStories() {
    loadStoryRing();
    // Cleanup expired stories periodically
    setTimeout(cleanupExpiredStories, 5000);
    setInterval(cleanupExpiredStories, 5 * 60 * 1000);
}
