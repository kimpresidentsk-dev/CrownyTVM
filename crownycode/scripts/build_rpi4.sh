#!/usr/bin/env bash
# crownycode/scripts/build_rpi4.sh
# RPi4 (aarch64) 크로스 컴파일 스크립트
#
# 사전 요건 (Ubuntu/Debian):
#   sudo apt-get install gcc-aarch64-linux-gnu
#   rustup target add aarch64-unknown-linux-gnu
#
# 사전 요건 (macOS):
#   brew install aarch64-elf-gcc
#   rustup target add aarch64-unknown-linux-gnu

set -euo pipefail

TARGET="aarch64-unknown-linux-gnu"
PROFILE="release-rpi4"
OUTPUT_DIR="dist/rpi4"

echo "=== 크라우니코드 RPi4 빌드 ==="
echo "  타겟: ${TARGET}"
echo "  프로파일: ${PROFILE}"
echo ""

# 타겟 툴체인 확인
if ! rustup target list --installed | grep -q "${TARGET}"; then
    echo "타겟 추가 중..."
    rustup target add "${TARGET}"
fi

# 크로스 컴파일
echo "컴파일 중..."
cargo build \
    --target "${TARGET}" \
    --profile "${PROFILE}" \
    2>&1

# 바이너리 복사
mkdir -p "${OUTPUT_DIR}"
cp "target/${TARGET}/${PROFILE}/crownycode" "${OUTPUT_DIR}/crownycode"
cp "crownycode.toml" "${OUTPUT_DIR}/crownycode.toml"

# low_power 모드 자동 활성화
python3 - << 'PYEOF'
import re
with open("dist/rpi4/crownycode.toml") as f:
    content = f.read()
content = content.replace("low_power = false", "low_power = true")
with open("dist/rpi4/crownycode.toml", "w") as f:
    f.write(content)
print("  low_power = true 설정 완료")
PYEOF

# 바이너리 크기 출력
SIZE=$(wc -c < "${OUTPUT_DIR}/crownycode")
SIZE_KB=$((SIZE / 1024))
echo ""
echo "=== 빌드 완료 ==="
echo "  출력: ${OUTPUT_DIR}/crownycode"
echo "  크기: ${SIZE_KB} KB"
echo ""
echo "RPi4에 배포:"
echo "  scp -r ${OUTPUT_DIR}/ pi@<RPi4-IP>:~/crownycode/"
echo "  ssh pi@<RPi4-IP> 'chmod +x ~/crownycode/crownycode'"
