// ===== pwa.js v1.0 - PWA + FCM + 오프라인 + 앱 설치 =====

// ========== SERVICE WORKER ==========

async function registerServiceWorker() {
  // SW 임시 비활성화 — 캐시 문제 해결 후 재활성화
  console.log('[PWA] SW registration disabled temporarily');
  return;
}

// ========== OFFLINE BANNER ==========

function initOfflineBanner() {
  const banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;z-index:99999;background:#C4841D;color:#FFF8F0;text-align:center;padding:6px 12px;font-size:0.82rem;font-weight:600;transition:transform 0.3s;';
  banner.textContent = '📡 오프라인 모드 — 인터넷 연결을 확인하세요';
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
  if (!('Notification' in window) || !firebase.messaging) return;

  try {
    _fcmMessaging = firebase.messaging();

    // Foreground message handler
    _fcmMessaging.onMessage(payload => {
      const { title, body } = payload.notification || {};
      const data = payload.data || {};

      // Show browser notification
      if (Notification.permission === 'granted') {
        new Notification(title || 'CROWNY', {
          body: body || '새 알림',
          icon: '/img/icons/icon-192x192.png',
          data: data
        });
      }

      // Also show in-app notification
      if (typeof addNotification === 'function') {
        addNotification(data.type || 'system', body || title || '새 알림', data);
      }
    });
  } catch (e) {
    console.warn('FCM 초기화 실패:', e);
  }
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
  if (!_fcmMessaging || !currentUser) return;
  try {
    const token = await _fcmMessaging.getToken({
      vapidKey: '' // VAPID key — set when Firebase Console provides one
    });
    if (token) {
      await db.collection('users').doc(currentUser.uid).update({
        fcmTokens: firebase.firestore.FieldValue.arrayUnion(token)
      });
      console.log('✅ FCM 토큰 저장됨');
    }
  } catch (e) {
    console.warn('FCM 토큰 저장 실패:', e);
  }
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
      <div style="font-weight:700;font-size:0.95rem;">CROWNY 앱 설치</div>
      <div style="font-size:0.78rem;opacity:0.85;margin-top:2px;">
        ${isIOS ? '공유 버튼 → "홈 화면에 추가"를 탭하세요' : '홈 화면에 추가하고 더 빠르게 사용하세요'}
      </div>
    </div>
    ${isIOS ? '' : '<button id="pwa-install-btn" style="background:#FFF8F0;color:#3D2B1F;border:none;padding:0.5rem 1rem;border-radius:8px;font-weight:700;font-size:0.85rem;cursor:pointer;white-space:nowrap;">설치</button>'}
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
    console.log('✅ PWA 설치됨');
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

    for (const msg of all) {
      try {
        await window.db.collection('chats').doc(msg.chatId).collection('messages').add({
          text: msg.text,
          senderId: msg.senderId,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          type: 'text'
        });
        // Delete from queue
        const delTx = idb.transaction('pendingMessages', 'readwrite');
        delTx.objectStore('pendingMessages').delete(msg.id);
      } catch (e) { break; } // stop if still offline
    }

    if (all.length > 0) {
      if (typeof showToast === 'function') showToast(`📤 ${all.length}개 대기 메시지 전송 완료`, 'success');
    }
  } catch (e) { /* ignore */ }
}

// ========== NOTIFICATION SETTINGS TOGGLE (for settings page) ==========

function renderPushNotifToggle() {
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const isGranted = perm === 'granted';
  return `
    <div class="settings-card">
      <h4><i data-lucide="smartphone" style="width:18px;height:18px;display:inline;vertical-align:text-bottom;color:#8B6914;"></i> ${typeof t === 'function' ? t('settings.push_notif', '푸시 알림') : '푸시 알림'}</h4>
      <label class="settings-toggle">
        <span>브라우저 알림</span>
        <input type="checkbox" id="push-notif-toggle" ${isGranted ? 'checked' : ''} onchange="togglePushPermission(this.checked)">

      </label>
      <p style="font-size:0.75rem;color:var(--accent);margin-top:0.3rem;">
        ${perm === 'denied' ? '⚠️ 브라우저 설정에서 알림이 차단되었습니다' : perm === 'unsupported' ? '이 브라우저는 알림을 지원하지 않습니다' : ''}
      </p>
    </div>
  `;
}

async function togglePushPermission(enabled) {
  if (enabled) {
    const perm = await requestNotificationPermission();
    if (perm !== 'granted') {
      document.getElementById('push-notif-toggle').checked = false;
      if (typeof showToast === 'function') showToast('알림 권한이 거부되었습니다', 'error');
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
  console.log('📱 PWA v1.0 초기화 완료');
}

// Auto-init on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPWA);
} else {
  initPWA();
}
