/* ═══════════════════════════════════════════════════════════════
 * 네트워크 — virtio-net 스텁 + UDP 패킷 빌드
 *
 * QEMU virt: virtio-net-device at MMIO 0x10001000~
 * 이 구현은 MMIO 디스커버리로 virtio-net 장치를 찾고,
 * 기본 MAC 주소를 읽고, 간단한 UDP 패킷을 빌드합니다.
 * ═══════════════════════════════════════════════════════════════ */

#ifndef NET_H
#define NET_H

#include <stdint.h>

/* virtio MMIO 레지스터 */
#define VIRTIO_MMIO_BASE   0x10001000UL
#define VIRTIO_MMIO_MAGIC  0x000
#define VIRTIO_MMIO_DEVID  0x002
#define VIRTIO_MMIO_STATUS 0x070

static volatile uint64_t net_base = 0;
static uint8_t net_mac[6] = {0x52, 0x54, 0x00, 0x12, 0x34, 0x56};

static inline uint32_t vio_read32(uint64_t base, int off) {
    return *(volatile uint32_t *)(base + off);
}

/* virtio-net 장치 탐색 */
static int net_init(void) {
    /* QEMU virt는 0x10001000~0x10008000에 virtio 장치를 배치 */
    for (uint64_t addr = 0x10001000UL; addr <= 0x10008000UL; addr += 0x1000) {
        uint32_t magic = vio_read32(addr, 0x000);
        uint32_t devid = vio_read32(addr, 0x008);
        if (magic == 0x74726976 && devid == 1) {  /* "virt" + net */
            net_base = addr;
            /* MAC은 config 영역(offset 0x100)에서 읽기 */
            for (int i = 0; i < 6; i++)
                net_mac[i] = *(volatile uint8_t *)(addr + 0x100 + i);
            return 1;
        }
    }
    return 0;
}

/* UDP 패킷 빌드 (Ethernet + IP + UDP) */
static int net_build_udp(uint8_t *pkt, const uint8_t *dst_mac,
                         uint32_t src_ip, uint32_t dst_ip,
                         uint16_t src_port, uint16_t dst_port,
                         const uint8_t *data, int dlen) {
    int total = 14 + 20 + 8 + dlen;  /* ETH + IP + UDP + data */

    /* Ethernet 헤더 */
    for (int i = 0; i < 6; i++) pkt[i] = dst_mac[i];
    for (int i = 0; i < 6; i++) pkt[6+i] = net_mac[i];
    pkt[12] = 0x08; pkt[13] = 0x00;  /* IPv4 */

    /* IP 헤더 (20바이트) */
    uint8_t *ip = pkt + 14;
    ip[0] = 0x45; ip[1] = 0; /* version, IHL, DSCP */
    int iplen = 20 + 8 + dlen;
    ip[2] = iplen >> 8; ip[3] = iplen & 0xFF;
    ip[4] = 0; ip[5] = 0; ip[6] = 0x40; ip[7] = 0;
    ip[8] = 64;  /* TTL */
    ip[9] = 17;  /* UDP */
    ip[10] = 0; ip[11] = 0;  /* checksum (skip) */
    ip[12] = (src_ip >> 24); ip[13] = (src_ip >> 16) & 0xFF;
    ip[14] = (src_ip >> 8) & 0xFF; ip[15] = src_ip & 0xFF;
    ip[16] = (dst_ip >> 24); ip[17] = (dst_ip >> 16) & 0xFF;
    ip[18] = (dst_ip >> 8) & 0xFF; ip[19] = dst_ip & 0xFF;

    /* UDP 헤더 (8바이트) */
    uint8_t *udp = ip + 20;
    udp[0] = src_port >> 8; udp[1] = src_port & 0xFF;
    udp[2] = dst_port >> 8; udp[3] = dst_port & 0xFF;
    int udplen = 8 + dlen;
    udp[4] = udplen >> 8; udp[5] = udplen & 0xFF;
    udp[6] = 0; udp[7] = 0;  /* checksum (skip) */

    /* 데이터 */
    for (int i = 0; i < dlen; i++) udp[8+i] = data[i];

    return total;
}

/* 패킷 전송 (스텁: UART로 로그만) */
static void net_send(const uint8_t *pkt, int len) {
    (void)pkt; (void)len;
    /* 실제 virtio 큐 전송은 virtqueue 설정 필요 — 스텁 */
}

#endif
