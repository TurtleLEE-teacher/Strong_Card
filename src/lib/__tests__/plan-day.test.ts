/**
 * 신한 Discount Plan 'Plan Day' — 매월 1일 할인율 2배.
 *
 * 약관이 조건을 네 겹으로 걸어 둔다. 하나만 놓쳐도 1일 결제 계산이 틀어진다.
 *
 *   1. Time Plan·Daily Plan **서비스당 1회** (최대 2회)
 *   2. 각 서비스의 **첫 번째 할인 거래**에만
 *   3. **Daily Plan의 해외 영역은 제외**
 *   4. 별도 한도 없음 — 기존 월 통합 한도·일월 횟수 한도 안에서만
 *
 * 3번이 특히 놓치기 쉽다. 해외는 Daily Plan의 다른 영역과 나란히 있어
 * 무심코 같이 2배를 붙이게 된다.
 */

import { describe, expect, it } from 'vitest';
import { CARDS_BY_ID } from '@/config/cards';
import { buildSnapshot } from '@/lib/engine/snapshot';
import type { CardId, PaymentKind, Transaction } from '@/lib/types';

let seq = 0;
function tx(
  title: string,
  krwAmount: number,
  day: string,
  kstHour = 12,
  paymentKind: PaymentKind = '일시불',
): Transaction {
  seq += 1;
  const [y, m, d] = day.split('-').map(Number);
  return {
    id: `pd-${seq}`,
    title,
    merchant: title,
    rawAmount: krwAmount,
    currency: 'KRW',
    krwAmount,
    approvedAt: new Date(Date.UTC(y, m - 1, d, kstHour - 9, 0, 0)).toISOString(),
    issuer: null,
    last4: null,
    cardId: 'shinhan-discount-plan' as CardId,
    category: null,
    paymentKind,
    installmentMonths: null,
    canceled: false,
    rawMessage: null,
    issuerCumulative: null,
    alertStatus: null,
  };
}

const dp = CARDS_BY_ID['shinhan-discount-plan'];

/** 지난달 실적 — 40만 구간(Time 5,000 / Daily 10,000) */
const tier40 = () => tx('아무데나', 500_000, '2026-07-05');
/** 지난달 실적 — 120만 구간(Time 15,000 / Daily 30,000) */
const tier120 = () => tx('아무데나', 1_300_000, '2026-07-05');

const netOf = (snap: ReturnType<typeof buildSnapshot>, id: string) =>
  snap.appliedBenefits.find((b) => b.transactionId === id)?.netAmount ?? 0;

