#!/usr/bin/env bash
crownycode gen "인증하는 API 서버" -t rust -o auth_api.rs
crownycode gen "인증하는 API 서버" -t python -o auth_api.py
echo "생성 완료! auth_api.rs, auth_api.py 확인"
