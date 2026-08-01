/**
 * 취소 전표(음수 금액) 처리.
 *
 * 노션에는 취소가 원거래와 별개의 **음수 행**으로 들어오고 원거래는
 * 그대로 남는다. 예전에는 음수 행을 통째로 버렸는데, 그러면 두 가지가
 * 동시에 틀어졌다.
 *
 *   실적  원거래의 양수만 남아 실적이 부풀어 오른다
 *   혜택  이미 소진된 한도가 영원히 돌아오지 않는다
 *
 * 두 번째가 특히 나쁘다. 사용자는 쓰지도 않은 한도가 소진된 화면을 보고
 * 남은 혜택을 실제보다 적게 알아, 그 카드를 안 꺼내게 된다.
 */

import { describe, expect, it } from 'vitest';
import { CARDS_BY_ID } from '@/config/cards';
import { buildSnapshot } from '@/lib/engine/snapshot';
import { computePerformance } from '@/lib/engine/performance';
import { linkReversals } from '@/lib/engine/reversal';
import type { CardId, Transaction } from '@/lib/types';

let seq = 0;
function tx(
  cardId: CardId,
  title: string,
  krwAmount: number,
  day: string,
  kstHour = 14,
): Transaction {
  seq += 1;
  const [y, m, d] = day.split('-').map(Number);
  return {
    id: `rv-${seq}`,
    title,
    merchant: title,
    rawAmount: krwAmount,
    currency: 'KRW',
    krwAmount,
    approvedAt: new Date(Date.UTC(y, m - 1, d, kstHour - 9, 0, 0)).toISOString(),
    issuer: null,
    last4: null,
    cardId,
    category: null,
    paymentKind: '일시불',
    installmentMonths: null,
    canceled: false,
    rawMessage: null,
    issuerCumulative: null,
    alertStatus: null,
  };
}

/** 취소 전표: 음수 금액 + 결제 구분 '취소·환불' */
function cancel(
  cardId: CardId,
  title: string,
  krwAmount: number,
  day: string,
  kstHour = 14,
): Transaction {
  return {
    ...tx(cardId, title, -Math.abs(krwAmount), day, kstHour),
    paymentKind: '취소·환불',
    canceled: true,
  };
}

const dp = CARDS_BY_ID['shinhan-discount-plan'];
const tantan = CARDS_BY_ID['kb-tantandaero'];

/** 지난달 실적을 최고 구간까지 채워 두는 더미 결제 */
const prevMonth = (cardId: CardId, amount: number) =>
  tx(cardId, '아무데나', amount, '2026-07-05');

