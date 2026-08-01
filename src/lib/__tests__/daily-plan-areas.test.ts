/**
 * 신한 Discount Plan Daily Plan — 영역 구분과 Plan Day의 관계.
 *
 * 두 가지 제한이 서로 다른 단위로 걸려 있어 헷갈리기 쉽다.
 *
 *   Plan Day 2배   **서비스** 단위 — Time Plan 1회, Daily Plan 1회
 *   일 1회·월 5회   **영역** 단위 — 마트 / 온라인쇼핑 / 잡화 / 주유 / …
 *
 * 그래서 "쿠팡을 먼저 긁으면 올리브영은 할인을 아예 못 받나?"의 답은
 * 아니오다 — 영역이 다르니 둘 다 받는다. 못 받는 건 2배뿐이다.
 *
 * 이 파일은 카드사 약관의 **공식 예시를 그대로 재현**해 그 구분을 고정한다.
 * 출처: 신한카드 앱 '혜택 안내 > Daily Plan 서비스' (사용자 제공, 2026-08-01)
 */

import { describe, expect, it } from 'vitest';
import { CARDS_BY_ID } from '@/config/cards';
import { buildSnapshot } from '@/lib/engine/snapshot';
import { resolveBrand } from '@/config/merchants';
import type { CardId, Transaction } from '@/lib/types';

let seq = 0;
function tx(title: string, krwAmount: number, kstHour: number, dayOfMonth = 1): Transaction {
  seq += 1;
  return {
    id: `dpa-${seq}`,
    title,
    merchant: title,
    rawAmount: krwAmount,
    currency: 'KRW',
    krwAmount,
    approvedAt: new Date(Date.UTC(2026, 7, dayOfMonth, kstHour - 9, 0, 0)).toISOString(),
    issuer: null,
    last4: null,
    cardId: 'shinhan-discount-plan' as CardId,
    category: null,
    paymentKind: '일시불',
    installmentMonths: null,
    canceled: false,
    rawMessage: null,
    issuerCumulative: null,
    alertStatus: null,
  };
}

const dp = CARDS_BY_ID['shinhan-discount-plan'];
/** 120만 구간 — Time 15,000 / Daily 30,000 */
const prevMonth = (): Transaction => ({
  ...tx('아무데나', 2_000_000, 12),
  approvedAt: '2026-07-05T03:00:00.000Z',
});

const net = (snap: ReturnType<typeof buildSnapshot>, id: string) =>
  snap.appliedBenefits.find((b) => b.transactionId === id)?.netAmount ?? 0;

describe('약관 공식 예시를 그대로 재현한다', () => {
  /*
   * [예시] 5월 1일
   *   오전 10시 올리브영(잡화) 3만원  → Plan Day 20% 할인
   *   오후 1시  스타벅스(커피) 5천원   → Plan Day 20% 할인
   *   오후 2시  S-OIL(주유) 5만원     → Daily Plan 5% 할인   ← 2배 아님
   *   오후 5시  다이소(잡화) 2만원     → 할인 제외(일1회 한도 초과)
   */
  const oliveyoung = tx('올리브영', 30_000, 10);
  const starbucks = tx('스타벅스', 5_000, 13);
  const soil = tx('S-OIL 주유소', 50_000, 14);
  const daiso = tx('다이소', 20_000, 17);
  const snap = buildSnapshot(
    dp,
    [prevMonth(), oliveyoung, starbucks, soil, daiso],
    '2026-08',
  );

  it('첫 Daily Plan 거래(올리브영)가 2배를 가져간다', () => {
    // 3만원 × 20% = 6,000원
    expect(net(snap, oliveyoung.id)).toBe(6_000);
  });

  it('첫 Time Plan 거래(스타벅스)도 따로 2배를 받는다', () => {
    // 5천원 × 20% = 1,000원. Daily와 별개 서비스라 각자 1회씩이다.
    expect(net(snap, starbucks.id)).toBe(1_000);
  });

  it('주유는 2배가 아니다 — Daily Plan 2배는 올리브영이 이미 썼다', () => {
    // 5만원 × 5% = 2,500원. 약관 예시도 'Plan Day 10%'가 아니라
    // 'Daily Plan 5% 할인'이라고 적는다. 여기가 가장 오해하기 쉬운 자리다.
    expect(net(snap, soil.id)).toBe(2_500);
  });

  it('주유가 할인은 받는 이유는 영역이 달라서다 (횟수는 영역 단위)', () => {
    expect(snap.noBenefit[soil.id]).toBeUndefined();
  });

  it('같은 잡화 영역의 다이소는 일 1회에 걸려 0원이다', () => {
    expect(net(snap, daiso.id)).toBe(0);
    expect(snap.noBenefit[daiso.id]?.reason).toBe('횟수 초과');
  });
});

