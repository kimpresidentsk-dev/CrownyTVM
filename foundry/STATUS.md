# CrownyCore 현재 상태 — 2026-03-21

## 프로젝트 개요

CrownyCore는 팔란티어 파운드리에 대응하는 국산 온톨로직 데이터 플랫폼으로,
**27방사형 셀 아키텍처**와 **4상균형3진법(Ti/Om/Ta/Eum)**,
그리고 **언약적 의사결정 엔진**을 핵심으로 합니다.

## 기술 스택

| 계층 | 기술 | 파일 위치 |
|------|------|-----------|
| DB 엔진 | Node.js (CrownyCellCore 27방사형 셀) | `foundry/engine/cell.js`, `memory.js` |
| REST API | Node.js HTTP (20+ 엔드포인트) | `foundry/engine/server.js` |
| 한선씨 네이티브 | 한선씨(HanSeon-C) 컴파일러 + ISA729 VM | `foundry/엔진/*.han`, `foundry/코어.han` |
| 인과추론 | 상관/인과/허위/미인지 4상 자동 승격 | `foundry/engine/causal.js` |
| 의사결정 | 언약적 3계층 (토라/복음/성령) | `foundry/engine/covenant.js` |
| 템플릿 | 14도메인 67개 프로젝트 원클릭 배포 | `foundry/engine/templates.js` |
| GUI | F패턴 3열 SPA (D3 그래프, Canvas 차트) | `foundry-gui/` |
| 서버 | 통합 서버 :7731 (GUI + API) | `foundry-gui/server-foundry.js` |

## 27방사형 셀 구조 (언약 아키텍처 v2)

```
안쪽 링 (0-8): 토라/경계 — 보호적 울타리
  [0] 상태(4상)  [1] 앞방향  [2] 뒷방향
  [3] 내용       [4] 유형    [5] 이름
  [6] 출처       [7] 비례제한 [8] 생성시각

중간 링 (9-17): 복음/관계 — 관계적 윤리
  [9] 자기영향   [10] 가족영향  [11] 이웃영향
  [12] 세계영향  [13] 사랑가중치 [14] 윤리점수
  [15] 근거수    [16] 신뢰도    [17] 변경시각

바깥 링 (18-26): 성령/초월 — 성장과 분별
  [18] 고도화    [19] 병합이력   [20] 세분화
  [21] 합의수준  [22] 초월신뢰   [23] 미인지횟수
  [24] 이관이력  [25] 설계자이슈 [26] 고유방향
```

## 4상 작동 원칙

| 4상 | 의미 | 작동 |
|-----|------|------|
| **Ti** (+1) | 아는 것 | 즉시 작동 |
| **Om** (0) | 모르는 것 | 즉시 중단 → 학습 → 재작동 |
| **Ta** (-1) | 잘못 아는 것 | 에이전트 자신은 모름 → 자동 프로젝트 이관 |
| **Eum** (-2) | 모르는지도 모르는 것 | 설계자 이슈 업로드 → 고유 방향 수립 |

## 언약적 의사결정 엔진 (covenant.js)

3계층 검사 후 4상 분기:

```
사건 입력
  → Layer 1 토라: 경계 위반 검사 (비례적 제한, 생명보호, 권한경계)
    → 위반 시 즉시 차단
  → Layer 2 복음: 관계적 영향 평가 (나→가족→이웃→세계 가중치)
    → 윤리 점수 산출 (-13~+13)
  → Layer 3 성령: 4상 판단 (선례 검색 → 모순 감지)
    → Ti: 즉시 실행 + 원칙 축적
    → Om: 중단 + 학습 요청
    → Ta: 자동 이관
    → Eum: 설계자 이슈 업로드
```

성장: 3→9→27→81→243→729 (3진법적 배수)

## 인과추론 엔진 (causal.js)

관계에도 4상 인식상태 적용:
- **→ 인과** (+1): 시간선행 + 개입효과 확인
- **~ 상관** (0): 동시발생 관찰, 인과 미확인
- **⊘ 허위** (-1): 교란변수 발견, 반박됨
- **? 미인지** (-2): 연결 존재하나 성격 미파악

자율 승격: 동시발생 감지 → 시간선행 → 개입효과 → 인과 확정

## GUI 현재 상태

