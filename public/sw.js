/*
 * Strong Card Service Worker.
 *
 * 하는 일은 푸시 수신과 알림 클릭 처리 두 가지뿐이다.
 * 오프라인 캐싱은 하지 않는다 — 카드 실적 화면에서 낡은 숫자를 보여주는
 * 것은 아무것도 안 보여주는 것보다 나쁘다.
 */

self.addEventListener('install', () => {
  // 새 워커를 즉시 활성화한다. 알림 로직이 바뀌었는데 옛 워커가 계속
  // 도는 상황을 막는다.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Strong Card', body: event.data.text(), url: '/' };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Strong Card', {
      body: payload.body ?? '',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      // 같은 태그는 서로를 대체한다. 실적 경고가 D-7·D-3·D-1로
      // 세 번 쌓이지 않도록.
      tag: payload.tag,
      renotify: true,
      data: { url: payload.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // 이미 열린 탭이 있으면 새 창을 띄우지 않고 그리로 이동한다.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
