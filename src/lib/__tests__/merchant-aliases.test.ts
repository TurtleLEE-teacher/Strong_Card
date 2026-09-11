/**
 * 실제 승인 문자에서 발견된 표기 변형.
 *
 * 브랜드 사전은 "이 문자열이면 그 브랜드"라는 규칙인데, 카드사 문자는
 * 같은 가맹점을 한글·영문·괄호 섞어 제각각 찍는다. 여기 있는 이름은
 * 전부 노션에 실제로 들어왔던 것이고, 한 번씩 혜택을 놓친 뒤에 추가됐다.
 */

import { describe, expect, it } from 'vitest';
import { resolveBrand } from '@/config/merchants';
import { CARDS_BY_ID } from '@/config/cards';
import { buildSnapshot } from '@/lib/engine/snapshot';
import type { CardId, Transaction } from '@/lib/types';

let seq = 0;
function tx(cardId: CardId, title: string, krwAmount: number, day: string): Transaction {
  seq += 1;
  return {
    id: `alias-${seq}`,
    title,
    merchant: title,
    rawAmount: krwAmount,
    currency: 'KRW',
    krwAmount,
    approvedAt: new Date(`${day}T03:00:00Z`).toISOString(), // 12시 KST
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

function ruleFor(cardId: CardId, name: string, amount: number): string | undefined {
  const card = CARDS_BY_ID[cardId];
  const prev = tx(cardId, '아무데나', 1_500_000, '2026-08-15'); // 최고 구간
  const t = tx(cardId, name, amount, '2026-09-10');
  const snap = buildSnapshot(card, [prev, t], '2026-09');
  return snap.appliedBenefits.find((b) => b.transactionId === t.id)?.ruleId;
}

describe('GS25를 한글로 찍은 문자', () => {
  it.each(['지에스25 현대알앤디', '지에스(GS)25현대알', 'GS25 역삼점'])('%s → GS25', (name) => {
    expect(resolveBrand(name)).toBe('GS25');
  });

  it('탄탄대로 편의점 10%에 걸린다', () => {
    expect(ruleFor('kb-tantandaero', '지에스25 현대알앤디', 4_600)).toBe('tt-daily-dept-cvs');
  });

  it('Amex Blue 편의점 7%에 걸린다', () => {
    expect(ruleFor('samsung-amex-blue', '지에스(GS)25현대알', 2_200)).toBe('ab-cvs-delivery');
  });
});

describe('탄탄대로 베이커리는 제과점 업종이다', () => {
  it('(주)한스케익 아브뉴 21,900원 → 커피·베이커리 10% (사용자 확인)', () => {
    expect(ruleFor('kb-tantandaero', '(주)한스케익 아브뉴', 21_900)).toBe('tt-daily-coffee');
  });

  it('건당 2만원 미만이면 여전히 안 된다', () => {
    expect(ruleFor('kb-tantandaero', '(주)한스케익 아브뉴', 19_000)).toBeUndefined();
  });
});

describe('Amex Blue 쇼핑 1.5%는 쿠팡 결제에도 붙는다', () => {
  it.each(['쿠팡', '쿠팡(쿠페이)'])('%s → 쇼핑 1.5%', (name) => {
    expect(ruleFor('samsung-amex-blue', name, 76_580)).toBe('ab-shopping');
  });

  it('쿠팡이츠는 그대로 편의점·배달 7%다', () => {
    expect(ruleFor('samsung-amex-blue', '쿠팡이츠', 20_000)).toBe('ab-cvs-delivery');
  });
});