describe('Plan Day — 매월 1일 할인율 2배', () => {
  it('1일 Time Plan 첫 건은 2배가 된다', () => {
    // 카페 3만원: 이용금액 상한 1만원 × 10% = 1,000원 → Plan Day면 2,000원
    const normal = tx('스타벅스 강남점', 30_000, '2026-08-02', 10);
    const planDay = tx('스타벅스 강남점', 30_000, '2026-08-01', 10);

    expect(netOf(buildSnapshot(dp, [tier120(), normal], '2026-08'), normal.id)).toBe(1_000);
    expect(netOf(buildSnapshot(dp, [tier120(), planDay], '2026-08'), planDay.id)).toBe(2_000);
  });

  it('서비스당 1회다 — 같은 서비스의 두 번째 건은 평소 요율', () => {
    // Time Plan 안에서 카페(07~15시) → 편의점(18~22시) 순서.
    // 영역은 다르지만 같은 서비스라 2배는 첫 건에만 붙는다.
    const first = tx('스타벅스 강남점', 30_000, '2026-08-01', 10);
    const second = tx('GS25 역삼점', 30_000, '2026-08-01', 19);

    const snap = buildSnapshot(dp, [tier120(), first, second], '2026-08');
    expect(netOf(snap, first.id)).toBe(2_000);
    expect(netOf(snap, second.id)).toBe(1_000);
  });

  it('Time Plan과 Daily Plan은 각각 1회씩 받는다 (최대 2회)', () => {
    const time = tx('스타벅스 강남점', 30_000, '2026-08-01', 10);
    // 마트 8만원: 이용금액 상한 5만원 × 10% = 5,000원 → Plan Day면 10,000원
    const daily = tx('이마트 성수점', 80_000, '2026-08-01', 14);

    const snap = buildSnapshot(dp, [tier120(), time, daily], '2026-08');
    expect(netOf(snap, time.id)).toBe(2_000);
    expect(netOf(snap, daily.id)).toBe(10_000);
  });

  it('해외 영역에는 Plan Day가 붙지 않는다', () => {
    // 약관: "Daily Plan 서비스의 해외 영역에는 Plan Day 서비스가 적용되지 않습니다"
    // 해외 8만원: 이용금액 상한 5만원 × 5% = 2,500원. 1일이어도 그대로다.
    const overseas = tx('ANTHROPIC PBC', 80_000, '2026-08-01', 12, '해외');

    const snap = buildSnapshot(dp, [tier120(), overseas], '2026-08');
    expect(netOf(snap, overseas.id)).toBe(2_500);
  });

  it('해외가 먼저 와도 Daily Plan의 2배 기회를 태우지 않는다', () => {
    // 해외는 Plan Day 대상이 아니므로, 뒤따라오는 마트 결제가 2배를 받아야 한다.
    const overseas = tx('ANTHROPIC PBC', 80_000, '2026-08-01', 9, '해외');
    const mart = tx('이마트 성수점', 80_000, '2026-08-01', 14);

    const snap = buildSnapshot(dp, [tier120(), overseas, mart], '2026-08');
    expect(netOf(snap, overseas.id)).toBe(2_500);
    expect(netOf(snap, mart.id)).toBe(10_000);
  });

  it('2일에는 2배가 없다', () => {
    const t = tx('스타벅스 강남점', 30_000, '2026-08-02', 10);
    expect(netOf(buildSnapshot(dp, [tier120(), t], '2026-08'), t.id)).toBe(1_000);
  });

  it('별도 한도가 아니다 — 월 통합 한도를 넘지 못한다', () => {
    // 40만 구간이면 Daily Plan 월 한도가 통째로 10,000원.
    // Plan Day 마트 결제 한 건이 그 한도를 정확히 다 태운다.
    const mart = tx('이마트 성수점', 80_000, '2026-08-01', 14);
    const next = tx('무신사', 80_000, '2026-08-03', 14);

    const snap = buildSnapshot(dp, [tier40(), mart, next], '2026-08');
    expect(netOf(snap, mart.id)).toBe(10_000);
    // 한도를 다 썼으니 다음 건은 0원이고, 이유가 남아야 한다.
    expect(netOf(snap, next.id)).toBe(0);
    expect(snap.noBenefit[next.id]?.reason).toBe('월 한도 소진');
    expect(snap.benefitUsage.find((u) => u.capGroup === 'dp-daily')?.used).toBe(10_000);
  });

  it('한도에 걸려 0원이 된 건은 2배 기회를 태우지 않는다', () => {
    // 약관의 "첫 번째 **할인** 거래"가 그 뜻이다. Daily 한도를 미리 다 쓴
    // 상태에서 1일 결제가 0원이 나와도, 그건 할인 거래가 아니다.
    const mart = tx('이마트 성수점', 80_000, '2026-08-01', 9);
    const online = tx('무신사', 80_000, '2026-08-01', 14);

    const snap = buildSnapshot(dp, [tier40(), mart, online], '2026-08');
    expect(netOf(snap, mart.id)).toBe(10_000); // 2배로 한도를 다 태움
    expect(netOf(snap, online.id)).toBe(0);
  });

  it('Monthly Plan(공과금·구독·영화)에는 Plan Day가 없다', () => {
    for (const rule of dp.benefits) {
      if (rule.capGroup === 'dp-recurring' || rule.capGroup === 'dp-cinema') {
        expect(rule.bonusDay, `${rule.id}에 bonusDay가 붙어 있다`).toBeUndefined();
      }
    }
  });

  it('Time·Daily의 해외 외 모든 영역에는 Plan Day가 붙어 있다', () => {
    for (const rule of dp.benefits) {
      if (rule.capGroup !== 'dp-time' && rule.capGroup !== 'dp-daily') continue;
      if (rule.id === 'dp-daily-overseas') {
        expect(rule.bonusDay).toBeUndefined();
      } else {
        expect(rule.bonusDay, `${rule.id}에 bonusDay가 빠져 있다`).toEqual({
          dayOfMonth: 1,
          multiplier: 2,
        });
      }
    }
  });
});
