/* ═══════════════════════════════════════════════════════════════
 * 영속 저장 — semihosting 기반
 *
 * QEMU -semihosting 옵션으로 호스트 파일 직접 접근
 * RISC-V semihosting: ebreak 매직 시퀀스
 * ═══════════════════════════════════════════════════════════════ */

#ifndef DISK_H
#define DISK_H

#include <stdint.h>

/* ═══ semihosting 호출 ═══ */

static inline long semihosting_call(long op, long arg) {
    register long a0 __asm__("a0") = op;
    register long a1 __asm__("a1") = arg;
    __asm__ volatile (
        ".option push\n"
        ".option norvc\n"
        "slli zero, zero, 0x1f\n"
        "ebreak\n"
        "srai zero, zero, 7\n"
        ".option pop\n"
        : "+r"(a0)
        : "r"(a1)
        : "memory"
    );
    return a0;
}

/* semihosting 연산 번호 */
#define SH_OPEN   0x01
#define SH_CLOSE  0x02
#define SH_WRITE  0x05
#define SH_READ   0x06
#define SH_SEEK   0x0A
#define SH_FLEN   0x0C

/* ═══ 파일 연산 ═══ */

static inline long sh_open(const char *name, int mode) {
    /* mode: 0=r, 1=rb, 2=r+, 4=w, 5=wb, 6=w+, 8=a */
    long args[3] = { (long)name, mode, (long)__builtin_strlen(name) };
    return semihosting_call(SH_OPEN, (long)args);
}

static inline long sh_close(long fd) {
    return semihosting_call(SH_CLOSE, (long)&fd);
}

static inline long sh_write(long fd, const void *buf, long len) {
    long args[3] = { fd, (long)buf, len };
    return semihosting_call(SH_WRITE, (long)args);  /* 0=성공 */
}

static inline long sh_read(long fd, void *buf, long len) {
    long args[3] = { fd, (long)buf, len };
    return semihosting_call(SH_READ, (long)args);  /* 0=성공 */
}

static inline long sh_seek(long fd, long pos) {
    long args[2] = { fd, pos };
    return semihosting_call(SH_SEEK, (long)args);
}

static inline long sh_flen(long fd) {
    return semihosting_call(SH_FLEN, (long)&fd);
}

/* ═══ 셀 디스크 연산 ═══ */

#define CELL_SLOTS 27
#define CELL_BYTES (CELL_SLOTS * 8)  /* 216 */
#define MAGIC_VAL  0x43525731        /* "CRW1" */
#define HDR_BYTES  16                /* magic(4) + count(4) + reserved(8) */

static const char DISK_PATH[] = "crowny.db";

/* 전체 저장: 헤더 + 셀 배열 */
static inline int disk_save(const int64_t cells[][27], int count) {
    long fd = sh_open(DISK_PATH, 6);  /* w+ */
    if (fd < 0) return -1;
    
    /* 헤더 */
    uint32_t hdr[4] = { MAGIC_VAL, (uint32_t)count, 0, 0 };
    sh_write(fd, hdr, HDR_BYTES);
    
    /* 셀 데이터 */
    for (int i = 0; i < count; i++) {
        sh_write(fd, cells[i], CELL_BYTES);
    }
    
    sh_close(fd);
    return count;
}

/* 전체 읽기 → 셀 수 반환 */
static inline int disk_load(int64_t cells[][27], int max) {
    long fd = sh_open(DISK_PATH, 1);  /* rb */
    if (fd < 0) return 0;
    
    long fsize = sh_flen(fd);
    if (fsize < HDR_BYTES) { sh_close(fd); return 0; }
    
    /* 헤더 */
    uint32_t hdr[4] = {0};
    sh_read(fd, hdr, HDR_BYTES);
    
    if (hdr[0] != MAGIC_VAL) { sh_close(fd); return 0; }
    
    int count = (int)hdr[1];
    if (count > max) count = max;
    
    /* 셀 데이터 */
    for (int i = 0; i < count; i++) {
        sh_read(fd, cells[i], CELL_BYTES);
    }
    
    sh_close(fd);
    return count;
}

#endif
