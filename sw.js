// 오프라인 지원: 앱 파일은 캐시 우선, 날씨 API는 네트워크만 사용
// VERSION은 커밋할 때 .githooks/pre-commit이 커밋 시각으로 바꾼다. 바뀌어야 휴대폰에 새 버전이 들어간다
const VERSION = '2026.10.26 17:03';
const FILES = [
  './', 'index.html', 'style.css', 'logic.js', 'app.js', 'manifest.webmanifest', 'courses.csv', 'version.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request))
  );
});
