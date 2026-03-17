/* ═══════════════════════════════════════════════════════════════
 * 하드웨어 제어 — 타이머 + 인터럽트
 *
 * RISC-V QEMU virt:
 *   CLINT 0x2000000 — 타이머/소프트웨어 인터럽트
 *   PLIC  0xC000000 — 외부 인터럽트 (UART, virtio 등)
 *
 * CLINT mtime:  0x200BFF8 (64비트 카운터, 10MHz)
 * CLINT mtimecmp: 0x2004000 (비교값, 이 값 도달 시 인터럽트)
 * ═══════════════════════════════════════════════════════════════ */

#ifndef HW_H
#define HW_H

#include <stdint.h>

/* CLINT 주소 */
#define CLINT_BASE      0x2000000UL
#define CLINT_MTIME     (CLINT_BASE + 0xBFF8)
#define CLINT_MTIMECMP  (CLINT_BASE + 0x4000)

/* PLIC 주소 */
#define PLIC_BASE       0x0C000000UL
#define PLIC_PRIORITY   (PLIC_BASE + 0x0)
#define PLIC_PENDING    (PLIC_BASE + 0x1000)
#define PLIC_ENABLE     (PLIC_BASE + 0x2000)
#define PLIC_THRESHOLD  (PLIC_BASE + 0x200000)
#define PLIC_CLAIM      (PLIC_BASE + 0x200004)

/* UART 인터럽트 번호 (QEMU virt) */
#define IRQ_UART0  10

/* 타이머 주기 (10MHz 기준, 100ms = 1000000 틱) */
#define TIMER_INTERVAL 1000000

/* ═══ 타이머 ═══ */

static volatile uint64_t system_ticks = 0;

static inline uint64_t hw_time(void) {
    return *(volatile uint64_t *)CLINT_MTIME;
}

static inline void hw_timer_set(uint64_t when) {
    *(volatile uint64_t *)CLINT_MTIMECMP = when;
}

static void hw_timer_init(void) {
    /* 첫 타이머 인터럽트 설정 */
    hw_timer_set(hw_time() + TIMER_INTERVAL);

    /* 머신 타이머 인터럽트 활성화 (MIE.MTIE) */
    uint64_t mie;
    __asm__ volatile ("csrr %0, mie" : "=r"(mie));
    mie |= (1 << 7);  /* MTIE */
    __asm__ volatile ("csrw mie, %0" :: "r"(mie));
}

/* ═══ PLIC ═══ */

static void hw_plic_init(void) {
    /* UART0 인터럽트 우선순위 설정 */
    *(volatile uint32_t *)(PLIC_PRIORITY + IRQ_UART0 * 4) = 1;

    /* UART0 인터럽트 활성화 (hart 0, M-mode) */
    *(volatile uint32_t *)PLIC_ENABLE |= (1 << IRQ_UART0);

    /* 임계값 0 (모든 인터럽트 수용) */
    *(volatile uint32_t *)PLIC_THRESHOLD = 0;

    /* 머신 외부 인터럽트 활성화 (MIE.MEIE) */
    uint64_t mie;
    __asm__ volatile ("csrr %0, mie" : "=r"(mie));
    mie |= (1 << 11);  /* MEIE */
    __asm__ volatile ("csrw mie, %0" :: "r"(mie));
}

/* ═══ 인터럽트 핸들러 ═══ */

/* 전역 인터럽트 활성화 */
static inline void hw_enable_interrupts(void) {
    uint64_t mstatus;
    __asm__ volatile ("csrr %0, mstatus" : "=r"(mstatus));
    mstatus |= (1 << 3);  /* MIE */
    __asm__ volatile ("csrw mstatus, %0" :: "r"(mstatus));
}

static inline void hw_disable_interrupts(void) {
    uint64_t mstatus;
    __asm__ volatile ("csrr %0, mstatus" : "=r"(mstatus));
    mstatus &= ~(1UL << 3);
    __asm__ volatile ("csrw mstatus, %0" :: "r"(mstatus));
}

/* 타이머 인터럽트 처리 */
static void hw_handle_timer(void) {
    system_ticks++;
    /* 다음 타이머 설정 */
    hw_timer_set(hw_time() + TIMER_INTERVAL);
}

/* 외부 인터럽트 처리 (PLIC) */
static void hw_handle_external(void) {
    uint32_t irq = *(volatile uint32_t *)PLIC_CLAIM;
    if (irq == IRQ_UART0) {
        /* UART 인터럽트 → 셸에서 처리 */
    }
    /* 인터럽트 완료 통보 */
    if (irq) *(volatile uint32_t *)PLIC_CLAIM = irq;
}

/* ═══ 편의 함수 ═══ */

/* 시스템 가동 시간 (초) */
static inline uint64_t hw_uptime_sec(void) {
    return system_ticks / 10;  /* 100ms × 10 = 1초 */
}

/* 밀리초 대기 */
static void hw_delay_ms(int ms) {
    uint64_t target = hw_time() + (uint64_t)ms * 10000;
    while (hw_time() < target) {
        __asm__ volatile ("nop");
    }
}

/* 하드웨어 초기화 */
static void hw_init(void) {
    hw_timer_init();
    hw_plic_init();
    /* 아직 인터럽트는 활성화하지 않음 (셸이 폴링 방식) */
}

#endif