describe('영역이 다르면 둘 다 할인받는다 (2배만 하나)', () => {
  it('쿠팡(온라인쇼핑) → 올리브영(잡화): 둘 다 받고 2배는 앞에만', () => {
    const coupang = tx('쿠팡', 60_000, 10);
    const olive = tx('올리브영', 60_000, 15);
    const snap = buildSnapshot(dp, [prevMonth(), coupang, olive], '2026-08');

    expect(net(snap, coupang.id)).toBe(10_000); // 5만 × 20% (Plan Day)
    expect(net(snap, olive.id)).toBe(5_000); // 5만 × 10% (평소)
    expect(snap.noBenefit[olive.id]).toBeUndefined();
  });

  it('순서를 바꿔도 합계는 같다', () => {
    const olive = tx('올리브영', 60_000, 10);
    const coupang = tx('쿠팡', 60_000, 15);
    const snap = buildSnapshot(dp, [prevMonth(), olive, coupang], '2026-08');

    expect(net(snap, olive.id)).toBe(10_000);
    expect(net(snap, coupang.id)).toBe(5_000);
    expect(snap.totalBenefitUsed).toBe(15_000);
  });

  it('마트·온라인쇼핑·잡화는 같은 날 각각 한 번씩 받는다', () => {
    const mart = tx('이마트 성수점', 60_000, 9);
    const online = tx('쿠팡', 60_000, 12);
    const goods = tx('올리브영', 60_000, 15);
    const snap = buildSnapshot(dp, [prevMonth(), mart, online, goods], '2026-08');

    // 첫 건만 2배, 나머지는 평소 요율. 셋 다 0원이 아니다.
    expect(net(snap, mart.id)).toBe(10_000);
    expect(net(snap, online.id)).toBe(5_000);
    expect(net(snap, goods.id)).toBe(5_000);
  });
});

describe('오프라인 전용 조건 — 온라인몰은 마트·잡화 영역이 아니다', () => {
  it('이마트몰은 마트가 아니라 온라인쇼핑(SSG)으로 간다', () => {
    // 약관: 마트 영역은 오프라인 매장 이용 시에만.
    // 이마트몰은 SSG.COM으로 통합됐다. 금액은 같아도(둘 다 10%)
    // 일 1회·월 5회 횟수가 엉뚱한 영역에서 깎이면 안 된다.
    expect(resolveBrand('이마트몰')).toBe('SSG');
    expect(resolveBrand('이마트 성수점')).toBe('EMART');

    const mall = tx('이마트몰', 60_000, 10);
    const store = tx('이마트 성수점', 60_000, 14);
    const snap = buildSnapshot(dp, [prevMonth(), mall, store], '2026-08');

    // 서로 다른 영역이므로 둘 다 할인된다 (같은 영역이면 뒤가 0원이었다).
    expect(
      snap.appliedBenefits.find((b) => b.transactionId === mall.id)?.ruleId,
    ).toBe('dp-daily-online');
    expect(
      snap.appliedBenefits.find((b) => b.transactionId === store.id)?.ruleId,
    ).toBe('dp-daily-mart');
  });

  it('다이소몰(온라인)은 할인 대상이 아니다', () => {
    const mall = tx('다이소몰', 30_000, 10);
    const snap = buildSnapshot(dp, [prevMonth(), mall], '2026-08');
    expect(net(snap, mall.id)).toBe(0);
  });

  it('이마트 에브리데이는 기업형 슈퍼라 마트 영역이 아니다', () => {
    const everyday = tx('이마트 에브리데이 역삼', 60_000, 10);
    const snap = buildSnapshot(dp, [prevMonth(), everyday], '2026-08');
    expect(net(snap, everyday.id)).toBe(0);
  });

  it('쓱닷컴도 온라인쇼핑으로 잡힌다', () => {
    expect(resolveBrand('쓱닷컴')).toBe('SSG');
    expect(resolveBrand('SSG.COM')).toBe('SSG');
  });
});
