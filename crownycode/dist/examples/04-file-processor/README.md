# 파일 처리기 / File Processor / Kichakataji cha Faili

## 생성 방법 / How to generate / Jinsi ya kutengeneza
```bash
crownycode gen "파일 읽어서 JSON 파싱" -t python -o processor.py
crownycode gen "read file and parse JSON" -t rust -o processor.rs
crownycode gen "soma faili na kuchambua JSON" -t python -o processor.py
```

## 실행 / Run / Endesha
```bash
# Python
python3 processor.py data.json

# Rust
rustc processor.rs -o processor && ./processor data.json
```
