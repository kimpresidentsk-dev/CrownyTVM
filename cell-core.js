// ═══════════════════════════════════════════════════════════════
// cell-core.js — CrownyCell Core API (27-슬롯 방사형 셀 DB)
//
// 모든 데이터 = 27-슬롯 셀
// 모든 기능 = 셀 CRUD + 시냅스 연결
// 모든 관계 = ▲티(상위) ●옴(현재) ▼타(하위) ◆음(시냅스)
//
// 16 워크스페이스가 이 API 위에서 동작:
//   Canvas(1) Messenger(2) DEX(3) Trading(4) Note(5)
//   Project(6) Content(7) Game(8) Workbench(9) Shop(10)
//   Life(11) Synergy(12) Mind(13) Bible(14) Admin(15) Om(16)
// ═══════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');

// ── 27-슬롯 인덱스 (chain/cell.js와 동일) ──

const S = {
    SUBJECT:    0,   // 주체 (who/from)
    PREDICATE:  1,   // 술어 (type/action — 셀 타입)
    OBJECT:     2,   // 대상 (who/to/what)
    EPISTEMIC:  3,   // 인식상태 (0=미지, 1=가능, 2=개연, 3=확정)
    TRUST:      4,   // 신뢰값 (-13~+13)
    EVIDENCE:   5,   // 증거수
    EVIDENCE_1: 6,   // 증거/참조 1
    EVIDENCE_2: 7,   // 증거/참조 2
    EVIDENCE_3: 8,   // 증거/참조 3
    RESERVED_1: 9,
    RESERVED_2: 10,
    RESERVED_3: 11,
    TIMESTAMP:  12,  // 생성시각 (초)
    CATEGORY:   13,  // 카테고리
    DOMAIN:     14,  // 수치값/금액
    LAYER:      15,  // 레이어/버전
    DATA_0:     16,  // 사용자 데이터 시작
    DATA_1:     17,
    DATA_2:     18,
    DATA_3:     19,
    DATA_4:     20,
    DATA_5:     21,
    DATA_6:     22,  // 사용자 데이터 끝
    SYNAPSE:    23,  // ◆음 — 시냅스 (연결 포인터)
    TI_LINK:    24,  // ▲티 — 상위 연결
    OM_LINK:    25,  // ●옴 — 현재 연결 (형제)
    TA_LINK:    26,  // ▼타 — 하위 연결
};

// ── 셀 타입 (16 워크스페이스 + 시스템) ──

const CELL_TYPE = {
    // 워크스페이스 타입
    COMPUTE:    1,   // Canvas — 자연어→ISA729
    MESSAGE:    2,   // Messenger
    SWAP:       3,   // DEX
    POSITION:   4,   // Trading
    DOCUMENT:   5,   // Note
    MILESTONE:  6,   // Project
    CREATION:   7,   // Content
    PLAY:       8,   // Game
    CODE:       9,   // Workbench
    ORDER:      10,  // Shop
    RECORD:     11,  // Life
    LINK:       12,  // Synergy
    THOUGHT:    13,  // Mind
    STUDY:      14,  // Bible
    SYSTEM:     15,  // Admin
    ESSENCE:    16,  // Om

    // 레거시 타입 (기존 cells.json 호환)
    PERSON:     300,
    CONTACT:    401,
    WALLET:     403,
    TRANSACTION:404,
};

const TYPE_NAME = {};
for (const [k, v] of Object.entries(CELL_TYPE)) TYPE_NAME[v] = k;

// ── 인식상태 ──

const EPISTEMIC = {
    UNKNOWN:   0,  // 음(Eum) — 미지
    POSSIBLE:  1,  // 옴(Om) — 가능
    PROBABLE:  2,  // 티(Ti) — 개연
    CONFIRMED: 3,  // 확정
};

// ── CrownyCell Core ──

class CellCore {
    constructor(dataDir) {
        this.dataDir = dataDir || path.join(__dirname, 'data');
        this.cellFile = path.join(this.dataDir, 'crowny-cells.json');
        this.cells = new Map(); // id → cell
        this.nextId = 1;
        this._load();
    }

    // ── CRUD ──

