// ===== mentor-learning.js v1.0 - Self-Improving Mentor System =====
// Signal logging, outcome tracking, adaptive parameter tuning

// ========== ADAPTIVE PARAMETERS ==========
// Each mentor's tunable parameters with min/max bounds

const MENTOR_PARAM_DEFS = {
    kps: {
        emaShort:   { default: 20, min: 15, max: 25, step: 1 },
        emaLong:    { default: 50, min: 40, max: 60, step: 2 },
        crossThreshold: { default: 0.5, min: 0.1, max: 2.0, step: 0.1 },
        trendMinGap:    { default: 5, min: 2, max: 15, step: 1 },
    },
    michael: {
        momentumCandles: { default: 3, min: 2, max: 10, step: 1 },
        volSpikeMult:    { default: 1.5, min: 1.2, max: 2.0, step: 0.1 },
        strongThreshold: { default: 0.08, min: 0.04, max: 0.15, step: 0.01 },
        weakThreshold:   { default: 0.04, min: 0.02, max: 0.08, step: 0.005 },
        rocThreshold:    { default: 0.03, min: 0.01, max: 0.06, step: 0.005 },
    },
    matthew: {
        rsiPeriod:       { default: 14, min: 10, max: 20, step: 1 },
        rsiOverbought:   { default: 70, min: 65, max: 75, step: 1 },
        rsiOversold:     { default: 30, min: 25, max: 35, step: 1 },
        macdFast:        { default: 12, min: 10, max: 14, step: 1 },
        macdSlow:        { default: 26, min: 22, max: 30, step: 1 },
        macdSignal:      { default: 9, min: 7, max: 11, step: 1 },
        bbPeriod:        { default: 20, min: 15, max: 25, step: 1 },
    },
    hansun: {
        fibLookback:     { default: 100, min: 60, max: 150, step: 10 },
        srLookback:      { default: 80, min: 50, max: 120, step: 10 },
        srSensitivity:   { default: 0.05, min: 0.02, max: 0.10, step: 0.01 },
        fibProxThreshold:{ default: 0.03, min: 0.01, max: 0.06, step: 0.005 },
        patternThreshold:{ default: 0.03, min: 0.01, max: 0.05, step: 0.005 },
    },
};

// Evaluation windows per mentor (in seconds)
const EVAL_WINDOWS = {
    michael: [5 * 60],             // 5min
    kps:     [15 * 60],            // 15min
    matthew: [15 * 60],            // 15min
    hansun:  [60 * 60],            // 60min
};

// ========== IN-MEMORY STATE ==========

const mentorLearning = {
    // Current adaptive params (loaded from Firestore or defaults)
    params: {},
    // Performance stats per mentor
    stats: {},
    // Pending signals awaiting outcome evaluation
    pendingSignals: [],
    // Recent signal history (last 100 per mentor, for UI)
    history: {},
    // Firestore cache timestamp
    _lastFirestoreSync: 0,
    _dirty: false,
    _initialized: false,
};

// ========== INITIALIZATION ==========

async function initMentorLearning() {
    if (mentorLearning._initialized) return;
    mentorLearning._initialized = true;

    // Set defaults
    for (const [mid, defs] of Object.entries(MENTOR_PARAM_DEFS)) {
        mentorLearning.params[mid] = {};
        for (const [key, def] of Object.entries(defs)) {
            mentorLearning.params[mid][key] = def.default;
        }
        mentorLearning.stats[mid] = { totalSignals: 0, correctSignals: 0, winRate: 0, avgPnl: 0, lastAdapted: null };
        mentorLearning.history[mid] = [];
    }

    // Load from Firestore
    await loadMentorPerformance();

    // Start outcome evaluation timer (every 30s)
    setInterval(evaluatePendingSignals, 30000);

    // Start adaptation check (every 5 min)
    setInterval(checkAdaptation, 5 * 60 * 1000);

    console.log('🧠 멘토 학습 시스템 초기화 완료');
}

// ========== FIRESTORE PERSISTENCE ==========

