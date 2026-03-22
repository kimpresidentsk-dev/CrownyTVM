// ═══════════════════════════════════════════════════════════════
// bank-system.js — 3중 계정 시스템 (Treasury → Banks → Admins)
//
// Level 1: TREASURY — 총자산 보유, 일일 분배 한도
// Level 2: BANKS — 국가/컨셉/서비스별 거래 은행
// Level 3: ADMINS — 관리자 (전송/세팅/교육/CS)
// ═══════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');

const BANK_FILE = path.join(__dirname, 'data', 'bank-system.json');

// ── 기본 구조 ──

const DEFAULT_DATA = {
    treasury: {
        id: 'treasury',
        level: 1,
        label: 'Crowny Treasury',
        balances: { CRN: 23_100_000_000, FNC: 77_700_000_000, CRM: 77_700_000_000 },
        dailyLimit: { CRN: 100_000_000, FNC: 500_000_000, CRM: 1_000_000_000 },
        todayDistributed: { CRN: 0, FNC: 0, CRM: 0 },
        lastResetDate: null,
    },
    banks: {},
    admins: {},
    donationPool: { balances: { CRN: 0, FNC: 0, CRM: 0 } },
    auditLog: [],
};

class BankSystem {
    constructor() {
        this.data = this._load();
    }

    // ═══ Level 1: TREASURY ═══

    getTreasury() {
        this._resetDailyIfNeeded();
        return { ...this.data.treasury };
    }

    // Treasury → Bank 분배 (일일 한도 체크)
    treasuryToBank(bankId, currency, amount, adminUser) {
        this._resetDailyIfNeeded();
        const t = this.data.treasury;
        const bank = this.data.banks[bankId];
        if (!bank) return { error: `Bank '${bankId}' not found` };
        if (!['CRN', 'FNC', 'CRM'].includes(currency)) return { error: 'Invalid currency' };
        if (amount <= 0) return { error: 'Amount must be positive' };
        if ((t.balances[currency] || 0) < amount) return { error: `Treasury insufficient ${currency}` };

        // 일일 한도 체크
        const todayUsed = (t.todayDistributed[currency] || 0) + amount;
        if (todayUsed > (t.dailyLimit[currency] || 0)) {
            return { error: `Daily limit exceeded for ${currency}: ${t.dailyLimit[currency].toLocaleString()}/day` };
        }

        // 실행
        t.balances[currency] -= amount;
        t.todayDistributed[currency] = todayUsed;
        bank.balances[currency] = (bank.balances[currency] || 0) + amount;

        this._audit('treasury_to_bank', adminUser, { bankId, currency, amount });
        this._save();
        return { success: true, treasury: t.balances, bank: bank.balances };
    }

    // ═══ Level 2: BANKS ═══

    createBank(bankId, config) {
        if (this.data.banks[bankId]) return { error: 'Bank already exists' };
        this.data.banks[bankId] = {
            id: bankId,
            level: 2,
            label: config.label || bankId,
            category: config.category || 'general', // country/concept/service
            region: config.region || null,           // kr, bd, us, global
            balances: { CRN: 0, FNC: 0, CRM: 0 },
            transactionLimit: config.transactionLimit || { CRN: 10_000, FNC: 100_000, CRM: 1_000_000 },
            totalDistributed: { CRN: 0, FNC: 0, CRM: 0 },
            created: Date.now(),
        };
        this._audit('bank_created', 'system', { bankId, config });
        this._save();
        return { success: true, bank: this.data.banks[bankId] };
    }

    getBank(bankId) {
        return this.data.banks[bankId] || null;
    }

    listBanks() {
        return Object.values(this.data.banks);
    }

