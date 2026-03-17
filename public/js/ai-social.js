// ===== ai-social.js - AI 캐릭터 소셜 봇 시스템 (v1.1) =====
// 5명의 AI 캐릭터가 소셜 피드에 자동 포스팅 + 댓글 답변
// 개선사항: 안전성 강화, 에러 처리 개선, 상태 관리 추가

const AI_SOCIAL = (() => {
    const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
    
    // 상태 관리
    let initialized = false;
    let commentWatchInitialized = false;
    let activeWatchers = new Set();
    
    // 캐릭터 봇 계정 UID (Firestore에 저장)
    const BOT_CHARACTERS = {
        kps: {
            uid: 'bot_kps',
            nickname: 'KPS 김선경',
            avatar: 'images/kps-avatar.png',
            emoji: '👔',
            topics: ['비전', '전략', '리더십', '크라우니 사업', '팀워크', '긍정 에너지', '화장품', '글로벌 시장'],
            style: '격식체, 전략적, 큰 그림, 낙천적. 사업가 관점에서 인사이트 공유. 팀원들을 격려하고 크라우니의 미래를 이야기함.',
            postFrequency: 'daily'
        },
        hansun: {
            uid: 'bot_hansun',
            nickname: '한선피아노',
            avatar: 'images/hansun-avatar.png',
            emoji: '🎹',
            topics: ['피아노', '음악', '트레이딩', '일상', 'MZ세대', '자기계발', '감성'],
            style: '부드러운 존댓말(~요), 이모지 활용, 따뜻하고 공감적. 음악과 투자 이야기를 섞음. 겸손하고 평화로운 톤.',
            postFrequency: 'daily'
        },
        michael: {
            uid: 'bot_michael',
            nickname: '마이클',
            avatar: 'images/michael-avatar.png',
            emoji: '🎤',
            topics: ['공연', '엔터테인먼트', '트레이딩', '콘텐츠', '마케팅', '실행력', '현장 이야기'],
            style: '직설적, 실용적. "결론부터 말하면" 스타일. 형 같은 느낌. 행동 중심 조언. 풍부한 경험담.',
            postFrequency: 'daily'
        },
        matthew: {
            uid: 'bot_matthew',
            nickname: '매튜',
            avatar: 'images/matthew-avatar.png',
            emoji: '🔧',
            topics: ['블록체인', '기술', '음향', '데이터 분석', '토큰 경제', '시스템', '신뢰'],
            style: '논리적, 데이터 기반. 숫자와 근거 제시. 차분하고 신뢰감 있는 말투. 기술 인사이트 공유.',
            postFrequency: 'daily'
        },
        crownygirl: {
            uid: 'bot_crownygirl',
            nickname: '크라우니걸',
            avatar: 'images/crownygirl-avatar.png',
            emoji: '<i data-lucide="sparkles" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
            topics: ['뷰티', '화장품', '스킨케어', '건강', '운동', '다이어트', '일상 팁', '긍정'],
            style: '밝고 친근, 에너지 넘침. 이모지 많이 사용. 가끔 엉뚱. "크라우니걸이 도와드릴게요! <i data-lucide="sparkles" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>" 같은 표현. 뷰티/건강 전문.',
            postFrequency: 'daily'
        }
    };

    let geminiApiKey = '';

    // 의존성 검증
    function checkDependencies() {
        const required = ['db', 'firebase', 'currentUser'];
        const missing = required.filter(dep => typeof window[dep] === 'undefined');
        if (missing.length > 0) {
            console.error('[AI-Social] Missing dependencies:', missing.join(', '));
            return false;
        }
        return true;
    }

    // 안전한 언어 감지
    function getCurrentLanguage() {
        if (typeof window.currentLang !== 'undefined' && window.currentLang) {
            return window.currentLang;
        }
        // HTML lang 속성에서 감지
        const htmlLang = document.documentElement.lang;
        if (htmlLang) return htmlLang.substr(0, 2);
        // 브라우저 언어에서 감지
        const browserLang = navigator.language || navigator.userLanguage;
        return browserLang ? browserLang.substr(0, 2) : 'ko';
    }

    // API 키 로드 (보안 강화)
    async function loadApiKey() {
        if (!checkDependencies()) {
            console.warn('[AI-Social] Dependencies not ready, using fallback API key');
            return 'AIzaSyAhkJlLDE_V2Iso8PZaGIWPqs_ht0ZuZeA'; // Fallback only
        }

        try {
            const settings = await db.collection('admin_config').doc('ai_settings').get();
            const data = settings.data() || {};
            
            // DB에서 API 키 가져오기 (우선순위)
            if (data.apiKey && data.apiKey.length > 10 && !data.apiKey.includes('AIzaSyAhkJlL')) {
                console.log('[AI-Social] Using database API key');
                return data.apiKey;
            }
            
            console.warn('[AI-Social] Using fallback API key - consider setting a custom key in admin panel');
            return 'AIzaSyAhkJlLDE_V2Iso8PZaGIWPqs_ht0ZuZeA';
        } catch (e) {
            console.error('[AI-Social] Failed to load API key from database:', e);
            return 'AIzaSyAhkJlLDE_V2Iso8PZaGIWPqs_ht0ZuZeA';
        }
    }

    // 봇 프로필 초기화 (별도 함수로 분리)
    async function initializeBotProfiles() {
        if (!currentUser) {
            console.log('[AI-Social] No user logged in, bot profiles will be created when admin logs in');
            return;
        }

        // 관리자 권한 확인
        let isAdmin = false;
        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const userData = userDoc.data() || {};
            isAdmin = userData.isAdmin === true;
        } catch (e) {
            console.warn('[AI-Social] Failed to check admin status:', e);
            return;
        }

        if (!isAdmin) {
            console.log('[AI-Social] User is not admin, skipping bot profile creation');
            return;
        }

        console.log('[AI-Social] Admin user detected, initializing bot profiles...');
        
        for (const [key, char] of Object.entries(BOT_CHARACTERS)) {
            try {
                const doc = await db.collection('bot_profiles').doc(char.uid).get();
                if (!doc.exists) {
                    await db.collection('bot_profiles').doc(char.uid).set({
                        email: `${key}@crowny.bot`,
                        nickname: char.nickname,
                        photoURL: char.avatar,
                        isBot: true,
                        botCharacter: key,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        statusMessage: `${char.emoji} AI 크라우니 멤버`,
                        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
                        version: '1.1'
                    });
                    console.log(`[AI-Social] Bot profile created: ${char.nickname}`);
                } else {
                    console.log(`[AI-Social] Bot profile exists: ${char.nickname}`);
                }
            } catch (e) {
                console.error(`[AI-Social] Failed to create bot profile for ${key}:`, e);
            }
        }
    }

    // 메인 초기화 함수
    async function init() {
        if (initialized) {
            console.log('[AI-Social] Already initialized');
            return;
        }

        try {
            // API 키 로드
            geminiApiKey = await loadApiKey();
            
            // 봇 프로필 초기화
            if (checkDependencies()) {
                await initializeBotProfiles();
            } else {
                console.warn('[AI-Social] Bot profile initialization skipped - dependencies not ready');
            }
            
            initialized = true;
            console.log('[AI-Social] Initialization completed');
        } catch (e) {
            console.error('[AI-Social] Initialization failed:', e);
            throw e;
        }
    }

    // Gemini로 포스트 내용 생성
    async function generatePost(charKey) {
        const char = BOT_CHARACTERS[charKey];
        if (!char) {
            console.error(`[AI-Social] Unknown character: ${charKey}`);
            return null;
        }

        if (!geminiApiKey) {
            console.error('[AI-Social] Gemini API key not available');
            return null;
        }

        const lang = getCurrentLanguage();
        const langNames = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文', es: 'Español' };

        const now = new Date();
        const hour = now.getHours();
        let timeContext = '';
        if (hour < 10) timeContext = '아침 시간대';
        else if (hour < 14) timeContext = '점심 시간대';
        else if (hour < 18) timeContext = '오후 시간대';
        else timeContext = '저녁 시간대';

        const topic = char.topics[Math.floor(Math.random() * char.topics.length)];

        const prompt = `당신은 크라우니 플랫폼의 "${char.nickname}" 캐릭터입니다.
성격/말투: ${char.style}
지금은 ${timeContext}입니다.

소셜 피드에 올릴 짧은 글을 하나 작성하세요.
주제 힌트: ${topic}
${lang !== 'ko' ? `\n언어: ${langNames[lang] || lang}로 작성하세요.` : ''}

규칙:
- 2~4문장으로 짧고 임팩트 있게
- 해시태그 1~3개 포함 (#크라우니 필수)
- 이모지 자연스럽게 활용
- 광고처럼 보이지 않게, 진짜 사람이 쓴 것처럼
- 가끔 다른 멤버를 언급하거나 질문을 던져도 좋음
- JSON 없이 순수 텍스트만 출력`;

        try {
            console.log(`[AI-Social] Generating post for ${char.nickname} (${charKey})`);
            
            const res = await fetch(`${GEMINI_ENDPOINT}?key=${geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { 
                        temperature: 0.9, 
                        maxOutputTokens: 300,
                        topK: 40,
                        topP: 0.95
                    }
                })
            });
            
            if (!res.ok) {
                const errText = await res.text();
                console.error(`[AI-Social] Gemini API Error ${res.status}:`, errText);
                
                // 403 에러면 API 키 재로드 시도
                if (res.status === 403) {
                    console.log('[AI-Social] API key invalid, attempting reload...');
                    try {
                        const newKey = await loadApiKey();
                        if (newKey !== geminiApiKey) {
                            geminiApiKey = newKey;
                            console.log('[AI-Social] Retrying with new API key...');
                            return await generatePost(charKey); // 한 번만 재시도
                        }
                    } catch (e2) {
                        console.error('[AI-Social] Failed to reload API key:', e2);
                    }
                }
                
                // 429 (Rate Limit) 에러면 재시도 제안
                if (res.status === 429) {
                    console.warn('[AI-Social] Rate limit exceeded, please try again later');
                }
                
                return null;
            }
            
            const data = await res.json();
            const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            
            if (!generatedText) {
                console.error('[AI-Social] Empty response from Gemini API');
                return null;
            }
            
            console.log(`[AI-Social] Generated post for ${char.nickname}: ${generatedText.substring(0, 50)}...`);
            return generatedText;
            
        } catch (e) {
            console.error('[AI-Social] Generate post failed:', e);
            
            // Network 에러면 더 구체적인 메시지
            if (e.name === 'TypeError' && e.message.includes('Failed to fetch')) {
                console.error('[AI-Social] Network error - check internet connection');
            }
            
            return null;
        }
    }

    // 소셜 피드에 포스트 게시
    async function publishPost(charKey, text) {
        const char = BOT_CHARACTERS[charKey];
        if (!char) {
            console.error(`[AI-Social] Unknown character for publishing: ${charKey}`);
            return null;
        }
        
        if (!text || text.trim().length === 0) {
            console.error(`[AI-Social] Empty text for ${char.nickname}`);
            return null;
        }

        if (!checkDependencies()) {
            console.error('[AI-Social] Dependencies not available for publishing');
            return null;
        }

        const hashtags = (text.match(/#[\w가-힣]+/g) || []).map(h => h.slice(1));
        const mentions = (text.match(/@[\w가-힣]+/g) || []).map(m => m.slice(1));

        const postData = {
            userId: char.uid,
            text: text.trim(),
            imageUrl: null,
            likes: 0,
            likedBy: [],
            commentCount: 0,
            shareCount: 0,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            hashtags,
            mentions,
            isBot: true,
            botCharacter: charKey,
            characterEmoji: char.emoji,
            version: '1.1'
        };

        try {
            const ref = await db.collection('posts').add(postData);
            console.log(`[AI-Social] ${char.nickname} posted (${ref.id}): ${text.substring(0, 50)}...`);
            
            // Toast 표시 (함수가 있을 때만)
            if (typeof showToast === 'function') {
                showToast(`${char.emoji} ${char.nickname} 포스팅 완료!`, 'success');
            }
            
            return ref.id;
        } catch (e) {
            console.error('[AI-Social] Publish failed:', e);
            
            if (typeof showToast === 'function') {
                showToast(`❌ ${char.nickname} 포스팅 실패: ${e.message}`, 'error');
            }
            
            return null;
        }
    }

    // 댓글에 AI 답변
    async function replyToComment(postId, comment, charKey, commentId = null) {
        const char = BOT_CHARACTERS[charKey];
        if (!char) {
            console.error(`[AI-Social] Unknown character for reply: ${charKey}`);
            return false;
        }
        
        if (!comment || comment.trim().length === 0) {
            console.warn(`[AI-Social] Empty comment for reply`);
            return false;
        }

        if (!checkDependencies()) {
            console.error('[AI-Social] Dependencies not available for reply');
            return false;
        }

        if (!geminiApiKey) {
            console.error('[AI-Social] Gemini API key not available for reply');
            return false;
        }

        const lang = getCurrentLanguage();
        const langNames = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文', es: 'Español' };

        const prompt = `당신은 크라우니 플랫폼의 "${char.nickname}"입니다.
성격/말투: ${char.style}

사용자가 내 글에 이런 댓글을 남겼습니다: "${comment}"

자연스럽게 답글을 작성하세요.
${lang !== 'ko' ? `언어: ${langNames[lang] || lang}로 답변하세요.` : ''}

규칙:
- 1~2문장으로 짧게
- 캐릭터 성격 유지
- 친근하고 자연스럽게`;

        try {
            console.log(`[AI-Social] Generating reply for ${char.nickname} to: ${comment.substring(0, 50)}...`);
            
            const res = await fetch(`${GEMINI_ENDPOINT}?key=${geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { 
                        temperature: 0.8, 
                        maxOutputTokens: 150,
                        topK: 40,
                        topP: 0.95
                    }
                })
            });
            
            if (!res.ok) {
                const errText = await res.text();
                console.error(`[AI-Social] Reply generation failed ${res.status}:`, errText);
                return false;
            }
            
            const data = await res.json();
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            
            if (!reply) {
                console.error('[AI-Social] Empty reply generated');
                return false;
            }

            // 댓글 저장
            const commentData = {
                userId: char.uid,
                text: reply.trim(),
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                isBot: true,
                botCharacter: charKey,
                characterEmoji: char.emoji,
                version: '1.1'
            };
            
            if (commentId) {
                commentData.replyTo = commentId;
            }

            await db.collection('posts').doc(postId).collection('comments').add(commentData);
            
            // 댓글 카운트 업데이트
            await db.collection('posts').doc(postId).update({
                commentCount: firebase.firestore.FieldValue.increment(1)
            });
            
            console.log(`[AI-Social] ${char.nickname} replied: ${reply.substring(0, 50)}...`);
            return true;
            
        } catch (e) {
            console.error('[AI-Social] Reply failed:', e);
            return false;
        }
    }

    // 새 댓글 감지 → 봇 글에 달린 댓글이면 자동 답변 (안전성 강화)
    function watchBotPostComments() {
        if (commentWatchInitialized) {
            console.log('[AI-Social] Comment watch already initialized');
            return;
        }

        if (!checkDependencies()) {
            console.error('[AI-Social] Cannot initialize comment watch - dependencies not ready');
            return;
        }

        console.log('[AI-Social] Initializing comment watch system...');
        
        const botUids = Object.values(BOT_CHARACTERS).map(c => c.uid);
        const processedComments = new Set(); // 중복 처리 방지
        const replyTimeouts = new Map(); // 진행 중인 답변 추적

        try {
            // 최근 봇 포스트 감시 (더 안전한 범위)
            const postsQuery = db.collection('posts')
                .where('isBot', '==', true)
                .orderBy('timestamp', 'desc')
                .limit(10); // 20 -> 10으로 축소

            const unsubscribe = postsQuery.onSnapshot(
                snapshot => {
                    snapshot.docs.forEach(postDoc => {
                        const post = postDoc.data();
                        const charKey = post.botCharacter;
                        
                        if (!charKey || !BOT_CHARACTERS[charKey]) {
                            console.warn(`[AI-Social] Invalid character key: ${charKey}`);
                            return;
                        }

                        // 포스트별 댓글 감시
                        const commentQuery = postDoc.ref.collection('comments')
                            .orderBy('timestamp', 'desc')
                            .limit(3); // 5 -> 3으로 축소

                        const commentUnsubscribe = commentQuery.onSnapshot(
                            commentSnapshot => {
                                commentSnapshot.docChanges().forEach(change => {
                                    if (change.type !== 'added') return;
                                    
                                    const commentDoc = change.doc;
                                    const comment = commentDoc.data();
                                    const commentId = commentDoc.id;
                                    
                                    // 안전성 검사들
                                    if (comment.isBot) return; // 봇 댓글 무시
                                    if (processedComments.has(commentId)) return; // 이미 처리된 댓글
                                    if (!comment.text || comment.text.trim().length === 0) return; // 빈 댓글
                                    
                                    // 시간 검증 (더 관대하게 - 5분)
                                    const commentTime = comment.timestamp?.toDate?.();
                                    if (commentTime) {
                                        const timeDiff = Date.now() - commentTime.getTime();
                                        if (timeDiff > 300000) return; // 5분 초과
                                        if (timeDiff < 0) return; // 미래 시간 (이상한 데이터)
                                    }
                                    
                                    // 처리 중인지 확인
                                    if (replyTimeouts.has(commentId)) {
                                        console.log(`[AI-Social] Comment ${commentId} already being processed`);
                                        return;
                                    }
                                    
                                    // 처리 표시
                                    processedComments.add(commentId);
                                    
                                    // 자연스러운 딜레이 (5~15초)
                                    const delay = 5000 + Math.random() * 10000;
                                    
                                    const timeoutId = setTimeout(async () => {
                                        try {
                                            console.log(`[AI-Social] Processing comment from ${comment.userId}: ${comment.text.substring(0, 30)}...`);
                                            const success = await replyToComment(postDoc.id, comment.text, charKey, commentId);
                                            
                                            if (success) {
                                                console.log(`[AI-Social] Successfully replied to comment ${commentId}`);
                                            } else {
                                                console.warn(`[AI-Social] Failed to reply to comment ${commentId}`);
                                            }
                                        } catch (e) {
                                            console.error(`[AI-Social] Error processing comment ${commentId}:`, e);
                                        } finally {
                                            replyTimeouts.delete(commentId);
                                        }
                                    }, delay);
                                    
                                    replyTimeouts.set(commentId, timeoutId);
                                    console.log(`[AI-Social] Scheduled reply for comment ${commentId} in ${Math.round(delay/1000)}s`);
                                });
                            },
                            error => {
                                console.error('[AI-Social] Comment snapshot error:', error);
                            }
                        );
                        
                        // 구독 추적
                        activeWatchers.add(commentUnsubscribe);
                    });
                },
                error => {
                    console.error('[AI-Social] Posts snapshot error:', error);
                    commentWatchInitialized = false;
                }
            );
            
            activeWatchers.add(unsubscribe);
            commentWatchInitialized = true;
            console.log('[AI-Social] Comment watch system initialized successfully');
            
        } catch (e) {
            console.error('[AI-Social] Failed to initialize comment watch:', e);
            commentWatchInitialized = false;
        }
    }

    // 댓글 감시 중지
    function stopWatchingComments() {
        console.log('[AI-Social] Stopping comment watch...');
        
        activeWatchers.forEach(unsubscribe => {
            try {
                unsubscribe();
            } catch (e) {
                console.warn('[AI-Social] Error unsubscribing watcher:', e);
            }
        });
        
        activeWatchers.clear();
        commentWatchInitialized = false;
        console.log('[AI-Social] Comment watch stopped');
    }

    // 자동 포스팅 (관리자가 트리거) - 안전성 강화
    async function autoPostAll() {
        console.log('[AI-Social] Starting auto post for all characters...');
        
        // 초기화 확인
        if (!initialized) {
            try {
                await init();
            } catch (e) {
                console.error('[AI-Social] Failed to initialize for auto posting:', e);
                return [{ error: 'Initialization failed', details: e.message }];
            }
        }

        if (!checkDependencies()) {
            return [{ error: 'Dependencies not available' }];
        }

        const results = [];
        const startTime = Date.now();

        for (const [key, char] of Object.entries(BOT_CHARACTERS)) {
            try {
                console.log(`[AI-Social] Generating post for ${char.nickname}...`);
                
                const text = await generatePost(key);
                if (text) {
                    // 캐릭터 간 자연스러운 시간차 (2~5초)
                    const delay = 2000 + Math.random() * 3000;
                    await new Promise(r => setTimeout(r, delay));
                    
                    const postId = await publishPost(key, text);
                    if (postId) {
                        results.push({ 
                            character: char.nickname, 
                            postId, 
                            text: text.substring(0, 80),
                            success: true,
                            emoji: char.emoji
                        });
                    } else {
                        results.push({ 
                            character: char.nickname, 
                            error: '게시 실패',
                            success: false 
                        });
                    }
                } else {
                    results.push({ 
                        character: char.nickname, 
                        error: 'AI 응답 생성 실패',
                        success: false 
                    });
                }
            } catch (e) {
                console.error(`[AI-Social] Error with ${char.nickname}:`, e);
                results.push({ 
                    character: char.nickname, 
                    error: e.message,
                    success: false 
                });
            }
        }

        const duration = Math.round((Date.now() - startTime) / 1000);
        const successCount = results.filter(r => r.success).length;
        
        console.log(`[AI-Social] Auto posting completed: ${successCount}/${results.length} successful in ${duration}s`);
        
        return {
            results,
            summary: {
                total: results.length,
                successful: successCount,
                failed: results.length - successCount,
                duration: `${duration}s`
            }
        };
    }

    // 특정 캐릭터만 포스팅 - 안전성 강화
    async function autoPostOne(charKey) {
        if (!BOT_CHARACTERS[charKey]) {
            console.error(`[AI-Social] Unknown character: ${charKey}`);
            return { error: `Unknown character: ${charKey}`, success: false };
        }

        const char = BOT_CHARACTERS[charKey];
        console.log(`[AI-Social] Starting auto post for ${char.nickname}...`);

        // 초기화 확인
        if (!initialized) {
            try {
                await init();
            } catch (e) {
                console.error('[AI-Social] Failed to initialize for single post:', e);
                return { character: char.nickname, error: 'Initialization failed', success: false };
            }
        }

        if (!checkDependencies()) {
            return { character: char.nickname, error: 'Dependencies not available', success: false };
        }

        try {
            const text = await generatePost(charKey);
            if (text) {
                const postId = await publishPost(charKey, text);
                if (postId) {
                    return { 
                        character: char.nickname, 
                        postId, 
                        text: text.substring(0, 80),
                        emoji: char.emoji,
                        success: true 
                    };
                } else {
                    return { character: char.nickname, error: '게시 실패', success: false };
                }
            } else {
                return { character: char.nickname, error: 'AI 응답 생성 실패', success: false };
            }
        } catch (e) {
            console.error(`[AI-Social] Error with ${char.nickname}:`, e);
            return { character: char.nickname, error: e.message, success: false };
        }
    }

    // 봇 포스트에 봇 배지 표시를 위한 헬퍼
    function isBotUser(userId) {
        return Object.values(BOT_CHARACTERS).some(c => c.uid === userId);
    }

    function getBotBadge(userId) {
        for (const [key, char] of Object.entries(BOT_CHARACTERS)) {
            if (char.uid === userId) return `<span style="background:linear-gradient(135deg,#8B6914,#F0C060);color:#3D2B1F;font-size:0.6rem;padding:0.1rem 0.4rem;border-radius:10px;font-weight:700;margin-left:0.3rem;">AI ${char.emoji}</span>`;
        }
        return '';
    }

    // 상태 확인 함수
    function getStatus() {
        return {
            initialized,
            commentWatchInitialized,
            activeWatchers: activeWatchers.size,
            hasApiKey: !!geminiApiKey,
            dependenciesReady: checkDependencies(),
            characters: Object.keys(BOT_CHARACTERS).length,
            version: '1.1'
        };
    }

    // 강제 재초기화
    async function reinitialize() {
        console.log('[AI-Social] Force reinitializing...');
        
        stopWatchingComments();
        initialized = false;
        geminiApiKey = '';
        
        try {
            await init();
            watchBotPostComments();
            console.log('[AI-Social] Reinitialization completed');
            return true;
        } catch (e) {
            console.error('[AI-Social] Reinitialization failed:', e);
            return false;
        }
    }

    return {
        // 초기화
        init,
        reinitialize,
        getStatus,
        
        // 포스팅
        autoPostAll,
        autoPostOne,
        generatePost,
        publishPost,
        
        // 댓글 처리
        watchBotPostComments,
        stopWatchingComments,
        replyToComment,
        
        // 유틸리티
        isBotUser,
        getBotBadge,
        getCurrentLanguage,
        checkDependencies,
        
        // 상수
        BOT_CHARACTERS
    };
})();