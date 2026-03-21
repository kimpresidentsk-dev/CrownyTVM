# CLI 도구 / CLI Tool / Chombo cha CLI

## 생성 방법 / How to generate / Jinsi ya kutengeneza
```bash
crownycode gen "CLI 도구 만들어줘" -t rust -o cli.rs
crownycode gen "create a CLI tool" -t python -o cli.py
crownycode gen "tengeneza chombo cha CLI" -t rust -o cli.rs
```

## 실행 / Run / Endesha
```bash
# Python
python3 cli.py --help

# Rust
rustc cli.rs -o cli && ./cli --help
```
