# 크라우니코드 — 다음 작업 목록

완료된 Step 1~6 위에 올릴 작업들. 우선순위 순서.

## ~~즉시 실행 (셀DB 시드)~~ ✅ 완료

- [x] 시드 스크립트: `crownycode seed --count 50` (51개 의도, Python+Rust 각 1패턴)
- [x] CLI gen 명령 동작: `crownycode gen "HTTP 서버 만들어줘" --target rust` 확정(+2) 즉시통과
- [x] O(1) 직접 인출 경로: CellNet에서 intent+target 확정 패턴 → 파이프라인 완전 스킵, 절약률 100%
- [x] 벤치마크: 시드 후 절약률 0% → 78.6% (종합), 시드 의도 100%

## ~~KPS 커버리지 확장~~ ✅ 완료

- [x] 복합 자연어 처리: "사용자 입력을 받아서 DB에 저장하는 API" → [validator, database_client, rest_api]
- [x] 한국어 의도 매핑: 7개 → 100+개 (51개 시드 전부 한/영 매핑)
- [x] 영어 의도 매핑: 20+개 동의어 추가
- [x] 테스트 12개 추가 (normalize + compound)

## 코드 품질 ← **다음 추천**

- [ ] cargo clippy 경고 0개 달성 (현재 138개)
- [ ] cell/store.rs 레거시 호환 코드 제거 (Engine이 CellNet 직접 사용)
- [ ] 문서화: 각 pub 함수에 /// 주석

## CrownyOS 실제 연결

- [ ] CrownyOS 커널 소스에서 syscall 테이블 확인
- [ ] KernelSyscall 구현 (StubSyscall 대체)
- [ ] Life Graph Engine과 CellNet 셀 구조 공유 인터페이스
- [ ] QEMU에서 crownycode syscall 테스트

## ISA729 네이티브 실행

- [ ] isa729/codegen.rs에서 RawLogic → 실제 연산 코드 확장
- [ ] VM에서 sort 벤치마크 — 균형3진 정렬 vs 이진 정렬
- [ ] CrownyOS 위에서 ISA729 네이티브 실행 테스트

## 오프라인 경량화

- [ ] CellNet 시드 51개 기준 bincode 크기 측정
- [ ] RPi4 실기기 테스트 (cross 크로스빌드 → SD카드 부팅)
- [ ] 오프라인 모드: 네트워크 없이 기본 코드 생성 확인

## 다국어 파일럿

- [ ] 케냐 개발자 5명에게 스와힐리어 입력 테스트
- [ ] 실제 피드백 기반 sw.rs 어댑터 수정
- [ ] 힌디어/포르투갈어 실사용 테스트

---

## 현재 지표 (2026-03-21)

| 항목 | 값 |
|------|-----|
| 테스트 | 591개 (전부 통과) |
| 소스 줄 | ~11,000줄 |
| 의도 매핑 | 100+ (한/영) |
| 시드 의도 | 51개 (Python+Rust) |
| 복합 요청 | 자동 분할 지원 |
| 절약률 (시드 의도) | 100% |
| 절약률 (벤치마크 평균) | 78.6% |
| clippy 경고 | 138개 |
