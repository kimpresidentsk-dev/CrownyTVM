# ═══════════════════════════════════════════════════════════════
# 크라우니OS 부트스트랩 — RISC-V 64비트 베어메탈
#
# QEMU virt 머신:
#   RAM: 0x80000000
#   UART: 0x10000000
# ═══════════════════════════════════════════════════════════════

.section .text.boot
.global _start

_start:
    # 스택 설정 (RAM 상단 64KB)
    la      sp, _stack_top

    # BSS 초기화 (0으로)
    la      t0, _bss_start
    la      t1, _bss_end
bss_clear:
    bge     t0, t1, bss_done
    sd      zero, 0(t0)
    addi    t0, t0, 8
    j       bss_clear
bss_done:

    # C 커널 진입
    call    kernel_main

    # 커널이 반환하면 무한루프
halt:
    wfi
    j       halt
