// ===== mentors.js v2.3 - Trading Mentor Bot System (Self-Improving) =====
// 4 mentor bots with unique strategies + adaptive parameter tuning

// ========== MENTOR SETTINGS ==========
const MENTOR_SETTINGS_KEY = 'mentorSettings';
function getMentorSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(MENTOR_SETTINGS_KEY));
        return { 
            panel: s?.panel !== false, 
            comment: s?.comment !== false, 
            notif: s?.notif !== false,
            // 멘토별 알림 필터 (기본: 전체 ON)
            mentorFilter: s?.mentorFilter || { kps: true, michael: true, matthew: true, hansun: true, crownygirl: true }
        };
    } catch { return { panel: true, comment: true, notif: true, mentorFilter: { kps: true, michael: true, matthew: true, hansun: true, crownygirl: true } }; }
}
function saveMentorSettings(s) { localStorage.setItem(MENTOR_SETTINGS_KEY, JSON.stringify(s)); }

function toggleMentorFilter(mentorId) {
    const s = getMentorSettings();
    if (!s.mentorFilter) s.mentorFilter = { kps: true, michael: true, matthew: true, hansun: true, crownygirl: true };
    s.mentorFilter[mentorId] = !s.mentorFilter[mentorId];
    // 최소 1명은 활성화
    const activeCount = Object.values(s.mentorFilter).filter(v => v).length;
    if (activeCount === 0) {
        s.mentorFilter[mentorId] = true;
        if (typeof showToast === 'function') showToast('⚠️ 최소 1명의 멘토는 활성화해야 합니다', 'warning');
        return;
    }
    saveMentorSettings(s);
    applyMentorSettings();
    renderMentorPanel();
    const mentor = mentors[mentorId];
    const state = s.mentorFilter[mentorId] ? 'ON 🔔' : 'OFF 🔕';
    if (typeof showToast === 'function') showToast(`${mentor?.icon || '🤖'} ${mentor?.name || mentorId} 알림 ${state}`, 'info', 2000);
}
window.toggleMentorFilter = toggleMentorFilter;

function isMentorEnabled(mentorId) {
    const s = getMentorSettings();
    return s.mentorFilter?.[mentorId] !== false;
}

function toggleMentorSetting(key) {
    const s = getMentorSettings();
    s[key] = !s[key];
    saveMentorSettings(s);
    applyMentorSettings();
}
window.toggleMentorSetting = toggleMentorSetting;

function applyMentorSettings() {
    const s = getMentorSettings();
    const panel = document.getElementById('mentor-panel');
    if (panel) panel.style.display = s.panel ? '' : 'none';
    // checkboxes sync
    const cb1 = document.getElementById('mentor-toggle-panel');
    const cb2 = document.getElementById('mentor-toggle-comment');
    const cb3 = document.getElementById('mentor-toggle-notif');
    if (cb1) cb1.checked = s.panel;
    if (cb2) cb2.checked = s.comment;
    if (cb3) cb3.checked = s.notif;
}

// Init settings on load
document.addEventListener('DOMContentLoaded', applyMentorSettings);

// ========== TECHNICAL INDICATORS ==========

function calcEMA(closes, period) {
    if (!closes || closes.length < period) return [];
    const k = 2 / (period + 1);
    const ema = [closes.slice(0, period).reduce((a, b) => a + b, 0) / period];
    for (let i = period; i < closes.length; i++) {
        ema.push(closes[i] * k + ema[ema.length - 1] * (1 - k));
    }
    return ema;
}

function calcRSI(closes, period = 14) {
    if (!closes || closes.length < period + 1) return [];
    const rsi = [];
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) avgGain += diff; else avgLoss += Math.abs(diff);
    }
    avgGain /= period;
    avgLoss /= period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
        rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
    return rsi;
}

function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
    const emaFast = calcEMA(closes, fast);
    const emaSlow = calcEMA(closes, slow);
    if (emaFast.length === 0 || emaSlow.length === 0) return { macd: [], signal: [], histogram: [] };
    const offset = slow - fast;
    const macdLine = [];
    for (let i = 0; i < emaSlow.length; i++) {
        macdLine.push(emaFast[i + offset] - emaSlow[i]);
    }
    const signalLine = calcEMA(macdLine, signal);
    const sigOffset = macdLine.length - signalLine.length;
    const histogram = signalLine.map((s, i) => macdLine[i + sigOffset] - s);
    return { macd: macdLine, signal: signalLine, histogram };
}

