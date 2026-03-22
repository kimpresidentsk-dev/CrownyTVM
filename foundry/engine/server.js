// ═══════════════════════════════════════════════════════════════
// CrownyFoundry Phase 1 — 온톨로직 데이터 엔진 REST API
//
// CrownyCellCore 27-방사형 DB를 REST API로 노출
//
// 기반:
//   크라우니/원천/온톨로지/기억.rs  → Memory 클래스
//   CrownyCell/크라우니셀.han      → 27-trit 셀 구조
//   CrownyCell/셀.han             → 27-slot 방사형 셀
//   CrownyCell/저장소.han          → 시간순 저장 + 시냅스
//
// API:
//   POST   /api/foundry/cells          — 셀 생성
//   GET    /api/foundry/cells          — 셀 목록
//   GET    /api/foundry/cells/:id      — 셀 조회
//   PATCH  /api/foundry/cells/:id      — 셀 수정
//   DELETE /api/foundry/cells/:id      — 셀 삭제
//
//   POST   /api/foundry/claims         — Claim 생성
//   GET    /api/foundry/claims         — Claim 쿼리
//
//   POST   /api/foundry/cells/:id/evidence  — 근거 추가
//   POST   /api/foundry/cells/:id/advance   — 상태 전진
//   POST   /api/foundry/cells/:id/retreat   — 상태 후퇴
//
//   POST   /api/foundry/connect        — 셀 연결 (티옴타음)
//   POST   /api/foundry/synapse        — 양방향 시냅스
//   GET    /api/foundry/cells/:id/connections — 연결 정보
//   GET    /api/foundry/cells/:id/chain      — 체인 따라가기
//   GET    /api/foundry/cells/:id/follow/:dir — 방향 따라가기
//
//   GET    /api/foundry/layers/:layer   — 레이어별 조회
//   GET    /api/foundry/epistemic/:state — 인식상태별 조회
//   GET    /api/foundry/search          — 텍스트 검색
//   GET    /api/foundry/stats           — 통계
//
// 사용법:
//   node foundry/engine/server.js              (독립 실행, :7731)
//   require('./foundry/engine/server')(router)  (server.js 통합)
// ═══════════════════════════════════════════════════════════════

'use strict';

const Memory = require('./memory');
const { EP, TYPE, LAYER, LAYER_NAME, DIR } = require('./cell');
const { DOMAINS, TEMPLATES, deployTemplate } = require('./templates');
const { REL, REL_NAME, REL_SYMBOL, CausalEngine } = require('./causal');
const { SLOT, SLOT_META, RING, PROTOCOL, CovenantEngine } = require('./covenant');
const { LifeEngine } = require('./life');
const { CityEngine } = require('./city');
const { SCOPES, SCOPE_NAME, SCOPE_APP, PropagationEngine } = require('./scope');
const { generateChurchDemo } = require('./demo-church');
const { AuditLog, CLASSIFICATION, CLASS_NAME, canRead, canWrite, createToken, verifyToken, UserStore } = require('./security');
const { ACHEngine, DFICalculator, RedTeamEngine, WargameEngine, MDMPPipeline } = require('./tactical');

const ach = new ACHEngine();
const redTeam = new RedTeamEngine(CovenantEngine);
const wargame = new WargameEngine(ach, DFICalculator, redTeam);
const mdmp = new MDMPPipeline();

const audit = new AuditLog();
const users = new UserStore();

// 기본 관리자 계정 (최초 1회)
if (users.listUsers().length === 0) {
  users.register('admin', 'crowny2026', CLASSIFICATION.TOP_SECRET);
  console.log('  기본 관리자 계정 생성: admin / crowny2026');
}

const memory = new Memory();
const causal = new CausalEngine(memory);
const covenant = new CovenantEngine();
const life = new LifeEngine(memory);
const city = new CityEngine(memory);
const propagation = new PropagationEngine(memory);

// ═══ 요청 파싱 헬퍼 ═══

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 1e6) { req.destroy(); reject(new Error('body too large')); }
        });
        req.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); }
            catch (e) { reject(new Error('invalid JSON')); }
        });
    });
}

function json(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data, null, 2));
}

// ═══ 인증 미들웨어 ═══
// 공개 경로: 로그인, 등록, 비밀등급 목록, 헬스
const PUBLIC_PATHS = new Set([
    '/api/foundry/auth/login',
    '/api/foundry/auth/register',
    '/api/foundry/security/classifications',
    '/api/foundry/stats',
    '/api/foundry/demo/church',
]);

// 로그인 속도 제한 (IP별 5회/분)
const loginAttempts = new Map();
function checkRateLimit(ip) {
    const now = Date.now();
    const attempts = loginAttempts.get(ip) || [];
    const recent = attempts.filter(t => now - t < 60000);
    loginAttempts.set(ip, recent);
    if (recent.length >= 5) return false;
    recent.push(now);
    return true;
}

function extractUser(req) {
    const auth = req.headers.authorization || '';
    const token = auth.replace('Bearer ', '');
    if (!token) return null;
    return verifyToken(token);
}

// 요청에 사용자 정보 + 감사 로그 자동 첨부
function authMiddleware(req, res, pathname) {
    const user = extractUser(req);
    req._user = user;
    req._ip = req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';

    // 공개 경로는 인증 불필요
    if (PUBLIC_PATHS.has(pathname)) return true;

    // 인증 필요한 경로
    const authMode = process.env.CROWNY_AUTH || 'open';
    // open: 인증 없이 전체 허용 (개발)
    // login: 읽기는 허용, 쓰기는 인증 필요
    // strict: 전면 인증 필수 (국방/프로덕션)
    if (!user) {
        if (authMode === 'open') return true;
        if (authMode === 'login' && req.method === 'GET') return true;
        // strict 또는 login+쓰기 → 인증 필요
        return false;
    }

    // 감사 로그 자동 기록 (쓰기 작업)
    if (req.method !== 'GET') {
        audit.log(req.method, user.name, `${pathname}`, CLASS_NAME[user.level] || '일반');
    }

    return true;
}

function err(res, status, message) {
    json(res, status, { error: message });
}

// ═══ 라우터 ═══

const routes = [];

