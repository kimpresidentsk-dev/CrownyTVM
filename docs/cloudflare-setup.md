# Cloudflare CDN Setup Guide for crowny.org

## 1. Cloudflare 가입 + 사이트 추가
- https://dash.cloudflare.com 에서 crowny.org 추가
- Free 플랜 선택

## 2. DNS 레코드 이전
Cloudflare가 기존 레코드를 자동 스캔함. 확인할 것:
```
A     crowny.org       112.144.147.144   (Proxied ☁️)
A     www.crowny.org   112.144.147.144   (Proxied ☁️)
CNAME crownybus.com    crowny.org        (Proxied ☁️)
```

## 3. 네임서버 변경
hosting.co.kr 관리 패널에서 네임서버를 Cloudflare가 제공하는 값으로 변경:
```
예시: aria.ns.cloudflare.com / bruce.ns.cloudflare.com
```
전파 시간: 최대 24시간 (보통 1-2시간)

## 4. SSL 설정
- Cloudflare SSL → **Full (strict)** 선택
- 기존 Let's Encrypt 인증서 그대로 사용 가능
- Edge Certificate: Cloudflare 자동 발급 (무료)

## 5. 성능 설정 (무료 티어)
- **Auto Minify**: JS, CSS, HTML 전부 켜기
- **Brotli**: 켜기 (gzip보다 20% 더 작음)
- **Caching Level**: Standard
- **Browser Cache TTL**: Respect Existing Headers (서버 캐시 헤더 사용)
- **Always Online**: 켜기 (서버 다운 시 캐시된 페이지 제공)
- **Rocket Loader**: 끄기 (defer 이미 적용됨)

## 6. 보안 설정
- **Security Level**: Medium
- **Bot Fight Mode**: 켜기
- **Under Attack Mode**: 필요시 수동 활성화

## 7. nginx 변경사항
Cloudflare 프록시 사용 시 실제 IP 확인을 위해 nginx에 추가:
```nginx
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
real_ip_header CF-Connecting-IP;
```

## 예상 효과
- 아프리카/동남아 응답시간: 2-5초 → 200-500ms
- DDoS 방어 자동 적용
- 정적 파일 글로벌 캐싱 (bundle.css, JS, 이미지)
- 대역폭 50-70% 절감
