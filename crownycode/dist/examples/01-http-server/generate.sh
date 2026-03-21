#!/usr/bin/env bash
crownycode gen "HTTP 서버 만들어줘" -t rust -o server.rs
crownycode gen "HTTP 서버 만들어줘" -t python -o server.py
echo "생성 완료! server.rs, server.py 확인"
