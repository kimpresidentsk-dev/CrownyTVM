#!/usr/bin/env bash
crownycode gen "CLI 도구 만들어줘" -t rust -o cli.rs
crownycode gen "CLI 도구 만들어줘" -t python -o cli.py
echo "생성 완료! cli.rs, cli.py 확인"
