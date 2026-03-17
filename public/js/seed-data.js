// seed-data.js — Firestore 초기 데이터 시드
// 브라우저 콘솔에서 seedAll() 실행 또는 admin.html에서 버튼 클릭
// 한 번만 실행! (중복 방지는 doc ID 기반)

async function seedAll() {
    if (!firebase || !db) { console.error('Firebase not initialized'); return; }
    if (!currentUser) { console.error('Login required'); return; }
    
    const results = [];
    
    try {
        // 1. Artists
        results.push(await seedArtists());
        // 2. Businesses
        results.push(await seedBusinesses());
        // 3. Campaigns (Fundraise)
        results.push(await seedCampaigns());
        // 4. Bot profiles (AI Social)
        results.push(await seedBotProfiles());
        // 5. Feature flags
        results.push(await seedFeatureFlags());
        // 6. AI settings
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

// ===== ARTISTS =====
async function seedArtists() {
    const artists = [
        {
            name: '한선 (Hansun)',
            emoji: '🎹',
            genre: '클래식 피아노',
            country: '🇰🇷 한국',
            bio: '20세 피아니스트. 클래식과 현대 음악을 넘나드는 연주로 새로운 감동을 선사합니다. 크라우니 플랫폼의 첫 번째 아티스트.',
            coverColor: 'linear-gradient(135deg, #1a237e, #4a148c)',
            supportCount: 12,
            links: { YouTube: '#', Instagram: '#' },
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        {
            name: '크라우니걸 (Crowny Girl)',
            emoji: '👑',
            genre: '디지털 아트 / 일러스트',
            country: '🌍 글로벌',
            bio: '크라우니의 공식 마스코트이자 디지털 아티스트. NFT 아트워크와 일러스트로 크라우니 세계관을 표현합니다.',
            coverColor: 'linear-gradient(135deg, #e91e63, #ff6f00)',
            supportCount: 38,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        {
            name: '마이클 (Michael)',
            emoji: '🎤',
            genre: '공연기획 / 찬양',
            country: '🇰🇷 한국',
            bio: '50세 공연기획자이자 콘텐츠 크리에이터. 음악과 공연을 통해 사람들에게 희망을 전합니다.',
            coverColor: 'linear-gradient(135deg, #004d40, #00695c)',
            supportCount: 7,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        {
            name: '매튜 (Matthew)',
            emoji: '🎸',
            genre: '음향 / 워십',
            country: '🇰🇷 한국',
            bio: '41세 음향회사 간부, 전 찬양팀 리더. 음향 기술과 음악의 조화로 최고의 사운드를 만듭니다.',
            coverColor: 'linear-gradient(135deg, #1b5e20, #33691e)',
            supportCount: 5,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }
    ];

    let count = 0;
    for (const artist of artists) {
        const id = artist.name.split('(')[1]?.replace(')', '').trim().toLowerCase() || artist.name.toLowerCase().replace(/\s/g, '_');
        const ref = db.collection('artists').doc(id);
        const existing = await ref.get();
        if (!existing.exists) {
            await ref.set(artist);
            count++;
        }
    }
    return `🎵 Artists: ${count} created`;
}

// ===== BUSINESSES =====
async function seedBusinesses() {
    const businesses = [
        {
            name: 'Crowny Foundation',
            emoji: '👑',
            category: '재단/비영리',
            country: '🌍 글로벌',
            description: '크라우니 재단 — 153개국 네트워크를 통해 돌봄, 교육, 문화를 연결합니다.',
            investmentGoal: 1000000,
            investmentCurrent: 125000,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        {
            name: 'Present Mask Pack',
            emoji: '✨',
            category: '뷰티/화장품',
            country: '🇰🇷 한국',
            description: '프레즌트 마스크팩 — 천연 성분 기반 프리미엄 스킨케어 브랜드. 크라우니 뷰티 매니저와 연동.',
            investmentGoal: 500000,
            investmentCurrent: 89000,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        {
            name: 'CREB Labs',
            emoji: '🔬',
            category: '기술/연구',
            country: '🇰🇷 한국',
            description: 'CREB 미래기술 연구소 — 블록체인, AI, 바이오 기술의 융합 연구.',
            investmentGoal: 2000000,
            investmentCurrent: 310000,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        {
            name: 'Crowny Trading Academy',
            emoji: '📈',
            category: '교육/금융',
            country: '🌍 글로벌',
            description: '크라우니 트레이딩 아카데미 — 선물 거래 교육과 시뮬레이션 게임으로 금융 역량을 키웁니다.',
            investmentGoal: 300000,
            investmentCurrent: 45000,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }
    ];

    let count = 0;
    for (const biz of businesses) {
        const id = biz.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
        const ref = db.collection('businesses').doc(id);
        const existing = await ref.get();
        if (!existing.exists) {
            await ref.set(biz);
            count++;
        }
    }
    return `🏢 Businesses: ${count} created`;
}

// ===== CAMPAIGNS (Fundraise) =====
async function seedCampaigns() {
    const campaigns = [
        {
            title: '🌍 153개국 크라우니 케어 센터 건립',
            emoji: '💝',
            category: 'charity',
            country: 'KR',
            description: '전 세계 153개국에 크라우니 케어 센터를 설립합니다.\n\n어르신과 소외계층을 위한 돌봄 인프라를 구축하고,\n각 지역 커뮤니티와 함께 지속 가능한 복지 네트워크를 만들어갑니다.\n\n당신의 후원이 누군가의 내일을 바꿉니다.',
            goal: 5000000,
            raised: 482000,
            supporters: 156,
            creatorId: 'system',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        {
            title: '📖 크라우니 글로벌 교육 프로그램',
            emoji: '📚',
            category: 'education',
            country: 'ALL',
            description: '개발도상국 청소년들에게 디지털 교육과 금융 리터러시를 제공합니다.\n온라인 학습 플랫폼과 현지 멘토링 프로그램을 운영합니다.',
            goal: 1000000,
            raised: 210000,
            supporters: 89,
            creatorId: 'system',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        {
            title: '🏥 필리핀 의료 봉사 캠페인',
            emoji: '🏥',
            category: 'medical',
            country: 'PH',
            description: '필리핀 빈곤 지역 주민들에게 무료 의료 서비스를 제공합니다.\n안과, 치과, 내과 진료 및 의약품 지원.',
            goal: 300000,
            raised: 178000,
            supporters: 234,
            creatorId: 'system',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        {
            title: '🌱 도시 숲 조성 프로젝트',
            emoji: '🌱',
            category: 'environment',
            country: 'KR',
            description: '서울 및 수도권 지역에 도시 숲을 조성합니다.\n미세먼지 저감과 시민 쉼터 공간을 만들어갑니다.',
            goal: 200000,
            raised: 67000,
            supporters: 45,
            creatorId: 'system',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }
    ];

    let count = 0;
    for (let i = 0; i < campaigns.length; i++) {
        const id = `campaign_${i + 1}`;
        const ref = db.collection('campaigns').doc(id);
        const existing = await ref.get();
        if (!existing.exists) {
            await ref.set(campaigns[i]);
            count++;
        }
    }
    return `💝 Campaigns: ${count} created`;
}

// ===== BOT PROFILES (AI Social) =====
async function seedBotProfiles() {
    const profiles = {
        bot_kps: {
            nickname: '김선경 (KPS)',
            email: 'bot_kps@crowny.org',
            photoURL: '',
            statusMessage: '크라우니 파운더 | 153개국 네트워크',
            personality: '리더십, 비전, 따뜻함',
            isBot: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        bot_hansun: {
            nickname: '한선',
            email: 'bot_hansun@crowny.org',
            photoURL: '',
            statusMessage: '피아니스트 | 트레이더 | 20세',
            personality: '젊은 에너지, 음악적 감성, 솔직함',
            isBot: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        bot_michael: {
            nickname: '마이클',
            email: 'bot_michael@crowny.org',
            photoURL: '',
            statusMessage: '공연기획자 | 콘텐츠 크리에이터',
            personality: '열정, 유머, 경험에서 오는 지혜',
            isBot: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        bot_matthew: {
            nickname: '매튜',
            email: 'bot_matthew@crowny.org',
            photoURL: '',
            statusMessage: '음향 엔지니어 | 찬양 리더',
            personality: '차분함, 기술적 깊이, 신뢰감',
            isBot: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        bot_crownygirl: {
            nickname: '크라우니걸',
            email: 'bot_crownygirl@crowny.org',
            photoURL: '',
            statusMessage: '크라우니 마스코트 | 뷰티 전문가 👑',
            personality: '밝고 친근함, 뷰티/건강 지식, MZ세대 감성',
            isBot: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }
    };

    let count = 0;
    for (const [id, profile] of Object.entries(profiles)) {
        const ref = db.collection('bot_profiles').doc(id);
        const existing = await ref.get();
        if (!existing.exists) {
            await ref.set(profile);
            count++;
        }
    }
    return `🤖 Bot Profiles: ${count} created`;
}

// ===== FEATURE FLAGS =====
async function seedFeatureFlags() {
    const ref = db.collection('admin_config').doc('features');
    const existing = await ref.get();
    if (!existing.exists) {
        await ref.set({
            home: true,
            wallet: true,
            social: true,
            messenger: true,
            settings: true,
            trading: true,
            ai_assistant: true,
            beauty: true,
            brain: true,
            movement: true,
            care: true,
            reels: true,
            art: true,
            books: true,
            mall: false,
            energy: true,
            business: true,
            artist: true
        });
        return '🔧 Feature Flags: created (most enabled)';
    }
    return '🔧 Feature Flags: already exists';
}

// ===== AI SETTINGS =====
async function seedAISettings() {
    const ref = db.collection('admin_config').doc('ai_settings');
    const existing = await ref.get();
    if (!existing.exists) {
        await ref.set({
            geminiApiKey: 'AIzaSyAhkJlLDE_V2Iso8PZaGIWPqs_ht0ZuZeA',
            model: 'gemini-2.0-flash',
            maxTokens: 2048,
            temperature: 0.8,
            socialBotEnabled: true,
            socialBotInterval: 3600000,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return '🧠 AI Settings: created';
    }
    return '🧠 AI Settings: already exists';
}

// Expose globally
window.seedAll = seedAll;
window.seedArtists = seedArtists;
window.seedBusinesses = seedBusinesses;
window.seedCampaigns = seedCampaigns;
window.seedBotProfiles = seedBotProfiles;