    create(type, subject, object, data = {}) {
        const id = this.nextId++;
        const now = Math.floor(Date.now() / 1000);
        const cell = {
            id,
            s: new Array(27).fill(null),
        };
        cell.s[S.SUBJECT]   = subject || null;
        cell.s[S.PREDICATE] = type;
        cell.s[S.OBJECT]    = object || null;
        cell.s[S.EPISTEMIC] = data.epistemic ?? EPISTEMIC.POSSIBLE;
        cell.s[S.TRUST]     = data.trust ?? 0;
        cell.s[S.EVIDENCE]  = 0;
        cell.s[S.TIMESTAMP] = now;
        cell.s[S.CATEGORY]  = data.category ?? null;
        cell.s[S.DOMAIN]    = data.value ?? 0;
        cell.s[S.LAYER]     = data.layer ?? 0;
        // 사용자 데이터 (최대 7개)
        if (data.data) {
            for (let i = 0; i < Math.min(data.data.length, 7); i++) {
                cell.s[S.DATA_0 + i] = data.data[i];
            }
        }
        // 개별 필드
        if (data.name) cell.s[S.DATA_0] = data.name;
        if (data.content) cell.s[S.DATA_1] = data.content;
        if (data.memo) cell.s[S.DATA_2] = data.memo;
        // 시냅스 (연결)
        cell.s[S.SYNAPSE] = data.synapse ?? null;
        cell.s[S.TI_LINK] = data.tiLink ?? null;
        cell.s[S.OM_LINK] = data.omLink ?? null;
        cell.s[S.TA_LINK] = data.taLink ?? null;

        this.cells.set(id, cell);
        this._save();
        return cell;
    }

    get(id) {
        return this.cells.get(id) || null;
    }

    update(id, updates) {
        const cell = this.cells.get(id);
        if (!cell) return null;
        for (const [slot, value] of Object.entries(updates)) {
            // 숫자 키 또는 S 상수 이름
            const num = parseInt(slot);
            const idx = !isNaN(num) ? num : S[slot];
            if (idx !== undefined && idx >= 0 && idx < 27) {
                cell.s[idx] = value;
            }
        }
        cell.s[S.TIMESTAMP] = Math.floor(Date.now() / 1000);
        this._save();
        return cell;
    }

    delete(id) {
        const deleted = this.cells.delete(id);
        if (deleted) this._save();
        return deleted;
    }

    // ── 쿼리 ──

    query(filters = {}) {
        let results = Array.from(this.cells.values());

        if (filters.type != null) {
            results = results.filter(c => c.s[S.PREDICATE] === filters.type);
        }
        if (filters.subject != null) {
            results = results.filter(c => c.s[S.SUBJECT] === filters.subject);
        }
        if (filters.object != null) {
            results = results.filter(c => c.s[S.OBJECT] === filters.object);
        }
        if (filters.owner != null) {
            // owner = subject (호환)
            results = results.filter(c => c.s[S.SUBJECT] === filters.owner);
        }
        if (filters.category != null) {
            results = results.filter(c => c.s[S.CATEGORY] === filters.category);
        }
        if (filters.minTrust != null) {
            results = results.filter(c => (c.s[S.TRUST] || 0) >= filters.minTrust);
        }
        if (filters.epistemic != null) {
            results = results.filter(c => c.s[S.EPISTEMIC] === filters.epistemic);
        }

        // 정렬 (기본: 최신순)
        const sortBy = filters.sortBy || S.TIMESTAMP;
        const sortDir = filters.sortDir || 'desc';
        results.sort((a, b) => sortDir === 'desc'
            ? (b.s[sortBy] || 0) - (a.s[sortBy] || 0)
            : (a.s[sortBy] || 0) - (b.s[sortBy] || 0));

        // 페이지네이션
        const offset = filters.offset || 0;
        const limit = filters.limit || 50;
        return results.slice(offset, offset + limit);
    }

    count(filters = {}) {
        return this.query({ ...filters, limit: 999999 }).length;
    }

    // ── 시냅스 연결 ──