async function loadMentorPerformance() {
    if (typeof db === 'undefined') return;
    try {
        for (const mid of Object.keys(MENTOR_PARAM_DEFS)) {
            const doc = await db.collection('mentor_performance').doc(mid).get();
            if (doc.exists) {
                const data = doc.data();
                if (data.params) {
                    // Merge with bounds checking
                    for (const [key, val] of Object.entries(data.params)) {
                        const def = MENTOR_PARAM_DEFS[mid]?.[key];
                        if (def) {
                            mentorLearning.params[mid][key] = Math.max(def.min, Math.min(def.max, val));
                        }
                    }
                }
                if (data.stats) Object.assign(mentorLearning.stats[mid], data.stats);
                if (data.history) mentorLearning.history[mid] = data.history.slice(-100);
            }
        }
        mentorLearning._lastFirestoreSync = Date.now();
        console.log('🧠 Firestore에서 멘토 성과 데이터 로드 완료');
    } catch (e) {
        console.warn('🧠 멘토 성과 로드 실패:', e.message);
    }
}

async function saveMentorPerformance(mentorId) {
    if (typeof db === 'undefined') return;
    try {
        await db.collection('mentor_performance').doc(mentorId).set({
            params: mentorLearning.params[mentorId],
            stats: mentorLearning.stats[mentorId],
            history: mentorLearning.history[mentorId].slice(-100),
            updatedAt: new Date(),
        }, { merge: true });
    } catch (e) {
        console.warn('🧠 멘토 성과 저장 실패:', e.message);
    }
}

// ========== SIGNAL LOGGING ==========

function logMentorSignal(mentorId, signal, confidence, price) {
    // Only log actionable signals (buy/sell)
    if (signal !== 'buy' && signal !== 'sell') return;
    if (!price || price < 1000) return;

    const record = {
        mentorId,
        signal,
        confidence,
        price,
        timestamp: Date.now(),
        outcomePrice: null,
        outcome: null,
        pnl: null,
        evalWindow: (EVAL_WINDOWS[mentorId] || [15 * 60])[0],
    };

    mentorLearning.pendingSignals.push(record);

    // Cap pending queue
    if (mentorLearning.pendingSignals.length > 500) {
        mentorLearning.pendingSignals = mentorLearning.pendingSignals.slice(-400);
    }
}

// ========== OUTCOME EVALUATION ==========

function evaluatePendingSignals() {
    if (!currentPrice || currentPrice < 1000) return;
    const now = Date.now();
    const completed = [];

    for (let i = mentorLearning.pendingSignals.length - 1; i >= 0; i--) {
        const sig = mentorLearning.pendingSignals[i];
        const elapsed = (now - sig.timestamp) / 1000;

        if (elapsed >= sig.evalWindow) {
            // Evaluate
            sig.outcomePrice = currentPrice;
            const change = (currentPrice - sig.price) / sig.price;

            if (Math.abs(change) < 0.0001) {
                sig.outcome = 'neutral';
            } else if (sig.signal === 'buy') {
                sig.outcome = change > 0 ? 'correct' : 'wrong';
            } else {
                sig.outcome = change < 0 ? 'correct' : 'wrong';
            }
            sig.pnl = sig.signal === 'buy'
                ? currentPrice - sig.price
                : sig.price - currentPrice;

            completed.push(sig);
            mentorLearning.pendingSignals.splice(i, 1);

            // Update stats
            updateMentorStats(sig);
        }
    }

    if (completed.length > 0) {
        mentorLearning._dirty = true;
        renderMentorPanel(); // refresh UI
    }
}

