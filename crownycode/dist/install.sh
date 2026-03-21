#!/usr/bin/env bash
# CrownyCode 설치 스크립트
# SD카드에서 실행: bash install.sh
set -e

INSTALL_DIR="${HOME}/.crownycode"
BIN_DIR="${HOME}/.local/bin"

echo "╔════════════════════════════════════════╗"
echo "║  CrownyCode 설치                       ║"
echo "║  CrownyOS 네이티브 AI 코드 엔진       ║"
echo "╚════════════════════════════════════════╝"
echo ""

# 디렉토리 생성
mkdir -p "$INSTALL_DIR"
mkdir -p "$BIN_DIR"

# 바이너리 복사
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/crownycode" ]; then
    cp "$SCRIPT_DIR/crownycode" "$BIN_DIR/crownycode"
    chmod +x "$BIN_DIR/crownycode"
    echo "✓ 바이너리 설치: $BIN_DIR/crownycode"
else
    echo "✗ crownycode 바이너리를 찾을 수 없습니다"
    exit 1
fi

# 설정 파일 복사
if [ -f "$SCRIPT_DIR/crownycode.toml" ]; then
    cp "$SCRIPT_DIR/crownycode.toml" "$INSTALL_DIR/crownycode.toml"
    echo "✓ 설정 파일: $INSTALL_DIR/crownycode.toml"
fi

# 예제 복사
if [ -d "$SCRIPT_DIR/examples" ]; then
    cp -r "$SCRIPT_DIR/examples" "$INSTALL_DIR/examples"
    echo "✓ 예제 프로젝트: $INSTALL_DIR/examples/"
fi

# 문서 복사
if [ -d "$SCRIPT_DIR/docs" ]; then
    cp -r "$SCRIPT_DIR/docs" "$INSTALL_DIR/docs"
    echo "✓ 문서: $INSTALL_DIR/docs/"
fi

# PATH 등록
SHELL_RC=""
if [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.profile" ]; then
    SHELL_RC="$HOME/.profile"
fi

if [ -n "$SHELL_RC" ]; then
    if ! grep -q "/.local/bin" "$SHELL_RC" 2>/dev/null; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
        echo "✓ PATH 등록: $SHELL_RC"
    fi
fi

echo ""
echo "설치 완료!"
echo ""
echo "시작하기:"
echo "  source $SHELL_RC  (또는 새 터미널 열기)"
echo "  crownycode gen \"HTTP 서버 만들어줘\" -t rust"
echo "  crownycode gen \"tengeneza seva ya wavuti\" -t python"
echo "  crownycode intents"
echo ""
echo "예제 보기:"
echo "  ls $INSTALL_DIR/examples/"