function calcBollingerBands(closes, period = 20, mult = 2) {
    if (!closes || closes.length < period) return { upper: [], middle: [], lower: [] };
    const upper = [], middle = [], lower = [];
    for (let i = period - 1; i < closes.length; i++) {
        const slice = closes.slice(i - period + 1, i + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / period;
        const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
        const std = Math.sqrt(variance);
        middle.push(mean);
        upper.push(mean + mult * std);
        lower.push(mean - mult * std);
    }
    return { upper, middle, lower };
}

function findSupportResistance(closes, lookback = 50) {
    if (!closes || closes.length < lookback) return { support: [], resistance: [] };
    const recent = closes.slice(-lookback);
    const support = [], resistance = [];
    for (let i = 2; i < recent.length - 2; i++) {
        if (recent[i] < recent[i - 1] && recent[i] < recent[i - 2] && recent[i] < recent[i + 1] && recent[i] < recent[i + 2]) {
            support.push(recent[i]);
        }
        if (recent[i] > recent[i - 1] && recent[i] > recent[i - 2] && recent[i] > recent[i + 1] && recent[i] > recent[i + 2]) {
            resistance.push(recent[i]);
        }
    }
    return { support, resistance };
}

function calcFibonacciLevels(high, low) {
    const diff = high - low;
    return {
        0: high,
        0.236: high - diff * 0.236,
        0.382: high - diff * 0.382,
        0.5: high - diff * 0.5,
        0.618: high - diff * 0.618,
        0.786: high - diff * 0.786,
        1: low
    };
}

// ========== CANDLE HELPERS ==========

function getCandlesFromTicks(ticks, intervalSec = 60) {
    if (!ticks || ticks.length < 10) return [];
    const candles = [];
    let cur = null;
    for (const tick of ticks) {
        const ct = Math.floor(tick.time / intervalSec) * intervalSec;
        if (!cur || cur.time !== ct) {
            if (cur) candles.push(cur);
            cur = { time: ct, open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: tick.volume || 1 };
        } else {
            cur.high = Math.max(cur.high, tick.price);
            cur.low = Math.min(cur.low, tick.price);
            cur.close = tick.price;
            cur.volume += tick.volume || 1;
        }
    }
    if (cur) candles.push(cur);
    return candles;
}

function getCloses(candles) { return candles.map(c => c.close); }

// ========== MENTOR ENGINE ==========

const mentors = {
    kps: {
        name: 'KPS', icon: '👑', avatar: 'img/mentor-kps.jpg', style: '보수적', color: '#8B6914',
        desc: '추세 추종 · EMA 크로스오버',
        analyze(candles, livePrice) {
            if (candles.length < 60) return { signal: 'wait', confidence: 0, message: '데이터 수집 중...', reason: '캔들 부족' };
            const p = typeof getMentorParams === 'function' ? getMentorParams('kps') : {};
            const emaShort = p.emaShort || 20;
            const emaLong = p.emaLong || 50;
            const crossTh = p.crossThreshold || 0.5;
            const trendMin = p.trendMinGap || 5;

            const closes = getCloses(candles);
            const emaS = calcEMA(closes, emaShort);
            const emaL = calcEMA(closes, emaLong);
            if (emaS.length < 3 || emaL.length < 3) return { signal: 'wait', confidence: 0, message: '지표 계산 중...', reason: 'EMA 데이터 부족' };

            const curS = emaS[emaS.length - 1];
            const curL = emaL[emaL.length - 1];
            const prevS = emaS[emaS.length - 2];
            const prevL = emaL[emaL.length - 2];

            const bullish = curS > curL;
            const justCrossedUp = prevS <= prevL + crossTh && curS > curL;
            const justCrossedDown = prevS >= prevL - crossTh && curS < curL;
            const trendStrength = Math.abs(curS - curL);
            const priceAboveEma = livePrice > curS;

            if (justCrossedUp && priceAboveEma) {
                return { signal: 'buy', confidence: 85, message: '추세 확인됐습니다. 매수 진입 적기입니다.', reason: `EMA${emaShort}(${curS.toFixed(1)}) > EMA${emaLong}(${curL.toFixed(1)}) 골든크로스` };
            }
            if (justCrossedDown && !priceAboveEma) {
                return { signal: 'sell', confidence: 80, message: '추세 전환 감지. 매도 고려하세요.', reason: `EMA${emaShort}(${curS.toFixed(1)}) < EMA${emaLong}(${curL.toFixed(1)}) 데드크로스` };
            }
            if (bullish && priceAboveEma && trendStrength > trendMin) {
                return { signal: 'hold', confidence: 65, message: '큰 흐름은 상승입니다. 포지션 유지하세요.', reason: `EMA${emaShort} > EMA${emaLong}, 차이 ${trendStrength.toFixed(1)}pt` };
            }
            if (!bullish && !priceAboveEma && trendStrength > trendMin) {
                return { signal: 'hold', confidence: 60, message: '하락 추세 유지 중. 매도 포지션 유지.', reason: `EMA${emaShort} < EMA${emaLong}, 차이 ${trendStrength.toFixed(1)}pt` };
            }
            return { signal: 'wait', confidence: 40, message: '큰 흐름을 봅시다. 지금은 기다림의 시간입니다.', reason: `EMA 수렴 중, 차이 ${trendStrength.toFixed(1)}pt` };
        }
    },

    michael: {
        name: '마이클', icon: '🎯', avatar: 'img/mentor-michael.jpg', style: '공격적', color: '#FF4444',
        desc: '모멘텀 스캘핑 · 변화율 감지',
        analyze(candles, livePrice) {
            if (candles.length < 10) return { signal: 'wait', confidence: 0, message: '데이터 수집 중...', reason: '캔들 부족' };
            const p = typeof getMentorParams === 'function' ? getMentorParams('michael') : {};
            const momCandles = p.momentumCandles || 3;
            const volMult = p.volSpikeMult || 1.5;
            const strongTh = p.strongThreshold || 0.08;
            const weakTh = p.weakThreshold || 0.04;
            const rocTh = p.rocThreshold || 0.03;

            const recent = candles.slice(-10);
            const closes = recent.map(c => c.close);
            const volumes = recent.map(c => c.volume || 1);

            const rocN = ((livePrice - closes[closes.length - momCandles]) / closes[closes.length - momCandles]) * 100;
            const roc1 = ((livePrice - closes[closes.length - 1]) / closes[closes.length - 1]) * 100;

            const avgVol = volumes.slice(0, -2).reduce((a, b) => a + b, 0) / (volumes.length - 2);
            const lastVol = volumes[volumes.length - 1];
            const volSpike = avgVol > 0 ? lastVol / avgVol : 1;

            const momentum = rocN;
            const isVolSpike = volSpike > volMult;

            if (momentum > strongTh && isVolSpike) {
                return { signal: 'buy', confidence: 90, message: '지금이다! 빠르게 들어가! 🚀', reason: `모멘텀 +${(momentum * 100).toFixed(0)}bp, 거래량 ${volSpike.toFixed(1)}x 스파이크` };
            }
            if (momentum < -strongTh && isVolSpike) {
                return { signal: 'sell', confidence: 88, message: '숏 진입! 빠르게 먹고 나와!', reason: `모멘텀 ${(momentum * 100).toFixed(0)}bp, 거래량 ${volSpike.toFixed(1)}x 스파이크` };
            }
            if (Math.abs(momentum) > weakTh) {
                const dir = momentum > 0 ? 'buy' : 'sell';
                return { signal: dir, confidence: 65, message: momentum > 0 ? '움직임 감지! 매수 준비!' : '하락 가속! 매도 준비!', reason: `모멘텀 ${(momentum * 100).toFixed(0)}bp${isVolSpike ? ', 볼륨↑' : ''}` };
            }
            if (roc1 > rocTh) {
                return { signal: 'buy', confidence: 55, message: '약한 상승 움직임. 주시 중...', reason: `단기 ROC +${(roc1 * 100).toFixed(0)}bp` };
            }
            if (roc1 < -rocTh) {
                return { signal: 'sell', confidence: 55, message: '약한 하락 움직임. 주시 중...', reason: `단기 ROC ${(roc1 * 100).toFixed(0)}bp` };
            }
            return { signal: 'wait', confidence: 30, message: '움직임이 없다... 기다려. 타이밍이 올 거야.', reason: `모멘텀 ${(momentum * 100).toFixed(0)}bp, 볼륨 ${volSpike.toFixed(1)}x` };
        }
    },

    matthew: {
        name: '매튜', icon: '📊', avatar: 'img/mentor-matthew.jpg', style: '기술적', color: '#4488FF',
        desc: 'RSI · MACD · 볼린저밴드',
        analyze(candles, livePrice) {
            if (candles.length < 30) return { signal: 'wait', confidence: 0, message: '지표 계산을 위한 데이터 수집 중...', reason: '캔들 부족' };
            const pm = typeof getMentorParams === 'function' ? getMentorParams('matthew') : {};
            const rsiP = pm.rsiPeriod || 14;
            const rsiOB = pm.rsiOverbought || 70;
            const rsiOS = pm.rsiOversold || 30;
            const mFast = pm.macdFast || 12;
            const mSlow = pm.macdSlow || 26;
            const mSig = pm.macdSignal || 9;
            const bbP = pm.bbPeriod || 20;

            const closes = getCloses(candles);
            const rsiArr = calcRSI(closes, rsiP);
            const macd = calcMACD(closes, mFast, mSlow, mSig);
            const bb = calcBollingerBands(closes, bbP, 2);

            const rsi = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : 50;
            const macdVal = macd.macd.length > 0 ? macd.macd[macd.macd.length - 1] : 0;
            const macdSig = macd.signal.length > 0 ? macd.signal[macd.signal.length - 1] : 0;
            const macdHist = macd.histogram.length > 0 ? macd.histogram[macd.histogram.length - 1] : 0;
            const prevHist = macd.histogram.length > 1 ? macd.histogram[macd.histogram.length - 2] : 0;
            const bbUpper = bb.upper.length > 0 ? bb.upper[bb.upper.length - 1] : livePrice + 50;
            const bbLower = bb.lower.length > 0 ? bb.lower[bb.lower.length - 1] : livePrice - 50;
            const bbMid = bb.middle.length > 0 ? bb.middle[bb.middle.length - 1] : livePrice;

            let buySignals = 0, sellSignals = 0;
            const reasons = [];

            // RSI
            if (rsi < rsiOS) { buySignals++; reasons.push(`RSI ${rsi.toFixed(0)} 과매도`); }
            else if (rsi > rsiOB) { sellSignals++; reasons.push(`RSI ${rsi.toFixed(0)} 과매수`); }
            else if (rsi < 40) { buySignals += 0.5; reasons.push(`RSI ${rsi.toFixed(0)} 저위`); }
            else if (rsi > 60) { sellSignals += 0.5; reasons.push(`RSI ${rsi.toFixed(0)} 고위`); }

            // MACD
            if (macdHist > 0 && prevHist <= 0) { buySignals++; reasons.push('MACD 골든크로스'); }
            else if (macdHist < 0 && prevHist >= 0) { sellSignals++; reasons.push('MACD 데드크로스'); }
            else if (macdHist > 0) { buySignals += 0.3; reasons.push('MACD 양(+)'); }
            else { sellSignals += 0.3; reasons.push('MACD 음(-)'); }

            // Bollinger Bands
            if (livePrice <= bbLower) { buySignals++; reasons.push('BB 하단 터치'); }
            else if (livePrice >= bbUpper) { sellSignals++; reasons.push('BB 상단 터치'); }
            else if (livePrice < bbMid) { buySignals += 0.3; }
            else { sellSignals += 0.3; }

            const total = buySignals + sellSignals;
            const buyRatio = total > 0 ? buySignals / total : 0.5;

            if (buySignals >= 2) {
                const conf = Math.min(95, Math.round(50 + buySignals * 15));
                return { signal: 'buy', confidence: conf, message: `매수 시그널 ${Math.round(buySignals)}/3 충족. 진입 고려.`, reason: reasons.join(' · ') };
            }
            if (sellSignals >= 2) {
                const conf = Math.min(95, Math.round(50 + sellSignals * 15));
                return { signal: 'sell', confidence: conf, message: `매도 시그널 ${Math.round(sellSignals)}/3 충족. 주의 필요.`, reason: reasons.join(' · ') };
            }
            if (buySignals > sellSignals) {
                return { signal: 'hold', confidence: 45, message: `약한 매수 시그널. 추가 확인 대기.`, reason: reasons.join(' · ') };
            }
            if (sellSignals > buySignals) {
                return { signal: 'hold', confidence: 45, message: `약한 매도 시그널. 추가 확인 대기.`, reason: reasons.join(' · ') };
            }
            return { signal: 'wait', confidence: 30, message: '지표 혼조. 관망 추천.', reason: reasons.join(' · ') };
        }
    },

    hansun: {
        name: '한선', icon: '🧘', avatar: 'img/mentor-hansun.jpg', style: '스윙', color: '#00CC88',
        desc: '피보나치 · 지지/저항 · 패턴',
        analyze(candles, livePrice) {
            const ph = typeof getMentorParams === 'function' ? getMentorParams('hansun') : {};
            const fibLB = ph.fibLookback || 100;
            const srLB = ph.srLookback || 80;
            const srSens = ph.srSensitivity || 0.05;
            const fibProxTh = ph.fibProxThreshold || 0.03;
            const patTh = ph.patternThreshold || 0.03;

            if (candles.length < fibLB) return { signal: 'wait', confidence: 0, message: '장기 분석을 위한 데이터 수집 중...', reason: `캔들 부족 (${fibLB}개 이상 필요)` };

            const closes = getCloses(candles);
            const recentN = closes.slice(-fibLB);
            const high = Math.max(...recentN);
            const low = Math.min(...recentN);
            const fib = calcFibonacciLevels(high, low);
            const sr = findSupportResistance(closes, srLB);

            // Fibonacci level proximity
            const fibLevels = [
                { level: '23.6%', price: fib[0.236] },
                { level: '38.2%', price: fib[0.382] },
                { level: '50%', price: fib[0.5] },
                { level: '61.8%', price: fib[0.618] },
                { level: '78.6%', price: fib[0.786] },
            ];
            const nearestFib = fibLevels.reduce((best, f) =>
                Math.abs(f.price - livePrice) < Math.abs(best.price - livePrice) ? f : best
            );
            const fibDist = Math.abs(nearestFib.price - livePrice);
            const range = high - low;
            const fibProximity = range > 0 ? fibDist / range : 1;

            // Support/Resistance proximity
            const nearSupport = sr.support.length > 0 ? sr.support.reduce((best, s) =>
                Math.abs(s - livePrice) < Math.abs(best - livePrice) ? s : best, sr.support[0]) : null;
            const nearResist = sr.resistance.length > 0 ? sr.resistance.reduce((best, r) =>
                Math.abs(r - livePrice) < Math.abs(best - livePrice) ? r : best, sr.resistance[0]) : null;

            // Trend (overall direction over 100 candles)
            const ema20long = calcEMA(closes, 20);
            const ema50long = calcEMA(closes, 50);
            const longBullish = ema20long.length > 0 && ema50long.length > 0 &&
                ema20long[ema20long.length - 1] > ema50long[ema50long.length - 1];

            // Double bottom / top detection (simplified)
            const last50 = recentN.slice(-50);
            const lows50 = [];
            const highs50 = [];
            for (let i = 2; i < last50.length - 2; i++) {
                if (last50[i] < last50[i-1] && last50[i] < last50[i-2] && last50[i] < last50[i+1] && last50[i] < last50[i+2]) lows50.push(last50[i]);
                if (last50[i] > last50[i-1] && last50[i] > last50[i-2] && last50[i] > last50[i+1] && last50[i] > last50[i+2]) highs50.push(last50[i]);
            }
            const hasDoubleBottom = lows50.length >= 2 && Math.abs(lows50[lows50.length-1] - lows50[lows50.length-2]) < range * patTh;
            const hasDoubleTop = highs50.length >= 2 && Math.abs(highs50[highs50.length-1] - highs50[highs50.length-2]) < range * patTh;

            // Decisions
            if (fibProximity < fibProxTh && nearSupport && Math.abs(livePrice - nearSupport) < range * srSens) {
                return { signal: 'buy', confidence: 80,
                    message: `이 구간은 피보나치 ${nearestFib.level} 되돌림 + 지지선입니다. 매수 기회.`,
                    reason: `Fib ${nearestFib.level}(${nearestFib.price.toFixed(1)}) 근접, 지지 ${nearSupport.toFixed(1)}` };
            }
            if (fibProximity < fibProxTh && nearResist && Math.abs(livePrice - nearResist) < range * srSens) {
                return { signal: 'sell', confidence: 75,
                    message: `피보나치 ${nearestFib.level} + 저항 구간. 매도 또는 관망.`,
                    reason: `Fib ${nearestFib.level}(${nearestFib.price.toFixed(1)}) 근접, 저항 ${nearResist.toFixed(1)}` };
            }
            if (hasDoubleBottom && longBullish) {
                return { signal: 'buy', confidence: 70, message: '더블바텀 패턴 감지. 반등 가능성 높습니다.', reason: '더블바텀 + 상승 추세' };
            }
            if (hasDoubleTop && !longBullish) {
                return { signal: 'sell', confidence: 70, message: '더블탑 패턴 감지. 하락 주의.', reason: '더블탑 + 하락 추세' };
            }
            if (longBullish) {
                return { signal: 'hold', confidence: 50,
                    message: '큰 그림에서 보면 상승 추세 유지 중입니다. 인내심을 갖고 기다려보세요.',
                    reason: `상승추세, Fib ${nearestFib.level}(${nearestFib.price.toFixed(1)}) 참고` };
            }
            return { signal: 'wait', confidence: 35,
                message: `피보나치 ${nearestFib.level} 레벨(${nearestFib.price.toFixed(1)})을 주시하세요. 아직 진입 타이밍이 아닙니다.`,
                reason: `Fib ${nearestFib.level} 근접도 ${(fibProximity * 100).toFixed(0)}%, 범위 ${low.toFixed(0)}~${high.toFixed(0)}` };
        }
    },

    crownygirl: {
        name: '크라우니걸', icon: '🦸‍♀️', avatar: 'img/crowny-girl-hero.jpg', style: '종합 분석', color: '#FF69B4',
        desc: '종합 분석 · 멘토 시그널 통합 · 격려',
        analyze(candles, livePrice) {
            // 다른 4명의 분석을 종합하여 최종 의견 제시
            const otherMentors = ['kps', 'michael', 'matthew', 'hansun'];
            const results = {};
            let buyCount = 0, sellCount = 0, holdCount = 0, waitCount = 0;
            let totalConf = 0, validCount = 0;
            const reasons = [];

            for (const id of otherMentors) {
                if (mentors[id]) {
                    try {
                        const r = mentors[id].analyze(candles, livePrice);
                        results[id] = r;
                        if (r.signal === 'buy') buyCount++;
                        else if (r.signal === 'sell') sellCount++;
                        else if (r.signal === 'hold') holdCount++;
                        else waitCount++;
                        totalConf += r.confidence;
                        validCount++;
                        reasons.push(`${mentors[id].icon}${mentors[id].name}: ${r.signal}(${r.confidence}%)`);
                    } catch(e) { /* skip */ }
                }
            }

            if (validCount === 0) return { signal: 'wait', confidence: 0, message: '멘토들의 분석을 기다리고 있어요! 잠시만요~ ✨', reason: '데이터 수집 중' };

            const avgConf = Math.round(totalConf / validCount);
            const summary = reasons.join(' · ');

            // 다수결 + 자체 판단
            if (buyCount >= 3) {
                return { signal: 'buy', confidence: Math.min(95, avgConf + 10),
                    message: `멘토 ${buyCount}명이 매수 의견이에요! 좋은 기회일 수 있어요! 화이팅! 💪✨`,
                    reason: `종합: ${summary}` };
            }
            if (sellCount >= 3) {
                return { signal: 'sell', confidence: Math.min(95, avgConf + 10),
                    message: `멘토 ${sellCount}명이 매도 의견이에요. 리스크 관리 잘 해주세요! 여러분을 지켜드릴게요! 🛡️`,
                    reason: `종합: ${summary}` };
            }
            if (buyCount >= 2 && sellCount === 0) {
                return { signal: 'buy', confidence: Math.min(85, avgConf + 5),
                    message: `매수 쪽 의견이 우세해요! 신중하게 진입해보세요~ ✨`,
                    reason: `종합: ${summary}` };
            }
            if (sellCount >= 2 && buyCount === 0) {
                return { signal: 'sell', confidence: Math.min(85, avgConf + 5),
                    message: `매도 쪽 의견이 우세해요. 포지션 점검해주세요! 💫`,
                    reason: `종합: ${summary}` };
            }
            if (buyCount > 0 && sellCount > 0) {
                return { signal: 'hold', confidence: Math.round(avgConf * 0.8),
                    message: `멘토들 의견이 엇갈리고 있어요. 조금 더 지켜보는 게 좋겠어요! 여러분의 트레이딩을 지켜드릴게요! ✨`,
                    reason: `종합: ${summary}` };
            }
            if (holdCount >= 2) {
                return { signal: 'hold', confidence: avgConf,
                    message: `지금은 유지하면서 다음 기회를 기다려봐요! 잘하고 계세요! 👏`,
                    reason: `종합: ${summary}` };
            }
            return { signal: 'wait', confidence: Math.round(avgConf * 0.7),
                message: `아직 뚜렷한 방향이 없어요. 함께 기다려볼게요! 여러분의 트레이딩을 지켜드릴게요! ✨`,
                reason: `종합: ${summary}` };
        }
    }
};

// ========== MENTOR PANEL STATE ==========

let mentorResults = {};
let mentorPreviousSignals = {};
let mentorUpdateInterval = null;
let activeMentorId = 'crowny-girl';

function initMentorPanel() {
    // Initialize learning system
    if (typeof initMentorLearning === 'function') initMentorLearning();
    renderMentorPanel();
    // Start periodic updates (every 10 seconds)
    if (mentorUpdateInterval) clearInterval(mentorUpdateInterval);
    mentorUpdateInterval = setInterval(updateMentorAnalysis, 10000);
    // Initial analysis after short delay
    setTimeout(updateMentorAnalysis, 2000);
}

function updateMentorAnalysis() {
    if (!window.liveTicks || window.liveTicks.length < 10 || !currentPrice || currentPrice < 1000) {
        // 데이터 없을 때 패널에 안내 표시
        if (!window.liveTicks || window.liveTicks.length === 0) {
            for (const id of Object.keys(mentors)) {
                mentorResults[id] = { signal: 'wait', confidence: 0, message: '📡 가격 데이터 수신 대기 중...', reason: '실시간 데이터 연결 필요' };
            }
            renderMentorPanel();
        }
        return;
    }

    const candles = getCandlesFromTicks(window.liveTicks, 60);
    if (candles.length < 5) return;

    for (const [id, mentor] of Object.entries(mentors)) {
        try {
            const result = mentor.analyze(candles, currentPrice);
            const prev = mentorResults[id];

            // Detect signal change for toast (respect notif setting + mentor filter)
            if (prev && prev.signal !== result.signal && mentorPreviousSignals[id] !== result.signal) {
                const signalKo = { buy: '매수', sell: '매도', hold: '유지', wait: '관망' };
                if (getMentorSettings().notif && isMentorEnabled(id)) {
                    showToast(`${mentor.icon} ${mentor.name}: ${signalKo[prev.signal] || prev.signal} → ${signalKo[result.signal] || result.signal}으로 변경`, 'info', 4000);
                    if (typeof notifyTradingSignal === 'function') notifyTradingSignal(`${mentor.icon} ${mentor.name}`, prev.signal, result.signal);
                }
            }
            // Log signal for learning system
            if (result.signal !== mentorPreviousSignals[id] && typeof logMentorSignal === 'function') {
                logMentorSignal(id, result.signal, result.confidence, currentPrice);
            }
            mentorPreviousSignals[id] = result.signal;
            mentorResults[id] = result;
        } catch (e) {
            console.warn(`멘토 ${id} 분석 오류:`, e);
            mentorResults[id] = { signal: 'wait', confidence: 0, message: '분석 오류', reason: e.message };
        }
    }

    renderMentorPanel();
}

function renderMentorPanel() {
    const container = document.getElementById('mentor-panel');
    if (!container) return;

    const signalConfig = {
        buy: { label: '매수', color: '#00cc66', bg: 'rgba(0,204,102,0.15)', emoji: '🟢' },
        sell: { label: '매도', color: '#B54534', bg: 'rgba(255,68,68,0.15)', emoji: '🔴' },
        hold: { label: '유지', color: '#6B5744', bg: 'rgba(136,136,136,0.1)', emoji: '⚪' },
        wait: { label: '관망', color: '#ffaa00', bg: 'rgba(255,170,0,0.15)', emoji: '🟡' },
    };

    const settings = getMentorSettings();
    let html = '<div class="mentor-avatars">';
    for (const [id, mentor] of Object.entries(mentors)) {
        const result = mentorResults[id] || { signal: 'wait', confidence: 0 };
        const sc = signalConfig[result.signal] || signalConfig.wait;
        const isActive = activeMentorId === id;
        const isEnabled = isMentorEnabled(id);
        const dimStyle = isEnabled ? '' : 'opacity:0.35; filter:grayscale(80%);';
        const bellIcon = isEnabled ? '🔔' : '🔕';
        html += `
            <div class="mentor-avatar ${isActive ? 'active' : ''}" style="border-color:${sc.color}; ${dimStyle} position:relative;">
                <div onclick="selectMentor('${id}')" style="cursor:pointer;">
                    <div class="mentor-avatar-icon">${mentor.avatar ? `<img src="${mentor.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : mentor.icon}</div>
                    <div class="mentor-avatar-name">${mentor.name}</div>
                    <div class="mentor-avatar-signal" style="color:${sc.color};">${sc.emoji} ${sc.label}</div>
                </div>
                <div onclick="event.stopPropagation(); toggleMentorFilter('${id}')" 
                     style="position:absolute; top:-4px; right:-4px; font-size:12px; cursor:pointer; 
                            background:${isEnabled ? 'rgba(0,200,0,0.15)' : 'rgba(150,150,150,0.2)'}; 
                            border-radius:50%; width:22px; height:22px; display:flex; align-items:center; 
                            justify-content:center; border:1px solid ${isEnabled ? '#00cc66' : '#6B5744'};"
                     title="${mentor.name} 알림 ${isEnabled ? 'ON' : 'OFF'}">${bellIcon}</div>
            </div>`;
    }
    html += '</div>';

    // Detail card for selected mentor
    if (activeMentorId && mentors[activeMentorId]) {
        const mentor = mentors[activeMentorId];
        const result = mentorResults[activeMentorId] || { signal: 'wait', confidence: 0, message: '분석 대기 중...', reason: '' };
        const sc = signalConfig[result.signal] || signalConfig.wait;
        const confPct = Math.min(100, Math.max(0, result.confidence));
        const confBars = Math.round(confPct / 10);
        const confBar = '█'.repeat(confBars) + '░'.repeat(10 - confBars);

        const mentorEnabled = isMentorEnabled(activeMentorId);
        const filterBadge = mentorEnabled 
            ? '<span style="font-size:0.7rem; color:#00cc66;">🔔 알림 ON</span>'
            : '<span style="font-size:0.7rem; color:#6B5744;">🔕 알림 OFF</span>';
        html += `
            <div class="mentor-detail-card" style="border-left:4px solid ${mentor.color}; background:${sc.bg}; ${mentorEnabled ? '' : 'opacity:0.7;'}">
                <div class="mentor-detail-header">
                    <span class="mentor-detail-title">${mentor.avatar ? `<img src="${mentor.avatar}" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:4px;">` : mentor.icon} ${mentor.name} <span style="color:${mentor.color}; font-size:0.7rem;">${mentor.style}</span> ${filterBadge}</span>
                    <span class="mentor-detail-signal" style="color:${sc.color}; font-weight:700;">${sc.label} ${sc.emoji}</span>
                </div>
                <div class="mentor-detail-message" style="${getMentorSettings().comment ? '' : 'display:none'}">"${result.message}"</div>
                <div class="mentor-detail-confidence">
                    <span>신뢰도: <span style="font-family:monospace; letter-spacing:1px; color:${sc.color};">${confBar}</span> ${confPct}%</span>
                </div>
                <div class="mentor-detail-reason" style="${getMentorSettings().comment ? '' : 'display:none'}">${result.reason}</div>
                ${typeof renderMentorPerformanceUI === 'function' ? renderMentorPerformanceUI(activeMentorId) : ''}
            </div>`;
    }

    container.innerHTML = html;
}

function selectMentor(id) {
    activeMentorId = activeMentorId === id ? null : id;
    renderMentorPanel();
}

// ========== AUTO-INIT ==========
// Hook into existing loadTradingDashboard
const _origLoadTradingDashboard = window.loadTradingDashboard;
if (_origLoadTradingDashboard) {
    window.loadTradingDashboard = async function() {
        await _origLoadTradingDashboard.apply(this, arguments);
        if (myParticipation) {
            setTimeout(initMentorPanel, 500);
        }
    };
} else {
    // Fallback: init when trading dashboard becomes visible
    document.addEventListener('DOMContentLoaded', () => {
        const observer = new MutationObserver(() => {
            const dash = document.getElementById('trading-dashboard');
            if (dash && dash.style.display !== 'none') {
                initMentorPanel();
                observer.disconnect();
            }
        });
        const dash = document.getElementById('trading-dashboard');
        if (dash) observer.observe(dash, { attributes: true });
    });
}
