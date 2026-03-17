# ▲■▼ CrownyTVM v0.32.0 — Stage 5: 네이티브 기계어 생성

## 한선씨가 CPU가 직접 실행하는 기계어를 생성한다

```
S0~S4: 78/78 테스트  |  S5: 3/3 네이티브 실행 + 2 ARM64 검증
Rust 3,155줄 (점화기) | 한선씨 2,204줄 (41%) | 14개 모듈
```

## Stage 5 — 한선씨 → 네이티브 기계어

```
"출력(42)" → 한선기계어.han → x86-64 바이트 → ELF64 바이너리 → OS 직접 실행
```

136바이트짜리 ELF64 실행파일을 한선씨 정수 연산만으로 생성.
`file` 명령 확인: `ELF 64-bit LSB executable, x86-64, statically linked`

### Stage 5 검증 결과

| 테스트 | 기계어 | 결과 |
|--------|--------|------|
| exit(42) | MOV RAX,60; MOV RDI,42; SYSCALL | 종료코드 42 ✓ |
| write("42") | write(1,msg,3); exit(0) | stdout "42" ✓ |
| (3+7)*2=20 | ADD,PUSH,POP,IMUL | 종료코드 20 ✓ |
| ARM64 MOV | `0xD2800540` | [64,5,128,210] ✓ |
| ARM64 ADD | `0x8B020020` | [32,0,2,139] ✓ |

### 핵심: 비트시프트 없이 기계어 인코딩

한선씨에 비트 연산이 없으므로 곱셈/나눗셈으로 대체:
```han
// x << 5 = x * 32,  x << 16 = x * 65536
// ADD Xd,Xn,Xm = 0x8B000000 | (Xm*65536) | (Xn*32) | Xd
함수 arm_add(rd, rn, rm) {
    변수 inst = 2332033024 + rm * 65536 + rn * 32 + rd
    반환 _le32(inst)
}
```

## 전체 부트스트랩

```
Stage 0 ✅ Rust 점화기 (3,155줄)
Stage 1 ✅ 한선씨 코어 라이브러리 (10개 모듈)
Stage 2 ✅ 한선씨 VM (메타순환, 30개 ISA729 옵코드)
Stage 3 ✅ 한선씨 셀프호스팅 컴파일러 (렉서+파서+코드젠)
Stage 4 ✅ CrownyOS (커널+TritFS+셸)
Stage 5 ✅ 네이티브 기계어 생성 (x86-64 ELF + ARM64 인코더) ← 완성
```

## Rust 제거 경로

Stage 5에서 증명된 것: 한선씨가 네이티브 기계어를 생성할 수 있다.

남은 작업:
1. `한선네이티브.han` (~450줄) — 한선씨 AST → ARM64 코드젠
2. `한선MachO.han` (~200줄) — Mach-O 바이너리 포맷
3. 한선씨 컴파일러 자체를 ARM64로 변환 → Rust 3,155줄 완전 제거

## 사용법

```bash
cargo run -- run examples/stage5_native.han  # ★ 네이티브 기계어 생성
cargo run -- run examples/stage4_demo.han    # CrownyOS 부팅
cargo run -- run examples/stage3_demo.han    # 셀프호스팅 컴파일러
cargo run -- test                            # 78개 테스트
```

## 프로젝트 구조 (Rust 3,155 + 한선씨 2,204 = 5,359줄)

```
std/                          한선씨 라이브러리 (2,204줄)
├── 한선기계어.han (203줄)    ★ S5: x86-64/ARM64 인코더 + ELF 생성
├── 커널.han (148줄)          S4: 태스크/권한/스케줄러/메시지
├── TritFS.han (189줄)        S4: 가상 파일시스템
├── 셸.han (217줄)            S4: 명령 해석기
├── 한선렉서.han (144줄)      S3: 토큰화기
├── 한선파서.han (294줄)      S3: 재귀하강 파서
├── 한선코드젠.han (272줄)    S3: ISA729 바이트코드 생성기
├── 한선VM.han (271줄)        S2: ISA729 VM (30개 옵코드)
├── tri.han (153줄)           균형3진 가산기/변환기
├── 수학.han / 문자열.han / 배열.han / 타입.han / sys.han
```
