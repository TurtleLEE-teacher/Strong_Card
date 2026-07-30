'use client';

import { useEffect, useState } from 'react';

/**
 * Web Push 구독 UI.
 *
 * iOS의 함정: Safari는 **홈 화면에 추가된 상태(standalone)**에서만
 * Notification API를 노출한다. 브라우저 탭에서는 버튼이 아예 동작하지
 * 않으므로, 그 경우 버튼 대신 홈 화면 추가 방법을 안내해야 한다.
 * 이걸 안 하면 "알림 켜기를 눌렀는데 아무 일도 안 일어남" 상태가 된다.
 */

type Status =
  | 'checking'
  | 'unsupported'
  | 'needs-install' // iOS 브라우저 탭 — 홈 화면 추가 필요
  | 'no-vapid' // 서버에 VAPID 키가 없음 — 눌러도 실패한다
  | 'denied'
  | 'off'
  | 'on'
  | 'working';

export function PushSetup({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [status, setStatus] = useState<Status>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      if (typeof window === 'undefined') return;

      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as { standalone?: boolean }).standalone === true;
      const isIos = /iPad|iPhone|iPod/.test(window.navigator.userAgent);

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        // iOS는 홈 화면에 추가하기 전까지 PushManager 자체가 없다.
        setStatus(isIos && !isStandalone ? 'needs-install' : 'unsupported');
        return;
      }

      // 서버 키가 없으면 구독 자체가 불가능하다. 눌러야만 알 수 있는
      // 버튼을 내놓지 않는다.
      if (!vapidPublicKey) {
        setStatus('no-vapid');
        return;
      }

      if (Notification.permission === 'denied') {
        setStatus('denied');
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration();
      const existing = await registration?.pushManager.getSubscription();
      setStatus(existing ? 'on' : 'off');
    })();
  }, [vapidPublicKey]);

  async function enable() {
    setStatus('working');
    setError(null);

    try {
      if (!vapidPublicKey) {
        throw new Error(
          'VAPID 공개키가 설정되지 않았습니다. NEXT_PUBLIC_VAPID_PUBLIC_KEY를 확인하세요.',
        );
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'off');
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const json = subscription.toJSON();
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: json.keys,
          device: navigator.userAgent.slice(0, 200),
        }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error ?? '구독 저장에 실패했습니다.');
      }

      setStatus('on');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('off');
    }
  }

  async function disable() {
    setStatus('working');
    setError(null);

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      setStatus('off');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('on');
    }
  }

  return (
    <div>
      {status === 'checking' && <Muted>확인 중…</Muted>}

      {status === 'needs-install' && (
        <div>
          <Muted>
            iOS에서는 <strong>홈 화면에 추가</strong>해야 알림을 받을 수 있습니다.
          </Muted>
          <ol className="mt-2 space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <li>1. Safari 하단의 공유 버튼 탭</li>
            <li>2. &lsquo;홈 화면에 추가&rsquo; 선택</li>
            <li>3. 홈 화면 아이콘으로 다시 열고 이 화면에서 알림 켜기</li>
          </ol>
        </div>
      )}

      {status === 'unsupported' && <Muted>이 브라우저는 웹 푸시를 지원하지 않습니다.</Muted>}

      {status === 'no-vapid' && (
        <Muted>
          서버에 VAPID 키가 없어 알림을 켤 수 없습니다. 아래 안내대로 키를 설정한 뒤 다시
          열어주세요.
        </Muted>
      )}

      {status === 'denied' && (
        <Muted>
          알림이 차단되어 있습니다. 브라우저 설정에서 이 사이트의 알림 권한을 허용으로 바꿔주세요.
        </Muted>
      )}

      {(status === 'off' || status === 'working') && (
        <button
          type="button"
          onClick={enable}
          disabled={status === 'working'}
          className="rounded-lg px-3.5 py-2 text-xs font-medium disabled:opacity-50"
          style={{ background: 'var(--meter-accent)', color: '#fff' }}
        >
          {status === 'working' ? '설정 중…' : '알림 켜기'}
        </button>
      )}

      {status === 'on' && (
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium" style={{ color: 'var(--status-good)' }}>
            ● 이 기기로 알림을 받습니다
          </span>
          <button
            type="button"
            onClick={disable}
            className="text-xs underline"
            style={{ color: 'var(--text-muted)' }}
          >
            끄기
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs" style={{ color: 'var(--status-critical)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
      {children}
    </p>
  );
}

/**
 * VAPID 공개키(base64url)를 pushManager가 요구하는 바이트 배열로 변환.
 *
 * ArrayBuffer를 명시적으로 만들어 담는다. `new Uint8Array(length)`의 타입은
 * SharedArrayBuffer를 포함하는 ArrayBufferLike라서 BufferSource에 안 맞는다.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
