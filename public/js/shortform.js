// ===== shortform.js — SHORTS (쇼츠) 영상 시스템 =====
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
        artist:   { label: `<i data-lucide="heart" style="width:14px;height:14px;margin-right:4px;"></i>${t('shortform.cta_donate','후원하기')}`, color: '#B54534', page: 'artist' },
        campaign: { label: `<i data-lucide="heart-handshake" style="width:14px;height:14px;margin-right:4px;"></i>${t('shortform.cta_join','참여하기')}`, color: '#5A9A6E', page: 'fundraise' },
        business: { label: `<i data-lucide="wallet" style="width:14px;height:14px;margin-right:4px;"></i>${t('shortform.cta_invest','투자하기')}`, color: '#3D2B1F', page: 'business' },
        art:      { label: `<i data-lucide="palette" style="width:14px;height:14px;margin-right:4px;"></i>${t('shortform.cta_buy','구매하기')}`, color: '#8B6914', page: 'art' },
        book:     { label: `<i data-lucide="book-open" style="width:14px;height:14px;margin-right:4px;"></i>${t('shortform.cta_read','읽기')}`, color: '#FF9800', page: 'books' },
        product:  { label: `<i data-lucide="shopping-bag" style="width:14px;height:14px;margin-right:4px;"></i>${t('shortform.cta_buy','구매하기')}`, color: '#5B7B8C', page: 'mall' }
    };

    // ====== UPLOAD MODAL ======
    function openUploadModal() {
        if (!window.currentUser) { showToast(t('common.login_required','Login is required'), 'warning'); return; }
        let existing = document.getElementById('shortform-upload-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'shortform-upload-modal';
        modal.className = 'crny-overlay crny-overlay--light';
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
        modal.innerHTML = `
        <div class="crny-modal crny-modal--md">
            <h3><i data-lucide="video"></i>${t('shortform.upload_title','쇼츠 업로드')}</h3>

            <!-- YouTube URL 입력 -->
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.85rem;font-weight:600;display:block;margin-bottom:0.4rem;"><i data-lucide="link" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>YouTube / Shorts URL</label>
                <input type="text" id="sf-youtube-url" class="crny-input" placeholder="${t('shortform.youtube_placeholder', 'https://youtube.com/shorts/... or https://youtu.be/...')}">
                <div id="sf-yt-preview" style="display:none;margin-top:0.5rem;border-radius:8px;overflow:hidden;"></div>
            </div>

            <div style="text-align:center;color:var(--text-muted,#6B5744);font-size:0.8rem;margin-bottom:1rem;">── ${t('shortform.or_upload','or upload a file')} ──</div>

            <!-- file select -->
            <label class="crny-drop-zone" id="sf-drop-zone">
                <input type="file" id="sf-file" accept="video/mp4,video/quicktime,video/webm">
                <div id="sf-file-label"><i data-lucide="upload"></i>${t('shortform.select_video','영상 선택')} (60s, 50MB)</div>
            </label>
            <div id="sf-preview" style="display:none;margin-bottom:1rem;text-align:center;">
                <video id="sf-preview-video" style="max-width:100%;max-height:300px;border-radius:12px;" muted playsinline></video>
            </div>

            <!-- editor -->
            <div id="sf-editor" style="display:none;margin-bottom:1rem;">
                <details style="margin-bottom:0.5rem;">
                    <summary style="cursor:pointer;font-weight:600;"><i data-lucide="scissors" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('shortform.trim','Trim')}</summary>
                    <div style="display:flex;gap:0.5rem;margin-top:0.5rem;align-items:center;">
                        <label style="font-size:0.8rem;">${t('shortform.trim_start','시작')}</label>
                        <input type="range" id="sf-trim-start" min="0" max="60" value="0" step="0.1" style="flex:1;">
                        <span id="sf-trim-start-val" style="font-size:0.8rem;width:35px;">0s</span>
                        <label style="font-size:0.8rem;">${t('shortform.trim_end','끝')}</label>
                        <input type="range" id="sf-trim-end" min="0" max="60" value="60" step="0.1" style="flex:1;">
                        <span id="sf-trim-end-val" style="font-size:0.8rem;width:35px;">60s</span>
                    </div>
                </details>
                <details style="margin-bottom:0.5rem;">
                    <summary style="cursor:pointer;font-weight:600;"><i data-lucide="sliders-horizontal" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('shortform.filters','Filters')}</summary>
                    <div style="margin-top:0.5rem;">
                        <label style="font-size:0.8rem;">${t('shortform.filter_brightness','밝기')}</label><input type="range" id="sf-brightness" min="50" max="150" value="100" style="width:100%;"><br>
                        <label style="font-size:0.8rem;">${t('shortform.filter_contrast','대비')}</label><input type="range" id="sf-contrast" min="50" max="150" value="100" style="width:100%;"><br>
                        <label style="font-size:0.8rem;">${t('shortform.filter_saturation','채도')}</label><input type="range" id="sf-saturate" min="0" max="200" value="100" style="width:100%;"><br>
                        <label style="font-size:0.8rem;">${t('shortform.filter_sepia','세피아')}</label><input type="range" id="sf-sepia" min="0" max="100" value="0" style="width:100%;"><br>
                        <label style="font-size:0.8rem;">${t('shortform.filter_grayscale','흑백')}</label><input type="range" id="sf-grayscale" min="0" max="100" value="0" style="width:100%;">
                    </div>
                </details>
                <details style="margin-bottom:0.5rem;">
                    <summary style="cursor:pointer;font-weight:600;"><i data-lucide="type" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('shortform.text_overlay','Text Overlay')}</summary>
                    <div style="margin-top:0.5rem;">
                        <input type="text" id="sf-text" placeholder="${t('shortform.enter_text','Caption text')}" style="width:100%;padding:0.5rem;border:1px solid var(--border,#E8E0D8);border-radius:8px;margin-bottom:0.5rem;">
                        <div style="display:flex;gap:0.5rem;">
                            <select id="sf-text-pos" style="padding:0.4rem;border:1px solid var(--border);border-radius:6px;">
                                <option value="top">${t('shortform.pos_top','상단')}</option><option value="center">${t('shortform.pos_center','중앙')}</option><option value="bottom" selected>${t('shortform.pos_bottom','하단')}</option>
                            </select>
                            <input type="color" id="sf-text-color" value="#FFF8F0" style="width:40px;height:32px;border:none;cursor:pointer;">
                            <input type="range" id="sf-text-size" min="12" max="48" value="24" style="flex:1;">
                        </div>
                    </div>
                </details>
            </div>

            <!-- caption & hashtags -->
            <textarea id="sf-caption" class="crny-textarea" placeholder="${t('shortform.caption_placeholder','캡션 입력 #해시태그')}" rows="2" style="margin-bottom:0.5rem;"></textarea>

            <!-- service link -->
            <div style="margin-bottom:0.8rem;">
                <label style="font-size:0.85rem;font-weight:600;display:block;margin-bottom:0.3rem;"><i data-lucide="link" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>${t('shortform.service_link','Service Link Tag')}</label>
                <div style="display:flex;gap:0.4rem;flex-wrap:wrap;" id="sf-service-btns">
                    ${Object.entries(CTA_MAP).map(([k,v]) => `<button type="button" class="sf-svc-btn" data-type="${k}" onclick="SHORTFORM._selectService('${k}')" style="padding:0.3rem 0.6rem;border:1px solid ${v.color};border-radius:16px;background:transparent;color:${v.color};font-size:0.75rem;cursor:pointer;">${v.label}</button>`).join('')}
                </div>
                <div id="sf-service-search" style="display:none;margin-top:0.5rem;">
                    <div style="display:flex;gap:0.4rem;">
                        <input type="text" id="sf-svc-query" placeholder="${t('shortform.search_item','Search items...')}" style="flex:1;padding:0.4rem;border:1px solid var(--border);border-radius:8px;font-size:0.85rem;">
                        <button onclick="SHORTFORM._searchService()" style="padding:0.4rem 0.8rem;border:none;border-radius:8px;background:var(--accent,#8B6914);color:#FFF8F0;cursor:pointer;font-size:0.85rem;">${t('shortform.search_btn','검색')}</button>
                    </div>
                    <div id="sf-svc-results" style="max-height:150px;overflow-y:auto;margin-top:0.3rem;"></div>
                </div>
                <div id="sf-svc-selected" style="display:none;margin-top:0.3rem;padding:0.4rem 0.6rem;background:var(--bg,#F7F3ED);border-radius:8px;font-size:0.85rem;"></div>
            </div>

            <!-- progress -->
            <div id="sf-progress" class="crny-progress" style="display:none;">
                <div class="crny-progress-track">
                    <div id="sf-progress-bar" class="crny-progress-bar"></div>
                </div>
                <div id="sf-progress-text" class="crny-progress-text">0%</div>
            </div>

            <!-- actions -->
            <div class="crny-btn-row" style="justify-content:flex-end;">
                <button class="crny-btn crny-btn--ghost" onclick="document.getElementById('shortform-upload-modal').remove()">${t('common.cancel','취소')}</button>
                <button class="crny-btn crny-btn--primary" id="sf-submit-btn" onclick="SHORTFORM._doUpload()" disabled>${t('shortform.upload','업로드')}</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons({ nodes: [modal] });

        // YouTube URL 입력 시 프리뷰 + 제출 활성화
        const ytInput = modal.querySelector('#sf-youtube-url');
        if (ytInput) {
            ytInput.addEventListener('input', () => {
                const url = ytInput.value.trim();
                const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                const preview = document.getElementById('sf-yt-preview');
                const submitBtn = document.getElementById('sf-submit-btn');
                if (ytMatch) {
                    preview.style.display = 'block';
                    preview.innerHTML = `<img src="https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg" style="width:100%;border-radius:8px;">`;
                    submitBtn.disabled = false;
                } else {
                    preview.style.display = 'none';
                    preview.innerHTML = '';
                    if (!_selectedFile) submitBtn.disabled = true;
                }
            });
        }

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
        if (file.size > MAX_SIZE) { showToast(t('shortform.size_limit','File must be 50MB or less'), 'warning'); return; }
        if (!['video/mp4','video/quicktime','video/webm'].includes(file.type)) {
            showToast(t('shortform.format_error','Only MP4/MOV/WebM supported'), 'warning'); return;
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
                showToast(t('shortform.duration_limit','Must be 60 seconds or less'), 'warning');
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
        results.innerHTML = '<p style="text-align:center;font-size:0.8rem;color:var(--text-muted,#6B5744);">' + t('shortform.loading','로딩...') + '</p>';
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
            results.innerHTML = html || '<p style="text-align:center;font-size:0.8rem;color:var(--text-muted,#6B5744);">' + t('shortform.no_results','결과 없음') + '</p>';
        } catch(e) { results.innerHTML = '<p style="color:red;font-size:0.8rem;">' + t('shortform.search_failed','검색 실패') + '</p>'; }
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
        // YouTube URL 모드: 소셜 포스트로 등록
        const ytUrlInput = document.getElementById('sf-youtube-url');
        const ytUrl = ytUrlInput ? ytUrlInput.value.trim() : '';
        if (ytUrl) {
            const caption = document.getElementById('sf-caption')?.value.trim() || '';
            const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token') || '';
            try {
                document.getElementById('sf-submit-btn').disabled = true;
                const res = await fetch('/api/social/post', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ text: caption, youtubeUrl: ytUrl })
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                showToast(t('shortform.uploaded', 'Upload complete!'), 'success');
                document.getElementById('shortform-upload-modal')?.remove();
                loadReelsFeed(true);
            } catch (e) {
                showToast(t('shortform.upload_fail', 'Upload failed') + ': ' + e.message, 'error');
                document.getElementById('sf-submit-btn').disabled = false;
            }
            return;
        }
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
            showToast(t('shortform.upload_success','<i data-lucide="video" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Short video uploaded!'), 'success');
            document.getElementById('shortform-upload-modal').remove();
            _selectedFile = null;
            _serviceLink = null;

            // Refresh feed if on reels page
            if (location.hash.includes('page=reels')) loadReelsFeed(true);
        } catch (e) {
            console.error('Shortform upload error:', e);
            let errMsg = e.message;
            if (e.code === 'storage/unauthorized') errMsg = t('shortform.err_auth','Login is required');
            else if (e.code === 'storage/canceled') errMsg = t('shortform.err_canceled','Upload was cancelled');
            else if (e.code === 'storage/unknown') errMsg = t('shortform.err_network','Network error. Please try again');
            showToast(t('shortform.upload_fail','Upload failed: ') + errMsg, 'error');
            document.getElementById('sf-submit-btn').disabled = false;
            document.getElementById('sf-progress').style.display = 'none';
        }
    }

    // ====== SHORTS FEED ======
    async function loadReelsFeed(reset) {
        if (loading) return;
        if (typeof useIndependentDB !== 'undefined' && useIndependentDB) {
            // CrownyTVM 독립 쇼츠: 소셜 피드에서 YouTube Shorts 추출
            await loadIndependentReels(reset);
            return;
        }
        if (reset) { reelsData = []; lastDoc = null; reelsIndex = 0; }
        loading = true;
        try {
            let q = db.collection(COLLECTION).orderBy('createdAt','desc').limit(PAGE_SIZE);
            if (lastDoc) q = q.startAfter(lastDoc);
            const snap = await q.get();
            if (snap.empty && reelsData.length === 0) {
                document.getElementById('reels-container').innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:80vh;color:var(--text-muted,#6B5744);"><div style="font-size:3rem;margin-bottom:1rem;"><i data-lucide="video" style="width:48px;height:48px;display:block;"></i></div><p>${t('shortform.no_videos','No videos yet')}</p><button onclick="SHORTFORM.openUpload()" style="margin-top:1rem;padding:0.6rem 1.2rem;border:none;border-radius:8px;background:#3D2B1F;color:#FFF8F0;cursor:pointer;font-weight:600;">${t('shortform.first_upload','Upload your first video')}</button></div>`;
                loading = false; return;
            }
            const newItems = [];
            for (const doc of snap.docs) {
                const d = doc.data();
                // Fetch author info
                let authorName = t('shortform.default_user','사용자');
                let authorPhoto = '';
                try {
                    const uSnap = await db.collection('users').doc(d.authorUid).get();
                    if (uSnap.exists) { authorName = uSnap.data().nickname || uSnap.data().displayName || t('shortform.default_user','사용자'); authorPhoto = uSnap.data().photoURL || ''; }
                } catch(_){ console.warn(_.message); }
                newItems.push({ id: doc.id, ...d, authorName, authorPhoto });
                lastDoc = doc;
            }
            reelsData.push(...newItems);
            renderReels();
        } catch(e) {
            console.error('Load reels error:', e);
            const isPermission = (e.message || '').includes('permission') || (e.message || '').includes('Permission') || (typeof useIndependentDB !== 'undefined' && useIndependentDB);
            if (isPermission && reelsData.length === 0) {
                const c = document.getElementById('reels-container');
                if (c) c.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:80vh;color:#6B5744;"><div style="font-size:3rem;margin-bottom:1rem;"><i data-lucide="video" style="width:48px;height:48px;display:block;"></i></div><p style="font-size:1.1rem;font-weight:600;color:#3D2B1F">${t('shortform.preparing','쇼츠 영상 준비 중')}</p><p style="font-size:0.85rem;color:#7A5C47;margin-top:8px">${t('shortform.coming_soon','CrownyTVM 독립 영상 기능이 곧 추가됩니다.')}</p></div>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }
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
                    video.play().catch(e=>console.warn(e.message));
                    video.muted = reelsMuted;
                    // Increment views
                    const idx = parseInt(entry.target.dataset.index);
                    if (reelsData[idx]) {
                        reelsIndex = idx;
                        db.collection(COLLECTION).doc(reelsData[idx].id).update({ views: firebase.firestore.FieldValue.increment(1) }).catch(e=>console.warn(e.message));
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
            ctaHTML = `<button onclick="SHORTFORM._navigateCTA('${sl.type}','${sl.id}')" style="position:absolute;bottom:90px;left:50%;transform:translateX(-50%);padding:0.7rem 1.5rem;border:none;border-radius:24px;background:${cta.color||'#3D2B1F'};color:#FFF8F0;font-weight:700;font-size:0.95rem;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.3);z-index:10;white-space:nowrap;">${cta.label || t('shortform.cta_view','View')}</button>`;
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
        db.collection(COLLECTION).doc(reel.id).update({ views: firebase.firestore.FieldValue.increment(1) }).catch(e=>console.warn(e.message));

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
        if (!currentUser) { showToast(t('common.login_required','Login is required'), 'warning'); return; }
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
        if (!currentUser) { showToast(t('common.login_required','Login is required'), 'warning'); return; }
        
        // Bottom sheet 댓글 패널
        let overlay = document.getElementById('reel-comments-overlay');
        if (overlay) overlay.remove();
        
        overlay = document.createElement('div');
        overlay.id = 'reel-comments-overlay';
        overlay.className = 'crny-overlay crny-overlay--light';
        overlay.style.alignItems = 'flex-end';
        overlay.innerHTML = `
            <div class="crny-comment-sheet">
                <div class="crny-comment-header">
                    <h4><i data-lucide="message-circle"></i>${t('shortform.comments','댓글')}</h4>
                    <button onclick="document.getElementById('reel-comments-overlay').remove()">✕</button>
                </div>
                <div id="reel-comment-list" class="crny-comment-list">
                    <p style="text-align:center;color:var(--accent);font-size:0.85rem;">${t('shortform.loading','로딩...')}</p>
                </div>
                <div class="crny-comment-footer">
                    <input type="text" id="reel-comment-input" placeholder="${t('social.add_comment','댓글 달기...')}">
                    <button onclick="SHORTFORM._submitComment('${id}')">${t('social.post','게시')}</button>
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
                list.innerHTML = `<p style="text-align:center;color:var(--accent);font-size:0.85rem;padding:2rem 0;">${t('social.first_comment','Be the first to comment!')}</p>`;
                return;
            }
            
            let html = '';
            for (const doc of snap.docs) {
                const c = doc.data();
                const timeAgo = _timeAgo(c.createdAt?.toDate?.() || new Date());
                html += `<div class="crny-comment-item">
                    <div class="avatar">${c.photoURL ? `<img src="${c.photoURL}">` : '👤'}</div>
                    <div style="flex:1;">
                        <span class="author">${_esc(c.nickname || t('shortform.default_user','사용자'))}</span>
                        <span class="time">${timeAgo}</span>
                        <p class="text">${_esc(c.text)}</p>
                    </div>
                </div>`;
            }
            list.innerHTML = html;
            list.scrollTop = list.scrollHeight;
        } catch(e) {
            console.error('Reel comments load error:', e);
            list.innerHTML = '<p style="color:#B54534;text-align:center;">' + t('shortform.comment_load_failed','댓글 로드 실패') + '</p>';
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
                nickname: userData.nickname || currentUser.email?.split('@')[0] || t('shortform.default_user','사용자'),
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
            showToast(t('shortform.comment_fail','Failed to post comment'), 'error');
        }
        input.disabled = false;
    }

    function _timeAgo(date) {
        const diff = (Date.now() - date.getTime()) / 1000;
        if (diff < 60) return t('common.just_now','방금');
        if (diff < 3600) return `${Math.floor(diff/60)}${t('common.minutes_ago','분')}`;
        if (diff < 86400) return `${Math.floor(diff/3600)}${t('common.hours_ago','시간')}`;
        if (diff < 604800) return `${Math.floor(diff/86400)}${t('common.days_ago','일')}`;
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
                await navigator.share({ title: 'Crowny Reels', text: t('shortform.share_text','A short video shared on Crowny'), url });
            } else {
                await navigator.clipboard.writeText(url);
                showToast('<i data-lucide="clipboard" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> ' + t('shortform.link_copied','Link copied'), 'success');
            }
        } catch(e) {
            try { await navigator.clipboard.writeText(url); showToast('<i data-lucide="clipboard" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> ' + t('shortform.link_copied','Link copied'), 'success'); } catch(_){ console.warn(_.message); }
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
                let authorName = t('shortform.default_user','사용자'), authorPhoto = '';
                try { const u = await db.collection('users').doc(d.authorUid).get(); if (u.exists) { authorName = u.data().nickname || t('shortform.default_user','사용자'); authorPhoto = u.data().photoURL || ''; } } catch(_){ console.warn(_.message); }
                reelsData.unshift({ id: doc.id, ...d, authorName, authorPhoto });
                reelsIndex = 0;
                renderSingleReel(0);
            });
        }
    }

    // ====== 독립 쇼츠 (YouTube Shorts 기반) ======
    async function loadIndependentReels(reset) {
        if (reset) { reelsData = []; reelsIndex = 0; }
        loading = true;
        const c = document.getElementById('reels-container');
        if (!c) { loading = false; return; }

        try {
            const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token') || '';
            const res = await fetch('/api/social/feed?limit=50', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const data = await res.json();
            const ytPosts = (data.posts || []).filter(p => p.youtube && p.youtube.id);

            if (ytPosts.length === 0) {
                c.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:80vh;color:#6B5744;">
                    <p style="margin-bottom:1rem;"><i data-lucide="clapperboard" style="width:48px;height:48px;"></i></p>
                    <p style="font-size:1.1rem;font-weight:600;color:#3D2B1F;">${t('shortform.no_videos','No videos yet')}</p>
                    <p style="font-size:0.85rem;color:#7A5C47;margin-top:8px;">${t('shortform.shorts_hint','YouTube/Shorts 링크가 포함된 튜브를 작성하면 쇼츠에 자동으로 표시됩니다.')}</p>
                    <button onclick="navigateTo('social')" style="margin-top:1rem;padding:0.6rem 1.2rem;border:none;border-radius:8px;background:#3D2B1F;color:#FFF8F0;cursor:pointer;font-weight:600;">${t('shortform.post_from_tube','튜브에서 게시하기')}</button>
                </div>`;
                loading = false;
                return;
            }

            // 쇼츠 데이터 구성
            reelsData = ytPosts.map((p, i) => ({
                id: p.id,
                videoUrl: null,
                youtubeId: p.youtube.id,
                isShort: p.youtube.type === 'short',
                caption: p.text || '',
                authorName: p.authorName || p.author,
                author: p.author,
                likes: (p.likes || []).length,
                commentCount: p.commentCount || 0,
                ts: p.ts,
            }));

            renderIndependentReels(c);
        } catch (e) {
            c.innerHTML = `<div style="padding:2rem;text-align:center;color:#c0392b;">${e.message}</div>`;
        }
        loading = false;
    }

    function renderIndependentReels(container) {
        container.className = 'reels-fullscreen';
        container.style.cssText = 'scroll-snap-type:y mandatory;overflow-y:scroll;height:100vh;';
        container.innerHTML = '';

        reelsData.forEach((reel, idx) => {
            const item = document.createElement('div');
            item.className = 'reel-item';
            item.style.cssText = 'scroll-snap-align:start;height:100vh;position:relative;background:#000;display:flex;align-items:center;justify-content:center;';
            item.innerHTML = `
                <iframe src="https://www.youtube.com/embed/${reel.youtubeId}?autoplay=${idx === 0 ? 1 : 0}&mute=1&loop=1&playlist=${reel.youtubeId}&controls=1&playsinline=1"
                    style="width:100%;height:100%;border:0;max-width:500px;"
                    allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe>
                <div style="position:absolute;bottom:80px;left:12px;right:60px;color:#FFF8F0;text-shadow:0 1px 3px rgba(0,0,0,0.8);">
                    <div style="font-weight:700;font-size:0.9rem;margin-bottom:4px;">@${reel.author}</div>
                    <div style="font-size:0.82rem;line-height:1.4;max-height:3.6rem;overflow:hidden;">${escapeReelHtml(reel.caption)}</div>
                </div>
                <div style="position:absolute;right:8px;bottom:100px;display:flex;flex-direction:column;align-items:center;gap:16px;">
                    <div style="text-align:center;color:#FFF8F0;">
                        <i data-lucide="heart" style="width:24px;height:24px;"></i>
                        <div style="font-size:0.7rem;">${reel.likes}</div>
                    </div>
                    <div style="text-align:center;color:#FFF8F0;">
                        <i data-lucide="message-circle" style="width:24px;height:24px;"></i>
                        <div style="font-size:0.7rem;">${reel.commentCount}</div>
                    </div>
                    <div onclick="navigator.share?.({url:'https://youtube.com/watch?v=${reel.youtubeId}'})" style="text-align:center;color:#FFF8F0;cursor:pointer;">
                        <i data-lucide="share-2" style="width:24px;height:24px;"></i>
                    </div>
                </div>`;
            container.appendChild(item);
        });

        // Intersection observer for autoplay
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const iframe = entry.target.querySelector('iframe');
                if (!iframe) return;
                const src = iframe.src;
                if (entry.isIntersecting) {
                    if (!src.includes('autoplay=1')) iframe.src = src.replace('autoplay=0', 'autoplay=1');
                } else {
                    if (src.includes('autoplay=1')) iframe.src = src.replace('autoplay=1', 'autoplay=0');
                }
            });
        }, { threshold: 0.7 });
        container.querySelectorAll('.reel-item').forEach(item => observer.observe(item));
        if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [container] });
    }

    function escapeReelHtml(str) {
        if (!str) return '';
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/#(\S+)/g, '<span style="color:#B8860B;">#$1</span>');
    }

    // ====== INIT SHORTS PAGE ======
    function initReelsPage() {
        loadReelsFeed(true);
        handleReelsDeepLink();
    }

    // ====== PUBLIC API ======
    const api = {
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
    window.REELS = api;
    window.SHORTFORM = api; // 하위 호환
})();
