#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// CrownyFoundry 온톨로직 엔진 시험 — 기억.rs 테스트 패턴 재현
//
// 원본: CrownyCell/온톨로직db_시험.han (14/14)
// ═══════════════════════════════════════════════════════════════

'use strict';

const path = require('path');
const fs = require('fs');
const { EP, TYPE, LAYER, S } = require('./cell');
const Memory = require('./memory');

// 테스트용 임시 디렉토리
const TEST_DIR = path.join(__dirname, '..', '..', 'data', 'foundry-test');
if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });

const mem = new Memory(TEST_DIR);
let ok = 0;
let total = 0;

function assert(name, condition) {
    total++;
    if (condition) {
        ok++;
        console.log(`  ✓ ${total}. ${name}`);
    } else {
        console.log(`  ✗ ${total}. ${name}`);
    }
}

console.log('▲●▼◆ CrownyFoundry 온톨로직 엔진 시험 ▲●▼◆');
console.log('');

// ─── 1. 값 셀 생성 ───
const c1 = mem.createValue('이름', TYPE.STR, '김철수');
assert('값 셀 생성', c1 && c1.name === '이름' && c1.content === '김철수');

// ─── 2. 초기상태 = 미확인 ───
assert('초기상태 = ●미확인', c1.status === EP.OM);

// ─── 3. 확정 셀 생성 ───
const c2 = mem.createValue('나이', TYPE.INT, 25, { confirmed: true });
assert('확정 셀 생성', c2.status === EP.TI && c2.trust === 13);

// ─── 4. 시간순 저장 (순차 ID) ───
const c3 = mem.createValue('도시', TYPE.STR, '서울');
assert('시간순 저장 (ID 순차 증가)', c1.id < c2.id && c2.id < c3.id);

// ─── 5. ID로 조회 ───
const fetched = mem.getCell(c2.id);
assert('ID로 조회', fetched && fetched.content === 25);

// ─── 6. 양방향 시냅스 연결 ───
mem.connectBidirectional(c1.id, c2.id);
const afterLink1 = mem.getCell(c1.id);
const afterLink2 = mem.getCell(c2.id);
assert('양방향 시냅스 (이름↔나이)', afterLink1.forward === c2.id && afterLink2.backward === c1.id);

// ─── 7. 체인 따라가기 ───
mem.connectBidirectional(c2.id, c3.id);
const chainResult = mem.chain(c1.id);
assert('체인 이름→나이→도시', chainResult.length === 3
    && chainResult[0].id === c1.id
    && chainResult[1].id === c2.id
    && chainResult[2].id === c3.id);

// ─── 8. 근거 추가 → 자동 확정 ───
mem.addEvidenceToCell(c1.id);
mem.addEvidenceToCell(c1.id);
mem.addEvidenceToCell(c1.id);
const confirmed = mem.getCell(c1.id);
assert('근거 3개 → 자동확정', confirmed.status === EP.TI);

// ─── 9. 이름 검색 ───
const byName = mem.getByName('도시');
assert('이름검색 "도시"', byName && byName.id === c3.id);

// ─── 10. 인식상태별 검색 ───
const confirmedList = mem.getByEpistemic(EP.TI);
assert('인식상태별 검색 (확정)', confirmedList.length === 2);

// ─── 11. Claim 셀 생성 ───
const cl1 = mem.createClaim('BTC', '추세', '상승', EP.OM, LAYER.DOMAIN);
assert('Claim 생성 (BTC 추세 상승)', cl1.claim && cl1.claim.subject === 'BTC');

// ─── 12. Claim 주체 검색 ───
const btcClaims = mem.queryClaims('BTC');
assert('Claim 주체 검색', btcClaims.length === 1 && btcClaims[0].claim.predicate === '추세');

// ─── 13. 레이어별 조회 ───
mem.createClaim('ETH', '관련', 'DeFi', EP.TI, LAYER.DOMAIN);
mem.createClaim('AI', '적용', '트레이딩', EP.OM, LAYER.DECISION);
const domainCells = mem.getByLayer(LAYER.DOMAIN);
assert('레이어별 조회 (도메인)', domainCells.length === 2);

// ─── 14. 티옴타음 4방향 연결 ───
mem.connect(cl1.id, c1.id, 'ti');   // Claim →▲→ 이름 셀
mem.connect(cl1.id, c2.id, 'ta');   // Claim →▼→ 나이 셀
const conns = mem.getConnections(cl1.id);
assert('티옴타음 4방향 연결', conns.directions.ti && conns.directions.ti.id === c1.id
    && conns.directions.ta && conns.directions.ta.id === c2.id);

// ─── 15. 상태 전이 (전진) ───
const c_eum = mem.createValue('시험', TYPE.INT, 0);
mem.updateCell(c_eum.id, { status: EP.EUM });
mem.advance(c_eum.id);
const advanced = mem.getCell(c_eum.id);
assert('전진: 미인지→미확인', advanced.status === EP.OM);

// ─── 16. 상태 전이 (후퇴) ───
const c_ti = mem.createValue('시험2', TYPE.INT, 0, { confirmed: true });
mem.retreat(c_ti.id);
const retreated = mem.getCell(c_ti.id);
assert('후퇴: 확정→미확인', retreated.status === EP.OM);

// ─── 17. 셀 수정 ───
mem.updateCell(c3.id, { content: '부산', tag: 'updated' });
const updated = mem.getCell(c3.id);
assert('셀 수정 (도시→부산)', updated.content === '부산' && updated.tag === 'updated');

// ─── 18. 셀 삭제 ───
const delId = c_eum.id;
const deleted = mem.deleteCell(delId);
const afterDel = mem.getCell(delId);
assert('셀 삭제', deleted && afterDel === null);

// ─── 19. 텍스트 검색 ───
const searchResults = mem.search('BTC');
assert('텍스트 검색 "BTC"', searchResults.length >= 1);

// ─── 20. 통계 ───
const stats = mem.stats();
assert('통계', stats.totalCells > 0 && stats.totalClaims > 0);

// ═══ 결과 ═══
console.log('');
console.log(`═══ CrownyFoundry 온톨로직 엔진: ${ok}/${total} ═══`);
if (ok === total) {
    console.log('');
    console.log('▲●▼◆ Phase 1 온톨로직 데이터 엔진 시험 완료!');
    console.log('');
    console.log('  27-슬롯 방사형 셀 ✓');
    console.log('  시간순 저장 + 시냅스 ✓');
    console.log('  4상 인식상태 전이 ✓');
    console.log('  Claim (주체-술어-대상) ✓');
    console.log('  Layer 0-4 (RTF1) ✓');
    console.log('  티옴타음 4방향 연결 ✓');
}

// 정리
fs.rmSync(TEST_DIR, { recursive: true });

process.exit(ok === total ? 0 : 1);
