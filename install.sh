#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# 크라우니 설치기 — 4세대 온톨로직 균형3진 체계
# 
# 사용법:
#   tar xzf 크라우니-v0.3.1.tar.gz
#   cd 크라우니
#   ./install.sh
#
# 또는 한 줄 설치 (tar.gz가 있는 경우):
#   bash install.sh
# ═══════════════════════════════════════════════════════════════

set -e

VERSION="0.3.1"
INSTALL_DIR="${CROWNY_HOME:-$HOME/.크라우니}"
BIN_DIR="${INSTALL_DIR}/bin"

echo ""
echo "  ▲●▼◆ 크라우니 v${VERSION} 설치기 ▲●▼◆"
echo "  4세대 온톨로직 균형3진 체계"
echo ""

# ═══ 1. Rust 확인/설치 ═══
if ! command -v cargo &> /dev/null; then
    echo "  ● Rust가 없습니다. 설치합니다..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    echo "  ▲ Rust 설치 완료"
else
    echo "  ▲ Rust 확인: $(rustc --version)"
fi

# ═══ 2. 빌드 ═══
echo ""
echo "  ● 빌드 중..."

# 현재 디렉토리에 Cargo.toml이 있는지 확인
if [ ! -f "Cargo.toml" ]; then
    echo "  ▼ Cargo.toml이 없습니다."
    echo "    크라우니 소스 디렉토리에서 실행해주세요."
    exit 1
fi

cargo build --release 2>&1 | tail -1
echo "  ▲ 빌드 완료"

# ═══ 3. 설치 ═══
echo ""
echo "  ● 설치 중... → ${INSTALL_DIR}"

mkdir -p "${BIN_DIR}"
mkdir -p "${INSTALL_DIR}/체계"
mkdir -p "${INSTALL_DIR}/자체"
mkdir -p "${INSTALL_DIR}/예제"

# 바이너리 복사
cp target/release/크라우니 "${BIN_DIR}/크라우니" 2>/dev/null || \
cp target/debug/크라우니 "${BIN_DIR}/크라우니"
chmod +x "${BIN_DIR}/크라우니"

# 한선씨 파일 복사
cp -r 체계/*.한선씨 "${INSTALL_DIR}/체계/" 2>/dev/null || true
cp -r 자체/*.한선씨 "${INSTALL_DIR}/자체/" 2>/dev/null || true
cp -r 예제/*.한선씨 "${INSTALL_DIR}/예제/" 2>/dev/null || true

echo "  ▲ 파일 설치 완료"

# ═══ 4. PATH 설정 ═══
SHELL_RC=""
if [ -n "$ZSH_VERSION" ] || [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then
    SHELL_RC="$HOME/.bash_profile"
fi

PATH_LINE="export PATH=\"${BIN_DIR}:\$PATH\""
CROWNY_LINE="export CROWNY_HOME=\"${INSTALL_DIR}\""

if [ -n "$SHELL_RC" ]; then
    if ! grep -q "CROWNY_HOME" "$SHELL_RC" 2>/dev/null; then
        echo "" >> "$SHELL_RC"
        echo "# 크라우니 OS" >> "$SHELL_RC"
        echo "$CROWNY_LINE" >> "$SHELL_RC"
        echo "$PATH_LINE" >> "$SHELL_RC"
        echo "  ▲ PATH 추가: ${SHELL_RC}"
    else
        echo "  ● PATH 이미 설정됨"
    fi
fi

# ═══ 5. 확인 ═══
echo ""
export PATH="${BIN_DIR}:$PATH"
echo "  ═══ 설치 완료 ═══"
echo ""
echo "  설치 경로: ${INSTALL_DIR}"
echo "  바이너리:  ${BIN_DIR}/크라우니"
echo "  버전:      $("${BIN_DIR}/크라우니" 시험 2>&1 | head -1 || echo "v${VERSION}")"
echo ""
echo "  사용법:"
echo "    크라우니                    — 시험 실행"
echo "    크라우니 대화               — REPL (대화형 쉘)"
echo "    크라우니 체계/쉘.한선씨     — OS 터미널"
echo "    크라우니 예제/거래분석.한선씨 — 예제 실행"
echo ""
echo "  새 터미널을 열거나 아래를 실행하세요:"
echo "    source ${SHELL_RC:-~/.bashrc}"
echo ""
echo "  ▲●▼◆ 크라우니에 오신 것을 환영합니다!"
echo ""
