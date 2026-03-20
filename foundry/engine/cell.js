// ═══════════════════════════════════════════════════════════════
// CrownyCellCore — 27-슬롯 균형3진 온톨로직 셀 (Node.js 구현)
//
// 원본: CrownyCell/셀.han + CrownyCell/크라우니셀.han
//       크라우니/원천/온톨로지/기억.rs
//
// 셀 = 27슬롯 (인덱스 -13 ~ 0 ~ +13, 배열 0~26)
// ═══════════════════════════════════════════════════════════════

'use strict';

// ─── 4상 인식상태 (Epistemic States) ───
const EP = Object.freeze({
    TI:  2,   // ▲확정 (Confirmed)
    OM:  0,   // ●미확인 (Unconfirmed)
    TA: -2,   // ▼오해 (Misunderstanding)
    EUM: -1,  // ◆미인지 (Unaware)
});

const EP_NAME = Object.freeze({
    [EP.TI]:  '▲확정',
    [EP.OM]:  '●미확인',
    [EP.TA]:  '▼오해',
    [EP.EUM]: '◆미인지',
});

// ─── 슬롯 인덱스 (slot + 13 = 배열 인덱스) ───
const S = Object.freeze({
    // 가장자리 음 — 메타
    방향속성:   0,  // [-13]
    예비음2:    1,  // [-12]
    예비음1:    2,  // [-11]

    // 바깥 음 — 권한
    쓰기권한:   3,  // [-10]
    읽기권한:   4,  // [-9]
    소유자:     5,  // [-8]

    // 중간 음 — 공간
    깊이:       6,  // [-7]
    크기:       7,  // [-6]
    위치:       8,  // [-5]

    // 안쪽 음 — 관계
    연결강도:   9,  // [-4]
    연결대상:  10,  // [-3]
    출처:      11,  // [-2]

    // 중심 — 존재
    뒷방향:    12,  // [-1]
    상태:      13,  // [ 0]
    앞방향:    14,  // [+1]

    // 안쪽 양 — 정체
    내용:      15,  // [+2]
    유형:      16,  // [+3]
    이름:      17,  // [+4]

    // 중간 양 — 시간
    생성시간:  18,  // [+5]
    변경시간:  19,  // [+6]
    수명:      20,  // [+7]

    // 바깥 양 — 논리
    근거수:    21,  // [+8]
    신뢰도:    22,  // [+9]
    합의:      23,  // [+10]

    // 가장자리 양 — 확장
    태그:      24,  // [+11]
    버전:      25,  // [+12]
    예비양:    26,  // [+13]
});

// ─── 유형 태그 (3 trits = 27가지) ───
const TYPE = Object.freeze({
    NONE:    0,
    INT:     1,
    FLOAT:   2,
    STR:     3,
    TRIT:    4,
    ARRAY:   5,
    MAP:     6,
    CLAIM:   7,
    FUNC:    8,
    FILE:    9,
    TASK:   10,
    MSG:    11,
    EVENT:  12,
    POINTER:13,
});

// ─── 레이어 (RTF1 온톨로지 5계층) ───
const LAYER = Object.freeze({
    CORE:    0,  // 코어 — 기본 엔티티/관계
    DOMAIN:  1,  // 도메인 — 분야별 지식
    DECISION:2,  // 결정 — 의사결정
    EPISTEMIC:3, // 인식 — 증거/신뢰
    META:    4,  // 메타온톨로지
});

const LAYER_NAME = Object.freeze({
    [LAYER.CORE]:     '코어',
    [LAYER.DOMAIN]:   '도메인',
    [LAYER.DECISION]: '결정',
    [LAYER.EPISTEMIC]:'인식',
    [LAYER.META]:     '메타',
});

// ─── 티옴타음 4방향 연결 ───
const DIR = Object.freeze({
    TI:  'ti',   // ▲ 상위 레이어
    OM:  'om',   // ● 현재 레이어 내
    TA:  'ta',   // ▼ 하위 레이어
    EUM: 'eum',  // ◆ 시냅스
});

// ═══ 셀 생성 ═══

function createCell(name, type, content) {
    const now = Date.now();
    const slots = new Array(27).fill(0);
    slots[S.상태]     = EP.OM;
    slots[S.이름]     = name;
    slots[S.유형]     = type;
    slots[S.내용]     = content;
    slots[S.생성시간] = now;
    slots[S.변경시간] = now;
    slots[S.앞방향]   = -1;
    slots[S.뒷방향]   = -1;
    slots[S.연결대상] = -1;
    slots[S.근거수]   = 0;
    slots[S.신뢰도]   = 0;
    slots[S.버전]     = 1;
    return slots;
}

