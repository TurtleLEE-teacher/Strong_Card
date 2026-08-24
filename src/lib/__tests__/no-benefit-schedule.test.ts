/**
 * "왜 혜택을 못 받았나"가 **사실대로** 적히는지.
 *
 * 이 화면의 문구는 다음 행동을 정한다. '대상 가맹점 아님'을 본 사용자는
 * 그 카드를 그 가맹점에서 다시 안 쓴다. 그러니 시간대 때문에 떨어진 건을
 * 그렇게 적으면, 받을 수 있었던 혜택을 화면이 스스로 포기시키는 셈이다.
 *
 * 실제로 그런 일이 있었다 — 아침 9시 CU 결제에 '대상 가맹점 아님'이 붙었다.
 * CU는 신한 Discount Plan 편의점 할인의 대상 가맹점이 맞고, 시간대(18~22시)만
 * 어긋난 것이었다.
 */

import { describe, expect, it } from 'vitest';
import { CARDS_BY_ID } from '@/config/cards';
import { buildSnapshot } from '@/lib/engine/snapshot';
import { matchesMerchant, matchesRule, matchesSchedule } from '@/lib/engine/benefits';
import type { CardId, Transaction, TxCategory } from '@/lib/types';

const dp = CARDS_BY_ID['shinhan-discount-plan'];
const ev = CARDS_BY_ID['shinhan-ev'];

let seq = 0;
function tx(
  cardId: CardId,
  title: string,
  krwAmount: number,
  /** KST 기준 'YYYY-MM-DDTHH:mm' */
  kst: string,
  category: TxCategory | null = null,
): Transaction {
  seq += 1;
  // KST → UTC. 이 테스트의 요점이 시각이라 여기서 틀리면 의미가 없다.
  const utc = new Date(new Date(`${kst}:00+09:00`).toISOString());
  return {
    id: `sc-${seq}`,
    title,
    merchant: title,
    rawAmount: krwAmount,
    currency: 'KRW',
    krwAmount,
    approvedAt: utc.toISOString(),
    issuer: '신한',
    last4: null,
    cardId,
    category,
    paymentKind: '일시불',
    installmentMonths: null,
    canceled: false,
    rawMessage: null,
    issuerCumulative: null,
    alertStatus: null,
  };
}

/** 실적을 채운 지난달 거래 — 한도가 열려 있어야 시간대가 진짜 원인이 된다 */
const primeDp = tx('shinhan-discount-plan', '아무데나', 1_300_000, '2026-07-15T12:00');

function reasonFor(transactions: Transaction[], target: Transaction) {
  const snap = buildSnapshot(dp, [primeDp, ...transactions], '2026-08');
  return snap.noBenefit[target.id];
}

describe('편의점 아침 결제 — 대상 가맹점이 아닌 게 아니라 시간대가 아니다', () => {
  const cu = tx('shinhan-discount-plan', '씨유(CU) 벨라테라스점', 5_000, '2026-08-12T09:01');

  it('CU는 편의점 할인의 대상 가맹점이 맞다', () => {
    const rule = dp.benefits.find((r) => r.id === 'dp-time-cvs')!;
    expect(matchesMerchant(rule, cu)).toBe(true);
  });

  it('시각 조건에서만 떨어진다', () => {
    const rule = dp.benefits.find((r) => r.id === 'dp-time-cvs')!;
    expect(matchesSchedule(rule, cu)).toBe(false);
    expect(matchesRule(rule, cu)).toBe(false);
  });

  it("화면에 '시간대 아님'과 언제 오면 되는지가 적힌다", () => {
    const note = reasonFor([cu], cu)!;
    expect(note.reason).toBe('시간대 아님');
    expect(note.ruleLabel).toContain('편의점');
    expect(note.detail).toBe('18~22시에만');
  });

  it('같은 CU를 저녁에 긁으면 할인이 붙는다', () => {
    const evening = tx('shinhan-discount-plan', '씨유(CU) 벨라테라스점', 5_000, '2026-08-12T19:01');
    const snap = buildSnapshot(dp, [primeDp, evening], '2026-08');
    const benefit = snap.appliedBenefits.find((b) => b.transactionId === evening.id);
    expect(benefit?.netAmount).toBe(500);
    // 받은 건에는 '왜 못 받았나'가 붙지 않는다
    expect(snap.noBenefit[evening.id]).toBeUndefined();
  });
});

describe('업종으로만 잡히는 음식점', () => {
  it('카테고리가 비어 있으면 낮 결제라도 대상 가맹점 아님이다', () => {
    // 동네 식당은 브랜드 사전에 없다. 노션 `카테고리`가 유일한 신호다.
    const local = tx('shinhan-discount-plan', '성산봄죽칼국수동화마을', 32_000, '2026-08-10T11:51');
    expect(reasonFor([local], local)!.reason).toBe('대상 가맹점 아님');
  });

  it("카테고리를 '식비'로 채우면 같은 결제에 10%가 붙는다", () => {
    const local = tx(
      'shinhan-discount-plan',
      '성산봄죽칼국수동화마을',
      32_000,
      '2026-08-10T11:51',
      '식비',
    );
    const snap = buildSnapshot(dp, [primeDp, local], '2026-08');
    // 할인 전 이용금액 1회 1만원까지 → 1,000원
    expect(snap.appliedBenefits.find((b) => b.transactionId === local.id)?.netAmount).toBe(1_000);
  });

  it("'식비'라도 저녁이면 시간대에서 걸린다", () => {
    // 음식점은 DAY(07~15시)다. 20:24 치킨집은 카테고리를 채워도 못 받는다.
    const dinner = tx(
      'shinhan-discount-plan',
      '오태식해바라기치킨성산점',
      33_900,
      '2026-08-11T20:24',
      '식비',
    );
    const note = reasonFor([dinner], dinner)!;
    expect(note.reason).toBe('시간대 아님');
    expect(note.detail).toBe('07~15시에만');
  });
});

describe('요일 조건도 가맹점 탓으로 돌리지 않는다', () => {
  it('신한EV 3대마트를 평일에 쓰면 요일 아님이라고 적힌다', () => {
    // 2026-08-12는 수요일. 3대마트 할인은 주말만이다.
    const weekday = tx('shinhan-ev', '이마트 성수점', 50_000, '2026-08-12T14:00');
    const prime = tx('shinhan-ev', '아무데나', 700_000, '2026-07-15T12:00');
    const snap = buildSnapshot(ev, [prime, weekday], '2026-08');
    const note = snap.noBenefit[weekday.id]!;
    expect(note.reason).toBe('요일 아님');
    expect(note.detail).toBe('주말만');
  });
});

describe('실적이 잠긴 쪽이 더 근본적인 원인이다', () => {
  it('한도가 0이면 시간대보다 실적 미달을 먼저 말한다', () => {
    // 지난달 실적이 없으면 Time Plan 한도 자체가 0이다. 이때 "저녁에 오면
    // 받는다"고 안내하면 거짓말이 된다 — 저녁에 와도 0원이다.
    const cu = tx('shinhan-discount-plan', '씨유(CU) 벨라테라스점', 5_000, '2026-08-12T09:01');
    const snap = buildSnapshot(dp, [cu], '2026-08');
    expect(snap.appliedTier?.threshold ?? 0).toBe(0);
    expect(snap.noBenefit[cu.id]!.reason).toBe('실적 미달로 잠김');
  });
});
