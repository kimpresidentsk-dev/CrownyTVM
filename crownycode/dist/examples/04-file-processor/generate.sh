#!/usr/bin/env bash
crownycode gen "파일 읽어서 JSON 파싱" -t python -o processor.py
crownycode gen "파일 읽어서 JSON 파싱" -t rust -o processor.rs
echo "생성 완료! processor.py, processor.rs 확인"
