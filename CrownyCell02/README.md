# ▲■▼ CrownyOS v0.32.0 — Rust 없이 한선씨 실행

## 한선씨가 자기 자신을 C로 변환하고 gcc가 네이티브 바이너리를 만든다

```
Rust 3,219줄 (점화기) | 한선씨 2,659줄 (45%) | 17개 모듈
Stage 6: Rust 없는 실행 경로 완성
```

## Rust를 없애는 방법

```
현재 (Rust 점화기 사용):
  .han → [Rust 컴파일러] → ISA729 → [Rust VM] → 결과

Stage 6 (Rust 제거):
  .han → [한선C변환.han] → .c 소스 → [gcc] → 네이티브 바이너리
```

### 검증 완료: 5/5

| 한선씨 소스 | gcc 결과 | Rust 관여 |
|-------------|----------|-----------|
| `출력(3 + 7 * 2)` | 17 ✓ | 없음 |
| `변수 x=6, y=7 출력(x*y)` | 42 ✓ | 없음 |
| `만약 (10>5) "큰수"/"작은수"` | 큰수 ✓ | 없음 |
| `합계(1~5)` | 15 ✓ | 없음 |
| `팩토리얼(5)` | 120 ✓ | 없음 |

### 생성된 C 코드 예시

```han
함수 팩(n) { 만약 (n < 2) { 반환 1 } 반환 n * 팩(n - 1) }
출력(팩(5))
```
↓ 한선C변환.han
```c
#include "crowny_runtime.h"

Value fn_팩(Value n) {
  if (v_truthy(v_lt(n, v_int(2))) == 1) {
    return v_int(1);
  }
  return v_mul(n, fn_팩(v_sub(n, v_int(1))));
}

int main(void) {
  v_print(fn_팩(v_int(5)));
  return 0;
}
```
↓ gcc → 네이티브 바이너리 → `120`

### Rust 완전 제거 3단계

**1단계 (완료):** 한선C변환.han이 한선씨→C 변환을 수행

**2단계:** 한선C변환.han + 한선렉서.han + 한선파서.han 자체를 C로 변환
```bash
# Rust 점화기를 마지막으로 한 번만 사용
crowny run bootstrap.han > crowny_native.c
gcc -o crowny_native crowny_native.c
# 이후 Rust 불필요
./crowny_native run 파일.han
```

**3단계:** crowny_native 바이너리가 .han 파일을 직접 읽고 실행/변환
→ Rust 완전 제거, gcc만 있으면 됨 (gcc는 모든 플랫폼에 있음)

## 사용법

```bash
# 대화형 터미널
cargo run -- shell

# 한선씨 프로그램 실행
cargo run -- run examples/stage6_no_rust.han   # ★ Rust-free 경로 데모
cargo run -- run examples/stage5_native.han    # 기계어 직접 생성
cargo run -- run examples/stage4_demo.han      # CrownyOS 부팅
cargo run -- run examples/stage3_demo.han      # 셀프호스팅 컴파일러

# 테스트
cargo run -- test                              # 78개 테스트
```

## 전체 모듈 (17개, 2,659줄)

```
std/
├── 한선C변환.han (173줄)   ★ S6: 한선씨→C 트랜스파일러
├── crowny_runtime.h        ★ S6: C 런타임 (Value 타입)
├── 터미널.han (108줄)      대화형 CrownyOS 부팅
├── 크라우니셀.han (174줄)  27t 온톨로직 원자 단위
├── 한선기계어.han (203줄)  S5: x86-64/ARM64 인코더
├── 커널.han (148줄)        S4: 태스크/권한/스케줄러/메시지
├── TritFS.han (189줄)      S4: 가상 파일시스템
├── 셸.han (217줄)          S4: 명령 해석기
├── 한선렉서.han (144줄)    S3: 토큰화기
├── 한선파서.han (294줄)    S3: 재귀하강 파서
├── 한선코드젠.han (272줄)  S3: ISA729 바이트코드 생성기
├── 한선VM.han (271줄)      S2: ISA729 VM
├── tri.han (153줄)         균형3진 가산기
├── 수학/문자열/배열/타입/sys.han
```

## 부트스트랩

```
Stage 0 ✅ Rust 점화기
Stage 1 ✅ 한선씨 코어 라이브러리
Stage 2 ✅ 한선씨 VM (메타순환)
Stage 3 ✅ 한선씨 셀프호스팅 컴파일러
Stage 4 ✅ CrownyOS 커널+TritFS+셸+터미널+크라우니셀
Stage 5 ✅ 네이티브 기계어 (x86-64 ELF + ARM64)
Stage 6 ✅ 한선씨→C 트랜스파일러 (Rust 제거 경로) ← 완성
```
