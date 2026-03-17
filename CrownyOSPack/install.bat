@echo off
chcp 65001 >nul 2>&1
echo ▲●▼◆ 한선씨 설치 시작 ▲●▼◆
echo.

:: ── 설치 경로 ──
set "INSTALL_DIR=%USERPROFILE%\.hanseonc"
set "BIN_DIR=%INSTALL_DIR%\bin"
set "STD_DIR=%INSTALL_DIR%\std"
set "EXAMPLES_DIR=%INSTALL_DIR%\examples"

:: ── Rust 확인 ──
where cargo >nul 2>&1
if errorlevel 1 (
    echo Rust가 없습니다.
    echo https://rustup.rs 에서 rustup-init.exe를 설치하세요.
    echo.
    echo 또는 PowerShell에서:
    echo   powershell -ExecutionPolicy Bypass -File install.ps1
    echo.
    pause
    exit /b 1
)

echo Rust:
rustc --version
echo.

:: ── 빌드 ──
echo 빌드 중...
cargo build --release
if not exist "target\release\crowny.exe" (
    echo 빌드 실패
    pause
    exit /b 1
)
echo 빌드 성공
echo.

:: ── 설치 ──
echo 설치 중: %INSTALL_DIR%
mkdir "%BIN_DIR%" 2>nul
mkdir "%STD_DIR%" 2>nul
mkdir "%EXAMPLES_DIR%" 2>nul

:: 바이너리
copy /y "target\release\crowny.exe" "%BIN_DIR%\hanseonc.exe" >nul
copy /y "target\release\crowny.exe" "%BIN_DIR%\crowny.exe" >nul

:: 표준라이브러리
copy /y "std\*.han" "%STD_DIR%\" >nul

:: 예제
copy /y "examples\*.han" "%EXAMPLES_DIR%\" >nul

:: ── PATH 안내 ──
echo.
echo ═══════════════════════════════════════
echo ▲●▼◆ 한선씨 설치 완료! ▲●▼◆
echo ═══════════════════════════════════════
echo.
echo   바이너리: %BIN_DIR%\hanseonc.exe
echo   표준라이브러리: %STD_DIR%\
echo   예제: %EXAMPLES_DIR%\
echo.
echo   사용법:
echo     hanseonc run 파일.han
echo     hanseonc repl
echo     hanseonc test
echo.
echo   PATH에 추가하려면:
echo     setx PATH "%%PATH%%;%BIN_DIR%"
echo.
pause