    // Bank → User 전송 (거래 한도 체크)
    bankToUser(bankId, toUser, currency, amount, adminUser, memo) {
        const bank = this.data.banks[bankId];
        if (!bank) return { error: `Bank '${bankId}' not found` };
        if ((bank.balances[currency] || 0) < amount) return { error: `Bank insufficient ${currency}` };

        const limit = bank.transactionLimit[currency] || 0;
        if (amount > limit) return { error: `Transaction limit: ${limit.toLocaleString()} ${currency}` };

        bank.balances[currency] -= amount;
        bank.totalDistributed[currency] = (bank.totalDistributed[currency] || 0) + amount;

        this._audit('bank_to_user', adminUser, { bankId, toUser, currency, amount, memo });
        this._save();
        return { success: true, bankBalance: bank.balances, toUser, amount, currency };
    }

    // ═══ Level 3: ADMINS ═══

    registerAdmin(username, config) {
        this.data.admins[username] = {
            username,
            level: 3,
            role: config.role || 'general',  // transfer/settings/education/cs
            permissions: config.permissions || ['transfer', 'education', 'cs'],
            assignedBanks: config.assignedBanks || [],
            created: Date.now(),
        };
        this._audit('admin_registered', 'system', { username, role: config.role });
        this._save();
        return { success: true };
    }

    getAdmin(username) {
        return this.data.admins[username] || null;
    }

    listAdmins() {
        return Object.values(this.data.admins);
    }

    // Admin 권한 체크
    canAdmin(username, action, bankId) {
        const admin = this.data.admins[username];
        if (!admin) return false;
        if (!admin.permissions.includes(action) && !admin.permissions.includes('all')) return false;
        if (bankId && admin.assignedBanks.length > 0 && !admin.assignedBanks.includes(bankId)) return false;
        return true;
    }

    // ═══ 기부풀 ═══

    getDonationPool() {
        return { ...this.data.donationPool };
    }

    addDonation(currency, amount, fromUser, reason) {
        this.data.donationPool.balances[currency] = (this.data.donationPool.balances[currency] || 0) + amount;
        this._audit('donation', fromUser, { currency, amount, reason });
        this._save();
    }

    // ═══ 감사 로그 ═══

    getAuditLog(limit = 50) {
        return this.data.auditLog.slice(-limit).reverse();
    }

    // ═══ 통계 ═══

    stats() {
        const t = this.data.treasury;
        const banks = Object.values(this.data.banks);
        const totalBankBalances = { CRN: 0, FNC: 0, CRM: 0 };
        banks.forEach(b => {
            totalBankBalances.CRN += b.balances.CRN || 0;
            totalBankBalances.FNC += b.balances.FNC || 0;
            totalBankBalances.CRM += b.balances.CRM || 0;
        });
        return {
            treasury: t.balances,
            treasuryDailyRemaining: {
                CRN: (t.dailyLimit.CRN || 0) - (t.todayDistributed.CRN || 0),
                FNC: (t.dailyLimit.FNC || 0) - (t.todayDistributed.FNC || 0),
                CRM: (t.dailyLimit.CRM || 0) - (t.todayDistributed.CRM || 0),
            },
            banksCount: banks.length,
            banksTotalBalance: totalBankBalances,
            adminsCount: Object.keys(this.data.admins).length,
            donationPool: this.data.donationPool.balances,
            auditLogSize: this.data.auditLog.length,
        };
    }

    // ═══ 내부 ═══

    _resetDailyIfNeeded() {
        const today = new Date().toISOString().slice(0, 10);
        if (this.data.treasury.lastResetDate !== today) {
            this.data.treasury.todayDistributed = { CRN: 0, FNC: 0, CRM: 0 };
            this.data.treasury.lastResetDate = today;
        }
    }

    _audit(action, user, details) {
        this.data.auditLog.push({
            action, user, details,
            timestamp: Date.now(),
            date: new Date().toISOString(),
        });
        // 최대 1000건 유지
        if (this.data.auditLog.length > 1000) {
            this.data.auditLog = this.data.auditLog.slice(-500);
        }
    }

    _save() {
        const tmp = BANK_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
        fs.renameSync(tmp, BANK_FILE);
    }

    _load() {
        if (fs.existsSync(BANK_FILE)) {
            try { return JSON.parse(fs.readFileSync(BANK_FILE, 'utf8')); } catch {}
        }
        return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
}

module.exports = { BankSystem };
