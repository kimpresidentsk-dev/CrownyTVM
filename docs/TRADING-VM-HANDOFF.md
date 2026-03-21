# CrownyOS Trading System — 다른 Claude 인스턴스용 핸드오프

> **목적**: NinjaTrader 대용 트레이딩 프로그램을 만들 때
> 이미 구축된 ISA729 VM, 블록체인, 트레이딩 인프라를 활용하기 위한 참고 문서.

---

## 1. 이미 만들어진 것들

### 위치: `/Users/ef/Downloads/CrownyTVM`

```
현재 구조:
├── server.js (8,000+줄)       — 웹 서버, 80+ API 엔드포인트
├── chain/                      — 자체 블록체인 (17 모듈)
│   ├── crypto.js               — Ed25519 서명 + 3진 주소
│   ├── cell.js                 — 27-슬롯 셀 (189B 압축)
│   ├── transaction.js          — 서명된 트랜잭션
│   ├── block.js                — 9초 블록 + 3진 머클트리
│   ├── state.js                — CRN/FNC/CRM 3토큰 계정 상태
│   ├── producer.js             — 블록 생성 엔진
│   ├── consensus.js            — T/O/N 3진 합의 프로토콜
│   ├── contract.js             — ISA729 스마트 컨트랙트
│   ├── adapter.js              — server.js ↔ 체인 통합
│   └── ...
├── cell-core.js                — 27-슬롯 범용 셀 DB (CRUD + 시냅스)
├── target/release/crowny       — ISA729 VM 바이너리 (849KB)
├── public/js/canvas.js         — 16 워크스페이스 (Trading 포함)
├── public/js/trading.js        — 기존 트레이딩 UI (3,400+줄)
└── public/vendor/
    └── lightweight-charts.js   — 캔들차트 라이브러리 (로컬)
```

### 위치: `/Users/ef/Downloads/CrownyEngine`

```
├── src/engine/src/
│   ├── vm.rs (950줄)           — ISA729 VM (Rust 구현)
│   ├── compiler.rs (430줄)     — KPS → 한선씨IR → ISA729 컴파일러
│   ├── typeck.rs (290줄)       — 4상 확신도 타입 체커
│   └── ui.rs (1,277줄)         — CrownyFrame (자체 UI 프레임워크)
└── docs/CROWNYFRAME_SPEC.md    — 전체 규격서
```

---

## 2. ISA729 VM 규격

### 아키텍처
```
레지스터: r0~r26 (27개, 각 i64)
  특수: ACC=r9, FLAG=r10, SP=r11, PC=r12
메모리: 729 워드 (3^6)
스택: mem[SP]부터 아래로 성장
블록당 최대 트랜잭션: 729 (3^6)
사이클 한도: 10,000,000
```

### 옵코드 (43종)
```
삼진 논리:  TNEG(8) TNOT(9) TAND(10) TOR(11)
RPN 스택:  DUP(25) SWAP(26) DROP(27) OVER(28)
메모리:    LOAD(18) STORE(19) MOV(20) PUSH(22) POP(23) LOADI(24)
산술:      ADD(36) SUB(37) MUL(38) DIV(39) MOD(40)
비교:      CMP(49)
분기:      JMP(54) JZ(55) JP(56) JN(57)
함수:      CALL(59) RET(60) ENTER(90) LEAVE(91)
시스템:    HALT(61) NOP(62) TRAP(63)
입출력:    PRINTI(72) PRINTS(73) PRINTIMM(76)
4상:       P4SET(80) P4GET(81) P4CMP(82)
```

### VM 호출 방법 (Node.js에서)
```javascript
// 방법 1: 바이너리 직접 호출
const { execFileSync } = require('child_process');
const result = execFileSync('target/release/crowny', ['run', '/tmp/code.han'], {
    timeout: 5000, encoding: 'utf8'
});

// 방법 2: API 호출
const r = await fetch('/api/chain/contract/execute', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer TOKEN', 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: '변수 가격 = 21000\n출력(가격)' })
});
const data = await r.json(); // { success: true, output: ['21000'] }
```

### 한선씨(HanSeon-C) 문법 예시
```
// 변수
변수 가격 = 21500.50
변수 수량 = 10

// 조건문
만약 가격 > 21000:
    출력("매수 신호")
아니면:
    출력("대기")

// 반복
반복 5:
    가격 = 가격 + 10
    출력(가격)

// 함수
함수 수익률(진입가, 현재가):
    반환 (현재가 - 진입가) / 진입가 * 100

출력(수익률(21000, 21500))
```

---

## 3. 트레이딩 관련 API

### 시세 데이터
```
GET /api/market/nq          — NQ 실시간 가격 (캐시)
GET /api/market/candles     — OHLC 캔들 데이터
GET /api/market/ticks       — 실시간 틱 데이터
```

### 트레이딩 참여
```
GET  /api/trading/participation  — 현재 트레이딩 상태
POST /api/trading/join           — 챌린지 참가
POST /api/trading/update         — 포지션 업데이트
POST /api/trading/withdraw       — 출금
```

