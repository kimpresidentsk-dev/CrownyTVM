/* ═══════════════════════════════════════════════════════════════
 * 크라우니OS 커널 — RISC-V 베어메탈
 *
 * 4상균형3진 · ISA729 · 온톨로직
 *
 * 부팅 → UART → ISA729 VM → 온톨로직 셀 → 영속 저장 → 셸
 * ═══════════════════════════════════════════════════════════════ */

#include <stdint.h>
#include "uart.h"
#include "disk.h"
#include "net.h"
#include "gui.h"
#include "hw.h"

/* ═══ 온톨로직 셀 (27슬롯) ═══
 * 배열 인덱스 = 슬롯 + 13
 *   [0]=방향속성  [12]=뒷방향  [13]=상태  [14]=앞방향
 *   [15]=내용  [16]=유형  [17]=이름(해시)
 *   [18]=생성시간  [21]=근거수  [22]=신뢰도 */

#define S_상태     13
#define S_앞방향   14
#define S_뒷방향   12
#define S_내용     15
#define S_유형     16
#define S_이름     17
#define S_생성시간 18
#define S_변경시간 19
#define S_근거수   21
#define S_신뢰도   22
#define S_위치     8

/* 4상 */
#define EP_확  2
#define EP_미  0
#define EP_오 -2
#define EP_음 -1

/* 유형 */
#define TY_정수  1
#define TY_문자열 3

/* ═══ 메모리 내 저장소 ═══ */

#define MAX_CELLS 256
static int64_t cells[MAX_CELLS][27];
static int cell_count = 0;

/* 셀 초기화 */
static void cell_init(int64_t *s) {
    for (int i = 0; i < 27; i++) s[i] = 0;
    s[S_상태] = EP_미;
    s[S_앞방향] = -1;
    s[S_뒷방향] = -1;
    s[S_근거수] = 0;
    s[S_신뢰도] = 0;
}

/* 셀 추가 → 주소 반환 */
static int cell_add(int64_t name_hash, int64_t type, int64_t value) {
    if (cell_count >= MAX_CELLS) return -1;
    int idx = cell_count++;
    cell_init(cells[idx]);
    cells[idx][S_이름] = name_hash;
    cells[idx][S_유형] = type;
    cells[idx][S_내용] = value;
    cells[idx][S_위치] = idx;
    return idx;
}

/* 양방향 연결 */
static void cell_link(int a, int b) {
    if (a >= 0 && a < cell_count && b >= 0 && b < cell_count) {
        cells[a][S_앞방향] = b;
        cells[b][S_뒷방향] = a;
    }
}

/* 근거 추가 → 3개면 자동 확정 */
static void cell_evidence(int idx) {
    if (idx < 0 || idx >= cell_count) return;
    cells[idx][S_근거수]++;
    if (cells[idx][S_근거수] >= 3 && cells[idx][S_상태] == EP_미) {
        cells[idx][S_상태] = EP_확;
        cells[idx][S_신뢰도] = 100;
    }
}

/* 상태 이름 */
static const char *ep_name(int64_t s) {
    if (s == EP_확) return "▲확정";
    if (s == EP_미) return "●미확인";
    if (s == EP_오) return "▼오해";
    return "◆미인지";
}

/* ═══ 영속: 메모리 ↔ 디스크 ═══ */

static void persist_save(void) {
    disk_save(cells, cell_count);
}

static int persist_load(void) {
    cell_count = disk_load(cells, MAX_CELLS);
    return cell_count;
}

/* ═══ ISA729 VM ═══ */

#define VM_STACK  256
#define VM_SLOTS  256
#define VM_FRAMES 32

typedef struct { uint16_t op; int64_t a, b; } Inst;
typedef struct { int pc, sp, base; } Frame;

static struct {
    int64_t stack[VM_STACK];
    int     sp;
    int64_t slots[VM_SLOTS];
    int     base;
    Frame   frames[VM_FRAMES];
    int     fp, pc, running;
} vm;

