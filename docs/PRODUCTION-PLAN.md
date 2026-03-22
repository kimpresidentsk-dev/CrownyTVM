# CrownyCell Chain — 프로덕션 배포 + 보안 + 하향스왑 계획

## 1. 현재 상태

```
crowny.org      → CrownyTVM (Node.js :7730) — 소비자 UI
crownybus.com   → CrownyTVM (Node.js :7730) — 엔터프라이즈 Canvas
core.crowny.org → (미설정) — 체인 노드 전용 엔드포인트 예정

서버: 1개 (Solo 모드)
체인: CrownyCell (높이 0, 제네시스 완료)
계정: 22 (제네시스) + 신규
토큰: CRN 231억 / FNC 777억 / CRM 777억
VM: ISA729 (849KB, 28 테스트)
합의: 3진 T/O/N (코드 완료, 2노드 검증 완료)
```

## 2. 프로덕션 배포 체크리스트

### Phase A: 즉시 실행

```
[ ] A1. core.crowny.org DNS 설정 (A 레코드 → 서버 IP)
[ ] A2. nginx에 core.crowny.org 추가 (체인 API 전용)
        - /api/chain/* → CrownyTVM :7730
        - /api/cell/* → CrownyTVM :7730
        - /api/wallet/* → CrownyTVM :7730
        - WebSocket /ws/chain → P2P 연결

[ ] A3. HTTPS 인증서 (Let's Encrypt에 core.crowny.org 추가)
        certbot certonly --webroot -d crownybus.com -d crowny.org -d core.crowny.org

[ ] A4. Rate limiting 강화
        - /api/wallet/transact: 분당 10회
        - /api/chain/contract/execute: 분당 5회
        - /api/register: 분당 3회

[ ] A5. users.json 보호 (다른 세션에서 덮어쓰기 방지)
        - 파일 잠금 (flock) 또는 시작 시 백업
```

### Phase B: 보안 강화

```
[ ] B1. 입력 검증 강화
        - 모든 금액: 양수, 최대값 제한, 정수/소수 검증
        - 사용자명: 정규식 [a-z0-9_]{3,20}
        - 메모: 최대 200자, HTML 이스케이프

[ ] B2. 세션 만료
        - 토큰 TTL: 24시간 (현재 무제한)
        - 비활성 30분 시 자동 로그아웃

[ ] B3. 비밀번호 정책
        - 최소 8자
        - Argon2id 해싱 (현재 scrypt)

[ ] B4. 관리자 API 보호
        - /api/admin/* → isAdmin 체크 강화
        - 관리자 행동 감사 로그

[ ] B5. CORS 제한
        - crowny.org, crownybus.com, core.crowny.org만 허용

[ ] B6. 체인 트랜잭션 검증 강화
        - 서명 검증 (현재 일부 우회 가능)
        - nonce 순서 검증
        - 이중 지불 감지
```

### Phase C: 멀티노드

```
[ ] C1. 두 번째 서버 세팅 (별도 머신)
[ ] C2. genesis 공유 → import
[ ] C3. P2P WebSocket 연결
[ ] C4. 라운드 로빈 합의 활성화
[ ] C5. 블록 싱크 검증
```

## 3. 하향 스왑 (7% 기부 모델) — 기술 검토

### 현재: 상향만

```
CRM → FNC (100:1)    ✅ 허용
FNC → CRN (10:1)     ✅ 허용
CRN → FNC            ❌ 불가
FNC → CRM            ❌ 불가
CRN → CRM            ❌ 불가
```

### 제안: 하향 시 7% 기부

```
CRN → FNC: 1 CRN = 10 FNC (상향 역)
  사용자 받음: 10 × 0.93 = 9.3 FNC
  기부풀:      10 × 0.07 = 0.7 FNC

FNC → CRM: 1 FNC = 100 CRM (상향 역)
  사용자 받음: 100 × 0.93 = 93 CRM
  기부풀:      100 × 0.07 = 7 CRM

CRN → CRM: 1 CRN = 1000 CRM (직접)
  사용자 받음: 1000 × 0.93 = 930 CRM
  기부풀:      1000 × 0.07 = 70 CRM
```

