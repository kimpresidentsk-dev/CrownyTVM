// ═══════════════════════════════════════════════════════════════
// 기억 (Memory) — 셀 기반 온톨로지 메모리 엔진
//
// 원본: 크라우니/원천/온톨로지/기억.rs + CrownyCell/저장소.han
//
// - 시간순 셀 저장 (순차 ID)
// - 이름표 (name → cell ID binding)
// - 티옴타음 4방향 연결
// - Claim 셀 (주체-술어-대상)
// - Layer 0-4 (RTF1)
// - 검색: 주장, 레이어, 인식상태, 이름, 체인
// ═══════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const {
    EP, S, TYPE, LAYER, DIR,
    createCell, createConfirmedCell,
    cellToJSON, jsonToSlots,
    advanceCell, retreatCell, addEvidence,
} = require('./cell');

class Memory {
    constructor(dataDir) {
        this.cells = [];          // Vec<slots>  — 시간순 저장
        this.names = new Map();   // 이름 → cellId
        this.links = new Map();   // cellId → { ti, om, ta, eum }
        this.nextId = 1;
        this.dataDir = dataDir || path.join(__dirname, '..', '..', 'data', 'foundry');
        this._ensureDir();
        this._load();
    }

    _ensureDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    _filePath() { return path.join(this.dataDir, 'memory.json'); }

    _load() {
        try {
            if (fs.existsSync(this._filePath())) {
                const data = JSON.parse(fs.readFileSync(this._filePath(), 'utf8'));
                this.cells = data.cells || [];
                this.nextId = data.nextId || (this.cells.length + 1);
                this.names = new Map(Object.entries(data.names || {}));
                this.links = new Map(
                    Object.entries(data.links || {}).map(([k, v]) => [Number(k), v])
                );
            }
        } catch (e) {
            console.warn('[Memory] 로드 실패, 새 DB 시작:', e.message);
        }
    }

    _save() {
        const data = {
            cells: this.cells,
            nextId: this.nextId,
            names: Object.fromEntries(this.names),
            links: Object.fromEntries(this.links),
        };
        const json = JSON.stringify(data, null, 2);

        // #75 암호화 저장 (CROWNY_ENCRYPT 환경변수 설정 시)
        if (process.env.CROWNY_ENCRYPT) {
            try {
                const { encrypt } = require('./security');
                const encrypted = encrypt(json, process.env.CROWNY_ENCRYPT);
                fs.writeFileSync(this._filePath() + '.enc', encrypted, 'utf8');
            } catch {}
        }

        // 평문도 항상 저장 (호환성)
        fs.writeFileSync(this._filePath(), json, 'utf8');
    }

    // ═══ ID 생성 ═══
    _newId() { return this.nextId++; }

    // ═══ 셀 CRUD ═══

    /** 값 셀 생성 */
    createValue(name, type, content, options = {}) {
        const id = this._newId();
        const slots = options.confirmed
            ? createConfirmedCell(name, type, content)
            : createCell(name, type, content);

        if (options.layer != null) slots[S.깊이] = options.layer;
        if (options.owner)         slots[S.소유자] = options.owner;
        if (options.tag)           slots[S.태그] = options.tag;

        this.cells.push({ id, slots, claims: null });
        if (name) this.names.set(name, id);
        this._save();
        return this._cellObj(this.cells.length - 1);
    }

    /** Claim 셀 생성 (주체-술어-대상) */
    createClaim(subject, predicate, object, epistemic = EP.OM, layer = LAYER.CORE) {
        const id = this._newId();
        const slots = createCell(subject, TYPE.CLAIM, 0);
        slots[S.상태] = epistemic;
        slots[S.깊이] = layer;

        const claim = { subject, predicate, object };
        this.cells.push({ id, slots, claims: claim });
        this._save();
        return this._cellObj(this.cells.length - 1);
    }

    /** 셀 조회 (by ID) */
    getCell(id) {
        const idx = this.cells.findIndex(c => c.id === id);
        if (idx < 0) return null;
        return this._cellObj(idx);
    }

