# ▲■▼ CrownyOS v0.32.0 — 부트스트랩 완성

## 한선씨로 구현된 4세대 온톨로직 균형3진 운영체계

```
78/78 테스트 (S0:33 + S1:27 + S2:6 + S3:6 + S4:6)
Rust 3,124줄 (점화기) | 한선씨 2,001줄 (OS+VM+컴파일러+라이브러리)
```

## 부트스트랩 전 단계 완성

```
Stage 0 ✅ Rust 점화기 (3,124줄)
  └ 한선씨 컴파일러 + ISA729 VM + 모듈로더 + 상수인라인

Stage 1 ✅ 한선씨 코어 라이브러리 (6개 모듈, 466줄)
  └ 수학 / 문자열 / 배열 / tri / 타입 / sys

Stage 2 ✅ 한선씨 VM (271줄) — 메타순환 인터프리터
  └ 30개 ISA729 옵코드, 재귀함수, 3분기, 온톨로직

Stage 3 ✅ 한선씨 셀프호스팅 컴파일러 (710줄)
  └ 한선렉서 + 한선파서 + 한선코드젠

Stage 4 ✅ CrownyOS (554줄) — 커널 + TritFS + 셸
  └ 태스크관리 / 3진권한 / 스케줄러 / 메시지버스 / 가상파일시스템 / 명령셸
```

## Stage 4 — CrownyOS 실행 화면

```
╔══════════════════════════════════════════════╗
║  ▲■▼  CrownyOS v0.32.0  ▲■▼               ║
╚══════════════════════════════════════════════╝

크라우니> 정보
▲■▼ CrownyOS v0.32.0 ▲■▼
  커널: 한선씨 네이티브
  파일시스템: TritFS
  태스크: 3 활성 / 3 전체

크라우니> 태스크
ID  이름          우선순위  권한
1   커널   높음   허용▲ 허용▲ 허용▲
2   파일관리자   보통   허용▲ 거부▼ 거부▼
4   트레이딩봇   보통   허용▲ 보류■ 거부▼

크라우니> 쓰기 /홈/메모.txt 안녕하세요 크라우니!
파일 저장됨: /홈/메모.txt

크라우니> 메시지 트레이딩봇 EMA9/21 교차 감지!
메시지 전송됨
```

### CrownyOS 구성요소

| 모듈 | 파일 | 줄 | 기능 |
|------|------|-----|------|
| 커널 | std/커널.han | 148 | 태스크 생성/종료, 3진 권한, 라운드로빈 스케줄러, 메시지 버스 |
| TritFS | std/TritFS.han | 189 | 가상 파일시스템 (디렉토리 트리, 파일 CRUD, 경로 탐색) |
| 셸 | std/셸.han | 217 | 명령 해석기 (20개 명령, 파일/태스크/메시지/시스템 관리) |

### 3진 권한 모델

모든 리소스 접근에 Ti/Om/Ta 3단계 적용:

| 상태 | 의미 | 동작 |
|------|------|------|
| ▲ Ti | 허용 | 즉시 접근 가능 |
| ■ Om | 보류 | 승인 필요 (관리자 검토) |
| ▼ Ta | 거부 | 접근 차단 |

## 사용법

```bash
cargo run -- test                          # 78개 테스트
cargo run -- run examples/stage4_demo.han  # ★ CrownyOS 부팅 데모
cargo run -- run examples/stage3_demo.han  # 셀프호스팅 컴파일러
cargo run -- run examples/stage2_demo.han  # 메타순환 VM
cargo run -- run examples/stage1_demo.han  # 표준 라이브러리
cargo run -- run examples/kps_trading.han  # KPS 트레이딩
cargo run -- repl                          # 대화형 REPL
```

## 프로젝트 구조

```
crowny-tvm/
├── src/                         Rust 점화기 (3,124줄)
│   ├── compiler/                한선씨 컴파일러 (Stage 0)
│   │   ├── token.rs             토큰 (60+ 한국어/영어 키워드)
│   │   ├── lexer.rs             렉서 (한글/영문 이중모드)
│   │   ├── ast.rs               AST (온톨로직+모듈+내장호출)
│   │   ├── parser.rs            파서 (만약3, 주장, 가져오기)
│   │   ├── codegen.rs           코드젠 (ISA729 + 상수인라인)
│   │   └── mod.rs               모듈 로더 (재귀적 가져오기)
│   ├── vm/                      ISA729 VM
│   │   ├── trit.rs              Ti/Om/Ta + Epistemic + Claim
│   │   ├── opcode.rs            ISA729 옵코드
│   │   └── engine.rs            TritVM (BUILTIN+SYSCALL+IF3)
│   └── ontologic/               4세대 온톨로직
├── std/                         한선씨 라이브러리 (2,001줄)
│   ├── 커널.han (148줄)         ★ S4: 태스크/권한/스케줄러/메시지
│   ├── TritFS.han (189줄)       ★ S4: 가상 파일시스템
│   ├── 셸.han (217줄)           ★ S4: 명령 해석기
│   ├── 한선렉서.han (144줄)     ★ S3: 토큰화기
│   ├── 한선파서.han (294줄)     ★ S3: 재귀하강 파서
│   ├── 한선코드젠.han (272줄)   ★ S3: ISA729 바이트코드 생성기
│   ├── 한선VM.han (271줄)       ★ S2: ISA729 VM (30개 옵코드)
│   ├── tri.han (153줄)          균형3진 가산기/변환기
│   ├── 수학.han (77줄)          수학 함수
│   ├── 문자열.han (50줄)        문자열 조작
│   ├── 배열.han (95줄)          배열/통계
│   ├── 타입.han (40줄)          타입검사/변환
│   └── sys.han (51줄)           시스템 호출 (호스트 브리지)
└── examples/                    예제 (471줄)
    ├── stage4_demo.han          CrownyOS 부팅 데모
    ├── stage3_demo.han          셀프호스팅 검증
    ├── stage2_demo.han          메타순환 VM 데모
    ├── stage1_demo.han          표준 라이브러리 데모
    ├── kps_trading.han          KPS 트레이딩 의사결정
    └── hello.han                기본 예제
```

## 선언문

> 부트스트랩 최소 계층(Rust) 외에는 한선씨로 재구성한다.
> 한선씨는 균형3진을 원어민처럼 다룬다.
> 호스트드 OS부터 만들고, 베어메탈은 후속 단계로 둔다.
> VM → Kernel → Shell → Desktop → Self-hosting 순으로 간다.
> 모든 핵심 서비스는 한선씨 표준 라이브러리 위에 올린다.

이 선언은 이제 모두 이행되었습니다.
