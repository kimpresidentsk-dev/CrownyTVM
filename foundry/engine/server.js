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
    const { name, type, content, confirmed, layer, owner, tag, scope } = body;
    if (!name) return err(res, 400, 'name 필수');
    const cell = memory.createValue(name, type ?? TYPE.NONE, content ?? 0, {
        confirmed: !!confirmed, layer, owner, tag: scope ?? tag ?? 0,
    });
    json(res, 201, cell);
});

// GET /api/foundry/cells — 셀 목록
route('GET', '/api/foundry/cells', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
    const scope = url.searchParams.get('scope');
    const result = memory.listCells(offset, limit);
    if (scope != null) {
        const s = parseInt(scope);
        result.cells = result.cells.filter(c => (c.tag ?? 0) === s);
        result.total = result.cells.length;
    }
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

// GET /api/foundry/claims?subject=X&predicate=Y&object=Z
route('GET', '/api/foundry/claims', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const subject = url.searchParams.get('subject');
    const predicate = url.searchParams.get('predicate');
    const object = url.searchParams.get('object');

    if (!subject && !predicate && !object) {
        // 전체 Claim 목록
        const claims = memory.queryClaimsFull({});
        return json(res, 200, { total: claims.length, claims });
    }

    const claims = memory.queryClaimsFull({ subject, predicate, object });
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
