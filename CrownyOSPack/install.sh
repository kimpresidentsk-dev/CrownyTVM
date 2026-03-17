#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# 한선씨(HanSeon-C) 설치 스크립트 — macOS / Linux
#
# 4상균형3진 ISA729 가상머신 + 한선씨 컴파일러
# ═══════════════════════════════════════════════════════════════

set -e

echo "▲●▼◆ 한선씨 설치 시작 ▲●▼◆"
echo ""

# ── 색상 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# ── 설치 경로 ──
INSTALL_DIR="$HOME/.한선씨"
BIN_DIR="$INSTALL_DIR/bin"
STD_DIR="$INSTALL_DIR/std"
EXAMPLES_DIR="$INSTALL_DIR/examples"

# ── OS 감지 ──
OS="$(uname -s)"
ARCH="$(uname -m)"
echo "시스템: $OS $ARCH"

# ── Rust 확인 ──
if ! command -v cargo &> /dev/null; then
    echo ""
    echo -e "${BLUE}Rust가 없습니다. 설치합니다...${NC}"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

echo "Rust: $(rustc --version 2>/dev/null || echo '설치중')"
echo ""

# ── 빌드 ──
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}빌드 중...${NC}"
cargo build --release 2>&1 | tail -3

if [ ! -f "target/release/crowny" ]; then
    echo -e "${RED}빌드 실패${NC}"
    exit 1
fi

echo -e "${GREEN}빌드 성공${NC}"
echo ""

# ── 설치 ──
echo -e "${BLUE}설치 중: $INSTALL_DIR${NC}"

mkdir -p "$BIN_DIR" "$STD_DIR" "$EXAMPLES_DIR"

# 바이너리
cp target/release/crowny "$BIN_DIR/한선씨"
chmod +x "$BIN_DIR/한선씨"

# 호환 심볼릭 링크
ln -sf "$BIN_DIR/한선씨" "$BIN_DIR/crowny"
ln -sf "$BIN_DIR/한선씨" "$BIN_DIR/hanseonc"

# 표준라이브러리
cp std/*.han "$STD_DIR/"

# 예제
cp examples/*.han "$EXAMPLES_DIR/"

echo ""

# ── PATH 설정 ──
SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then
    SHELL_RC="$HOME/.bash_profile"
fi

if [ -n "$SHELL_RC" ]; then
    if ! grep -q '한선씨' "$SHELL_RC" 2>/dev/null; then
        echo "" >> "$SHELL_RC"
        echo "# 한선씨 (HanSeon-C) — 4상균형3진 프로그래밍 언어" >> "$SHELL_RC"
        echo "export PATH=\"\$HOME/.한선씨/bin:\$PATH\"" >> "$SHELL_RC"
        echo "export HANSEONC_STD=\"\$HOME/.한선씨/std\"" >> "$SHELL_RC"
        echo -e "${GREEN}PATH 추가: $SHELL_RC${NC}"
    else
        echo "PATH 이미 설정됨"
    fi
fi

# ── 확인 ──
echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}▲●▼◆ 한선씨 설치 완료! ▲●▼◆${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
echo "  바이너리: $BIN_DIR/한선씨"
echo "  표준라이브러리: $STD_DIR/ ($(ls "$STD_DIR"/*.han | wc -l | tr -d ' ')개)"
echo "  예제: $EXAMPLES_DIR/"
echo ""
echo "  사용법:"
echo "    한선씨 run 파일.han     # 실행"
echo "    한선씨 repl             # 대화형"
echo "    한선씨 test             # 시험"
echo ""
echo "  예제 실행:"
echo "    한선씨 run ~/.한선씨/examples/hello.han"
echo ""
echo "  ※ 터미널을 다시 열거나 다음 명령을 실행하세요:"
echo "    source $SHELL_RC"
