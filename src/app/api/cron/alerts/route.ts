import { NextResponse } from 'next/server';

import { ACTIVE_CARDS, CARDS_BY_ID } from '@/config/cards';
import { buildAllSnapshots } from '@/lib/engine/snapshot';
import { currentMonthKey, daysRemainingInMonth } from '@/lib/date';
import { assertCronAuthorized } from '@/lib/cron';
import { evaluateMonthlyAlerts } from '@/lib/alerts/rules';
import { sendAlert } from '@/lib/push';
import { fetchSentAlertKeys, recordAlert } from '@/lib/notion/alerts';
import { fetchTransactionsForMonth } from '@/lib/notion/transactions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 월 단위 알림 크론 — 하루 1회(KST 오전) 호출을 상정한다.
 *
 * 실적 미달 경고 · 구간 달성 · 혜택 한도 소진을 평가해 발송한다.
 * 중복 방지는 Alert_Log의 멱등 키로 한다. 크론이 몇 번 돌아도
 * 같은 알림은 한 번만 나간다.
 */
export async function POST(request: Request) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  const month = currentMonthKey();
  const daysRemaining = daysRemainingInMonth();

  try {
    const [transactions, sentKeys] = await Promise.all([
      fetchTransactionsForMonth(month),
      fetchSentAlertKeys(month),
    ]);

    const snapshots = buildAllSnapshots(ACTIVE_CARDS, transactions, month);

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const snapshot of snapshots) {
      const card = CARDS_BY_ID[snapshot.cardId];
      const alerts = evaluateMonthlyAlerts({ card, snapshot, daysRemaining });

      for (const alert of alerts) {
        if (sentKeys.has(alert.key)) {
          skipped += 1;
          continue;
        }

        try {
          const result = await sendAlert(alert);
          // 활성 구독이 없으면 이력을 남기지 않는다. 남기면 나중에
          // 기기를 등록해도 이 알림이 영영 안 온다.
          if (result.sent > 0) {
            await recordAlert(alert, true);
            sentKeys.add(alert.key);
            sent += 1;
          } else {
            skipped += 1;
          }
        } catch (e) {
          errors.push(`${alert.key}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    return NextResponse.json({
      ok: errors.length === 0,
      month,
      daysRemaining,
      sent,
      skipped,
      errors: errors.slice(0, 20),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