function updateMentorStats(sig) {
    const mid = sig.mentorId;
    const stats = mentorLearning.stats[mid];
    const history = mentorLearning.history[mid];

    history.push({
        signal: sig.signal,
        price: sig.price,
        outcomePrice: sig.outcomePrice,
        outcome: sig.outcome,
        pnl: sig.pnl,
        confidence: sig.confidence,
        timestamp: sig.timestamp,
    });

    // Keep last 100
    if (history.length > 100) history.splice(0, history.length - 100);

    // Recalculate stats from history
    const evaluated = history.filter(h => h.outcome === 'correct' || h.outcome === 'wrong');
    stats.totalSignals = evaluated.length;
    stats.correctSignals = evaluated.filter(h => h.outcome === 'correct').length;
    stats.winRate = stats.totalSignals > 0 ? stats.correctSignals / stats.totalSignals : 0;
    stats.avgPnl = evaluated.length > 0
        ? evaluated.reduce((sum, h) => sum + (h.pnl || 0), 0) / evaluated.length
        : 0;

    // Save to Firestore (debounced — every 10 signals or 2 min)
    if (stats.totalSignals % 10 === 0 || !mentorLearning._lastFirestoreSync || Date.now() - mentorLearning._lastFirestoreSync > 120000) {
        saveMentorPerformance(mid);
        mentorLearning._lastFirestoreSync = Date.now();
    }
}

// ========== ADAPTIVE PARAMETER TUNING ==========

function checkAdaptation() {
    for (const mid of Object.keys(MENTOR_PARAM_DEFS)) {
        const stats = mentorLearning.stats[mid];
        const history = mentorLearning.history[mid];
        const evaluated = history.filter(h => h.outcome === 'correct' || h.outcome === 'wrong');

        // Need at least 20 evaluated signals
        if (evaluated.length < 20) continue;

        // Check if last adaptation was recent (within 50 signals)
        if (stats.lastAdapted && evaluated.length - (stats._lastAdaptCount || 0) < 50) continue;

        adaptParameters(mid);
    }
}

function adaptParameters(mentorId) {
    const stats = mentorLearning.stats[mentorId];
    const defs = MENTOR_PARAM_DEFS[mentorId];
    const params = mentorLearning.params[mentorId];
    const winRate = stats.winRate;

    let mode;
    if (winRate < 0.5) {
        mode = 'explore'; // big changes
    } else if (winRate < 0.7) {
        mode = 'finetune'; // small changes
    } else {
        mode = 'keep'; // don't touch what works
    }

    if (mode === 'keep') {
        stats.lastAdapted = Date.now();
        stats._lastAdaptCount = stats.totalSignals;
        console.log(`🧠 ${mentorId}: 승률 ${(winRate * 100).toFixed(0)}% → 파라미터 유지`);
        return;
    }

    const range = mode === 'explore' ? 0.15 : 0.05; // ±15% or ±5%

    for (const [key, def] of Object.entries(defs)) {
        const current = params[key];
        const delta = (def.max - def.min) * range;
        const shift = (Math.random() - 0.5) * 2 * delta;
        let newVal = current + shift;

        // Snap to step
        newVal = Math.round(newVal / def.step) * def.step;
        // Clamp
        newVal = Math.max(def.min, Math.min(def.max, newVal));

        params[key] = newVal;
    }

    stats.lastAdapted = Date.now();
    stats._lastAdaptCount = stats.totalSignals;

    console.log(`🧠 ${mentorId}: 승률 ${(winRate * 100).toFixed(0)}% → ${mode} 모드 파라미터 조정`, params);

    // Persist
    saveMentorPerformance(mentorId);
}

// ========== PARAMETER GETTER (for mentors.js) ==========

function getMentorParams(mentorId) {
    return mentorLearning.params[mentorId] || {};
}

function getMentorStats(mentorId) {
    return mentorLearning.stats[mentorId] || { totalSignals: 0, correctSignals: 0, winRate: 0, avgPnl: 0 };
}

function getMentorHistory(mentorId) {
    return mentorLearning.history[mentorId] || [];
}

// ========== UI: PERFORMANCE PANEL ==========

