#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// chain/deploy.js — 노드 배포 도우미 (B단계)
// CrownyCell Chain
//
// 사용법:
//   node chain/deploy.js init           — 이 노드 초기화 (키 생성 + 제네시스)
//   node chain/deploy.js status         — 체인 상태 확인
//   node chain/deploy.js export-genesis — 제네시스 블록 + 상태 내보내기
//   node chain/deploy.js import-genesis <file> — 다른 노드의 제네시스 가져오기
//   node chain/deploy.js keygen         — 검증자 키페어 생성
//   node chain/deploy.js node-config    — 노드 설정 파일 생성
// ═══════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('./crypto');
const { CrownyChain } = require('./producer');
const { ChainStorage } = require('./storage');

const DATA_DIR = path.join(__dirname, '..', 'data', 'chain');
const CONFIG_FILE = path.join(DATA_DIR, 'node-config.json');

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

// ── init: 노드 초기화 ──

function cmdInit() {
    ensureDir(DATA_DIR);
    const storage = new ChainStorage(DATA_DIR);
    if (storage.hasChain()) {
        console.log('Chain already initialized at height', storage.getHeight());
        console.log('Genesis hash:', storage.getGenesisHash()?.slice(0, 16) + '...');
        return;
    }

    // 검증자 키 생성
    const kp = crypto.generateKeypair();
    const addr = crypto.publicKeyToAddress(kp.publicKey);
    const keypairFile = path.join(DATA_DIR, 'validator-key.json');

    fs.writeFileSync(keypairFile, JSON.stringify({
        address: addr,
        publicKey: kp.publicKey.toString('hex'),
        privateKey: kp.privateKey.toString('hex'),
        createdAt: new Date().toISOString(),
    }, null, 2), { mode: 0o600 });

    console.log('Validator key generated:', addr);
    console.log('Saved to:', keypairFile);

    // 체인 초기화
    const chain = new CrownyChain({ dataDir: DATA_DIR, keypair: kp });
    chain.initialize({ dataDir: path.join(__dirname, '..', 'data') });

    console.log('Chain initialized:');
    console.log('  Height:', chain.getHeight());
    console.log('  Genesis:', chain.storage.getGenesisHash()?.slice(0, 16) + '...');
    console.log('  Accounts:', chain.state.accounts.size);

    // 기본 노드 설정
    const config = {
        nodeId: require('crypto').randomBytes(8).toString('hex'),
        p2pPort: 9730,
        validatorKey: keypairFile,
        seedPeers: [],
        validators: [kp.publicKey.toString('hex')],
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log('Config saved to:', CONFIG_FILE);
}

// ── status ──

function cmdStatus() {
    const storage = new ChainStorage(DATA_DIR);
    if (!storage.hasChain()) {
        console.log('No chain found. Run: node chain/deploy.js init');
        return;
    }
    const meta = storage.getMeta();
    const configExists = fs.existsSync(CONFIG_FILE);
    const config = configExists ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : null;
    const keyFile = path.join(DATA_DIR, 'validator-key.json');
    const keyExists = fs.existsSync(keyFile);

    console.log('=== CrownyCell Chain Node Status ===');
    console.log('  Height:', meta.latestHeight);
    console.log('  Latest hash:', meta.latestHash?.slice(0, 16) + '...');
    console.log('  Genesis:', meta.genesisHash?.slice(0, 16) + '...');
    console.log('  Total txs:', meta.totalTransactions);
    console.log('  Validator key:', keyExists ? 'YES' : 'NO');
    if (config) {
        console.log('  Node ID:', config.nodeId);
        console.log('  P2P port:', config.p2pPort);
        console.log('  Seed peers:', config.seedPeers.length);
        console.log('  Validators:', config.validators.length);
    }
}

// ── export-genesis: 제네시스 + 상태 내보내기 ──

function cmdExportGenesis() {
    const storage = new ChainStorage(DATA_DIR);
    if (!storage.hasChain()) {
        console.error('No chain found.');
        process.exit(1);
    }
    const genesis = storage.getBlock(0);
    const state = storage.getState();
    const exportFile = path.join(DATA_DIR, 'genesis-export.json');
    fs.writeFileSync(exportFile, JSON.stringify({ genesis, state, exportedAt: new Date().toISOString() }, null, 2));
    console.log('Genesis exported to:', exportFile);
    console.log('Share this file with other nodes to join the network.');
}

// ── import-genesis: 다른 노드의 제네시스 가져오기 ──

function cmdImportGenesis(file) {
    if (!file || !fs.existsSync(file)) {
        console.error('Usage: node chain/deploy.js import-genesis <file>');
        process.exit(1);
    }
    ensureDir(DATA_DIR);
    const storage = new ChainStorage(DATA_DIR);
    if (storage.hasChain()) {
        console.error('Chain already exists. Use reset first.');
        process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    storage.putBlock(data.genesis);
    storage.putState(data.state);
    console.log('Genesis imported. Height:', storage.getHeight());
    console.log('Genesis hash:', storage.getGenesisHash()?.slice(0, 16) + '...');
}

// ── keygen: 추가 검증자 키 생성 ──

function cmdKeygen() {
    const kp = crypto.generateKeypair();
    const addr = crypto.publicKeyToAddress(kp.publicKey);
    const output = {
        address: addr,
        publicKey: kp.publicKey.toString('hex'),
        privateKey: kp.privateKey.toString('hex'),
        createdAt: new Date().toISOString(),
    };
    console.log(JSON.stringify(output, null, 2));
    console.log();
    console.log('Address:', addr);
    console.log('Add this public key to validators list in node-config.json');
}

// ── node-config: 설정 파일 생성/표시 ──

function cmdNodeConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        console.log(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } else {
        console.log('No config found. Run: node chain/deploy.js init');
    }
}

// ── CLI ──

const cmd = process.argv[2];
switch (cmd) {
    case 'init':           cmdInit(); break;
    case 'status':         cmdStatus(); break;
    case 'export-genesis': cmdExportGenesis(); break;
    case 'import-genesis': cmdImportGenesis(process.argv[3]); break;
    case 'keygen':         cmdKeygen(); break;
    case 'node-config':    cmdNodeConfig(); break;
    default:
        console.log('CrownyCell Chain Deploy Tool');
        console.log('Commands: init, status, export-genesis, import-genesis <file>, keygen, node-config');
}