function route(method, pattern, handler) {
    // pattern: '/api/foundry/cells/:id' → regex
    const keys = [];
    const regex = new RegExp(
        '^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$'
    );
    routes.push({ method, regex, keys, handler });
}

function matchRoute(method, pathname) {
    for (const r of routes) {
        if (r.method !== method && r.method !== '*') continue;
        const m = pathname.match(r.regex);
        if (m) {
            const params = {};
            r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
            return { handler: r.handler, params };
        }
    }
    return null;
}

// ═══ 셀 CRUD ═══

// POST /api/foundry/cells — 셀 생성
route('POST', '/api/foundry/cells', async (req, res) => {
    const body = await parseBody(req);
    const { name, type, content, confirmed, layer, owner, tag, scope, classification } = body;
    if (!name) return err(res, 400, 'name 필수');
    const cell = memory.createValue(name, type ?? TYPE.NONE, content ?? 0, {
        confirmed: !!confirmed, layer,
        owner: classification ?? owner ?? 0,  // owner 슬롯 = 비밀등급
        tag: scope ?? tag ?? 0,
    });
    if (req._user) audit.log('CREATE', req._user.name, `셀: ${name} [${CLASS_NAME[classification??0]}]`, CLASS_NAME[classification??0]);
    json(res, 201, cell);
});

// GET /api/foundry/cells — 셀 목록
route('GET', '/api/foundry/cells', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
    const scope = url.searchParams.get('scope');
    const result = memory.listCells(offset, limit);

    // scope 필터
    if (scope != null) {
        const s = parseInt(scope);
        result.cells = result.cells.filter(c => (c.tag ?? 0) === s);
    }

    // 비밀등급 필터 (Bell-LaPadula: 사용자 등급 이하만 읽기 가능)
    const userLevel = req._user?.level ?? 0;
    result.cells = result.cells.filter(c => canRead(userLevel, c.owner ?? 0));
    result.total = result.cells.length;

    json(res, 200, result);
});

// GET /api/foundry/cells/:id
route('GET', '/api/foundry/cells/:id', async (req, res, params) => {
    const cell = memory.getCell(Number(params.id));
    if (!cell) return err(res, 404, '셀 없음');
    json(res, 200, cell);
});

// PATCH /api/foundry/cells/:id
route('PATCH', '/api/foundry/cells/:id', async (req, res, params) => {
    const body = await parseBody(req);
    const cell = memory.updateCell(Number(params.id), body);
    if (!cell) return err(res, 404, '셀 없음');
    json(res, 200, cell);
});

// DELETE /api/foundry/cells/:id
route('DELETE', '/api/foundry/cells/:id', async (req, res, params) => {
    const ok = memory.deleteCell(Number(params.id));
    if (!ok) return err(res, 404, '셀 없음');
    json(res, 200, { deleted: true, id: Number(params.id) });
});

// ═══ Claim CRUD + 쿼리 ═══

// POST /api/foundry/claims — Claim 생성
route('POST', '/api/foundry/claims', async (req, res) => {
    const body = await parseBody(req);
    const { subject, predicate, object, epistemic, layer } = body;
    if (!subject || !predicate || !object) {
        return err(res, 400, 'subject, predicate, object 필수');
    }
    const ep = (epistemic != null) ? epistemic : EP.OM;
    const ly = (layer != null) ? layer : LAYER.CORE;
    const cell = memory.createClaim(subject, predicate, object, ep, ly);

    // ★ 크로스앱 전파: Claim 생성 시 자동 호출
    const sourceScope = body.scope ?? 0;
    const propagated = propagation.propagate(cell, sourceScope);
    if (propagated.length > 0) {
        // 전파된 Claim을 알림으로도 생성
        for (const p of propagated) {
            notifications.push({
                id: notifications.length + 1, type: 'propagation',
                title: `전파: ${p.rule}`, message: `${SCOPE_NAME[p.from]}→${SCOPE_NAME[p.to]}`,
                severity: 'normal', timestamp: Date.now(), read: false,
            });
        }
    }

    json(res, 201, { ...cell, propagated: propagated.length, propagations: propagated });
});

// GET /api/foundry/claims?subject=X&predicate=Y&object=Z&after=ts&before=ts
route('GET', '/api/foundry/claims', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const subject = url.searchParams.get('subject');
    const predicate = url.searchParams.get('predicate');
    const object = url.searchParams.get('object');
    const after = url.searchParams.get('after');
    const before = url.searchParams.get('before');

    let claims = memory.queryClaimsFull({ subject, predicate, object });

    // 날짜 범위 필터
    if (after) {
        const ts = new Date(after).getTime() || parseInt(after);
        claims = claims.filter(c => c.createdAt >= ts);
    }
    if (before) {
        const ts = new Date(before).getTime() || parseInt(before);
        claims = claims.filter(c => c.createdAt <= ts);
    }

    json(res, 200, { total: claims.length, claims });
});

// ═══ 상태 전이 ═══

// POST /api/foundry/cells/:id/evidence
route('POST', '/api/foundry/cells/:id/evidence', async (req, res, params) => {
    const cell = memory.addEvidenceToCell(Number(params.id));
    if (!cell) return err(res, 404, '셀 없음');
    json(res, 200, cell);
});

// POST /api/foundry/cells/:id/advance
route('POST', '/api/foundry/cells/:id/advance', async (req, res, params) => {
    const cell = memory.advance(Number(params.id));
    if (!cell) return err(res, 404, '셀 없음');
    json(res, 200, cell);
});

// POST /api/foundry/cells/:id/retreat
route('POST', '/api/foundry/cells/:id/retreat', async (req, res, params) => {
    const cell = memory.retreat(Number(params.id));
    if (!cell) return err(res, 404, '셀 없음');
    json(res, 200, cell);
});

// ═══ 연결 (티옴타음 + 시냅스) ═══

// POST /api/foundry/connect — 방향성 연결
route('POST', '/api/foundry/connect', async (req, res) => {
    const { source, target, direction } = await parseBody(req);
    if (!source || !target || !direction) {
        return err(res, 400, 'source, target, direction(ti/om/ta/eum) 필수');
    }
    if (!['ti', 'om', 'ta', 'eum'].includes(direction)) {
        return err(res, 400, 'direction: ti/om/ta/eum 중 하나');
    }
    const result = memory.connect(source, target, direction);
    if (!result) return err(res, 404, '셀 없음');
    json(res, 200, result);
});