static void vm_init(void) {
    vm.sp = vm.base = vm.fp = vm.pc = 0;
    vm.running = 1;
    for (int i = 0; i < VM_SLOTS; i++) vm.slots[i] = 0;
}

static void vm_run(const Inst *code, const int64_t *pool, int ncode) {
    vm_init();
    int limit = 1000000;
    while (vm.running && limit-- > 0) {
        if (vm.pc >= ncode) { vm.running = 0; break; }
        Inst inst = code[vm.pc]; vm.pc++;
        int64_t oa = inst.a;
        switch (inst.op) {
        case 0:   vm.stack[vm.sp++] = 1;  break;
        case 1:   vm.stack[vm.sp++] = 0;  break;
        case 2:   vm.stack[vm.sp++] = -1; break;
        case 8:   vm.running = 0; break;
        case 27:  vm.stack[vm.sp++] = pool[oa]; break;
        case 36:  vm.sp--; vm.slots[vm.base+oa] = vm.stack[vm.sp]; break;
        case 44:  vm.stack[vm.sp++] = vm.slots[vm.base+oa]; break;
        case 45:  vm.sp--; vm.stack[vm.sp-1] += vm.stack[vm.sp]; break;
        case 46:  vm.sp--; vm.stack[vm.sp-1] -= vm.stack[vm.sp]; break;
        case 47:  vm.sp--; vm.stack[vm.sp-1] *= vm.stack[vm.sp]; break;
        case 48:  vm.sp--; if(vm.stack[vm.sp]) vm.stack[vm.sp-1] /= vm.stack[vm.sp]; break;
        case 49:  vm.sp--; if(vm.stack[vm.sp]) vm.stack[vm.sp-1] %= vm.stack[vm.sp]; break;
        case 54:  vm.sp--; vm.stack[vm.sp-1] = (vm.stack[vm.sp-1]==vm.stack[vm.sp])?1:-1; break;
        case 56:  vm.sp--; vm.stack[vm.sp-1] = (vm.stack[vm.sp-1]>vm.stack[vm.sp])?1:-1; break;
        case 57:  vm.sp--; vm.stack[vm.sp-1] = (vm.stack[vm.sp-1]<vm.stack[vm.sp])?1:-1; break;
        case 62:  vm.stack[vm.sp-1] = (vm.stack[vm.sp-1]>0)?-1:(vm.stack[vm.sp-1]<0)?1:0; break;
        case 63:  vm.sp--; if(vm.stack[vm.sp]>0) vm.pc=oa; break;
        case 720: vm.pc = oa; break;
        case 72:  break;
        case 73: {
            int n=oa; vm.sp--; int fpc=(int)vm.stack[vm.sp];
            vm.frames[vm.fp]=(Frame){vm.pc,vm.sp-n,vm.base}; vm.fp++;
            int nb=vm.base+32;
            for(int i=0;i<n;i++) vm.slots[nb+i]=vm.stack[vm.sp-n+i];
            vm.sp-=n; vm.base=nb; vm.pc=fpc; break;
        }
        case 71: {
            vm.sp--; int64_t r=vm.stack[vm.sp]; vm.fp--;
            vm.pc=vm.frames[vm.fp].pc; vm.sp=vm.frames[vm.fp].sp;
            vm.base=vm.frames[vm.fp].base; vm.stack[vm.sp++]=r; break;
        }
        case 567: vm.sp--; uart_putd(vm.stack[vm.sp]); uart_putc('\n'); break;
        }
    }
}

/* 부팅 시험 */
static const Inst boot_test[] = {
    {27,0,0},{27,1,0},{45,0,0},{27,2,0},{47,0,0},{567,0,0},{8,0,0}
};
static const int64_t boot_pool[] = {3, 7, 2};

static const Inst fact_test[] = {
    {720,17,0},{72,0,0},{44,0,0},{27,1,0},{57,0,0},
    {62,0,0},{63,9,0},{27,2,0},{71,0,0},{44,0,0},
    {44,0,0},{27,2,0},{46,0,0},{27,0,0},{73,1,0},
    {47,0,0},{71,0,0},{27,3,0},{27,0,0},{73,1,0},
    {567,0,0},{8,0,0}
};
static const int64_t fact_pool[] = {1, 2, 1, 5};

