# 인증 API / Auth API / API ya Uthibitishaji

## 생성 방법 / How to generate / Jinsi ya kutengeneza
```bash
crownycode gen "인증하는 API 서버" -t rust -o auth_api.rs
crownycode gen "create an auth API server" -t python -o auth_api.py
crownycode gen "tengeneza seva ya API yenye uthibitishaji" -t rust -o auth_api.rs
```

## 실행 / Run / Endesha
```bash
# Python
pip install flask pyjwt
python3 auth_api.py

# Rust
cargo run
```
