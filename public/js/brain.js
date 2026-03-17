// ===== brain.js - 크라우니브레인: 자기발견 3단계 진단 (v1.0) =====

const BRAIN = (() => {
    // ── 1단계: 4가지 기질 (블루/옐로우/레드/그린) ──
    const TEMPERAMENTS = {
        blue: {
            name: '블루 💙', color: '#8B6914', gradient: 'linear-gradient(135deg,#8B6914,#F0C060)',
            traits: ['완벽주의자', '충성인'],
            desc: '질서와 원칙을 중시하며, 신뢰할 수 있고 꼼꼼합니다. 깊은 사고력과 분석력이 강점입니다.',
            strengths: ['분석력', '신뢰성', '꼼꼼함', '계획성'],
            growth: '때로는 완벽하지 않아도 괜찮다는 것을 받아들이세요.'
        },
        yellow: {
            name: '옐로우 💛', color: '#8B6914', gradient: 'linear-gradient(135deg,#8B6914,#F0C060)',
            traits: ['예술가', '사려깊은 자', '낙천가'],
            desc: '창의적이고 긍정적이며, 사람들에게 기쁨과 영감을 줍니다. 감성과 직관이 뛰어납니다.',
            strengths: ['창의력', '공감력', '긍정성', '직관력'],
            growth: '에너지를 분산시키지 말고 하나에 집중하는 연습을 해보세요.'
        },
        red: {
            name: '레드 ❤️', color: '#8B6914', gradient: 'linear-gradient(135deg,#8B6914,#6B5744)',
            traits: ['성취가', '지도자'],
            desc: '목표 지향적이고 결단력이 있으며, 팀을 이끄는 리더십이 있습니다. 실행력이 탁월합니다.',
            strengths: ['리더십', '결단력', '실행력', '추진력'],
            growth: '다른 사람의 속도와 감정을 존중하는 연습이 필요합니다.'
        },
        green: {
            name: '그린 💚', color: '#8B6914', gradient: 'linear-gradient(135deg,#8B6914,#6B5744)',
            traits: ['평화주의자', '사색가'],
            desc: '조화와 평화를 추구하며, 깊은 사색과 통찰력이 있습니다. 균형 잡힌 시각을 가지고 있습니다.',
            strengths: ['통찰력', '조화', '인내심', '중재력'],
            growth: '자신의 의견을 적극적으로 표현하는 용기를 가져보세요.'
        }
    };

    // ── 1단계 질문 (12문항) ──
    const STAGE1_QUESTIONS = [
        { q: '새로운 프로젝트를 시작할 때 나는...', a: [
            { text: '꼼꼼하게 계획을 세운다', t: 'blue' },
            { text: '아이디어부터 떠올린다', t: 'yellow' },
            { text: '바로 실행에 옮긴다', t: 'red' },
            { text: '충분히 생각한 후 움직인다', t: 'green' }
        ]},
        { q: '팀에서 나의 역할은 주로...', a: [
            { text: '품질을 관리하는 사람', t: 'blue' },
            { text: '분위기를 띄우는 사람', t: 'yellow' },
            { text: '방향을 정하는 사람', t: 'red' },
            { text: '갈등을 중재하는 사람', t: 'green' }
        ]},
        { q: '스트레스를 받으면 나는...', a: [
            { text: '혼자 정리하며 분석한다', t: 'blue' },
            { text: '사람들과 이야기한다', t: 'yellow' },
            { text: '운동이나 활동으로 푼다', t: 'red' },
            { text: '조용히 산책하며 생각한다', t: 'green' }
        ]},
        { q: '나에게 가장 중요한 가치는...', a: [
            { text: '정확함과 원칙', t: 'blue' },
            { text: '자유와 창의성', t: 'yellow' },
            { text: '성과와 목표 달성', t: 'red' },
            { text: '평화와 조화', t: 'green' }
        ]},
        { q: '친구들은 나를 이렇게 표현한다...', a: [
            { text: '믿을 수 있는 사람', t: 'blue' },
            { text: '재미있는 사람', t: 'yellow' },
            { text: '카리스마 있는 사람', t: 'red' },
            { text: '편안한 사람', t: 'green' }
        ]},
        { q: '결정을 내릴 때 나는...', a: [
            { text: '데이터와 근거로 판단', t: 'blue' },
            { text: '직감과 느낌으로 판단', t: 'yellow' },
            { text: '빠르고 과감하게 결정', t: 'red' },
            { text: '모두의 의견을 듣고 결정', t: 'green' }
        ]},
        { q: '이상적인 주말은...', a: [
            { text: '계획한 일정을 차분히 수행', t: 'blue' },
            { text: '새로운 곳을 탐험하거나 창작', t: 'yellow' },
            { text: '목표를 향해 자기계발', t: 'red' },
            { text: '자연 속에서 여유롭게', t: 'green' }
        ]},
        { q: '갈등 상황에서 나는...', a: [
            { text: '논리적으로 해결하려 한다', t: 'blue' },
            { text: '감정을 먼저 공감한다', t: 'yellow' },
            { text: '직접 나서서 해결한다', t: 'red' },
            { text: '시간을 두고 자연스럽게', t: 'green' }
        ]},
        { q: '나의 약점이라면...', a: [
            { text: '지나친 완벽주의', t: 'blue' },
            { text: '산만하고 일관성 부족', t: 'yellow' },
            { text: '참을성 부족, 조급함', t: 'red' },
            { text: '우유부단, 수동적', t: 'green' }
        ]},
        { q: '성공이란 나에게...', a: [
            { text: '최고 품질을 달성하는 것', t: 'blue' },
            { text: '즐기면서 성장하는 것', t: 'yellow' },
            { text: '1등이 되는 것', t: 'red' },
            { text: '모두가 행복한 것', t: 'green' }
        ]},
        { q: '새로운 사람을 만나면...', a: [
            { text: '관찰하고 천천히 친해진다', t: 'blue' },
            { text: '먼저 말을 건다', t: 'yellow' },
            { text: '존재감을 보여준다', t: 'red' },
            { text: '편안한 분위기를 만든다', t: 'green' }
        ]},
        { q: '인생에서 가장 두려운 것은...', a: [
            { text: '실수하는 것', t: 'blue' },
            { text: '지루한 삶', t: 'yellow' },
            { text: '실패하는 것', t: 'red' },
            { text: '갈등과 충돌', t: 'green' }
        ]}
    ];

    // ── 2단계: 애니어그램 기반 243가지 (9유형 × 3본능 × 9상태) ──
    const ENNEAGRAM_TYPES = [
        { num: 1, name: '개혁가', core: '완벽을 추구하는', wing: 'blue' },
        { num: 2, name: '조력자', core: '사랑을 주는', wing: 'yellow' },
        { num: 3, name: '성취자', core: '성공을 향한', wing: 'red' },
        { num: 4, name: '개성추구자', core: '독창적인', wing: 'yellow' },
        { num: 5, name: '탐구자', core: '지식을 쌓는', wing: 'green' },
        { num: 6, name: '충성가', core: '안전을 지키는', wing: 'blue' },
        { num: 7, name: '열정가', core: '즐거움을 찾는', wing: 'yellow' },
        { num: 8, name: '도전자', core: '힘을 키우는', wing: 'red' },
        { num: 9, name: '평화주의자', core: '조화를 이루는', wing: 'green' }
    ];
    const INSTINCTS = ['자기보존(SP)', '사회적(SO)', '일대일(SX)'];
    const HEALTH_LEVELS = ['매우 건강', '건강', '평균 이상', '평균', '평균 이하', '불건강 초기', '불건강', '매우 불건강', '위험'];

    let currentStage = 0;
    let currentQuestion = 0;
    let answers = [];
    let stage1Result = null;

    async function init() {
        const container = document.getElementById('brain-content');
        if (!container) return;
        if (!currentUser) {
            container.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--accent);">로그인이 필요합니다</p>';
            return;
        }

        // 기존 결과 확인
        let latestResult = null;
        try {
            const snap = await db.collection('users').doc(currentUser.uid)
                .collection('brain_results').orderBy('createdAt', 'desc').limit(1).get();
            if (!snap.empty) latestResult = { id: snap.docs[0].id, ...snap.docs[0].data() };
        } catch (e) {}

        container.innerHTML = `
            <div style="text-align:center;margin-bottom:2rem;">
                <div style="font-size:3rem;margin-bottom:0.5rem;">🧠</div>
                <h3 style="margin:0;">나를 발견하는 여행</h3>
                <p style="font-size:0.85rem;color:var(--accent);margin-top:0.5rem;">3단계 진단으로 진짜 나를 알아보세요</p>
            </div>

            <!-- 3단계 카드 -->
            <div style="display:grid;gap:0.8rem;margin-bottom:1.5rem;">
                <div onclick="BRAIN.startStage(1)" style="background:linear-gradient(135deg,#8B6914,#6B5744);padding:1.2rem;border-radius:12px;color:#FFF8F0;cursor:pointer;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <div style="font-size:0.7rem;opacity:0.8;">STAGE 1</div>
                            <div style="font-size:1.1rem;font-weight:700;">4가지 기질 진단</div>
                            <div style="font-size:0.75rem;opacity:0.8;margin-top:0.2rem;">💙 블루 · 💛 옐로우 · ❤️ 레드 · 💚 그린</div>
                        </div>
                        <div style="font-size:2rem;">🎨</div>
                    </div>
                </div>

                <div onclick="BRAIN.startStage(2)" style="background:linear-gradient(135deg,#8B6914,#6B5744);padding:1.2rem;border-radius:12px;color:#FFF8F0;cursor:pointer;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <div style="font-size:0.7rem;opacity:0.8;">STAGE 2</div>
                            <div style="font-size:1.1rem;font-weight:700;">243가지 성격 유형</div>
                            <div style="font-size:0.75rem;opacity:0.8;margin-top:0.2rem;">애니어그램 9유형 × 3본능 × 9상태</div>
                        </div>
                        <div style="font-size:2rem;">🔮</div>
                    </div>
                </div>

                <div onclick="BRAIN.startStage(3)" style="background:linear-gradient(135deg,#8B6914,#6B5744);padding:1.2rem;border-radius:12px;color:#FFF8F0;cursor:pointer;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <div style="font-size:0.7rem;opacity:0.8;">STAGE 3</div>
                            <div style="font-size:1.1rem;font-weight:700;">브레인OS 8,192 유형</div>
                            <div style="font-size:0.75rem;opacity:0.8;margin-top:0.2rem;">안진훈 대표님의 뇌진단 시스템</div>
                        </div>
                        <div style="font-size:2rem;">🧬</div>
                    </div>
                </div>
            </div>

            <!-- 최근 결과 -->
            <div id="brain-latest" style="background:var(--card-bg,#F7F3ED);border-radius:12px;padding:1.2rem;">
                <h3 style="margin:0 0 0.8rem 0;font-size:1rem;">📊 나의 진단 결과</h3>
                <div id="brain-result-content">
                    ${latestResult ? renderResult(latestResult) : '<p style="text-align:center;color:var(--accent);font-size:0.85rem;padding:1rem;">아직 진단 결과가 없습니다.<br>위 단계를 선택해서 시작해보세요!</p>'}
                </div>
            </div>

            <!-- 크라우니 지식 라이브러리 -->
            <div style="background:var(--card-bg,#F7F3ED);border-radius:12px;padding:1.2rem;margin-top:1rem;">
                <h3 style="margin:0 0 0.8rem 0;font-size:1rem;">📚 크라우니 지식 라이브러리</h3>
                <div style="display:grid;gap:0.5rem;">
                    <div onclick="showPage('books')" style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem;background:var(--bg);border-radius:10px;cursor:pointer;">
                        <span style="font-size:1.5rem;">📖</span>
                        <div><div style="font-weight:600;font-size:0.9rem;">크라우니 북스</div><div style="font-size:0.75rem;color:var(--accent);">다국어 도서 · 번역 기여 · 지식 공유</div></div>
                    </div>
                    <div onclick="showPage('ai-assistant')" style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem;background:var(--bg);border-radius:10px;cursor:pointer;">
                        <span style="font-size:1.5rem;">👑</span>
                        <div><div style="font-weight:600;font-size:0.9rem;">크라우니 패널</div><div style="font-size:0.75rem;color:var(--accent);">5명의 AI 멘토에게 질문하기</div></div>
                    </div>
                    <div onclick="showPage('prop-trading')" style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem;background:var(--bg);border-radius:10px;cursor:pointer;">
                        <span style="font-size:1.5rem;">📈</span>
                        <div><div style="font-weight:600;font-size:0.9rem;">트레이딩 게임</div><div style="font-size:0.75rem;color:var(--accent);">실전 투자 학습 · 모의 트레이딩</div></div>
                    </div>
                </div>
            </div>
        `;
    }

    function startStage(stage) {
        if (stage === 3) {
            showToast('🧬 브레인OS 8,192유형 진단은 준비 중입니다. (안진훈 대표님 시스템 연동 예정)', 'info');
            return;
        }
        currentStage = stage;
        currentQuestion = 0;
        answers = [];

        if (stage === 1) showQuestion();
        if (stage === 2) startStage2();
    }

    // ── 1단계 진행 ──
    function showQuestion() {
        const container = document.getElementById('brain-content');
        const q = STAGE1_QUESTIONS[currentQuestion];
        const progress = ((currentQuestion + 1) / STAGE1_QUESTIONS.length * 100).toFixed(0);

        container.innerHTML = `
            <div style="margin-bottom:1rem;">
                <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--accent);margin-bottom:0.5rem;">
                    <span>STAGE 1 — 4가지 기질</span>
                    <span>${currentQuestion + 1} / ${STAGE1_QUESTIONS.length}</span>
                </div>
                <div style="background:#e0e0e0;border-radius:10px;height:6px;">
                    <div style="background:linear-gradient(90deg,#8B6914,#6B5744);height:100%;width:${progress}%;border-radius:10px;transition:width 0.3s;"></div>
                </div>
            </div>
            <div style="background:var(--card-bg,#F7F3ED);border-radius:12px;padding:1.5rem;margin-bottom:1rem;">
                <h3 style="margin:0 0 1.2rem 0;font-size:1rem;line-height:1.5;">${q.q}</h3>
                <div style="display:grid;gap:0.6rem;">
                    ${q.a.map((a, i) => `
                        <button onclick="BRAIN.answer('${a.t}')" 
                            style="padding:0.9rem;border:2px solid var(--border,#e0e0e0);border-radius:10px;background:var(--card-bg,#F7F3ED);cursor:pointer;text-align:left;font-size:0.9rem;transition:all 0.2s;"
                            onmouseenter="this.style.borderColor='#8B6914';this.style.background='#f0f0ff'"
                            onmouseleave="this.style.borderColor='';this.style.background=''">
                            ${a.text}
                        </button>
                    `).join('')}
                </div>
            </div>
            <button onclick="BRAIN.init()" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:0.8rem;">← 돌아가기</button>
        `;
    }

    function answer(temperament) {
        answers.push(temperament);
        currentQuestion++;
        if (currentQuestion < STAGE1_QUESTIONS.length) {
            showQuestion();
        } else {
            finishStage1();
        }
    }

    async function finishStage1() {
        // 집계
        const counts = { blue: 0, yellow: 0, red: 0, green: 0 };
        answers.forEach(a => counts[a]++);
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const primary = sorted[0][0];
        const secondary = sorted[1][0];
        stage1Result = { primary, secondary, counts };

        const temp = TEMPERAMENTS[primary];

        // 저장
        try {
            await db.collection('users').doc(currentUser.uid)
                .collection('brain_results').add({
                    stage: 1,
                    primary, secondary, counts,
                    createdAt: new Date()
                });
        } catch (e) { console.warn('[Brain] Save failed:', e); }

        const container = document.getElementById('brain-content');
        container.innerHTML = `
            <div style="text-align:center;margin-bottom:1.5rem;">
                <div style="font-size:4rem;margin-bottom:0.5rem;">${primary === 'blue' ? '💙' : primary === 'yellow' ? '💛' : primary === 'red' ? '❤️' : '💚'}</div>
                <h2 style="margin:0;">당신은 ${temp.name}!</h2>
                <p style="font-size:0.85rem;color:var(--accent);margin-top:0.5rem;">${temp.desc}</p>
            </div>

            <div style="background:${temp.gradient};border-radius:12px;padding:1.2rem;color:#FFF8F0;margin-bottom:1rem;">
                <div style="font-size:0.8rem;opacity:0.8;margin-bottom:0.5rem;">기질 분포</div>
                ${sorted.map(([key, val]) => `
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;">
                        <span style="width:60px;font-size:0.8rem;">${TEMPERAMENTS[key].name}</span>
                        <div style="flex:1;background:rgba(255,255,255,0.2);border-radius:6px;height:8px;">
                            <div style="background:#FFF8F0;height:100%;width:${(val / STAGE1_QUESTIONS.length * 100).toFixed(0)}%;border-radius:6px;"></div>
                        </div>
                        <span style="font-size:0.8rem;width:30px;text-align:right;">${val}</span>
                    </div>
                `).join('')}
            </div>

            <div style="background:var(--card-bg,#F7F3ED);border-radius:12px;padding:1.2rem;margin-bottom:1rem;">
                <h4 style="margin:0 0 0.5rem 0;">💪 강점</h4>
                <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
                    ${temp.strengths.map(s => `<span style="background:#f0f0ff;padding:0.3rem 0.7rem;border-radius:20px;font-size:0.8rem;">${s}</span>`).join('')}
                </div>
                <h4 style="margin:1rem 0 0.5rem 0;">🌱 성장 포인트</h4>
                <p style="font-size:0.85rem;color:var(--accent);">${temp.growth}</p>
                <h4 style="margin:1rem 0 0.5rem 0;"><i data-lucide="handshake" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 관련 기질</h4>
                <p style="font-size:0.85rem;">${temp.traits.join(', ')}</p>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
                <button onclick="BRAIN.startStage(2)" style="padding:0.8rem;border:none;border-radius:10px;background:linear-gradient(135deg,#8B6914,#6B5744);color:#FFF8F0;font-weight:700;cursor:pointer;">🔮 2단계 진행</button>
                <button onclick="BRAIN.init()" style="padding:0.8rem;border:none;border-radius:10px;background:var(--card-bg,#F7F3ED);border:1px solid #E8E0D8;cursor:pointer;font-weight:600;">← 돌아가기</button>
            </div>
        `;
    }

    // ── 2단계: 애니어그램 (AI 기반) ──
    async function startStage2() {
        const container = document.getElementById('brain-content');
        container.innerHTML = `
            <div style="text-align:center;padding:2rem;">
                <div style="font-size:3rem;margin-bottom:1rem;">🔮</div>
                <h3>STAGE 2 — 243가지 성격 유형</h3>
                <p style="font-size:0.85rem;color:var(--accent);margin:1rem 0;">크라우니걸이 대화를 통해 당신의 애니어그램 유형을 진단합니다.</p>
                <p style="font-size:0.8rem;color:var(--accent);">9가지 유형 × 3가지 본능 × 9가지 건강 상태 = <strong>243가지</strong></p>
                <button onclick="BRAIN.startAIEnneagram()" 
                    style="margin-top:1.5rem;padding:1rem 2rem;border:none;border-radius:12px;background:linear-gradient(135deg,#8B6914,#6B5744);color:#FFF8F0;font-weight:700;cursor:pointer;font-size:1rem;">
                    <i data-lucide="sparkles" style="width:14px;height:14px;display:inline;"></i> 크라우니걸과 대화 시작
                </button>
                <br>
                <button onclick="BRAIN.init()" style="margin-top:1rem;background:none;border:none;color:var(--accent);cursor:pointer;">← 돌아가기</button>
            </div>
        `;
    }

    async function startAIEnneagram() {
        const container = document.getElementById('brain-content');
        container.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <h3 style="margin:0;font-size:1rem;">🔮 크라우니걸 애니어그램 진단</h3>
                <button onclick="BRAIN.init()" style="background:none;border:none;cursor:pointer;font-size:1.2rem;">✕</button>
            </div>
            <div id="brain-chat" style="background:var(--bg);border-radius:12px;padding:1rem;height:50vh;overflow-y:auto;margin-bottom:1rem;">
                <div style="background:#F7F3ED;padding:0.8rem;border-radius:10px;margin-bottom:0.5rem;font-size:0.85rem;">
                    <i data-lucide="sparkles" style="width:14px;height:14px;display:inline;"></i> 안녕하세요! 크라우니걸이에요~ 지금부터 몇 가지 질문을 할 거예요. 편하게 답해주세요! 💕
                </div>
            </div>
            <div style="display:flex;gap:0.5rem;">
                <input type="text" id="brain-input" placeholder="답변을 입력하세요..." 
                    style="flex:1;padding:0.8rem;border:2px solid var(--border,#e0e0e0);border-radius:10px;font-size:16px;"
                    onkeydown="if(event.key==='Enter')BRAIN.sendChat()">
                <button onclick="BRAIN.sendChat()" style="padding:0.8rem 1.2rem;border:none;border-radius:10px;background:linear-gradient(135deg,#8B6914,#6B5744);color:#FFF8F0;font-weight:700;cursor:pointer;">➤</button>
            </div>
        `;
        // AI 첫 질문
        setTimeout(() => addBotMessage('자, 먼저 물어볼게요! 😊 평소에 혼자 있는 시간과 사람들과 함께하는 시간 중 어떤 게 더 편하세요?'), 1000);
    }

    let chatHistory = [];
    let chatCount = 0;

    function addBotMessage(text) {
        const chat = document.getElementById('brain-chat');
        if (!chat) return;
        chat.innerHTML += `<div style="background:#F7F3ED;padding:0.8rem;border-radius:10px;margin-bottom:0.5rem;font-size:0.85rem;">${text}</div>`;
        chat.scrollTop = chat.scrollHeight;
    }

    function addUserMessage(text) {
        const chat = document.getElementById('brain-chat');
        if (!chat) return;
        chat.innerHTML += `<div style="background:#F7F3ED;padding:0.8rem;border-radius:10px;margin-bottom:0.5rem;font-size:0.85rem;text-align:right;">${text}</div>`;
        chat.scrollTop = chat.scrollHeight;
    }

    async function sendChat() {
        const input = document.getElementById('brain-input');
        const text = input?.value.trim();
        if (!text) return;
        input.value = '';
        addUserMessage(text);
        chatHistory.push({ role: 'user', text });
        chatCount++;

        // 8번 대화 후 결과 도출
        if (chatCount >= 8) {
            addBotMessage('💕 충분히 이야기 나눴어요! 분석 중이에요... ✨');
            await analyzeEnneagram();
            return;
        }

        // AI 다음 질문
        try {
            let apiKey = 'AIzaSyAhkJlLDE_V2Iso8PZaGIWPqs_ht0ZuZeA';
            try {
                const s = await db.collection('admin_config').doc('ai_settings').get();
                const d = s.data() || {};
                if (d.apiKey?.length > 10) apiKey = d.apiKey;
            } catch (e) {}

            const prompt = `당신은 크라우니걸(23세, 밝고 친근). 애니어그램 성격 진단 인터뷰 중.
대화 기록: ${chatHistory.map(h => `${h.role}: ${h.text}`).join('\n')}

다음 질문을 하나만 하세요 (짧고 친근하게, 이모지 포함). ${chatCount}/8번째 질문입니다.
애니어그램 9유형, 3본능(자기보존/사회적/일대일), 건강 수준을 파악하기 위한 질문이어야 합니다.`;

            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.8, maxOutputTokens: 150 }
                })
            });
            const data = await res.json();
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '다음 질문이에요! 가장 행복했던 순간이 언제였나요? 😊';
            chatHistory.push({ role: 'bot', text: reply });
            addBotMessage(reply);
        } catch (e) {
            addBotMessage('음... 잠깐 문제가 있었어요 😅 다시 답해주세요!');
        }
    }

    async function analyzeEnneagram() {
        try {
            let apiKey = 'AIzaSyAhkJlLDE_V2Iso8PZaGIWPqs_ht0ZuZeA';
            try {
                const s = await db.collection('admin_config').doc('ai_settings').get();
                const d = s.data() || {};
                if (d.apiKey?.length > 10) apiKey = d.apiKey;
            } catch (e) {}

            const prompt = `대화 기록을 분석해서 애니어그램 결과를 JSON으로 출력하세요.
대화: ${chatHistory.map(h => `${h.role}: ${h.text}`).join('\n')}

JSON 형식:
{
  "type": 1-9 (주 유형 번호),
  "wing": 인접 날개 번호,
  "instinct": "SP/SO/SX",
  "healthLevel": 1-9 (1=매우건강, 9=위험),
  "code": "예: 4w5 SP lv3",
  "summary": "2-3줄 설명 (크라우니걸 말투로, 밝고 친근하게)",
  "strengths": ["강점1", "강점2", "강점3"],
  "growth": "성장 조언 1줄"
}
JSON만 출력.`;

            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.5, maxOutputTokens: 400 }
                })
            });
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            let result;
            try {
                const match = text.match(/\{[\s\S]*\}/);
                result = JSON.parse(match[0]);
            } catch (e) {
                result = { type: 9, wing: 1, instinct: 'SP', healthLevel: 4, code: '9w1 SP lv4', summary: '분석 완료!', strengths: ['평화', '조화', '인내'], growth: '자신을 더 표현해보세요' };
            }

            const etype = ENNEAGRAM_TYPES[result.type - 1] || ENNEAGRAM_TYPES[8];

            // 저장
            await db.collection('users').doc(currentUser.uid)
                .collection('brain_results').add({
                    stage: 2,
                    ...result,
                    typeName: etype.name,
                    chatHistory,
                    createdAt: new Date()
                });

            addBotMessage(`🎉 분석 완료! 당신은 <strong>${result.code}</strong> — ${etype.name}이에요!\n\n${result.summary}\n\n💪 강점: ${(result.strengths || []).join(', ')}\n🌱 ${result.growth}`);

        } catch (e) {
            addBotMessage('😅 분석 중 오류가 발생했어요. 다시 시도해주세요!');
        }
    }

    function renderResult(result) {
        if (result.stage === 1) {
            const temp = TEMPERAMENTS[result.primary];
            return `<div style="display:flex;align-items:center;gap:1rem;">
                <div style="font-size:2.5rem;">${result.primary === 'blue' ? '💙' : result.primary === 'yellow' ? '💛' : result.primary === 'red' ? '❤️' : '💚'}</div>
                <div><div style="font-weight:700;">${temp?.name || result.primary}</div><div style="font-size:0.8rem;color:var(--accent);">${temp?.desc?.substring(0, 50) || ''}...</div></div>
            </div>`;
        }
        if (result.stage === 2) {
            return `<div style="display:flex;align-items:center;gap:1rem;">
                <div style="font-size:2.5rem;">🔮</div>
                <div><div style="font-weight:700;">${result.code || ''} — ${result.typeName || ''}</div><div style="font-size:0.8rem;color:var(--accent);">${result.summary?.substring(0, 60) || ''}...</div></div>
            </div>`;
        }
        return '<p>결과가 있습니다. 다시 진단해보세요!</p>';
    }

    return { init, startStage, answer, sendChat, startAIEnneagram };
})();
