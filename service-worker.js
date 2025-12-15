// Prompt Manager Service Worker
const CACHE_NAME = 'prompt-manager-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/app.js',
    '/diff.js',
    '/styles.css',
    '/favicon.svg',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// 安装事件 - 缓存静态资源
self.addEventListener('install', (event) => {
    console.log('[SW] 安装中...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] 缓存静态资源');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
    console.log('[SW] 激活中...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] 删除旧缓存:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 请求拦截
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // API 请求不走缓存
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request)
                .catch(() => {
                    return new Response(JSON.stringify({ error: '离线模式暂不支持此操作' }), {
                        status: 503,
                        headers: { 'Content-Type': 'application/json' }
                    });
                })
        );
        return;
    }
    
    // 静态资源使用缓存优先策略
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // 后台更新缓存
                    fetch(request).then((response) => {
                        if (response.ok) {
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(request, response);
                            });
                        }
                    });
                    return cachedResponse;
                }
                
                return fetch(request).then((response) => {
                    // 缓存新的资源
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return response;
                });
            })
    );
});

// 推送通知（预留）
self.addEventListener('push', (event) => {
    const options = {
        body: event.data?.text() || 'Prompt Manager 有新消息',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png'
    };
    
    event.waitUntil(
        self.registration.showNotification('Prompt Manager', options)
    );
});