describe('취소 전표는 원거래를 되감는다', () => {
  it('혜택이 회수되고 한도가 돌아온다', () => {
    const buy = tx('shinhan-discount-plan', '무신사', 50_000, '2026-08-03');
    const back = cancel('shinhan-discount-plan', '무신사', 50_000, '2026-08-04');

    const before = buildSnapshot(dp, [prevMonth('shinhan-discount-plan', 1_300_000), buy], '2026-08');
    const after = buildSnapshot(
      dp,
      [prevMonth('shinhan-discount-plan', 1_300_000), buy, back],
      '2026-08',
    );

    const used = (s: typeof before) =>
      s.benefitUsage.find((u) => u.capGroup === 'dp-daily')?.used ?? 0;

    expect(used(before)).toBeGreaterThan(0);
    // 되감았으니 소진량이 0으로 돌아와야 한다.
    expect(used(after)).toBe(0);
    expect(after.totalBenefitUsed).toBe(0);
  });

  it('회수분이 음수 혜택으로 남아 화면이 설명할 수 있다', () => {
    const buy = tx('shinhan-discount-plan', '무신사', 50_000, '2026-08-03');
    const back = cancel('shinhan-discount-plan', '무신사', 50_000, '2026-08-04');
    const snap = buildSnapshot(
      dp,
      [prevMonth('shinhan-discount-plan', 1_300_000), buy, back],
      '2026-08',
    );

    const applied = snap.appliedBenefits.find((b) => b.transactionId === buy.id)!;
    const reversed = snap.appliedBenefits.find((b) => b.transactionId === back.id)!;
    expect(applied.netAmount).toBeGreaterThan(0);
    expect(reversed.netAmount).toBe(-applied.netAmount);
    expect(reversed.ruleId).toBe(applied.ruleId);
  });

  it('실적에서도 상계된다', () => {
    const buy = tx('shinhan-discount-plan', '동네철물점', 200_000, '2026-08-03');
    const back = cancel('shinhan-discount-plan', '동네철물점', 200_000, '2026-08-04');
    const other = tx('shinhan-discount-plan', '다른가게', 300_000, '2026-08-05');

    const snap = buildSnapshot(dp, [buy, back, other], '2026-08');
    // 20만원을 쓰고 취소했으면 실적은 나머지 30만원뿐이다.
    expect(snap.currentSpend).toBe(300_000);
  });

  it('취소 전표를 「제외-취소」 칸으로 빼지 않는다', () => {
    // 예전 동작: 음수를 제외 칸에 넣어 원거래의 양수만 실적에 남았다.
    const buy = tx('shinhan-discount-plan', '동네철물점', 200_000, '2026-08-03');
    const back = cancel('shinhan-discount-plan', '동네철물점', 200_000, '2026-08-04');
    const perf = computePerformance(dp, [buy, back]);

    expect(perf.includedSpend).toBe(0);
    expect(perf.exclusions).toHaveLength(0);
  });

  it('부분취소는 되감은 비율만큼만 회수한다', () => {
    // 무신사 10만원 결제 → 온라인쇼핑 5% → 이용금액 상한 1만원이라 500원.
    const buy = tx('shinhan-discount-plan', '무신사', 100_000, '2026-08-03');
    const back = cancel('shinhan-discount-plan', '무신사', 40_000, '2026-08-04');
    const snap = buildSnapshot(
      dp,
      [prevMonth('shinhan-discount-plan', 1_300_000), buy, back],
      '2026-08',
    );

    const applied = snap.appliedBenefits.find((b) => b.transactionId === buy.id)!;
    const reversed = snap.appliedBenefits.find((b) => b.transactionId === back.id)!;
    // 40 / 100 만큼만 되돌린다.
    expect(reversed.netAmount).toBe(-Math.floor((applied.netAmount * 40_000) / 100_000));
    // 실적도 60,000원만 남는다.
    expect(snap.currentSpend).toBe(60_000);
  });

  it('취소된 건이 태운 횟수를 돌려준다', () => {
    // Discount Plan 마트는 **일 1회**. 첫 건을 취소하면 같은 날 다음 건이
    // 다시 대상이 되어야 한다.
    const first = tx('shinhan-discount-plan', '이마트 성수점', 50_000, '2026-08-05', 9);
    const back = cancel('shinhan-discount-plan', '이마트 성수점', 50_000, '2026-08-05', 10);
    const second = tx('shinhan-discount-plan', '이마트 성수점', 50_000, '2026-08-05', 18);

    const snap = buildSnapshot(
      dp,
      [prevMonth('shinhan-discount-plan', 1_300_000), first, back, second],
      '2026-08',
    );
    // 취소로 횟수가 돌아왔으니 두 번째 건은 정상적으로 할인을 받는다.
    expect(snap.noBenefit[second.id]).toBeUndefined();
    expect(
      snap.appliedBenefits.find((b) => b.transactionId === second.id)?.netAmount,
    ).toBeGreaterThan(0);
  });

  it('원거래를 못 찾으면 한도를 건드리지 않는다', () => {
    // 지난달 결제를 이번 달에 취소한 경우. 그 혜택은 지난달 한도에서
    // 나갔으므로 이번 달 한도를 되돌리면 이번 달 소진량이 작아진다.
    const buy = tx('shinhan-discount-plan', '올리브영', 50_000, '2026-08-03');
    const orphan = cancel('shinhan-discount-plan', '무신사', 50_000, '2026-08-04');
    const snap = buildSnapshot(
      dp,
      [prevMonth('shinhan-discount-plan', 1_300_000), buy, orphan],
      '2026-08',
    );

    const applied = snap.appliedBenefits.find((b) => b.transactionId === buy.id)!;
    expect(snap.totalBenefitUsed).toBe(applied.netAmount);
    expect(snap.noBenefit[orphan.id]?.reason).toBe('취소·환불');
    expect(snap.noBenefit[orphan.id]?.detail).toBe('원거래를 못 찾아 회수 안 함');
  });

  it('취소 표시만 붙은 양수 원거래는 이중으로 빼지 않는다', () => {
    // 카드사가 별도 음수 전표를 주지 않고 원거래에 표시만 남긴 경우.
    // 여기에 음수까지 붙이면 같은 결제를 두 번 뺀다.
    const marked = {
      ...tx('shinhan-discount-plan', '동네철물점', 200_000, '2026-08-03'),
      canceled: true,
    };
    const other = tx('shinhan-discount-plan', '다른가게', 300_000, '2026-08-05');
    const snap = buildSnapshot(dp, [marked, other], '2026-08');

    expect(snap.currentSpend).toBe(300_000);
    expect(snap.noBenefit[marked.id]?.reason).toBe('취소·환불');
  });

  it('Trendy 실적 제외 건이 취소돼도 실적이 음수로 깎이지 않는다', () => {
    // 탄탄대로는 Trendy 할인을 받은 건을 실적에서 통째로 뺀다. 원거래만
    // 빼고 취소 전표를 '인정'으로 남기면 실적이 취소액만큼 마이너스로 깎인다.
    const trendy = tx('kb-tantandaero', '강남헤어살롱', 100_000, '2026-08-03');
    const back = cancel('kb-tantandaero', '강남헤어살롱', 100_000, '2026-08-04');
    const other = tx('kb-tantandaero', '다른가게', 500_000, '2026-08-05');
    const prev = prevMonth('kb-tantandaero', 900_000);

    // 전제: 이 거래는 실제로 Trendy 할인을 받고 실적에서 빠진다.
    const noCancel = buildSnapshot(tantan, [prev, trendy, other], '2026-08');
    expect(
      noCancel.appliedBenefits.find((b) => b.transactionId === trendy.id)?.netAmount,
    ).toBe(20_000);
    expect(noCancel.currentSpend).toBe(500_000);

    const snap = buildSnapshot(tantan, [prev, trendy, back, other], '2026-08');
    expect(snap.currentSpend).toBe(500_000);
    expect(snap.totalBenefitUsed).toBe(0);
  });
});

