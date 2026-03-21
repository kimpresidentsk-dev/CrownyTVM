// ===== offline-data.js — IndexedDB cache + action queue for offline-first =====
// O1: Cache user data locally  O2: Queue actions offline  O3: Replay on reconnect

(function() {
    'use strict';
    var DB_NAME = 'crowny-offline';
    var DB_VERSION = 1;
    var db = null;

    // Open IndexedDB
    function openDB() {
        return new Promise(function(resolve, reject) {
            if (db) return resolve(db);
            var req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function(e) {
                var d = e.target.result;
                if (!d.objectStoreNames.contains('cache')) d.createObjectStore('cache');
                if (!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', { autoIncrement: true });
            };
            req.onsuccess = function(e) { db = e.target.result; resolve(db); };
            req.onerror = function() { reject(req.error); };
        });
    }

    // Generic IDB get/set
    function idbGet(store, key) {
        return openDB().then(function(d) {
            return new Promise(function(resolve) {
                var tx = d.transaction(store, 'readonly');
                var req = tx.objectStore(store).get(key);
                req.onsuccess = function() { resolve(req.result); };
                req.onerror = function() { resolve(null); };
            });
        }).catch(function() { return null; });
    }

    function idbPut(store, key, val) {
        return openDB().then(function(d) {
            return new Promise(function(resolve) {
                var tx = d.transaction(store, 'readwrite');
                tx.objectStore(store).put(val, key);
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function() { resolve(); };
            });
        }).catch(function() {});
    }

    // O1: Cache user data
    window.offlineCache = {
        save: function(key, data) {
            return idbPut('cache', key, { data: data, ts: Date.now() });
        },
        load: function(key, maxAgeMs) {
            return idbGet('cache', key).then(function(entry) {
                if (!entry) return null;
                if (maxAgeMs && (Date.now() - entry.ts) > maxAgeMs) return null;
                return entry.data;
            });
        }
    };

    // O2: Action queue — store pending API calls when offline
    window.offlineQueue = {
        add: function(method, url, body) {
            return idbPut('queue', undefined, { method: method, url: url, body: body, ts: Date.now() });
        },
        flush: function() {
            return openDB().then(function(d) {
                return new Promise(function(resolve) {
                    var tx = d.transaction('queue', 'readwrite');
                    var store = tx.objectStore('queue');
                    var all = store.getAll();
                    var keys = store.getAllKeys();
                    all.onsuccess = function() {
                        var items = all.result || [];
                        var itemKeys = keys.result || [];
                        if (!items.length) return resolve(0);
                        var sent = 0;
                        var token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
                        var headers = { 'Content-Type': 'application/json' };
                        if (token) headers['Authorization'] = 'Bearer ' + token;

                        items.forEach(function(item, i) {
                            var opts = { method: item.method, headers: headers };
                            if (item.body) opts.body = JSON.stringify(item.body);
                            fetch(item.url, opts).then(function(res) {
                                if (res.ok) {
                                    var delTx = d.transaction('queue', 'readwrite');
                                    delTx.objectStore('queue').delete(itemKeys[i]);
                                    sent++;
                                }
                            }).catch(function() {});
                        });
                        resolve(items.length);
                    };
                });
            }).catch(function() { return 0; });
        }
    };

    // O3: Replay queued actions on reconnect
    window.addEventListener('online', function() {
        window.offlineQueue.flush().then(function(n) {
            if (n > 0 && typeof showToast === 'function') {
                showToast(t('offline.synced', 'Synced ' + n + ' pending actions'), 'success');
            }
        });
    });

    // Wrap fetch to auto-queue POST/PUT on network failure
    var _origFetch = window.fetch;
    window.fetch = function(url, opts) {
        return _origFetch.call(window, url, opts).catch(function(err) {
            if (opts && (opts.method === 'POST' || opts.method === 'PUT')) {
                var u = typeof url === 'string' ? url : url.url;
                // Only queue API calls, not external
                if (u.startsWith('/api/')) {
                    var body = null;
                    try { body = opts.body ? JSON.parse(opts.body) : null; } catch(e) { body = opts.body; }
                    window.offlineQueue.add(opts.method, u, body);
                    console.log('[Offline] Queued:', opts.method, u);
                }
            }
            throw err;
        });
    };
})();