### 지갑 (토큰 경제)
```
GET  /api/wallet                 — 잔액 (CRN/FNC/CRM)
POST /api/wallet/transact        — 전송
POST /api/wallet/swap            — 스왑 (CRM→FNC→CRN)
```

### 셀 DB (트레이딩 데이터 저장)
```
POST /api/cell/create   — 셀 생성 (type:4=POSITION)
GET  /api/cell/query    — 셀 조회 (?type=4&limit=20)
POST /api/cell/update   — 셀 업데이트
POST /api/cell/link     — 셀 간 시냅스 연결
```

### 스마트 컨트랙트 (자동매매)
```
POST /api/chain/contract/deploy   — 한선씨 코드 배포
POST /api/chain/contract/execute  — 코드 실행
GET  /api/chain/contract/list     — 배포된 컨트랙트 목록
```

---

## 4. 기존 트레이딩 UI (public/js/trading.js)

3,400줄의 기존 트레이딩 시스템이 있음:

```
주요 기능:
- LightweightCharts 캔들차트 (1분/5분/1시간)
- EMA (9/21/50), RSI, 볼륨 지표
- 매수/매도 버튼 + SL/TP 설정
- 실시간 손익 계산 (PnL)
- 트레이딩 챌린지 (CRTD 토큰 기반)
- 멘토봇 (AI 코멘트)
- 다크 테마 차트

API 연동:
- Massive WebSocket (CME 실시간 데이터)
- /api/market/nq (NQ100 가격)
- /api/trading/* (포지션 관리)
```

### Canvas 워크스페이스 Trading (public/js/canvas.js)

```
crownybus.com에서 접근 가능한 3-패널 트레이딩:
좌측: 잔액 + 포지션 목록 + Long/Short 버튼
중앙: 실시간 캔들차트 (1초 갱신)
우측: 주문폼 (사이드/크기/SL/TP) + 거래 로그

포지션은 CellCore에 POSITION(4) 타입으로 저장
```

---

## 5. 토큰 경제

```
CRN (크라우니): 1 CRN = 10 FNC = 1,000 CRM = ₩25,500
FNC (포네):     1 FNC = 100 CRM = ₩2,550
CRM (맘):       기본 단위 = ₩25.5

스왑: 상향만 (CRM → FNC → CRN)
트레이딩 참가비: 100 CRTD (오프체인 포인트)
```

---

## 6. NinjaTrader 대용으로 활용할 때

### 이미 있는 것 (재사용)
- ✅ 캔들차트 (LightweightCharts, 로컬 번들)
- ✅ 실시간 가격 피드 (WebSocket + REST)
- ✅ 포지션 관리 API
- ✅ ISA729 VM으로 자동매매 전략 실행 가능
- ✅ 27-슬롯 셀로 거래 데이터 영구 저장
- ✅ 블록체인 기반 거래 기록 (불변)

### 추가 구현 필요
- ⏳ 실제 브로커 연동 (Interactive Brokers, Binance 등)
- ⏳ 백테스트 엔진 (과거 데이터로 전략 테스트)
- ⏳ 멀티 차트 (여러 심볼 동시 표시)
- ⏳ 인디케이터 커스터마이징 (한선씨로 작성)
- ⏳ 알림 시스템 (가격 알림, 포지션 청산 알림)

### 한선씨로 자동매매 전략 작성 예시
```
// EMA 크로스 전략
변수 단기 = EMA(종가, 9)
변수 장기 = EMA(종가, 21)

만약 단기 > 장기:
    만약 포지션 == "없음":
        매수(수량: 1, 손절: 가격 - 50, 익절: 가격 + 100)
        출력("매수 진입: " + 가격)

만약 단기 < 장기:
    만약 포지션 == "매수":
        청산()
        출력("매수 청산: " + 가격)
```

이 코드를 `/api/chain/contract/deploy`로 배포하면
ISA729 VM에서 실행되어 자동매매 로직으로 작동.

---

## 7. 서버 접속 정보

```
crownybus.com (엔터프라이즈 Canvas UI)
crowny.org    (컨슈머 UI)

로그인: kps / crowny2026
API: https://crownybus.com/api/*
     https://crowny.org/api/*

로컬: http://localhost:7730
```

---

## 8. 핵심 규칙

```
1. 외부 의존성 0 — npm install 하지 않음
2. 모든 데이터는 27-슬롯 셀 단위
3. 색상: 녹색 없음 → 블루그레이(#5B7B8C) 사용
4. 이모지: 컬러 이모지 없음 → Lucide 아이콘 또는 텍스트
5. CSS: var(--primary), var(--gold), var(--border) 등 변수 사용
6. i18n: t('key', 'fallback') 함수로 다국어 지원
7. 트릿 기호: ▲(Ti/+1) ■(Om/0) ▼(Ta/-1)
8. 옴력: 서기 + 3760
```

---

*이 문서: CrownyOS Team + Claude Code 작성*
*참조: CrownyTVM v0.32.0, CrownyEngine v0.5.0*
*최종 업데이트: 2026-03-22*
