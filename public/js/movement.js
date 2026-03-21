// ===== movement.js - CrownyMovement: Body Beauty 3-Stage 500-Session Process (v1.0) =====

const MOVEMENT = (() => {
    const STAGES = [
        {
            id: 'precision',
            name: t('movement.stage_precision','Precision Movement'),
            emoji: '<i data-lucide="target"></i>',
            color: '#8B6914',
            gradient: 'linear-gradient(135deg,#8B6914,#F0C060)',
            subtitle: 'Precision Movement',
            desc: t('movement.stage_precision_desc','A stage where muscles come alive through precise touch'),
            detail: t('movement.stage_precision_detail','Precise touch and movement to awaken micro-muscles. Recognize and activate muscles you don\'t normally use.'),
            sessions: 167, // 500 / 3
            exercises: [
                { name: t('movement.ex_micro_touch','Micro Touch Warm-up'), duration: t('movement.dur_5min','5 min'), desc: t('movement.ex_micro_touch_desc','Awaken micro-muscles of face, neck, and shoulders with fingertips') },
                { name: t('movement.ex_fine_motor','Fine Motor Control'), duration: t('movement.dur_10min','10 min'), desc: t('movement.ex_fine_motor_desc','Precise movement training for fingers and toes') },
                { name: t('movement.ex_body_scan','Body Scanning'), duration: t('movement.dur_8min','8 min'), desc: t('movement.ex_body_scan_desc','Relax while recognizing each body part from head to toe') },
                { name: t('movement.ex_balance_touch','Balance Touch'), duration: t('movement.dur_7min','7 min'), desc: t('movement.ex_balance_touch_desc','Gentle touch movements to balance left and right sides') },
                { name: t('movement.ex_breath_stretch','Breath-Linked Stretching'), duration: t('movement.dur_10min','10 min'), desc: t('movement.ex_breath_stretch_desc','Precisely loosen each joint in sync with breathing') },
                { name: t('movement.ex_facial','Facial Movement'), duration: t('movement.dur_5min','5 min'), desc: t('movement.ex_facial_desc','Exercise 60+ individual facial muscles') },
                { name: t('movement.ex_fingertip','Fingertip Release'), duration: t('movement.dur_5min','5 min'), desc: t('movement.ex_fingertip_desc','Full-body tension release starting from fingertips') }
            ]
        },
        {
            id: 'active',
            name: t('movement.stage_active','Active Movement'),
            emoji: '<i data-lucide="flame"></i>',
            color: '#8B6914',
            gradient: 'linear-gradient(135deg,#8B6914,#6B5744)',
            subtitle: 'Active Movement',
            desc: t('movement.stage_active_desc','Active movement that raises the central axis from lower abdomen to solar plexus'),
            detail: t('movement.stage_active_detail','Activate energy flow by raising the core axis from the lower abdomen (dantian) to the solar plexus.'),
            sessions: 167,
            exercises: [
                { name: t('movement.ex_core_act','Core Activation'), duration: t('movement.dur_8min','8 min'), desc: t('movement.ex_core_act_desc','Movements to awaken deep lower abdominal muscles') },
                { name: t('movement.ex_energy_rise','Energy Rising'), duration: t('movement.dur_10min','10 min'), desc: t('movement.ex_energy_rise_desc','Breathing + movement to raise energy from dantian to solar plexus') },
                { name: t('movement.ex_dynamic_flow','Dynamic Flow'), duration: t('movement.dur_12min','12 min'), desc: t('movement.ex_dynamic_flow_desc','Strengthen central axis with fluid full-body movements') },
                { name: t('movement.ex_power_breath','Power Breathing'), duration: t('movement.dur_7min','7 min'), desc: t('movement.ex_power_breath_desc','Abdominal strengthening with powerful breathing') },
                { name: t('movement.ex_spine_wave','Spine Wave'), duration: t('movement.dur_8min','8 min'), desc: t('movement.ex_spine_wave_desc','Move spine in wave-like motion for flexibility') },
                { name: t('movement.ex_hip_opener','Hip Opener'), duration: t('movement.dur_10min','10 min'), desc: t('movement.ex_hip_opener_desc','Open pelvis and hip joints to improve energy flow') },
                { name: t('movement.ex_active_balance','Active Balance'), duration: t('movement.dur_10min','10 min'), desc: t('movement.ex_active_balance_desc','Active balance training including single-leg stands and dynamic balance') }
            ]
        },
        {
            id: 'core',
            name: t('movement.stage_core','Core Movement'),
            emoji: '<i data-lucide="gem"></i>',
            color: '#8B6914',
            gradient: 'linear-gradient(135deg,#8B6914,#6B5744)',
            subtitle: 'Core Movement',
            desc: t('movement.stage_core_desc','Training movement that fills the deepest parts of the body with energy'),
            detail: t('movement.stage_core_detail','Activate the deepest muscles and energy systems to create overflowing vitality and beauty from within.'),
            sessions: 166,
            exercises: [
                { name: t('movement.ex_deep_core','Deep Core Ignition'), duration: t('movement.dur_10min','10 min'), desc: t('movement.ex_deep_core_desc','Activate the deepest transverse abdominal and multifidus muscles') },
                { name: t('movement.ex_energy_circuit','Energy Circuit'), duration: t('movement.dur_15min','15 min'), desc: t('movement.ex_energy_circuit_desc','Intensive full-body energy circulation training') },
                { name: t('movement.ex_power_plank','Power Plank Series'), duration: t('movement.dur_10min','10 min'), desc: t('movement.ex_power_plank_desc','Maximize core with various plank variations') },
                { name: t('movement.ex_internal_force','Internal Force'), duration: t('movement.dur_12min','12 min'), desc: t('movement.ex_internal_force_desc','Advanced movements to maximize internal strength') },
                { name: t('movement.ex_breath_fire','Breath of Fire'), duration: t('movement.dur_8min','8 min'), desc: t('movement.ex_breath_fire_desc','Powerful breathing technique to ignite inner energy') },
                { name: t('movement.ex_fullbody_int','Full Body Integration'), duration: t('movement.dur_15min','15 min'), desc: t('movement.ex_fullbody_int_desc','Integration training connecting all muscle chains as one') },
                { name: t('movement.ex_recovery_med','Recovery Meditation'), duration: t('movement.dur_10min','10 min'), desc: t('movement.ex_recovery_med_desc','Deep relaxation and energy stabilization after training') }
            ]
        }
    ];

    let userProgress = null;

    async function init() {
        const container = document.getElementById('movement-content');
        if (!container) return;
        if (!currentUser) {
            container.innerHTML = `<p style="text-align:center;padding:2rem;color:var(--accent);">${t('movement.login_required','Login is required')}</p>`;
            return;
        }

        // Load progress
        try {
            const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
            const res = await fetch(`/api/db/users/${currentUser.uid}/movement_progress/current`, {
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
            });
            const doc = await res.json();
            userProgress = doc.exists ? doc.data : { totalSessions: 0, stage: 'precision', stageSession: 0, lastSessionDate: null, streak: 0 };
        } catch (e) {
            userProgress = { totalSessions: 0, stage: 'precision', stageSession: 0, lastSessionDate: null, streak: 0 };
        }

        const totalPercent = (userProgress.totalSessions / 500 * 100).toFixed(1);
        const currentStageObj = STAGES.find(s => s.id === userProgress.stage) || STAGES[0];
        const stagePercent = (userProgress.stageSession / currentStageObj.sessions * 100).toFixed(0);

        container.innerHTML = `
            <!-- Overall Progress -->
            <div style="background:linear-gradient(135deg,#3D2B1F,#6B5744);border-radius:16px;padding:1.5rem;color:#FFF8F0;margin-bottom:1.5rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem;">
                    <div>
                        <div style="font-size:0.75rem;opacity:0.7;">${t('movement.process_500','500-Session Process')}</div>
                        <div style="font-size:2rem;font-weight:800;">${userProgress.totalSessions} <span style="font-size:1rem;opacity:0.7;">/ 500</span></div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:0.75rem;opacity:0.7;">${t('movement.streak','Streak')}</div>
                        <div style="font-size:1.5rem;font-weight:700;"><i data-lucide="flame" style="width:16px;height:16px;display:inline;"></i> ${userProgress.streak || 0}${t('movement.days','days')}</div>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.2);border-radius:10px;height:10px;overflow:hidden;">
                    <div style="background:linear-gradient(90deg,#8B6914,#F0C060,#6B5744);height:100%;width:${totalPercent}%;border-radius:10px;transition:width 0.5s;"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:0.7rem;opacity:0.7;margin-top:0.3rem;">
                    <span><i data-lucide="target"></i> ${t('movement.label_precision','Precision')}</span><span><i data-lucide="flame"></i> ${t('movement.label_active','Active')}</span><span><i data-lucide="gem"></i> ${t('movement.label_core','Core')}</span>
                </div>
            </div>

            <!-- Current Stage -->
            <div style="background:${currentStageObj.gradient};border-radius:16px;padding:1.5rem;color:#FFF8F0;margin-bottom:1.5rem;">
                <div style="font-size:0.7rem;opacity:0.8;">${t('movement.current_stage','Current Stage')}</div>
                <h3 style="margin:0.3rem 0;">${currentStageObj.emoji} ${currentStageObj.name}</h3>
                <p style="font-size:0.8rem;opacity:0.9;margin-bottom:1rem;">${currentStageObj.desc}</p>
                <div style="background:rgba(255,255,255,0.2);border-radius:8px;height:8px;margin-bottom:0.5rem;">
                    <div style="background:#FFF8F0;height:100%;width:${stagePercent}%;border-radius:8px;"></div>
                </div>
                <div style="font-size:0.75rem;opacity:0.8;">${userProgress.stageSession} / ${currentStageObj.sessions}${t('movement.sessions_done',' sessions completed')}</div>
            </div>

            <!-- Start Today's Session -->
            <button onclick="MOVEMENT.startSession()"
                style="width:100%;padding:1.2rem;border:none;border-radius:12px;background:linear-gradient(135deg,#8B6914,#6B5744);color:#FFF8F0;font-weight:700;font-size:1.1rem;cursor:pointer;margin-bottom:1.5rem;box-shadow:0 4px 15px rgba(139,105,20,0.3);">
                <i data-lucide="play"></i> ${t('movement.start_today','Start Today\'s Movement')}
            </button>

            <!-- 3-Stage Introduction -->
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
                            <div style="font-size:0.8rem;color:${s.color};font-weight:700;">${s.sessions}${t('movement.sessions_count',' sessions')}</div>
                        </div>
                        <p style="font-size:0.8rem;color:var(--accent);margin-top:0.5rem;">${s.detail}</p>
                    </div>`;
                }).join('')}
            </div>

            <!-- Session History -->
            <div style="background:var(--card-bg,#F7F3ED);border-radius:12px;padding:1.2rem;">
                <h3 style="margin:0 0 0.8rem 0;font-size:1rem;">${t('movement.recent_history','Recent History')}</h3>
                <div id="movement-history"><p style="text-align:center;color:var(--accent);font-size:0.85rem;">${t('movement.loading','Loading...')}</p></div>
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
                <div style="font-size:0.7rem;opacity:0.8;">${stage.name} — ${t('movement.session_number','Session #')}${userProgress.totalSessions + 1}</div>
                <h2 style="margin:0.5rem 0;">${exercise.name}</h2>
                <p style="opacity:0.9;font-size:0.85rem;">${exercise.desc}</p>
                <div style="margin-top:1rem;font-size:0.9rem;">${exercise.duration}</div>
            </div>

            <!-- Timer -->
            <div style="text-align:center;background:var(--card-bg,#F7F3ED);border-radius:16px;padding:2rem;margin-bottom:1rem;">
                <div id="movement-timer" style="font-size:3rem;font-weight:800;font-family:monospace;">00:00</div>
                <p id="movement-status" style="font-size:0.9rem;color:var(--accent);margin-top:0.5rem;">${t('movement.ready','Are you ready?')}</p>
                <div style="display:flex;justify-content:center;gap:1rem;margin-top:1.5rem;">
                    <button id="movement-start-btn" onclick="MOVEMENT.toggleTimer()"
                        style="padding:0.8rem 2rem;border:none;border-radius:10px;background:linear-gradient(135deg,#8B6914,#6B5744);color:#FFF8F0;font-weight:700;cursor:pointer;font-size:1rem;">
                        <i data-lucide="play"></i> ${t('movement.start','Start')}
                    </button>
                    <button onclick="MOVEMENT.completeSession()"
                        style="padding:0.8rem 2rem;border:none;border-radius:10px;background:linear-gradient(135deg,#8B6914,#6B5744);color:#FFF8F0;font-weight:700;cursor:pointer;font-size:1rem;">
                        <i data-lucide="check-circle"></i> ${t('movement.complete','Complete')}
                    </button>
                </div>
            </div>

            <!-- Exercise List -->
            <div style="background:var(--card-bg,#F7F3ED);border-radius:12px;padding:1rem;">
                <h4 style="margin:0 0 0.5rem 0;font-size:0.9rem;">${t('movement.exercise_list','Exercise List')} — ${stage.name}</h4>
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

            <button onclick="MOVEMENT.init()" style="width:100%;margin-top:1rem;padding:0.8rem;background:none;border:1px solid #E8E0D8;border-radius:10px;cursor:pointer;"><i data-lucide="arrow-left"></i> ${t('movement.go_back','Go Back')}</button>
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
            if (btn) btn.textContent = t('movement.resume','Resume');
            if (status) status.textContent = t('movement.paused','Paused');
        } else {
            timerRunning = true;
            if (btn) btn.textContent = t('movement.pause','Pause');
            if (status) status.textContent = t('movement.exercising','Exercising...');
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

        // Check next stage
        if (userProgress.stageSession >= stage.sessions) {
            const stageIdx = STAGES.findIndex(s => s.id === userProgress.stage);
            if (stageIdx < STAGES.length - 1) {
                userProgress.stage = STAGES[stageIdx + 1].id;
                userProgress.stageSession = 0;
                showToast(t('movement.stage_complete',`${stage.name} complete! Moving to the next stage!`), 'success');
            }
        }

        // Calculate streak
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

        // Save
        try {
            const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
            const _h = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
            await fetch(`/api/db/users/${currentUser.uid}/movement_progress/current`, {
                method: 'PUT',
                headers: _h,
                body: JSON.stringify({ ...userProgress, _merge: false })
            });

            await fetch(`/api/db/users/${currentUser.uid}/movement_log`, {
                method: 'POST',
                headers: _h,
                body: JSON.stringify({
                    stage: stage.id,
                    sessionNumber: userProgress.totalSessions,
                    duration: timerSeconds,
                    createdAt: new Date().toISOString()
                })
            });
        } catch (e) {
            console.error('[Movement] Save failed:', e);
        }

        timerSeconds = 0;
        showToast(t('movement.session_done',`${userProgress.totalSessions}/500 session complete!`) + ` <i data-lucide="flame" style="width:14px;height:14px;display:inline;"></i> ${userProgress.streak}${t('movement.days_streak',' days streak')}`, 'success');

        // CrownyGirl AI encouragement (every 10 sessions)
        if (userProgress.totalSessions % 10 === 0) {
            try {
                const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
                const geminiRes = await fetch('/api/ai/gemini', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ contents:[{parts:[{text:`As CrownyGirl (bright and friendly, age 23), write a 1-2 line encouragement message for a user who completed ${userProgress.totalSessions} movement sessions. Include emojis. Text only.`}]}], generationConfig:{temperature:0.9,maxOutputTokens:100} })
                });
                const data = await geminiRes.json();
                const msg = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                if (msg) showToast(`${msg}`, 'success');
            } catch(e){ console.warn(e.message); }
        }

        init();
    }

    async function loadHistory() {
        const container = document.getElementById('movement-history');
        if (!container || !currentUser) return;

        try {
            const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
            const res = await fetch(`/api/db/users/${currentUser.uid}/movement_log?orderBy=createdAt&orderDir=desc&limit=10`, {
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
            });
            const snap = await res.json();

            if (snap.empty) {
                container.innerHTML = `<p style="text-align:center;color:var(--accent);font-size:0.85rem;">${t('movement.no_history','No records yet. Start your first session!')}</p>`;
                return;
            }

            container.innerHTML = snap.docs.map(doc => {
                const d = doc.data;
                const date = d.createdAt ? new Date(d.createdAt).toLocaleDateString('ko-KR') : '';
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
                        <div style="font-size:0.8rem;color:${stage.color};font-weight:600;">${mins}${t('movement.min','min')} ${secs}${t('movement.sec','sec')}</div>
                    </div>`;
            }).join('');
        } catch (e) {
            container.innerHTML = `<p style="color:red;font-size:0.8rem;">${t('movement.load_failed','Load failed')}</p>`;
        }
    }

    return { init, startSession, toggleTimer, completeSession };
})();
