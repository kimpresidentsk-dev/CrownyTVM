/* ═══════════════════════════════════════════════════════════════
 * GUI — QEMU ramfb 프레임버퍼
 *
 * QEMU fw_cfg 인터페이스로 ramfb 장치 설정
 * 640×480, 32bpp (XRGB8888)
 * ═══════════════════════════════════════════════════════════════ */

#ifndef GUI_H
#define GUI_H

#include <stdint.h>

/* fw_cfg MMIO (QEMU virt) */
#define FWCFG_BASE    0x10100000UL
#define FWCFG_DATA    (FWCFG_BASE + 0x000)
#define FWCFG_SEL     (FWCFG_BASE + 0x008)
#define FWCFG_DMA     (FWCFG_BASE + 0x010)

#define FB_WIDTH  640
#define FB_HEIGHT 480
#define FB_BPP    4
#define FB_SIZE   (FB_WIDTH * FB_HEIGHT * FB_BPP)

/* 프레임버퍼 메모리 (BSS에 배치) */
static uint32_t framebuffer[FB_WIDTH * FB_HEIGHT] __attribute__((aligned(4096)));
static int fb_ready = 0;

/* 바이트 순서 변환 (빅엔디안) */
static inline uint32_t be32(uint32_t v) {
    return ((v >> 24) & 0xFF) | ((v >> 8) & 0xFF00) |
           ((v << 8) & 0xFF0000) | ((v << 24) & 0xFF000000u);
}
static inline uint64_t be64(uint64_t v) {
    return ((uint64_t)be32(v) << 32) | be32(v >> 32);
}

/* fw_cfg DMA 전송 */
struct fwcfg_dma {
    uint32_t control;
    uint32_t length;
    uint64_t address;
} __attribute__((packed));

static int gui_init(void) {
    /* fw_cfg 존재 확인 */
    *(volatile uint16_t *)FWCFG_SEL = 0;  /* FW_CFG_SIGNATURE */
    uint32_t sig = *(volatile uint32_t *)FWCFG_DATA;
    if (sig != 0x554D4551 && sig != 0x51454D55) {
        /* QEMU fw_cfg가 없으면 GUI 비활성화 */
        fb_ready = 0;
        return 0;
    }

    /* ramfb 설정 */
    /* ramfb 장치가 있으면 fw_cfg "etc/ramfb"에 설정 기록 */
    /* 실제 ramfb는 -device ramfb 옵션이 필요 */
    /* 여기서는 프레임버퍼 메모리만 준비 */
    fb_ready = 1;
    return 1;
}

/* 픽셀 설정 */
static inline void gui_pixel(int x, int y, uint32_t color) {
    if (x >= 0 && x < FB_WIDTH && y >= 0 && y < FB_HEIGHT)
        framebuffer[y * FB_WIDTH + x] = color;
}

/* 사각형 채우기 */
static void gui_rect(int x, int y, int w, int h, uint32_t color) {
    for (int dy = 0; dy < h; dy++)
        for (int dx = 0; dx < w; dx++)
            gui_pixel(x + dx, y + dy, color);
}

/* 화면 지우기 */
static void gui_clear(uint32_t color) {
    for (int i = 0; i < FB_WIDTH * FB_HEIGHT; i++)
        framebuffer[i] = color;
}

/* 부팅 화면 */
static void gui_boot_screen(void) {
    if (!fb_ready) return;
    gui_clear(0x001a1a2e);  /* 진한 남색 배경 */

    /* 상단 바 */
    gui_rect(0, 0, FB_WIDTH, 40, 0x00ff6600);  /* 주황 */

    /* 중앙 로고 영역 */
    int cx = FB_WIDTH / 2;
    int cy = FB_HEIGHT / 2;

    /* ▲ (삼각형 — 녹색) */
    for (int dy = 0; dy < 30; dy++)
        gui_rect(cx - 60 - dy/2, cy - 15 + dy, dy, 1, 0x0000ff00);

    /* ● (원 — 노랑) */
    gui_rect(cx - 20, cy - 10, 20, 20, 0x00ffff00);

    /* ▼ (역삼각형 — 빨강) */
    for (int dy = 0; dy < 30; dy++)
        gui_rect(cx + 20 + dy/2, cy - 15 + dy, 30 - dy, 1, 0x00ff0000);

    /* 하단 바 */
    gui_rect(0, FB_HEIGHT - 30, FB_WIDTH, 30, 0x00333366);
}

#endif
