# CrownyFoundry 개발 가이드

> 국산 팔란티어 파운더리 — CrownyCellCore(27-방사형 DB) + CrownyLanguage(4-상 균형삼진법) 기반

---

## 1. 핵심 자산 맵

### 1-A. 균형삼진법 (Balanced Ternary) 기초
| 파일 | 설명 |
|------|------|
| `src/vm/trit.rs` | Ti(+1)/Om(0)/Ta(-1) + Epistemic + Claim 타입 정의 |
| `std/tri.han` | 삼진 덧셈/비교/변환 라이브러리 |
| `크라우니/원천/기초/삼진수.rs` | Rust 삼진수 모듈 |
| `크라우니/원천/기초/티옴타음.rs` | Ti/Om/Ta 인식론적 상태 |

### 1-B. CrownyCellCore (27-trit 온톨로직 셀)
| 파일 | 설명 |
|------|------|
| `CrownyCell/셀.han` | 셀 핵심 (27-trit 온톨로직 단위) |
| `CrownyCell/크라우니셀.han` | 전체 셀: 인식 상태, 확신도, 증거 |
| `CrownyCell/저장소.han` | 셀 저장/영속화 |
| `CrownyCell/온톨로직db_시험.han` | 온톨로직 DB 테스트 |
| `std/크라우니셀.han` | Stage 4 셀 구현 (174줄) |
| `크라우니/원천/기초/셀.rs` | Rust 셀 구현 |
| `크라우니/원천/온톨로지/기억.rs` | 27-슬롯 셀 DB, Claim DB, Layer 0-4 |

### 1-C. ISA729 명령어 체계
| 파일 | 설명 |
|------|------|
| `src/vm/opcode.rs` | ISA729 오피코드 정의 (729 명령 공간) |
| `src/vm/engine.rs` | TritVM 실행 엔진 (60+ BUILTIN) |
| `ISA729VM/isa729vm.han` | 한선씨로 작성된 ISA729 VM (44 opcodes) |
| `isa729vm.han` | 루트 레벨 ISA729 VM (13KB) |
| `isa729코드젠.han` | ISA729 코드 생성기 (8.3KB) |
| `ISA729VM/isa729_test.han` | ISA729 테스트 스위트 |

### 1-D. 한선씨 (HanSeon-C) 컴파일러
| 파일 | 설명 |
|------|------|
| `src/compiler/lexer.rs` | 한/영 키워드 토크나이저 |
| `src/compiler/parser.rs` | 재귀하강 파서 |
| `src/compiler/codegen.rs` | ISA729 바이트코드 생성기 |
| `src/compiler/ast.rs` | AST (온톨로직 + 모듈 지원) |
| `src/compiler/token.rs` | 토큰 정의 (60+ 키워드) |
| `크라우니/원천/한선씨/` | 한선씨 컴파일러 Rust 모듈 (낱말/읽개/구문/짜개) |
| `크라우니/자체/` | 자체호스팅: 구문/읽개/평가기 (한선씨로 작성) |

### 1-E. 크라우니어 (CrownyLanguage) 스택 VM
| 파일 | 설명 |
|------|------|
| `크라우니/원천/크라우니어/명령어.rs` | 60+ 명령어 정의 |
| `크라우니/원천/크라우니어/실행기.rs` | 크라우니어 실행기 |

### 1-F. CrownyOS 커널
| 파일 | 설명 |
|------|------|
| `std/커널.han` | 태스크 관리, 3-상태 권한, 스케줄러, 메시지 버스 |
| `std/TritFS.han` | 가상 파일시스템 + 디렉토리 트리 |
| `std/셸.han` | 커맨드 인터프리터 (20+ 명령) |
| `std/터미널.han` | 인터렉티브 CrownyOS 터미널 |
| `크라우니OS.han` | 전체 OS (3,113줄) |
| `CrownyOSPack/` | 패키징된 OS 배포본 |

### 1-G. 베어메탈 커널
| 파일 | 설명 |
|------|------|
| `baremetal/kernel/main.c` | C 베어메탈 커널 |
| `baremetal/boot/start.S` | ARM 부트 어셈블리 |
| `baremetal/kernel/hw.h, uart.h, disk.h, net.h, gui.h` | 하드웨어 드라이버 |
| `baremetal/Makefile, linker.ld` | 빌드 설정 |
| `baremetal/크라우니OS.elf` | 컴파일된 ELF 이미지 |

### 1-H. 네이티브 코드 생성 (Stage 5+)
| 파일 | 설명 |
|------|------|
| `std/한선기계어.han` | x86-64/ARM64 네이티브 인코더 + ELF 생성기 |
| `CrownyStage07/비트.han` | AND/OR/XOR/SHL/SHR 비트 연산 |
| `CrownyStage07/바이트코드.han` | .hanc 직렬화/역직렬화 |

---

## 2. 부트스트랩 7단계

```
Stage 1 → Rust로 한선씨 기초 라이브러리     (CrownyTVM02/)
Stage 2 → 메타-순환 VM                     (CrownyTVM03/, std/한선VM.han)
Stage 3 → 자체호스팅 컴파일러               (CrownyTVM04/, std/한선렉서·파서·코드젠.han)
Stage 4 → CrownyOS 커널                   (CrownyTVM05/, std/커널·TritFS·셸.han)
Stage 5 → 네이티브 코드 생성               (CrownyTVM_HSS/, std/한선기계어.han)
Stage 7 → 완전 부트스트랩                  (CrownyStage07/)
```

