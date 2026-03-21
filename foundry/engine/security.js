// ═══════════════════════════════════════════════════════════════
// CrownyCore — 국방급 보안 모듈
//
// 1. ARIA-256-CBC 암호화 (국가정보원 인증 국산 알고리즘)
// 2. 감사 로그 (변조 방지, SHA-256 체인)
// 3. 비밀등급 접근 제어 (Bell-LaPadula)
// 4. JWT 인증
//
// 외부 의존: 0 (Node.js crypto 내장)
// ═══════════════════════════════════════════════════════════════

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ═══ 1. ARIA-256 암호화 ═══

const ALGO = 'aria-256-cbc';
const IV_LEN = 16;

function deriveKey(password) {
  return crypto.scryptSync(password, 'crownycore-defense-salt', 32);
}

function encrypt(text, password) {
  const key = deriveKey(password);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText, password) {
  const key = deriveKey(password);
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  let decrypted = decipher.update(parts[1], 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ═══ 2. 감사 로그 (Tamper-proof Audit Log) ═══

class AuditLog {
  constructor(logDir) {
    this.logDir = logDir || path.join(__dirname, '..', '..', 'data', 'audit');
    if (!fs.existsSync(this.logDir)) fs.mkdirSync(this.logDir, { recursive: true });
    this.lastHash = '0000000000000000000000000000000000000000000000000000000000000000';
    this._loadLastHash();
  }

  _logFile() {
    const date = new Date().toISOString().slice(0, 10);
    return path.join(this.logDir, `${date}.log`);
  }

  _loadLastHash() {
    try {
      const files = fs.readdirSync(this.logDir).filter(f => f.endsWith('.log')).sort();
      if (files.length > 0) {
        const lastFile = path.join(this.logDir, files[files.length - 1]);
        const lines = fs.readFileSync(lastFile, 'utf8').trim().split('\n');
        if (lines.length > 0) {
          const last = JSON.parse(lines[lines.length - 1]);
          this.lastHash = last.hash || this.lastHash;
        }
      }
    } catch {}
  }

  // 감사 항목 기록 — SHA-256 체인으로 변조 방지
  log(action, user, detail, classification) {
    const entry = {
      seq: Date.now(),
      ts: new Date().toISOString(),
      action,             // CREATE, READ, UPDATE, DELETE, LOGIN, EXPORT, DECISION
      user: user || 'system',
      detail: typeof detail === 'string' ? detail : JSON.stringify(detail),
      classification: classification || 'UNCLASSIFIED',
      prevHash: this.lastHash,
    };

    // SHA-256 해시 체인
    const content = `${entry.seq}|${entry.ts}|${entry.action}|${entry.user}|${entry.detail}|${entry.classification}|${entry.prevHash}`;
    entry.hash = crypto.createHash('sha256').update(content).digest('hex');
    this.lastHash = entry.hash;

    // append-only 기록
    fs.appendFileSync(this._logFile(), JSON.stringify(entry) + '\n');
    return entry;
  }

  // 무결성 검증
  verify(date) {
    const file = path.join(this.logDir, `${date || new Date().toISOString().slice(0, 10)}.log`);
    if (!fs.existsSync(file)) return { valid: false, error: '파일 없음' };

    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    let prevHash = null;
    let valid = true;
    let broken = -1;

    for (let i = 0; i < lines.length; i++) {
      const entry = JSON.parse(lines[i]);
      const content = `${entry.seq}|${entry.ts}|${entry.action}|${entry.user}|${entry.detail}|${entry.classification}|${entry.prevHash}`;
      const computed = crypto.createHash('sha256').update(content).digest('hex');

      if (computed !== entry.hash) {
        valid = false;
        broken = i;
        break;
      }

      if (prevHash !== null && entry.prevHash !== prevHash) {
        valid = false;
        broken = i;
        break;
      }

      prevHash = entry.hash;
    }

    return { valid, entries: lines.length, broken };
  }

  // 최근 로그 조회
  recent(limit = 50) {
    const files = fs.readdirSync(this.logDir).filter(f => f.endsWith('.log')).sort().reverse();
    const entries = [];
    for (const file of files) {
      const lines = fs.readFileSync(path.join(this.logDir, file), 'utf8').trim().split('\n');
      for (const line of lines.reverse()) {
        try { entries.push(JSON.parse(line)); } catch {}
        if (entries.length >= limit) break;
      }
      if (entries.length >= limit) break;
    }
    return entries;
  }
}

// ═══ 3. 비밀등급 접근 제어 (Bell-LaPadula) ═══

const CLASSIFICATION = Object.freeze({
  UNCLASSIFIED: 0,  // 일반
  RESTRICTED:   1,  // 대외비
  CONFIDENTIAL: 2,  // 3급비밀
  SECRET:       3,  // 2급비밀
  TOP_SECRET:   4,  // 1급비밀
});

const CLASS_NAME = Object.freeze({
  [CLASSIFICATION.UNCLASSIFIED]: '일반',
  [CLASSIFICATION.RESTRICTED]:   '대외비',
  [CLASSIFICATION.CONFIDENTIAL]: '3급비밀',
  [CLASSIFICATION.SECRET]:       '2급비밀',
  [CLASSIFICATION.TOP_SECRET]:   '1급비밀',
});

// Bell-LaPadula: no read up, no write down
function canRead(userLevel, dataLevel) {
  return userLevel >= dataLevel;  // 상위 등급만 하위 읽기 가능
}

function canWrite(userLevel, dataLevel) {
  return userLevel <= dataLevel;  // 하위 등급은 상위에만 쓰기 가능
}

// ═══ 4. JWT 인증 ═══

const JWT_SECRET = crypto.randomBytes(32).toString('hex');
const JWT_EXPIRY = 24 * 3600 * 1000; // 24시간

function createToken(userId, userName, clearanceLevel) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    name: userName,
    level: clearanceLevel,
    iat: Date.now(),
    exp: Date.now() + JWT_EXPIRY,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  try {
    const [header, payload, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
    if (signature !== expected) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}

// ═══ 5. 사용자 관리 ═══

class UserStore {
  constructor(filePath) {
    this.filePath = filePath || path.join(__dirname, '..', '..', 'data', 'users.json');
    this.users = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        this.users = Array.isArray(data) ? data : [];
      }
    } catch { this.users = []; }
  }

  _save() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.users, null, 2));
  }

  register(username, password, clearanceLevel = 0) {
    if (this.users.find(u => u.username === username)) return null;
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const user = {
      id: this.users.length + 1,
      username,
      passwordHash: `${salt}:${hash}`,
      clearanceLevel,
      createdAt: Date.now(),
    };
    this.users.push(user);
    this._save();
    return { id: user.id, username: user.username, clearanceLevel: user.clearanceLevel };
  }

  authenticate(username, password) {
    const user = this.users.find(u => u.username === username);
    if (!user) return null;
    const [salt, hash] = user.passwordHash.split(':');
    const computed = crypto.scryptSync(password, salt, 64).toString('hex');
    if (computed !== hash) return null;
    return { id: user.id, username: user.username, clearanceLevel: user.clearanceLevel };
  }

  getUser(id) {
    const u = this.users.find(u => u.id === id);
    return u ? { id: u.id, username: u.username, clearanceLevel: u.clearanceLevel } : null;
  }

  listUsers() {
    return this.users.map(u => ({ id: u.id, username: u.username, clearanceLevel: u.clearanceLevel, levelName: CLASS_NAME[u.clearanceLevel] }));
  }
}

module.exports = {
  // 암호화
  encrypt, decrypt, ALGO,
  // 감사
  AuditLog,
  // 비밀등급
  CLASSIFICATION, CLASS_NAME, canRead, canWrite,
  // 인증
  createToken, verifyToken, UserStore,
};