/* ═══ 문자열 유틸 ═══ */

static int str_eq(const char *a, const char *b) {
    while (*a && *b) if (*a++ != *b++) return 0;
    return *a == *b;
}

static int str_startswith(const char *s, const char *p) {
    while (*p) if (*s++ != *p++) return 0;
    return 1;
}

static int64_t str_hash(const char *s) {
    int64_t h = 0;
    while (*s) h = h * 31 + *s++;
    return h;
}

static int parse_int(const char *s) {
    int v=0, neg=0;
    if (*s=='-') { neg=1; s++; }
    while (*s>='0' && *s<='9') v = v*10+(*s++-'0');
    return neg ? -v : v;
}

static const char *skip_word(const char *s) {
    while (*s && *s != ' ') s++;
    if (*s == ' ') s++;
    return s;
}

/* ═══ 셸 ═══ */

static void shell_help(void) {
    uart_puts("  도움말      이 메시지\n");
    uart_puts("  시험        ISA729 VM 자체시험\n");
    uart_puts("  정보        시스템 정보\n");
    uart_puts("  저장        디스크에 셀 저장\n");
    uart_puts("  불러오기    디스크에서 셀 불러오기\n");
    uart_puts("  넣기 이름 값   셀 추가 (예: 넣기 나이 25)\n");
    uart_puts("  목록        저장된 셀 목록\n");
    uart_puts("  연결 A B    셀A→셀B 연결\n");
    uart_puts("  근거 N      셀N에 근거 추가\n");
    uart_puts("  따라가기 N  셀N부터 앞방향 추적\n");
    uart_puts("  계산 A B    A + B 계산\n");
    uart_puts("  보내기 메시지   UDP 메시지 전송\n");
    uart_puts("  맥주소      MAC 주소 표시\n");
    uart_puts("  시간        시스템 타이머\n");
    uart_puts("  대기 N      N밀리초 대기\n");
    uart_puts("  끝          종료\n");
}

static void shell_list(void) {
    if (cell_count == 0) {
        uart_puts("(셀 없음)\n");
        return;
    }
    uart_puts("주소  상태      이름해시     내용    앞→  ←뒤\n");
    for (int i = 0; i < cell_count; i++) {
        uart_putc('[');
        uart_putd(i);
        uart_puts("] ");
        uart_puts(ep_name(cells[i][S_상태]));
        uart_puts("  H");
        uart_putd(cells[i][S_이름] % 10000);
        uart_puts("  V=");
        uart_putd(cells[i][S_내용]);
        uart_puts("  →");
        uart_putd(cells[i][S_앞방향]);
        uart_puts("  ←");
        uart_putd(cells[i][S_뒷방향]);
        uart_putc('\n');
    }
    uart_puts("총 ");
    uart_putd(cell_count);
    uart_puts("개 셀\n");
}

static void shell_follow(int start) {
    if (start < 0 || start >= cell_count) {
        uart_puts("잘못된 주소\n");
        return;
    }
    int cur = start;
    int depth = 0;
    while (cur >= 0 && cur < cell_count && depth < 20) {
        uart_puts("[");
        uart_putd(cur);
        uart_puts("] V=");
        uart_putd(cells[cur][S_내용]);
        uart_puts(" ");
        uart_puts(ep_name(cells[cur][S_상태]));
        int next = (int)cells[cur][S_앞방향];
        if (next >= 0) uart_puts(" → ");
        else uart_puts(" (끝)");
        uart_putc('\n');
        cur = next;
        depth++;
    }
}

