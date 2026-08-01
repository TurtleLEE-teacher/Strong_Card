import 'server-only';
import webpush from 'web-push';

import type { Alert } from '@/lib/alerts/rules';
import {
  deactivateSubscription,
  fetchActiveSubscriptions,
  markSubscriptionSent,
  type PushSubscriptionRecord,
} from '@/lib/notion/subscriptions';

/**
 * Web Push 발송.
 *
 * VAPID 키가 없으면 조용히 실패하지 않고 에러를 던진다. 알림이 안 오는데
 * 이유를 모르는 상태가 제일 나쁘다.
 */

let configured = false;

function ensureConfigured(): void {
  if (configured) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:noreply@example.com';

  if (!publicKey || !privateKey) {
    throw new Error(
      'VAPID 키가 없습니다. `npx web-push generate-vapid-keys`로 생성한 뒤 ' +
        'NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY에 설정하세요.',
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** 발송이 실패한 기기 하나 */
export interface SendFailure {
  device: string | null;
  /** 푸시 서비스가 준 HTTP 상태. 410이면 구독이 죽은 것. */
  statusCode?: number;
  message: string;
}

export interface SendResult {
  sent: number;
  failed: number;
  deactivated: number;
  /**
   * 실패 사유. 예전에는 세기만 하고 버렸는데, 그러면 "알림이 안 와요"에
   * 아무 답도 못 한다. 진단 화면이 쓸 수 있게 남긴다.
   */
  failures: SendFailure[];
}

/** 알림 하나를 모든 활성 기기에 보낸다. */
export async function sendAlert(alert: Alert): Promise<SendResult> {
  const subscriptions = await fetchActiveSubscriptions();
  return sendToSubscriptions(subscriptions, {
    title: alert.title,
    body: alert.body,
    url: alert.url,
    // 같은 태그의 알림은 알림창에서 서로를 대체한다.
    // 실적 경고가 D-7, D-3, D-1로 세 번 쌓이는 걸 막는다.
    tag: `${alert.type}:${alert.cardId}`,
  });
}

export async function sendToSubscriptions(
  subscriptions: PushSubscriptionRecord[],
  payload: PushPayload,
): Promise<SendResult> {
  ensureConfigured();

  let sent = 0;
  let failed = 0;
  let deactivated = 0;
  const failures: SendFailure[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload),
        );
        sent += 1;
        await markSubscriptionSent(sub.pageId);
      } catch (e) {
        failed += 1;
        // 404/410은 구독이 영구히 죽었다는 뜻이다. 재시도해도 소용없다.
        const statusCode = (e as { statusCode?: number }).statusCode;
        failures.push({
          device: sub.device,
          statusCode,
          message: e instanceof Error ? e.message : String(e),
        });
        if (statusCode === 404 || statusCode === 410) {
          await deactivateSubscription(sub.pageId);
          deactivated += 1;
        }
      }
    }),
  );

  return { sent, failed, deactivated, failures };
}
