# ▲■▼ CrownyTVM v0.32.0 — Stage 2 완성

## 한선씨로 만든 VM이 한선씨 바이트코드를 실행한다

```
66/66 테스트 통과 (Stage 0: 33 + Stage 1: 27 + Stage 2: 6)
Rust: 3,085줄 | 한선씨: 737줄 (VM 271줄 포함) | 바이너리: 799KB
```

## Stage 2 — 메타순환 (Meta-Circular)

`std/한선VM.han` (271줄)이 ISA729 바이트코드를 직접 해석·실행:

```
한선씨 소스 (.han)
    ↓ Stage 0 Rust 컴파일러
ISA729 바이트코드
    ↓ Stage 0 Rust VM (호스트)
    ↓ 위에서 한선VM.han 실행
        ↓ 한선VM이 바이트코드 해석
        → 결과 (산술/조건/루프/재귀/3분기/온톨로직)
```

### Stage 2 검증 결과: 6/6

| 테스트 | 프로그램 | 결과 |
|--------|----------|------|
| 산술 | (3+7)*(6-2) | 40 ✓ |
| 조건 | 10>5 → 분기 | "큰수" ✓ |
| 루프 | 합계(1~5) | 15 ✓ |
| 재귀 함수 | 팩토리얼(5) | 120 ✓ |
| 3분기(IF3) | 옴 → 분기 | "보류!" ✓ |
| 4세대 온톨로직 | Claim 미확인→전진 | "티(확정)" ✓ |

### 한선VM이 구현한 ISA729 옵코드 (30개)

산술: ADD/SUB/MUL/DIV/MOD/NEG,
비교: EQ/NEQ/GT/LT/NOT/AND/CMP, TRUE/FALSE/UNKNOWN,
스택: PUSH/POP/DUP/SWAP,
변수: STORE/LOAD,
흐름: JMP/JMPIF/FUNC/CALL/RET/HALT,
출력: PRINT,
배열: ARRAY/LEN/INDEX,
3분기: IF3,
온톨로직: CLAIM_NEW/CLAIM_STATE/CLAIM_EVID/CLAIM_TRANS

## 사용법

```bash
cargo run -- test                          # 66개 테스트
cargo run -- run examples/stage2_demo.han  # Stage 2 메타순환 데모
cargo run -- run examples/stage1_demo.han  # Stage 1 라이브러리 데모
cargo run -- run examples/kps_trading.han  # KPS 트레이딩
cargo run -- repl                          # 대화형 REPL
```

## 프로젝트 구조

```
crowny-tvm/
├── src/                    Rust 점화기 (3,085줄)
│   ├── compiler/           한선씨 컴파일러 (렉서/파서/코드젠/모듈로더)
│   ├── vm/                 ISA729 VM (트릿/옵코드/실행엔진)
│   └── ontologic/          4세대 온톨로직
├── std/                    한선씨 표준 라이브러리 (737줄)
│   ├── 한선VM.han          ★ Stage 2: 한선씨로 구현된 VM (271줄)
│   ├── tri.han             균형3진 가산기/비교기
│   ├── 수학.han            수학 함수
│   ├── 문자열.han          문자열 조작
│   ├── 배열.han            배열/통계
│   ├── 타입.han            타입검사/변환
│   └── sys.han             시스템 호출 (호스트 브리지)
└── examples/
    ├── stage2_demo.han     메타순환 VM 데모
    ├── stage1_demo.han     표준 라이브러리 데모
    └── kps_trading.han     KPS 트레이딩 의사결정
```

## 부트스트랩 진행상황

```
Stage 0 ✅ 점화기 (Rust 컴파일러 + VM)
Stage 1 ✅ 한선씨 코어 라이브러리 (6개 모듈, 한선씨로 작성)
Stage 2 ✅ 한선씨로 VM 재구현 (메타순환 인터프리터) ← 여기
Stage 3    한선씨 컴파일러를 한선씨로 → 셀프호스팅
Stage 4    CrownyOS 커널 + 셸 (한선씨 전용)
```