// POST /api/foundry/synapse — 양방향 시냅스
route('POST', '/api/foundry/synapse', async (req, res) => {
    const { cellA, cellB } = await parseBody(req);
    if (!cellA || !cellB) return err(res, 400, 'cellA, cellB 필수');
    const result = memory.connectBidirectional(cellA, cellB);
    if (!result) return err(res, 404, '셀 없음');
    json(res, 200, result);
});

// GET /api/foundry/cells/:id/connections
route('GET', '/api/foundry/cells/:id/connections', async (req, res, params) => {
    const conns = memory.getConnections(Number(params.id));
    if (!conns) return err(res, 404, '셀 없음');
    json(res, 200, conns);
});

// GET /api/foundry/cells/:id/chain
route('GET', '/api/foundry/cells/:id/chain', async (req, res, params) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const maxDepth = parseInt(url.searchParams.get('depth') || '100', 10);
    const chain = memory.chain(Number(params.id), maxDepth);
    json(res, 200, { startId: Number(params.id), length: chain.length, chain });
});

// GET /api/foundry/cells/:id/follow/:dir
route('GET', '/api/foundry/cells/:id/follow/:dir', async (req, res, params) => {
    const dir = params.dir;
    if (!['ti', 'om', 'ta', 'eum'].includes(dir)) {
        return err(res, 400, 'direction: ti/om/ta/eum');
    }
    const cell = memory.follow(Number(params.id), dir);
    if (!cell) return err(res, 404, '연결 없음');
    json(res, 200, cell);
});

// ═══ Layer 탐색 ═══

// GET /api/foundry/layers/:layer
route('GET', '/api/foundry/layers/:layer', async (req, res, params) => {
    const layer = Number(params.layer);
    if (layer < 0 || layer > 4) return err(res, 400, 'layer: 0~4');
    const cells = memory.getByLayer(layer);
    json(res, 200, {
        layer,
        layerName: LAYER_NAME[layer] || '?',
        total: cells.length,
        cells,
    });
});

// GET /api/foundry/epistemic/:state
route('GET', '/api/foundry/epistemic/:state', async (req, res, params) => {
    const stateMap = { ti: EP.TI, om: EP.OM, ta: EP.TA, eum: EP.EUM };
    const state = stateMap[params.state];
    if (state == null) return err(res, 400, 'state: ti/om/ta/eum');
    const cells = memory.getByEpistemic(state);
    json(res, 200, { state: params.state, total: cells.length, cells });
});

// ═══ 검색 + 통계 ═══

// GET /api/foundry/search?q=...
route('GET', '/api/foundry/search', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const q = url.searchParams.get('q') || '';
    if (!q) return err(res, 400, 'q 파라미터 필수');
    const results = memory.search(q);
    json(res, 200, { query: q, total: results.length, results });
});

// GET /api/foundry/stats
route('GET', '/api/foundry/stats', async (req, res) => {
    json(res, 200, memory.stats());
});

// ═══ 신뢰전파 ═══

// POST /api/foundry/cells/:id/propagate — 신뢰전파 실행
route('POST', '/api/foundry/cells/:id/propagate', async (req, res, params) => {
    const id = Number(params.id);
    const cell = memory.getCell(id);
    if (!cell) return err(res, 404, '셀 없음');

    const body = await parseBody(req);
    const depth = body.depth || 3;
    const visited = new Set();
    const changes = [];

    // BFS 신뢰전파
    const queue = [{ id, delta: 1, d: 0 }];
    while (queue.length > 0) {
        const { id: cid, delta, d } = queue.shift();
        if (visited.has(cid) || d > depth) continue;
        visited.add(cid);

        // 근거 추가
        const updated = memory.addEvidenceToCell(cid);
        if (updated) {
            changes.push({ id: cid, name: updated.name, status: updated.statusName, evidence: updated.evidence, trust: updated.trust });
        }

        // 이웃 탐색
        const c = memory.getCell(cid);
        if (!c) continue;
        if (c.forward > 0 && !visited.has(c.forward)) queue.push({ id: c.forward, delta: delta * 0.5, d: d + 1 });
        if (c.backward > 0 && !visited.has(c.backward)) queue.push({ id: c.backward, delta: delta * 0.5, d: d + 1 });

        // 티옴타음 연결
        if (c.connections) {
            for (const dir of ['ti', 'om', 'ta', 'eum']) {
                const tid = c.connections[dir];
                if (tid > 0 && !visited.has(tid)) queue.push({ id: tid, delta: delta * 0.5, d: d + 1 });
            }
        }
    }

    json(res, 200, { sourceId: id, depth, affected: changes.length, changes });
});

// ═══ 언약 의사결정 API ═══

// POST /api/foundry/covenant/decide — 의사결정 실행
route('POST', '/api/foundry/covenant/decide', async (req, res) => {
    const body = await parseBody(req);
    const decision = covenant.decide(body.event || body, body.context || {});
    json(res, decision.phase?.value === 1 ? 200 : decision.phase?.value === 0 ? 202 : decision.action === 'BOUNDARY_BLOCK' ? 403 : 200, decision);
});

// GET /api/foundry/covenant/decisions — 의사결정 이력
route('GET', '/api/foundry/covenant/decisions', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    json(res, 200, covenant.getDecisions(limit));
});

// GET /api/foundry/covenant/principles — 축적된 원칙
route('GET', '/api/foundry/covenant/principles', async (req, res) => {
    json(res, 200, covenant.getPrinciples());
});

// GET /api/foundry/covenant/transfers — 이관 이력
route('GET', '/api/foundry/covenant/transfers', async (req, res) => {
    json(res, 200, covenant.getTransfers());
});

// GET /api/foundry/covenant/issues — 설계자 이슈
route('GET', '/api/foundry/covenant/issues', async (req, res) => {
    json(res, 200, covenant.getDesignerIssues());
});

// GET /api/foundry/covenant/stats — 통계
route('GET', '/api/foundry/covenant/stats', async (req, res) => {
    json(res, 200, covenant.stats());
});

// GET /api/foundry/covenant/slots — 27슬롯 언약 구조
route('GET', '/api/foundry/covenant/slots', async (req, res) => {
    json(res, 200, { slots: SLOT_META, rings: RING, protocol: PROTOCOL });
});

