import { NextResponse } from 'next/server';

import { ACTIVE_CARDS, CARDS_BY_ID } from '@/config/cards';
import { buildAllSnapshots, filterTransactions } from '@/lib/engine/snapshot';
import { judgeTransaction } from '@/lib/engine/performance';
import { currentMonthKey } from '@/lib/date';
import { assertCronAuthorized } from '@/lib/cron';
import { buildBenefitAlert } from '@/lib/alerts/rules';
import { sendAlert } from '@/lib/push';
import { fetchTransactionsForMonth, writeDerivedFields } from '@/lib/notion/transactions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 동기화 크론 — 15분 간격 호출을 상정한다.
 *
 * 두 가지 일을 한다.
 *   1. 계산 결과를 노션 거래 행에 역기입 (카드 상품·원화금액·실적 판정·혜택액)
 *   2. 새로 혜택이 붙은 거래에 대해 푸시 발송
 *
 * 거래 단위 알림의 중복 방지는 거래 행의 `알림 상태`로 한다.
 * 이미 '발송완료'인 거래는 건너뛴다.
 */
export async function POST(request: Request) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  const month = currentMonthKey();

  try {
    const transactions = await fetchTransactionsForMonth(month);
    const snapshots = buildAllSnapshots(ACTIVE_CARDS, transactions, month);

    let updated = 0;
    let notified = 0;
    let unmapped = 0;
    const errors: string[] = [];

    for (const snapshot of snapshots) {
      const card = CARDS_BY_ID[snapshot.cardId];
      const cardTx = filterTransactions(transactions, card.id, month);
      const benefitByTx = new Map(snapshot.appliedBenefits.map((b) => [b.transactionId, b]));

      for (const tx of cardTx) {
        const benefit = benefitByTx.get(tx.id);
        const hasBenefit = !!benefit && benefit.netAmount > 0;

        // 이미 처리된 거래는 다시 알리지 않는다.
        const alreadyNotified = tx.alertStatus === '발송완료' || tx.alertStatus === '대상아님';
        let alertStatus = tx.alertStatus;

        if (!alreadyNotified) {
          if (hasBenefit) {
            const alert = buildBenefitAlert(card, snapshot, tx.id, tx.title);
            if (alert) {
              try {
                const result = await sendAlert(alert);
                // 활성 구독이 하나도 없으면 '발송완료'로 찍으면 안 된다.
                // 나중에 기기를 등록했을 때 이 거래 알림이 영영 안 오게 된다.
                alertStatus = result.sent > 0 ? '발송완료' : '대기';
                if (result.sent > 0) notified += 1;
              } catch (e) {
                errors.push(`push ${tx.id}: ${e instanceof Error ? e.message : String(e)}`);
                alertStatus = '대기';
              }
            }
          } else {
            alertStatus = '대상아님';
          }
        }

        try {
          await writeDerivedFields(tx.id, {
            last4: tx.last4,
            cardProduct: card.notionOption,
            krwAmount: tx.krwAmount,
            // 스냅샷의 판정을 쓴다. judgeTransaction()을 다시 부르면 혜택 때문에
            // 빠진 거래(탄탄대로 Trendy)가 노션에는 '인정'으로 찍혀, 노션을 보고
            // 실적을 더하면 앱 화면과 다른 숫자가 나온다.
            performanceVerdict: snapshot.performanceVerdicts[tx.id] ?? judgeTransaction(card, tx),
            benefitAmount: benefit?.netAmount ?? 0,
            alertStatus,
          });
          updated += 1;
        } catch (e) {
          errors.push(`write ${tx.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    // 카드에 매핑되지 않은 거래도 표시해 둔다. 조용히 사라지면
    // 어떤 카드의 실적에도 안 잡히는데 아무도 모른다.
    for (const tx of transactions) {
      if (tx.cardId !== null) continue;
      unmapped += 1;
      try {
        await writeDerivedFields(tx.id, {
          last4: tx.last4,
          cardProduct: '미매핑',
          krwAmount: tx.krwAmount,
        });
      } catch (e) {
        errors.push(`write-unmapped ${tx.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return NextResponse.json({
      ok: errors.length === 0,
      month,
      transactions: transactions.length,
      updated,
      notified,
      unmapped,
      errors: errors.slice(0, 20),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