function renderMentorPerformanceUI(mentorId) {
    const stats = getMentorStats(mentorId);
    const history = getMentorHistory(mentorId);

    if (stats.totalSignals === 0) {
        return `<div style="color:#6B5744; font-size:0.72rem; margin-top:6px;">📊 아직 평가된 시그널이 없습니다. 시그널이 쌓이면 성과가 표시됩니다.</div>`;
    }

    const winPct = Math.round(stats.winRate * 100);
    const avgPnl = stats.avgPnl.toFixed(1);
    const avgPnlColor = stats.avgPnl >= 0 ? '#00cc66' : '#B54534';
    const winColor = winPct >= 70 ? '#00cc66' : winPct >= 50 ? '#ffaa00' : '#B54534';

    // Recent 10 dots
    const recent = history.slice(-10);
    const dots = recent.map(h => {
        if (h.outcome === 'correct') return '🟢';
        if (h.outcome === 'wrong') return '🔴';
        return '⚪';
    }).join('');

    // Win rate gauge bar
    const gaugeWidth = Math.min(100, Math.max(0, winPct));

    // Last adapted
    let adaptedText = '';
    if (stats.lastAdapted) {
        const ago = Math.round((Date.now() - stats.lastAdapted) / 60000);
        if (ago < 60) adaptedText = `${ago}분 전`;
        else if (ago < 1440) adaptedText = `${Math.round(ago / 60)}시간 전`;
        else adaptedText = `${Math.round(ago / 1440)}일 전`;
    }

    return `
        <div style="margin-top:8px; padding:8px; background:rgba(255,255,255,0.03); border-radius:6px; font-size:0.72rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span style="color:${winColor}; font-weight:700;">승률 ${winPct}%</span>
                <span style="color:#6B5744;">(${stats.correctSignals}/${stats.totalSignals})</span>
                <span style="color:${avgPnlColor};">평균 ${stats.avgPnl >= 0 ? '+' : ''}${avgPnl}pt</span>
            </div>
            <div style="background:rgba(255,255,255,0.1); height:4px; border-radius:2px; margin-bottom:4px;">
                <div style="background:${winColor}; height:100%; border-radius:2px; width:${gaugeWidth}%; transition:width 0.5s;"></div>
            </div>
            <div style="margin-bottom:4px;">최근: ${dots || '—'}</div>
            ${adaptedText ? `<div style="color:#6B5744; font-size:0.65rem;">🔧 마지막 최적화: ${adaptedText}</div>` : ''}
        </div>`;
}

// ========== DASHBOARD (all mentors summary) ==========

function renderMentorDashboard() {
    const mentorIds = ['kps', 'michael', 'matthew', 'hansun', 'crownygirl'];
    const icons = { kps: '👑', michael: '🎯', matthew: '📊', hansun: '🧘', crownygirl: '🦸‍♀️' };
    const names = { kps: 'KPS', michael: '마이클', matthew: '매튜', hansun: '한선', crownygirl: '크라우니걸' };

    let html = '<div style="font-size:0.72rem; padding:6px;">';
    for (const mid of mentorIds) {
        const stats = getMentorStats(mid);
        const history = getMentorHistory(mid);
        const winPct = stats.totalSignals > 0 ? Math.round(stats.winRate * 100) : '—';
        const dots = history.slice(-10).map(h => h.outcome === 'correct' ? '🟢' : h.outcome === 'wrong' ? '🔴' : '⚪').join('');
        const avgPnl = stats.totalSignals > 0 ? `${stats.avgPnl >= 0 ? '+' : ''}${stats.avgPnl.toFixed(1)}pt` : '—';

        html += `<div style="display:flex; gap:6px; align-items:center; margin-bottom:3px;">
            <span>${icons[mid]} ${names[mid]}</span>
            <span style="color:${typeof winPct === 'number' && winPct >= 60 ? '#00cc66' : '#6B5744'};">승률: ${winPct}%</span>
            <span style="color:#6B5744;">(${stats.correctSignals}/${stats.totalSignals})</span>
            <span style="color:#6B5744;">평균: ${avgPnl}</span>
            <span>${dots || '—'}</span>
        </div>`;
    }
    html += '</div>';
    return html;
}