// ═══ 문서 API (#85~87) ═══

route('GET', '/api/foundry/docs/api', async (req, res) => {
    const endpoints = routes.map(r => ({
      method: r.method,
      path: r.regex.source.replace(/\\\//g, '/').replace(/\(\[\^\/\]\+\)/g, ':param').replace(/\/\?\$/, '').replace(/^\^/, ''),
    }));
    json(res, 200, { total: endpoints.length, endpoints });
});

route('GET', '/api/foundry/docs/changelog', async (req, res) => {
    json(res, 200, [
      { version: '1.0', date: '2026-03-22', changes: [
        '6단계 계층 (개인→가정→스타트업→비영리→기업→관제)',
        '언약적 의사결정 엔진 (3계층 + 4상)',
        '인과추론 엔진 (상관→인과 자동 승격)',
        '전술 5대 모듈 (ACH/DFI/RedTeam/Wargame/MDMP)',
        '교회 7탭 + 데모 데이터',
        '군사 지도 (Leaflet + MIL-STD-2525D)',
        '국방급 보안 (ARIA-256 + Bell-LaPadula + 감사 로그)',
        '6개 전용 앱 (개인/가정/스타트업/교회/기업/관제)',
        '크로스앱 전파 엔진',
        '다크 모드 + PWA + 모바일 반응형',
        '191개 프로젝트 템플릿',
        '87개 기능 목록 중 85개 구현',
        'https://core.crowny.org 배포',
        '외부 의존 0개, 에어갭 완전 동작',
        '한선씨→API 브릿지',
      ]},
    ]);
});

route('GET', '/api/foundry/docs/onepager', async (req, res) => {
    json(res, 200, {
      title: 'CrownyCore',
      tagline: '당신의 삶을 하나의 그래프로',
      description: '개인에서 국가까지 — 27방사형 셀 아키텍처 + 4상균형3진법 기반 올 라이프 디지털 트윈 플랫폼',
      differentiator: '팔란티어는 기업→국가(위→아래). CrownyCore는 개인→국가(아래→위). 데이터에 인식상태가 내장되어 불확실성을 1등급으로 처리.',
      stack: { engine: '14 JS 모듈, 5,500줄', gui: '21 JS 파일, 4,500줄', api: '89 엔드포인트', templates: 191, size: '2MB', dependencies: 0 },
      tiers: ['개인(습관/일기/목표)', '가정(가계부/일정/자녀)', '스타트업(칸반/재무/CRM)', '비영리(교인/헌금/설교)', '기업(인사/회계/의사결정)', '관제(빌딩/센서/경보)'],
      defense: ['ARIA-256 국산 암호화', '5단계 비밀등급 (Bell-LaPadula)', 'ACH 경쟁 가설 분석', '인식론적 워게임 (DFI)', 'MDMP 7단계 게이트', '에어갭 580KB 배포'],
      url: 'https://core.crowny.org',
    });
});

// ═══ 분석 API (#62~64) ═══

// #62 상관관계 자동 발견
route('POST', '/api/foundry/analysis/correlate', async (req, res) => {
    const allClaims = memory.queryClaimsFull({});
    // predicate별 빈도 집계
    const predCounts = {};
    allClaims.forEach(c => {
      const p = c.claim?.predicate || '';
      predCounts[p] = (predCounts[p] || 0) + 1;
    });
    // 동일 subject에서 자주 함께 나타나는 predicate 쌍 찾기
    const subjectPreds = {};
    allClaims.forEach(c => {
      const s = c.claim?.subject || '';
      if (!subjectPreds[s]) subjectPreds[s] = new Set();
      subjectPreds[s].add(c.claim?.predicate || '');
    });
    const pairs = {};
    Object.values(subjectPreds).forEach(preds => {
      const arr = [...preds];
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const key = [arr[i], arr[j]].sort().join('↔');
          pairs[key] = (pairs[key] || 0) + 1;
        }
      }
    });
    const correlations = Object.entries(pairs)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([pair, count]) => ({ pair, count, strength: Math.min(13, count * 2) }));
    json(res, 200, { total: correlations.length, correlations });
});

// #63 예측 (간이 — 최근 트렌드 기반)
route('GET', '/api/foundry/analysis/predict', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const predicate = url.searchParams.get('predicate') || '헌금';
    const allClaims = memory.queryClaimsFull({ predicate });
    const now = Date.now();
    const weekMs = 7 * 86400000;
    // 최근 4주 주별 카운트
    const weekly = [0, 0, 0, 0];
    allClaims.forEach(c => {
      const age = now - (c.createdAt || now);
      const week = Math.min(3, Math.floor(age / weekMs));
      weekly[week]++;
    });
    weekly.reverse(); // [4주전, 3주전, 2주전, 이번주]
    // 간이 선형 예측
    const n = weekly.length;
    const avgX = (n - 1) / 2;
    const avgY = weekly.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    weekly.forEach((y, x) => { num += (x - avgX) * (y - avgY); den += (x - avgX) ** 2; });
    const slope = den > 0 ? num / den : 0;
    const predicted = Math.max(0, Math.round(avgY + slope * n));
    const trend = slope > 0.5 ? '상승' : slope < -0.5 ? '하락' : '유지';

    json(res, 200, { predicate, weekly, predicted, trend, slope: +slope.toFixed(2) });
});