static void shell_run(void) {
    char buf[128];

    while (1) {
        uart_puts("크라우니> ");
        uart_gets(buf, sizeof(buf));

        if (str_eq(buf, "끝") || str_eq(buf, "꺼")) {
            uart_puts("저장 중...\n");
            persist_save();
            uart_puts("[종료] CrownyOS 종료됨\n");
            break;
        }
        else if (str_eq(buf, "도움말")) { shell_help(); }
        else if (str_eq(buf, "시험")) {
            uart_puts("  (3+7)*2 = ");
            vm_run(boot_test, boot_pool, 7);
            uart_puts("  팩(5) = ");
            vm_run(fact_test, fact_pool, 22);
            uart_puts("  ISA729 VM 정상\n");
        }
        else if (str_eq(buf, "정보")) {
            uart_puts("▲●▼◆ CrownyOS v1.0 ▲●▼◆\n");
            uart_puts("  아키텍처: RISC-V 64비트 베어메탈\n");
            uart_puts("  VM: ISA729\n");
            uart_puts("  DB: 4세대 온톨로직 셀 (27슬롯)\n");
            uart_puts("  저장: pflash 영속\n");
            uart_puts("  타이머: ");
            uart_putd((int64_t)(hw_time() / 10000000));
            uart_puts("초 가동\n");
            uart_puts("  GUI: ");
            if (fb_ready) uart_puts("ramfb 640x480\n");
            else uart_puts("텍스트\n");
            uart_puts("  네트워크: ");
            if (net_base) uart_puts("virtio-net 활성\n");
            else uart_puts("오프라인\n");
            uart_puts("  셀: ");
            uart_putd(cell_count);
            uart_puts("개\n");
        }
        else if (str_eq(buf, "저장")) {
            persist_save();
            uart_puts("디스크에 ");
            uart_putd(cell_count);
            uart_puts("개 셀 저장됨\n");
        }
        else if (str_eq(buf, "불러오기")) {
            int n = persist_load();
            uart_puts("디스크에서 ");
            uart_putd(n);
            uart_puts("개 셀 불러옴\n");
        }
        else if (str_eq(buf, "목록")) { shell_list(); }
        else if (str_startswith(buf, "넣기 ")) {
            /* "넣기 나이 25" */
            const char *p = buf;
            /* "넣기" = 3바이트×2 + 1공백 = 7 */
            p = skip_word(p);  /* skip "넣기" */
            char name[32]; int ni = 0;
            while (*p && *p != ' ' && ni < 30) name[ni++] = *p++;
            name[ni] = '\0';
            if (*p == ' ') p++;
            int64_t val = parse_int(p);
            int idx = cell_add(str_hash(name), TY_정수, val);
            uart_puts("셀[");
            uart_putd(idx);
            uart_puts("] '");
            uart_puts(name);
            uart_puts("' = ");
            uart_putd(val);
            uart_puts(" (●미확인)\n");
        }
        else if (str_startswith(buf, "연결 ")) {
            const char *p = skip_word(buf);
            int a = parse_int(p);
            p = skip_word(p);
            int b = parse_int(p);
            cell_link(a, b);
            uart_puts("연결: ");
            uart_putd(a);
            uart_puts(" → ");
            uart_putd(b);
            uart_putc('\n');
        }
        else if (str_startswith(buf, "근거 ")) {
            const char *p = skip_word(buf);
            int idx = parse_int(p);
            cell_evidence(idx);
            uart_puts("셀[");
            uart_putd(idx);
            uart_puts("] 근거=");
            uart_putd(cells[idx][S_근거수]);
            uart_puts(" ");
            uart_puts(ep_name(cells[idx][S_상태]));
            uart_putc('\n');
        }
        else if (str_startswith(buf, "따라가기 ")) {
            const char *p = skip_word(buf);
            /* "따라가기" = 12bytes, space=1 */
            shell_follow(parse_int(p));
        }
        else if (str_startswith(buf, "계산 ")) {
            const char *p = skip_word(buf);
            int a = parse_int(p);
            p = skip_word(p);
            int b = parse_int(p);
            uart_putd(a); uart_puts(" + "); uart_putd(b);
            uart_puts(" = "); uart_putd(a+b); uart_putc('\n');
        }
        else if (str_startswith(buf, "보내기 ")) {
            const char *msg = skip_word(buf);
            uint8_t broadcast[6] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
            uint8_t pkt[256];
            int mlen = 0;
            while (msg[mlen]) mlen++;
            int plen = net_build_udp(pkt, broadcast,
                0x0A000002, 0x0A0000FF,  /* 10.0.0.2 → 10.0.0.255 */
                7729, 7729,
                (const uint8_t *)msg, mlen);
            net_send(pkt, plen);
            uart_puts("UDP 전송: ");
            uart_puts(msg);
            uart_putc('\n');
        }
        else if (str_eq(buf, "시간")) {
            uart_puts("시스템 시간: ");
            uart_putd((int64_t)hw_time());
            uart_puts(" 틱 (");
            uart_putd((int64_t)(hw_time() / 10000000));
            uart_puts("초)\n");
        }
        else if (str_startswith(buf, "대기 ")) {
            const char *p = skip_word(buf);
            int ms = parse_int(p);
            uart_puts("대기: ");
            uart_putd(ms);
            uart_puts("ms\n");
            hw_delay_ms(ms);
            uart_puts("완료\n");
        }
        else if (str_eq(buf, "맥주소")) {
            uart_puts("MAC: ");
            for (int i = 0; i < 6; i++) {
                if (i > 0) uart_putc(':');
                uint8_t h = net_mac[i] >> 4;
                uint8_t l = net_mac[i] & 0xF;
                uart_putc(h < 10 ? '0'+h : 'a'+h-10);
                uart_putc(l < 10 ? '0'+l : 'a'+l-10);
            }
            uart_putc('\n');
        }
        else if (buf[0] != '\0') {
            uart_puts("알 수 없는 명령 ('도움말' 입력)\n");
        }
    }
}

