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

interface TestResult {
  ok: boolean;
  subscriptions?: number;
  thisDeviceRegistered?: boolean | null;
  sent?: number;
  failed?: number;
  failures?: { statusCode?: number; message: string }[];
  hint?: string;
  error?: string;
}

export function PushSetup({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [status, setStatus] = useState<Status>('checking');
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

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

  /**
   * 지금 이 기기로 테스트 알림을 쏜다.
   *
   * 이 기기의 endpoint를 같이 보내야 서버가 "브라우저는 구독돼 있는데
   * 서버 기록에는 없다"는 어긋남을 잡아낼 수 있다. 그 상태가 화면상
   * '알림을 받습니다'로 보이면서 실제로는 아무것도 안 오는 원인이다.
   */
  async function sendTest() {
    setTesting(true);
    setTest(null);

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      const response = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription?.endpoint }),
      });
      setTest(await response.json());
    } catch (e) {
      setTest({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
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
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium" style={{ color: 'var(--status-good)' }}>
            ● 이 기기로 알림을 받습니다
          </span>
          {/* 이 버튼이 없으면 "알림이 안 와요"에 아무 답도 못 한다.
              사슬 네 토막 중 어디가 끊겼는지는 실제로 쏴 봐야 안다. */}
          <button
            type="button"
            onClick={sendTest}
            disabled={testing}
            className="rounded-lg px-2.5 py-1 text-xs disabled:opacity-50"
            style={{ background: 'var(--surface-alt)', color: 'var(--text-secondary)' }}
          >
            {testing ? '보내는 중…' : '테스트 알림 보내기'}
          </button>
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

      {test && <TestReport result={test} />}

      {error && (
        <p className="mt-2 text-xs" style={{ color: 'var(--status-critical)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * 테스트 결과를 사슬 순서대로 보여준다.
 *
 * "실패"만 적으면 사용자가 할 수 있는 일이 없다. 등록된 기기 수와
 * 푸시 서비스의 응답 코드까지 드러내야 다음 행동이 정해진다.
 */
function TestReport({ result }: { result: TestResult }) {
  if (result.error) {
    return (
      <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--status-critical)' }}>
        오류: {result.error}
      </p>
    );
  }

  return (
    <div
      className="mt-3 rounded-lg px-3 py-2.5 text-xs leading-relaxed"
      style={{ background: 'var(--surface-alt)', color: 'var(--text-secondary)' }}
    >
      <p style={{ color: result.ok ? 'var(--status-good)' : 'var(--status-serious)' }}>
        {result.ok ? '● 발송 성공' : '● 발송되지 않음'}
      </p>
      <ul className="mt-1.5 space-y-0.5">
        <li>서버에 등록된 기기 {result.subscriptions ?? 0}대</li>
        {result.thisDeviceRegistered !== null && result.thisDeviceRegistered !== undefined && (
          <li>이 기기 등록 여부: {result.thisDeviceRegistered ? '있음' : '없음'}</li>
        )}
        <li>
          발송 성공 {result.sent ?? 0} · 실패 {result.failed ?? 0}
        </li>
      </ul>
      {result.failures?.map((f, i) => (
        <p key={i} className="mt-1" style={{ color: 'var(--status-serious)' }}>
          {f.statusCode ? `[${f.statusCode}] ` : ''}
          {f.message}
        </p>
      ))}
      {result.hint && (
        <p className="mt-1.5" style={{ color: 'var(--text-primary)' }}>
          {result.hint}
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