describe('취소 전표 짝짓기', () => {
  it('금액이 딱 맞는 건을 먼저 고른다', () => {
    const small = tx('shinhan-discount-plan', '무신사', 30_000, '2026-08-01');
    const big = tx('shinhan-discount-plan', '무신사', 80_000, '2026-08-02');
    const back = cancel('shinhan-discount-plan', '무신사', 30_000, '2026-08-03');

    const links = linkReversals([small, big, back]);
    expect(links.get(back.id)?.originalId).toBe(small.id);
    expect(links.get(back.id)?.full).toBe(true);
  });

  it('취소 문자의 말머리 때문에 짝을 놓치지 않는다', () => {
    const buy = tx('shinhan-discount-plan', '무신사', 50_000, '2026-08-01');
    const back = cancel('shinhan-discount-plan', '무신사 취소', 50_000, '2026-08-02');

    expect(linkReversals([buy, back]).get(back.id)?.originalId).toBe(buy.id);
  });

  it('같은 원거래를 두 전표가 나눠 먹지 않는다', () => {
    const buy = tx('shinhan-discount-plan', '무신사', 50_000, '2026-08-01');
    const first = cancel('shinhan-discount-plan', '무신사', 50_000, '2026-08-02');
    const second = cancel('shinhan-discount-plan', '무신사', 50_000, '2026-08-03');

    const links = linkReversals([buy, first, second]);
    expect(links.get(first.id)?.originalId).toBe(buy.id);
    expect(links.has(second.id)).toBe(false);
  });

  it('부분취소가 두 번 들어와도 잔액을 따라간다', () => {
    const buy = tx('shinhan-discount-plan', '무신사', 100_000, '2026-08-01');
    const first = cancel('shinhan-discount-plan', '무신사', 40_000, '2026-08-02');
    const second = cancel('shinhan-discount-plan', '무신사', 60_000, '2026-08-03');

    const links = linkReversals([buy, first, second]);
    expect(links.get(first.id)?.full).toBe(false);
    expect(links.get(second.id)?.originalId).toBe(buy.id);
    expect(links.get(second.id)?.full).toBe(true);
  });

  it('취소보다 나중에 승인된 결제는 후보가 아니다', () => {
    const back = cancel('shinhan-discount-plan', '무신사', 50_000, '2026-08-01');
    const later = tx('shinhan-discount-plan', '무신사', 50_000, '2026-08-02');

    expect(linkReversals([back, later]).has(back.id)).toBe(false);
  });
});