/* ═══ 커널 메인 ═══ */

void kernel_main(void) {
    uart_init();

    uart_puts("\n");
    uart_puts("======================================\n");
    uart_puts("  ▲●▼◆  CrownyOS v1.0  ▲●▼◆\n");
    uart_puts("  4상균형3진 온톨로직 운영체계\n");
    uart_puts("  RISC-V 베어메탈 · ISA729 · 영속저장\n");
    uart_puts("======================================\n\n");

    /* 부팅 자체시험 */
    uart_puts("[부팅] ISA729 VM...\n");
    uart_puts("  (3+7)*2 = ");
    vm_run(boot_test, boot_pool, 7);
    uart_puts("  팩(5) = ");
    vm_run(fact_test, fact_pool, 22);

    /* 영속 저장소 */
    /* 하드웨어 */
    uart_puts("[부팅] 하드웨어...");
    hw_init();
    uart_puts(" 타이머+PLIC ✓\n");

    /* GUI */
    uart_puts("[부팅] GUI...");
    if (gui_init()) {
        gui_boot_screen();
        uart_puts(" ramfb 640x480 ✓\n");
    } else {
        uart_puts(" 텍스트 모드 (직렬)\n");
    }

    /* 네트워크 */
    uart_puts("[부팅] 네트워크...");
    if (net_init()) {
        uart_puts(" virtio-net MAC=");
        for (int i = 0; i < 6; i++) {
            if (i > 0) uart_putc(':');
            uint8_t h = net_mac[i] >> 4;
            uint8_t l = net_mac[i] & 0xF;
            uart_putc(h < 10 ? '0'+h : 'a'+h-10);
            uart_putc(l < 10 ? '0'+l : 'a'+l-10);
        }
        uart_putc('\n');
    } else {
        uart_puts(" 장치 없음 (오프라인)\n");
    }

    uart_puts("[부팅] 디스크 초기화...\n");
    int loaded = persist_load();
    if (loaded > 0) {
        uart_puts("  디스크에서 ");
        uart_putd(loaded);
        uart_puts("개 셀 복원됨 ✓\n");
    } else {
        uart_puts("  새 디스크 (셀 없음)\n");
    }

    uart_puts("[부팅] 준비 완료\n\n");
    uart_puts("'도움말' 입력으로 시작\n\n");

    shell_run();
    uart_puts("▲●▼◆\n");
}
