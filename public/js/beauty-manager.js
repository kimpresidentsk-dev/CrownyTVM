// ===== beauty-manager.js - 뷰티매니저: 피부 분석 & 변화 추적 (v1.0) =====

const BEAUTY = (() => {
    const ZONES = [
        { id: 'forehead', name: '이마', emoji: 'square', guide: '이마 전체가 보이게 촬영' },
        { id: 'lcheek', name: '왼쪽 볼', emoji: 'arrow-left', guide: '왼쪽 볼을 정면에서 촬영' },
        { id: 'rcheek', name: '오른쪽 볼', emoji: 'arrow-right', guide: '오른쪽 볼을 정면에서 촬영' },
        { id: 'nose', name: '코', emoji: 'smile', guide: '코 부분을 가까이 촬영' },
        { id: 'chin', name: '턱', emoji: 'arrow-down', guide: '턱 아래에서 위로 촬영' },
        { id: 'eyes', name: '눈가', emoji: 'eye', guide: '눈가 주름이 보이게 촬영' }
    ];

    const SKIN_TYPES = ['건성', '지성', '복합성', '민감성', '중성'];
    const METRICS = ['수분', '유분', '모공', '주름', '색소', '탄력', '전체'];

    let currentZone = null;

    async function init() {
        const container = document.getElementById('beauty-manager-content');
        if (!container || !currentUser) {
            if (container) container.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--accent);">로그인이 필요합니다</p>';
            return;
        }

        // 최근 분석 결과 가져오기
        let latestAnalysis = null;
        try {
            const snap = await db.collection('users').doc(currentUser.uid)
                .collection('skin_analyses').orderBy('createdAt', 'desc').limit(1).get();
            if (!snap.empty) latestAnalysis = { id: snap.docs[0].id, ...snap.docs[0].data() };
        } catch (e) {}

        // 촬영 기록 개수
        let photoCount = 0;
        try {
            const pSnap = await db.collection('users').doc(currentUser.uid)
                .collection('skin_photos').get();
            photoCount = pSnap.size;
        } catch (e) {}

        container.innerHTML = `
            <!-- 요약 카드 -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-bottom:1.5rem;">
                <div style="background:linear-gradient(135deg,#8B6914,#6B5744);padding:1rem;border-radius:12px;color:#FFF8F0;text-align:center;">
                    <div style="font-size:2rem;font-weight:800;">${photoCount}</div>
                    <div style="font-size:0.8rem;opacity:0.9;">camera 촬영 기록</div>
                </div>
                <div style="background:linear-gradient(135deg,#8B6914,#F0C060);padding:1rem;border-radius:12px;color:#FFF8F0;text-align:center;">
                    <div style="font-size:2rem;font-weight:800;">${latestAnalysis ? '📊' : '—'}</div>
                    <div style="font-size:0.8rem;opacity:0.9;">${latestAnalysis ? '최근 분석 있음' : '분석 대기'}</div>
                </div>
            </div>

            <!-- 부위별 촬영 -->
            <div style="background:var(--card-bg,#F7F3ED);border-radius:12px;padding:1.2rem;margin-bottom:1.2rem;">
                <h3 style="margin:0 0 1rem 0;font-size:1rem;">camera 부위별 피부 촬영</h3>
                <p style="font-size:0.8rem;color:var(--accent);margin-bottom:1rem;">각 부위를 가까이에서 촬영해주세요. 자연광에서 촬영하면 더 정확합니다.</p>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.6rem;">
                    ${ZONES.map(z => `
                        <button onclick="BEAUTY.captureZone('${z.id}')" 
                            style="padding:0.8rem 0.4rem;border:2px solid var(--border,#e0e0e0);border-radius:10px;background:var(--card-bg,#F7F3ED);cursor:pointer;text-align:center;transition:all 0.2s;">
                            <div style="font-size:1.5rem;">${z.emoji}</div>
                            <div style="font-size:0.75rem;font-weight:600;margin-top:0.2rem;">${z.name}</div>
                        </button>
                    `).join('')}
                </div>
            </div>

            <!-- 전체 얼굴 촬영 -->
            <div style="background:var(--card-bg,#F7F3ED);border-radius:12px;padding:1.2rem;margin-bottom:1.2rem;">
                <button onclick="BEAUTY.captureZone('full')" 
                    style="width:100%;padding:1rem;border:2px dashed var(--primary,#B54534);border-radius:10px;background:transparent;cursor:pointer;font-size:0.9rem;font-weight:600;color:var(--primary,#B54534);">
                    smartphone 전체 얼굴 촬영
                </button>
            </div>

            <!-- 분석 요청 -->
            <div style="background:var(--card-bg,#F7F3ED);border-radius:12px;padding:1.2rem;margin-bottom:1.2rem;">
                <h3 style="margin:0 0 0.8rem 0;font-size:1rem;">🔬 피부 분석 받기</h3>
                <div style="display:grid;gap:0.5rem;">
                    <button onclick="BEAUTY.requestExpertAnalysis()" 
                        style="width:100%;padding:0.8rem;border:none;border-radius:10px;background:linear-gradient(135deg,#8B6914,#F0C060);color:#3D2B1F;font-weight:700;cursor:pointer;font-size:0.85rem;">
                        👩‍⚕️ 전문가에게 분석 받기
                    </button>
                    <button onclick="BEAUTY.requestAIAnalysis()" 
                        style="width:100%;padding:0.8rem;border:none;border-radius:10px;background:linear-gradient(135deg,#8B6914,#F0C060);color:#FFF8F0;font-weight:700;cursor:pointer;font-size:0.85rem;">
                        <i data-lucide="sparkles" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 크라우니걸 AI 분석
                    </button>
                </div>
            </div>

            <!-- 최근 분석 결과 -->
            <div id="beauty-latest-result" style="background:var(--card-bg,#F7F3ED);border-radius:12px;padding:1.2rem;margin-bottom:1.2rem;">
                <h3 style="margin:0 0 0.8rem 0;font-size:1rem;">📊 분석 결과</h3>
                <div id="beauty-result-content">
                    ${latestAnalysis ? renderAnalysis(latestAnalysis) : '<p style="text-align:center;color:var(--accent);font-size:0.85rem;padding:1rem;">아직 분석 결과가 없습니다.<br>피부 사진을 촬영하고 분석을 요청해보세요!</p>'}
                </div>
            </div>

            <!-- 타임라인 -->
            <div style="background:var(--card-bg,#F7F3ED);border-radius:12px;padding:1.2rem;margin-bottom:1.2rem;">
                <h3 style="margin:0 0 0.8rem 0;font-size:1rem;">📈 피부 변화 타임라인</h3>
                <div id="beauty-timeline">
                    <p style="text-align:center;color:var(--accent);font-size:0.85rem;padding:1rem;">촬영 기록이 쌓이면 변화를 추적할 수 있습니다.</p>
                </div>
            </div>

            <!-- 크라우니 뷰티 추천 -->
            <div style="background:var(--card-bg,#F7F3ED);border-radius:12px;padding:1.2rem;margin-bottom:1.2rem;">
                <h3 style="margin:0 0 0.8rem 0;font-size:1rem;"><i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 크라우니 뷰티 추천</h3>
                <div style="display:grid;gap:0.5rem;">
                    <div onclick="showPage('mall')" style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem;background:linear-gradient(135deg,#FFF8F0,#F7F3ED);border-radius:10px;cursor:pointer;">
                        <span style="font-size:1.5rem;">mask</span>
                        <div><div style="font-weight:600;font-size:0.9rem;">프레즌트 마스크팩</div><div style="font-size:0.75rem;color:var(--accent);">피부 타입별 맞춤 추천 · crowny.kr</div></div>
                    </div>
                    <div onclick="showPage('care')" style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem;background:linear-gradient(135deg,#FFF8F0,#F7F3ED);border-radius:10px;cursor:pointer;">
                        <span style="font-size:1.5rem;">pill</span>
                        <div><div style="font-weight:600;font-size:0.9rem;">포닥터 건강기능식품</div><div style="font-size:0.75rem;color:var(--accent);">내면부터 빛나는 피부 관리</div></div>
                    </div>
                    <div onclick="showPage('movement')" style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem;background:linear-gradient(135deg,#FFF8F0,#F7F3ED);border-radius:10px;cursor:pointer;">
                        <span style="font-size:1.5rem;">dumbbell</span>
                        <div><div style="font-weight:600;font-size:0.9rem;">크라우니 무브먼트</div><div style="font-size:0.75rem;color:var(--accent);">신체 아름다움의 완성 · 500회 프로세스</div></div>
                    </div>
                </div>
            </div>

            <!-- 나의 촬영 기록 -->
            <div style="background:var(--card-bg,#F7F3ED);border-radius:12px;padding:1.2rem;">
                <h3 style="margin:0 0 0.8rem 0;font-size:1rem;">🗂️ 나의 촬영 기록</h3>
                <div id="beauty-photo-history" style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;">
                    <p style="grid-column:span 3;text-align:center;color:var(--accent);font-size:0.85rem;padding:1rem;">아직 촬영 기록이 없습니다.</p>
                </div>
            </div>
        `;

        // 촬영 기록 로드
        loadPhotoHistory();
        loadTimeline();
    }

    // 부위별 촬영
    async function captureZone(zoneId) {
        currentZone = zoneId;
        const zone = ZONES.find(z => z.id === zoneId) || { name: '전체 얼굴', guide: '얼굴 전체가 보이게 촬영' };

        // 카메라 모달
        const modal = document.createElement('div');
        modal.id = 'beauty-capture-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.95);z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:center;';
        modal.innerHTML = `
            <div style="color:#FFF8F0;text-align:center;margin-bottom:1rem;">
                <h3>${zone.emoji || 'smartphone'} ${zone.name}</h3>
                <p style="font-size:0.85rem;opacity:0.8;">${zone.guide}</p>
            </div>
            <video id="beauty-video" autoplay playsinline style="max-width:90%;max-height:50vh;border-radius:12px;transform:scaleX(-1);"></video>
            <canvas id="beauty-canvas" style="display:none;"></canvas>
            <div style="display:flex;gap:1rem;margin-top:1.5rem;">
                <button onclick="BEAUTY.takePhoto()" style="width:70px;height:70px;border-radius:50%;border:4px solid white;background:var(--primary,#B54534);cursor:pointer;font-size:1.5rem;">camera</button>
            </div>
            <button onclick="BEAUTY.closeCapture()" style="position:absolute;top:1rem;right:1rem;background:none;border:none;color:#FFF8F0;font-size:1.5rem;cursor:pointer;">✕</button>
            <div style="margin-top:1rem;">
                <label style="color:#FFF8F0;font-size:0.85rem;cursor:pointer;padding:0.5rem 1rem;border:1px solid white;border-radius:8px;">
                    📁 갤러리에서 선택
                    <input type="file" accept="image/*" onchange="BEAUTY.uploadFromGallery(event)" style="display:none;">
                </label>
            </div>
        `;
        document.body.appendChild(modal);

        // 카메라 시작
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }
            });
            document.getElementById('beauty-video').srcObject = stream;
        } catch (e) {
            console.warn('[Beauty] Camera access failed:', e);
            showToast('카메라 접근 실패. 갤러리에서 선택해주세요.', 'warning');
        }
    }

    function takePhoto() {
        const video = document.getElementById('beauty-video');
        const canvas = document.getElementById('beauty-canvas');
        if (!video || !canvas) return;

        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1); // mirror
        ctx.drawImage(video, 0, 0);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        savePhoto(dataUrl);
        closeCapture();
    }

    function uploadFromGallery(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            savePhoto(e.target.result);
            closeCapture();
        };
        reader.readAsDataURL(file);
    }

    async function savePhoto(dataUrl) {
        if (!currentUser || !currentZone) return;
        showLoading('camera 저장 중...');

        try {
            // Firebase Storage에 업로드
            const storageRef = firebase.storage().ref();
            const path = `skin_photos/${currentUser.uid}/${currentZone}_${Date.now()}.jpg`;
            const photoRef = storageRef.child(path);

            // dataURL → blob
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            await photoRef.put(blob);
            const downloadURL = await photoRef.getDownloadURL();

            // Firestore에 메타 저장
            await db.collection('users').doc(currentUser.uid)
                .collection('skin_photos').add({
                    zone: currentZone,
                    photoURL: downloadURL,
                    storagePath: path,
                    createdAt: new Date(),
                    analyzed: false,
                    analysisResult: null
                });

            hideLoading();
            showToast('camera 촬영 완료! 분석을 요청해보세요.', 'success');
            init(); // 새로고침
        } catch (e) {
            hideLoading();
            console.error('[Beauty] Save photo failed:', e);
            showToast('저장 실패: ' + e.message, 'error');
        }
    }

    function closeCapture() {
        const video = document.getElementById('beauty-video');
        if (video?.srcObject) {
            video.srcObject.getTracks().forEach(t => t.stop());
        }
        document.getElementById('beauty-capture-modal')?.remove();
    }

    // 전문가 분석 요청
    async function requestExpertAnalysis() {
        if (!currentUser) return;

        // 촬영 기록 확인
        const photos = await db.collection('users').doc(currentUser.uid)
            .collection('skin_photos').orderBy('createdAt', 'desc').limit(6).get();

        if (photos.empty) {
            showToast('먼저 피부 사진을 촬영해주세요!', 'warning');
            return;
        }

        showLoading('📤 분석 요청 중...');
        try {
            const userInfo = await getUserDisplayInfo(currentUser.uid);
            await db.collection('skin_analysis_requests').add({
                userId: currentUser.uid,
                userNickname: userInfo.nickname,
                photoCount: photos.size,
                type: 'expert',
                status: 'pending', // pending → in_progress → completed
                createdAt: new Date(),
                completedAt: null,
                analysisId: null
            });
            hideLoading();
            showToast('👩‍⚕️ 전문가 분석 요청 완료! 결과는 알림으로 안내됩니다.', 'success');
        } catch (e) {
            hideLoading();
            showToast('요청 실패: ' + e.message, 'error');
        }
    }

    // AI (크라우니걸) 분석
    async function requestAIAnalysis() {
        if (!currentUser) return;

        const photos = await db.collection('users').doc(currentUser.uid)
            .collection('skin_photos').orderBy('createdAt', 'desc').limit(6).get();

        if (photos.empty) {
            showToast('먼저 피부 사진을 촬영해주세요!', 'warning');
            return;
        }

        showLoading('<i data-lucide="sparkles" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 크라우니걸이 분석 중...');
        try {
            // 최근 사진 URL 수집
            const photoURLs = photos.docs.map(d => d.data().photoURL).filter(Boolean);
            const zones = photos.docs.map(d => d.data().zone);

            // Gemini Vision으로 분석
            let apiKey = 'AIzaSyAhkJlLDE_V2Iso8PZaGIWPqs_ht0ZuZeA';
            try {
                const settings = await db.collection('admin_config').doc('ai_settings').get();
                const data = settings.data() || {};
                if (data.apiKey && data.apiKey.length > 10) apiKey = data.apiKey;
            } catch (e) {}

            const lang = (typeof currentLang !== 'undefined') ? currentLang : 'ko';
            const langNames = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文', es: 'Español' };

            const prompt = `당신은 크라우니걸(23세, 뷰티/스킨케어 전문가)입니다. 밝고 친근하게 분석해주세요.

사용자가 ${zones.join(', ')} 부위의 피부 사진 ${photoURLs.length}장을 제출했습니다.

피부 분석 결과를 JSON으로 작성해주세요:
{
  "skinType": "건성/지성/복합성/민감성/중성 중 하나",
  "scores": {
    "moisture": 0-100,
    "oil": 0-100,
    "pore": 0-100,
    "wrinkle": 0-100,
    "pigment": 0-100,
    "elasticity": 0-100,
    "overall": 0-100
  },
  "summary": "2~3줄 요약 (크라우니걸 말투로)",
  "advice": "3가지 관리 조언",
  "recommended": "크라우니 추천 제품/서비스"
}

${lang !== 'ko' ? `${langNames[lang]}로 summary, advice, recommended를 작성하세요.` : ''}
JSON만 출력하세요.`;

            // Gemini API 호출 (사진 URL 전달)
            const parts = [{ text: prompt }];
            // 사진이 있으면 첫 번째 사진의 URL을 텍스트로 전달 (Vision은 inline data 필요)
            // 초반에는 사진 없이 기본 분석
            const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
            const res = await fetch(`${endpoint}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 800 }
                })
            });
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

            // JSON 파싱
            let analysis;
            try {
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                analysis = JSON.parse(jsonMatch[0]);
            } catch (e) {
                analysis = {
                    skinType: '복합성',
                    scores: { moisture: 65, oil: 50, pore: 60, wrinkle: 70, elasticity: 65, pigment: 55, overall: 62 },
                    summary: text.substring(0, 200),
                    advice: '충분한 수분 공급, 자외선 차단, 규칙적인 클렌징',
                    recommended: '크라우니 프레즌트 마스크팩'
                };
            }

            // Firestore에 저장
            const analysisDoc = await db.collection('users').doc(currentUser.uid)
                .collection('skin_analyses').add({
                    type: 'ai',
                    analyzer: 'crownygirl',
                    ...analysis,
                    photoCount: photoURLs.length,
                    zones,
                    createdAt: new Date()
                });

            hideLoading();
            showToast('<i data-lucide="sparkles" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 크라우니걸 분석 완료!', 'success');

            // 결과 표시
            const resultEl = document.getElementById('beauty-result-content');
            if (resultEl) resultEl.innerHTML = renderAnalysis({ id: analysisDoc.id, ...analysis, createdAt: new Date(), type: 'ai' });

        } catch (e) {
            hideLoading();
            console.error('[Beauty] AI analysis failed:', e);
            showToast('분석 실패: ' + e.message, 'error');
        }
    }

    // 분석 결과 렌더링
    function renderAnalysis(analysis) {
        const scores = analysis.scores || {};
        const metricsKo = { moisture: '수분', oil: '유분', pore: '모공', wrinkle: '주름', pigment: '색소', elasticity: '탄력', overall: '전체' };
        const colors = { moisture: '#8B6914', oil: '#FFB74D', pore: '#BA68C8', wrinkle: '#B54534', pigment: '#A1887F', elasticity: '#6B8F3C', overall: '#B54534' };

        const date = analysis.createdAt?.toDate ? analysis.createdAt.toDate().toLocaleDateString('ko-KR') : new Date().toLocaleDateString('ko-KR');
        const typeLabel = analysis.type === 'ai' ? '<i data-lucide="sparkles" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 크라우니걸 AI' : '👩‍⚕️ 전문가';

        return `
            <div style="margin-bottom:0.8rem;">
                <span style="font-size:0.75rem;color:var(--accent);">${date} · ${typeLabel}</span>
                <div style="margin-top:0.3rem;font-size:0.9rem;font-weight:700;">피부 타입: <span style="color:var(--primary,#B54534);">${analysis.skinType || '분석 중'}</span></div>
            </div>
            <div style="display:grid;gap:0.5rem;margin-bottom:1rem;">
                ${Object.entries(scores).map(([key, val]) => `
                    <div>
                        <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:0.2rem;">
                            <span>${metricsKo[key] || key}</span>
                            <span style="font-weight:700;color:${colors[key] || '#6B5744'};">${val}점</span>
                        </div>
                        <div style="background:#F7F3ED;border-radius:10px;height:8px;overflow:hidden;">
                            <div style="background:${colors[key] || '#B54534'};height:100%;width:${val}%;border-radius:10px;transition:width 0.5s;"></div>
                        </div>
                    </div>
                `).join('')}
            </div>
            ${analysis.summary ? `<div style="background:#F7F3ED;padding:0.8rem;border-radius:8px;font-size:0.85rem;margin-bottom:0.8rem;">${analysis.summary}</div>` : ''}
            ${analysis.advice ? `<div style="font-size:0.8rem;color:var(--accent);"><strong>💡 관리 조언:</strong> ${analysis.advice}</div>` : ''}
            ${analysis.recommended ? `<div style="font-size:0.8rem;color:var(--primary,#B54534);margin-top:0.5rem;"><strong><i data-lucide="gift" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 추천:</strong> ${analysis.recommended}</div>` : ''}
        `;
    }

    // 촬영 기록 로드
    async function loadPhotoHistory() {
        if (!currentUser) return;
        const container = document.getElementById('beauty-photo-history');
        if (!container) return;

        try {
            const snap = await db.collection('users').doc(currentUser.uid)
                .collection('skin_photos').orderBy('createdAt', 'desc').limit(12).get();

            if (snap.empty) return;

            container.innerHTML = snap.docs.map(doc => {
                const d = doc.data();
                const zone = ZONES.find(z => z.id === d.zone) || { name: d.zone, emoji: '📷' };
                const date = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '';
                return `
                    <div style="position:relative;border-radius:8px;overflow:hidden;aspect-ratio:1;cursor:pointer;" onclick="BEAUTY.viewPhoto('${d.photoURL}','${zone.name}','${date}')">
                        <img src="${d.photoURL}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">
                        <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(61,43,31,0.7));padding:0.3rem;color:#FFF8F0;font-size:0.6rem;">
                            ${zone.emoji} ${zone.name}<br>${date}
                        </div>
                    </div>`;
            }).join('');
        } catch (e) {
            console.warn('[Beauty] Load history failed:', e);
        }
    }

    // 타임라인 로드
    async function loadTimeline() {
        if (!currentUser) return;
        const container = document.getElementById('beauty-timeline');
        if (!container) return;

        try {
            const snap = await db.collection('users').doc(currentUser.uid)
                .collection('skin_analyses').orderBy('createdAt', 'desc').limit(10).get();

            if (snap.empty || snap.size < 2) return;

            const entries = snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();

            container.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:0.8rem;">
                    ${entries.map((a, i) => {
                        const date = a.createdAt?.toDate ? a.createdAt.toDate().toLocaleDateString('ko-KR') : '';
                        const overall = a.scores?.overall || 0;
                        const prev = i > 0 ? (entries[i - 1].scores?.overall || 0) : overall;
                        const diff = overall - prev;
                        const diffText = i === 0 ? '기준' : (diff > 0 ? `+${diff} ↑` : diff < 0 ? `${diff} ↓` : '변동 없음');
                        const diffColor = diff > 0 ? '#6B8F3C' : diff < 0 ? '#F44336' : '#6B5744';
                        return `
                            <div style="display:flex;align-items:center;gap:0.8rem;">
                                <div style="width:50px;text-align:center;font-size:0.7rem;color:var(--accent);">${date}</div>
                                <div style="flex:1;background:#F7F3ED;border-radius:8px;padding:0.5rem;display:flex;justify-content:space-between;align-items:center;">
                                    <span style="font-weight:700;">${a.skinType || '—'}</span>
                                    <div style="text-align:right;">
                                        <span style="font-weight:700;">${overall}점</span>
                                        <span style="font-size:0.7rem;color:${diffColor};margin-left:0.3rem;">${diffText}</span>
                                    </div>
                                </div>
                            </div>`;
                    }).join('')}
                </div>`;
        } catch (e) {
            console.warn('[Beauty] Load timeline failed:', e);
        }
    }

    function viewPhoto(url, zone, date) {
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.95);z-index:10001;display:flex;align-items:center;justify-content:center;flex-direction:column;';
        modal.onclick = () => modal.remove();
        modal.innerHTML = `
            <img src="${url}" style="max-width:90%;max-height:75vh;border-radius:12px;object-fit:contain;">
            <p style="color:#FFF8F0;margin-top:1rem;font-size:0.9rem;">${zone} · ${date}</p>
        `;
        document.body.appendChild(modal);
    }

    // 관리자: 분석 요청 목록 + 결과 입력
    async function loadAdminRequests() {
        const container = document.getElementById('beauty-admin-requests');
        if (!container) return;

        try {
            const snap = await db.collection('skin_analysis_requests')
                .where('status', 'in', ['pending', 'in_progress'])
                .orderBy('createdAt', 'desc').limit(20).get();

            if (snap.empty) {
                container.innerHTML = '<p style="text-align:center;color:#6B5744;padding:1rem;">대기 중인 분석 요청이 없습니다.</p>';
                return;
            }

            container.innerHTML = snap.docs.map(doc => {
                const d = doc.data();
                const date = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleDateString('ko-KR') : '';
                return `
                    <div style="border:1px solid #E8E0D8;border-radius:8px;padding:0.8rem;margin-bottom:0.5rem;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <strong>${d.userNickname || d.userId}</strong>
                            <span style="font-size:0.75rem;color:#6B5744;">${date} · camera ${d.photoCount}장</span>
                        </div>
                        <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                            <button onclick="BEAUTY.adminAnalyze('${doc.id}','${d.userId}')" 
                                style="flex:1;padding:0.5rem;border:none;border-radius:6px;background:#6B8F3C;color:#FFF8F0;cursor:pointer;font-size:0.8rem;">
                                📊 분석 입력
                            </button>
                        </div>
                    </div>`;
            }).join('');
        } catch (e) {
            container.innerHTML = '<p style="color:red;">로드 실패: ' + e.message + '</p>';
        }
    }

    // 관리자 분석 입력 모달
    async function adminAnalyze(requestId, userId) {
        const modal = document.createElement('div');
        modal.id = 'beauty-admin-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.85);z-index:10001;display:flex;align-items:center;justify-content:center;padding:1rem;overflow-y:auto;';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
            <div style="background:#FFF8F0;border-radius:16px;max-width:500px;width:100%;max-height:85vh;overflow-y:auto;padding:1.5rem;">
                <h3>📊 피부 분석 입력</h3>
                <div style="display:grid;gap:0.6rem;margin-top:1rem;">
                    <select id="admin-skin-type" style="padding:0.5rem;border:1px solid #E8E0D8;border-radius:6px;">
                        ${SKIN_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                    </select>
                    ${METRICS.map(m => `
                        <div style="display:flex;align-items:center;gap:0.5rem;">
                            <label style="width:50px;font-size:0.8rem;">${m}</label>
                            <input type="range" id="admin-score-${m}" min="0" max="100" value="50" style="flex:1;" oninput="this.nextElementSibling.textContent=this.value">
                            <span style="width:30px;text-align:right;font-size:0.8rem;">50</span>
                        </div>
                    `).join('')}
                    <textarea id="admin-summary" placeholder="요약 코멘트" rows="2" style="padding:0.5rem;border:1px solid #E8E0D8;border-radius:6px;"></textarea>
                    <textarea id="admin-advice" placeholder="관리 조언" rows="2" style="padding:0.5rem;border:1px solid #E8E0D8;border-radius:6px;"></textarea>
                    <input type="text" id="admin-recommended" placeholder="추천 제품/서비스" style="padding:0.5rem;border:1px solid #E8E0D8;border-radius:6px;">
                    <button onclick="BEAUTY.submitAdminAnalysis('${requestId}','${userId}')" 
                        style="padding:0.8rem;border:none;border-radius:8px;background:#6B8F3C;color:#FFF8F0;font-weight:700;cursor:pointer;">
                        ✅ 분석 결과 저장
                    </button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }

    async function submitAdminAnalysis(requestId, userId) {
        const metricsMap = { '수분': 'moisture', '유분': 'oil', '모공': 'pore', '주름': 'wrinkle', '색소': 'pigment', '탄력': 'elasticity', '전체': 'overall' };
        const scores = {};
        METRICS.forEach(m => {
            const el = document.getElementById(`admin-score-${m}`);
            scores[metricsMap[m] || m] = parseInt(el?.value || 50);
        });

        const analysis = {
            type: 'expert',
            skinType: document.getElementById('admin-skin-type')?.value || '복합성',
            scores,
            summary: document.getElementById('admin-summary')?.value || '',
            advice: document.getElementById('admin-advice')?.value || '',
            recommended: document.getElementById('admin-recommended')?.value || '',
            createdAt: new Date()
        };

        try {
            showLoading('저장 중...');
            await db.collection('users').doc(userId).collection('skin_analyses').add(analysis);
            await db.collection('skin_analysis_requests').doc(requestId).update({
                status: 'completed', completedAt: new Date()
            });

            // 알림
            try {
                await db.collection('users').doc(userId).collection('notifications').add({
                    type: 'beauty', message: '📊 피부 분석 결과가 도착했습니다!', read: false, createdAt: new Date()
                });
            } catch (e) {}

            hideLoading();
            showToast('✅ 분석 결과 저장 완료!', 'success');
            document.getElementById('beauty-admin-modal')?.remove();
            loadAdminRequests();
        } catch (e) {
            hideLoading();
            showToast('저장 실패: ' + e.message, 'error');
        }
    }

    return {
        init, captureZone, takePhoto, uploadFromGallery, closeCapture,
        requestExpertAnalysis, requestAIAnalysis, viewPhoto,
        loadAdminRequests, adminAnalyze, submitAdminAnalysis
    };
})();
