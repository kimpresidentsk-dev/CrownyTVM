// ===== movement.js - 크라우니무브먼트: 신체 아름다움 3단계 500회 프로세스 (v1.0) =====

const MOVEMENT = (() => {
    const STAGES = [
        {
            id: 'precision',
            name: '프레시전 무브먼트',
            emoji: '<i data-lucide="target"></i>',
            color: '#8B6914',
            gradient: 'linear-gradient(135deg,#8B6914,#F0C060)',
            subtitle: 'Precision Movement',
            desc: '터치를 통해 정교하게 몸 속에서 근육들이 살아나게 하는 단계',
            detail: '몸의 미세한 근육들을 깨우는 정교한 터치와 움직임. 평소 사용하지 않던 근육을 인식하고 활성화시킵니다.',
            sessions: 167, // 500 / 3
            exercises: [
                { name: '마이크로 터치 워밍업', duration: '5분', desc: '손끝으로 얼굴, 목, 어깨의 미세근육을 깨움' },
                { name: '파인 모터 컨트롤', duration: '10분', desc: '손가락, 발가락의 정밀한 움직임 훈련' },
                { name: '바디 스캐닝', duration: '8분', desc: '머리부터 발끝까지 각 부위를 인식하며 이완' },
                { name: '밸런스 터치', duration: '7분', desc: '좌우 균형을 맞추는 부드러운 터치 동작' },
                { name: '호흡 연동 스트레칭', duration: '10분', desc: '호흡에 맞춰 각 관절을 정교하게 풀어줌' },
                { name: '페이셜 무브먼트', duration: '5분', desc: '얼굴 근육 60여개를 개별적으로 운동' },
                { name: '핑거팁 릴리즈', duration: '5분', desc: '손끝에서 시작하는 전신 긴장 해소' }
            ]
        },
        {
            id: 'active',
            name: '액티브 무브먼트',
            emoji: '<i data-lucide="flame"></i>',
            color: '#8B6914',
            gradient: 'linear-gradient(135deg,#8B6914,#6B5744)',
            subtitle: 'Active Movement',
            desc: '아랫배에서 명치까지 중심축을 끌어올리는 활동형 무브먼트',
            detail: '코어의 중심축을 아랫배(단전)에서 명치(태양신경총)까지 끌어올리며 에너지 흐름을 활성화합니다.',
            sessions: 167,
            exercises: [
                { name: '코어 액티베이션', duration: '8분', desc: '아랫배 깊은 근육을 깨우는 동작' },
                { name: '에너지 라이징', duration: '10분', desc: '단전에서 명치까지 에너지를 끌어올리는 호흡+동작' },
                { name: '다이나믹 플로우', duration: '12분', desc: '유동적인 전신 동작으로 중심축 강화' },
                { name: '파워 브리딩', duration: '7분', desc: '강한 호흡과 함께하는 복부 강화 운동' },
                { name: '스파인 웨이브', duration: '8분', desc: '척추를 파도처럼 움직이며 유연성 확보' },
                { name: '힙 오프너', duration: '10분', desc: '골반과 고관절을 열어 에너지 흐름 개선' },
                { name: '액티브 밸런스', duration: '10분', desc: '한 발 서기, 동적 균형 등 활동적 밸런스 훈련' }
            ]
        },
        {
            id: 'core',
            name: '코어 무브먼트',
            emoji: '<i data-lucide="gem"></i>',
            color: '#8B6914',
            gradient: 'linear-gradient(135deg,#8B6914,#6B5744)',
            subtitle: 'Core Movement',
            desc: '몸의 가장 깊은 곳까지 에너지를 넘쳐나게 하는 훈련형 무브먼트',
            detail: '신체의 가장 깊은 근육과 에너지 시스템을 활성화하여, 내면에서 넘치는 활력과 아름다움을 만들어냅니다.',
            sessions: 166,
            exercises: [
                { name: '딥 코어 이그니션', duration: '10분', desc: '가장 깊은 복횡근/다열근 활성화' },
                { name: '에너지 서킷', duration: '15분', desc: '전신 에너지 순환 집중 훈련' },
                { name: '파워 플랭크 시리즈', duration: '10분', desc: '다양한 플랭크 변형으로 코어 극대화' },
                { name: '인터널 포스', duration: '12분', desc: '내부 근력을 최대한 끌어내는 고급 동작' },
                { name: '브레스 오브 파이어', duration: '8분', desc: '강력한 호흡법으로 내면 에너지 폭발' },
                { name: '풀바디 인테그레이션', duration: '15분', desc: '모든 근육 체인을 하나로 연결하는 통합 훈련' },
                { name: '리커버리 메디테이션', duration: '10분', desc: '훈련 후 깊은 이완과 에너지 안정화' }
            ]
        }
    ];

    let userProgress = null;

    async function init() {
        const container = document.getElementById('movement-content');
        if (!container) return;
        if (!currentUser) {
            container.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--accent);">로그인이 필요합니다</p>';
            return;
        }

        // 진행 상황 로드
        try {
            const doc = await db.collection('users').doc(currentUser.uid)
                .collection('movement_progress').doc('current').get();
            userProgress = doc.exists ? doc.data() : { totalSessions: 0, stage: 'precision', stageSession: 0, lastSessionDate: null, streak: 0 };
        } catch (e) {
            userProgress = { totalSessions: 0, stage: 'precision', stageSession: 0, lastSessionDate: null, streak: 0 };
        }

        const totalPercent = (userProgress.totalSessions / 500 * 100).toFixed(1);
        const currentStageObj = STAGES.find(s => s.id === userProgress.stage) || STAGES[0];
        const stagePercent = (userProgress.stageSession / currentStageObj.sessions * 100).toFixed(0);

        container.innerHTML = `
            <!-- 전체 진행률 -->
            <div style="background:linear-gradient(135deg,#3D2B1F,#6B5744);border-radius:16px;padding:1.5rem;color:#FFF8F0;margin-bottom:1.5rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem;">
                    <div>
                        <div style="font-size:0.75rem;opacity:0.7;">500회 프로세스</div>
                        <div style="font-size:2rem;font-weight:800;">${userProgress.totalSessions} <span style="font-size:1rem;opacity:0.7;">/ 500</span></div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:0.75rem;opacity:0.7;">연속</div>
                        <div style="font-size:1.5rem;font-weight:700;"><i data-lucide="flame" style="width:16px;height:16px;display:inline;"></i> ${userProgress.streak || 0}일</div>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.2);border-radius:10px;height:10px;overflow:hidden;">
                    <div style="background:linear-gradient(90deg,#8B6914,#F0C060,#6B5744);height:100%;width:${totalPercent}%;border-radius:10px;transition:width 0.5s;"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:0.7rem;opacity:0.7;margin-top:0.3rem;">
                    <span><i data-lucide="target"></i> 프레시전</span><span><i data-lucide="flame"></i> 액티브</span><span><i data-lucide="gem"></i> 코어</span>
                </div>
            </div>

            <!-- 현재 단계 -->
            <div style="background:${currentStageObj.gradient};border-radius:16px;padding:1.5rem;color:#FFF8F0;margin-bottom:1.5rem;">
                <div style="font-size:0.7rem;opacity:0.8;">현재 단계</div>
                <h3 style="margin:0.3rem 0;">${currentStageObj.emoji} ${currentStageObj.name}</h3>
                <p style="font-size:0.8rem;opacity:0.9;margin-bottom:1rem;">${currentStageObj.desc}</p>
                <div style="background:rgba(255,255,255,0.2);border-radius:8px;height:8px;margin-bottom:0.5rem;">
                    <div style="background:#FFF8F0;height:100%;width:${stagePercent}%;border-radius:8px;"></div>
                </div>
                <div style="font-size:0.75rem;opacity:0.8;">${userProgress.stageSession} / ${currentStageObj.sessions}회 완료</div>
            </div>

            <!-- 오늘의 운동 시작 -->
            <button onclick="MOVEMENT.startSession()" 
                style="width:100%;padding:1.2rem;border:none;border-radius:12px;background:linear-gradient(135deg,#8B6914,#6B5744);color:#FFF8F0;font-weight:700;font-size:1.1rem;cursor:pointer;margin-bottom:1.5rem;box-shadow:0 4px 15px rgba(139,105,20,0.3);">
                <i data-lucide="play"></i> 오늘의 무브먼트 시작
            </button>

            <!-- 3단계 소개 -->
            <div style="display:grid;gap:0.8rem;margin-bottom:1.5rem;">
                ${STAGES.map((s, i) => {
                    const isActive = s.id === userProgress.stage;
                    const isDone = STAGES.indexOf(STAGES.find(st => st.id === userProgress.stage)) > i;
                    return `
                    <div style="background:var(--card-bg,#F7F3ED);border-radius:12px;padding:1rem;border-left:4px solid ${s.color};opacity:${isActive || isDone ? 1 : 0.6};">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <div>
                                <div style="font-size:0.7rem;color:var(--accent);">STAGE ${i + 1} ${isDone ? '<i data-lucide="check-circle"></i>' : isActive ? '<i data-lucide="loader"></i>' : '<i data-lucide="lock"></i>'}</div>
                                <div style="font-weight:700;">${s.emoji} ${s.name}</div>
                                <div style="font-size:0.8rem;color:var(--accent);margin-top:0.2rem;">${s.subtitle}</div>
                            </div>
                            <div style="font-size:0.8rem;color:${s.color};font-weight:700;">${s.sessions}회</div>
                        </div>
                        <p style="font-size:0.8rem;color:var(--accent);margin-top:0.5rem;">${s.detail}</p>
                    </div>`;
                }).join('')}
            </div>

            <!-- 운동 기록 -->
            <div style="background:var(--card-bg,#F7F3ED);border-radius:12px;padding:1.2rem;">
                <h3 style="margin:0 0 0.8rem 0;font-size:1rem;">📋 최근 기록</h3>
                <div id="movement-history"><p style="text-align:center;color:var(--accent);font-size:0.85rem;">로딩 중...</p></div>
            </div>
        `;

        loadHistory();
    }

    async function startSession() {
        if (!currentUser || !userProgress) return;
        const stage = STAGES.find(s => s.id === userProgress.stage) || STAGES[0];
        const exerciseIndex = userProgress.stageSession % stage.exercises.length;
        const exercise = stage.exercises[exerciseIndex];

        const container = document.getElementById('movement-content');
        container.innerHTML = `
            <div style="background:${stage.gradient};border-radius:16px;padding:1.5rem;color:#FFF8F0;margin-bottom:1rem;">
                <div style="font-size:0.7rem;opacity:0.8;">${stage.name} — ${userProgress.totalSessions + 1}번째 세션</div>
                <h2 style="margin:0.5rem 0;">${exercise.name}</h2>
                <p style="opacity:0.9;font-size:0.85rem;">${exercise.desc}</p>
                <div style="margin-top:1rem;font-size:0.9rem;">⏱️ ${exercise.duration}</div>
            </div>

            <!-- 타이머 -->
            <div style="text-align:center;background:var(--card-bg,#F7F3ED);border-radius:16px;padding:2rem;margin-bottom:1rem;">
                <div id="movement-timer" style="font-size:3rem;font-weight:800;font-family:monospace;">00:00</div>
                <p id="movement-status" style="font-size:0.9rem;color:var(--accent);margin-top:0.5rem;">준비되셨나요?</p>
                <div style="display:flex;justify-content:center;gap:1rem;margin-top:1.5rem;">
                    <button id="movement-start-btn" onclick="MOVEMENT.toggleTimer()" 
                        style="padding:0.8rem 2rem;border:none;border-radius:10px;background:linear-gradient(135deg,#8B6914,#6B5744);color:#FFF8F0;font-weight:700;cursor:pointer;font-size:1rem;">
                        <i data-lucide="play"></i> 시작
                    </button>
                    <button onclick="MOVEMENT.completeSession()" 
                        style="padding:0.8rem 2rem;border:none;border-radius:10px;background:linear-gradient(135deg,#8B6914,#6B5744);color:#FFF8F0;font-weight:700;cursor:pointer;font-size:1rem;">
                        <i data-lucide="check-circle"></i> 완료
                    </button>
                </div>
            </div>

            <!-- 운동 목록 -->
            <div style="background:var(--card-bg,#F7F3ED);border-radius:12px;padding:1rem;">
                <h4 style="margin:0 0 0.5rem 0;font-size:0.9rem;">📋 ${stage.name} 운동 목록</h4>
                ${stage.exercises.map((ex, i) => `
                    <div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0;border-bottom:1px solid #F7F3ED;${i === exerciseIndex ? 'background:#F7F3ED;margin:0 -0.5rem;padding:0.5rem;border-radius:6px;' : ''}">
                        <span style="font-size:0.8rem;width:20px;text-align:center;color:${i === exerciseIndex ? '#B54534' : '#6B5744'};">${i === exerciseIndex ? '▶' : (i + 1)}</span>
                        <div style="flex:1;">
                            <div style="font-size:0.8rem;font-weight:${i === exerciseIndex ? '700' : '400'};">${ex.name}</div>
                            <div style="font-size:0.7rem;color:var(--accent);">${ex.duration}</div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <button onclick="MOVEMENT.init()" style="width:100%;margin-top:1rem;padding:0.8rem;background:none;border:1px solid #E8E0D8;border-radius:10px;cursor:pointer;"><i data-lucide="arrow-left"></i> 돌아가기</button>
        `;
    }

    let timerInterval = null;
    let timerSeconds = 0;
    let timerRunning = false;

    function toggleTimer() {
        const btn = document.getElementById('movement-start-btn');
        const status = document.getElementById('movement-status');
        if (timerRunning) {
            clearInterval(timerInterval);
            timerRunning = false;
            if (btn) btn.textContent = '▶️ 계속';
            if (status) status.textContent = '일시정지';
        } else {
            timerRunning = true;
            if (btn) btn.textContent = '⏸️ 일시정지';
            if (status) status.textContent = '운동 중...';
            timerInterval = setInterval(() => {
                timerSeconds++;
                const m = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
                const s = String(timerSeconds % 60).padStart(2, '0');
                const el = document.getElementById('movement-timer');
                if (el) el.textContent = `${m}:${s}`;
            }, 1000);
        }
    }

    async function completeSession() {
        if (timerInterval) clearInterval(timerInterval);
        timerRunning = false;

        if (!currentUser || !userProgress) return;
        const stage = STAGES.find(s => s.id === userProgress.stage) || STAGES[0];

        userProgress.totalSessions++;
        userProgress.stageSession++;

        // 다음 단계 체크
        if (userProgress.stageSession >= stage.sessions) {
            const stageIdx = STAGES.findIndex(s => s.id === userProgress.stage);
            if (stageIdx < STAGES.length - 1) {
                userProgress.stage = STAGES[stageIdx + 1].id;
                userProgress.stageSession = 0;
                showToast(`🎉 ${stage.name} 완료! 다음 단계로 넘어갑니다!`, 'success');
            }
        }

        // 연속 일수 계산
        const today = new Date().toDateString();
        const lastDate = userProgress.lastSessionDate;
        if (lastDate) {
            const yesterday = new Date(Date.now() - 86400000).toDateString();
            if (lastDate === yesterday) userProgress.streak = (userProgress.streak || 0) + 1;
            else if (lastDate !== today) userProgress.streak = 1;
        } else {
            userProgress.streak = 1;
        }
        userProgress.lastSessionDate = today;

        // 저장
        try {
            await db.collection('users').doc(currentUser.uid)
                .collection('movement_progress').doc('current').set(userProgress);

            await db.collection('users').doc(currentUser.uid)
                .collection('movement_log').add({
                    stage: stage.id,
                    sessionNumber: userProgress.totalSessions,
                    duration: timerSeconds,
                    createdAt: new Date()
                });
        } catch (e) {
            console.error('[Movement] Save failed:', e);
        }

        timerSeconds = 0;
        showToast(`✅ ${userProgress.totalSessions}/500 세션 완료! <i data-lucide="flame" style="width:14px;height:14px;display:inline;"></i> ${userProgress.streak}일 연속`, 'success');

        // 크라우니걸 AI 격려 메시지 (10회마다)
        if (userProgress.totalSessions % 10 === 0) {
            try {
                let apiKey = 'AIzaSyAhkJlLDE_V2Iso8PZaGIWPqs_ht0ZuZeA';
                try { const s = await db.collection('admin_config').doc('ai_settings').get(); const d = s.data()||{}; if(d.apiKey?.length>10) apiKey=d.apiKey; } catch(e){}
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ contents:[{parts:[{text:`크라우니걸(밝고 친근한 23세)로서, 무브먼트 ${userProgress.totalSessions}회를 달성한 사용자에게 1~2줄 격려 메시지. 이모지 포함. 텍스트만.`}]}], generationConfig:{temperature:0.9,maxOutputTokens:100} })
                });
                const data = await res.json();
                const msg = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                if (msg) showToast(`✨ ${msg}`, 'success');
            } catch(e){}
        }

        init();
    }

    async function loadHistory() {
        const container = document.getElementById('movement-history');
        if (!container || !currentUser) return;

        try {
            const snap = await db.collection('users').doc(currentUser.uid)
                .collection('movement_log').orderBy('createdAt', 'desc').limit(10).get();

            if (snap.empty) {
                container.innerHTML = '<p style="text-align:center;color:var(--accent);font-size:0.85rem;">아직 기록이 없습니다. 첫 세션을 시작해보세요!</p>';
                return;
            }

            container.innerHTML = snap.docs.map(doc => {
                const d = doc.data();
                const date = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleDateString('ko-KR') : '';
                const stage = STAGES.find(s => s.id === d.stage) || STAGES[0];
                const mins = Math.floor((d.duration || 0) / 60);
                const secs = (d.duration || 0) % 60;
                return `
                    <div style="display:flex;align-items:center;gap:0.8rem;padding:0.5rem 0;border-bottom:1px solid #F7F3ED;">
                        <div style="font-size:1.3rem;">${stage.emoji}</div>
                        <div style="flex:1;">
                            <div style="font-size:0.85rem;font-weight:600;">#${d.sessionNumber} ${stage.name}</div>
                            <div style="font-size:0.7rem;color:var(--accent);">${date}</div>
                        </div>
                        <div style="font-size:0.8rem;color:${stage.color};font-weight:600;">${mins}분 ${secs}초</div>
                    </div>`;
            }).join('');
        } catch (e) {
            container.innerHTML = '<p style="color:red;font-size:0.8rem;">로드 실패</p>';
        }
    }

    return { init, startSession, toggleTimer, completeSession };
})();
