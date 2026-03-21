// ===== pwa.js v1.0 - PWA + FCM + 오프라인 + 앱 설치 =====

// ========== SERVICE WORKER ==========

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('[PWA] SW registered:', reg.scope);
    // Listen for messages from SW (e.g., notification click → open chat)
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'open-chat' && typeof showPage === 'function') {
        showPage('messenger');
        if (e.data.chatId && typeof chatOpen === 'function') {
          setTimeout(() => chatOpen(e.data.chatId), 300);
        }
      }
    });
    return reg;
  } catch (e) {
    console.warn('[PWA] SW registration failed:', e);
  }
}

// ========== OFFLINE BANNER ==========

function initOfflineBanner() {
  const banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;z-index:99999;background:#C4841D;color:#FFF8F0;text-align:center;padding:6px 12px;font-size:0.82rem;font-weight:600;transition:transform 0.3s;';
  banner.textContent = t('pwa.offline_banner', 'Offline mode — please check your internet connection');
  document.body.prepend(banner);

  const update = () => {
    banner.style.display = navigator.onLine ? 'none' : 'block';
    if (navigator.onLine) processPendingMessages();
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

// ========== FCM + BROWSER NOTIFICATIONS ==========

let _fcmMessaging = null;

async function initFCM() {
  // FCM is Firebase-only; using browser Notification API directly
  console.log('[PWA] FCM skipped (independent server mode)');
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) return null;
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    await saveFCMToken();
  }
  return permission;
}

async function saveFCMToken() {
  // FCM token saving is a no-op in independent server mode
  console.log('[PWA] FCM token save skipped (independent server mode)');
}

// Show browser notification for messenger messages
function showBrowserNotification(title, body, data = {}) {
  if (Notification.permission !== 'granted') return;
  if (document.hasFocus()) return; // Don't show if app is focused

  try {
    const notif = new Notification(title, {
      body,
      icon: '/img/icons/icon-192x192.png',
      badge: '/img/icons/icon-192x192.png',
      tag: data.chatId || 'crowny',
      renotify: true,
      data
    });
    notif.onclick = () => {
      window.focus();
      notif.close();
      if (data.chatId && typeof showPage === 'function') {
        showPage('messenger');
        if (data.otherId && typeof openChat === 'function') {
          setTimeout(() => openChat(data.chatId, data.otherId), 300);
        }
      }
    };
  } catch (e) { /* SW fallback */ }
}

// ========== APP INSTALL PROMPT ==========

let _deferredPrompt = null;

function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredPrompt = e;

    const visits = parseInt(localStorage.getItem('crowny-visits') || '0') + 1;
    localStorage.setItem('crowny-visits', visits);

    // Show after 3 visits or first time
    if (visits >= 3 || visits === 1) {
      setTimeout(() => showInstallBanner(), 2000);
    }
  });

  // Detect standalone mode
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
    document.body.classList.add('pwa-standalone');
  }
}

function showInstallBanner() {
  if (document.getElementById('pwa-install-banner')) return;
  if (localStorage.getItem('crowny-install-dismissed')) return;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99998;background:linear-gradient(135deg,#3D2B1F,#6B5744);color:#FFF8F0;padding:1rem 1.2rem;display:flex;align-items:center;gap:0.8rem;box-shadow:0 -4px 20px rgba(0,0,0,0.3);animation:slideUp 0.3s ease;';
  banner.innerHTML = `
    <img src="/img/icons/icon-192x192.png" style="width:48px;height:48px;border-radius:12px;" alt="CROWNY">
    <div style="flex:1;">
      <div style="font-weight:700;font-size:0.95rem;">${t('pwa.install_title', 'Install CROWNY App')}</div>
      <div style="font-size:0.78rem;opacity:0.85;margin-top:2px;">
        ${isIOS ? t('pwa.install_ios', 'Tap the Share button then "Add to Home Screen"') : t('pwa.install_android', 'Add to home screen for faster access')}
      </div>
    </div>
    ${isIOS ? '' : `<button id="pwa-install-btn" style="background:#FFF8F0;color:#3D2B1F;border:none;padding:0.5rem 1rem;border-radius:8px;font-weight:700;font-size:0.85rem;cursor:pointer;white-space:nowrap;">${t('pwa.install_btn', 'Install')}</button>`}
    <button onclick="dismissInstallBanner()" style="background:none;border:none;color:rgba(255,255,255,0.6);font-size:1.2rem;cursor:pointer;padding:0.3rem;">✕</button>
  `;
  document.body.appendChild(banner);

  if (!isIOS) {
    document.getElementById('pwa-install-btn')?.addEventListener('click', installPWA);
  }
}

async function installPWA() {
  if (!_deferredPrompt) return;
  _deferredPrompt.prompt();
  const { outcome } = await _deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    console.log('[PWA] App installed');
    localStorage.setItem('crowny-install-dismissed', '1');
  }
  _deferredPrompt = null;
  dismissInstallBanner();
}

function dismissInstallBanner() {
  document.getElementById('pwa-install-banner')?.remove();
  localStorage.setItem('crowny-install-dismissed', '1');
}

// ========== INDEXEDDB OFFLINE MESSAGE CACHE ==========

