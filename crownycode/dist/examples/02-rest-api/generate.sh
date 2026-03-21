#!/usr/bin/env bash
crownycode gen "CRUD REST API 만들어줘" -t rust -o api.rs
crownycode gen "CRUD REST API 만들어줘" -t python -o api.py
echo "생성 완료! api.rs, api.py 확인"