---

## 3. CrownyFoundry 개발 로드맵

### Phase 1: 온톨로직 데이터 엔진 (Ontologic Data Engine)
**목표**: CrownyCellCore 27-방사형 DB를 REST/GraphQL API로 노출

**참조 파일**:
- `CrownyCell/크라우니셀.han` — 셀 구조 이해
- `크라우니/원천/온톨로지/기억.rs` — 27-슬롯 DB, Claim DB, Layer 구조
- `CrownyCell/온톨로직db_시험.han` — 테스트 패턴 참조

**작업**:
1. `foundry/engine/` 디렉토리 생성
2. CrownyCellCore를 Node.js/Rust 바인딩으로 래핑
3. REST API: CRUD on 27-radial cells, Claim 쿼리, Layer 탐색
4. 온톨로직 관계 그래프 쿼리 엔진

### Phase 2: 파이프라인 빌더 (Pipeline Builder)
**목표**: 데이터 수집 → 변환 → 분석 파이프라인을 한선씨/크라우니어로 정의

**참조 파일**:
- `크라우니/원천/크라우니어/` — 스택 VM 파이프라인 실행기
- `src/vm/engine.rs` — TritVM BUILTIN 60+ 연산
- `std/수학.han`, `std/배열.han` — 수학/통계 함수

**작업**:
1. `foundry/pipeline/` 디렉토리 생성
2. 파이프라인 DSL (한선씨 기반 또는 JSON 정의)
3. 스케줄러: cron + 이벤트 트리거
4. 모니터링 대시보드

### Phase 3: 분석 워크벤치 (Analysis Workbench)
**목표**: 웹 UI에서 온톨로직 데이터 시각화 + 대화형 분석

**참조 파일**:
- `public/js/trading.js` — 캔들차트/실시간 데이터 시각화 패턴
- `examples/kps_trading.han` — KPS 트레이딩 의사결정 시스템
- `크라우니/체계/클로드.한선씨` — AI 통합 패턴

**작업**:
1. `public/js/foundry.js` — 파운더리 웹 UI
2. 셀 그래프 시각화 (D3.js / Canvas)
3. 실시간 파이프라인 모니터
4. 한선씨 코드 에디터 (Monaco + 한선씨 syntax)

### Phase 4: 엣지 배포 (Edge Deployment)
**목표**: Jetson Orin / FPGA / RPi에 파운더리 에이전트 배포

**참조 파일**:
- `baremetal/` — ARM 베어메탈 커널
- `std/한선기계어.han` — x86-64/ARM64 네이티브 코드 생성
- `CrownyStage07/비트.han` — 비트 연산 (FPGA 매핑용)
- `CrownyOSPack/` — OS 배포 패키지

**작업**:
1. Jetson Orin: CUDA + CrownyCellCore 가속
2. FPGA: ISA729 하드웨어 구현 (Verilog/VHDL)
3. RPi: 경량 에이전트 (ARM64 네이티브)
4. 크로스 플랫폼 빌드 시스템

---

## 4. 빠른 시작

```bash
# 1. Rust 빌드 (한선씨 컴파일러 + TritVM)
cd /Users/ef/Downloads/CrownyTVM
cargo build --release

# 2. 한선씨 프로그램 실행
./target/release/crowny-tvm std/크라우니셀.han

# 3. ISA729 테스트
./target/release/crowny-tvm ISA729VM/isa729_test.han

# 4. CrownyOS 부팅
./target/release/crowny-tvm 크라우니OS.han

# 5. 베어메탈 빌드 (ARM cross-compiler 필요)
cd baremetal && make
```

---

## 5. 디렉토리 구조 요약

```
CrownyTVM/
├── src/                    # Rust 부트스트랩 (Stage 1)
│   ├── compiler/           #   한선씨 컴파일러
│   └── vm/                 #   ISA729 VM + Trit 타입
├── std/                    # 한선씨 표준 라이브러리 (2,486줄)
├── 크라우니/               # 통합 Rust 구현
│   ├── 원천/               #   Rust 소스 (기초/온톨로지/삼진VM/크라우니어/한선씨)
│   ├── 자체/               #   자체호스팅 컴파일러 (한선씨)
│   ├── 체계/               #   시스템 프로그램
│   └── 예제/               #   예제
├── CrownyCell/             # CrownyCellCore 온톨로직 셀
├── ISA729VM/               # ISA729 VM 구현
├── CrownyTVM02~05/         # 부트스트랩 Stage 1~4
├── CrownyTVM_HSS/          # Stage 5 네이티브
├── CrownyStage07/          # Stage 7 완전 부트스트랩
├── CrownyOSPack/           # OS 배포 패키지
├── baremetal/              # ARM 베어메탈 커널
├── 한선씨/~한선씨4/         # 한선씨 실험 버전들
├── public/                 # 웹 UI (트레이딩/소셜/지갑/메신저)
├── chat-server/            # 메신저 서버
├── mail-server/            # 메일 서버
└── server.js               # Node.js 웹서버 (:7730)
```
