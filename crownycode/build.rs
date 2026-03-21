// crownycode/build.rs
// 컴파일 타임 플랫폼 감지 + 설정 주입

fn main() {
    let target = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();
    let os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();

    // RPi4/ARM 감지
    let is_arm = target == "aarch64" || target == "arm";
    let is_linux = os == "linux";

    if is_arm && is_linux {
        println!("cargo:rustc-cfg=rpi4");
        println!("cargo:rustc-cfg=low_power_default");
        // ARM에서는 기본적으로 저전력 모드 권장
        println!("cargo:warning=ARM 타겟 감지: low_power 모드를 crownycode.toml에서 활성화하세요");
    }

    // macOS (개발 환경)
    if os == "macos" {
        println!("cargo:rustc-cfg=desktop");
    }

    // 빌드 타임 버전 정보 주입
    let version = std::env::var("CARGO_PKG_VERSION").unwrap_or_else(|_| "0.0.0".to_string());
    let profile = std::env::var("PROFILE").unwrap_or_else(|_| "debug".to_string());

    println!("cargo:rustc-env=CROWNYCODE_BUILD_VERSION={version}");
    println!("cargo:rustc-env=CROWNYCODE_BUILD_PROFILE={profile}");
    println!("cargo:rustc-env=CROWNYCODE_BUILD_TARGET={target}-{os}");

    // 빌드 시 변경 감지 — 이 파일만 변경 시 재빌드
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=crownycode.toml");
}