// #64 비교 분석 (이번 주 vs 지난 주)
route('GET', '/api/foundry/analysis/compare', async (req, res) => {
    const allClaims = memory.queryClaimsFull({});
    const now = Date.now();
    const weekMs = 7 * 86400000;
    const thisWeek = allClaims.filter(c => c.createdAt && (now - c.createdAt) < weekMs);
    const lastWeek = allClaims.filter(c => c.createdAt && (now - c.createdAt) >= weekMs && (now - c.createdAt) < weekMs * 2);

    const compare = (arr) => {
      const byPred = {};
      arr.forEach(c => { const p = c.claim?.predicate || '기타'; byPred[p] = (byPred[p] || 0) + 1; });
      return byPred;
    };

    const tw = compare(thisWeek);
    const lw = compare(lastWeek);
    const allPreds = new Set([...Object.keys(tw), ...Object.keys(lw)]);
    const comparison = [...allPreds].map(p => ({
      predicate: p,
      thisWeek: tw[p] || 0,
      lastWeek: lw[p] || 0,
      delta: (tw[p] || 0) - (lw[p] || 0),
      trend: (tw[p] || 0) > (lw[p] || 0) ? '↑' : (tw[p] || 0) < (lw[p] || 0) ? '↓' : '→',
    })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    json(res, 200, { thisWeekTotal: thisWeek.length, lastWeekTotal: lastWeek.length, comparison });
});

// ═══ 한선씨 실행 API (#81) ═══

route('POST', '/api/foundry/hanseon/run', async (req, res) => {
    const { code, file } = await parseBody(req);
    const { execFile } = require('child_process');
    const fs = require('fs');
    const path = require('path');

    const crownyBin = path.join(__dirname, '..', '..', 'target', 'release', 'crowny');
    if (!fs.existsSync(crownyBin)) return err(res, 500, 'crowny 바이너리 없음');

    let tmpFile = null;
    const target = file || (() => {
      tmpFile = path.join(__dirname, '..', '..', 'data', `tmp_${Date.now()}.han`);
      fs.writeFileSync(tmpFile, code || '', 'utf8');
      return tmpFile;
    })();

    execFile(crownyBin, [target], { encoding: 'utf8', timeout: 10000, cwd: path.join(__dirname, '..', '..') }, (error, stdout, stderr) => {
      if (tmpFile) try { fs.unlinkSync(tmpFile); } catch {}
      if (error) {
        json(res, 200, { success: false, output: stdout || '', error: stderr || error.message });
      } else {
        json(res, 200, { success: true, output: stdout || '', error: stderr || null });
      }
      if (req._user) audit.log('HANSEON', req._user.name, `${(code||'').slice(0,50)}...`);
    });
});

// ═══ 전술 API ═══

// ACH
route('POST', '/api/foundry/tactical/ach/hypothesis', async (req, res) => {
    const { name, desc } = await parseBody(req);
    json(res, 201, ach.addHypothesis(name, desc));
});
route('POST', '/api/foundry/tactical/ach/evidence', async (req, res) => {
    const { name, source, reliability } = await parseBody(req);
    json(res, 201, ach.addEvidence(name, source, reliability));
});
route('POST', '/api/foundry/tactical/ach/score', async (req, res) => {
    const { hypothesisId, evidenceId, score } = await parseBody(req);
    ach.score(hypothesisId, evidenceId, score);
    json(res, 200, { scored: true });
});
route('GET', '/api/foundry/tactical/ach/evaluate', async (req, res) => {
    json(res, 200, ach.evaluate());
});
route('GET', '/api/foundry/tactical/ach/matrix', async (req, res) => {
    json(res, 200, ach.getMatrix());
});

// Wargame
route('POST', '/api/foundry/tactical/wargame/coa', async (req, res) => {
    const coa = await parseBody(req);
    json(res, 200, wargame.evaluateCOA(coa));
});
route('GET', '/api/foundry/tactical/wargame/compare', async (req, res) => {
    json(res, 200, wargame.compare());
});
route('POST', '/api/foundry/tactical/wargame/reset', async (req, res) => {
    wargame.reset();
    json(res, 200, { reset: true });
});

// Red Team
route('POST', '/api/foundry/tactical/redteam/knowledge', async (req, res) => {
    const { items } = await parseBody(req);
    redTeam.setEstimatedKnowledge(items || []);
    json(res, 200, { set: true, count: (items || []).length });
});
route('POST', '/api/foundry/tactical/redteam/predict', async (req, res) => {
    const situation = await parseBody(req);
    json(res, 200, redTeam.predictEnemyCOA(situation));
});
route('GET', '/api/foundry/tactical/redteam/deception', async (req, res) => {
    json(res, 200, redTeam.findDeceptionOpportunities());
});
route('GET', '/api/foundry/tactical/redteam/advantage', async (req, res) => {
    json(res, 200, redTeam.findInformationAdvantage());
});

// MDMP
route('GET', '/api/foundry/tactical/mdmp/status', async (req, res) => {
    json(res, 200, mdmp.getStatus());
});
route('POST', '/api/foundry/tactical/mdmp/cell', async (req, res) => {
    const { phaseId, cell } = await parseBody(req);
    mdmp.addCell(phaseId, cell);
    json(res, 200, { added: true, phase: phaseId });
});
route('POST', '/api/foundry/tactical/mdmp/advance', async (req, res) => {
    json(res, 200, mdmp.advance());
});
route('POST', '/api/foundry/tactical/mdmp/force', async (req, res) => {
    const { commander, reason } = await parseBody(req);
    const result = mdmp.forceAdvance(commander || req._user?.name || 'unknown', reason || '');
    if (req._user) audit.log('MDMP_OVERRIDE', req._user.name, `Phase ${result.newPhase}: ${reason}`, 'SECRET');
    json(res, 200, result);
});

// ═══ 인증 + 보안 API ═══

// POST /api/foundry/auth/login (속도 제한 적용)
route('POST', '/api/foundry/auth/login', async (req, res) => {
    const ip = req._ip || 'unknown';
    if (!checkRateLimit(ip)) {
      audit.log('LOGIN_BLOCKED', ip, 'Rate limit exceeded');
      return err(res, 429, '로그인 시도 제한 (1분에 5회)');
    }
    const { username, password } = await parseBody(req);
    const user = users.authenticate(username, password);
    if (!user) {
      audit.log('LOGIN_FAIL', username || ip, 'Invalid credentials');
      return err(res, 401, '인증 실패');
    }
    const token = createToken(user.id, user.username, user.clearanceLevel);
    audit.log('LOGIN', user.username, `Level: ${CLASS_NAME[user.clearanceLevel]}`);
    json(res, 200, { token, user: { ...user, levelName: CLASS_NAME[user.clearanceLevel] } });
});

// POST /api/foundry/auth/register (등급 부여는 인증된 관리자만)
route('POST', '/api/foundry/auth/register', async (req, res) => {
    const { username, password, clearanceLevel } = await parseBody(req);
    if (!username || !password) return err(res, 400, 'username, password 필수');

    // 등급 부여 제한: 0(일반)은 자유 등록, 1 이상은 관리자(TOP_SECRET) 인증 필요
    let grantLevel = 0;
    if (clearanceLevel && clearanceLevel > 0) {
      const admin = req._user;
      if (!admin || admin.level < CLASSIFICATION.TOP_SECRET) {
        audit.log('REGISTER_DENIED', username, `Tried level ${clearanceLevel} without admin auth`);
        return err(res, 403, '등급 부여는 1급비밀 관리자만 가능');
      }
      grantLevel = Math.min(clearanceLevel, admin.level); // 자기 등급 이하만 부여 가능
    }

    const user = users.register(username, password, grantLevel);
    if (!user) return err(res, 409, '이미 존재하는 사용자');
    audit.log('REGISTER', username, `Level: ${CLASS_NAME[user.clearanceLevel]}${req._user ? ' by '+req._user.name : ''}`);
    json(res, 201, { ...user, levelName: CLASS_NAME[user.clearanceLevel] });
});

// POST /api/foundry/auth/password — 비밀번호 변경
route('POST', '/api/foundry/auth/password', async (req, res) => {
    const { username, oldPassword, newPassword } = await parseBody(req);
    if (!username || !oldPassword || !newPassword) return err(res, 400, '필수 항목 누락');
    const result = users.changePassword(username, oldPassword, newPassword);
    if (!result) return err(res, 401, '기존 비밀번호 불일치');
    audit.log('PASSWORD_CHANGE', username, '비밀번호 변경');
    json(res, 200, result);
});

// POST /api/foundry/import/csv — CSV 데이터 가져오기
route('POST', '/api/foundry/import/csv', async (req, res) => {
    const { rows, type } = await parseBody(req);
    // rows: [{ name, content, type, layer, scope }] 또는 [{ subject, predicate, object, layer }]
    if (!rows || !Array.isArray(rows)) return err(res, 400, 'rows 배열 필수');
    let created = 0;
    for (const row of rows) {
      if (type === 'claims' && row.subject && row.predicate && row.object) {
        memory.createClaim(row.subject, row.predicate, row.object, 0, row.layer ?? 0);
        created++;
      } else if (row.name) {
        memory.createValue(row.name, row.type ?? 3, row.content ?? '', { layer: row.layer ?? 0, tag: row.scope ?? 0 });
        created++;
      }
    }
    if (req._user) audit.log('IMPORT', req._user.name, `${created}건 가져오기`);
    json(res, 201, { imported: created });
});

// DELETE /api/foundry/cells/bulk — 일괄 삭제
route('POST', '/api/foundry/cells/bulk-delete', async (req, res) => {
    const { ids } = await parseBody(req);
    if (!ids || !Array.isArray(ids)) return err(res, 400, 'ids 배열 필수');
    let deleted = 0;
    for (const id of ids) {
      if (memory.deleteCell(id)) deleted++;
    }
    if (req._user) audit.log('BULK_DELETE', req._user.name, `${deleted}건 삭제`);
    json(res, 200, { deleted });
});

// GET /api/foundry/auth/users
route('GET', '/api/foundry/auth/users', async (req, res) => {
    json(res, 200, users.listUsers());
});

// GET /api/foundry/auth/verify
route('GET', '/api/foundry/auth/verify', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const data = verifyToken(token);
    if (!data) return err(res, 401, '유효하지 않은 토큰');
    json(res, 200, { ...data, levelName: CLASS_NAME[data.level] });
});

