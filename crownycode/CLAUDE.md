# CrownyCode — CrownyOS 네이티브 AI 코드 엔진

## 프로젝트 정체성
- CrownyOS에서만 돌아가는 AI 코드 생성 엔진
- 클로드에게 배우면서 스스로 성장하는 구조
- 개발도상국 개발자들에게 무상 코드 생성 능력 제공

## 빌드 & 테스트
- `cargo build --release` — 빌드
- `cargo test` — 전체 테스트 (546개, 모두 통과해야 함)
- `cargo test --test bench_test -- --nocapture` — 벤치마크 (수치 출력)
- RPi4 크로스빌드: `./scripts/build_rpi4.sh`

## 아키텍처 — 반드시 준수
### 4대 원칙 (위반 금지)
1. **크라우니셀로직**: 셀이 곧 관계망. SQLite 사용 금지. CellNet(src/cell/net.rs) 사용
2. **크라우니코어**: 셀 분할/병합 사고모델. 선형 파이프라인 금지. CrownyCore::think() 사용
3. **CrownyOS 전용**: standalone 바이너리 아님. syscall trait(src/os/syscall.rs) 경유
4. **4상균형3진**: 확정(+2)/미확인(0)/오해(-1)/미인지(-2) — TritState enum

### 파이프라인 흐름
```
자연어 → KPS(5개국어) → 한선씨IR → CrownyCore::think() → codegen → 코드
                                    ├ split (에너지 셀 분할)
                                    ├ reason (4상별 독립 추론)
                                    └ merge (완성 IR 병합)
```

### 연산 절약 원리
- 확정 셀 → CellNet O(1) 조회, 즉시 통과. 추가 연산 없음
- 미확인 셀 → 패턴 기반 생성 + 자동 테스트 첨부
- 오해 셀 → 즉시 중단, 명확화 질문
- 미인지 셀 → Claude 학습채널 호출 또는 폴백

## 핵심 모듈 맵
| 모듈 | 파일 | 역할 |
|------|------|------|
| CrownyCell | src/cell/mod.rs | 셀 구조체 (edges 직접 보유) |
| CellNet | src/cell/net.rs | 인메모리 셀 관계망 (SQLite 대체) |
| TrustSignal | src/cell/signal.rs | 메시지 패싱 신뢰 전파 |
| CrownyCore | src/crownycore/mod.rs | split→reason→merge 진입점 |
| Splitter | src/crownycore/split.rs | IR→에너지 셀 분할 |
| Reasoner | src/crownycore/reason.rs | 4상별 독립 추론 |
| Merger | src/crownycore/merge.rs | 추론 결과→완성 IR 병합 |
| Engine | src/pipeline/mod.rs | CrownyCore 기반 파이프라인 |
| KPS | src/pipeline/kps/ | 5개국어 파서 |
| 한선씨IR | src/pipeline/ir.rs | 중간 표현 |
| codegen | src/pipeline/codegen/ | Python/Rust/크라우니어 |
| ISA729 | src/isa729/ | 균형3진 VM + 43 opcode |
| Syscall | src/os/syscall.rs | CrownyOS 커널 연결 |

## 코드 규칙
- Rust 2021 edition. `cargo test` 통과 필수
- 새 기능 추가 시 단위 테스트 필수
- CellNet은 &mut self로 조작. CellStore는 RefCell 래퍼 (Step 3 호환용)
- cell/store.rs는 레거시 호환 레이어. 새 코드는 CellNet 직접 사용
- 4상 상태는 반드시 TritState enum 사용 (하드코딩 금지)
- 에너지 계산은 CrownyCell::recalculate_energy() 통해서만

## 용어 (혼동 금지)
- **KPS**: 크라우니 파싱 구조 ("Peterson구문" 아님)
- **한선씨**: IR (컴파일러 전체가 아닌 중간 표현만)
- **크라우니어**: ISA729 기계어/어셈블리
- **크라우니셀로직**: 방사형 셀형 DB (SQLite 래퍼 아님!)
- **크라우니코어**: 셀 분할/병합 사고모델 (confidence 계산기 아님!)

## 현재 상태
- 546 테스트 통과, 9,556줄, 48 파일
- 벤치마크: HTTP 서버 55.6% 절약률, 알려진 의도 5.6x 빠름
- CellNet 1000셀 로드 9.6ms (RPi4 목표 50ms 달성)
- Step 1~6 완료. 다음: KPS 커버리지 확장, 셀DB 시드 채우기, 실 사용 테스트

## 개발 환경
- Mac Studio (ef@EF, 32GB RAM)
- OpenClaw: claude(:18789), gemini(:18790), sonnet(:18791)
- 프로젝트 경로: ~/Downloads/CrownyTVM/crownycode
- Claude Max 200 구독
