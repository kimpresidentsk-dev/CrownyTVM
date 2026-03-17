# ▲■▼ CrownyTVM v0.32.0 — Stage 1 완성

## 4세대 온톨로직 균형3진 VM + 한선씨 코어 라이브러리

```
60/60 테스트 통과 (Stage 0: 33개 + Stage 1: 27개)
Rust: 3,085줄 | 한선씨 표준 라이브러리: 466줄 | 바이너리: 799KB
```

## Stage 0 — 점화기 (Rust)

한선씨 소스 → ISA729 바이트코드 → TritVM 실행

```
.han 소스 → [렉서] → [파서] → [코드젠] → ISA729 바이트코드 → [TritVM] → 결과
                                  ↑ 모듈 로더가 가져오기 해석
```

## Stage 1 — 한선씨 코어 라이브러리 (한선씨로 작성)

6개 표준 라이브러리가 전부 `.han` 파일로 작성됨:

| 모듈 | 파일 | 줄 | 내용 |
|------|------|-----|------|
| `수학` | std/수학.han | 77줄 | 반올림/바닥/삼각함수/팩토리얼/거듭제곱/랜덤 |
| `문자열` | std/문자열.han | 50줄 | 글자수/대문자/나누기/합치기/교체/채우기 |
| `배열` | std/배열.han | 95줄 | 정렬/뒤집기/유일값/합계/범위/찾기/통계 |
| `tri` | std/tri.han | 153줄 | **균형3진 가산기/비교기/변환기 (한선씨 네이티브)** |
| `타입` | std/타입.han | 40줄 | 타입검사/변환/JSON/안전변환 |
| `sys` | std/sys.han | 51줄 | 파일I/O/시간/환경변수 (SYSCALL 호스트 브리지) |

### 핵심: sys 호출은 VM의 SYSCALL 옵코드를 통해 호스트(macOS)로 나감

```han
// std/sys.han — 한선씨 코드 자체는 호스트에 의존하지 않음
함수 파일쓰기(경로, 내용) {
    반환 __sys__("파일쓰기", 경로, 내용)    // → SYSCALL 옵코드
}
```

### 핵심: tri9 균형3진 가산기가 한선씨로 작동

```han
// std/tri.han — 균형3진 덧셈이 한선씨 네이티브로 실행됨
함수 tri9_더하기(a, b) {
    변수 결과 = [0, 0, 0, 0, 0, 0, 0, 0, 0]
    변수 올림 = 0
    변수 i = 8
    동안 (i >= 0) {
        변수 합 = a[i] + b[i] + 올림
        올림 = 0
        만약 (합 > 1) { 합 = 합 - 3   올림 = 1 }
        ...
    }
}
```

## Stage 1에서 추가된 컴파일러 기능

| 기능 | 문법 | 설명 |
|------|------|------|
| 모듈 가져오기 | `가져오기 "수학"` | std/수학.han 로드 → 함수 병합 |
| 내장함수 호출 | `__내장__(id, args)` | VM BUILTIN 옵코드 직접 발행 |
| 시스템 호출 | `__sys__("이름", args)` | 호스트 OS 브리지 (SYSCALL) |
| 배열 인덱스 대입 | `a[i] = v` | SETIDX 옵코드 |
| 배열 결합 | `a + b` | 두 배열 연결 |

## 사용법

```bash
cargo run -- test                          # 60개 테스트 실행
cargo run -- run examples/stage1_demo.han  # Stage 1 데모
cargo run -- run examples/kps_trading.han  # KPS 트레이딩
cargo run -- repl                          # 대화형 REPL
```

## 프로젝트 구조

```
crowny-tvm/
├── src/                    Rust 컴파일러 + VM (3,085줄)
│   ├── compiler/           한선씨 컴파일러
│   │   ├── token.rs        토큰 (한국어/영어 60+ 키워드)
│   │   ├── lexer.rs        렉서 (한글/영문 이중모드)
│   │   ├── ast.rs          AST (온톨로직 + 모듈 + 내장호출)
│   │   ├── parser.rs       파서 (만약3, 주장, 가져오기, __내장__)
│   │   ├── codegen.rs      코드젠 → ISA729 바이트코드
│   │   └── mod.rs          모듈 로더 (재귀적 가져오기 해석)
│   ├── vm/                 균형3진 가상머신
│   │   ├── trit.rs         Ti/Om/Ta + Epistemic + Claim
│   │   ├── opcode.rs       ISA729 (CLAIM/IF3/BUILTIN/SYSCALL)
│   │   └── engine.rs       TritVM (60+ BUILTIN + 8 SYSCALL)
│   └── ontologic/          4세대 온톨로직 엔진
├── std/                    한선씨 표준 라이브러리 (466줄, 한선씨로 작성)
│   ├── 수학.han            수학 함수
│   ├── 문자열.han          문자열 조작
│   ├── 배열.han            배열/통계
│   ├── tri.han             균형3진 타입 + 가산기
│   ├── 타입.han            타입검사/변환
│   └── sys.han             시스템 호출 (호스트 브리지)
└── examples/               예제
    ├── stage1_demo.han     전체 라이브러리 데모
    ├── kps_trading.han     KPS 트레이딩 의사결정
    └── hello.han           기본 예제
```

## 부트스트랩 진행상황

```
Stage 0 ✅ 점화기 (Rust) — 컴파일러 + VM
Stage 1 ✅ 한선씨 코어 라이브러리 (한선씨로 작성) ← 여기
Stage 2    한선씨로 VM 재구현
Stage 3    한선씨 컴파일러를 한선씨로 → 셀프호스팅
Stage 4    CrownyOS 커널 + 셸 (한선씨 전용)
```
