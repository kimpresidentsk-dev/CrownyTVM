# CrownyFoundry 클로드코드 에이전트 명세 v1.0

## 디렉토리 구조

```
CrownyTVM/
├── foundry/                    ← 파운드리 코어
│   ├── engine/                 ← Node.js REST API (Phase 1 완성, 20/20 테스트)
│   │   ├── cell.js             ← 27-슬롯 방사형 셀 (EP/S/TYPE/LAYER)
│   │   ├── memory.js           ← 기억 엔진 (CRUD/Claim/Layer/연결/검색)
│   │   ├── server.js           ← REST API (20 엔드포인트)
│   │   ├── test.js             ← 20개 테스트
│   │   └── package.json
│   ├── 엔진/
│   │   ├── 셀엔진.han          ← 한선씨 셀 CRUD + Claim + Layer 쿼리
│   │   └── 파이프라인.han      ← 파이프라인 DSL 런타임
│   ├── 커넥터/                 ← (Phase 2: REST/파일/셀DB 커넥터)
│   ├── 분석/
│   │   ├── EMA분석기.han       ← KPS EMA9/21/50 + 크로스/기울기 판단
│   │   └── 신뢰전파.han        ← BFS 신뢰 전파 + 반박 감지
│   ├── 엣지/
│   │   ├── 플랫폼감지.han      ← uname 기반 플랫폼 감지
│   │   └── FPGA백엔드.han      ← ISA729 → FPGA 매핑 (27 opcodes)
│   ├── AI/
│   │   └── 마인드연동.han      ← OpenClaw + Anthropic API 폴백
│   ├── 파운드리.han            ← 통합 진입점 (8개 시험)
│   └── AGENT_SPEC.md           ← 이 파일
│
└── foundry-gui/                ← GUI (포트 7731)
    ├── index.html              ← SPA 쉘
    ├── server-foundry.js       ← 통합 서버 (GUI + API 프록시)
    ├── css/파운드리.css         ← 4상 색상 시스템
    └── js/
        ├── 4상상태.js          ← EP/사상/슬롯메타/층색상
        ├── 셀그래프.js         ← D3 force layout + 27방사형 슬롯 패널
        ├── 파이프라인모니터.js  ← SSE 실시간 + 상태 표시
        ├── KPS차트.js          ← Canvas 캔들 + EMA선 + 신호 마커
        └── 앱.js              ← 라우터 + 폼 + 초기화
```

## 실행 순서

```bash
# 1. 테스트 (기존 Node.js 엔진)
node foundry/engine/test.js       # → 20/20

# 2. GUI + API 통합 서버 시작
node foundry-gui/server-foundry.js

# 3. 브라우저에서 확인
open http://localhost:7731/

# 4. API 직접 확인
curl http://localhost:7731/api/foundry/stats
curl -X POST http://localhost:7731/api/foundry/cells \
  -H 'Content-Type: application/json' \
  -d '{"name":"BTC","type":1,"content":67000,"confirmed":true,"layer":1}'

# 5. 한선씨 셀엔진 시험 (컴파일러 필요)
./target/release/crowny-tvm foundry/파운드리.han
```

## 문법 호환성

| 파일 | 문법 | 실행 방법 |
|------|------|----------|
| `foundry/AI/마인드연동.han` | 구문법 (클로드.한선씨 스타일) | `crowny-tvm` 직접 실행 |
| `foundry/엔진/*.han` | 구문법 (변수/함수/만약/동안) | `crowny-tvm` 직접 실행 |
| `foundry/분석/*.han` | 구문법 | `crowny-tvm` 직접 실행 |
| `foundry/엣지/*.han` | 구문법 | `crowny-tvm` 직접 실행 |
| `foundry/engine/*.js` | Node.js | `node` 직접 실행 |

## 포트 구조

| 포트 | 서비스 | 상태 |
|------|--------|------|
| :7730 | CrownyOS 웹서버 (server.js) | 기존 유지 |
| :7731 | CrownyFoundry GUI + API | **신규** |
| :18789~18791 | OpenClaw AI (claude/gemini/sonnet) | 기존 유지 |

## API 엔드포인트 (20개)

### 셀 CRUD
- `POST   /api/foundry/cells` — 셀 생성
- `GET    /api/foundry/cells?offset=&limit=` — 목록
- `GET    /api/foundry/cells/:id` — 조회
- `PATCH  /api/foundry/cells/:id` — 수정
- `DELETE /api/foundry/cells/:id` — 삭제

### Claim
- `POST /api/foundry/claims` — Claim 생성 (subject/predicate/object)
- `GET  /api/foundry/claims?subject=&predicate=&object=` — 쿼리

### 상태 전이
- `POST /api/foundry/cells/:id/evidence` — 근거 추가 (3개 → 자동확정)
- `POST /api/foundry/cells/:id/advance` — 전진 (음→옴→티)
- `POST /api/foundry/cells/:id/retreat` — 후퇴 (티→옴→음)

### 연결
- `POST /api/foundry/connect` — 티옴타음 4방향 연결
- `POST /api/foundry/synapse` — 양방향 시냅스
- `GET  /api/foundry/cells/:id/connections` — 전체 연결 정보
- `GET  /api/foundry/cells/:id/chain` — 체인 따라가기
- `GET  /api/foundry/cells/:id/follow/:dir` — 방향 따라가기

### Layer 탐색
- `GET /api/foundry/layers/:layer` — 레이어별 (0~4)
- `GET /api/foundry/epistemic/:state` — 인식상태별 (ti/om/ta/eum)

### 검색/통계
- `GET /api/foundry/search?q=` — 텍스트 검색
- `GET /api/foundry/stats` — 통계

## 연결 지점 (기존 파일)

| 역할 | 파일 |
|------|------|
| 셀 저장소 (Rust) | `크라우니/원천/온톨로지/기억.rs` |
| 27-슬롯 셀 | `CrownyCell/셀.han` |
| 27-trit 셀 | `CrownyCell/크라우니셀.han` |
| 저장소 | `CrownyCell/저장소.han` |
| ISA729 VM | `ISA729VM/isa729vm.han` |
| 크라우니어 실행기 | `크라우니/원천/크라우니어/실행기.rs` |
| AI 연동 패턴 | `크라우니/체계/클로드.한선씨` |
| 웹서버 | `server.js` (:7730) |
