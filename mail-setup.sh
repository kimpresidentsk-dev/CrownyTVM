#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CrownyOS 메일서버 설정 — crowny.org @ Mac Studio
#
# Postfix (SMTP) + Dovecot (IMAP)
# 회원가입 시 자동 메일박스 생성
#
# 사전 요구:
#   1. crowny.org 도메인 소유 + DNS 접근
#   2. 공인 IP (또는 포트포워딩 25/587/993)
#   3. Let's Encrypt 인증서 (또는 자체 서명)
#
# 사용법: sudo bash mail-setup.sh
# ═══════════════════════════════════════════════════════════════

DOMAIN="crowny.org"
MAIL_DIR="/var/mail/vhosts/$DOMAIN"

echo "▲●▼◆ CrownyOS 메일서버 설정"
echo "  도메인: $DOMAIN"
echo ""

# ═══ DNS 설정 가이드 ═══
cat << 'EOF'
══════ DNS 설정 (필수) ══════

도메인 관리 패널에서 아래 레코드 추가:

  MX     crowny.org           10  mail.crowny.org
  A      mail.crowny.org      [Mac Studio 공인 IP]
  TXT    crowny.org           "v=spf1 a mx ip4:[IP] -all"
  TXT    _dmarc.crowny.org    "v=DMARC1; p=quarantine; rua=mailto:admin@crowny.org"

DKIM은 설치 후 생성합니다.
══════════════════════════════
EOF

# ═══ 패키지 설치 ═══
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "[macOS] Homebrew 설치..."
    brew install postfix dovecot 2>/dev/null || true
    POSTFIX_DIR="/usr/local/etc/postfix"
    DOVECOT_DIR="/usr/local/etc/dovecot"
else
    echo "[Linux] apt 설치..."
    apt update -qq && apt install -y postfix dovecot-imapd dovecot-pop3d
    POSTFIX_DIR="/etc/postfix"
    DOVECOT_DIR="/etc/dovecot"
fi

# ═══ 메일 디렉토리 ═══
mkdir -p "$MAIL_DIR"
groupadd -g 5000 vmail 2>/dev/null || true
useradd -u 5000 -g 5000 -s /usr/sbin/nologin -d "$MAIL_DIR" vmail 2>/dev/null || true
chown -R vmail:vmail "$MAIL_DIR"

# ═══ Postfix main.cf ═══
cat > "$POSTFIX_DIR/main.cf" << POSTFIX
myhostname = mail.$DOMAIN
mydomain = $DOMAIN
myorigin = \$mydomain
inet_interfaces = all
mydestination = localhost

# 가상 메일박스
virtual_mailbox_domains = $DOMAIN
virtual_mailbox_base = $MAIL_DIR
virtual_mailbox_maps = hash:$POSTFIX_DIR/vmailbox
virtual_uid_maps = static:5000
virtual_gid_maps = static:5000

# TLS
smtpd_use_tls = yes
smtpd_tls_auth_only = yes
smtpd_tls_cert_file = /etc/letsencrypt/live/$DOMAIN/fullchain.pem
smtpd_tls_key_file = /etc/letsencrypt/live/$DOMAIN/privkey.pem

# SASL (Dovecot 연동)
smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_sasl_auth_enable = yes
smtpd_recipient_restrictions = permit_sasl_authenticated, reject_unauth_destination

message_size_limit = 10485760
POSTFIX

# 빈 vmailbox + admin 계정
echo "admin@$DOMAIN  $DOMAIN/admin/" > "$POSTFIX_DIR/vmailbox"
postmap "$POSTFIX_DIR/vmailbox" 2>/dev/null || true

# ═══ Dovecot ═══
cat > "$DOVECOT_DIR/dovecot.conf" << DOVECOT
protocols = imap
mail_location = maildir:$MAIL_DIR/%d/%n
auth_mechanisms = plain login

passdb { driver = passwd-file; args = $DOVECOT_DIR/users }
userdb { driver = static; args = uid=5000 gid=5000 home=$MAIL_DIR/%d/%n }

service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0660; user = postfix; group = postfix
  }
}

ssl = required
ssl_cert = </etc/letsencrypt/live/$DOMAIN/fullchain.pem
ssl_key = </etc/letsencrypt/live/$DOMAIN/privkey.pem
DOVECOT

touch "$DOVECOT_DIR/users"

# ═══ 계정 생성 스크립트 ═══
cat > /usr/local/bin/crowny-mailbox << 'SCRIPT'
#!/bin/bash
# crowny-mailbox create <username> <password>
# crowny-mailbox delete <username>
DOMAIN="crowny.org"
ACTION="$1"; USER="$2"; PASS="$3"

case "$ACTION" in
create)
    [ -z "$USER" ] || [ -z "$PASS" ] && { echo "사용법: crowny-mailbox create <user> <pass>"; exit 1; }
    EMAIL="${USER}@${DOMAIN}"
    HASH=$(doveadm pw -s SHA512-CRYPT -p "$PASS" 2>/dev/null || echo "{SHA512-CRYPT}placeholder")
    echo "${EMAIL}:${HASH}" >> /etc/dovecot/users 2>/dev/null || echo "${EMAIL}:${HASH}" >> /usr/local/etc/dovecot/users
    echo "${EMAIL}  ${DOMAIN}/${USER}/" >> /etc/postfix/vmailbox 2>/dev/null || echo "${EMAIL}  ${DOMAIN}/${USER}/" >> /usr/local/etc/postfix/vmailbox
    postmap /etc/postfix/vmailbox 2>/dev/null || postmap /usr/local/etc/postfix/vmailbox 2>/dev/null
    mkdir -p "/var/mail/vhosts/${DOMAIN}/${USER}"
    chown -R 5000:5000 "/var/mail/vhosts/${DOMAIN}/${USER}"
    echo "✓ ${EMAIL} 메일박스 생성"
    ;;
delete)
    [ -z "$USER" ] && { echo "사용법: crowny-mailbox delete <user>"; exit 1; }
    EMAIL="${USER}@${DOMAIN}"
    sed -i.bak "/${EMAIL}/d" /etc/dovecot/users 2>/dev/null || sed -i.bak "/${EMAIL}/d" /usr/local/etc/dovecot/users
    sed -i.bak "/${EMAIL}/d" /etc/postfix/vmailbox 2>/dev/null || sed -i.bak "/${EMAIL}/d" /usr/local/etc/postfix/vmailbox
    postmap /etc/postfix/vmailbox 2>/dev/null || postmap /usr/local/etc/postfix/vmailbox 2>/dev/null
    echo "✓ ${EMAIL} 메일박스 삭제"
    ;;
*)
    echo "crowny-mailbox create|delete <username> [password]"
    ;;
esac
SCRIPT
chmod +x /usr/local/bin/crowny-mailbox

echo ""
echo "═══════════════════════════════════"
echo "✓ 메일서버 설정 완료"
echo ""
echo "  시작:"
echo "    sudo postfix start"
echo "    sudo dovecot"
echo ""
echo "  계정 생성:"
echo "    crowny-mailbox create hong mypassword"
echo "    → hong@crowny.org 사용 가능"
echo ""
echo "  TLS 인증서 (Let's Encrypt):"
echo "    certbot certonly --standalone -d mail.$DOMAIN"
echo ""
echo "  테스트:"
echo "    echo 'test' | mail -s 'Test' admin@$DOMAIN"
echo "═══════════════════════════════════"
