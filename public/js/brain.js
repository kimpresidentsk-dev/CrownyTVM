// ===== brain.js - CrownyBrain: 3-Stage Self-Discovery (v1.0) =====

const BRAIN = (() => {
    // ── Stage 1: 4 Temperaments (Blue/Yellow/Red/Green) ──
    const TEMPERAMENTS = {
        blue: {
            name: t('brain.color_blue','Blue'), color: '#8B6914', gradient: 'linear-gradient(135deg,#8B6914,#F0C060)',
            traits: [t('brain.trait_perfectionist','Perfectionist'), t('brain.trait_loyalist','Loyalist')],
            desc: t('brain.color_blue_desc','Values order and principles, reliable and meticulous. Deep thinking and analytical skills are your strengths.'),
            strengths: [t('brain.str_analysis','Analytical'), t('brain.str_reliability','Reliable'), t('brain.str_meticulous','Meticulous'), t('brain.str_planning','Organized')],
            growth: t('brain.color_blue_growth','Accept that it\'s okay not to be perfect sometimes.')
        },
        yellow: {
            name: t('brain.color_yellow','Yellow'), color: '#8B6914', gradient: 'linear-gradient(135deg,#8B6914,#F0C060)',
            traits: [t('brain.trait_artist','Artist'), t('brain.trait_thoughtful','Thoughtful'), t('brain.trait_optimist','Optimist')],
            desc: t('brain.color_yellow_desc','Creative and positive, you bring joy and inspiration to people. Exceptional in empathy and intuition.'),
            strengths: [t('brain.str_creativity','Creative'), t('brain.str_empathy','Empathetic'), t('brain.str_positivity','Positive'), t('brain.str_intuition','Intuitive')],
            growth: t('brain.color_yellow_growth','Try to focus on one thing instead of spreading your energy.')
        },
        red: {
            name: t('brain.color_red','Red'), color: '#8B6914', gradient: 'linear-gradient(135deg,#8B6914,#6B5744)',
            traits: [t('brain.trait_achiever','Achiever'), t('brain.trait_leader','Leader')],
            desc: t('brain.color_red_desc','Goal-oriented with decisiveness and team leadership. Exceptional execution ability.'),
            strengths: [t('brain.str_leadership','Leadership'), t('brain.str_decisiveness','Decisive'), t('brain.str_execution','Execution'), t('brain.str_drive','Drive')],
            growth: t('brain.color_red_growth','Practice respecting other people\'s pace and feelings.')
        },
        green: {
            name: t('brain.color_green','Green'), color: '#8B6914', gradient: 'linear-gradient(135deg,#8B6914,#6B5744)',
            traits: [t('brain.trait_peacemaker','Peacemaker'), t('brain.trait_thinker','Thinker')],
            desc: t('brain.color_green_desc','Pursues harmony and peace, with deep reflection and insight. Has a balanced perspective.'),
            strengths: [t('brain.str_insight','Insightful'), t('brain.str_harmony','Harmonious'), t('brain.str_patience','Patient'), t('brain.str_mediation','Mediator')],
            growth: t('brain.color_green_growth','Have the courage to actively express your opinions.')
        }
    };

    // ── Stage 1 Questions (12 items) ──
    const STAGE1_QUESTIONS = [
        { q: t('brain.q1','When starting a new project, I...'), a: [
            { text: t('brain.q1_a1','Make a thorough plan'), t: 'blue' },
            { text: t('brain.q1_a2','Come up with ideas first'), t: 'yellow' },
            { text: t('brain.q1_a3','Jump right into action'), t: 'red' },
            { text: t('brain.q1_a4','Think thoroughly before moving'), t: 'green' }
        ]},
        { q: t('brain.q2','My role in a team is usually...'), a: [
            { text: t('brain.q2_a1','The quality manager'), t: 'blue' },
            { text: t('brain.q2_a2','The mood maker'), t: 'yellow' },
            { text: t('brain.q2_a3','The direction setter'), t: 'red' },
            { text: t('brain.q2_a4','The conflict mediator'), t: 'green' }
        ]},
        { q: t('brain.q3','When stressed, I...'), a: [
            { text: t('brain.q3_a1','Organize and analyze alone'), t: 'blue' },
            { text: t('brain.q3_a2','Talk with people'), t: 'yellow' },
            { text: t('brain.q3_a3','Release through exercise or activity'), t: 'red' },
            { text: t('brain.q3_a4','Take a quiet walk and think'), t: 'green' }
        ]},
        { q: t('brain.q4','The most important value to me is...'), a: [
            { text: t('brain.q4_a1','Accuracy and principles'), t: 'blue' },
            { text: t('brain.q4_a2','Freedom and creativity'), t: 'yellow' },
            { text: t('brain.q4_a3','Results and goal achievement'), t: 'red' },
            { text: t('brain.q4_a4','Peace and harmony'), t: 'green' }
        ]},
        { q: t('brain.q5','My friends describe me as...'), a: [
            { text: t('brain.q5_a1','A reliable person'), t: 'blue' },
            { text: t('brain.q5_a2','A fun person'), t: 'yellow' },
            { text: t('brain.q5_a3','A charismatic person'), t: 'red' },
            { text: t('brain.q5_a4','A comfortable person'), t: 'green' }
        ]},
        { q: t('brain.q6','When making decisions, I...'), a: [
            { text: t('brain.q6_a1','Judge based on data and evidence'), t: 'blue' },
            { text: t('brain.q6_a2','Judge by intuition and feeling'), t: 'yellow' },
            { text: t('brain.q6_a3','Decide quickly and boldly'), t: 'red' },
            { text: t('brain.q6_a4','Listen to everyone\'s opinions first'), t: 'green' }
        ]},
        { q: t('brain.q7','My ideal weekend is...'), a: [
            { text: t('brain.q7_a1','Calmly following my planned schedule'), t: 'blue' },
            { text: t('brain.q7_a2','Exploring new places or creating'), t: 'yellow' },
            { text: t('brain.q7_a3','Self-improvement toward goals'), t: 'red' },
            { text: t('brain.q7_a4','Relaxing in nature'), t: 'green' }
        ]},
        { q: t('brain.q8','In a conflict situation, I...'), a: [
            { text: t('brain.q8_a1','Try to resolve it logically'), t: 'blue' },
            { text: t('brain.q8_a2','Empathize with feelings first'), t: 'yellow' },
            { text: t('brain.q8_a3','Step in and resolve it directly'), t: 'red' },
            { text: t('brain.q8_a4','Give it time to resolve naturally'), t: 'green' }
        ]},
        { q: t('brain.q9','My weakness would be...'), a: [
            { text: t('brain.q9_a1','Excessive perfectionism'), t: 'blue' },
            { text: t('brain.q9_a2','Scattered and inconsistent'), t: 'yellow' },
            { text: t('brain.q9_a3','Impatient and hasty'), t: 'red' },
            { text: t('brain.q9_a4','Indecisive and passive'), t: 'green' }
        ]},
        { q: t('brain.q10','Success to me means...'), a: [
            { text: t('brain.q10_a1','Achieving the highest quality'), t: 'blue' },
            { text: t('brain.q10_a2','Growing while having fun'), t: 'yellow' },
            { text: t('brain.q10_a3','Being number one'), t: 'red' },
            { text: t('brain.q10_a4','Everyone being happy'), t: 'green' }
        ]},
        { q: t('brain.q11','When meeting new people, I...'), a: [
            { text: t('brain.q11_a1','Observe and warm up slowly'), t: 'blue' },
            { text: t('brain.q11_a2','Speak to them first'), t: 'yellow' },
            { text: t('brain.q11_a3','Show my presence'), t: 'red' },
            { text: t('brain.q11_a4','Create a comfortable atmosphere'), t: 'green' }
        ]},
        { q: t('brain.q12','What I fear most in life is...'), a: [
            { text: t('brain.q12_a1','Making mistakes'), t: 'blue' },
            { text: t('brain.q12_a2','A boring life'), t: 'yellow' },
            { text: t('brain.q12_a3','Failing'), t: 'red' },
            { text: t('brain.q12_a4','Conflict and confrontation'), t: 'green' }
        ]}
    ];

    // ── Stage 2: Enneagram-based 243 types (9 types × 3 instincts × 9 states) ──
    const ENNEAGRAM_TYPES = [
        { num: 1, name: t('brain.enn_1','Reformer'), core: t('brain.enn_1_core','Pursuing perfection'), wing: 'blue' },
        { num: 2, name: t('brain.enn_2','Helper'), core: t('brain.enn_2_core','Giving love'), wing: 'yellow' },
        { num: 3, name: t('brain.enn_3','Achiever'), core: t('brain.enn_3_core','Driven for success'), wing: 'red' },
        { num: 4, name: t('brain.enn_4','Individualist'), core: t('brain.enn_4_core','Being unique'), wing: 'yellow' },
        { num: 5, name: t('brain.enn_5','Investigator'), core: t('brain.enn_5_core','Building knowledge'), wing: 'green' },
        { num: 6, name: t('brain.enn_6','Loyalist'), core: t('brain.enn_6_core','Guarding safety'), wing: 'blue' },
        { num: 7, name: t('brain.enn_7','Enthusiast'), core: t('brain.enn_7_core','Seeking joy'), wing: 'yellow' },
        { num: 8, name: t('brain.enn_8','Challenger'), core: t('brain.enn_8_core','Building power'), wing: 'red' },
        { num: 9, name: t('brain.enn_9','Peacemaker'), core: t('brain.enn_9_core','Creating harmony'), wing: 'green' }
    ];
    const INSTINCTS = [t('brain.instinct_sp','Self-Preservation (SP)'), t('brain.instinct_so','Social (SO)'), t('brain.instinct_sx','One-to-One (SX)')];
    const HEALTH_LEVELS = [t('brain.health_1','Very Healthy'), t('brain.health_2','Healthy'), t('brain.health_3','Above Average'), t('brain.health_4','Average'), t('brain.health_5','Below Average'), t('brain.health_6','Early Unhealthy'), t('brain.health_7','Unhealthy'), t('brain.health_8','Very Unhealthy'), t('brain.health_9','Critical')];

    let currentStage = 0;
    let currentQuestion = 0;
    let answers = [];
    let stage1Result = null;

    async function init() {
        const container = document.getElementById('brain-content');
        if (!container) return;
        if (!currentUser) {
            container.innerHTML = `<p style="text-align:center;padding:2rem;color:var(--accent);">${t('brain.login_required','Login is required')}</p>`;
            return;
        }

        // Check existing results
        let latestResult = null;
        try {
            const snap = await db.collection('users').doc(currentUser.uid)
                .collection('brain_results').orderBy('createdAt', 'desc').limit(1).get();
            if (!snap.empty) latestResult = { id: snap.docs[0].id, ...snap.docs[0].data() };
        } catch (e) { console.warn(e.message); }

        container.innerHTML = `
            <div style="text-align:center;margin-bottom:2rem;">
                <div style="font-size:3rem;margin-bottom:0.5rem;">🧠</div>
                <h3 style="margin:0;">${t('brain.title','A Journey to Discover Yourself')}</h3>
                <p style="font-size:0.85rem;color:var(--accent);margin-top:0.5rem;">${t('brain.subtitle','Discover the real you through a 3-stage assessment')}</p>
            </div>

            <!-- 3 Stage Cards -->
            <div style="display:grid;gap:0.8rem;margin-bottom:1.5rem;">
                <div onclick="BRAIN.startStage(1)" style="background:linear-gradient(135deg,#8B6914,#6B5744);padding:1.2rem;border-radius:12px;color:#FFF8F0;cursor:pointer;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <div style="font-size:0.7rem;opacity:0.8;">STAGE 1</div>
                            <div style="font-size:1.1rem;font-weight:700;">${t('brain.stage1_title','4 Temperament Assessment')}</div>
                            <div style="font-size:0.75rem;opacity:0.8;margin-top:0.2rem;">${t('brain.stage1_colors','Blue · Yellow · Red · Green')}</div>
                        </div>
                        <div style="font-size:2rem;">🎨</div>
                    </div>
                </div>

                <div onclick="BRAIN.startStage(2)" style="background:linear-gradient(135deg,#8B6914,#6B5744);padding:1.2rem;border-radius:12px;color:#FFF8F0;cursor:pointer;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <div style="font-size:0.7rem;opacity:0.8;">STAGE 2</div>
                            <div style="font-size:1.1rem;font-weight:700;">${t('brain.stage2_title','243 Personality Types')}</div>
                            <div style="font-size:0.75rem;opacity:0.8;margin-top:0.2rem;">${t('brain.stage2_desc','Enneagram 9 types × 3 instincts × 9 states')}</div>
                        </div>
                        <div style="font-size:2rem;">🔮</div>
                    </div>
                </div>

                <div onclick="BRAIN.startStage(3)" style="background:linear-gradient(135deg,#8B6914,#6B5744);padding:1.2rem;border-radius:12px;color:#FFF8F0;cursor:pointer;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <div style="font-size:0.7rem;opacity:0.8;">STAGE 3</div>
                            <div style="font-size:1.1rem;font-weight:700;">${t('brain.stage3_title','BrainOS 8,192 Types')}</div>
                            <div style="font-size:0.75rem;opacity:0.8;margin-top:0.2rem;">${t('brain.stage3_desc','CEO Ahn Jin-hoon\'s Brain Diagnosis System')}</div>
                        </div>
                        <div style="font-size:2rem;">🧬</div>
                    </div>
                </div>
            </div>

            <!-- Latest Result -->
            <div id="brain-latest" style="background:var(--card-bg,#F7F3ED);border-radius:12px;padding:1.2rem;">
                <h3 style="margin:0 0 0.8rem 0;font-size:1rem;">${t('brain.my_results','My Assessment Results')}</h3>
                <div id="brain-result-content">
                    ${latestResult ? renderResult(latestResult) : `<p style="text-align:center;color:var(--accent);font-size:0.85rem;padding:1rem;">${t('brain.no_results','No assessment results yet.<br>Select a stage above to get started!')}</p>`}
                </div>
            </div>

            <!-- Crowny Knowledge Library -->
            <div style="background:var(--card-bg,#F7F3ED);border-radius:12px;padding:1.2rem;margin-top:1rem;">
                <h3 style="margin:0 0 0.8rem 0;font-size:1rem;">📚 ${t('brain.library_title','Crowny Knowledge Library')}</h3>
                <div style="display:grid;gap:0.5rem;">
                    <div onclick="showPage('books')" style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem;background:var(--bg);border-radius:10px;cursor:pointer;">
                        <span style="font-size:1.5rem;">📖</span>
                        <div><div style="font-weight:600;font-size:0.9rem;">${t('brain.books_title','Crowny Books')}</div><div style="font-size:0.75rem;color:var(--accent);">${t('brain.books_desc','Multilingual books · Translation contributions · Knowledge sharing')}</div></div>
                    </div>
                    <div onclick="showPage('ai-assistant')" style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem;background:var(--bg);border-radius:10px;cursor:pointer;">
                        <span style="font-size:1.5rem;">👑</span>
                        <div><div style="font-weight:600;font-size:0.9rem;">${t('brain.panel_title','Crowny Panel')}</div><div style="font-size:0.75rem;color:var(--accent);">${t('brain.panel_desc','Ask 5 AI mentors')}</div></div>
                    </div>
                    <div onclick="showPage('prop-trading')" style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem;background:var(--bg);border-radius:10px;cursor:pointer;">
                        <span style="font-size:1.5rem;"><i data-lucide="trending-up"></i></span>
                        <div><div style="font-weight:600;font-size:0.9rem;">${t('brain.trading_title','Trading Game')}</div><div style="font-size:0.75rem;color:var(--accent);">${t('brain.trading_desc','Practical investment learning · Mock trading')}</div></div>
                    </div>
                </div>
            </div>
        `;
    }

    function startStage(stage) {
        if (stage === 3) {
            showToast(t('brain.stage3_coming_soon','🧬 BrainOS 8,192-type assessment is coming soon. (CEO Ahn Jin-hoon system integration planned)'), 'info');
            return;
        }
        currentStage = stage;
        currentQuestion = 0;
        answers = [];

        if (stage === 1) showQuestion();
        if (stage === 2) startStage2();
    }

    // ── Stage 1 Progress ──
    function showQuestion() {
        const container = document.getElementById('brain-content');
        const q = STAGE1_QUESTIONS[currentQuestion];
        const progress = ((currentQuestion + 1) / STAGE1_QUESTIONS.length * 100).toFixed(0);

        container.innerHTML = `
            <div style="margin-bottom:1rem;">
                <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--accent);margin-bottom:0.5rem;">
                    <span>${t('brain.stage1_header','STAGE 1 — 4 Temperaments')}</span>
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
            <button onclick="BRAIN.init()" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:0.8rem;">${t('brain.go_back','← Go back')}</button>
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
        // Tally
        const counts = { blue: 0, yellow: 0, red: 0, green: 0 };
        answers.forEach(a => counts[a]++);
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const primary = sorted[0][0];
        const secondary = sorted[1][0];
        stage1Result = { primary, secondary, counts };

        const temp = TEMPERAMENTS[primary];

        // Save
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
                <div style="font-size:4rem;margin-bottom:0.5rem;">${primary === 'blue' ? '<span style="color:var(--info)">●</span>' : primary === 'yellow' ? '<span style="color:#C4841D">●</span>' : primary === 'red' ? '<span style="color:var(--error)">●</span>' : '<span style="color:#5A9A6E">●</span>'}</div>
                <h2 style="margin:0;">${t('brain.you_are','You are')} ${temp.name}!</h2>
                <p style="font-size:0.85rem;color:var(--accent);margin-top:0.5rem;">${temp.desc}</p>
            </div>

            <div style="background:${temp.gradient};border-radius:12px;padding:1.2rem;color:#FFF8F0;margin-bottom:1rem;">
                <div style="font-size:0.8rem;opacity:0.8;margin-bottom:0.5rem;">${t('brain.temperament_distribution','Temperament Distribution')}</div>
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
                <h4 style="margin:0 0 0.5rem 0;">${t('brain.strengths','Strengths')}</h4>
                <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
                    ${temp.strengths.map(s => `<span style="background:#f0f0ff;padding:0.3rem 0.7rem;border-radius:20px;font-size:0.8rem;">${s}</span>`).join('')}
                </div>
                <h4 style="margin:1rem 0 0.5rem 0;">${t('brain.growth_point','Growth Point')}</h4>
                <p style="font-size:0.85rem;color:var(--accent);">${temp.growth}</p>
                <h4 style="margin:1rem 0 0.5rem 0;"><i data-lucide="handshake" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('brain.related_traits','Related Traits')}</h4>
                <p style="font-size:0.85rem;">${temp.traits.join(', ')}</p>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
                <button onclick="BRAIN.startStage(2)" style="padding:0.8rem;border:none;border-radius:10px;background:linear-gradient(135deg,#8B6914,#6B5744);color:#FFF8F0;font-weight:700;cursor:pointer;">🔮 ${t('brain.proceed_stage2','Proceed to Stage 2')}</button>
                <button onclick="BRAIN.init()" style="padding:0.8rem;border:none;border-radius:10px;background:var(--card-bg,#F7F3ED);border:1px solid #E8E0D8;cursor:pointer;font-weight:600;">${t('brain.go_back','← Go back')}</button>
            </div>
        `;
    }

    // ── Stage 2: Enneagram (AI-based) ──
    async function startStage2() {
        const container = document.getElementById('brain-content');
        container.innerHTML = `
            <div style="text-align:center;padding:2rem;">
                <div style="font-size:3rem;margin-bottom:1rem;">🔮</div>
                <h3>${t('brain.stage2_header','STAGE 2 — 243 Personality Types')}</h3>
                <p style="font-size:0.85rem;color:var(--accent);margin:1rem 0;">${t('brain.stage2_intro','CrownyGirl will diagnose your Enneagram type through conversation.')}</p>
                <p style="font-size:0.8rem;color:var(--accent);">${t('brain.stage2_formula','9 types × 3 instincts × 9 health states = <strong>243 types</strong>')}</p>
                <button onclick="BRAIN.startAIEnneagram()"
                    style="margin-top:1.5rem;padding:1rem 2rem;border:none;border-radius:12px;background:linear-gradient(135deg,#8B6914,#6B5744);color:#FFF8F0;font-weight:700;cursor:pointer;font-size:1rem;">
                    <i data-lucide="sparkles" style="width:14px;height:14px;display:inline;"></i> ${t('brain.start_chat','Start conversation with CrownyGirl')}
                </button>
                <br>
                <button onclick="BRAIN.init()" style="margin-top:1rem;background:none;border:none;color:var(--accent);cursor:pointer;">${t('brain.go_back','← Go back')}</button>
            </div>
        `;
    }

    async function startAIEnneagram() {
        const container = document.getElementById('brain-content');
        container.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <h3 style="margin:0;font-size:1rem;">🔮 ${t('brain.enneagram_chat_title','CrownyGirl Enneagram Assessment')}</h3>
                <button onclick="BRAIN.init()" style="background:none;border:none;cursor:pointer;font-size:1.2rem;">✕</button>
            </div>
            <div id="brain-chat" style="background:var(--bg);border-radius:12px;padding:1rem;height:50vh;overflow-y:auto;margin-bottom:1rem;">
                <div style="background:#F7F3ED;padding:0.8rem;border-radius:10px;margin-bottom:0.5rem;font-size:0.85rem;">
                    <i data-lucide="sparkles" style="width:14px;height:14px;display:inline;"></i> ${t('brain.chat_greeting','Hello! I\'m CrownyGirl~ I\'ll ask you a few questions now. Feel free to answer!')} 💕
                </div>
            </div>
            <div style="display:flex;gap:0.5rem;">
                <input type="text" id="brain-input" placeholder="${t('brain.chat_placeholder','Type your answer...')}"
                    style="flex:1;padding:0.8rem;border:2px solid var(--border,#e0e0e0);border-radius:10px;font-size:16px;"
                    onkeydown="if(event.key==='Enter')BRAIN.sendChat()">
                <button onclick="BRAIN.sendChat()" style="padding:0.8rem 1.2rem;border:none;border-radius:10px;background:linear-gradient(135deg,#8B6914,#6B5744);color:#FFF8F0;font-weight:700;cursor:pointer;">➤</button>
            </div>
        `;
        // AI first question
        setTimeout(() => addBotMessage(t('brain.chat_first_q','Alright, let me start! 😊 Do you feel more comfortable spending time alone or with people?')), 1000);
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

        // After 8 conversations, derive result
        if (chatCount >= 8) {
            addBotMessage(t('brain.chat_analyzing','💕 We\'ve talked enough! Analyzing now... ✨'));
            await analyzeEnneagram();
            return;
        }

        // AI next question
        try {
            const prompt = `당신은 크라우니걸(23세, 밝고 친근). 애니어그램 성격 진단 인터뷰 중.
대화 기록: ${chatHistory.map(h => `${h.role}: ${h.text}`).join('\n')}

다음 질문을 하나만 하세요 (짧고 친근하게, 이모지 포함). ${chatCount}/8번째 질문입니다.
애니어그램 9유형, 3본능(자기보존/사회적/일대일), 건강 수준을 파악하기 위한 질문이어야 합니다.`;

            const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
            const res = await fetch('/api/ai/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.8, maxOutputTokens: 150 }
                })
            });
            const data = await res.json();
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || t('brain.chat_fallback_q','Here\'s the next question! When were you happiest? 😊');
            chatHistory.push({ role: 'bot', text: reply });
            addBotMessage(reply);
        } catch (e) {
            addBotMessage(t('brain.chat_error','Hmm... there was a little issue 😅 Please answer again!'));
        }
    }

    async function analyzeEnneagram() {
        try {
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

            const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
            const res = await fetch('/api/ai/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
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
                result = { type: 9, wing: 1, instinct: 'SP', healthLevel: 4, code: '9w1 SP lv4', summary: t('brain.analysis_complete','Analysis complete!'), strengths: [t('brain.fallback_str1','Peace'), t('brain.fallback_str2','Harmony'), t('brain.fallback_str3','Patience')], growth: t('brain.fallback_growth','Try to express yourself more') };
            }

            const etype = ENNEAGRAM_TYPES[result.type - 1] || ENNEAGRAM_TYPES[8];

            // Save
            await db.collection('users').doc(currentUser.uid)
                .collection('brain_results').add({
                    stage: 2,
                    ...result,
                    typeName: etype.name,
                    chatHistory,
                    createdAt: new Date()
                });

            addBotMessage(`${t('brain.analysis_done','Analysis complete!')} ${t('brain.you_are','You are')} <strong>${result.code}</strong> — ${etype.name}!\n\n${result.summary}\n\n${t('brain.strengths','Strengths')}: ${(result.strengths || []).join(', ')}\n${result.growth}`);

        } catch (e) {
            addBotMessage(t('brain.analysis_error','😅 An error occurred during analysis. Please try again!'));
        }
    }

    function renderResult(result) {
        if (result.stage === 1) {
            const temp = TEMPERAMENTS[result.primary];
            return `<div style="display:flex;align-items:center;gap:1rem;">
                <div style="font-size:2.5rem;">${result.primary === 'blue' ? '<span style="color:var(--info)">●</span>' : result.primary === 'yellow' ? '<span style="color:#C4841D">●</span>' : result.primary === 'red' ? '<span style="color:var(--error)">●</span>' : '<span style="color:#5A9A6E">●</span>'}</div>
                <div><div style="font-weight:700;">${temp?.name || result.primary}</div><div style="font-size:0.8rem;color:var(--accent);">${temp?.desc?.substring(0, 50) || ''}...</div></div>
            </div>`;
        }
        if (result.stage === 2) {
            return `<div style="display:flex;align-items:center;gap:1rem;">
                <div style="font-size:2.5rem;">🔮</div>
                <div><div style="font-weight:700;">${result.code || ''} — ${result.typeName || ''}</div><div style="font-size:0.8rem;color:var(--accent);">${result.summary?.substring(0, 60) || ''}...</div></div>
            </div>`;
        }
        return `<p>${t('brain.has_results','You have results. Try the assessment again!')}</p>`;
    }

    return { init, startStage, answer, sendChat, startAIEnneagram };
})();