    /** 셀 수정 (partial update) */
    updateCell(id, updates) {
        const idx = this.cells.findIndex(c => c.id === id);
        if (idx < 0) return null;
        const entry = this.cells[idx];
        const slots = entry.slots;

        if (updates.name != null)    { slots[S.이름] = updates.name; this.names.set(updates.name, id); }
        if (updates.content != null)   slots[S.내용]     = updates.content;
        if (updates.type != null)      slots[S.유형]     = updates.type;
        if (updates.status != null)    slots[S.상태]     = updates.status;
        if (updates.trust != null)     slots[S.신뢰도]   = updates.trust;
        if (updates.tag != null)       slots[S.태그]     = updates.tag;
        if (updates.owner != null)     slots[S.소유자]   = updates.owner;
        if (updates.layer != null)     slots[S.깊이]     = updates.layer;
        if (updates.ttl != null)       slots[S.수명]     = updates.ttl;
        slots[S.변경시간] = Date.now();
        slots[S.버전] = (slots[S.버전] || 0) + 1;

        if (updates.claim && entry.claims) {
            Object.assign(entry.claims, updates.claim);
        }

        this._save();
        return this._cellObj(idx);
    }

    /** 셀 삭제 */
    deleteCell(id) {
        const idx = this.cells.findIndex(c => c.id === id);
        if (idx < 0) return false;
        const entry = this.cells[idx];
        // 이름표에서 제거
        for (const [k, v] of this.names) {
            if (v === id) this.names.delete(k);
        }
        // 연결 제거
        this.links.delete(id);
        for (const [, link] of this.links) {
            for (const dir of ['ti', 'om', 'ta', 'eum']) {
                if (link[dir] === id) link[dir] = 0;
            }
        }
        this.cells.splice(idx, 1);
        this._save();
        return true;
    }

    /** 전체 셀 목록 (페이지네이션) */
    listCells(offset = 0, limit = 50) {
        const total = this.cells.length;
        const slice = this.cells.slice(offset, offset + limit);
        return {
            total,
            offset,
            limit,
            cells: slice.map((_, i) => this._cellObj(offset + i)),
        };
    }

    // ═══ 상태 전이 ═══

    advance(id) {
        const idx = this.cells.findIndex(c => c.id === id);
        if (idx < 0) return null;
        advanceCell(this.cells[idx].slots);
        this._save();
        return this._cellObj(idx);
    }

    retreat(id) {
        const idx = this.cells.findIndex(c => c.id === id);
        if (idx < 0) return null;
        retreatCell(this.cells[idx].slots);
        this._save();
        return this._cellObj(idx);
    }

    addEvidenceToCell(id) {
        const idx = this.cells.findIndex(c => c.id === id);
        if (idx < 0) return null;
        addEvidence(this.cells[idx].slots);
        this._save();
        return this._cellObj(idx);
    }

    // ═══ 티옴타음 연결 ═══

    connect(sourceId, targetId, direction) {
        if (!this.getCell(sourceId) || !this.getCell(targetId)) return null;
        if (!this.links.has(sourceId)) {
            this.links.set(sourceId, { ti: 0, om: 0, ta: 0, eum: 0 });
        }
        this.links.get(sourceId)[direction] = targetId;
        this._save();
        return { source: sourceId, target: targetId, direction };
    }

    /** 양방향 시냅스 연결 (셀.han의 저장소_연결) */
    connectBidirectional(idA, idB) {
        const idxA = this.cells.findIndex(c => c.id === idA);
        const idxB = this.cells.findIndex(c => c.id === idB);
        if (idxA < 0 || idxB < 0) return null;
        this.cells[idxA].slots[S.앞방향] = idB;
        this.cells[idxB].slots[S.뒷방향] = idA;
        this.cells[idxA].slots[S.변경시간] = Date.now();
        this.cells[idxB].slots[S.변경시간] = Date.now();
        this._save();
        return { forward: { from: idA, to: idB }, backward: { from: idB, to: idA } };
    }

    /** 특정 방향 따라가기 */
    follow(id, direction) {
        const link = this.links.get(id);
        if (!link) return null;
        const targetId = link[direction];
        if (!targetId) return null;
        return this.getCell(targetId);
    }

    /** 체인 따라가기 (앞방향 순회) */
    chain(startId, maxDepth = 100) {
        const result = [];
        let currentId = startId;
        let visited = 0;
        while (currentId > 0 && visited < maxDepth) {
            const cell = this.getCell(currentId);
            if (!cell) break;
            result.push(cell);
            currentId = cell.forward;
            if (currentId <= 0) break;
            visited++;
        }
        return result;
    }