const IDB_NAME = 'crowny-offline';
const IDB_VERSION = 1;
let _idb = null;

function openIDB() {
  return new Promise((resolve, reject) => {
    if (_idb) return resolve(_idb);
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('messages')) {
        db.createObjectStore('messages', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('chatList')) {
        db.createObjectStore('chatList', { keyPath: 'chatId' });
      }
      if (!db.objectStoreNames.contains('pendingMessages')) {
        db.createObjectStore('pendingMessages', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => { _idb = req.result; resolve(_idb); };
    req.onerror = () => reject(req.error);
  });
}

async function cacheMessages(chatId, messages) {
  try {
    const db = await openIDB();
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    // Store as single doc per chat
    store.put({ id: chatId, messages: messages.slice(0, 100), cachedAt: Date.now() });
  } catch (e) { /* ignore */ }
}

async function getCachedMessages(chatId) {
  try {
    const db = await openIDB();
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    return new Promise(resolve => {
      const req = store.get(chatId);
      req.onsuccess = () => resolve(req.result?.messages || []);
      req.onerror = () => resolve([]);
    });
  } catch (e) { return []; }
}

async function cacheChatList(chats) {
  try {
    const db = await openIDB();
    const tx = db.transaction('chatList', 'readwrite');
    const store = tx.objectStore('chatList');
    chats.forEach(c => store.put(c));
  } catch (e) { /* ignore */ }
}

async function getCachedChatList() {
  try {
    const db = await openIDB();
    const tx = db.transaction('chatList', 'readonly');
    const store = tx.objectStore('chatList');
    return new Promise(resolve => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (e) { return []; }
}

// ========== OFFLINE MESSAGE QUEUE ==========

async function queuePendingMessage(chatId, text, senderId) {
  try {
    const db = await openIDB();
    const tx = db.transaction('pendingMessages', 'readwrite');
    tx.objectStore('pendingMessages').add({
      chatId, text, senderId, queuedAt: Date.now()
    });
  } catch (e) { /* ignore */ }
}

async function processPendingMessages() {
  if (!navigator.onLine || !currentUser) return;
  try {
    const idb = await openIDB();
    const tx = idb.transaction('pendingMessages', 'readwrite');
    const store = tx.objectStore('pendingMessages');
    const all = await new Promise(resolve => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
    for (const msg of all) {
      try {
        await fetch(`/api/db/chats/${msg.chatId}/messages`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: msg.text,
            senderId: msg.senderId,
            timestamp: { __fieldValue: 'serverTimestamp' },
            type: 'text'
          })
        });
        // Delete from queue
        const delTx = idb.transaction('pendingMessages', 'readwrite');
        delTx.objectStore('pendingMessages').delete(msg.id);
      } catch (e) { break; } // stop if still offline
    }

    if (all.length > 0) {
      if (typeof showToast === 'function') showToast(t('pwa.pending_sent', '${count} pending messages sent').replace('${count}', all.length), 'success');
    }
  } catch (e) { /* ignore */ }
}

// ========== NOTIFICATION SETTINGS TOGGLE (for settings page) ==========

function renderPushNotifToggle() {
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const isGranted = perm === 'granted';
  return `
    <div class="settings-card">
      <h4><i data-lucide="smartphone" style="width:18px;height:18px;display:inline;vertical-align:text-bottom;color:#8B6914;"></i> ${typeof t === 'function' ? t('settings.push_notif', 'Push Notifications') : 'Push Notifications'}</h4>
      <label class="settings-toggle">
        <span>${typeof t === 'function' ? t('pwa.browser_notif', 'Browser notifications') : 'Browser notifications'}</span>
        <input type="checkbox" id="push-notif-toggle" ${isGranted ? 'checked' : ''} onchange="togglePushPermission(this.checked)">

      </label>
      <p style="font-size:0.75rem;color:var(--accent);margin-top:0.3rem;">
        ${perm === 'denied' ? (typeof t === 'function' ? t('pwa.notif_blocked', 'Notifications are blocked in browser settings') : 'Notifications are blocked in browser settings') : perm === 'unsupported' ? (typeof t === 'function' ? t('pwa.notif_unsupported', 'This browser does not support notifications') : 'This browser does not support notifications') : ''}
      </p>
    </div>
  `;
}

async function togglePushPermission(enabled) {
  if (enabled) {
    const perm = await requestNotificationPermission();
    if (perm !== 'granted') {
      document.getElementById('push-notif-toggle').checked = false;
      if (typeof showToast === 'function') showToast(t('pwa.notif_denied', 'Notification permission denied'), 'error');
    }
  }
}

// ========== CSS INJECTION ==========

function injectPWAStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
    body.pwa-standalone { padding-top: env(safe-area-inset-top); }
    body.pwa-standalone .sidebar { padding-top: env(safe-area-inset-top); }
    #offline-banner { font-family: inherit; }
  `;
  document.head.appendChild(style);
}

// ========== INIT ==========

async function initPWA() {
  injectPWAStyles();
  await registerServiceWorker();
  initOfflineBanner();
  initInstallPrompt();
  await initFCM();
  console.log('[PWA] v1.0 initialized');
}

// Auto-init on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPWA);
} else {
  initPWA();
}
