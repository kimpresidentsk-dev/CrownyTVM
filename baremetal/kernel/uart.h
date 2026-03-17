/* ═══════════════════════════════════════════════════════════════
 * UART 드라이버 — QEMU virt 16550A 호환
 *
 * MMIO 기반: 0x10000000
 * ═══════════════════════════════════════════════════════════════ */

#ifndef UART_H
#define UART_H

#include <stdint.h>

#define UART_BASE 0x10000000UL

/* 레지스터 오프셋 */
#define UART_THR  0  /* 송신 */
#define UART_RBR  0  /* 수신 */
#define UART_IER  1  /* 인터럽트 활성화 */
#define UART_FCR  2  /* FIFO 제어 */
#define UART_LCR  3  /* 라인 제어 */
#define UART_LSR  5  /* 라인 상태 */

#define UART_LSR_TX_EMPTY 0x20
#define UART_LSR_RX_READY 0x01

static inline void uart_write(int reg, uint8_t val) {
    *(volatile uint8_t *)(UART_BASE + reg) = val;
}

static inline uint8_t uart_read(int reg) {
    return *(volatile uint8_t *)(UART_BASE + reg);
}

static void uart_init(void) {
    uart_write(UART_IER, 0x00);  /* 인터럽트 비활성화 */
    uart_write(UART_LCR, 0x80);  /* DLAB 설정 */
    uart_write(0, 0x01);         /* 115200 baud (divisor low) */
    uart_write(1, 0x00);         /* divisor high */
    uart_write(UART_LCR, 0x03);  /* 8비트, 패리티 없음 */
    uart_write(UART_FCR, 0x07);  /* FIFO 활성화+리셋 */
}

static void uart_putc(char c) {
    while ((uart_read(UART_LSR) & UART_LSR_TX_EMPTY) == 0);
    uart_write(UART_THR, c);
}

static void uart_puts(const char *s) {
    while (*s) {
        if (*s == '\n') uart_putc('\r');
        uart_putc(*s++);
    }
}

static int uart_getc(void) {
    while ((uart_read(UART_LSR) & UART_LSR_RX_READY) == 0);
    return uart_read(UART_RBR);
}

/* 정수 출력 */
static void uart_putd(int64_t v) {
    if (v < 0) { uart_putc('-'); v = -v; }
    if (v == 0) { uart_putc('0'); return; }
    char buf[20];
    int i = 0;
    while (v > 0) { buf[i++] = '0' + (v % 10); v /= 10; }
    while (i > 0) uart_putc(buf[--i]);
}

/* 16진수 출력 */
static void uart_puthex(uint64_t v) {
    uart_puts("0x");
    for (int i = 60; i >= 0; i -= 4) {
        int d = (v >> i) & 0xF;
        uart_putc(d < 10 ? '0' + d : 'a' + d - 10);
    }
}

/* 줄 읽기 (에코 포함) */
static void uart_gets(char *buf, int max) {
    int i = 0;
    while (i < max - 1) {
        int c = uart_getc();
        if (c == '\r' || c == '\n') {
            uart_putc('\r');
            uart_putc('\n');
            break;
        }
        if (c == 0x7F || c == 0x08) {  /* 백스페이스 */
            if (i > 0) {
                i--;
                uart_puts("\b \b");
            }
            continue;
        }
        if (c >= 0x20) {
            buf[i++] = c;
            uart_putc(c);
        }
    }
    buf[i] = '\0';
}

#endif
