# ═══════════════════════════════════════════════════════════════
# 크라우니OS 빌드 — RISC-V 64비트 베어메탈
# ═══════════════════════════════════════════════════════════════

CROSS   = riscv64-elf-
CC      = $(CROSS)gcc
AS      = $(CROSS)gcc
LD      = $(CROSS)ld
OBJCOPY = $(CROSS)objcopy
OBJDUMP = $(CROSS)objdump

CFLAGS  = -march=rv64imac_zicsr -mabi=lp64 -mcmodel=medany \
          -ffreestanding -nostdlib -nostartfiles \
          -O2 -Wall -Wextra -Wno-unused-function -Wno-unused-parameter \
          -I kernel
ASFLAGS = -march=rv64imac_zicsr -mabi=lp64
LDFLAGS = -T linker.ld -nostdlib

KERNEL  = 크라우니OS.elf
BINARY  = 크라우니OS.bin

OBJS    = boot/start.o kernel/main.o

# ═══ 빌드 ═══

all: $(KERNEL)

$(KERNEL): $(OBJS) linker.ld
	$(LD) $(LDFLAGS) -o $@ $(OBJS)
	@echo "  [ELF] $@"

$(BINARY): $(KERNEL)
	$(OBJCOPY) -O binary $< $@
	@echo "  [BIN] $@"

boot/start.o: boot/start.S
	$(AS) $(ASFLAGS) -c $< -o $@
	@echo "  [ASM] $<"

kernel/main.o: kernel/main.c kernel/uart.h kernel/disk.h kernel/net.h kernel/gui.h kernel/hw.h
	$(CC) $(CFLAGS) -c $< -o $@
	@echo "  [CC]  $<"

# ═══ 실행 ═══

run: $(KERNEL)
	qemu-system-riscv64 \
		-machine virt \
		-bios none \
		-kernel $(KERNEL) \
		-nographic \
		-serial mon:stdio \
		-semihosting

run-gui: $(KERNEL)
	qemu-system-riscv64 \
		-machine virt \
		-bios none \
		-kernel $(KERNEL) \
		-serial mon:stdio \
		-device ramfb \
		-semihosting

# ═══ 디버그 ═══

disasm: $(KERNEL)
	$(OBJDUMP) -d $< | head -100

info: $(KERNEL)
	$(CROSS)size $<
	$(CROSS)readelf -h $<

# ═══ 정리 ═══

clean:
	rm -f $(OBJS) $(KERNEL) $(BINARY)

.PHONY: all clean run run-gui disasm info
