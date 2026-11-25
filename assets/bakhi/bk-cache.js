/* =========================================================================
   Bá Khí — bk-cache.js  (8.8.0 · Intelligent Caching)

   Một cache dùng chung cho toàn website, thay vì mỗi module tự giữ bản sao.

   Tầng:
     L1  Map trong RAM, TTL theo entry, LRU theo số entry và số byte.
     L2  IndexedDB (tuỳ chọn, chỉ khi nơi gọi yêu cầu `persist`), có version
         schema, tự loại bản ghi cũ/hỏng, tôn trọng quota và luôn fallback về
         L1 hoặc nguồn dữ liệu gốc nếu storage không dùng được.
     L3  Không nằm ở đây: trình duyệt + service worker (sw.js) lo HTTP cache
         với URL gắn ?v=<phiên bản> cho tài nguyên tĩnh.

   Nguyên tắc an toàn:
     - KHÔNG cache token, phiên đăng nhập hay dữ liệu cá nhân (mặc định).
       Dữ liệu riêng phải dùng instance `private: true`; instance này không ghi
       L2 và bị xoá khi đổi tài khoản/đăng xuất.
     - Khoá cache không chứa token hay thông tin cá nhân; chỉ là tên dữ liệu.
     - Request dedup chỉ áp dụng cho ĐỌC. Không dedup thao tác ghi.
     - Cache không phải cơ chế xác thực/phân quyền: quyền vẫn do Supabase RLS
       và backend quyết định trước khi dữ liệu được đưa vào cache.

   Công khai: window.BKCache (create, shared, stats, version)
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;

    var DB_NAME = 'bakhi-cache';
    var DB_VERSION = 1;
    var STORE = 'entries';
    var L2_TIMEOUT_MS = 400;
    var DEFAULT_TTL_MS = 60000;
    var DEFAULT_MAX_ENTRIES = 120;
    var DEFAULT_MAX_BYTES = 512 * 1024;
    var DEFAULT_LOADER_TIMEOUT_MS = 15000;

    var instances = [];
    var dbPromise = null;
    var dbBroken = false;

    function now() { return Date.now(); }

    function toInt(value, fallback, min, max) {
        var number = Number(value);
        if (!isFinite(number)) return fallback;
        number = Math.floor(number);
        if (number < min) return min;
        if (number > max) return max;
        return number;
    }

    function estimateBytes(value) {
        try {
            var text = JSON.stringify(value);
            return text ? text.length : 0;
        } catch (e) {
            return 0;
        }
    }

    /* --------------------------- L2: IndexedDB --------------------------- */

    function withTimeout(promise, ms) {
        return new Promise(function (resolve, reject) {
            var timer = global.setTimeout(function () {
                reject(new Error('L2_TIMEOUT'));
            }, ms);
            promise.then(function (value) {
                global.clearTimeout(timer);
                resolve(value);
            }, function (error) {
                global.clearTimeout(timer);
                reject(error);
            });
        });
    }

    function openDb() {
        if (dbBroken || !global.indexedDB) {
            return Promise.reject(new Error('L2_UNAVAILABLE'));
        }
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve, reject) {
            var request;
            try {
                request = global.indexedDB.open(DB_NAME, DB_VERSION);
            } catch (e) {
                reject(e);
                return;
            }
            request.onupgradeneeded = function () {
                var db = request.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE, { keyPath: 'key' });
                }
            };
            request.onsuccess = function () {
                var db = request.result;
                db.onversionchange = function () {
                    try { db.close(); } catch (e) { }
                    dbPromise = null;
                };
                resolve(db);
            };
            request.onerror = function () { reject(request.error || new Error('L2_OPEN')); };
            request.onblocked = function () { reject(new Error('L2_BLOCKED')); };
        }).catch(function (error) {
            dbBroken = true;
            dbPromise = null;
            throw error;
        });
        return dbPromise;
    }

    function idb(mode, run) {
        return openDb().then(function (db) {
            return withTimeout(new Promise(function (resolve, reject) {
                var tx;
                try {
                    tx = db.transaction(STORE, mode);
                } catch (e) {
                    reject(e);
                    return;
                }
                var store = tx.objectStore(STORE);
                var request;
                try {
                    request = run(store);
                } catch (e) {
                    reject(e);
                    return;
                }
                tx.onerror = function () { reject(tx.error || new Error('L2_TX')); };
                tx.onabort = function () { reject(tx.error || new Error('L2_ABORT')); };
                if (!request) {
                    tx.oncomplete = function () { resolve(null); };
                    return;
                }
                request.onsuccess = function () { resolve(request.result); };
                request.onerror = function () { reject(request.error || new Error('L2_REQ')); };
            }), L2_TIMEOUT_MS);
        });
    }

    function idbRead(key) {
        return idb('readonly', function (store) { return store.get(key); });
    }

    function idbWrite(record) {
        return idb('readwrite', function (store) { return store.put(record); });
    }

    function idbDelete(key) {
        return idb('readwrite', function (store) { return store.delete(key); });
    }

    function idbClear() {
        return idb('readwrite', function (store) { return store.clear(); });
    }

    /* ------------------------------ Instance ----------------------------- */

    function create(options) {
        options = options || {};

        var state = {
            name: String(options.name || 'default'),
            namespace: String(options.namespace || options.name || 'default') + '|',
            version: String(options.version || '8.8.0'),
            privateData: options.private === true,
            persist: options.persist === true && options.private !== true,
            enabled: options.enabled !== false,
            defaultTtl: toInt(options.defaultTtl, DEFAULT_TTL_MS, 0, 86400000),
            maxEntries: toInt(options.maxEntries, DEFAULT_MAX_ENTRIES, 1, 5000),
            maxBytes: toInt(options.maxBytes, DEFAULT_MAX_BYTES, 1024, 32 * 1024 * 1024),
            scope: String(options.scope || 'public'),
            entries: new Map(),
            bytes: 0,
            inflight: new Map(),
            counters: {
                hits: 0, l1Hits: 0, l2Hits: 0, misses: 0, dedup: 0,
                evictions: 0, expirations: 0, invalidations: 0,
                bypasses: 0, errors: 0, l2Reads: 0, l2Writes: 0, l2Errors: 0
            }
        };

        function cacheKey(key) {
            return state.namespace + state.scope + '|' + String(key);
        }

        function touch(key, entry) {
            state.entries.delete(key);
            entry.tick = (entry.tick || 0) + 1;
            state.entries.set(key, entry);
        }

        function drop(key) {
            var entry = state.entries.get(key);
            if (!entry) return false;
            state.entries.delete(key);
            state.bytes = Math.max(0, state.bytes - (entry.bytes || 0));
            return true;
        }

        function evict() {
            while (state.entries.size > state.maxEntries || state.bytes > state.maxBytes) {
                var oldest = state.entries.keys().next();
                if (oldest.done) break;
                drop(oldest.value);
                state.counters.evictions++;
            }
        }

        function l1Get(key) {
            var entry = state.entries.get(key);
            if (!entry) return null;
            var stamp = now();
            if (entry.expiresAt <= stamp) {
                if (entry.staleUntil > stamp) {
                    /* Còn hạn "stale": trả cho nơi gọi biết đây là dữ liệu cũ;
                       get() thường KHÔNG trả entry đã hết TTL. */
                    return { value: entry.value, stale: true };
                }
                drop(key);
                state.counters.expirations++;
                return null;
            }
            touch(key, entry);
            return { value: entry.value, stale: false };
        }

        function set(key, value, opts) {
            opts = opts || {};
            if (!state.enabled) {
                state.counters.bypasses++;
                return false;
            }
            if (value === undefined) return false;
            var ttl = opts.ttl === undefined ? state.defaultTtl : Number(opts.ttl);
            if (!isFinite(ttl) || ttl <= 0) {
                state.counters.bypasses++;
                return false;
            }
            var fullKey = cacheKey(key);
            var bytes = estimateBytes(value);
            if (bytes > state.maxBytes) return false; /* không đẩy cả cache ra vì một payload lớn */
            var stamp = now();
            var entry = {
                value: value,
                bytes: bytes,
                tags: Array.isArray(opts.tags) ? opts.tags.slice(0, 8) : [],
                expiresAt: stamp + ttl,
                staleUntil: stamp + ttl + Math.max(0, Number(opts.staleTtl) || 0),
                tick: 0
            };
            drop(fullKey);
            state.bytes += bytes;
            state.entries.set(fullKey, entry);
            evict();

            if (opts.persist === true && state.persist && !state.privateData) {
                state.counters.l2Writes++;
                idbWrite({
                    key: fullKey,
                    value: value,
                    version: state.version,
                    tags: entry.tags,
                    expiresAt: entry.expiresAt,
                    staleUntil: entry.staleUntil,
                    savedAt: stamp
                }).catch(function () {
                    state.counters.l2Errors++;
                    state.counters.errors++;
                });
            }
            return true;
        }

        function get(key) {
            if (!state.enabled) {
                state.counters.bypasses++;
                return Promise.resolve(null);
            }
            var hit = l1Get(cacheKey(key));
            if (hit && !hit.stale) {
                state.counters.hits++;
                state.counters.l1Hits++;
                return Promise.resolve(hit.value);
            }
            state.counters.misses++;
            if (!state.persist || state.privateData) return Promise.resolve(null);

            var fullKey = cacheKey(key);
            state.counters.l2Reads++;
            return idbRead(fullKey).then(function (record) {
                if (!record || record.version !== state.version) {
                    if (record) idbDelete(fullKey).catch(function () { });
                    return null;
                }
                var stamp = now();
                if (record.staleUntil && record.staleUntil <= stamp) {
                    idbDelete(fullKey).catch(function () { });
                    return null;
                }
                /* L2 còn hạn (kể cả đã quá TTL nhưng trong hạn stale): đưa lại L1
                   để lần đọc sau không phải chạm IndexedDB. */
                var entry = {
                    value: record.value,
                    bytes: estimateBytes(record.value),
                    tags: Array.isArray(record.tags) ? record.tags : [],
                    expiresAt: record.expiresAt || stamp,
                    staleUntil: record.staleUntil || stamp,
                    tick: 0
                };
                drop(fullKey);
                state.bytes += entry.bytes;
                state.entries.set(fullKey, entry);
                evict();
                if (entry.expiresAt <= stamp) return null; /* hết hạn: chỉ dùng làm phao, không trả */
                state.counters.hits++;
                state.counters.l2Hits++;
                return entry.value;
            }).catch(function () {
                state.counters.l2Errors++;
                state.counters.errors++;
                return null; /* lỗi storage không bao giờ làm hỏng trang */
            });
        }

        function del(key) {
            var fullKey = cacheKey(key);
            var removed = drop(fullKey);
            if (removed) state.counters.invalidations++;
            if (state.persist) idbDelete(fullKey).catch(function () { });
            return removed;
        }

        function invalidateTag(tag) {
            var keys = [];
            state.entries.forEach(function (entry, fullKey) {
                if (entry.tags && entry.tags.indexOf(tag) >= 0) keys.push(fullKey);
            });
            keys.forEach(function (fullKey) {
                drop(fullKey);
                if (state.persist) idbDelete(fullKey).catch(function () { });
            });
            state.counters.invalidations += keys.length;
            return keys.length;
        }

        function clear() {
            var count = state.entries.size;
            state.entries.clear();
            state.bytes = 0;
            state.counters.invalidations += count;
            if (state.persist) idbClear().catch(function () { state.counters.l2Errors++; });
            return count;
        }

        function clearPrivate() {
            /* Instance công khai không giữ dữ liệu riêng nên không bị xoá khi
               đổi tài khoản — tránh việc đăng nhập lại làm mất cache công khai. */
            if (!state.privateData) return 0;
            var keys = [];
            state.entries.forEach(function (entry, fullKey) { keys.push(fullKey); });
            keys.forEach(function (fullKey) { drop(fullKey); });
            state.counters.invalidations += keys.length;
            return keys.length;
        }

        function setScope(scope) {
            if (!state.privateData) return false;
            var next = String(scope == null ? 'anon' : scope);
            if (next === state.scope) return false;
            /* Đổi tài khoản: không một entry nào của tài khoản cũ được phục vụ
               cho tài khoản mới. */
            clearPrivate();
            state.scope = next;
            return true;
        }

        function wrap(key, loader, opts) {
            opts = opts || {};
            if (typeof loader !== 'function') return Promise.reject(new Error('BKCache: thiếu loader'));
            if (!state.enabled) {
                state.counters.bypasses++;
                return Promise.resolve().then(loader);
            }
            if (opts.force) del(key);

            return get(key).then(function (cached) {
                if (cached !== null && cached !== undefined) return cached;

                var fullKey = cacheKey(key);
                if (state.inflight.has(fullKey)) {
                    state.counters.dedup++;
                    return state.inflight.get(fullKey);
                }

                var timeoutMs = toInt(opts.timeoutMs, DEFAULT_LOADER_TIMEOUT_MS, 100, 120000);
                var timer = null;
                var promise = new Promise(function (resolve, reject) {
                    timer = global.setTimeout(function () {
                        reject(new Error('CACHE_LOAD_TIMEOUT'));
                    }, timeoutMs);
                    Promise.resolve().then(loader).then(resolve, reject);
                }).then(function (value) {
                    global.clearTimeout(timer);
                    state.inflight.delete(fullKey);
                    set(key, value, {
                        ttl: opts.ttl,
                        staleTtl: opts.staleTtl,
                        tags: opts.tags,
                        persist: opts.persist
                    });
                    return value;
                }, function (error) {
                    global.clearTimeout(timer);
                    /* Lỗi không được giữ lại trong cache/bản đồ in-flight: request
                       sau phải được thực hiện lại. */
                    state.inflight.delete(fullKey);
                    state.counters.errors++;
                    throw error;
                });

                state.inflight.set(fullKey, promise);
                return promise;
            });
        }

        function stats() {
            var counters = state.counters;
            var total = counters.hits + counters.misses;
            return {
                name: state.name,
                namespace: state.namespace.replace(/\|$/, ''),
                private: state.privateData,
                persist: state.persist,
                entryCount: state.entries.size,
                sizeBytes: state.bytes,
                maxEntries: state.maxEntries,
                maxBytes: state.maxBytes,
                hits: counters.hits,
                misses: counters.misses,
                hitRate: total ? Math.round((counters.hits / total) * 1000) / 10 : 0,
                l1Hits: counters.l1Hits,
                l2Hits: counters.l2Hits,
                l2Reads: counters.l2Reads,
                l2Writes: counters.l2Writes,
                l2Errors: counters.l2Errors,
                dedup: counters.dedup,
                saved: counters.hits + counters.dedup,
                evictions: counters.evictions,
                expirations: counters.expirations,
                invalidations: counters.invalidations,
                bypasses: counters.bypasses,
                errors: counters.errors,
                l2Available: !!(global.indexedDB && !dbBroken)
            };
        }

        var instance = {
            name: state.name,
            get: get,
            set: set,
            del: del,
            wrap: wrap,
            invalidateTag: invalidateTag,
            invalidateNamespace: clear,
            clear: clear,
            clearPrivate: clearPrivate,
            setScope: setScope,
            peek: function (key) {
                var hit = l1Get(cacheKey(key));
                return hit && !hit.stale ? hit.value : null;
            },
            stats: stats
        };

        instances.push(instance);
        return instance;
    }

    /* --------------------------- Tài khoản ------------------------------- */

    var shared = create({
        name: 'shared',
        namespace: 'site',
        maxEntries: 100,
        maxBytes: 512 * 1024,
        defaultTtl: 60000,
        persist: true
    });

    function clearOnAccountChange() {
        /* Chỉ xoá dữ liệu riêng; nội dung công khai (thông báo, changelog,
           feature flags) không phụ thuộc tài khoản nên giữ nguyên. */
        instances.forEach(function (instance) {
            try { instance.clearPrivate(); } catch (e) { }
        });
    }

    if (D && D.addEventListener) {
        try {
            global.addEventListener('bk:identity', function (event) {
                var detail = event && event.detail;
                clearOnAccountChange();
                instances.forEach(function (instance) {
                    if (instance.stats().private) instance.setScope(detail && detail.id ? detail.id : 'anon');
                });
            });
            global.addEventListener('bk:logout', clearOnAccountChange);
            global.addEventListener('bk:admin-logout', clearOnAccountChange);
        } catch (e) { }
    }

    global.BKCache = {
        create: create,
        shared: shared,
        stats: function () {
            return instances.map(function (instance) {
                try { return instance.stats(); } catch (e) { return null; }
            }).filter(Boolean);
        },
        setAccountScope: function (id) {
            instances.forEach(function (instance) {
                try { instance.setScope(id); } catch (e) { }
            });
        },
        clearPrivate: clearOnAccountChange,
        version: '8.8.0'
    };
})(typeof window !== 'undefined' ? window : this);
