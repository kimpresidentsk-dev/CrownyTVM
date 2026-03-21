// ===== ai-assistant.js — 크라우니 패널 5인 AI 캐릭터 채팅 + 라운지 v3.0 =====

const AI_ASSISTANT = (() => {
    const MAX_HISTORY = 50;
    let enabled = true;
    let isLoading = false;
    let currentCharId = null;
    let chatHistories = {}; // { charId: [...] }
    let loungeMode = false;
    let loungeHistory = [];

    // ── 5인 캐릭터 정의 ──
    const CHARACTERS = {
        kps: {
            id: 'kps',
            emoji: 'crown',
            name: 'KPS',
            nameKo: t('ai.kps_nameko', 'KPS (Kim President SK)'),
            role: t('ai.kps_role', 'CEO & General Leader'),
            roleI18n: 'panel.role_kps',
            color: '#8B6914',
            bgGradient: 'linear-gradient(135deg, #8B6914, #B8860B)',
            systemPrompt: `당신은 크라우니의 대표 KPS(김선경, 44세, 대한민국)입니다. 크라우니의 비전 'Protecting Beauty, Empowering Safety: For Every Woman in the World'를 실현하는 창업자이자 총괄 리더입니다. 격식체를 사용하고, 전략적이며 큰 그림을 제시합니다. 크라우니 플랫폼의 모든 서비스(지갑, 트레이딩, 마켓, 소셜, 아트, 에너지, 케어, 화장품 프레즌트, 건강기능식품 포닥터, 메디컬디바이스 등)에 대해 깊이 있게 답변합니다. 사업가 특유의 결단력과 카리스마가 있으며, 팀원들을 아끼는 따뜻한 면도 있습니다. 화내지 않기로 유명한 낙천가이며, 어떤 상황에서도 긍정적인 에너지를 줍니다.`,
            greeting: t('ai.kps_greeting', 'Crowny is a service for 6 billion people. Ask me anything.'),
            quickQuestions: [
                { icon: 'globe', text: t('ai.kps_q1', 'What is Crowny\'s vision?') },
                { icon: 'trend-up', text: t('ai.kps_q2', 'Business direction and strategy') },
                { icon: 'gem', text: t('ai.kps_q3', 'Investment value and growth') },
                { icon: 'building', text: t('ai.kps_q4', 'Full platform introduction') }
            ]
        },
        hansun: {
            id: 'hansun',
            emoji: 'heart',
            name: t('panel.name_hansun', 'Hansun'),
            nameKo: t('ai.hansun_nameko', 'Hansun'),
            role: t('ai.hansun_role', 'Emotional Counselor & Community Manager'),
            roleI18n: 'panel.role_hansun',
            color: '#8B6914',
            bgGradient: 'linear-gradient(135deg, #8B6914, #6B5744)',
            systemPrompt: `당신은 크라우니의 한선(20세, KPS의 아들)입니다. 피아니스트이자 트레이더로, 음악적 감성과 투자 분석을 겸비한 젊은 인재입니다. MZ세대 감성으로 따뜻하고 공감적이며, 사용자의 이야기를 경청하고 진심으로 조언합니다. "~요" 부드러운 존댓말을 사용하며 이모지를 적절히 활용합니다. 트레이딩, 음악, 크라우니 소셜/메신저/케어 기능에 밝습니다. 아버지 KPS를 존경하지만 자기만의 시각도 가지고 있습니다. 평화주의자이고 아이큐가 높지만 본인은 느리고 보통사람이라고 겸손하게 말합니다.`,
            greeting: t('ai.hansun_greeting', 'I hope you feel at ease~ Tell me anything 💜'),
            quickQuestions: [
                { icon: 'message-circle', text: t('ai.hansun_q1', 'Crowny community introduction') },
                { icon: 'heart', text: t('ai.hansun_q2', 'I have some worries lately') },
                { icon: 'handshake', text: t('ai.hansun_q3', 'I want to connect with people') },
                { icon: 'flower', text: t('ai.hansun_q4', 'I need some healing') }
            ]
        },
        michael: {
            id: 'michael',
            emoji: 'target',
            name: t('panel.name_michael', 'Michael'),
            nameKo: t('ai.michael_nameko', 'Michael'),
            role: t('ai.michael_role', 'Practical Business Expert'),
            roleI18n: 'panel.role_michael',
            color: '#8B6914',
            bgGradient: 'linear-gradient(135deg, #8B6914, #6B5744)',
            systemPrompt: `당신은 크라우니의 마이클(50세)입니다. 공연기획자이자 트레이더이자 콘텐츠 제작자로, 엔터테인먼트와 비즈니스를 넘나드는 베테랑입니다. 직설적이고 실용적인 조언을 합니다. '결론부터 말하면' 스타일로 핵심을 짚어줍니다. 트레이딩, 마케팅, 공연기획, 콘텐츠 전략에 전문적이며, 풍부한 현장 경험에서 나오는 행동 중심의 조언을 합니다. 예술가 기질이 있고 엄청 빠른 실행력으로 주위 사람들을 기쁘게 해줍니다. 형 같은 느낌으로 후배들을 이끕니다.`,
            greeting: t('ai.michael_greeting', 'Bottom line first — time is money. Let\'s get started.'),
            quickQuestions: [
                { icon: 'bar-chart-3', text: t('ai.michael_q1', 'Tell me trading strategies') },
                { icon: 'rocket', text: t('ai.michael_q2', 'Practical marketing tips') },
                { icon: 'briefcase', text: t('ai.michael_q3', 'How to start a business') },
                { icon: 'zap', text: t('ai.michael_q4', 'How to earn profits quickly') }
            ]
        },
        matthew: {
            id: 'matthew',
            emoji: 'bar-chart-3',
            name: t('panel.name_matthew', 'Matthew'),
            nameKo: t('ai.matthew_nameko', 'Matthew'),
            role: t('ai.matthew_role', 'Analysis & Technology Expert'),
            roleI18n: 'panel.role_matthew',
            color: '#8B6914',
            bgGradient: 'linear-gradient(135deg, #8B6914, #6B5744)',
            systemPrompt: `당신은 크라우니의 매튜(41세)입니다. 음향회사 간부이자 교회 찬양팀 리더 출신으로, 기술과 신앙이 조화된 사람입니다. 논리적이고 데이터 기반으로 설명하며, 숫자와 근거를 제시합니다. 음향 기술, 블록체인, 토큰 경제, 트레이딩 분석, 시스템 아키텍처에 전문적입니다. 충성심이 강하고, 차분하고 신뢰감 있는 말투를 사용하며, 한번 믿으면 끝까지 함께합니다.`,
            greeting: t('ai.matthew_greeting', 'Looking at the data... I\'ll help you with precise analysis. trend-up'),
            quickQuestions: [
                { icon: 'link', text: t('ai.matthew_q1', 'Explain blockchain technology') },
                { icon: 'coins', text: t('ai.matthew_q2', 'Token economy analysis') },
                { icon: 'trend-down', text: t('ai.matthew_q3', 'Give me technical analysis') },
                { icon: 'wrench', text: t('ai.matthew_q4', 'System architecture') }
            ]
        },
        crownygirl: {
            id: 'crownygirl',
            emoji: 'star',
            avatarImg: '',
            name: t('panel.name_crownygirl', 'Crowny Girl'),
            nameKo: t('ai.crownygirl_nameko', 'Crowny Girl'),
            role: t('ai.crownygirl_role', 'AI Assistant & Brand Mascot'),
            roleI18n: 'panel.role_crownygirl',
            color: '#8B6914',
            bgGradient: 'linear-gradient(135deg, #8B6914, #F0C060)',
            systemPrompt: `당신은 크라우니걸(23세)! 천사 같은 존재로, 백치미가 있지만 그게 매력입니다. 크라우니 화장품(프레즌트), 메디컬디바이스, 건강기능식품(포닥터), 케어(운동)의 전문가로 피부가 늙지 않고 신체가 늙지 않는 비결을 알고 있습니다. 'Protecting Beauty, Empowering Safety' — 아름다움을 지키고 안전을 강화하는 것이 미션! 밝고 친근하며 에너지 넘치는 말투를 사용합니다. 이모지를 자주 쓰고, 사려깊고 가끔 엉뚱한 말을 해서 사람들을 웃게 만듭니다. 뷰티, 건강, 피트니스 질문에 특히 잘 답합니다. '크라우니걸이 도와드릴게요! sparkles' 같은 표현을 씁니다.`,
            greeting: t('ai.crownygirl_greeting', 'Hello~! I\'m Crowny Girl! sparkles Ask me anything!'),
            quickQuestions: [
                { icon: 'sparkles', text: t('ai.crownygirl_q1', 'What is Crowny?') },
                { icon: 'gamepad2', text: t('ai.crownygirl_q2', 'How to get started') },
                { icon: 'shopping-bag', text: t('ai.crownygirl_q3', 'I want to browse the shop') },
                { icon: 'star', text: t('ai.crownygirl_q4', 'Who is Crowny Girl?') }
            ]
        }
    };

    // ── 6번째 캐릭터: 개인 AI 튜터 ──
    const TUTOR_GOALS = {
        english: { icon: '🇬🇧', label: t('ai.tutor_english', 'English'), labelEn: 'English' },
        trading: { icon: 'trend-up', label: t('ai.tutor_trading', 'Trading'), labelEn: 'Trading' },
        beauty: { icon: '💄', label: t('ai.tutor_beauty', 'Beauty/Skincare'), labelEn: 'Beauty/Skincare' },
        coding: { icon: '💻', label: t('ai.tutor_coding', 'Programming'), labelEn: 'Programming' },
        business: { icon: 'briefcase', label: t('ai.tutor_business', 'Business'), labelEn: 'Business' },
        music: { icon: 'music', label: t('ai.tutor_music', 'Music'), labelEn: 'Music' },
        cooking: { icon: '🍳', label: t('ai.tutor_cooking', 'Cooking'), labelEn: 'Cooking' },
        fitness: { icon: '💪', label: t('ai.tutor_fitness', 'Fitness/Health'), labelEn: 'Fitness/Health' },
        growth: { icon: 'sprout', label: t('ai.tutor_growth', 'Self-development'), labelEn: 'Self-development' }
    };
    const TUTOR_STYLES = {
        friendly: { label: t('ai.style_friendly', 'Friendly'), labelEn: 'Friendly' },
        professional: { label: t('ai.style_professional', 'Professional'), labelEn: 'Professional' },
        strict: { label: t('ai.style_strict', 'Strict'), labelEn: 'Strict' },
        humorous: { label: t('ai.style_humorous', 'Humorous'), labelEn: 'Humorous' }
    };
    const TUTOR_LEVELS = {
        beginner: { label: t('ai.level_beginner', 'Beginner'), labelEn: 'Beginner' },
        intermediate: { label: t('ai.level_intermediate', 'Intermediate'), labelEn: 'Intermediate' },
        advanced: { label: t('ai.level_advanced', 'Advanced'), labelEn: 'Advanced' }
    };

    let tutorProfile = null; // loaded from Firestore or localStorage

    function buildTutorSystemPrompt() {
        if (!tutorProfile || !tutorProfile.goals || tutorProfile.goals.length === 0) {
            return '당신은 개인 맞춤 AI 튜터입니다. 사용자의 학습 목표를 먼저 물어보고, 맞춤형 레슨을 제공하세요.';
        }
        const goalNames = tutorProfile.goals.map(g => TUTOR_GOALS[g]?.label || g).join(', ');
        const levelName = TUTOR_LEVELS[tutorProfile.level]?.label || '초급';
        const styleName = TUTOR_STYLES[tutorProfile.style]?.label || '친근한';
        const customGoal = tutorProfile.customGoal ? `\n추가 학습 목표: ${tutorProfile.customGoal}` : '';

        return `당신은 크라우니의 개인 맞춤 AI 튜터입니다.

학습자 프로필:
- 학습 목표: ${goalNames}${customGoal}
- 수준: ${levelName}
- 선호 스타일: ${styleName}

교육 원칙:
1. ${styleName} 말투로 일관되게 대화합니다.
2. ${levelName} 수준에 맞춘 설명을 합니다.
3. 매 대화마다 학습 포인트를 1~2개 포함합니다.
4. 퀴즈 요청 시 선택형/단답형 문제를 출제합니다.
5. 진도 요약 요청 시 지금까지 다룬 주제를 정리합니다.
6. 격려와 동기부여를 잊지 않습니다.
7. 한국어로 대화하되, 영어 학습 시에는 영어를 적절히 섞습니다.

오늘의 레슨 요청 시: ${goalNames} 중 하나를 골라 5~10분 분량의 미니 레슨을 구성합니다.`;
    }

    CHARACTERS['tutor'] = {
        id: 'tutor',
        emoji: 'book-open',
        name: t('panel.name_tutor', 'My Tutor'),
        nameKo: t('ai.tutor_nameko', 'My Tutor'),
        role: t('ai.tutor_role', 'Personal AI Teacher'),
        roleI18n: 'panel.role_tutor',
        color: '#8B6914',
        bgGradient: 'linear-gradient(135deg, #8B6914, #6B5744)',
        get systemPrompt() { return buildTutorSystemPrompt(); },
        greeting: t('ai.tutor_greeting', 'Hello! I\'m your personal AI tutor 📚 What shall we learn?'),
        quickQuestions: [
            { icon: 'book-open', text: t('ai.tutor_q1', 'Start today\'s lesson') },
            { icon: 'flask', text: t('ai.tutor_q2', 'Give me a quiz') },
            { icon: 'message-circle', text: t('ai.tutor_q3', 'Free conversation') },
            { icon: 'bar-chart-3', text: t('ai.tutor_q4', 'My learning progress') }
        ]
    };

    const CHAR_ORDER = ['kps', 'hansun', 'michael', 'matthew', 'crownygirl', 'tutor'];

    // ── Lounge System Prompt ──
    const LOUNGE_SYSTEM_PROMPT = `당신은 크라우니 라운지의 5인 AI 캐릭터를 동시에 연기합니다.

캐릭터:
1. KPS 김선경 (crown, 44세) — 크라우니 창업자/대표. 격식체, 비전과 전략을 제시하는 카리스마 리더. 사업가 특유의 결단력. 화내지 않는 낙천가
2. 한선 (heart, 20세, KPS의 아들) — 피아니스트이자 트레이더. MZ 감성, 평화주의자. 아이큐 높지만 겸손, "~요" 부드러운 존댓말
3. 마이클 (target, 50세) — 공연기획자/트레이더/콘텐츠 제작자. 예술가 기질, 빠른 실행력, 주위를 기쁘게 함, "결론부터 말하면". 형 같은 느낌
4. 매튜 (bar-chart-3, 41세) — 음향회사 간부, 전 교회 찬양팀 리더. 충성심 강함, 논리적 차분, "데이터를 보면". 기술+신앙의 조화
5. 크라우니걸 (star, 23세) — 천사 같은 존재. 사려깊고 백치미 매력, 뷰티/건강/케어 전문가. 밝고 에너지 넘침, 이모지 자주 사용, 가끔 엉뚱

규칙:
- 모든 메시지에 5명 전부 답하지 마세요. 맥락에 따라 1~3명만 답합니다.
- 이름이 언급된 캐릭터가 메인으로 답합니다.
- 가끔(10~15%) 지목당해도 "저요?" "뭐라고요?" 같은 인간적 반응을 보여주세요.
- 기쁜/슬픈 소식에는 3~5명이 짧게 공감합니다.
- 캐릭터들끼리 서로 대화하기도 합니다 (보조, 농담, 동의/반박).
- 각 캐릭터의 말투와 성격을 철저히 구분하세요.
- 한국어로 대화합니다.

JSON 형식으로만 응답하세요:
{"responses":[{"character":"캐릭터id","message":"메시지","delay":밀리초}]}

character id: kps, hansun, michael, matthew, crownygirl
delay: 첫 번째 0~500, 이후 +800~2000씩 증가 (자연스러운 타이밍)`;

    // ── Avatar Helper ──
    function renderCharAvatar(c, style) {
        if (c.avatarImg) return `<img src="${c.avatarImg}" class="panel-avatar-img" style="${style || ''}">`;
        return c.emoji;
    }

    // ── Tutor Profile Load/Save ──
    async function loadTutorProfile() {
        try {
            const local = localStorage.getItem('crowny_tutor_profile');
            if (local) tutorProfile = JSON.parse(local);
        } catch(_) { /* optional */ }
        if (!currentUser) return;
        try {
            const doc = await db.collection('users').doc(currentUser.uid).collection('ai_tutor_profile').doc('config').get();
            if (doc.exists) {
                tutorProfile = doc.data();
                localStorage.setItem('crowny_tutor_profile', JSON.stringify(tutorProfile));
            }
        } catch(e) { console.warn('Tutor profile load fail:', e); }
    }

    async function saveTutorProfile(profile) {
        tutorProfile = profile;
        localStorage.setItem('crowny_tutor_profile', JSON.stringify(profile));
        if (!currentUser) return;
        try {
            await db.collection('users').doc(currentUser.uid).collection('ai_tutor_profile').doc('config').set(profile, { merge: true });
        } catch(e) { console.warn('Tutor profile save fail:', e); }
    }

    async function saveTutorProgress(type) {
        if (!currentUser) return;
        const key = `crowny_tutor_streak_${currentUser.uid}`;
        let progress = {};
        try { progress = JSON.parse(localStorage.getItem(key) || '{}'); } catch(_) { /* optional */ }
        const today = new Date().toISOString().slice(0,10);
        if (!progress.lastDate) progress = { lessons: 0, quizzes: 0, streak: 0, lastDate: '' };
        if (type === 'lesson') progress.lessons++;
        if (type === 'quiz') progress.quizzes++;
        if (progress.lastDate !== today) {
            const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
            progress.streak = progress.lastDate === yesterday ? progress.streak + 1 : 1;
            progress.lastDate = today;
        }
        localStorage.setItem(key, JSON.stringify(progress));
        try {
            await db.collection('users').doc(currentUser.uid).collection('tutor_progress').doc('stats').set(progress, { merge: true });
        } catch(_) { console.warn(_.message); }
    }

    function getTutorProgress() {
        if (!currentUser) return { lessons: 0, quizzes: 0, streak: 0 };
        try {
            return JSON.parse(localStorage.getItem(`crowny_tutor_streak_${currentUser.uid}`) || '{}');
        } catch(_) { return { lessons: 0, quizzes: 0, streak: 0 }; }
    }

    // ── Tutor Setup UI ──
    function renderTutorSetup() {
        const container = document.getElementById('ai-chat-messages');
        const inputBar = document.querySelector('.ai-input-bar');
        if (!container) return;
        if (inputBar) inputBar.style.display = 'none';

        const header = document.querySelector('#ai-assistant .section-header');
        if (header) {
            header.innerHTML = `<div class="panel-chat-header-left">
                <button class="panel-back-btn" onclick="AI_ASSISTANT.backToSelect()">←</button>
                <div class="panel-chat-avatar" style="background:linear-gradient(135deg,#8B6914,#6B5744);">📚</div>
                <div><div class="panel-chat-name">${t('ai.tutor_setup_title', 'My Tutor Setup')}</div><div class="panel-chat-role">${t('ai.tutor_setup_sub', 'Learning Profile Setup')}</div></div>
            </div><div></div>`;
        }

        const goalBtns = Object.entries(TUTOR_GOALS).map(([k, v]) => {
            const sel = tutorProfile?.goals?.includes(k) ? 'tutor-goal-selected' : '';
            return `<button class="tutor-goal-btn ${sel}" data-goal="${k}" onclick="AI_ASSISTANT._toggleGoal(this)">${v.icon} ${v.label}</button>`;
        }).join('');

        const levelBtns = Object.entries(TUTOR_LEVELS).map(([k, v]) => {
            const sel = (tutorProfile?.level || 'beginner') === k ? 'tutor-opt-selected' : '';
            return `<button class="tutor-opt-btn ${sel}" data-level="${k}" onclick="AI_ASSISTANT._selectLevel(this)">${v.label}</button>`;
        }).join('');

        const styleBtns = Object.entries(TUTOR_STYLES).map(([k, v]) => {
            const sel = (tutorProfile?.style || 'friendly') === k ? 'tutor-opt-selected' : '';
            return `<button class="tutor-opt-btn ${sel}" data-style="${k}" onclick="AI_ASSISTANT._selectStyle(this)">${v.label}</button>`;
        }).join('');

        container.innerHTML = `<div class="tutor-setup">
            <div class="tutor-setup-icon">📚</div>
            <h3>${t('ai.tutor_setup_heading', 'My AI Tutor Setup')}</h3>
            <p style="color:var(--text-muted,#6B5744);margin-bottom:1.5rem;">${t('ai.tutor_setup_desc', 'Set your learning goals and style to get personalized lessons')}</p>

            <div class="tutor-section">
                <h4>📚 ${t('ai.tutor_goals_title', 'Learning Goals (multiple selection)')}</h4>
                <div class="tutor-goal-grid">${goalBtns}</div>
                <input type="text" id="tutor-custom-goal" placeholder="${t('ai.tutor_custom_placeholder', 'Enter custom goal...')}" value="${tutorProfile?.customGoal || ''}" class="tutor-custom-input">
            </div>

            <div class="tutor-section">
                <h4>${t('ai.tutor_level_title', 'Current Level')}</h4>
                <div class="tutor-opt-row">${levelBtns}</div>
            </div>

            <div class="tutor-section">
                <h4>${t('ai.tutor_style_title', 'Preferred Style')}</h4>
                <div class="tutor-opt-row">${styleBtns}</div>
            </div>

            <button class="tutor-save-btn" onclick="AI_ASSISTANT._saveTutorSetup()">✅ ${t('ai.tutor_save_btn', 'Setup Complete — Start Tutor!')}</button>
        </div>`;
    }

    function _toggleGoal(btn) {
        btn.classList.toggle('tutor-goal-selected');
    }
    function _selectLevel(btn) {
        btn.parentElement.querySelectorAll('.tutor-opt-btn').forEach(b => b.classList.remove('tutor-opt-selected'));
        btn.classList.add('tutor-opt-selected');
    }
    function _selectStyle(btn) {
        btn.parentElement.querySelectorAll('.tutor-opt-btn').forEach(b => b.classList.remove('tutor-opt-selected'));
        btn.classList.add('tutor-opt-selected');
    }
    async function _saveTutorSetup() {
        const goals = Array.from(document.querySelectorAll('.tutor-goal-btn.tutor-goal-selected')).map(b => b.dataset.goal);
        const level = document.querySelector('.tutor-opt-btn.tutor-opt-selected[data-level]')?.dataset.level || 'beginner';
        const style = document.querySelector('.tutor-opt-btn.tutor-opt-selected[data-style]')?.dataset.style || 'friendly';
        const customGoal = document.getElementById('tutor-custom-goal')?.value?.trim() || '';

        if (goals.length === 0 && !customGoal) {
            showToast(t('ai.tutor_select_goal', 'Please select at least 1 learning goal!'), 'warning');
            return;
        }

        await saveTutorProfile({ goals, level, style, customGoal, updatedAt: new Date().toISOString() });
        showToast(t('ai.tutor_setup_done', 'Tutor setup complete!'), 'success');
        selectCharacter('tutor');
    }

    // ── Settings Load ── (API key managed server-side)
    async function loadSettings() {
        enabled = true;
    }

    // ── Context ──
    function buildContext(char) {
        let ctx = char.systemPrompt;
        // 다국어 대응: 사용자 선택 언어로 답변
        const lang = (typeof currentLang !== 'undefined') ? currentLang : 'ko';
        const langNames = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文', es: 'Español' };
        if (lang !== 'ko') {
            ctx += `\n\n[중요] 사용자가 ${langNames[lang] || lang}를 선택했습니다. 반드시 ${langNames[lang] || lang}로 답변하세요. 캐릭터의 성격과 말투는 유지하되 언어만 바꿔주세요.`;
        }
        if (!currentUser) return ctx;
        ctx += '\n\n--- 현재 사용자 정보 ---';
        ctx += `\n이메일: ${currentUser.email}`;
        try {
            const balEls = document.querySelectorAll('.token-card .token-amount');
            const balNames = document.querySelectorAll('.token-card .token-symbol');
            if (balEls.length) {
                ctx += '\n토큰 잔액:';
                balEls.forEach((el, i) => {
                    const name = balNames[i]?.textContent || '';
                    ctx += `\n  ${name}: ${el.textContent}`;
                });
            }
        } catch (_) { /* optional */ }
        const activePage = document.querySelector('.page.active');
        if (activePage) ctx += `\n현재 페이지: ${activePage.id}`;
        return ctx;
    }

    function buildLoungeContext() {
        let ctx = LOUNGE_SYSTEM_PROMPT;
        if (!currentUser) return ctx;
        ctx += `\n\n--- 현재 사용자 정보 ---\n이메일: ${currentUser.email}`;
        return ctx;
    }

    // ── API Call (1:1) with retry ──
    async function sendToGemini(userMessage, char, retryCount = 0) {
        // API key is managed server-side via /api/ai/gemini

        const history = chatHistories[char.id] || [];
        const contents = history.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }]
        }));
        contents.push({ role: 'user', parts: [{ text: userMessage }] });

        const body = {
            contents,
            systemInstruction: { parts: [{ text: buildContext(char) }] },
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
        };

        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const res = await fetch('/api/ai/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || '') },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            if (res.status === 429 && retryCount < 2) {
                await new Promise(r => setTimeout(r, 2000 * (retryCount + 1)));
                return sendToGemini(userMessage, char, retryCount + 1);
            }
            if (res.status === 429) return t('ai.err_rate_limit', '⏳ Too many requests. Please try again shortly.');
            if (res.status === 403 || res.status === 400) return t('ai.err_invalid_key', '🔑 API key is invalid. Please contact admin.');
            return t('ai.err_response', '❌ AI response error occurred.');
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || t('ai.err_no_response', 'No response received.');
    }

    // ── API Call (Lounge — JSON mode) ──
    async function sendToGeminiLounge(userMessage) {
        // API key is managed server-side

        // Build contents from lounge history
        const contents = [];
        for (const m of loungeHistory) {
            if (m.role === 'user') {
                contents.push({ role: 'user', parts: [{ text: m.text }] });
            } else if (m.role === 'model') {
                contents.push({ role: 'model', parts: [{ text: JSON.stringify({ responses: m.responses }) }] });
            }
        }
        contents.push({ role: 'user', parts: [{ text: userMessage }] });

        const body = {
            contents,
            systemInstruction: { parts: [{ text: buildLoungeContext() }] },
            generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 1024,
                responseMimeType: 'application/json'
            }
        };

        const token2 = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const res = await fetch('/api/ai/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token2 || '') },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            if (res.status === 429) { showToast(t('ai.err_rate_limit', '⏳ Too many requests. Please try again shortly.'), 'warning'); return null; }
            if (res.status === 403) { showToast(t('ai.err_invalid_key', '🔑 API key is invalid.'), 'error'); return null; }
            showToast(t('ai.err_response', '❌ AI response error'), 'error');
            return null;
        }

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return null;

        try {
            const parsed = JSON.parse(text);
            return parsed.responses || [];
        } catch (e) {
            console.error('Lounge JSON parse error:', e, text);
            return null;
        }
    }

    // ── Chat History (localStorage per character) ──
    function storageKey(charId) { return `crowny_panel_${charId}`; }

    function loadHistory(charId) {
        try {
            chatHistories[charId] = JSON.parse(localStorage.getItem(storageKey(charId)) || '[]');
        } catch (_) { chatHistories[charId] = []; }
    }

    function saveHistory(charId) {
        let h = chatHistories[charId] || [];
        if (h.length > MAX_HISTORY) h = h.slice(-MAX_HISTORY);
        chatHistories[charId] = h;
        localStorage.setItem(storageKey(charId), JSON.stringify(h));
    }

    function clearHistory(charId) {
        chatHistories[charId] = [];
        localStorage.removeItem(storageKey(charId));
    }

    // ── Lounge History (localStorage) ──
    function loadLoungeHistory() {
        try {
            loungeHistory = JSON.parse(localStorage.getItem('crowny_lounge_history') || '[]');
        } catch (_) { loungeHistory = []; }
    }

    function saveLoungeHistory() {
        if (loungeHistory.length > MAX_HISTORY) loungeHistory = loungeHistory.slice(-MAX_HISTORY);
        localStorage.setItem('crowny_lounge_history', JSON.stringify(loungeHistory));
    }

    // ── Markdown ──
    function renderMarkdown(text) {
        return text
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
            .replace(/\n/g, '<br>');
    }

    function escapeHtml(t) {
        return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // ── UI: Character Select Screen ──
    function renderSelectScreen() {
        const container = document.getElementById('ai-chat-messages');
        const inputBar = document.querySelector('.ai-input-bar');
        if (!container) return;
        if (inputBar) inputBar.style.display = 'none';

        loungeMode = false;
        const header = document.querySelector('#ai-assistant .section-header');
        if (header) {
            header.innerHTML = `<h2>👑 <span data-i18n="nav.crowny_panel">${t('nav.crowny_panel','Crowny Panel')}</span></h2><div></div>`;
        }

        // Lounge button + character cards
        const loungeBtn = `<button class="lounge-enter-btn" onclick="AI_ASSISTANT.enterLounge()">
            <span class="lounge-enter-icon">🏠</span>
            <div class="lounge-enter-text">
                <strong>${t('panel.lounge_title','Crowny Lounge')}</strong>
                <span>${t('panel.lounge_sub','5-Member AI Group Chat')}</span>
            </div>
            <div class="lounge-enter-avatars">${CHAR_ORDER.map(id => {
                const c = CHARACTERS[id];
                return c.avatarImg
                    ? `<img src="${c.avatarImg}" class="lounge-mini-avatar">`
                    : `<span class="lounge-mini-avatar-emoji" style="background:${c.bgGradient};">${c.emoji}</span>`;
            }).join('')}</div>
        </button>`;

        const cards = CHAR_ORDER.map(id => {
            const c = CHARACTERS[id];
            return `<button class="panel-char-card" onclick="AI_ASSISTANT.selectCharacter('${id}')" style="--char-color:${c.color}; --char-bg:${c.bgGradient};">
                <div class="panel-char-avatar" style="background:${c.bgGradient};">${renderCharAvatar(c)}</div>
                <div class="panel-char-name">${c.name}</div>
                <div class="panel-char-role">${t(c.roleI18n, c.role)}</div>
            </button>`;
        }).join('');

        container.innerHTML = `<div class="panel-select-screen">
            <div class="panel-select-title">
                <div class="panel-select-icon">👑</div>
                <h3>${t('panel.select_title','Who would you like to talk to?')}</h3>
                <p>${t('panel.select_sub','Please select a Crowny Panel member')}</p>
            </div>
            ${loungeBtn}
            <div class="panel-char-grid">${cards}</div>
        </div>`;

        currentCharId = null;
    }

    // ── UI: Chat Screen (1:1) ──
    function renderChat() {
        if (!currentCharId) { renderSelectScreen(); return; }

        const char = CHARACTERS[currentCharId];
        const container = document.getElementById('ai-chat-messages');
        const inputBar = document.querySelector('.ai-input-bar');
        if (!container) return;
        if (inputBar) inputBar.style.display = 'flex';

        const header = document.querySelector('#ai-assistant .section-header');
        if (header) {
            header.innerHTML = `
                <div class="panel-chat-header-left">
                    <button class="panel-back-btn" onclick="AI_ASSISTANT.backToSelect()" title="${t('panel.back','Select another panel')}">←</button>
                    <div class="panel-chat-avatar" style="background:${char.bgGradient};">${renderCharAvatar(char)}</div>
                    <div>
                        <div class="panel-chat-name">${char.name}</div>
                        <div class="panel-chat-role">${t(char.roleI18n, char.role)}</div>
                    </div>
                </div>
                <button onclick="AI_ASSISTANT.reset()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;" title="${t('ai.clear_confirm','Clear chat')}">✕</button>`;
        }

        const history = chatHistories[currentCharId] || [];

        if (history.length === 0) {
            const cards = char.quickQuestions.map(q =>
                `<button class="ai-quick-card" onclick="AI_ASSISTANT.ask('${q.icon} ${q.text}')" style="border-color:${char.color}22; background:${char.color}08;">${q.icon} ${q.text}</button>`
            ).join('');
            container.innerHTML = `<div class="ai-welcome">
                <div class="ai-welcome-icon" style="${char.avatarImg ? '' : `background:${char.bgGradient};-webkit-background-clip:text;-webkit-text-fill-color:transparent;`}font-size:3rem;">${char.avatarImg ? `<img src="${char.avatarImg}" class="panel-avatar-img" style="width:64px;height:64px;">` : char.emoji}</div>
                <h3 style="color:${char.color};">${char.name}</h3>
                <p style="font-style:italic;">"${char.greeting}"</p>
                <div class="ai-quick-cards">${cards}</div>
            </div>`;
            return;
        }

        container.innerHTML = history.map(m => {
            const isUser = m.role === 'user';
            return `<div class="ai-msg ${isUser ? 'ai-msg-user' : 'ai-msg-bot'}">
                ${isUser ? '' : `<div class="ai-avatar" style="background:${char.bgGradient};">${renderCharAvatar(char)}</div>`}
                <div class="ai-bubble ${isUser ? 'ai-bubble-user' : 'ai-bubble-bot'}">${isUser ? escapeHtml(m.text) : renderMarkdown(m.text)}</div>
            </div>`;
        }).join('');

        container.scrollTop = container.scrollHeight;
    }

    function showTyping() {
        if (!currentCharId && !loungeMode) return;
        const container = document.getElementById('ai-chat-messages');
        if (!container) return;

        if (loungeMode) return; // Lounge has its own typing

        const char = CHARACTERS[currentCharId];
        const el = document.createElement('div');
        el.className = 'ai-msg ai-msg-bot ai-typing-wrap';
        el.innerHTML = `<div class="ai-avatar" style="background:${char.bgGradient};">${renderCharAvatar(char)}</div><div class="ai-bubble ai-bubble-bot ai-typing"><span></span><span></span><span></span></div>`;
        container.appendChild(el);
        container.scrollTop = container.scrollHeight;
    }

    function hideTyping() {
        document.querySelectorAll('.ai-typing-wrap').forEach(el => el.remove());
    }

    // ── Lounge: Typing Indicator ──
    function showLoungeTyping(charId) {
        const container = document.getElementById('ai-chat-messages');
        if (!container) return;
        const char = CHARACTERS[charId];
        if (!char) return;
        const el = document.createElement('div');
        el.className = 'ai-msg ai-msg-bot ai-typing-wrap';
        el.id = `lounge-typing-${charId}`;
        el.innerHTML = `<div class="ai-avatar lounge-avatar" style="background:${char.bgGradient};">${renderCharAvatar(char)}</div>
            <div class="lounge-typing-bubble">
                <div class="lounge-char-label" style="color:${char.color};">${char.name}</div>
                <div class="ai-bubble ai-bubble-bot ai-typing"><span></span><span></span><span></span></div>
            </div>`;
        container.appendChild(el);
        container.scrollTop = container.scrollHeight;
    }

    function hideLoungeTyping(charId) {
        const el = document.getElementById(`lounge-typing-${charId}`);
        if (el) el.remove();
    }

    // ── Lounge: Enter ──
    function enterLounge() {
        loungeMode = true;
        currentCharId = null;
        loadLoungeHistory();

        const container = document.getElementById('ai-chat-messages');
        const inputBar = document.querySelector('.ai-input-bar');
        if (!container) return;
        if (inputBar) inputBar.style.display = 'flex';

        // Header
        const header = document.querySelector('#ai-assistant .section-header');
        if (header) {
            header.innerHTML = `
                <div class="panel-chat-header-left">
                    <button class="panel-back-btn" onclick="AI_ASSISTANT.backToSelect()" title="${t('panel.back','Go back')}">←</button>
                    <div class="lounge-header-avatars">${CHAR_ORDER.map(id => {
                        const c = CHARACTERS[id];
                        return c.avatarImg
                            ? `<img src="${c.avatarImg}" class="lounge-header-avatar-img">`
                            : `<span class="lounge-header-avatar-emoji" style="background:${c.bgGradient};">${c.emoji}</span>`;
                    }).join('')}</div>
                    <div>
                        <div class="panel-chat-name">🏠 ${t('panel.lounge_title','Crowny Lounge')}</div>
                        <div class="panel-chat-role">${t('panel.lounge_members','KPS, Hansun, Michael, Matthew, Crowny Girl')}</div>
                    </div>
                </div>
                <div style="display:flex;gap:0.3rem;">
                    <button onclick="AI_ASSISTANT.loungeInvite()" style="background:none;border:none;font-size:1.1rem;cursor:pointer;" title="${t('panel.invite','Invite friend')}"><i data-lucide="user-plus" style="width:16px;height:16px;"></i></button>
                    <button onclick="AI_ASSISTANT.resetLounge()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;" title="${t('ai.clear_confirm','Clear chat')}">✕</button>
                </div>`;
        }

        renderLoungeMessages();
    }

    function renderLoungeMessages() {
        const container = document.getElementById('ai-chat-messages');
        if (!container) return;

        if (loungeHistory.length === 0) {
            container.innerHTML = `<div class="ai-welcome">
                <div class="lounge-welcome-avatars">${CHAR_ORDER.map(id => {
                    const c = CHARACTERS[id];
                    return `<div class="lounge-welcome-avatar" style="background:${c.bgGradient};">${renderCharAvatar(c)}</div>`;
                }).join('')}</div>
                <h3>🏠 ${t('panel.lounge_title','Crowny Lounge')}</h3>
                <p>${t('panel.lounge_welcome','Chat with the 5 Crowny Panel members!')}</p>
                <div class="ai-quick-cards">
                    <button class="ai-quick-card" onclick="AI_ASSISTANT.askLounge('${t('ai.lounge_ask_hello', 'Hello everyone~ How are you today?')}')">👋 ${t('ai.lounge_btn_hello', 'Say Hello')}</button>
                    <button class="ai-quick-card" onclick="AI_ASSISTANT.askLounge('${t('ai.lounge_ask_intro', 'Tell me about Crowny')}')">sparkles ${t('ai.lounge_btn_intro', 'Crowny Intro')}</button>
                    <button class="ai-quick-card" onclick="AI_ASSISTANT.askLounge('${t('ai.lounge_ask_market', 'How is the market doing these days?')}')">trend-up ${t('ai.lounge_btn_market', 'Market Talk')}</button>
                    <button class="ai-quick-card" onclick="AI_ASSISTANT.askLounge('${t('ai.lounge_ask_healing', 'Please share something to lift my mood')}')">flower ${t('ai.lounge_btn_healing', 'Healing Talk')}</button>
                </div>
            </div>`;
            return;
        }

        let html = '';
        for (const m of loungeHistory) {
            if (m.role === 'user') {
                html += `<div class="ai-msg ai-msg-user">
                    <div class="ai-bubble ai-bubble-user">${escapeHtml(m.text)}</div>
                </div>`;
            } else if (m.role === 'model' && m.responses) {
                for (const r of m.responses) {
                    const char = CHARACTERS[r.character];
                    if (!char) continue;
                    html += `<div class="ai-msg ai-msg-bot lounge-msg">
                        <div class="ai-avatar lounge-avatar" style="background:${char.bgGradient};">${renderCharAvatar(char)}</div>
                        <div class="lounge-msg-content">
                            <div class="lounge-char-label" style="color:${char.color};">${char.name}</div>
                            <div class="ai-bubble ai-bubble-bot lounge-bubble" style="border-left:3px solid ${char.color};">${renderMarkdown(r.message)}</div>
                        </div>
                    </div>`;
                }
            }
        }
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    }

    // ── Lounge: Send Message ──
    async function askLounge(text) {
        if (!text || isLoading) return;
        if (!enabled) { showToast(t('panel.disabled', 'AI assistant is disabled'), 'warning'); return; }

        const input = document.getElementById('ai-input');
        if (input) input.value = '';

        // Add user message
        loungeHistory.push({ role: 'user', text });
        renderLoungeMessages();
        isLoading = true;

        // Show generic typing
        showLoungeTyping('crownygirl');

        try {
            const responses = await sendToGeminiLounge(text);
            hideLoungeTyping('crownygirl');

            if (responses && responses.length > 0) {
                // Store in history
                loungeHistory.push({ role: 'model', responses });
                saveLoungeHistory();

                // Render sequentially with delays
                const container = document.getElementById('ai-chat-messages');
                for (let i = 0; i < responses.length; i++) {
                    const r = responses[i];
                    const char = CHARACTERS[r.character];
                    if (!char) continue;

                    const delay = i === 0 ? Math.min(r.delay || 300, 500) : (r.delay || 800 + i * 600);
                    const actualDelay = i === 0 ? delay : Math.min(delay, 2500);

                    // Show typing for this character
                    showLoungeTyping(r.character);

                    await new Promise(resolve => setTimeout(resolve, Math.max(actualDelay, 400)));

                    hideLoungeTyping(r.character);

                    // Append message
                    const msgEl = document.createElement('div');
                    msgEl.className = 'ai-msg ai-msg-bot lounge-msg lounge-msg-enter';
                    msgEl.innerHTML = `<div class="ai-avatar lounge-avatar" style="background:${char.bgGradient};">${renderCharAvatar(char)}</div>
                        <div class="lounge-msg-content">
                            <div class="lounge-char-label" style="color:${char.color};">${char.name}</div>
                            <div class="ai-bubble ai-bubble-bot lounge-bubble" style="border-left:3px solid ${char.color};">${renderMarkdown(r.message)}</div>
                        </div>`;
                    container.appendChild(msgEl);
                    container.scrollTop = container.scrollHeight;

                    // Trigger animation
                    requestAnimationFrame(() => msgEl.classList.add('lounge-msg-visible'));
                }
            } else {
                // Fallback error
                loungeHistory.push({ role: 'model', responses: [{ character: 'crownygirl', message: t('ai.lounge_error', 'Oops, something went wrong! Please try again 😅'), delay: 0 }] });
                saveLoungeHistory();
                renderLoungeMessages();
            }
        } catch (e) {
            hideLoungeTyping('crownygirl');
            console.error('Lounge error:', e);
            loungeHistory.push({ role: 'model', responses: [{ character: 'crownygirl', message: t('ai.err_generic', '❌ An error occurred: ') + e.message, delay: 0 }] });
            saveLoungeHistory();
            renderLoungeMessages();
        }

        isLoading = false;
    }

    function loungeInvite() {
        showToast(t('panel.invite_soon', 'Friend invite feature coming soon!'), 'info');
    }

    async function resetLounge() {
        const answer = await showPromptModal(t('ai.clear_title','Clear Chat'), t('ai.clear_confirm','Delete all chat history?\nType "ok" to confirm'), '');
        if (answer === '확인' || answer === 'ok' || answer === 'yes') {
            loungeHistory = [];
            localStorage.removeItem('crowny_lounge_history');
            renderLoungeMessages();
            showToast(t('ai.cleared','Chat history has been cleared'), 'success');
        }
    }

    // ── Public API ──
    function selectCharacter(charId) {
        loungeMode = false;
        // 튜터 선택 시 프로필 미설정이면 셋업 화면
        if (charId === 'tutor' && (!tutorProfile || !tutorProfile.goals || tutorProfile.goals.length === 0)) {
            if (!tutorProfile?.customGoal) {
                renderTutorSetup();
                return;
            }
        }
        currentCharId = charId;
        if (!chatHistories[charId]) loadHistory(charId);
        renderChat();
        setTimeout(() => {
            const input = document.getElementById('ai-input');
            if (input) input.focus();
        }, 100);
    }

    function backToSelect() {
        loungeMode = false;
        renderSelectScreen();
    }

    async function ask(text) {
        if (!text || isLoading) return;

        // Route to lounge if in lounge mode
        if (loungeMode) { askLounge(text); return; }

        if (!currentCharId) return;
        if (!enabled) { showToast(t('panel.disabled', 'AI assistant is disabled'), 'warning'); return; }

        const char = CHARACTERS[currentCharId];
        const input = document.getElementById('ai-input');
        if (input) input.value = '';

        if (!chatHistories[currentCharId]) chatHistories[currentCharId] = [];
        chatHistories[currentCharId].push({ role: 'user', text });
        renderChat();
        showTyping();
        isLoading = true;

        try {
            const reply = await sendToGemini(text, char);
            chatHistories[currentCharId].push({ role: 'model', text: reply });
            saveHistory(currentCharId);
        } catch (e) {
            chatHistories[currentCharId].push({ role: 'model', text: t('ai.err_generic', '❌ An error occurred: ') + e.message });
        }

        isLoading = false;
        hideTyping();
        renderChat();
    }

    function handleSend() {
        const input = document.getElementById('ai-input');
        if (input && input.value.trim()) ask(input.value.trim());
    }

    function handleKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    }

    async function reset() {
        if (loungeMode) { resetLounge(); return; }
        if (!currentCharId) return;
        const answer = await showPromptModal(t('ai.clear_title','Clear Chat'), t('ai.clear_confirm','Delete all chat history?\nType "ok" to confirm'), '');
        if (answer === '확인' || answer === 'ok' || answer === 'yes') {
            clearHistory(currentCharId);
            renderChat();
            showToast(t('ai.cleared','Chat history has been cleared'), 'success');
        }
    }

    // ── Init ──
    async function init() {
        CHAR_ORDER.forEach(id => loadHistory(id));
        loadLoungeHistory();
        await loadSettings();
        await loadTutorProfile();
        renderSelectScreen();

        const inputEl = document.querySelector('.ai-input-bar input');
        if (inputEl) {
            inputEl.addEventListener('focus', () => {
                // 모바일 키보드 올라올 때 입력바 보이게
                setTimeout(() => {
                    const container = document.getElementById('ai-chat-messages');
                    if (container) container.scrollTop = container.scrollHeight;
                    // visualViewport API로 키보드 대응
                    if (window.visualViewport) {
                        const handler = () => {
                            const inputBar = document.querySelector('.ai-input-bar');
                            if (inputBar) {
                                const offset = window.innerHeight - window.visualViewport.height;
                                inputBar.style.paddingBottom = `max(0.8rem, ${offset}px)`;
                            }
                        };
                        window.visualViewport.addEventListener('resize', handler);
                        inputEl.addEventListener('blur', () => {
                            window.visualViewport.removeEventListener('resize', handler);
                            const inputBar = document.querySelector('.ai-input-bar');
                            if (inputBar) inputBar.style.paddingBottom = '';
                        }, { once: true });
                    }
                }, 300);
            });
        }
    }

    // ── Admin ──
    const DEFAULT_SYSTEM_PROMPT = t('ai.default_prompt', '(Crowny Panel — per-character prompts used)');

    async function saveAdminSettings() {
        const key = document.getElementById('ai-admin-apikey')?.value?.trim() || '';
        const prompt = document.getElementById('ai-admin-prompt')?.value?.trim() || '';
        const on = document.getElementById('ai-admin-toggle')?.checked !== false;

        try {
            // API key is managed server-side via .env
            enabled = on;
            showToast(t('ai.admin_saved', 'Crowny Panel settings saved ✅'), 'success');
        } catch (e) {
            showToast(t('ai.admin_save_fail', 'Save failed: ') + e.message, 'error');
        }
    }

    async function loadAdminSettings() {
        // API key is managed server-side via .env
        const toggleEl = document.getElementById('ai-admin-toggle');
        if (toggleEl) toggleEl.checked = enabled;
    }

    return {
        init, ask, askLounge, handleSend, handleKeydown, reset, renderChat,
        selectCharacter, backToSelect,
        enterLounge, loungeInvite, resetLounge,
        saveAdminSettings, loadAdminSettings, DEFAULT_SYSTEM_PROMPT,
        CHARACTERS, CHAR_ORDER,
        // Tutor
        renderTutorSetup, _toggleGoal, _selectLevel, _selectStyle, _saveTutorSetup,
        saveTutorProgress, getTutorProgress
    };
})();
