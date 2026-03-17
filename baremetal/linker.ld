/* ═══════════════════════════════════════════════════════════════
 * 크라우니OS 링커 스크립트 — RISC-V 64비트 베어메탈
 *
 * QEMU virt: RAM 0x80000000
 * ═══════════════════════════════════════════════════════════════ */

OUTPUT_ARCH(riscv)
ENTRY(_start)

MEMORY
{
    RAM (rwx) : ORIGIN = 0x80000000, LENGTH = 128M
}

SECTIONS
{
    . = 0x80000000;

    .text : {
        *(.text.boot)     /* 부트 엔트리 (start.S) */
        *(.text .text.*)
    } > RAM

    .rodata : {
        *(.rodata .rodata.*)
    } > RAM

    .data : {
        *(.data .data.*)
    } > RAM

    . = ALIGN(8);
    _bss_start = .;
    .bss : {
        *(.bss .bss.*)
        *(COMMON)
    } > RAM
    _bss_end = .;

    . = ALIGN(16);
    . = . + 0x10000;      /* 64KB 스택 */
    _stack_top = .;
}
