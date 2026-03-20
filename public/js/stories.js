// ===== stories.js v2.0 — STORIES (스토리) =====
(function() {
    'use strict';

    let _cache = {};          // { userId: [storyDoc, ...] }
    let _viewerIdx = 0;
    let _itemIdx = 0;
    let _progressTimer = null;
    let _mediaFile = null;
    let _mediaType = null;

    // ========== UPLOAD MODAL ==========
    function openUpload() {
        document.getElementById('story-upload-modal')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'story-upload-modal';
        overlay.className = 'crny-overlay crny-overlay--dark';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        overlay.innerHTML = `
        <div class="crny-modal crny-modal--sm">
            <h3><i data-lucide="camera"></i> ${t('story.create','스토리 만들기')}</h3>
            <div class="crny-preview" id="story-preview-area">
                <span>${t('story.select_media','사진 또는 영상을 선택하세요')}</span>
            </div>
            <div class="crny-btn-row" style="margin-bottom:1rem;">
                <label class="crny-media-btn">
                    <i data-lucide="image"></i>${t('story.photo','사진')}
                    <input type="file" id="story-photo-input" accept="image/*">
                </label>
                <label class="crny-media-btn">
                    <i data-lucide="video"></i>${t('story.video_15s','영상 (15초)')}
                    <input type="file" id="story-video-input" accept="video/*">
                </label>
            </div>
            <input type="text" id="story-text-input" class="crny-input" placeholder="${t('story.add_text','텍스트 추가...')}" style="margin-bottom:0.8rem;">
            <div class="crny-btn-row">
                <button class="crny-btn crny-btn--ghost crny-btn--flex" onclick="document.getElementById('story-upload-modal')?.remove()">${t('story.cancel','취소')}</button>
                <button class="crny-btn crny-btn--primary crny-btn--flex" id="story-upload-btn" disabled>${t('story.upload_btn','스토리 올리기')}</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [overlay] });

        // Bind file inputs
        overlay.querySelector('#story-photo-input').addEventListener('change', function() { _handleMedia(this, 'image'); });
        overlay.querySelector('#story-video-input').addEventListener('change', function() { _handleMedia(this, 'video'); });
        overlay.querySelector('#story-upload-btn').addEventListener('click', _doUpload);
    }

    function _handleMedia(input, type) {
        const file = input.files[0];
        if (!file) return;
        const area = document.getElementById('story-preview-area');
        const url = URL.createObjectURL(file);

        if (type === 'video') {
            if (file.size > 30 * 1024 * 1024) { showToast(t('story.video_too_large','영상은 30MB 이하만 가능합니다'), 'warning'); return; }
            area.innerHTML = `<video src="${url}" muted autoplay loop></video>`;
            const v = area.querySelector('video');
            v.onloadedmetadata = () => {
                if (v.duration > 15) {
                    showToast(t('story.video_too_long','스토리 영상은 15초 이하만 가능합니다'), 'warning');
                    _mediaFile = null;
                    area.innerHTML = '<span>' + t('story.video_limit_hint','15초 이하 영상만 가능합니다') + '</span>';
                    document.getElementById('story-upload-btn').disabled = true;
                    return;
                }
                _mediaFile = file; _mediaType = type;
                document.getElementById('story-upload-btn').disabled = false;
            };
        } else {
            if (file.size > 10 * 1024 * 1024) { showToast(t('story.photo_too_large','사진은 10MB 이하만 가능합니다'), 'warning'); return; }
            area.innerHTML = `<img src="${url}" loading="lazy">`;
            _mediaFile = file; _mediaType = type;
            document.getElementById('story-upload-btn').disabled = false;
        }
    }

    async function _doUpload() {
        if (!currentUser || !_mediaFile) return;
        const btn = document.getElementById('story-upload-btn');
        btn.disabled = true;
        btn.textContent = t('story.uploading','업로드 중...');

        try {
            const text = document.getElementById('story-text-input')?.value?.trim() || '';
            const ext = _mediaFile.name.split('.').pop();
            const fileName = `stories/${currentUser.uid}/${Date.now()}.${ext}`;
            const ref = firebase.storage().ref(fileName);
            await ref.put(_mediaFile);
            const mediaUrl = await ref.getDownloadURL();

            await db.collection('stories').add({
                userId: currentUser.uid,
                mediaUrl,
                mediaType: _mediaType,
                text,
                viewers: [],
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            showToast(t('story.uploaded','스토리가 올라갔습니다!'), 'success');
            document.getElementById('story-upload-modal')?.remove();
            _mediaFile = null;
            loadRing();
        } catch (e) {
            console.error('Story upload error:', e);
            showToast(t('story.upload_failed','스토리 업로드 실패') + ': ' + e.message, 'error');
            btn.disabled = false;
            btn.textContent = t('story.upload_btn','스토리 올리기');
        }
    }

    // ========== STORY RING (TOP OF FEED) ==========
    async function loadRing() {
        if (!currentUser) return;
        const container = document.getElementById('story-ring-container');
        if (!container) return;

        try {
            const now = new Date();
            const snap = await db.collection('stories')
                .where('expiresAt', '>', now)
                .orderBy('expiresAt')
                .limit(100)
                .get();

            const userStories = {};
            snap.docs.forEach(doc => {
                const d = doc.data();
                if (!userStories[d.userId]) userStories[d.userId] = [];
                userStories[d.userId].push({ id: doc.id, ...d });
            });
            _cache = userStories;

            let html = '';

            // My story first
            const myStories = userStories[currentUser.uid] || [];
            const myInfo = await getUserDisplayInfo(currentUser.uid);
            html += `<div class="story-ring-item" data-uid="${currentUser.uid}" data-has="${myStories.length}">
                <div class="story-avatar-wrap ${myStories.length > 0 ? 'has-story' : ''}" style="position:relative;">
                    ${avatarHTML(myInfo.photoURL, myInfo.nickname, 60)}
                    ${myStories.length === 0 ? '<div class="story-add-badge">+</div>' : ''}
                </div>
                <span class="story-username">${t('story.my_story','내 스토리')}</span>
            </div>`;

            // Get following/friends for priority sort
            const followSnap = await db.collection('users').doc(currentUser.uid).collection('following').get();
            const followSet = new Set(followSnap.docs.map(d => d.id));
            const friendSnap = await db.collection('users').doc(currentUser.uid).collection('friends').get();
            friendSnap.docs.forEach(d => followSet.add(d.id));

            const others = Object.keys(userStories).filter(uid => uid !== currentUser.uid);
            others.sort((a, b) => (followSet.has(a) ? 0 : 1) - (followSet.has(b) ? 0 : 1));

            for (const uid of others) {
                const stories = userStories[uid];
                const info = await getUserDisplayInfo(uid);
                const viewed = stories.every(s => s.viewers?.includes(currentUser.uid));
                html += `<div class="story-ring-item" data-uid="${uid}">
                    <div class="story-avatar-wrap ${viewed ? 'viewed' : 'has-story'}">
                        ${avatarHTML(info.photoURL, info.nickname, 60)}
                    </div>
                    <span class="story-username">${(info.nickname || '').substring(0, 8)}</span>
                </div>`;
            }

            container.innerHTML = html;
            container.style.display = 'flex';

            // Event delegation for ring clicks
            container.onclick = (e) => {
                const item = e.target.closest('.story-ring-item');
                if (!item) return;
                const uid = item.dataset.uid;
                if (uid === currentUser.uid && item.dataset.has === '0') {
                    openUpload();
                } else {
                    _openViewer(uid);
                }
            };
        } catch (e) {
            console.error('Story ring error:', e);
            container.innerHTML = '';
        }
    }

    // ========== STORY VIEWER (FULLSCREEN) ==========
    function _openViewer(userId) {
        const stories = _cache[userId];
        if (!stories || stories.length === 0) {
            if (userId === currentUser.uid) openUpload();
            return;
        }
        _viewerIdx = Object.keys(_cache).indexOf(userId);
        _itemIdx = 0;
        _showContent(userId, 0);
    }

    async function _showContent(userId, itemIdx) {
        const stories = _cache[userId];
        if (!stories || itemIdx >= stories.length) {
            const allUsers = Object.keys(_cache);
            const curIdx = allUsers.indexOf(userId);
            if (curIdx < allUsers.length - 1) {
                _viewerIdx = curIdx + 1;
                _itemIdx = 0;
                _showContent(allUsers[curIdx + 1], 0);
            } else {
                _close();
            }
            return;
        }
        if (itemIdx < 0) {
            const allUsers = Object.keys(_cache);
            const curIdx = allUsers.indexOf(userId);
            if (curIdx > 0) {
                const prevUser = allUsers[curIdx - 1];
                const prevStories = _cache[prevUser];
                _viewerIdx = curIdx - 1;
                _itemIdx = prevStories.length - 1;
                _showContent(prevUser, prevStories.length - 1);
            }
            return;
        }

        _itemIdx = itemIdx;
        const story = stories[itemIdx];
        const info = await getUserDisplayInfo(userId);
        const timeAgo = getTimeAgo(story.createdAt?.toDate?.() || new Date());
        const isMe = userId === currentUser.uid;

        // Mark as viewed
        if (!isMe && !story.viewers?.includes(currentUser.uid)) {
            db.collection('stories').doc(story.id).update({
                viewers: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            }).catch(e => console.warn(e.message));
        }

        // Cleanup existing
        document.getElementById('story-viewer-overlay')?.remove();
        clearInterval(_progressTimer);

        const overlay = document.createElement('div');
        overlay.id = 'story-viewer-overlay';
        overlay.className = 'crny-viewer';

        // Progress bars
        let progressHTML = '<div class="crny-viewer-progress">';
        for (let i = 0; i < stories.length; i++) {
            progressHTML += `<div class="crny-viewer-progress-seg">
                <div class="crny-viewer-progress-fill" id="story-progress-${i}" style="width:${i < itemIdx ? '100' : '0'}%;"></div>
            </div>`;
        }
        progressHTML += '</div>';

        const mediaHTML = story.mediaType === 'video'
            ? `<video id="story-media" src="${story.mediaUrl}" autoplay playsinline></video>`
            : `<img id="story-media" src="${story.mediaUrl}">`;

        overlay.innerHTML = `
            ${progressHTML}
            <div class="crny-viewer-header">
                ${avatarHTML(info.photoURL, info.nickname, 32)}
                <span class="author-name">${info.nickname}</span>
                <span class="time-ago">${timeAgo}</span>
                ${isMe ? `<button data-action="viewers" data-id="${story.id}"><i data-lucide="eye"></i>${story.viewers?.length || 0}</button>` : ''}
                <button class="close-btn" data-action="close"><i data-lucide="x"></i></button>
            </div>
            <div class="crny-viewer-body">
                ${mediaHTML}
                ${story.text ? `<div class="crny-viewer-text-overlay" style="bottom:80px;">${story.text}</div>` : ''}
                <div class="crny-viewer-tap-left" data-action="prev"></div>
                <div class="crny-viewer-tap-right" data-action="next"></div>
            </div>
            ${!isMe ? `<div class="crny-viewer-reply">
                <input type="text" id="story-reply-input" placeholder="${t('story.reply_placeholder','답장 보내기...')}" data-uid="${userId}" data-sid="${story.id}">
                <button data-action="reply"><i data-lucide="send"></i></button>
            </div>` : '<div style="height:12px;"></div>'}`;

        document.body.appendChild(overlay);
        if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [overlay] });

        // Event delegation
        overlay.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            if (action === 'close') _close();
            else if (action === 'prev') _tapLeft();
            else if (action === 'next') _tapRight();
            else if (action === 'viewers') _showViewers(btn.dataset.id);
            else if (action === 'reply') {
                const input = document.getElementById('story-reply-input');
                if (input) _sendReply(input.dataset.uid, input.dataset.sid);
            }
        });

        // Enter key for reply
        const replyInput = overlay.querySelector('#story-reply-input');
        if (replyInput) {
            replyInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') _sendReply(replyInput.dataset.uid, replyInput.dataset.sid);
            });
        }

        // Progress timer
        const duration = story.mediaType === 'video' ? 15000 : 5000;
        const bar = document.getElementById(`story-progress-${itemIdx}`);
        let elapsed = 0;
        _progressTimer = setInterval(() => {
            elapsed += 50;
            if (bar) bar.style.width = `${(elapsed / duration) * 100}%`;
            if (elapsed >= duration) {
                clearInterval(_progressTimer);
                _tapRight();
            }
        }, 50);
    }

    function _tapRight() {
        clearInterval(_progressTimer);
        const allUsers = Object.keys(_cache);
        _showContent(allUsers[_viewerIdx], _itemIdx + 1);
    }

    function _tapLeft() {
        clearInterval(_progressTimer);
        const allUsers = Object.keys(_cache);
        _showContent(allUsers[_viewerIdx], _itemIdx - 1);
    }

    function _close() {
        clearInterval(_progressTimer);
        document.getElementById('story-viewer-overlay')?.remove();
        loadRing();
    }

    // ========== REPLY (DM) ==========
    async function _sendReply(userId, storyId) {
        const input = document.getElementById('story-reply-input');
        const text = input?.value?.trim();
        if (!text) return;

        try {
            const userDoc = await db.collection('users').doc(userId).get();
            const email = userDoc.data()?.email;
            if (email) {
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
                    text: `${t('story.replied_prefix','스토리에 답장')}: ${text}`,
                    timestamp: new Date(),
                    type: 'text'
                });
                await db.collection('chats').doc(chatId).update({
                    lastMessage: `${t('story.replied_prefix','스토리에 답장')}: ${text}`,
                    lastMessageTime: new Date()
                });
                await createNotification(userId, 'social_comment', {
                    message: t('story.reply_notification','스토리에 답장이 왔습니다'),
                    fromUid: currentUser.uid,
                    storyId
                });
            }
            input.value = '';
            showToast(t('story.reply_sent','답장을 보냈습니다'), 'success');
        } catch (e) {
            showToast(t('story.reply_failed','답장 실패'), 'error');
        }
    }

    // ========== VIEWERS LIST ==========
    async function _showViewers(storyId) {
        try {
            const doc = await db.collection('stories').doc(storyId).get();
            const viewers = doc.data()?.viewers || [];
            if (viewers.length === 0) { showToast(t('story.no_viewers','아직 조회한 사람이 없습니다'), 'info'); return; }

            let rows = '';
            for (const uid of viewers) {
                const info = await getUserDisplayInfo(uid);
                rows += `<div class="crny-list-row">
                    ${avatarHTML(info.photoURL, info.nickname, 36)}
                    <span class="name">${info.nickname}</span>
                </div>`;
            }

            const modal = document.createElement('div');
            modal.className = 'crny-overlay crny-overlay--light';
            modal.style.zIndex = '100000';
            modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
            modal.innerHTML = `<div class="crny-list-modal">
                <h4><i data-lucide="eye"></i> ${t('story.viewers_title','조회')} ${viewers.length}${t('story.viewers_unit','명')}</h4>
                ${rows}
                <button class="crny-btn crny-btn--ghost" style="width:100%;margin-top:0.8rem;" onclick="this.closest('.crny-overlay').remove()">${t('story.close','닫기')}</button>
            </div>`;
            document.body.appendChild(modal);
            if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [modal] });
        } catch (e) {
            showToast(t('story.viewers_load_failed','조회 목록 로드 실패'), 'error');
        }
    }

    // ========== CLEANUP EXPIRED ==========
    async function _cleanup() {
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

    // ========== INIT ==========
    function init() {
        loadRing();
        setTimeout(_cleanup, 5000);
        setInterval(_cleanup, 5 * 60 * 1000);
    }

    // ========== PUBLIC API ==========
    const api = {
        openUpload,
        loadRing,
        init,
        _close,
    };
    window.STORIES = api;
    // Backward compat: global function aliases
    window.openStoryUpload = openUpload;
    window.initStories = init;
    window.loadStoryRing = loadRing;
    window.closeStoryViewer = _close;

})();