    /** 셀의 모든 연결 정보 */
    getConnections(id) {
        const cell = this.getCell(id);
        if (!cell) return null;
        const link = this.links.get(id) || { ti: 0, om: 0, ta: 0, eum: 0 };
        return {
            id,
            synapse: {
                forward: cell.forward,
                backward: cell.backward,
                target: cell.target,
                strength: cell.strength,
            },
            directions: {
                ti:  link.ti  ? this.getCell(link.ti)  : null,
                om:  link.om  ? this.getCell(link.om)  : null,
                ta:  link.ta  ? this.getCell(link.ta)  : null,
                eum: link.eum ? this.getCell(link.eum) : null,
            },
        };
    }

    // ═══ Claim 쿼리 ═══

    /** 주체로 주장 검색 */
    queryClaims(subject) {
        return this.cells
            .filter(c => c.claims && c.claims.subject === subject)
            .map((_, i) => this._cellObjByEntry(_));
    }

    /** 술어로 주장 검색 */
    queryByPredicate(predicate) {
        return this.cells
            .filter(c => c.claims && c.claims.predicate === predicate)
            .map(e => this._cellObjByEntry(e));
    }

    /** 주체+술어+대상 조합 검색 */
    queryClaimsFull({ subject, predicate, object } = {}) {
        return this.cells
            .filter(c => {
                if (!c.claims) return false;
                if (subject && c.claims.subject !== subject) return false;
                if (predicate && c.claims.predicate !== predicate) return false;
                if (object && c.claims.object !== object) return false;
                return true;
            })
            .map(e => this._cellObjByEntry(e));
    }

    // ═══ Layer 탐색 ═══

    /** 레이어별 셀 목록 */
    getByLayer(layer) {
        return this.cells
            .filter(c => c.slots[S.깊이] === layer)
            .map(e => this._cellObjByEntry(e));
    }

    /** 인식상태별 셀 목록 */
    getByEpistemic(status) {
        return this.cells
            .filter(c => c.slots[S.상태] === status)
            .map(e => this._cellObjByEntry(e));
    }

    /** 이름으로 검색 */
    getByName(name) {
        const id = this.names.get(name);
        if (id == null) return null;
        return this.getCell(id);
    }

    /** 텍스트 검색 (이름/주장 필드에서) */
    search(query) {
        const q = query.toLowerCase();
        return this.cells
            .filter(c => {
                const name = String(c.slots[S.이름] || '').toLowerCase();
                if (name.includes(q)) return true;
                if (c.claims) {
                    return (c.claims.subject || '').toLowerCase().includes(q)
                        || (c.claims.predicate || '').toLowerCase().includes(q)
                        || (c.claims.object || '').toLowerCase().includes(q);
                }
                return false;
            })
            .map(e => this._cellObjByEntry(e));
    }

    // ═══ 통계 ═══

    stats() {
        const byLayer = {};
        const byStatus = {};
        const byType = {};
        let claimCount = 0;
        for (const c of this.cells) {
            const layer = c.slots[S.깊이] || 0;
            byLayer[layer] = (byLayer[layer] || 0) + 1;
            byStatus[c.slots[S.상태]] = (byStatus[c.slots[S.상태]] || 0) + 1;
            byType[c.slots[S.유형]] = (byType[c.slots[S.유형]] || 0) + 1;
            if (c.claims) claimCount++;
        }
        return {
            totalCells: this.cells.length,
            totalClaims: claimCount,
            totalNames: this.names.size,
            totalLinks: this.links.size,
            byLayer,
            byStatus,
            byType,
        };
    }

    // ═══ 내부 헬퍼 ═══

    _cellObj(idx) {
        const entry = this.cells[idx];
        if (!entry) return null;
        const link = this.links.get(entry.id) || { ti: 0, om: 0, ta: 0, eum: 0 };
        return {
            ...cellToJSON(entry.slots, entry.id),
            claim: entry.claims || null,
            layer: entry.slots[S.깊이] || 0,
            connections: link,
        };
    }

    _cellObjByEntry(entry) {
        const idx = this.cells.indexOf(entry);
        return this._cellObj(idx);
    }
}

module.exports = Memory;
