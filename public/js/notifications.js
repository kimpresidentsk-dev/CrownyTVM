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
    [NOTIF_TYPES.MESSENGER]: { icon: 'message-circle', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.messenger','메신저') },
    [NOTIF_TYPES.SOCIAL_COMMENT]: { icon: 'message-circle', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.comment','댓글') },
    [NOTIF_TYPES.SOCIAL_LIKE]: { icon: 'heart', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.like','좋아요') },
    [NOTIF_TYPES.SOCIAL_FOLLOW]: { icon: 'user', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.follow','팔로우') },
    [NOTIF_TYPES.SOCIAL_MENTION]: { icon: 'at-sign', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.mention','멘션') },
    [NOTIF_TYPES.TRADING_SIGNAL]: { icon: 'bar-chart-3', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #F0C060)', label: t('notif.signal','시그널') },
    [NOTIF_TYPES.TRADING_ORDER]: { icon: 'trending-up', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.order','주문') },
    [NOTIF_TYPES.ORDER_STATUS]: { icon: 'package', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.order_status','주문상태') },
    [NOTIF_TYPES.ART_SOLD]: { icon: 'palette', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.art_sold','작품판매') },
    [NOTIF_TYPES.BOOK_SOLD]: { icon: 'book', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.book_sold','책판매') },
    [NOTIF_TYPES.DONATION]: { icon: 'heart', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.donation','기부') },
    [NOTIF_TYPES.FRIEND_REQUEST]: { icon: 'handshake', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.friend_request','친구요청') },
    [NOTIF_TYPES.SYSTEM]: { icon: 'bell', color: '#8B6914', bg: 'linear-gradient(135deg, #8B6914, #6B5744)', label: t('notif.system','시스템') },
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
        const notifData = {
            userId,
            type,
            message: data.message || '',
            data: data,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('notifications').add(notifData);

        // 현재 사용자에게 해당하면 로컬에도 표시
        if (currentUser && userId === currentUser.uid) {
            addNotification(type, data.message || '', data);
        }
    } catch (e) {
        console.warn('createNotification 실패:', e);
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
            <i data-lucide="bell" style="width:16px;height:16px;"></i> <span style="font-size:0.85rem; flex:1; text-align:left;">알림</span>
            <span id="notif-badge" style="display:none; background:#B54534; color:#FFF8F0; font-size:0.65rem; font-weight:700; padding:0.1rem 0.4rem; border-radius:10px; min-width:16px; text-align:center;">0</span>
        </button>
        <div id="notif-panel" style="display:none; position:fixed; left:60px; top:auto; z-index:99999; margin-top:0.3rem; background:var(--bg-card, white); border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.3); border:1px solid var(--border); max-height:70vh; overflow-y:auto; width:320px;">
            <div id="notif-panel-header" style="padding:0.8rem 1rem; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; background:#FFF8F0; border-radius:12px 12px 0 0;">
                <strong style="font-size:0.9rem;"><i data-lucide="bell" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 알림</strong>
                <div style="display:flex; gap:0.5rem;">
                    <button onclick="markAllRead()" style="background:none; border:none; color:#3D2B1F; font-size:0.75rem; cursor:pointer; font-weight:600;">모두 읽음</button>
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
        list.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--accent); font-size:0.85rem;">알림이 없습니다</div>';
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
    if (seconds < 60) return '방금 전';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
    return `${Math.floor(seconds / 86400)}일 전`;
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
        const doc = await db.collection('users').doc(currentUser.uid).get();
        if (doc.exists && doc.data().notificationSettings) {
            notificationSettings = { ...notificationSettings, ...doc.data().notificationSettings };
        }
    } catch (e) {
        console.warn('알림 설정 로드 실패:', e);
    }
}

async function saveNotificationSettings() {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).update({ notificationSettings });
        showToast('✅ 알림 설정 저장됨', 'success');
    } catch (e) {
        showToast('알림 설정 저장 실패', 'error');
    }
}

function openNotifSettings() {
    if (notifPanelOpen) toggleNotifPanel();

    const overlay = document.createElement('div');
    overlay.id = 'notif-settings-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const items = [
        { key: 'messenger', icon: '💬', label: t('notif.set.messenger','메신저 메시지') },
        { key: 'social_comment', icon: '💬', label: t('notif.set.comment','소셜 댓글') },
        { key: 'social_like', icon: '❤️', label: t('notif.set.like','소셜 좋아요') },
        { key: 'social_follow', icon: '👤', label: t('notif.set.follow','팔로우') },
        { key: 'social_mention', icon: '📢', label: t('notif.set.mention','멘션') },
        { key: 'trading_signal', icon: '📊', label: t('notif.set.signal','트레이딩 시그널') },
        { key: 'trading_order', icon: '📈', label: t('notif.set.order','주문 체결/청산') },
        { key: 'order_status', icon: '📦', label: t('notif.set.order_status','주문 상태 변경') },
        { key: 'art_sold', icon: '🎨', label: t('notif.set.art_sold','작품 판매') },
        { key: 'book_sold', icon: '📚', label: t('notif.set.book_sold','책 판매') },
        { key: 'donation', icon: '💝', label: t('notif.set.donation','기부 알림') },
        { key: 'friend_request', icon: '🤝', label: t('notif.set.friend','친구 요청') },
        { key: 'system', icon: '🔔', label: t('notif.set.system','시스템 알림') },
    ];

    overlay.innerHTML = `
    <div style="background:#FFF8F0;padding:1.5rem;border-radius:16px;max-width:400px;width:100%;">
        <h3 style="margin-bottom:1rem;">📢 알림 설정</h3>
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
            <button onclick="document.getElementById('notif-settings-modal').remove()" style="flex:1;padding:0.7rem;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;background:#FFF8F0;">취소</button>
            <button onclick="saveNotificationSettings();document.getElementById('notif-settings-modal').remove()" style="flex:1;padding:0.7rem;border:none;border-radius:8px;cursor:pointer;background:#3D2B1F;color:#FFF8F0;font-weight:700;">저장</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
}

// ========== MESSENGER NOTIFICATION HOOK ==========

let _messengerNotifListeners = [];

function setupMessengerNotifications() {
    if (!currentUser) return;
    // Listen to all chats for new messages
    const unsub = db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'modified') {
                    const chatData = change.doc.data();
                    const lastMsg = chatData.lastMessage;
                    const lastTime = chatData.lastMessageTime?.toMillis?.() || 0;
                    const now = Date.now();

                    // Only notify if message is recent (<10s) and not on messenger page
                    if (now - lastTime < 10000) {
                        const activePage = document.querySelector('.page.active');
                        const onMessenger = activePage && activePage.id === 'messenger' && currentChat === change.doc.id;
                        if (!onMessenger) {
                            const otherId = chatData.participants.find(id => id !== currentUser.uid);
                            const info = await getUserDisplayInfo(otherId);
                            const preview = lastMsg && lastMsg.length > 30 ? lastMsg.substring(0, 30) + '...' : lastMsg;
                            addNotification(NOTIF_TYPES.MESSENGER, `💬 ${info.nickname}: ${preview || '새 메시지'}`, { chatId: change.doc.id, otherId });
                            // Browser notification when tab not focused
                            if (typeof showBrowserNotification === 'function') {
                              showBrowserNotification(info.nickname, preview || '새 메시지', { chatId: change.doc.id, otherId });
                            }
                        }
                    }
                }
            });
        });
    _messengerNotifListeners.push(unsub);
}

// ========== SOCIAL NOTIFICATION HOOKS ==========

let _socialNotifListeners = [];
let _myPostIds = new Set();
let _myPostsLoaded = false;

async function setupSocialNotifications() {
    if (!currentUser) return;

    // First, get my post IDs
    try {
        const myPosts = await db.collection('posts').where('userId', '==', currentUser.uid).get();
        _myPostIds = new Set(myPosts.docs.map(d => d.id));
        _myPostsLoaded = true;
    } catch (e) {
        console.warn('내 게시물 로드 실패:', e);
        return;
    }

    if (_myPostIds.size === 0) return;

    // Listen for changes on my posts (likes)
    const unsub = db.collection('posts')
        .where('userId', '==', currentUser.uid)
        .onSnapshot(snapshot => {
            if (!_myPostsLoaded) return;
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'modified') {
                    const post = change.doc.data();
                    const likedBy = post.likedBy || [];
                    // Check if someone new liked (simple: last person in array)
                    const lastLiker = likedBy[likedBy.length - 1];
                    if (lastLiker && lastLiker !== currentUser.uid) {
                        const info = await getUserDisplayInfo(lastLiker);
                        addNotification(NOTIF_TYPES.SOCIAL_LIKE, `❤️ ${info.nickname}님이 좋아요를 눌렀습니다`, { postId: change.doc.id });
                    }
                }
            });
        });
    _socialNotifListeners.push(unsub);
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
    const signalKo = { buy: '매수', sell: '매도', hold: '유지', wait: '관망' };
    addNotification(NOTIF_TYPES.TRADING_SIGNAL, `📊 ${mentorName}: ${signalKo[oldSignal] || oldSignal} → ${signalKo[newSignal] || newSignal}`, {});
}

function notifyTradingOrder(message) {
    addNotification(NOTIF_TYPES.TRADING_ORDER, message, {});
}

// ========== COMMENT NOTIFICATION (hook into addComment) ==========

const _origAddComment = window.addComment;
if (_origAddComment) {
    window.addComment = async function(postId) {
        await _origAddComment(postId);
        // After adding comment, check if it's someone else's post
        try {
            const postDoc = await db.collection('posts').doc(postId).get();
            if (postDoc.exists) {
                const postOwnerId = postDoc.data().userId;
                if (postOwnerId !== currentUser.uid) {
                    // The post owner will get notified via their own listener
                    // We don't need to do anything here for the commenter
                }
            }
        } catch (e) {}
    };
}

// Listen for new comments on my posts  
async function setupCommentNotifications() {
    if (!currentUser || _myPostIds.size === 0) return;

    // For each of my posts, listen for new comments
    // To minimize listeners, we use a polling approach instead
    // or listen to a limited set
    const myPostsArr = Array.from(_myPostIds).slice(0, 10); // max 10 posts
    for (const postId of myPostsArr) {
        const unsub = db.collection('posts').doc(postId).collection('comments')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(async change => {
                    if (change.type === 'added') {
                        const comment = change.doc.data();
                        if (comment.userId && comment.userId !== currentUser.uid) {
                            const timeDiff = Date.now() - (comment.timestamp?.toMillis?.() || 0);
                            if (timeDiff < 15000) { // recent comment
                                const info = await getUserDisplayInfo(comment.userId);
                                addNotification(NOTIF_TYPES.SOCIAL_COMMENT, `💬 ${info.nickname}님이 댓글을 달았습니다`, { postId });
                            }
                        }
                    }
                });
            });
        _socialNotifListeners.push(unsub);
    }
}

// ========== FIRESTORE REALTIME NOTIFICATION LISTENER ==========

let _firestoreNotifListener = null;

function setupFirestoreNotifications() {
    if (!currentUser) return;

    _firestoreNotifListener = db.collection('notifications')
        .where('userId', '==', currentUser.uid)
        .where('read', '==', false)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const d = change.doc.data();
                    const ts = d.createdAt?.toMillis?.() || 0;
                    const now = Date.now();
                    // Only show toast for recent notifications (<30s)
                    if (now - ts < 30000) {
                        addNotification(d.type, d.message || d.data?.message || '', { ...d.data, _docId: change.doc.id });
                    } else {
                        // Older unread — just add to list silently
                        const style = NOTIF_STYLES[d.type] || NOTIF_STYLES.system;
                        const notif = {
                            id: change.doc.id,
                            type: d.type,
                            message: d.message || d.data?.message || '',
                            data: d.data || {},
                            read: false,
                            createdAt: d.createdAt?.toDate?.() || new Date()
                        };
                        // Avoid duplicates
                        if (!notifications.find(n => n.id === notif.id)) {
                            notifications.push(notif);
                            if (notifications.length > MAX_NOTIFICATIONS) notifications.shift();
                            unreadCount = notifications.filter(n => !n.read).length;
                            updateBellBadge();
                        }
                    }
                }
            });
        });
}

// Mark notification as read in Firestore
async function markNotifReadInFirestore(docId) {
    if (!docId || typeof docId !== 'string') return;
    try {
        await db.collection('notifications').doc(docId).update({ read: true });
    } catch (e) { /* ignore */ }
}

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

    console.log('🔔 알림 시스템 v1.2 초기화 완료');
}

// Cleanup on logout
function cleanupNotifications() {
    _messengerNotifListeners.forEach(fn => fn());
    _messengerNotifListeners = [];
    _socialNotifListeners.forEach(fn => fn());
    _socialNotifListeners = [];
    if (_firestoreNotifListener) { _firestoreNotifListener(); _firestoreNotifListener = null; }
    notifications = [];
    unreadCount = 0;
    _myPostIds.clear();
    _myPostsLoaded = false;
    updateBellBadge();
}
