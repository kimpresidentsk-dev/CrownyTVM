// ═══════════════════════════════════════════════════════════════
// chain/contract.js — ISA729 스마트 컨트랙트 (A단계)
// CrownyCell Chain
//
// 한선씨(HanSeon-C) 소스 또는 ISA729 바이트코드를
// 온체인에서 실행하는 시스템
//
// 실행 방식:
//   1. 컨트랙트 배포: 소스/바이트코드를 체인에 저장
//   2. 컨트랙트 호출: TX가 컨트랙트 주소를 참조
//   3. VM 실행: Rust 바이너리 (target/release/crowny) 호출
//   4. 결과: 상태 변경을 TX로 기록
//
// 가스 = 사이클 수 (10M 한도)
// 크라우니어 네이티브: 컨트랙트 = 27-trit 셀 배열
// ═══════════════════════════════════════════════════════════════
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { sha256hex } = require('./crypto');
const { CrownyCell, SLOT, TX_TYPE } = require('./cell');

// Rust VM 바이너리 경로
const VM_BINARY = path.join(__dirname, '..', 'target', 'release', 'crowny');
const VM_EXISTS = fs.existsSync(VM_BINARY);

// ── 가스/사이클 한도 ──
const MAX_CYCLES = 10_000_000;     // 10M 사이클
const GAS_PER_CYCLE = 1;           // 1 가스 = 1 사이클
const MAX_GAS = MAX_CYCLES;        // 최대 가스
const BASE_DEPLOY_GAS = 10000;     // 배포 기본 가스
const BASE_CALL_GAS = 1000;        // 호출 기본 가스

// ── 컨트랙트 저장소 ──

class ContractStore {
    constructor(dataDir) {
        this.dir = path.join(dataDir || path.join(__dirname, '..', 'data', 'chain'), 'contracts');
        if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
    }

    // 컨트랙트 저장
    deploy(code, deployer, name) {
        const codeHash = sha256hex(code);
        const contractId = 'CT' + codeHash.slice(0, 16);
        const meta = {
            id: contractId,
            codeHash,
            deployer,
            name: name || contractId,
            deployedAt: Math.floor(Date.now() / 1000),
            codeSize: code.length,
            calls: 0,
        };
        fs.writeFileSync(path.join(this.dir, contractId + '.han'), code);
        fs.writeFileSync(path.join(this.dir, contractId + '.json'), JSON.stringify(meta, null, 2));
        return { contractId, codeHash, meta };
    }

    // 컨트랙트 조회
    get(contractId) {
        const metaFile = path.join(this.dir, contractId + '.json');
        const codeFile = path.join(this.dir, contractId + '.han');
        if (!fs.existsSync(metaFile)) return null;
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
        const code = fs.existsSync(codeFile) ? fs.readFileSync(codeFile, 'utf8') : '';
        return { ...meta, code };
    }

    // 전체 목록
    list() {
        if (!fs.existsSync(this.dir)) return [];
        return fs.readdirSync(this.dir)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                try { return JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8')); }
                catch { return null; }
            })
            .filter(Boolean);
    }

    // 호출 횟수 증가
    incrementCalls(contractId) {
        const metaFile = path.join(this.dir, contractId + '.json');
        if (!fs.existsSync(metaFile)) return;
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
        meta.calls = (meta.calls || 0) + 1;
        meta.lastCalled = Math.floor(Date.now() / 1000);
        fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
    }
}

// ── VM 실행 ──

