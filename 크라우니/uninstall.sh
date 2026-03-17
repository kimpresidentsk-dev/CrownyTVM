#!/bin/bash
INSTALL_DIR="${CROWNY_HOME:-$HOME/.크라우니}"
echo "  크라우니 제거: ${INSTALL_DIR}"
rm -rf "${INSTALL_DIR}"
echo "  ▲ 제거 완료 (PATH는 수동으로 제거하세요)"
