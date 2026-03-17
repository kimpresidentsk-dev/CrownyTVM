# ═══════════════════════════════════════════════════════════════
# 한선씨(HanSeon-C) 설치 스크립트 — Windows (PowerShell)
#
# 4상균형3진 ISA729 가상머신 + 한선씨 컴파일러
#
# 실행: powershell -ExecutionPolicy Bypass -File install.ps1
# ═══════════════════════════════════════════════════════════════

Write-Host "▲●▼◆ 한선씨 설치 시작 ▲●▼◆" -ForegroundColor Cyan
Write-Host ""

# ── 설치 경로 ──
$InstallDir = "$env:USERPROFILE\.hanseonc"
$BinDir = "$InstallDir\bin"
$StdDir = "$InstallDir\std"
$ExamplesDir = "$InstallDir\examples"

# ── Rust 확인 ──
$cargoPath = Get-Command cargo -ErrorAction SilentlyContinue
if (-not $cargoPath) {
    Write-Host "Rust가 없습니다. 설치합니다..." -ForegroundColor Yellow
    Write-Host "https://rustup.rs 에서 rustup-init.exe를 다운받아 실행하세요."
    Write-Host ""
    
    $answer = Read-Host "자동으로 다운로드하시겠습니까? (Y/N)"
    if ($answer -eq 'Y' -or $answer -eq 'y') {
        Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile "$env:TEMP\rustup-init.exe"
        Start-Process -FilePath "$env:TEMP\rustup-init.exe" -ArgumentList "-y" -Wait
        $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
    } else {
        Write-Host "Rust를 먼저 설치한 후 다시 실행하세요." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Rust: $(rustc --version)" -ForegroundColor Green
Write-Host ""

# ── 빌드 ──
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "빌드 중..." -ForegroundColor Blue
cargo build --release 2>&1 | Select-Object -Last 3

$exePath = "target\release\crowny.exe"
if (-not (Test-Path $exePath)) {
    Write-Host "빌드 실패" -ForegroundColor Red
    exit 1
}

Write-Host "빌드 성공" -ForegroundColor Green
Write-Host ""

# ── 설치 ──
Write-Host "설치 중: $InstallDir" -ForegroundColor Blue

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
New-Item -ItemType Directory -Force -Path $StdDir | Out-Null
New-Item -ItemType Directory -Force -Path $ExamplesDir | Out-Null

# 바이너리
Copy-Item $exePath "$BinDir\hanseonc.exe" -Force
Copy-Item $exePath "$BinDir\crowny.exe" -Force

# 표준라이브러리
Copy-Item "std\*.han" $StdDir -Force

# 예제
Copy-Item "examples\*.han" $ExamplesDir -Force

# ── PATH 설정 ──
$currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($currentPath -notlike "*hanseonc*") {
    [Environment]::SetEnvironmentVariable("PATH", "$BinDir;$currentPath", "User")
    Write-Host "PATH에 추가됨: $BinDir" -ForegroundColor Green
    
    # HANSEONC_STD 환경변수
    [Environment]::SetEnvironmentVariable("HANSEONC_STD", $StdDir, "User")
} else {
    Write-Host "PATH 이미 설정됨"
}

# ── 확인 ──
Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Green
Write-Host "▲●▼◆ 한선씨 설치 완료! ▲●▼◆" -ForegroundColor Green
Write-Host "═══════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  바이너리: $BinDir\hanseonc.exe"
Write-Host "  표준라이브러리: $StdDir\"
Write-Host "  예제: $ExamplesDir\"
Write-Host ""
Write-Host "  사용법:"
Write-Host "    hanseonc run 파일.han     # 실행"
Write-Host "    hanseonc repl             # 대화형"
Write-Host "    hanseonc test             # 시험"
Write-Host ""
Write-Host "  ※ 터미널을 다시 열어야 PATH가 적용됩니다."