// GET /api/foundry/security/classifications
route('GET', '/api/foundry/security/classifications', async (req, res) => {
    json(res, 200, Object.entries(CLASS_NAME).map(([k, v]) => ({ level: +k, name: v })));
});

// GET /api/foundry/audit/recent
route('GET', '/api/foundry/audit/recent', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    json(res, 200, audit.recent(limit));
});

// GET /api/foundry/audit/verify
route('GET', '/api/foundry/audit/verify', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const date = url.searchParams.get('date');
    json(res, 200, audit.verify(date));
});

// ═══ 데모 데이터 API ═══

route('POST', '/api/foundry/demo/church', async (req, res) => {
    const results = generateChurchDemo(memory);
    json(res, 201, results);
});

// ═══ 스코프 + 전파 API ═══

route('GET', '/api/foundry/scopes', async (req, res) => {
    json(res, 200, Object.entries(SCOPE_NAME).map(([k,v]) => ({ id: +k, name: v, app: SCOPE_APP[+k] })));
});

route('GET', '/api/foundry/propagation/rules', async (req, res) => {
    json(res, 200, propagation.getRules());
});

route('POST', '/api/foundry/propagation/test', async (req, res) => {
    const { predicate, subject, object, sourceScope } = await parseBody(req);
    const fakeClaim = { claim: { subject, predicate, object } };
    const results = propagation.propagate(fakeClaim, sourceScope ?? 0);
    json(res, 200, { propagated: results.length, results });
});

// ═══ 주간 리포트 API ═══