function createConfirmedCell(name, type, content) {
    const slots = createCell(name, type, content);
    slots[S.상태]  = EP.TI;
    slots[S.신뢰도] = 13;
    return slots;
}

// ═══ 셀 → JSON 변환 ═══

function cellToJSON(slots, id, extra = {}) {
    return {
        id,
        status:      slots[S.상태],
        statusName:  EP_NAME[slots[S.상태]] || '?',
        name:        slots[S.이름],
        type:        slots[S.유형],
        content:     slots[S.내용],
        evidence:    slots[S.근거수],
        trust:       slots[S.신뢰도],
        trustNorm:   +(slots[S.신뢰도] / 13).toFixed(3),
        forward:     slots[S.앞방향],
        backward:    slots[S.뒷방향],
        target:      slots[S.연결대상],
        strength:    slots[S.연결강도],
        source:      slots[S.출처],
        depth:       slots[S.깊이],
        owner:       slots[S.소유자],
        tag:         slots[S.태그],
        version:     slots[S.버전],
        createdAt:   slots[S.생성시간],
        modifiedAt:  slots[S.변경시간],
        ttl:         slots[S.수명],
        ...extra,
    };
}

function jsonToSlots(json) {
    const slots = createCell(
        json.name || '',
        json.type ?? TYPE.NONE,
        json.content ?? 0
    );
    if (json.status != null)   slots[S.상태]     = json.status;
    if (json.evidence != null) slots[S.근거수]   = json.evidence;
    if (json.trust != null)    slots[S.신뢰도]   = json.trust;
    if (json.forward != null)  slots[S.앞방향]   = json.forward;
    if (json.backward != null) slots[S.뒷방향]   = json.backward;
    if (json.target != null)   slots[S.연결대상] = json.target;
    if (json.strength != null) slots[S.연결강도] = json.strength;
    if (json.source != null)   slots[S.출처]     = json.source;
    if (json.depth != null)    slots[S.깊이]     = json.depth;
    if (json.owner != null)    slots[S.소유자]   = json.owner;
    if (json.tag != null)      slots[S.태그]     = json.tag;
    if (json.version != null)  slots[S.버전]     = json.version;
    if (json.ttl != null)      slots[S.수명]     = json.ttl;
    return slots;
}

// ═══ 상태 전이 ═══

function advanceCell(slots) {
    const e = slots[S.상태];
    if      (e === EP.EUM) { slots[S.상태] = EP.OM; slots[S.신뢰도] = 0; }
    else if (e === EP.OM)  { slots[S.상태] = EP.TI; slots[S.신뢰도] = 5; }
    else if (e === EP.TA)  { slots[S.상태] = EP.OM; slots[S.신뢰도] = 0; }
    slots[S.변경시간] = Date.now();
    return slots;
}

function retreatCell(slots) {
    const e = slots[S.상태];
    if      (e === EP.TI) { slots[S.상태] = EP.OM;  slots[S.신뢰도] = 0; }
    else if (e === EP.OM) { slots[S.상태] = EP.EUM; slots[S.신뢰도] = 0; }
    slots[S.변경시간] = Date.now();
    return slots;
}

function addEvidence(slots) {
    slots[S.근거수] = Math.min(slots[S.근거수] + 1, 13);
    slots[S.변경시간] = Date.now();
    // 근거 3개 이상 → 자동 확정
    if (slots[S.근거수] >= 3 && slots[S.상태] === EP.OM) {
        slots[S.상태]  = EP.TI;
        slots[S.신뢰도] = 10;
    }
    return slots;
}

// ═══ 의사결정 점수 ═══

function decisionScore(slots, goalFit) {
    let evidenceQuality = Math.min(slots[S.근거수] / 5, 1.0);
    if (slots[S.근거수] === 0) evidenceQuality = 0.3;
    let epistemicTrust = 0;
    switch (slots[S.상태]) {
        case EP.TI:  epistemicTrust =  1.0;  break;
        case EP.OM:  epistemicTrust =  0.35; break;
        case EP.TA:  epistemicTrust = -0.7;  break;
        case EP.EUM: epistemicTrust =  0.0;  break;
    }
    return goalFit * evidenceQuality * epistemicTrust;
}

module.exports = {
    EP, EP_NAME, S, TYPE, LAYER, LAYER_NAME, DIR,
    createCell, createConfirmedCell,
    cellToJSON, jsonToSlots,
    advanceCell, retreatCell, addEvidence,
    decisionScore,
};
