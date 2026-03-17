#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CrownyTVM + CrownyOS nginx 설정 스크립트
#
# 실행 전 필수:
#   1. hosting.kr NS 복원: ns1~4.hosting.co.kr
#   2. hosting.kr DNS:
#      crowny.org     A  112.144.147.144
#      crownybus.com  A  112.144.147.144
#   3. 공유기 포트포워딩:
#      443 → 192.168.219.165:8443  (nginx HTTPS)
#      80  → 192.168.219.165:8080  (nginx HTTP, ACME용)
# ═══════════════════════════════════════════════════════════════

set -e
echo "▲●▼◆ Crowny nginx 설정"

# 1. nginx 설치 확인
if ! command -v nginx &>/dev/null; then
    echo "  nginx 설치 중..."
    brew install nginx
fi

# 2. certbot 설치 확인
if ! command -v certbot &>/dev/null; then
    echo "  certbot 설치 중..."
    brew install certbot
fi

# 3. 디렉토리 생성
mkdir -p /opt/homebrew/var/log/nginx
mkdir -p /opt/homebrew/var/run
mkdir -p /opt/homebrew/var/www/letsencrypt

# 4. 설정 복사
cp "$(dirname "$0")/nginx-crowny.conf" /opt/homebrew/etc/nginx/nginx.conf
echo "  nginx 설정 복사 완료"

# 5. 설정 검증
nginx -t
echo "  설정 검증 OK"

# 6. nginx 시작/재시작
nginx -s reload 2>/dev/null || nginx
echo "  nginx 시작됨 (8080/8443)"

# 7. SSL 인증서 발급 안내
echo ""
echo "═══════════════════════════════════════════════"
echo "  nginx 가동 완료!"
echo ""
echo "  다음 단계 (공유기 포트포워딩 변경 후 실행):"
echo ""
echo "  sudo certbot certonly --webroot \\"
echo "    -w /opt/homebrew/var/www/letsencrypt \\"
echo "    -d crownybus.com -d crowny.org"
echo ""
echo "  인증서 발급 후 nginx-crowny.conf의 ssl_certificate 경로를:"
echo "    /etc/letsencrypt/live/crownybus.com/fullchain.pem"
echo "    /etc/letsencrypt/live/crownybus.com/privkey.pem"
echo "  로 변경하고: nginx -s reload"
echo "═══════════════════════════════════════════════"