route('GET', '/api/foundry/report/weekly', async (req, res) => {
    const now = Date.now();
    const weekMs = 7 * 86400000;
    const dayMs = 86400000;

    // 전체 Claim
    const allClaims = memory.queryClaimsFull({});
    const weekClaims = allClaims.filter(c => c.createdAt && (now - c.createdAt) < weekMs);
    const todayClaims = allClaims.filter(c => c.createdAt && (now - c.createdAt) < dayMs);

    // 카테고리별
    const offerings = weekClaims.filter(c => c.claim?.predicate === '헌금');
    const prayers = weekClaims.filter(c => c.claim?.predicate === '기도제목' || c.claim?.predicate === '기도');
    const notices = weekClaims.filter(c => c.claim?.subject === '공지');
    const answered = prayers.filter(c => (c.claim?.object||'').includes('응답'));

    // 헌금 합계
    const totalOffering = offerings.reduce((s, c) => {
      const m = (c.claim?.object||'').match(/(\d[\d,]*)/);
      return s + (m ? parseInt(m[1].replace(/,/g,'')) : 0);
    }, 0);

    // 셀 통계
    const cellStats = memory.stats();
    const byStatus = cellStats.byStatus || {};

    // 습관 (라이프)
    const allCells = memory.listCells(0, 500).cells || [];
    const habits = allCells.filter(c => c.name && c.name.includes(':'));
    const habitsConfirmed = habits.filter(c => c.status === 2).length;

    // 경보
    const cityStats = city.stats();

    // 의사결정
    const covStats = covenant.stats();

    // 일별 활동 (최근 7일)
    const daily = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = now - (i + 1) * dayMs;
      const dayEnd = now - i * dayMs;
      const count = allClaims.filter(c => c.createdAt >= dayStart && c.createdAt < dayEnd).length;
      const date = new Date(dayEnd);
      daily.push({ date: `${date.getMonth()+1}/${date.getDate()}`, count });
    }

    json(res, 200, {
      period: { from: new Date(now - weekMs).toLocaleDateString('ko'), to: new Date(now).toLocaleDateString('ko') },
      summary: {
        totalRecords: weekClaims.length,
        todayRecords: todayClaims.length,
        totalCells: cellStats.totalCells,
        confirmed: byStatus['2'] || 0,
        pending: byStatus['0'] || 0,
      },
      life: { totalHabits: habits.length, confirmed: habitsConfirmed, rate: habits.length > 0 ? Math.round(habitsConfirmed / habits.length * 100) : 0 },
      church: { offerings: offerings.length, totalOffering, prayers: prayers.length, answered: answered.length, notices: notices.length },
      city: { activeAlerts: cityStats.activeAlerts, totalAlerts: cityStats.totalAlerts, resolved: cityStats.resolvedAlerts },
      decisions: { total: covStats.totalDecisions, ti: covStats.ti, om: covStats.om, principles: covStats.principles, growth: covStats.growthLevel },
      daily,
    });
});

// ═══ 알림 API ═══

const notifications = [];

route('POST', '/api/foundry/notify', async (req, res) => {
    const { type, title, message, severity } = await parseBody(req);
    const n = { id: notifications.length + 1, type: type || 'info', title, message, severity: severity || 'normal', timestamp: Date.now(), read: false };
    notifications.push(n);
    json(res, 201, n);
});

route('GET', '/api/foundry/notifications', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const unreadOnly = url.searchParams.get('unread') === 'true';
    const list = unreadOnly ? notifications.filter(n => !n.read) : notifications;
    json(res, 200, { total: list.length, unread: notifications.filter(n => !n.read).length, notifications: list.slice(-50).reverse() });
});

route('POST', '/api/foundry/notifications/read', async (req, res) => {
    const { id } = await parseBody(req);
    if (id === 'all') { notifications.forEach(n => n.read = true); }
    else { const n = notifications.find(n => n.id === id); if (n) n.read = true; }
    json(res, 200, { unread: notifications.filter(n => !n.read).length });
});

// ═══ 앱 간 연결 API ═══

route('POST', '/api/foundry/link-person', async (req, res) => {
    const { personName } = await parseBody(req);
    if (!personName) return err(res, 400, 'personName 필수');

    // 이름으로 모든 관련 셀 검색
    const results = memory.search(personName);
    const claims = memory.queryClaimsFull({ subject: personName });

    // 관련 셀들 시냅스 연결
    const ids = results.map(c => c.id);
    for (let i = 0; i < ids.length - 1; i++) {
      memory.connectBidirectional(ids[i], ids[i + 1]);
    }

    json(res, 200, {
      person: personName,
      cells: results.length,
      claims: claims.length,
      linked: Math.max(0, ids.length - 1),
      apps: {
        life: results.filter(c => c.name?.includes(':')).length > 0,
        church: results.filter(c => c.layer === 0 && c.type === 3).length > 0,
        city: false,
      },
    });
});

// ═══ 라이프스타일 API ═══

route('POST', '/api/foundry/life/create', async (req, res) => {
    const { name } = await parseBody(req);
    if (!name) return err(res, 400, 'name 필수');
    json(res, 201, life.createProfile(name));
});

route('POST', '/api/foundry/life/check', async (req, res) => {
    const { cellId } = await parseBody(req);
    const result = life.checkHabit(cellId);
    if (!result) return err(res, 404, '셀 없음');
    json(res, 200, result);
});

route('POST', '/api/foundry/life/day', async (req, res) => {
    const { habitIds } = await parseBody(req);
    json(res, 200, life.checkDay(habitIds || []));
});

route('POST', '/api/foundry/life/achievement', async (req, res) => {
    const { habitIds } = await parseBody(req);
    json(res, 200, life.calcAchievement(habitIds || []));
});

// ═══ 도시관리 API ═══

route('POST', '/api/foundry/city/building', async (req, res) => {
    const { name, address, floors, usage } = await parseBody(req);
    if (!name) return err(res, 400, 'name 필수');
    json(res, 201, city.createBuilding(name, address || '', floors || 5, usage || '복합'));
});

route('POST', '/api/foundry/city/sensor', async (req, res) => {
    const { buildingId, system, value, severity } = await parseBody(req);
    const result = city.sensorEvent(buildingId, system, value, severity || 'normal');
    if (!result) return err(res, 404, '빌딩 없음');
    json(res, 200, result);
});

route('POST', '/api/foundry/city/scenario', async (req, res) => {
    const scenario = await parseBody(req);
    json(res, 200, city.runScenario(scenario));
});

route('GET', '/api/foundry/city/alerts', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const all = url.searchParams.get('all') === 'true';
    json(res, 200, city.getAlerts(!all));
});

route('POST', '/api/foundry/city/resolve', async (req, res) => {
    const { alertId } = await parseBody(req);
    const alert = city.resolveAlert(alertId);
    if (!alert) return err(res, 404, '경보 없음');
    json(res, 200, alert);
});

route('GET', '/api/foundry/city/stats', async (req, res) => {
    json(res, 200, city.stats());
});

// ═══ 인과추론 API ═══

// POST /api/foundry/causal/relate — 관계 등록
route('POST', '/api/foundry/causal/relate', async (req, res) => {
    const { source, target, type } = await parseBody(req);
    if (!source || !target) return err(res, 400, 'source, target 필수');
    const edge = causal.addRelation(source, target, type ?? -2);
    json(res, 201, edge);
});

