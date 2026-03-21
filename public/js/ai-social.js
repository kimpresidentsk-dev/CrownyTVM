// ===== ai-social.js - AI 캐릭터 소셜 봇 시스템 (v1.1 REST API migrated) =====
// 5명의 AI 캐릭터가 소셜 피드에 자동 포스팅 + 댓글 답변

const AI_SOCIAL = (() => {
    // Safe i18n helper (returns fallback if t() is not yet loaded)
    const _t = (key, fallback) => (typeof t === 'function' ? t(key, fallback) : fallback);

    const _authHeaders = () => {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
    };

    // 상태 관리
    let initialized = false;
    let commentWatchInitialized = false;
    let commentPollInterval = null;

    // 캐릭터 봇 계정 UID
    const BOT_CHARACTERS = {
        kps: {
            uid: 'bot_kps',
            get nickname() { return _t('aisocial.name_kps', 'KPS Kim Sunkyung'); },
            avatar: 'images/kps-avatar.png',
            emoji: '',
            topics: ['비전', '전략', '리더십', '크라우니 사업', '팀워크', '긍정 에너지', '화장품', '글로벌 시장'],
            style: '격식체, 전략적, 큰 그림, 낙천적. 사업가 관점에서 인사이트 공유. 팀원들을 격려하고 크라우니의 미래를 이야기함.',
            postFrequency: 'daily'
        },
        hansun: {
            uid: 'bot_hansun',
            get nickname() { return _t('aisocial.name_hansun', 'Hansun Piano'); },
            avatar: 'images/hansun-avatar.png',
            emoji: '',
            topics: ['피아노', '음악', '트레이딩', '일상', 'MZ세대', '자기계발', '감성'],
            style: '부드러운 존댓말(~요), 이모지 활용, 따뜻하고 공감적. 음악과 투자 이야기를 섞음. 겸손하고 평화로운 톤.',
            postFrequency: 'daily'
        },
        michael: {
            uid: 'bot_michael',
            get nickname() { return _t('aisocial.name_michael', 'Michael'); },
            avatar: 'images/michael-avatar.png',
            emoji: '',
            topics: ['공연', '엔터테인먼트', '트레이딩', '콘텐츠', '마케팅', '실행력', '현장 이야기'],
            style: '직설적, 실용적. "결론부터 말하면" 스타일. 형 같은 느낌. 행동 중심 조언. 풍부한 경험담.',
            postFrequency: 'daily'
        },
        matthew: {
            uid: 'bot_matthew',
            get nickname() { return _t('aisocial.name_matthew', 'Matthew'); },
            avatar: 'images/matthew-avatar.png',
            emoji: '',
            topics: ['블록체인', '기술', '음향', '데이터 분석', '토큰 경제', '시스템', '신뢰'],
            style: '논리적, 데이터 기반. 숫자와 근거 제시. 차분하고 신뢰감 있는 말투. 기술 인사이트 공유.',
            postFrequency: 'daily'
        },
        crownygirl: {
            uid: 'bot_crownygirl',
            get nickname() { return _t('aisocial.name_crownygirl', 'Crowny Girl'); },
            avatar: 'images/crownygirl-avatar.png',
            emoji: '<i data-lucide="sparkles" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>',
            topics: ['뷰티', '화장품', '스킨케어', '건강', '운동', '다이어트', '일상 팁', '긍정'],
            style: '밝고 친근, 에너지 넘침. 이모지 많이 사용. 가끔 엉뚱. "크라우니걸이 도와드릴게요! <i data-lucide="sparkles" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i>" 같은 표현. 뷰티/건강 전문.',
            postFrequency: 'daily'
        }
    };

    let geminiApiKey = null; // API key managed server-side

    // 의존성 검증 (no longer requires db/firebase)
    function checkDependencies() {
        if (typeof currentUser === 'undefined' || !currentUser) {
            console.error('[AI-Social] Missing currentUser');
            return false;
        }
        return true;
    }

    // 안전한 언어 감지
    function getCurrentLanguage() {
        if (typeof window.currentLang !== 'undefined' && window.currentLang) {
            return window.currentLang;
        }
        const htmlLang = document.documentElement.lang;
        if (htmlLang) return htmlLang.substr(0, 2);
        const browserLang = navigator.language || navigator.userLanguage;
        return browserLang ? browserLang.substr(0, 2) : 'ko';
    }

    // API 키 로드 (보안 강화)
    async function loadApiKey() {
        return null; // API key managed server-side via /api/ai/gemini proxy
    }

    // 봇 프로필 초기화
    async function initializeBotProfiles() {
        if (!currentUser) return;

        // 관리자 권한 확인
        let isAdmin = false;
        try {
            const res = await fetch('/api/db/users/' + currentUser.uid, { headers: _authHeaders() });
            const userDoc = await res.json();
            const userData = userDoc.data || {};
            isAdmin = userData.isAdmin === true;
        } catch (e) {
            console.warn('[AI-Social] Failed to check admin status:', e);
            return;
        }

        if (!isAdmin) return;

        for (const [key, char] of Object.entries(BOT_CHARACTERS)) {
            try {
                const res = await fetch('/api/db/bot_profiles/' + char.uid, { headers: _authHeaders() });
                const doc = await res.json();
                if (!doc.exists) {
                    await fetch('/api/db/bot_profiles/' + char.uid, {
                        method: 'PUT',
                        headers: _authHeaders(),
                        body: JSON.stringify({
                            _merge: false,
                            email: `${key}@crowny.bot`,
                            nickname: char.nickname,
                            photoURL: char.avatar,
                            isBot: true,
                            botCharacter: key,
                            createdAt: new Date().toISOString(),
                            statusMessage: `${char.emoji} ${_t('aisocial.status_ai_member', 'AI Crowny Member')}`,
                            lastActive: new Date().toISOString(),
                            version: '1.1'
                        })
                    });
                }
            } catch (e) {
                console.error(`[AI-Social] Failed to create bot profile for ${key}:`, e);
            }
        }
    }

    // 메인 초기화 함수
    async function init() {
        if (initialized) return;

        try {
            geminiApiKey = await loadApiKey();
            if (checkDependencies()) {
                await initializeBotProfiles();
            } else {
                console.warn('[AI-Social] Bot profile initialization skipped - dependencies not ready');
            }
            initialized = true;
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

        const lang = getCurrentLanguage();
        const langNames = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文', es: 'Español' };

        const now = new Date();
        const hour = now.getHours();
        let timeContext = '';
        if (hour < 10) timeContext = _t('aisocial.time_morning', 'Morning');
        else if (hour < 14) timeContext = _t('aisocial.time_lunch', 'Lunchtime');
        else if (hour < 18) timeContext = _t('aisocial.time_afternoon', 'Afternoon');
        else timeContext = _t('aisocial.time_evening', 'Evening');

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
            const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
            const res = await fetch('/api/ai/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
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

            return generatedText;

        } catch (e) {
            console.error('[AI-Social] Generate post failed:', e);
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
            timestamp: new Date().toISOString(),
            hashtags,
            mentions,
            isBot: true,
            botCharacter: charKey,
            characterEmoji: char.emoji,
            version: '1.1'
        };

        try {
            const res = await fetch('/api/db/posts', {
                method: 'POST',
                headers: _authHeaders(),
                body: JSON.stringify(postData)
            });
            const result = await res.json();

            if (typeof showToast === 'function') {
                showToast(`${char.emoji} ${char.nickname} ${_t('aisocial.post_success', 'posted successfully!')}`, 'success');
            }

            return result.id;
        } catch (e) {
            console.error('[AI-Social] Publish failed:', e);
            if (typeof showToast === 'function') {
                showToast(`${char.nickname} ${_t('aisocial.post_failed', 'post failed:')} ${e.message}`, 'error');
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
            const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
            const res = await fetch('/api/ai/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
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
                timestamp: new Date().toISOString(),
                isBot: true,
                botCharacter: charKey,
                characterEmoji: char.emoji,
                version: '1.1'
            };

            if (commentId) {
                commentData.replyTo = commentId;
            }

            await fetch(`/api/db/posts/${postId}/comments`, {
                method: 'POST',
                headers: _authHeaders(),
                body: JSON.stringify(commentData)
            });

            // 댓글 카운트 업데이트
            await fetch(`/api/db/posts/${postId}`, {
                method: 'PUT',
                headers: _authHeaders(),
                body: JSON.stringify({
                    commentCount: { __fieldValue: 'increment', operand: 1 }
                })
            });

            return true;

        } catch (e) {
            console.error('[AI-Social] Reply failed:', e);
            return false;
        }
    }

    // 새 댓글 감지 → 봇 글에 달린 댓글이면 자동 답변 (polling-based)
    function watchBotPostComments() {
        if (commentWatchInitialized) return;
        if (!checkDependencies()) {
            console.error('[AI-Social] Cannot initialize comment watch - dependencies not ready');
            return;
        }

        const processedComments = new Set();

        async function pollForNewComments() {
            try {
                // Get recent bot posts
                const postsRes = await fetch('/api/db/posts?where=isBot,==,true&orderBy=timestamp&orderDir=desc&limit=10', { headers: _authHeaders() });
                const postsSnap = await postsRes.json();

                for (const postDoc of (postsSnap.docs || [])) {
                    const post = postDoc.data;
                    const charKey = post.botCharacter;
                    if (!charKey || !BOT_CHARACTERS[charKey]) continue;

                    // Get recent comments on this post
                    const commentsRes = await fetch(`/api/db/posts/${postDoc.id}/comments?orderBy=timestamp&orderDir=desc&limit=3`, { headers: _authHeaders() });
                    const commentsSnap = await commentsRes.json();

                    for (const commentDoc of (commentsSnap.docs || [])) {
                        const comment = commentDoc.data;
                        const cId = commentDoc.id;

                        if (comment.isBot) continue;
                        if (processedComments.has(cId)) continue;
                        if (!comment.text || comment.text.trim().length === 0) continue;

                        // Time check (5 min)
                        if (comment.timestamp) {
                            const timeDiff = Date.now() - new Date(comment.timestamp).getTime();
                            if (timeDiff > 300000 || timeDiff < 0) continue;
                        }

                        processedComments.add(cId);

                        // Natural delay
                        const delay = 5000 + Math.random() * 10000;
                        setTimeout(async () => {
                            try {
                                await replyToComment(postDoc.id, comment.text, charKey, cId);
                            } catch (e) {
                                console.error(`[AI-Social] Error processing comment ${cId}:`, e);
                            }
                        }, delay);
                    }
                }
            } catch (e) {
                console.error('[AI-Social] Comment poll error:', e);
            }
        }

        // Poll every 30 seconds
        commentPollInterval = setInterval(pollForNewComments, 30000);
        pollForNewComments(); // initial poll
        commentWatchInitialized = true;
    }

    // 댓글 감시 중지
    function stopWatchingComments() {
        if (commentPollInterval) {
            clearInterval(commentPollInterval);
            commentPollInterval = null;
        }
        commentWatchInitialized = false;
    }

    // 자동 포스팅 (관리자가 트리거)
    async function autoPostAll() {
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
                const text = await generatePost(key);
                if (text) {
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
                            error: _t('aisocial.error_publish', 'Publish failed'),
                            success: false
                        });
                    }
                } else {
                    results.push({
                        character: char.nickname,
                        error: _t('aisocial.error_generate', 'AI response generation failed'),
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

    // 특정 캐릭터만 포스팅
    async function autoPostOne(charKey) {
        if (!BOT_CHARACTERS[charKey]) {
            console.error(`[AI-Social] Unknown character: ${charKey}`);
            return { error: `Unknown character: ${charKey}`, success: false };
        }

        const char = BOT_CHARACTERS[charKey];
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
                    return { character: char.nickname, error: _t('aisocial.error_publish', 'Publish failed'), success: false };
                }
            } else {
                return { character: char.nickname, error: _t('aisocial.error_generate', 'AI response generation failed'), success: false };
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
            activeWatchers: commentPollInterval ? 1 : 0,
            hasApiKey: !!geminiApiKey,
            dependenciesReady: checkDependencies(),
            characters: Object.keys(BOT_CHARACTERS).length,
            version: '1.1'
        };
    }

    // 강제 재초기화
    async function reinitialize() {
        stopWatchingComments();
        initialized = false;
        geminiApiKey = '';

        try {
            await init();
            watchBotPostComments();
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
