// ===== notifications.js v1.2 - 통합 알림 시스템 =====

const NOTIF_TYPES = {
    MESSENGER: 'messenger',
    SOCIAL_COMMENT: 'social_comment',
    SOCIAL_LIKE: 'social_like',
    SOCIAL_FOLLOW: 'social_follow',
    SOCIAL_MENTION: 'social_mention',
    TRADING_SIGNAL: 'trading_signal',
    TRADING_ORDER: 'trading_order',
    ORDER_STATUS: 'order_status',
    ART_SOLD: 'art_sold',
    BOOK_SOLD: 'book_sold',
    DONATION: 'donation',
    FRIEND_REQUEST: 'friend_request',
    MALL_ORDER: 'mall_order',
    MALL_RETURN: 'mall_return',
    MALL_REVIEW: 'mall_review',
    MALL_PRODUCT: 'mall_product',
    SYSTEM: 'system'
};

const NOTIF_STYLES = {
    [NOTIF_TYPES.MESSENGER]: { icon: 'message-circle', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.messenger','Messenger') },
    [NOTIF_TYPES.SOCIAL_COMMENT]: { icon: 'message-circle', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.comment','Comment') },
    [NOTIF_TYPES.SOCIAL_LIKE]: { icon: 'heart', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.like','Like') },
    [NOTIF_TYPES.SOCIAL_FOLLOW]: { icon: 'user', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.follow','Follow') },
    [NOTIF_TYPES.SOCIAL_MENTION]: { icon: 'at-sign', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.mention','Mention') },
    [NOTIF_TYPES.TRADING_SIGNAL]: { icon: 'bar-chart-3', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #F0C060)', label: t('notif.signal','Signal') },
    [NOTIF_TYPES.TRADING_ORDER]: { icon: 'trending-up', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.order','Order') },
    [NOTIF_TYPES.ORDER_STATUS]: { icon: 'package', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.order_status','Order Status') },
    [NOTIF_TYPES.ART_SOLD]: { icon: 'palette', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.art_sold','Art Sold') },
    [NOTIF_TYPES.BOOK_SOLD]: { icon: 'book', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.book_sold','Book Sold') },
    [NOTIF_TYPES.DONATION]: { icon: 'heart', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.donation','Donation') },
    [NOTIF_TYPES.FRIEND_REQUEST]: { icon: 'handshake', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.friend_request','Friend Request') },
    [NOTIF_TYPES.SYSTEM]: { icon: 'bell', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.system','System') },
};

// Client-side notification store (session only)
let notifications = [];
let unreadCount = 0;
let notifPanelOpen = false;
const MAX_NOTIFICATIONS = 50;

// Default settings (all ON)
let notificationSettings = {
    messenger: true,
    social_comment: true,
    social_like: true,
    social_follow: true,
    social_mention: true,
    trading_signal: true,
    trading_order: true,
    order_status: true,
    art_sold: true,
    book_sold: true,
    donation: true,
    friend_request: true,
    system: true
};

// ========== CORE ==========

function addNotification(type, message, data = {}) {
    if (!notificationSettings[type]) return;

    const style = NOTIF_STYLES[type] || NOTIF_STYLES.system;
    const notif = {
        id: Date.now() + Math.random(),
        type,
        message,
        data,
        read: false,
        createdAt: new Date()
    };

    notifications.unshift(notif);
    if (notifications.length > MAX_NOTIFICATIONS) notifications.pop();

    unreadCount = notifications.filter(n => !n.read).length;
    updateBellBadge();
    if (notifPanelOpen) renderNotifPanel();

    // Show toast
    showNotifToast(type, message, data);
}

function showNotifToast(type, message, data) {
    const style = NOTIF_STYLES[type] || NOTIF_STYLES.system;
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast notif-toast';
    toast.style.cssText = `background:${style.bg}; cursor:pointer; display:flex; align-items:center; gap:0.5rem;`;
    toast.innerHTML = `<i data-lucide="${style.icon}" style="width:20px;height:20px;flex-shrink:0;"></i><span style="flex:1; font-size:0.85rem;">${message}</span>`;
    toast.onclick = () => {
        toast.remove();
        handleNotifClick(type, data);
    };
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fadeout');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function handleNotifClick(type, data) {
    if (type === NOTIF_TYPES.MESSENGER && data.chatId && data.otherId) {
        showPage('messenger');
        setTimeout(() => openChat(data.chatId, data.otherId), 300);
    } else if (type === NOTIF_TYPES.SOCIAL_COMMENT || type === NOTIF_TYPES.SOCIAL_LIKE || type === NOTIF_TYPES.SOCIAL_FOLLOW || type === NOTIF_TYPES.SOCIAL_MENTION) {
        showPage('social');
    } else if (type === NOTIF_TYPES.TRADING_SIGNAL || type === NOTIF_TYPES.TRADING_ORDER) {
        showPage('prop-trading');
    } else if (type === NOTIF_TYPES.ORDER_STATUS) {
        showPage('mall');
    } else if (type === NOTIF_TYPES.ART_SOLD) {
        showPage('art');
    } else if (type === NOTIF_TYPES.BOOK_SOLD) {
        showPage('books');
    } else if (type === NOTIF_TYPES.DONATION) {
        showPage('fundraise');
    } else if (type === NOTIF_TYPES.FRIEND_REQUEST) {
        showPage('social');
    }
}

// ========== FIRESTORE NOTIFICATION HELPER ==========

/**
 * createNotification - Firestore에 알림 저장 + 로컬 표시
 * @param {string} userId - 알림 받을 사용자 UID
 * @param {string} type - NOTIF_TYPES 중 하나
 * @param {object} data - { message, ...extra }
 */
async function createNotification(userId, type, data = {}) {
    if (!userId) return;
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        if (token) {
            fetch('/api/notifications', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, type, message: data.message || '', data })
            }).catch(() => {});
        }

        // 현재 사용자에게 해당하면 로컬에도 표시
        if (currentUser && userId === currentUser.uid) {
            addNotification(type, data.message || '', data);
        }
    } catch (e) {
        console.warn(t('notif.create_fail','createNotification failed') + ':', e);
    }
}

// ========== BELL UI ==========

function initNotifBell() {
    // Insert bell into sidebar, after user-info
    const userInfo = document.getElementById('user-info');
    if (!userInfo || document.getElementById('notif-bell-container')) return;

    const bellContainer = document.createElement('div');
    bellContainer.id = 'notif-bell-container';
    bellContainer.style.cssText = 'padding:0.5rem 1rem; position:relative;';
    bellContainer.innerHTML = `
        <button id="notif-bell-btn" onclick="toggleNotifPanel()" style="background:#3D2B1F; border:1px solid #6B5744; border-radius:10px; padding:0.5rem 0.8rem; cursor:pointer; font-size:1rem; width:100%; display:flex; align-items:center; gap:0.5rem; position:relative; color:#E8D5C4;">
            <i data-lucide="bell" style="width:16px;height:16px;"></i> <span style="font-size:0.85rem; flex:1; text-align:left;">${t('notif.title','Notifications')}</span>
            <span id="notif-badge" style="display:none; background:#B54534; color:#FFF8F0; font-size:0.65rem; font-weight:700; padding:0.1rem 0.4rem; border-radius:10px; min-width:16px; text-align:center;">0</span>
        </button>
        <div id="notif-panel" style="display:none; position:fixed; left:60px; top:auto; z-index:99999; margin-top:0.3rem; background:var(--bg-card, white); border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.3); border:1px solid var(--border); max-height:70vh; overflow-y:auto; width:320px;">
            <div id="notif-panel-header" style="padding:0.8rem 1rem; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; background:#FFF8F0; border-radius:12px 12px 0 0;">
                <strong style="font-size:0.9rem;"><i data-lucide="bell" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${t('notif.title','Notifications')}</strong>
                <div style="display:flex; gap:0.5rem;">
                    <button onclick="markAllRead()" style="background:none; border:none; color:#3D2B1F; font-size:0.75rem; cursor:pointer; font-weight:600;">${t('notif.mark_all_read','Mark all read')}</button>
                    <button onclick="openNotifSettings()" style="background:none; border:none; color:#6B5744; font-size:0.85rem; cursor:pointer;"><i data-lucide="settings" style="width:14px;height:14px;"></i></button>
                </div>
            </div>
            <div id="notif-list"></div>
        </div>`;
    userInfo.after(bellContainer);
}

function updateBellBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    if (unreadCount > 0) {
        badge.style.display = 'inline-block';
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    } else {
        badge.style.display = 'none';
    }
}

function toggleNotifPanel() {
    notifPanelOpen = !notifPanelOpen;
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    if (notifPanelOpen) {
        // 벨 버튼 위치 기준으로 패널 배치
        const bell = document.getElementById('notif-bell-btn');
        if (bell) {
            const rect = bell.getBoundingClientRect();
            panel.style.top = (rect.bottom + 4) + 'px';
            panel.style.left = Math.max(rect.left, 8) + 'px';
        }
        panel.style.display = 'block';
        renderNotifPanel();
    } else {
        panel.style.display = 'none';
    }
}

function renderNotifPanel() {
    const list = document.getElementById('notif-list');
    if (!list) return;

    if (notifications.length === 0) {
        list.innerHTML = `<div style="padding:2rem; text-align:center; color:var(--accent); font-size:0.85rem;">${t('notif.empty','No notifications')}</div>`;
        return;
    }

    list.innerHTML = notifications.slice(0, 20).map(n => {
        const style = NOTIF_STYLES[n.type] || NOTIF_STYLES.system;
        const timeAgo = getNotifTimeAgo(n.createdAt);
        return `
            <div onclick="onNotifItemClick('${n.id}')" style="padding:0.7rem 1rem; border-bottom:1px solid rgba(0,0,0,0.04); cursor:pointer; display:flex; gap:0.6rem; align-items:flex-start; background:${n.read ? "white" : "rgba(33,150,243,0.04)"}; transition:background 0.15s;" onmouseenter="this.style.background='var(--bg)'" onmouseleave="this.style.background='${n.read ? "white" : "rgba(33,150,243,0.04)"}'">
                <i data-lucide="${style.icon}" style="width:20px;height:20px;flex-shrink:0;margin-top:0.1rem;"></i>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:0.82rem; line-height:1.4; color:var(--text); ${n.read ? '' : 'font-weight:600;'}">${n.message}</div>
                    <div style="font-size:0.68rem; color:var(--accent); margin-top:0.2rem;">${timeAgo}</div>
                </div>
                ${n.read ? '' : '<span style="width:8px; height:8px; border-radius:50%; background:#5B7B8C; flex-shrink:0; margin-top:0.3rem;"></span>'}
            </div>`;
    }).join('');
}

function onNotifItemClick(id) {
    const notif = notifications.find(n => String(n.id) === String(id));
    if (!notif) return;
    notif.read = true;
    unreadCount = notifications.filter(n => !n.read).length;
    updateBellBadge();
    renderNotifPanel();
    toggleNotifPanel();
    handleNotifClick(notif.type, notif.data);
}

function markAllRead() {
    notifications.forEach(n => n.read = true);
    unreadCount = 0;
    updateBellBadge();
    renderNotifPanel();
}

function getNotifTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return t('notif.just_now','Just now');
    if (seconds < 3600) return `${Math.floor(seconds / 60)}${t('notif.min_ago','m ago')}`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}${t('notif.hr_ago','h ago')}`;
    return `${Math.floor(seconds / 86400)}${t('notif.day_ago','d ago')}`;
}

// Close panel when clicking outside
document.addEventListener('click', (e) => {
    if (!notifPanelOpen) return;
    const container = document.getElementById('notif-bell-container');
    if (container && !container.contains(e.target)) {
        notifPanelOpen = false;
        const panel = document.getElementById('notif-panel');
        if (panel) panel.style.display = 'none';
    }
});

// ========== NOTIFICATION SETTINGS ==========

async function loadNotificationSettings() {
    if (!currentUser) return;
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        if (token) {
            const resp = await fetch('/api/profile', { headers: { 'Authorization': 'Bearer ' + token } });
            if (resp.ok) {
                const data = await resp.json();
                if (data.notificationSettings) {
                    notificationSettings = { ...notificationSettings, ...data.notificationSettings };
                }
            }
        }
    } catch (e) {
        console.warn(t('notif.settings_load_fail','Notification settings load failed') + ':', e);
    }
}

async function saveNotificationSettings() {
    if (!currentUser) return;
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        const resp = await fetch('/api/profile/settings', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ notificationSettings })
        });
        if (!resp.ok) throw new Error('Failed');
        showToast(t('notif.settings_saved','Notification settings saved'), 'success');
    } catch (e) {
        showToast(t('notif.settings_fail','Notification settings save failed'), 'error');
    }
}

function openNotifSettings() {
    if (notifPanelOpen) toggleNotifPanel();

    const overlay = document.createElement('div');
    overlay.id = 'notif-settings-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const items = [
        { key: 'messenger', icon: '<i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>', label: t('notif.set.messenger','Messenger Messages') },
        { key: 'social_comment', icon: '<i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>', label: t('notif.set.comment','Social Comments') },
        { key: 'social_like', icon: '<i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>', label: t('notif.set.like','Social Likes') },
        { key: 'social_follow', icon: '<i data-lucide="user" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>', label: t('notif.set.follow','Follow') },
        { key: 'social_mention', icon: '<i data-lucide="megaphone" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>', label: t('notif.set.mention','Mention') },
        { key: 'trading_signal', icon: '<i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>', label: t('notif.set.signal','Trading Signal') },
        { key: 'trading_order', icon: '<i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>', label: t('notif.set.order','Order Fill/Close') },
        { key: 'order_status', icon: '<i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>', label: t('notif.set.order_status','Order Status Change') },
        { key: 'art_sold', icon: '<i data-lucide="palette" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>', label: t('notif.set.art_sold','Art Sale') },
        { key: 'book_sold', icon: '<i data-lucide="book" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>', label: t('notif.set.book_sold','Book Sale') },
        { key: 'donation', icon: '<i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>', label: t('notif.set.donation','Donation Alert') },
        { key: 'friend_request', icon: '<i data-lucide="handshake" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>', label: t('notif.set.friend','Friend Request') },
        { key: 'system', icon: '<i data-lucide="bell" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>', label: t('notif.set.system','System Alert') },
    ];

    overlay.innerHTML = `
    <div style="background:#FFF8F0;padding:1.5rem;border-radius:16px;max-width:400px;width:100%;">
        <h3 style="margin-bottom:1rem;">${t('notif.settings_title','Notification Settings')}</h3>
        <div style="display:grid; gap:0.6rem;">
            ${items.map(i => `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:0.6rem 0.8rem; background:var(--bg); border-radius:10px;">
                    <span style="font-size:0.9rem;">${i.icon} ${i.label}</span>
                    <label style="position:relative; width:44px; height:24px; cursor:pointer;">
                        <input type="checkbox" id="notif-toggle-${i.key}" ${notificationSettings[i.key] ? 'checked' : ''} onchange="notificationSettings['${i.key}']=this.checked" style="opacity:0;width:0;height:0;">
                        <span class="notif-toggle-slider"></span>
                    </label>
                </div>
            `).join('')}
        </div>
        <div style="display:flex;gap:0.5rem;margin-top:1rem;">
            <button onclick="document.getElementById('notif-settings-modal').remove()" style="flex:1;padding:0.7rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#FFF8F0;">${t('common.cancel','Cancel')}</button>
            <button onclick="saveNotificationSettings();document.getElementById('notif-settings-modal').remove()" style="flex:1;padding:0.7rem;border:none;border-radius:8px;cursor:pointer;background:#3D2B1F;color:#FFF8F0;font-weight:700;">${t('common.save','Save')}</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
}

// ========== MESSENGER NOTIFICATION HOOK ==========

let _messengerNotifListeners = [];

function setupMessengerNotifications() {
    // Messenger notifications are handled via WebSocket (ws/chat) — no Firestore needed
    // The chat system already pushes real-time messages through WebSocket
}

// ========== SOCIAL NOTIFICATION HOOKS ==========

let _socialNotifListeners = [];
let _myPostIds = new Set();
let _myPostsLoaded = false;

async function setupSocialNotifications() {
    // Social notifications (likes, comments) are delivered via server notifications API
    // Polling is handled in setupServerNotificationPolling()
    _myPostsLoaded = true;
}

// ========== TRADING NOTIFICATION HOOK ==========

// Hook into mentor signal change toast (already in mentors.js)
// We override to also push to notification system
const _origShowToast = window.showToast;
if (_origShowToast) {
    // We'll patch mentors.js signal change detection in updateMentorAnalysis
    // Instead, we hook addNotification calls from mentors.js via a global flag
}

// Called from mentors.js when signal changes
function notifyTradingSignal(mentorName, oldSignal, newSignal) {
    const signalKo = { buy: t('mentor.buy','Buy'), sell: t('mentor.sell','Sell'), hold: t('mentor.hold','Hold'), wait: t('mentor.wait','Wait') };
    addNotification(NOTIF_TYPES.TRADING_SIGNAL, `${mentorName}: ${signalKo[oldSignal] || oldSignal} → ${signalKo[newSignal] || newSignal}`, {});
}

function notifyTradingOrder(message) {
    addNotification(NOTIF_TYPES.TRADING_ORDER, message, {});
}

// ========== COMMENT NOTIFICATION (hook into addComment) ==========

// Comment notifications are handled server-side when comments are posted
async function setupCommentNotifications() {
    // No-op: notifications delivered via polling from /api/notifications
}

// ========== FIRESTORE REALTIME NOTIFICATION LISTENER ==========

let _notifPollInterval = null;

function setupServerNotificationPolling() {
    if (!currentUser) return;
    // Load existing notifications once
    fetchServerNotifications();
    // Poll every 30 seconds
    _notifPollInterval = setInterval(fetchServerNotifications, 30000);
}

async function fetchServerNotifications() {
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        if (!token) return;
        const resp = await fetch('/api/notifications', { headers: { 'Authorization': 'Bearer ' + token } });
        if (!resp.ok) return;
        const { items } = await resp.json();
        // Add new unread notifications
        items.filter(n => !n.read).forEach(n => {
            if (!notifications.find(x => x.id === n.id)) {
                const notif = { id: n.id, type: n.type, message: n.message, data: n.data || {}, read: false, createdAt: new Date(n.createdAt) };
                notifications.unshift(notif);
                // Toast only for recent (<30s)
                if (Date.now() - n.createdAt < 30000) {
                    showNotifToast(n.type, n.message, n.data || {});
                }
            }
        });
        if (notifications.length > MAX_NOTIFICATIONS) notifications.splice(MAX_NOTIFICATIONS);
        unreadCount = notifications.filter(n => !n.read).length;
        updateBellBadge();
        if (notifPanelOpen) renderNotifPanel();
    } catch (e) { /* ignore */ }
}

// Mark notification as read on server
async function markNotifReadOnServer(notifId) {
    if (!notifId) return;
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        fetch('/api/notifications/read', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ notifId })
        }).catch(() => {});
    } catch (e) { /* ignore */ }
}

// Legacy alias
function setupFirestoreNotifications() { setupServerNotificationPolling(); }
function markNotifReadInFirestore(docId) { markNotifReadOnServer(docId); }

// ========== INIT ==========

async function initNotifications() {
    await loadNotificationSettings();
    initNotifBell();
    setupMessengerNotifications();
    setupFirestoreNotifications();
    
    // Delay social notifications to let posts load
    setTimeout(async () => {
        await setupSocialNotifications();
        await setupCommentNotifications();
    }, 3000);

    console.log('🔔 ' + t('notif.init_complete','Notification system v1.2 initialized'));
}

// Cleanup on logout
function cleanupNotifications() {
    if (_notifPollInterval) { clearInterval(_notifPollInterval); _notifPollInterval = null; }
    _messengerNotifListeners = [];
    _socialNotifListeners = [];
    notifications = [];
    unreadCount = 0;
    _myPostIds.clear();
    _myPostsLoaded = false;
    updateBellBadge();
}