### 기술 구현

**chain/state.js 수정:**
```javascript
const SWAP_RATES = {
    // 상향 (기존)
    'CRM:FNC': { divisor: 100, min: 100, fee: 0 },
    'FNC:CRN': { divisor: 10,  min: 10,  fee: 0 },
    // 하향 (7% 기부)
    'CRN:FNC': { multiplier: 10,   min: 1,   fee: 0.07, direction: 'down' },
    'FNC:CRM': { multiplier: 100,  min: 1,   fee: 0.07, direction: 'down' },
    'CRN:CRM': { multiplier: 1000, min: 1,   fee: 0.07, direction: 'down' },
};
```

**server.js 수정:**
```javascript
// 하향 스왑 처리
if (rate.direction === 'down') {
    const gross = amount * rate.multiplier;
    const donation = Math.floor(gross * rate.fee);
    received = gross - donation;
    // 기부풀 셀에 기록
    createCell('donation:' + donation + ' ' + toCurrency, TY.TRANSACTION, donation, 'donation-pool');
}
```

### 경제적 분석

```
시나리오: 사용자가 1 CRN을 CRM으로 하향 변환

상향 경로 (무료):
  1 CRN → 10 FNC → 1,000 CRM (손실 0%)

하향 직접:
  1 CRN → 930 CRM (7% = 70 CRM 기부)

차이: 1,000 vs 930 = 7% 기부

영향:
  ✅ 하향 거래 가능 (불가능 → 가능)
  ✅ 기부풀 자동 적립 → 사회적 가치
  ✅ 상향이 여전히 더 유리 → 상향 인센티브 유지
  ⚠️ 상향 후 하향 반복 차익거래 방지 필요:
      1000 CRM → 10 FNC (상향, 무료)
      10 FNC → 930 CRM (하향, 7% 기부)
      손실: 70 CRM per cycle → 자연적 억제
```

### 차익거래 방지

```
상향→하향 반복:
  1000 CRM → 10 FNC → 930 CRM  = 70 CRM 손실/회

이것은 자연적으로 억제됨:
  - 매번 7% 손실이므로 이득 없음
  - 오히려 기부풀에 기여
  - 추가 방지: 하향 쿨다운 (24시간 1회) 또는 일일 한도
```

### 기부풀 운영

```
기부풀 주소: donation-pool (시스템 계정)
기부 기록: TY.TRANSACTION 셀로 영구 저장
투명성: /api/donation/stats 로 누구나 조회 가능
사용: 커뮤니티 투표 또는 관리자 결정
```

## 4. core.crowny.org API 설계

```
Chain Public API (인증 불필요):
  GET  /chain/status     — 높이, 해시, 상태
  GET  /chain/block/:h   — 블록 조회
  GET  /chain/tx/:hash   — 트랜잭션 조회
  GET  /chain/account/:addr — 주소 잔액

Chain Authenticated API:
  POST /chain/submit-tx   — 서명된 트랜잭션 제출
  GET  /chain/mempool     — 대기 트랜잭션

Donation API:
  GET  /donation/stats    — 기부풀 총액 + 내역
  GET  /donation/history  — 최근 기부 목록
```

## 5. 모니터링 계획

```
Admin Dashboard (crownybus.com Admin 탭):
  ✅ 토큰 총량 + KRW 가치
  ✅ 사용자별 잔액
  ✅ 체인 상태 (높이, 해시)
  ✅ 트랜잭션 내역

추가 필요:
  [ ] 실시간 토큰 이동 알림 (대량 전송 감지)
  [ ] 일별/주별 거래량 통계
  [ ] 기부풀 실시간 적립 현황
  [ ] 비정상 패턴 감지 (급격한 스왑 반복)
```

---

*이 문서: CrownyOS Team + Claude Code 작성*
*최종 업데이트: 2026-03-22*