function executeContract(code, args, options = {}) {
    if (!VM_EXISTS) {
        return { success: false, error: 'VM binary not found: ' + VM_BINARY };
    }

    const maxCycles = options.maxCycles || MAX_CYCLES;
    const timeout = options.timeout || 5000; // 5초 타임아웃

    try {
        // 임시 파일에 코드 작성
        const tmpFile = path.join('/tmp', 'crowny-contract-' + Date.now() + '.han');
        fs.writeFileSync(tmpFile, code);

        // VM 실행
        const result = execFileSync(VM_BINARY, ['run', tmpFile], {
            timeout,
            maxBuffer: 1024 * 1024, // 1MB 출력 제한
            encoding: 'utf8',
            env: {
                ...process.env,
                CROWNY_MAX_CYCLES: String(maxCycles),
                CROWNY_ARGS: JSON.stringify(args || []),
            },
        });

        // 임시 파일 삭제
        try { fs.unlinkSync(tmpFile); } catch {}

        // 출력 파싱
        const lines = result.trim().split('\n');
        const output = [];
        let returnValue = 0;
        let cycles = 0;

        for (const line of lines) {
            // VM 배너/헤더 필터링
            if (line.startsWith('▲■▼') || line.trim().startsWith('한선씨')) continue;
            if (line.trim() === '') continue;
            if (line.startsWith('[RESULT]')) {
                returnValue = parseInt(line.replace('[RESULT]', '').trim()) || 0;
            } else if (line.startsWith('[CYCLES]')) {
                cycles = parseInt(line.replace('[CYCLES]', '').trim()) || 0;
            } else {
                output.push(line);
            }
        }

        return {
            success: true,
            returnValue,
            cycles,
            gasUsed: cycles * GAS_PER_CYCLE,
            output,
        };
    } catch (e) {
        if (e.killed) {
            return { success: false, error: 'execution timeout', gasUsed: MAX_GAS };
        }
        // stderr에서 에러 추출
        const stderr = e.stderr || e.message || '';
        return { success: false, error: stderr.slice(0, 200), gasUsed: BASE_CALL_GAS };
    }
}

// ── 컨트랙트 배포 TX 생성 ──

function createDeployTx(deployer, code, name) {
    const codeHash = sha256hex(code);
    const cell = new CrownyCell();
    cell.set(SLOT.SUBJECT, deployer);          // 배포자 주소
    cell.set(SLOT.PREDICATE, TX_TYPE.CELL_CREATE); // 셀 생성
    cell.set(SLOT.OBJECT, 'CT' + codeHash.slice(0, 16)); // 컨트랙트 ID
    cell.set(SLOT.TIMESTAMP, Math.floor(Date.now() / 1000));
    cell.set(SLOT.CATEGORY, codeHash);         // 코드 해시
    cell.set(SLOT.DOMAIN, code.length);        // 코드 크기
    cell.set(SLOT.DATA_START, name || '');      // 컨트랙트 이름
    return cell;
}

// ── 컨트랙트 호출 TX 생성 ──

function createCallTx(caller, contractId, method, args) {
    const cell = new CrownyCell();
    cell.set(SLOT.SUBJECT, caller);
    cell.set(SLOT.PREDICATE, TX_TYPE.CELL_LINK);  // 셀 연결 (호출)
    cell.set(SLOT.OBJECT, contractId);
    cell.set(SLOT.TIMESTAMP, Math.floor(Date.now() / 1000));
    cell.set(SLOT.DATA_START, method || 'main');
    if (args) cell.set(SLOT.DATA_START + 1, JSON.stringify(args));
    return cell;
}

// ── 내장 컨트랙트 (시스템) ──

const BUILTIN_CONTRACTS = {
    // 토큰 전송 수수료 계산
    'CT_FEE_CALC': `
        // 수수료 = 금액 × 0.001 (0.1%)
        변수 금액 = 인자(0)
        변수 수수료 = 금액 / 1000
        만약 수수료 < 1 {
            수수료 = 1
        }
        반환 수수료
    `,
    // 스왑 비율 계산
    'CT_SWAP_RATE': `
        변수 입력통화 = 인자(0)
        변수 출력통화 = 인자(1)
        변수 금액 = 인자(2)
        만약 입력통화 == -1 그리고 출력통화 == 0 {
            반환 금액 / 100
        }
        만약 입력통화 == 0 그리고 출력통화 == 1 {
            반환 금액 / 10
        }
        반환 -1
    `,
};

module.exports = {
    ContractStore,
    executeContract,
    createDeployTx,
    createCallTx,
    BUILTIN_CONTRACTS,
    MAX_CYCLES, MAX_GAS, BASE_DEPLOY_GAS, BASE_CALL_GAS,
    VM_BINARY, VM_EXISTS,
};
