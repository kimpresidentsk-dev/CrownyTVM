// seed-data.js — Server REST API 시드 데이터
// 브라우저 콘솔에서 seedAll() 실행 또는 admin.html에서 버튼 클릭
// 한 번만 실행! (중복 방지는 서버 doc ID 기반)

function _seedHeaders() {
    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}

async function seedAll() {
    if (!currentUser) { console.error('Login required'); return; }

    const results = [];

    try {
        results.push(await seedArtists());
        results.push(await seedBusinesses());
        results.push(await seedCampaigns());
        results.push(await seedBotProfiles());
        results.push(await seedFeatureFlags());
        results.push(await seedAISettings());

        const summary = results.join('\n');
        console.log('=== SEED COMPLETE ===\n' + summary);
        if (typeof showToast === 'function') showToast('✅ 시드 데이터 완료!', 'success');
        return summary;
    } catch (e) {
        console.error('Seed error:', e);
        if (typeof showToast === 'function') showToast('시드 실패: ' + e.message, 'error');
    }
}

async function seedArtists() {
    const artists = {
        hansun: { name: '한선 (Hansun)', emoji: '', genre: '클래식 피아노', country: 'KR', bio: '20세 피아니스트. 클래식과 현대 음악을 넘나드는 연주로 새로운 감동을 선사합니다.', coverColor: 'linear-gradient(135deg, #1a237e, #4a148c)', supportCount: 12, links: { YouTube: '#', Instagram: '#' } },
        'crowny girl': { name: '크라우니걸 (Crowny Girl)', emoji: '', genre: '디지털 아트 / 일러스트', country: 'Global', bio: '크라우니의 공식 마스코트이자 디지털 아티스트.', coverColor: 'linear-gradient(135deg, #e91e63, #ff6f00)', supportCount: 38 },
        michael: { name: '마이클 (Michael)', emoji: '', genre: '공연기획 / 찬양', country: 'KR', bio: '50세 공연기획자이자 콘텐츠 크리에이터.', coverColor: 'linear-gradient(135deg, #004d40, #00695c)', supportCount: 7 },
        matthew: { name: '매튜 (Matthew)', emoji: '', genre: '음향 / 워십', country: 'KR', bio: '41세 음향회사 간부, 전 찬양팀 리더.', coverColor: 'linear-gradient(135deg, #1b5e20, #33691e)', supportCount: 5 }
    };
    const res = await fetch('/api/seed/artists', { method: 'POST', headers: _seedHeaders(), body: JSON.stringify({ items: artists }) });
    const data = await res.json();
    return `Artists: ${data.created} created`;
}

async function seedBusinesses() {
    const businesses = {
        crowny_foundation: { name: 'Crowny Foundation', emoji: '', category: '재단/비영리', country: 'Global', description: '크라우니 재단 — 153개국 네트워크를 통해 돌봄, 교육, 문화를 연결합니다.', investmentGoal: 1000000, investmentCurrent: 125000 },
        present_mask_pack: { name: 'Present Mask Pack', emoji: '✨', category: '뷰티/화장품', country: 'KR', description: '프레즌트 마스크팩 — 천연 성분 기반 프리미엄 스킨케어 브랜드.', investmentGoal: 500000, investmentCurrent: 89000 },
        creb_labs: { name: 'CREB Labs', emoji: '', category: '기술/연구', country: 'KR', description: 'CREB 미래기술 연구소 — 블록체인, AI, 바이오 기술의 융합 연구.', investmentGoal: 2000000, investmentCurrent: 310000 },
        crowny_trading_academy: { name: 'Crowny Trading Academy', emoji: '', category: '교육/금융', country: 'Global', description: '크라우니 트레이딩 아카데미.', investmentGoal: 300000, investmentCurrent: 45000 }
    };
    const res = await fetch('/api/seed/businesses', { method: 'POST', headers: _seedHeaders(), body: JSON.stringify({ items: businesses }) });
    const data = await res.json();
    return `Businesses: ${data.created} created`;
}

