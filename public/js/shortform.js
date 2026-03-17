// ===== shortform.js — 숏폼 영상 시스템 (IIFE) =====
(function() {
    'use strict';

    const COLLECTION = 'shortform_videos';
    const MAX_DURATION = 60;
    const MAX_SIZE = 50 * 1024 * 1024;
    const THUMB_W = 360, THUMB_H = 640;
    const PAGE_SIZE = 10;

    let reelsData = [];
    let reelsIndex = 0;
    let lastDoc = null;
    let loading = false;
    let reelsMuted = true;

    const CTA_MAP = {
        artist:   { label: '<i data-lucide="heart" style="width:14px;height:14px;margin-right:4px;"></i>후원하기', color: '#B54534', page: 'artist' },
        campaign: { label: '<i data-lucide="heart-handshake" style="width:14px;height:14px;margin-right:4px;"></i>참여하기', color: '#6B8F3C', page: 'fundraise' },
        business: { label: '<i data-lucide="wallet" style="width:14px;height:14px;margin-right:4px;"></i>투자하기', color: '#3D2B1F', page: 'business' },
        art:      { label: '<i data-lucide="palette" style="width:14px;height:14px;margin-right:4px;"></i>구매하기', color: '#8B6914', page: 'art' },
        book:     { label: '<i data-lucide="book-open" style="width:14px;height:14px;margin-right:4px;"></i>읽기', color: '#FF9800', page: 'books' },
        product:  { label: '<i data-lucide="shopping-bag" style="width:14px;height:14px;margin-right:4px;"></i>구매하기', color: '#5B7B8C', page: 'mall' }
    };

    // ====== UPLOAD MODAL ======
    function openUploadModal() {
        if (!window.currentUser) { showToast(t('common.login_required','로그인이 필요합니다'), 'warning'); return; }
        let existing = document.getElementById('shortform-upload-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'shortform-upload-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.7);z-index:99998;display:flex;align-items:center;justify-content:center;padding:1rem;';
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
        modal.innerHTML = `
        <div style="background:var(--card,#F7F3ED);padding:1.5rem;border-radius:16px;max-width:500px;width:100%;max-height:90vh;overflow-y:auto;color:var(--text,#3D2B1F);">
            <h3 style="margin:0 0 1rem;"><i data-lucide="video" style="width:20px;height:20px;margin-right:8px;"></i>${t('shortform.upload_title','숏폼 영상 업로드')}</h3>

            <!-- file select -->
            <label style="display:block;border:2px dashed var(--border,#E8E0D8);border-radius:12px;padding:2rem;text-align:center;cursor:pointer;margin-bottom:1rem;" id="sf-drop-zone">
                <input type="file" id="sf-file" accept="video/mp4,video/quicktime,video/webm" style="display:none;">
                <div id="sf-file-label">📁 ${t('shortform.select_video','동영상 선택')} (60s, 50MB)</div>
            </label>
            <div id="sf-preview" style="display:none;margin-bottom:1rem;text-align:center;">
                <video id="sf-preview-video" style="max-width:100%;max-height:300px;border-radius:12px;" muted playsinline></video>
            </div>

            <!-- editor -->
            <div id="sf-editor" style="display:none;margin-bottom:1rem;">
                <details style="margin-bottom:0.5rem;">
                    <summary style="cursor:pointer;font-weight:600;">✂️ ${t('shortform.trim','트림')}</summary>
                    <div style="display:flex;gap:0.5rem;margin-top:0.5rem;align-items:center;">
                        <label style="font-size:0.8rem;">시작</label>
                        <input type="range" id="sf-trim-start" min="0" max="60" value="0" step="0.1" style="flex:1;">
                        <span id="sf-trim-start-val" style="font-size:0.8rem;width:35px;">0s</span>
                        <label style="font-size:0.8rem;">끝</label>
                        <input type="range" id="sf-trim-end" min="0" max="60" value="60" step="0.1" style="flex:1;">
                        <span id="sf-trim-end-val" style="font-size:0.8rem;width:35px;">60s</span>
                    </div>
                </details>
                <details style="margin-bottom:0.5rem;">
                    <summary style="cursor:pointer;font-weight:600;">🎨 ${t('shortform.filters','필터')}</summary>
                    <div style="margin-top:0.5rem;">
                        <label style="font-size:0.8rem;">밝기</label><input type="range" id="sf-brightness" min="50" max="150" value="100" style="width:100%;"><br>
                        <label style="font-size:0.8rem;">대비</label><input type="range" id="sf-contrast" min="50" max="150" value="100" style="width:100%;"><br>
                        <label style="font-size:0.8rem;">채도</label><input type="range" id="sf-saturate" min="0" max="200" value="100" style="width:100%;"><br>
                        <label style="font-size:0.8rem;">세피아</label><input type="range" id="sf-sepia" min="0" max="100" value="0" style="width:100%;"><br>
                        <label style="font-size:0.8rem;">흑백</label><input type="range" id="sf-grayscale" min="0" max="100" value="0" style="width:100%;">
                    </div>
                </details>
                <details style="margin-bottom:0.5rem;">
                    <summary style="cursor:pointer;font-weight:600;">📝 ${t('shortform.text_overlay','텍스트 오버레이')}</summary>
                    <div style="margin-top:0.5rem;">
                        <input type="text" id="sf-text" placeholder="${t('shortform.enter_text','캡션 텍스트')}" style="width:100%;padding:0.5rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;margin-bottom:0.5rem;">
                        <div style="display:flex;gap:0.5rem;">
                            <select id="sf-text-pos" style="padding:0.4rem;border:1px solid var(--border);border-radius:6px;">
                                <option value="top">상단</option><option value="center">중앙</option><option value="bottom" selected>하단</option>
                            </select>
                            <input type="color" id="sf-text-color" value="#FFF8F0" style="width:40px;height:32px;border:none;cursor:pointer;">
                            <input type="range" id="sf-text-size" min="12" max="48" value="24" style="flex:1;">
                        </div>
                    </div>
                </details>
            </div>

            <!-- caption & hashtags -->
            <textarea id="sf-caption" placeholder="${t('shortform.caption_placeholder','캡션을 입력하세요 #해시태그')}" rows="2" style="width:100%;padding:0.6rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;resize:none;margin-bottom:0.5rem;font-size:0.9rem;"></textarea>

            <!-- service link -->
            <div style="margin-bottom:0.8rem;">
                <label style="font-size:0.85rem;font-weight:600;display:block;margin-bottom:0.3rem;"><i data-lucide="link" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('shortform.service_link','서비스 링크 태그')}</label>
                <div style="display:flex;gap:0.4rem;flex-wrap:wrap;" id="sf-service-btns">
                    ${Object.entries(CTA_MAP).map(([k,v]) => `<button type="button" class="sf-svc-btn" data-type="${k}" onclick="SHORTFORM._selectService('${k}')" style="padding:0.3rem 0.6rem;border:1px solid ${v.color};border-radius:16px;background:transparent;color:${v.color};font-size:0.75rem;cursor:pointer;">${v.label}</button>`).join('')}
                </div>
                <div id="sf-service-search" style="display:none;margin-top:0.5rem;">
                    <div style="display:flex;gap:0.4rem;">
                        <input type="text" id="sf-svc-query" placeholder="${t('shortform.search_item','항목 검색...')}" style="flex:1;padding:0.4rem;border:1px solid var(--border);border-radius:8px;font-size:0.85rem;">
                        <button onclick="SHORTFORM._searchService()" style="padding:0.4rem 0.8rem;border:none;border-radius:8px;background:var(--accent,#8B6914);color:#FFF8F0;cursor:pointer;font-size:0.85rem;">검색</button>
                    </div>
                    <div id="sf-svc-results" style="max-height:150px;overflow-y:auto;margin-top:0.3rem;"></div>
                </div>
                <div id="sf-svc-selected" style="display:none;margin-top:0.3rem;padding:0.4rem 0.6rem;background:var(--bg,#F7F3ED);border-radius:8px;font-size:0.85rem;"></div>
            </div>

            <!-- progress -->
            <div id="sf-progress" style="display:none;margin-bottom:0.8rem;">
                <div style="background:var(--border,#E8E0D8);border-radius:8px;height:6px;overflow:hidden;">
                    <div id="sf-progress-bar" style="height:100%;background:#8B6914;width:0%;transition:width 0.3s;"></div>
                </div>
                <div id="sf-progress-text" style="font-size:0.75rem;color:#6B5744;margin-top:0.2rem;text-align:center;">0%</div>
            </div>

            <!-- actions -->
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
                <button onclick="document.getElementById('shortform-upload-modal').remove()" style="padding:0.6rem 1rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;cursor:pointer;background:transparent;color:var(--text);">${t('common.cancel','취소')}</button>
                <button id="sf-submit-btn" onclick="SHORTFORM._doUpload()" style="padding:0.6rem 1.2rem;border:none;border-radius:8px;background:#3D2B1F;color:#FFF8F0;cursor:pointer;font-weight:600;" disabled>${t('shortform.upload','업로드')}</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();

        // Bind file input
        const fileInput = modal.querySelector('#sf-file');
        fileInput.addEventListener('change', handleFileSelect);

        // Bind filter preview
        ['sf-brightness','sf-contrast','sf-saturate','sf-sepia','sf-grayscale'].forEach(id => {
            modal.querySelector('#'+id)?.addEventListener('input', updateFilterPreview);
        });
    }

    let _selectedFile = null;
    let _serviceLink = null;
    let _selectedServiceType = null;

    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > MAX_SIZE) { showToast(t('shortform.size_limit','50MB 이하만 가능합니다'), 'warning'); return; }
        if (!['video/mp4','video/quicktime','video/webm'].includes(file.type)) {
            showToast(t('shortform.format_error','MP4/MOV/WebM만 지원'), 'warning'); return;
        }
        _selectedFile = file;
        const url = URL.createObjectURL(file);
        const vid = document.getElementById('sf-preview-video');
        vid.src = url;
        document.getElementById('sf-preview').style.display = 'block';
        document.getElementById('sf-editor').style.display = 'block';
        document.getElementById('sf-file-label').textContent = file.name;
        document.getElementById('sf-submit-btn').disabled = false;

        vid.onloadedmetadata = () => {
            if (vid.duration > MAX_DURATION) {
                showToast(t('shortform.duration_limit','60초 이하만 가능합니다'), 'warning');
                _selectedFile = null;
                document.getElementById('sf-preview').style.display = 'none';
                document.getElementById('sf-editor').style.display = 'none';
                document.getElementById('sf-submit-btn').disabled = true;
                return;
            }
            const dur = Math.round(vid.duration * 10) / 10;
            document.getElementById('sf-trim-end').max = dur;
            document.getElementById('sf-trim-end').value = dur;
            document.getElementById('sf-trim-end-val').textContent = dur + 's';
            document.getElementById('sf-trim-start').max = dur;

            document.getElementById('sf-trim-start').oninput = function() {
                document.getElementById('sf-trim-start-val').textContent = (+this.value).toFixed(1) + 's';
            };
            document.getElementById('sf-trim-end').oninput = function() {
                document.getElementById('sf-trim-end-val').textContent = (+this.value).toFixed(1) + 's';
            };
        };
    }

    function updateFilterPreview() {
        const vid = document.getElementById('sf-preview-video');
        if (!vid) return;
        vid.style.filter = buildFilterCSS();
    }

    function buildFilterCSS() {
        const b = document.getElementById('sf-brightness')?.value || 100;
        const c = document.getElementById('sf-contrast')?.value || 100;
        const s = document.getElementById('sf-saturate')?.value || 100;
        const sep = document.getElementById('sf-sepia')?.value || 0;
        const g = document.getElementById('sf-grayscale')?.value || 0;
        return `brightness(${b}%) contrast(${c}%) saturate(${s}%) sepia(${sep}%) grayscale(${g}%)`;
    }

    function _selectService(type) {
        _selectedServiceType = type;
        document.querySelectorAll('.sf-svc-btn').forEach(b => {
            b.style.background = b.dataset.type === type ? CTA_MAP[type].color : 'transparent';
            b.style.color = b.dataset.type === type ? '#E8D5C4' : CTA_MAP[type]?.color || '#6B5744';
        });
        document.getElementById('sf-service-search').style.display = 'block';
        document.getElementById('sf-svc-query').value = '';
        document.getElementById('sf-svc-results').innerHTML = '';
        _searchService();
    }

    async function _searchService() {
        if (!_selectedServiceType) return;
        const cfg = SERVICE_LINK_CONFIG[_selectedServiceType];
        if (!cfg) return;
        const q = document.getElementById('sf-svc-query').value.trim();
        const results = document.getElementById('sf-svc-results');
        results.innerHTML = '<p style="text-align:center;font-size:0.8rem;color:var(--text-muted,#6B5744);">로딩...</p>';
        try {
            let query = db.collection(cfg.collection).limit(10);
            const snap = await query.get();
            let html = '';
            snap.forEach(doc => {
                const d = doc.data();
                const name = d[cfg.nameField] || d.title || d.name || doc.id;
                if (q && !name.toLowerCase().includes(q.toLowerCase())) return;
                html += `<div onclick="SHORTFORM._pickService('${_selectedServiceType}','${doc.id}','${name.replace(/'/g,"\\'")}')" style="padding:0.5rem;border-bottom:1px solid var(--border,#E8E0D8);cursor:pointer;font-size:0.85rem;display:flex;justify-content:space-between;align-items:center;"><span>${name}</span><span style="color:${CTA_MAP[_selectedServiceType].color};font-size:0.75rem;">${CTA_MAP[_selectedServiceType].label}</span></div>`;
            });
            results.innerHTML = html || '<p style="text-align:center;font-size:0.8rem;color:var(--text-muted,#6B5744);">결과 없음</p>';
        } catch(e) { results.innerHTML = '<p style="color:red;font-size:0.8rem;">검색 실패</p>'; }
    }

    function _pickService(type, id, title) {
        _serviceLink = { type, id, title };
        document.getElementById('sf-service-search').style.display = 'none';
        const sel = document.getElementById('sf-svc-selected');
        sel.style.display = 'block';
        sel.innerHTML = `${CTA_MAP[type].label} — <strong>${title}</strong> <button onclick="SHORTFORM._clearService()" style="background:none;border:none;color:red;cursor:pointer;font-size:0.85rem;">✕</button>`;
    }

    function _clearService() {
        _serviceLink = null;
        document.getElementById('sf-svc-selected').style.display = 'none';
        document.querySelectorAll('.sf-svc-btn').forEach(b => { b.style.background = 'transparent'; b.style.color = CTA_MAP[b.dataset.type]?.color || '#6B5744'; });
    }

    // ====== THUMBNAIL GENERATION ======
    function generateThumbnail(videoFile) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'auto';
            video.muted = true;
            video.playsInline = true;
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            const url = URL.createObjectURL(videoFile);
            video.src = url;
            
            // 모바일 호환: play() 후 seek
            video.onloadeddata = () => {
                video.play().then(() => {
                    video.pause();
                    video.currentTime = Math.min(1, video.duration / 2);
                }).catch(() => {
                    video.currentTime = Math.min(1, video.duration / 2);
                });
            };
            
            // 5초 타임아웃 (모바일에서 안 불릴 경우)
            const timeout = setTimeout(() => { URL.revokeObjectURL(url); resolve(null); }, 5000);
            
            video.onseeked = () => {
                clearTimeout(timeout);
                const canvas = document.createElement('canvas');
                canvas.width = THUMB_W;
                canvas.height = THUMB_H;
                const ctx = canvas.getContext('2d');
                const vw = video.videoWidth, vh = video.videoHeight;
                const scale = Math.max(THUMB_W / vw, THUMB_H / vh);
                const sw = THUMB_W / scale, sh = THUMB_H / scale;
                const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
                ctx.drawImage(video, sx, sy, sw, sh, 0, 0, THUMB_W, THUMB_H);
                canvas.toBlob(blob => {
                    URL.revokeObjectURL(url);
                    resolve(blob);
                }, 'image/jpeg', 0.8);
            };
            video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        });
    }

    // ====== UPLOAD ======
    async function _doUpload() {
        if (!_selectedFile || !window.currentUser) return;
        const uid = currentUser.uid;
        const ts = Date.now();
        const caption = document.getElementById('sf-caption').value.trim();
        const hashtags = caption.match(/#[\w가-힣]+/g) || [];

        const trimStart = parseFloat(document.getElementById('sf-trim-start')?.value) || 0;
        const trimEnd = parseFloat(document.getElementById('sf-trim-end')?.value) || 0;
        const filterCSS = buildFilterCSS();
        const isDefaultFilter = filterCSS === 'brightness(100%) contrast(100%) saturate(100%) sepia(0%) grayscale(0%)';
        const textOverlay = document.getElementById('sf-text')?.value || '';
        const textPosition = document.getElementById('sf-text-pos')?.value || 'bottom';
        const textColor = document.getElementById('sf-text-color')?.value || '#FFF8F0';
        const textSize = document.getElementById('sf-text-size')?.value || 24;

        document.getElementById('sf-submit-btn').disabled = true;
        document.getElementById('sf-progress').style.display = 'block';

        try {
            // Upload video
            const storageRef = firebase.storage().ref(`videos/${uid}/${ts}.mp4`);
            const uploadTask = storageRef.put(_selectedFile);

            const videoUrl = await new Promise((resolve, reject) => {
                uploadTask.on('state_changed',
                    snap => {
                        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
                        document.getElementById('sf-progress-bar').style.width = pct + '%';
                        document.getElementById('sf-progress-text').textContent = pct + '%';
                    },
                    reject,
                    async () => { resolve(await uploadTask.snapshot.ref.getDownloadURL()); }
                );
            });

            // Upload thumbnail
            let thumbnailUrl = '';
            const thumbBlob = await generateThumbnail(_selectedFile);
            if (thumbBlob) {
                const thumbRef = firebase.storage().ref(`videos/${uid}/${ts}_thumb.jpg`);
                await thumbRef.put(thumbBlob);
                thumbnailUrl = await thumbRef.getDownloadURL();
            }

            // Save to Firestore
            const videoDoc = {
                authorUid: uid,
                videoUrl,
                thumbnailUrl,
                caption,
                hashtags,
                serviceLink: _serviceLink || null,
                likes: 0,
                likedBy: [],
                views: 0,
                commentCount: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                trimStart: trimStart > 0 ? trimStart : null,
                trimEnd: trimEnd > 0 ? trimEnd : null,
                filter: isDefaultFilter ? null : filterCSS,
                textOverlay: textOverlay || null,
                textPosition,
                textColor,
                textSize: parseInt(textSize)
            };

            await db.collection(COLLECTION).add(videoDoc);
            showToast(t('shortform.upload_success','<i data-lucide="video" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> 숏폼 영상 업로드 완료!'), 'success');
            document.getElementById('shortform-upload-modal').remove();
            _selectedFile = null;
            _serviceLink = null;

            // Refresh feed if on reels page
            if (location.hash.includes('page=reels')) loadReelsFeed(true);
        } catch (e) {
            console.error('Shortform upload error:', e);
            let errMsg = e.message;
            if (e.code === 'storage/unauthorized') errMsg = t('shortform.err_auth','로그인이 필요합니다');
            else if (e.code === 'storage/canceled') errMsg = t('shortform.err_canceled','업로드가 취소되었습니다');
            else if (e.code === 'storage/unknown') errMsg = t('shortform.err_network','네트워크 오류. 다시 시도해주세요');
            showToast(t('shortform.upload_fail','업로드 실패: ') + errMsg, 'error');
            document.getElementById('sf-submit-btn').disabled = false;
            document.getElementById('sf-progress').style.display = 'none';
        }
    }

    // ====== REELS FEED ======
    async function loadReelsFeed(reset) {
        if (loading) return;
        if (reset) { reelsData = []; lastDoc = null; reelsIndex = 0; }
        loading = true;
        try {
            let q = db.collection(COLLECTION).orderBy('createdAt','desc').limit(PAGE_SIZE);
            if (lastDoc) q = q.startAfter(lastDoc);
            const snap = await q.get();
            if (snap.empty && reelsData.length === 0) {
                document.getElementById('reels-container').innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:80vh;color:var(--text-muted,#6B5744);"><div style="font-size:3rem;margin-bottom:1rem;"><i data-lucide="video" style="width:48px;height:48px;display:block;"></i></div><p>${t('shortform.no_videos','아직 영상이 없습니다')}</p><button onclick="SHORTFORM.openUpload()" style="margin-top:1rem;padding:0.6rem 1.2rem;border:none;border-radius:8px;background:#3D2B1F;color:#FFF8F0;cursor:pointer;font-weight:600;">${t('shortform.first_upload','첫 영상 올리기')}</button></div>`;
                loading = false; return;
            }
            const newItems = [];
            for (const doc of snap.docs) {
                const d = doc.data();
                // Fetch author info
                let authorName = '사용자';
                let authorPhoto = '';
                try {
                    const uSnap = await db.collection('users').doc(d.authorUid).get();
                    if (uSnap.exists) { authorName = uSnap.data().nickname || uSnap.data().displayName || '사용자'; authorPhoto = uSnap.data().photoURL || ''; }
                } catch(_){}
                newItems.push({ id: doc.id, ...d, authorName, authorPhoto });
                lastDoc = doc;
            }
            reelsData.push(...newItems);
            renderReels();
        } catch(e) { console.error('Load reels error:', e); }
        loading = false;
    }

    function renderReels() {
        const container = document.getElementById('reels-container');
        if (!container) return;
        if (reelsData.length === 0) return;
        
        // Build snap-scroll container
        container.className = 'reels-fullscreen';
        container.innerHTML = '';
        
        reelsData.forEach((reel, idx) => {
            const isLiked = reel.likedBy && window.currentUser && reel.likedBy.includes(window.currentUser.uid);
            const filterStyle = reel.filter ? `filter:${reel.filter};` : '';
            
            const item = document.createElement('div');
            item.className = 'reel-item';
            item.dataset.index = idx;
            item.innerHTML = `
                <video src="${reel.videoUrl}" style="${filterStyle}" playsinline loop muted preload="metadata"></video>
                <button class="reel-mute-toggle" onclick="SHORTFORM._toggleMute()">${reelsMuted?'🔇':'🔊'}</button>
                <div class="reel-overlay-bottom">
                    <div class="reel-author">
                        ${reel.authorPhoto ? `<img src="${reel.authorPhoto}">` : ''}
                        <span class="reel-author-name">${reel.authorName}</span>
                    </div>
                    <div class="reel-caption">${(reel.caption || '').substring(0, 120)}</div>
                    ${reel.hashtags?.length ? `<div class="reel-tags">${reel.hashtags.join(' ')}</div>` : ''}
                </div>
                <div class="reel-side-actions">
                    ${reel.authorPhoto ? `<button class="reel-action-btn"><img class="reel-profile-pic" src="${reel.authorPhoto}"></button>` : ''}
                    <button class="reel-action-btn" onclick="SHORTFORM._toggleLike('${reel.id}')">
                        <span class="action-icon">${isLiked ? '<i data-lucide="heart" style="width:20px;height:20px;display:inline-block;vertical-align:middle;fill:currentColor;"></i>' : '<i data-lucide="heart" style="width:20px;height:20px;display:inline-block;vertical-align:middle;"></i>'}</span>
                        <span class="action-count">${reel.likes || 0}</span>
                    </button>
                    <button class="reel-action-btn" onclick="SHORTFORM._openComments('${reel.id}')">
                        <span class="action-icon"><i data-lucide="message-circle" style="width:20px;height:20px;display:inline-block;vertical-align:middle;"></i></span>
                        <span class="action-count">${reel.commentCount || 0}</span>
                    </button>
                    <button class="reel-action-btn" onclick="SHORTFORM._shareReel('${reel.id}')">
                        <span class="action-icon"><i data-lucide="share-2" style="width:20px;height:20px;display:inline-block;vertical-align:middle;"></i></span>
                    </button>
                </div>
            `;
            container.appendChild(item);
        });
        
        // Intersection observer for autoplay
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target.querySelector('video');
                if (!video) return;
                if (entry.isIntersecting) {
                    video.play().catch(()=>{});
                    video.muted = reelsMuted;
                    // Increment views
                    const idx = parseInt(entry.target.dataset.index);
                    if (reelsData[idx]) {
                        reelsIndex = idx;
                        db.collection(COLLECTION).doc(reelsData[idx].id).update({ views: firebase.firestore.FieldValue.increment(1) }).catch(()=>{});
                    }
                    // Prefetch next
                    if (idx >= reelsData.length - 3 && !loading) loadReelsFeed(false);
                } else {
                    video.pause();
                }
            });
        }, { threshold: 0.7 });
        
        container.querySelectorAll('.reel-item').forEach(item => observer.observe(item));
    }

    function renderSingleReel(idx) {
        if (idx < 0 || idx >= reelsData.length) return;
        const reel = reelsData[idx];
        const container = document.getElementById('reels-container');
        reelsIndex = idx;

        const sl = reel.serviceLink;
        let ctaHTML = '';
        if (sl) {
            const cta = CTA_MAP[sl.type] || {};
            ctaHTML = `<button onclick="SHORTFORM._navigateCTA('${sl.type}','${sl.id}')" style="position:absolute;bottom:90px;left:50%;transform:translateX(-50%);padding:0.7rem 1.5rem;border:none;border-radius:24px;background:${cta.color||'#3D2B1F'};color:#FFF8F0;font-weight:700;font-size:0.95rem;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.3);z-index:10;white-space:nowrap;">${cta.label || '보기'}</button>`;
        }

        const filterStyle = reel.filter ? `filter:${reel.filter};` : '';
        const textPos = reel.textPosition === 'top' ? 'top:12%' : reel.textPosition === 'center' ? 'top:45%' : 'bottom:15%';
        const textHTML = reel.textOverlay ? `<div style="position:absolute;left:0;right:0;text-align:center;${textPos};font-size:${reel.textSize||24}px;font-weight:700;color:${reel.textColor||'#E8D5C4'};text-shadow:0 2px 8px rgba(61,43,31,0.8);pointer-events:none;padding:0 1rem;">${reel.textOverlay}</div>` : '';

        const isLiked = reel.likedBy && currentUser && reel.likedBy.includes(currentUser.uid);

        container.innerHTML = `
        <div class="reel-slide" style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#FFF8F0;">
            <video id="reel-video" src="${reel.videoUrl}" style="max-width:100%;max-height:100%;object-fit:contain;${filterStyle}" playsinline loop ${reelsMuted?'muted':''} autoplay
                ${reel.trimStart ? `data-trim-start="${reel.trimStart}"` : ''} ${reel.trimEnd ? `data-trim-end="${reel.trimEnd}"` : ''}></video>
            ${textHTML}

            <!-- Mute toggle -->
            <button onclick="SHORTFORM._toggleMute()" id="reel-mute-btn" style="position:absolute;top:16px;left:16px;background:rgba(61,43,31,0.5);color:#FFF8F0;border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;font-size:1rem;z-index:10;">${reelsMuted?'🔇':'🔊'}</button>

            <!-- Counter -->
            <div style="position:absolute;top:16px;right:16px;background:rgba(61,43,31,0.5);color:#FFF8F0;border-radius:12px;padding:0.2rem 0.6rem;font-size:0.75rem;z-index:10;">${idx+1}/${reelsData.length}</div>

            <!-- Author + caption -->
            <div style="position:absolute;bottom:20px;left:16px;right:80px;color:#FFF8F0;z-index:5;">
                <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem;">
                    ${reel.authorPhoto ? `<img src="${reel.authorPhoto}" loading="lazy" style="width:28px;height:28px;border-radius:50%;object-fit:cover;">` : ''}
                    <strong style="font-size:0.95rem;">${reel.authorName}</strong>
                </div>
                <p style="font-size:0.85rem;margin:0;opacity:0.9;">${(reel.caption || '').substring(0, 120)}</p>
                ${reel.hashtags?.length ? `<div style="font-size:0.75rem;opacity:0.7;margin-top:0.2rem;">${reel.hashtags.join(' ')}</div>` : ''}
            </div>

            <!-- Side actions -->
            <div style="position:absolute;right:12px;bottom:100px;display:flex;flex-direction:column;gap:1.2rem;align-items:center;z-index:5;">
                <button onclick="SHORTFORM._toggleLike('${reel.id}')" style="background:none;border:none;cursor:pointer;color:#FFF8F0;text-align:center;">
                    <div style="font-size:1.6rem;"><i data-lucide="heart" style="width:24px;height:24px;display:block;${isLiked ? 'fill:currentColor;' : ''}" ></i></div>
                    <div style="font-size:0.75rem;">${reel.likes || 0}</div>
                </button>
                <button onclick="SHORTFORM._openComments('${reel.id}')" style="background:none;border:none;cursor:pointer;color:#FFF8F0;text-align:center;">
                    <div style="font-size:1.6rem;"><i data-lucide="message-circle" style="width:24px;height:24px;display:block;"></i></div>
                    <div style="font-size:0.75rem;">${reel.commentCount || 0}</div>
                </button>
                <button onclick="SHORTFORM._shareReel('${reel.id}')" style="background:none;border:none;cursor:pointer;color:#FFF8F0;text-align:center;">
                    <div style="font-size:1.6rem;"><i data-lucide="share-2" style="width:24px;height:24px;display:block;"></i></div>
                </button>
            </div>

            ${ctaHTML}

            <!-- Nav -->
            ${idx > 0 ? `<button onclick="SHORTFORM._nav(-1)" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-100%) translateY(-2rem);background:rgba(255,255,255,0.15);border:none;border-radius:50%;width:44px;height:44px;cursor:pointer;color:#FFF8F0;font-size:1.2rem;z-index:10;">▲</button>` : ''}
            ${idx < reelsData.length - 1 ? `<button onclick="SHORTFORM._nav(1)" style="position:absolute;top:50%;left:50%;transform:translate(-50%,0) translateY(2rem);background:rgba(255,255,255,0.15);border:none;border-radius:50%;width:44px;height:44px;cursor:pointer;color:#FFF8F0;font-size:1.2rem;z-index:10;">▼</button>` : ''}
        </div>`;

        // Trim handling
        const video = document.getElementById('reel-video');
        if (reel.trimStart) video.currentTime = reel.trimStart;
        video.ontimeupdate = () => {
            if (reel.trimEnd && video.currentTime >= reel.trimEnd) video.currentTime = reel.trimStart || 0;
        };

        // Increment views
        db.collection(COLLECTION).doc(reel.id).update({ views: firebase.firestore.FieldValue.increment(1) }).catch(()=>{});

        // Prefetch next
        if (idx >= reelsData.length - 3 && !loading) loadReelsFeed(false);
    }

    // Swipe
    let _touchY = 0;
    document.addEventListener('touchstart', e => {
        if (!location.hash.includes('page=reels')) return;
        _touchY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', e => {
        if (!location.hash.includes('page=reels')) return;
        const diff = _touchY - e.changedTouches[0].clientY;
        if (Math.abs(diff) > 60) _nav(diff > 0 ? 1 : -1);
    }, { passive: true });

    function _nav(dir) {
        const next = reelsIndex + dir;
        if (next >= 0 && next < reelsData.length) renderSingleReel(next);
    }

    function _toggleMute() {
        reelsMuted = !reelsMuted;
        const v = document.getElementById('reel-video');
        if (v) v.muted = reelsMuted;
        const btn = document.getElementById('reel-mute-btn');
        if (btn) btn.textContent = reelsMuted ? '🔇' : '🔊';
    }

    async function _toggleLike(id) {
        if (!currentUser) { showToast(t('common.login_required','로그인이 필요합니다'), 'warning'); return; }
        const ref = db.collection(COLLECTION).doc(id);
        const reel = reelsData.find(r => r.id === id);
        if (!reel) return;
        const liked = reel.likedBy && reel.likedBy.includes(currentUser.uid);
        if (liked) {
            await ref.update({ likes: firebase.firestore.FieldValue.increment(-1), likedBy: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) });
            reel.likes = (reel.likes || 1) - 1;
            reel.likedBy = reel.likedBy.filter(u => u !== currentUser.uid);
        } else {
            await ref.update({ likes: firebase.firestore.FieldValue.increment(1), likedBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
            reel.likes = (reel.likes || 0) + 1;
            if (!reel.likedBy) reel.likedBy = [];
            reel.likedBy.push(currentUser.uid);
        }
        renderSingleReel(reelsIndex);
    }

    function _openComments(id) {
        if (!currentUser) { showToast(t('common.login_required','로그인이 필요합니다'), 'warning'); return; }
        
        // Bottom sheet 댓글 패널
        let overlay = document.getElementById('reel-comments-overlay');
        if (overlay) overlay.remove();
        
        overlay = document.createElement('div');
        overlay.id = 'reel-comments-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.5);z-index:99998;display:flex;align-items:flex-end;justify-content:center;';
        overlay.innerHTML = `
            <div id="reel-comments-sheet" style="width:100%;max-width:500px;max-height:70vh;background:var(--dark-card,#F7F3ED);border-radius:16px 16px 0 0;display:flex;flex-direction:column;overflow:hidden;">
                <div style="padding:12px 16px;border-bottom:1px solid var(--dark-border,#2a2a4a);display:flex;align-items:center;justify-content:space-between;">
                    <h4 style="margin:0;font-size:1rem;"><i data-lucide="message-circle" style="width:16px;height:16px;display:inline-block;vertical-align:middle;margin-right:6px;"></i>${t('shortform.comments','댓글')}</h4>
                    <button onclick="document.getElementById('reel-comments-overlay').remove()" style="background:none;border:none;font-size:1.3rem;cursor:pointer;color:var(--text);">✕</button>
                </div>
                <div id="reel-comment-list" style="flex:1;overflow-y:auto;padding:12px 16px;min-height:100px;">
                    <p style="text-align:center;color:var(--accent);font-size:0.85rem;">로딩 중...</p>
                </div>
                <div style="padding:8px 12px;border-top:1px solid var(--dark-border,#2a2a4a);display:flex;gap:8px;">
                    <input type="text" id="reel-comment-input" placeholder="${t('social.add_comment','댓글 달기...')}" style="flex:1;padding:8px 12px;border:1px solid var(--dark-border,#2a2a4a);border-radius:20px;font-size:0.9rem;outline:none;background:var(--dark-bg,#12122a);color:var(--text);">
                    <button onclick="SHORTFORM._submitComment('${id}')" style="background:#0095f6;color:#FFF8F0;border:none;border-radius:20px;padding:8px 16px;font-weight:700;cursor:pointer;font-size:0.85rem;">${t('social.post','게시')}</button>
                </div>
            </div>`;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        
        // Enter키 지원
        document.getElementById('reel-comment-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') SHORTFORM._submitComment(id);
        });
        
        // 댓글 로드
        _loadReelComments(id);
    }

    async function _loadReelComments(videoId) {
        const list = document.getElementById('reel-comment-list');
        if (!list) return;
        try {
            const snap = await db.collection(COLLECTION).doc(videoId)
                .collection('comments').orderBy('createdAt', 'asc').get();
            
            if (snap.empty) {
                list.innerHTML = `<p style="text-align:center;color:var(--accent);font-size:0.85rem;padding:2rem 0;">${t('social.first_comment','첫 댓글을 남겨보세요!')}</p>`;
                return;
            }
            
            let html = '';
            for (const doc of snap.docs) {
                const c = doc.data();
                const timeAgo = _timeAgo(c.createdAt?.toDate?.() || new Date());
                html += `<div style="display:flex;gap:10px;margin-bottom:12px;">
                    <div style="width:32px;height:32px;border-radius:50%;background:var(--dark-border,#2a2a4a);display:flex;align-items:center;justify-content:center;font-size:0.8rem;flex-shrink:0;">${c.photoURL ? `<img src="${c.photoURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : '👤'}</div>
                    <div style="flex:1;">
                        <span style="font-weight:600;font-size:0.85rem;">${_esc(c.nickname || '사용자')}</span>
                        <span style="font-size:0.75rem;color:var(--accent);margin-left:6px;">${timeAgo}</span>
                        <p style="margin:2px 0 0;font-size:0.9rem;line-height:1.4;">${_esc(c.text)}</p>
                    </div>
                </div>`;
            }
            list.innerHTML = html;
            list.scrollTop = list.scrollHeight;
        } catch(e) {
            console.error('Reel comments load error:', e);
            list.innerHTML = '<p style="color:#B54534;text-align:center;">댓글 로드 실패</p>';
        }
    }

    async function _submitComment(videoId) {
        const input = document.getElementById('reel-comment-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        
        input.disabled = true;
        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const userData = userDoc.exists ? userDoc.data() : {};
            
            await db.collection(COLLECTION).doc(videoId).collection('comments').add({
                uid: currentUser.uid,
                nickname: userData.nickname || currentUser.email?.split('@')[0] || '사용자',
                photoURL: userData.photoURL || '',
                text: text,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // 댓글 수 증가
            await db.collection(COLLECTION).doc(videoId).update({
                commentCount: firebase.firestore.FieldValue.increment(1)
            });
            
            input.value = '';
            await _loadReelComments(videoId);
            
            // 릴 데이터 업데이트
            const reel = reelsData.find(r => r.id === videoId);
            if (reel) reel.commentCount = (reel.commentCount || 0) + 1;
            
        } catch(e) {
            console.error('Comment submit error:', e);
            showToast(t('shortform.comment_fail','댓글 등록 실패'), 'error');
        }
        input.disabled = false;
    }

    function _timeAgo(date) {
        const diff = (Date.now() - date.getTime()) / 1000;
        if (diff < 60) return '방금';
        if (diff < 3600) return `${Math.floor(diff/60)}분`;
        if (diff < 86400) return `${Math.floor(diff/3600)}시간`;
        if (diff < 604800) return `${Math.floor(diff/86400)}일`;
        return date.toLocaleDateString('ko');
    }

    function _esc(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    async function _shareReel(id) {
        const url = `${location.origin}${location.pathname}#page=reels&id=${id}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: 'Crowny Reels', text: t('shortform.share_text','크라우니에서 공유된 숏폼 영상'), url });
            } else {
                await navigator.clipboard.writeText(url);
                showToast('<i data-lucide="clipboard" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> ' + t('shortform.link_copied','링크가 복사되었습니다'), 'success');
            }
        } catch(e) {
            try { await navigator.clipboard.writeText(url); showToast('<i data-lucide="clipboard" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> ' + t('shortform.link_copied','링크가 복사되었습니다'), 'success'); } catch(_){}
        }
    }

    function _navigateCTA(type, id) {
        const cta = CTA_MAP[type];
        if (cta) {
            showPage(cta.page);
            // Try to navigate to specific item
            if (typeof navigateServiceLink === 'function') navigateServiceLink(type, id);
            else if (SERVICE_LINK_CONFIG && SERVICE_LINK_CONFIG[type]?.nav) SERVICE_LINK_CONFIG[type].nav(id);
        }
    }

    // ====== DEEP LINK: #page=reels&id={videoId} ======
    function handleReelsDeepLink() {
        const hash = location.hash;
        if (!hash.includes('page=reels')) return;
        const match = hash.match(/id=([^&]+)/);
        if (match) {
            const targetId = match[1];
            // Find in loaded data or load specifically
            const idx = reelsData.findIndex(r => r.id === targetId);
            if (idx >= 0) { renderSingleReel(idx); return; }
            // Load specific video
            db.collection(COLLECTION).doc(targetId).get().then(async doc => {
                if (!doc.exists) return;
                const d = doc.data();
                let authorName = '사용자', authorPhoto = '';
                try { const u = await db.collection('users').doc(d.authorUid).get(); if (u.exists) { authorName = u.data().nickname || '사용자'; authorPhoto = u.data().photoURL || ''; } } catch(_){}
                reelsData.unshift({ id: doc.id, ...d, authorName, authorPhoto });
                reelsIndex = 0;
                renderSingleReel(0);
            });
        }
    }

    // ====== INIT REELS PAGE ======
    function initReelsPage() {
        loadReelsFeed(true);
        handleReelsDeepLink();
    }

    // ====== PUBLIC API ======
    window.SHORTFORM = {
        openUpload: openUploadModal,
        initReels: initReelsPage,
        loadFeed: loadReelsFeed,
        _selectService: _selectService,
        _searchService: _searchService,
        _pickService: _pickService,
        _clearService: _clearService,
        _doUpload: _doUpload,
        _toggleLike: _toggleLike,
        _toggleMute: _toggleMute,
        _openComments: _openComments,
        _submitComment: _submitComment,
        _shareReel: _shareReel,
        _navigateCTA: _navigateCTA,
        _nav: _nav,
        getReelsData: () => reelsData
    };
})();
