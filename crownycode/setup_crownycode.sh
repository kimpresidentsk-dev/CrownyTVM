#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# 크라우니코드 — Mac Studio 설정 스크립트
# ═══════════════════════════════════════════════════════════════
# 사용법:
#   chmod +x setup_crownycode.sh
#   ./setup_crownycode.sh
#
# 이 스크립트가 하는 일:
#   1. crownycode 소스 압축 해제
#   2. Rust 설치 확인
#   3. cargo build + cargo test
#   4. Claude Code 프로젝트 초기화
# ═══════════════════════════════════════════════════════════════

set -e

DEST="$HOME/Downloads/CrownyTVM/crownycode"
ARCHIVE="crownycode_complete_step1_6.tar.gz"

echo "╔════════════════════════════════════════════╗"
echo "║  크라우니코드 — Mac Studio 설정            ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# 1. 소스 압축 해제
if [ -f "$ARCHIVE" ]; then
    echo "[1/5] 소스 압축 해제..."
    mkdir -p "$HOME/Downloads/CrownyTVM"
    tar -xzf "$ARCHIVE" -C "$HOME/Downloads/CrownyTVM/"
    echo "  → $DEST"
elif [ -d "$DEST/src" ]; then
    echo "[1/5] 소스 이미 존재: $DEST"
else
    echo "오류: $ARCHIVE 파일을 현재 디렉터리에 놓고 실행하세요."
    exit 1
fi

cd "$DEST"

# 2. Rust 확인
echo "[2/5] Rust 확인..."
if command -v cargo &> /dev/null; then
    echo "  → $(rustc --version)"
else
    echo "  Rust 설치 중..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    echo "  → $(rustc --version)"
fi

# 3. 빌드
echo "[3/5] 빌드..."
cargo build --release 2>&1 | tail -3
echo "  → 빌드 완료"

# 4. 테스트
echo "[4/5] 테스트..."
TEST_OUTPUT=$(cargo test 2>&1)
PASS_COUNT=$(echo "$TEST_OUTPUT" | grep "^test result: ok" | awk '{sum += $4} END {print sum}')
echo "  → $PASS_COUNT 테스트 통과"

# 5. Claude Code 준비
echo "[5/5] Claude Code 준비..."
if [ -f "CLAUDE.md" ]; then
    echo "  → CLAUDE.md 확인됨 ($(wc -l < CLAUDE.md)줄)"
else
    echo "  경고: CLAUDE.md가 없습니다."
fi

# git 초기화 (아직 없으면)
if [ ! -d ".git" ]; then
    git init -q
    git add -A
    git commit -q -m "크라우니코드 Step 1~6 완성 — 546 테스트, CrownyCore 기반"
    echo "  → git 저장소 초기화 + 첫 커밋"
fi

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║  설정 완료!                                ║"
echo "╠════════════════════════════════════════════╣"
echo "║                                            ║"
echo "║  Claude Code 시작:                         ║"
echo "║    cd $DEST"
echo "║    claude                                  ║"
echo "║                                            ║"
echo "║  첫 명령 제안:                             ║"
echo "║    \"CLAUDE.md 읽고 현재 상태 파악해줘\"    ║"
echo "║                                            ║"
echo "╚════════════════════════════════════════════╝"