F패턴 3열 레이아웃:
- **좌 (110px)**: 아이콘+한국어 라벨 네비게이션
- **중앙**: 캔버스 (그래프/의사결정/템플릿/인과추론/차트/만들기/찾기/통계)
- **우 (340px)**: 셀 상세 — 27방사형 슬롯 (토라/복음/성령 3링)

전면 한국어. 모노톤 디자인. Inter 폰트.

### 현재 작동하는 기능
- ✅ 셀 CRUD (생성/조회/수정/삭제)
- ✅ Claim 생성 (주체-술어-대상)
- ✅ 시냅스 연결 (양방향, 4방향 티옴타음)
- ✅ 4상 상태 전이 (근거추가→자동확정, 전진, 후퇴)
- ✅ D3 force 그래프 시각화
- ✅ 의사결정 엔진 (토라/복음/성령 3계층)
- ✅ 인과추론 (동시발생→시간선행→개입→인과 자율 승격)
- ✅ 67개 프로젝트 템플릿 (14도메인)
- ✅ KPS EMA9/21/50 차트
- ✅ 텍스트 검색, 레이어별/인식상태별 조회

### 알려진 이슈
- 27방사형 슬롯 GUI 표시가 불완전할 수 있음 (셀 클릭 후 우측 패널)
- 언약 슬롯(9-26)의 값이 API 기본값 0 — 의사결정 시에만 채워짐
- 그래프 노드 텍스트가 작게 보이거나 안 보일 수 있음 → CSS 조정 중

## API 엔드포인트 목록

```
POST   /api/foundry/cells              셀 생성
GET    /api/foundry/cells              목록
GET    /api/foundry/cells/:id          조회
PATCH  /api/foundry/cells/:id          수정
DELETE /api/foundry/cells/:id          삭제
POST   /api/foundry/claims             Claim 생성
GET    /api/foundry/claims             Claim 쿼리
POST   /api/foundry/cells/:id/evidence 근거 추가
POST   /api/foundry/cells/:id/advance  전진
POST   /api/foundry/cells/:id/retreat  후퇴
POST   /api/foundry/connect            티옴타음 연결
POST   /api/foundry/synapse            양방향 시냅스
GET    /api/foundry/cells/:id/chain    체인 탐색
GET    /api/foundry/layers/:n          레이어별 조회
GET    /api/foundry/epistemic/:state   인식상태별 조회
GET    /api/foundry/search?q=          검색
GET    /api/foundry/stats              통계
POST   /api/foundry/covenant/decide    의사결정
GET    /api/foundry/covenant/stats     의사결정 통계
POST   /api/foundry/causal/detect      동시발생 감지
POST   /api/foundry/causal/infer       자율 추론
GET    /api/foundry/templates          템플릿 목록
POST   /api/foundry/templates/:id/deploy 템플릿 배포
```

## 서버 실행

```bash
cd ~/Downloads/CrownyTVM
node foundry-gui/server-foundry.js
# → http://localhost:7731/
```

## 요청 사항

초등학교 4학년(10세)이 95%의 기능을 왕성하게 사용할 수 있도록
GUI/UX를 개선하는 응용작업 계획을 작성해주세요.

현재 적용된 15가지 아이 친화적 보완:
1. 전면 한국어 (영문 완전 제거)
2. 네비게이션 아이콘+한국어 라벨 병기
3. Welcome 화면 3가지 시작점
4. 큰 클릭 영역 (min-height 28px+)
5. 누르면 반응 (active scale)
6. 토스트 알림 (모든 행동에 피드백)
7. 도움말 툴팁 (title 속성)
8. "누가 무엇을 어떻게" 자연어 안내
9. 드롭다운 한국어 (숫자/글자/기능)
10. 3링 색상 구분 (토라/복음/성령)
11. 그래프 노드 텍스트 표시
12. 빈 상태 안내 메시지
13. F패턴 3열 레이아웃
14. 검색 한국어 안내
15. 통계 전면 한글

추가로 필요한 것:
- 더 큰 폰트, 더 선명한 대비
- 드래그앤드롭으로 셀 연결
- 음성 입력 지원
- 게이미피케이션 (레벨, 뱃지, 성취도)
- 튜토리얼/가이드 투어
- 실행 취소(Undo) 기능
- 더 직관적인 27슬롯 시각화 (원형/방사형?)