    link(fromId, toId, direction = 'synapse') {
        const from = this.cells.get(fromId);
        const to = this.cells.get(toId);
        if (!from || !to) return false;

        const slot = direction === 'ti' ? S.TI_LINK
                   : direction === 'om' ? S.OM_LINK
                   : direction === 'ta' ? S.TA_LINK
                   : S.SYNAPSE;

        // 기존 연결에 추가 (배열로)
        const existing = from.s[slot];
        if (existing === null) {
            from.s[slot] = toId;
        } else if (Array.isArray(existing)) {
            if (!existing.includes(toId)) existing.push(toId);
        } else {
            from.s[slot] = [existing, toId];
        }

        // 신뢰 전파
        if (from.s[S.EPISTEMIC] >= EPISTEMIC.PROBABLE && to.s[S.EPISTEMIC] < EPISTEMIC.PROBABLE) {
            to.s[S.TRUST] = Math.min(13, (to.s[S.TRUST] || 0) + 1);
        }

        this._save();
        return true;
    }

    // 셀 그래프 조회 (depth만큼 연결 따라감)
    graph(cellId, depth = 1) {
        const result = { root: null, connected: [] };
        const cell = this.cells.get(cellId);
        if (!cell) return result;
        result.root = this._toJSON(cell);

        if (depth > 0) {
            const visited = new Set([cellId]);
            for (const slot of [S.SYNAPSE, S.TI_LINK, S.OM_LINK, S.TA_LINK]) {
                const linked = cell.s[slot];
                if (!linked) continue;
                const ids = Array.isArray(linked) ? linked : [linked];
                for (const lid of ids) {
                    if (!visited.has(lid)) {
                        visited.add(lid);
                        const lc = this.cells.get(lid);
                        if (lc) result.connected.push(this._toJSON(lc));
                    }
                }
            }
        }
        return result;
    }

    // ── 인식론 전이 ──

    addEvidence(cellId) {
        const cell = this.cells.get(cellId);
        if (!cell) return null;
        cell.s[S.EVIDENCE] = (cell.s[S.EVIDENCE] || 0) + 1;
        // 증거 3개 이상 → 확정 승격
        if (cell.s[S.EVIDENCE] >= 3 && cell.s[S.EPISTEMIC] < EPISTEMIC.CONFIRMED) {
            cell.s[S.EPISTEMIC] = EPISTEMIC.CONFIRMED;
            cell.s[S.TRUST] = 13;
        }
        this._save();
        return cell;
    }

    // ── 통계 ──

    stats() {
        const byType = {};
        for (const cell of this.cells.values()) {
            const type = cell.s[S.PREDICATE];
            const name = TYPE_NAME[type] || String(type);
            byType[name] = (byType[name] || 0) + 1;
        }
        return {
            totalCells: this.cells.size,
            byType,
            nextId: this.nextId,
        };
    }

    // ── JSON 변환 ──

    _toJSON(cell) {
        return {
            id: cell.id,
            type: cell.s[S.PREDICATE],
            typeName: TYPE_NAME[cell.s[S.PREDICATE]] || null,
            subject: cell.s[S.SUBJECT],
            object: cell.s[S.OBJECT],
            epistemic: cell.s[S.EPISTEMIC],
            trust: cell.s[S.TRUST],
            evidence: cell.s[S.EVIDENCE],
            timestamp: cell.s[S.TIMESTAMP],
            category: cell.s[S.CATEGORY],
            value: cell.s[S.DOMAIN],
            layer: cell.s[S.LAYER],
            data: cell.s.slice(S.DATA_0, S.DATA_6 + 1),
            synapse: cell.s[S.SYNAPSE],
            tiLink: cell.s[S.TI_LINK],
            omLink: cell.s[S.OM_LINK],
            taLink: cell.s[S.TA_LINK],
        };
    }

    toJSON(cell) { return this._toJSON(cell); }

    // ── 저장/로드 ──

    _save() {
        const data = { nextId: this.nextId, cells: [] };
        for (const [id, cell] of this.cells) {
            data.cells.push({ id, s: cell.s });
        }
        const tmp = this.cellFile + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data));
        fs.renameSync(tmp, this.cellFile);
    }

    _load() {
        if (!fs.existsSync(this.cellFile)) return;
        try {
            const data = JSON.parse(fs.readFileSync(this.cellFile, 'utf8'));
            this.nextId = data.nextId || 1;
            for (const c of (data.cells || [])) {
                this.cells.set(c.id, c);
            }
        } catch {}
    }
}

module.exports = { CellCore, S, CELL_TYPE, TYPE_NAME, EPISTEMIC };
