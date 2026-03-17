#!/bin/bash
# 한선씨 제거 스크립트
set -e

INSTALL_DIR="$HOME/.한선씨"

if [ -d "$INSTALL_DIR" ]; then
    echo "한선씨 제거: $INSTALL_DIR"
    rm -rf "$INSTALL_DIR"
    echo "제거 완료"
    echo ""
    echo "※ .zshrc 또는 .bashrc에서 한선씨 PATH 줄을 수동으로 제거하세요."
else
    echo "한선씨가 설치되어 있지 않습니다."
fi