async function seedCampaigns() {
    const campaigns = {
        campaign_1: { title: '153개국 크라우니 케어 센터 건립', emoji: '', category: 'charity', country: 'KR', description: '전 세계 153개국에 크라우니 케어 센터를 설립합니다.', goal: 5000000, raised: 482000, supporters: 156, creatorId: 'system' },
        campaign_2: { title: '크라우니 글로벌 교육 프로그램', emoji: '', category: 'education', country: 'ALL', description: '개발도상국 청소년들에게 디지털 교육과 금융 리터러시를 제공합니다.', goal: 1000000, raised: 210000, supporters: 89, creatorId: 'system' },
        campaign_3: { title: '필리핀 의료 봉사 캠페인', emoji: '', category: 'medical', country: 'PH', description: '필리핀 빈곤 지역 주민들에게 무료 의료 서비스를 제공합니다.', goal: 300000, raised: 178000, supporters: 234, creatorId: 'system' },
        campaign_4: { title: '도시 숲 조성 프로젝트', emoji: '', category: 'environment', country: 'KR', description: '서울 및 수도권 지역에 도시 숲을 조성합니다.', goal: 200000, raised: 67000, supporters: 45, creatorId: 'system' }
    };
    const res = await fetch('/api/seed/campaigns', { method: 'POST', headers: _seedHeaders(), body: JSON.stringify({ items: campaigns }) });
    const data = await res.json();
    return `Campaigns: ${data.created} created`;
}

async function seedBotProfiles() {
    const profiles = {
        bot_kps: { nickname: '김선경 (KPS)', email: 'bot_kps@crowny.org', photoURL: '', statusMessage: '크라우니 파운더 | 153개국 네트워크', personality: '리더십, 비전, 따뜻함', isBot: true },
        bot_hansun: { nickname: '한선', email: 'bot_hansun@crowny.org', photoURL: '', statusMessage: '피아니스트 | 트레이더 | 20세', personality: '젊은 에너지, 음악적 감성, 솔직함', isBot: true },
        bot_michael: { nickname: '마이클', email: 'bot_michael@crowny.org', photoURL: '', statusMessage: '공연기획자 | 콘텐츠 크리에이터', personality: '열정, 유머, 경험에서 오는 지혜', isBot: true },
        bot_matthew: { nickname: '매튜', email: 'bot_matthew@crowny.org', photoURL: '', statusMessage: '음향 엔지니어 | 찬양 리더', personality: '차분함, 기술적 깊이, 신뢰감', isBot: true },
        bot_crownygirl: { nickname: '크라우니걸', email: 'bot_crownygirl@crowny.org', photoURL: '', statusMessage: '크라우니 마스코트 | 뷰티 전문가', personality: '밝고 친근함, 뷰티/건강 지식, MZ세대 감성', isBot: true }
    };
    const res = await fetch('/api/seed/bot_profiles', { method: 'POST', headers: _seedHeaders(), body: JSON.stringify({ items: profiles }) });
    const data = await res.json();
    return `Bot Profiles: ${data.created} created`;
}

async function seedFeatureFlags() {
    const items = { features: { home: true, wallet: true, social: true, messenger: true, settings: true, trading: true, ai_assistant: true, beauty: true, brain: true, movement: true, care: true, reels: true, art: true, books: true, mall: false, energy: true, business: true, artist: true } };
    const res = await fetch('/api/seed/admin_config', { method: 'POST', headers: _seedHeaders(), body: JSON.stringify({ items }) });
    const data = await res.json();
    return data.created > 0 ? 'Feature Flags: created (most enabled)' : 'Feature Flags: already exists';
}

async function seedAISettings() {
    const items = { ai_settings: { geminiApiKey: '', model: 'gemini-2.0-flash', maxTokens: 2048, temperature: 0.8, socialBotEnabled: true, socialBotInterval: 3600000, updatedAt: Date.now() } };
    const res = await fetch('/api/seed/admin_config', { method: 'POST', headers: _seedHeaders(), body: JSON.stringify({ items }) });
    const data = await res.json();
    return data.created > 0 ? 'AI Settings: created' : 'AI Settings: already exists';
}

window.seedAll = seedAll;
window.seedArtists = seedArtists;
window.seedBusinesses = seedBusinesses;
window.seedCampaigns = seedCampaigns;
window.seedBotProfiles = seedBotProfiles;