// POST /api/foundry/causal/detect — 동시발생 자동 감지
route('POST', '/api/foundry/causal/detect', async (req, res) => {
    const body = await parseBody(req);
    const cellIds = body.cellIds || memory.listCells(0, 200).cells.map(c => c.id);
    const window = body.windowMs || 60000;
    const newEdges = causal.detectCooccurrence(cellIds, window);
    json(res, 200, { detected: newEdges.length, edges: newEdges });
});

// POST /api/foundry/causal/temporal — 시간선행 검사
route('POST', '/api/foundry/causal/temporal', async (req, res) => {
    const { source, target } = await parseBody(req);
    const edge = causal.checkTemporalPrecedence(source, target);
    if (!edge) return err(res, 404, '관계 없음');
    json(res, 200, edge);
});

// POST /api/foundry/causal/intervene — 개입효과 검사
route('POST', '/api/foundry/causal/intervene', async (req, res) => {
    const { source, target, targetChanged } = await parseBody(req);
    const edge = causal.checkIntervention(source, target, !!targetChanged);
    if (!edge) return err(res, 404, '관계 없음');
    json(res, 200, edge);
});

// POST /api/foundry/causal/confounder — 교란변수 감지
route('POST', '/api/foundry/causal/confounder', async (req, res) => {
    const { source, target, confounder } = await parseBody(req);
    const edge = causal.detectConfounder(source, target, confounder);
    if (!edge) return err(res, 404, '관계 없음');
    json(res, 200, edge);
});

// POST /api/foundry/causal/infer — 자율 추론 실행
route('POST', '/api/foundry/causal/infer', async (req, res) => {
    const results = causal.autoInfer();
    json(res, 200, { ...results, edges: causal.getAllEdges() });
});

// GET /api/foundry/causal/edges — 전체 엣지
route('GET', '/api/foundry/causal/edges', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const type = url.searchParams.get('type');
    const edges = type != null ? causal.getByType(Number(type)) : causal.getAllEdges();
    json(res, 200, { total: edges.length, edges });
});

// GET /api/foundry/causal/edges/:id — 특정 셀의 엣지
route('GET', '/api/foundry/causal/edges/:id', async (req, res, params) => {
    const id = Number(params.id);
    const from = causal.getEdgesFrom(id);
    const to = causal.getEdgesTo(id);
    json(res, 200, { cellId: id, outgoing: from, incoming: to });
});

// GET /api/foundry/causal/stats — 인과추론 통계
route('GET', '/api/foundry/causal/stats', async (req, res) => {
    json(res, 200, causal.stats());
});

// ═══ 템플릿 API ═══

// GET /api/foundry/templates — 전체 템플릿 목록
route('GET', '/api/foundry/templates', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const domain = url.searchParams.get('domain');
    const q = url.searchParams.get('q');
    let list = TEMPLATES;
    if (domain) list = list.filter(t => t.domain === domain);
    if (q) {
        const ql = q.toLowerCase();
        list = list.filter(t => t.name.toLowerCase().includes(ql) || t.desc.toLowerCase().includes(ql) || (t.tags || []).some(tag => tag.includes(ql)));
    }
    json(res, 200, { total: list.length, domains: DOMAINS, templates: list.map(t => ({ id: t.id, domain: t.domain, name: t.name, desc: t.desc, tags: t.tags, cellCount: t.cells.length, claimCount: (t.claims||[]).length })) });
});

// GET /api/foundry/templates/:id — 단일 템플릿 상세
route('GET', '/api/foundry/templates/:id', async (req, res, params) => {
    const tmpl = TEMPLATES.find(t => t.id === params.id);
    if (!tmpl) return err(res, 404, '템플릿 없음: ' + params.id);
    json(res, 200, tmpl);
});

// POST /api/foundry/templates/:id/deploy — 템플릿 배포
route('POST', '/api/foundry/templates/:id/deploy', async (req, res, params) => {
    const result = deployTemplate(memory, params.id);
    if (!result) return err(res, 404, '템플릿 없음: ' + params.id);
    json(res, 201, result);
});

// GET /api/foundry/domains — 도메인 목록
route('GET', '/api/foundry/domains', async (req, res) => {
    const domainStats = DOMAINS.map(d => ({
        ...d,
        templateCount: TEMPLATES.filter(t => t.domain === d.id).length,
    }));
    json(res, 200, domainStats);
});

// ═══ 요청 핸들러 ═══

async function handleRequest(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // foundry API만 처리
    if (!pathname.startsWith('/api/foundry')) {
        return err(res, 404, 'Not Found');
    }

    // 인증 미들웨어
    if (!authMiddleware(req, res, pathname)) {
        return err(res, 401, '인증 필요');
    }

    const matched = matchRoute(req.method, pathname);
    if (!matched) return err(res, 404, `경로 없음: ${req.method} ${pathname}`);

    try {
        await matched.handler(req, res, matched.params);
    } catch (e) {
        console.error('[Foundry]', e);
        err(res, 500, e.message || 'Internal Error');
    }
}

// ═══ 독립 실행 모드 ═══

if (require.main === module) {
    const http = require('http');
    const PORT = parseInt(process.env.FOUNDRY_PORT || '7731', 10);
    const server = http.createServer(handleRequest);
    server.listen(PORT, () => {
        console.log(`═══════════════════════════════════════════════════`);
        console.log(`  CrownyFoundry 온톨로직 데이터 엔진`);
        console.log(`  Port: ${PORT}`);
        console.log(`  API:  http://localhost:${PORT}/api/foundry/`);
        console.log(`═══════════════════════════════════════════════════`);
        console.log(`  셀 CRUD:      POST/GET/PATCH/DELETE /api/foundry/cells`);
        console.log(`  Claim 쿼리:   POST/GET /api/foundry/claims`);
        console.log(`  상태 전이:    POST /api/foundry/cells/:id/evidence|advance|retreat`);
        console.log(`  연결:         POST /api/foundry/connect|synapse`);
        console.log(`  레이어:       GET /api/foundry/layers/0~4`);
        console.log(`  인식상태:     GET /api/foundry/epistemic/ti|om|ta|eum`);
        console.log(`  검색:         GET /api/foundry/search?q=...`);
        console.log(`  통계:         GET /api/foundry/stats`);
        console.log(`═══════════════════════════════════════════════════`);
    });
}

// ═══ 통합 모드 (server.js에서 require) ═══

module.exports = { handleRequest, memory };
