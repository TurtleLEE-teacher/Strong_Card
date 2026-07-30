import { describe, expect, it } from 'vitest';
import { CARDS_BY_ID } from '@/config/cards';
import { buildSnapshot } from '@/lib/engine/snapshot';
import { estimateBenefit } from '@/lib/engine/recommend';
import { kstDayOfWeek } from '@/lib/date';
import type { CardId, Transaction } from '@/lib/types';

/**
 * 횟수·요일 제한과 공유 한도(capGroup) 검증.
 *
 * 이 세 가지가 없으면 신한EV 생활서비스가 실제보다 훨씬 많이 계산된다.
 * 6개 영역이 각자 3만원 한도를 갖는 것처럼 굴면 최대 18만원까지 부푼다.
 */

const ev = CARDS_BY_ID['shinhan-ev'];

let seq = 0;
function txAt(
  title: string,
  krwAmount: number,
  day: string,
  kstHour = 12,
  cardId: CardId = 'shinhan-ev',
): Transaction {
  seq += 1;
  const [y, m, d] = day.split('-').map(Number);
  return {
    id: `lm-${seq}`,
    title,
    merchant: title,
    rawAmount: krwAmount,
    currency: 'KRW',
    krwAmount,
    approvedAt: new Date(Date.UTC(y, m - 1, d, kstHour - 9, 0, 0)).toISOString(),
    issuer: '신한',
    last4: '4401',
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

/** 30만 구간을 만들어 주는 지난달 실적 */
const PREV = txAt('아무데나', 400_000, '2026-06-15');

describe('KST 요일', () => {
  it('UTC로 보면 어긋나는 토요일 새벽을 올바로 판정한다', () => {
    // 2026-07-11은 토요일. KST 08시 = UTC 금요일 23시.
    expect(kstDayOfWeek('2026-07-10T23:00:00Z')).toBe(6); // 토
    expect(new Date('2026-07-10T23:00:00Z').getUTCDay()).toBe(5); // UTC로는 금
  });
});

describe('요일 제한 — 3대마트는 주말만', () => {
  it('토요일 이마트는 할인된다', () => {
    // 2026-07-11 = 토
    const snap = buildSnapshot(ev, [PREV, txAt('이마트 성수점', 50_000, '2026-07-11')], '2026-07');
    expect(snap.totalBenefitUsed).toBe(1_000); // 건당 한도 1,000원
  });

  it('수요일 이마트는 할인되지 않는다', () => {
    // 2026-07-08 = 수
    const snap = buildSnapshot(ev, [PREV, txAt('이마트 성수점', 50_000, '2026-07-08')], '2026-07');
    expect(snap.totalBenefitUsed).toBe(0);
  });

  it('KST 기준으로 판정한다 (토요일 오전 8시)', () => {
    const tx = txAt('이마트', 50_000, '2026-07-11', 8);
    expect(tx.approvedAt).toContain('2026-07-10T23:00'); // UTC로는 금요일
    const snap = buildSnapshot(ev, [PREV, tx], '2026-07');
    expect(snap.totalBenefitUsed).toBe(1_000); // 그래도 토요일로 인정
  });
});

describe('횟수 제한 — 편의점 일 1회 · 월 5회', () => {
  it('같은 날 두 번째 편의점 결제는 할인되지 않는다', () => {
    const snap = buildSnapshot(
      ev,
      [
        PREV,
        txAt('GS25', 20_000, '2026-07-06', 10),
        txAt('GS25', 20_000, '2026-07-06', 18),
      ],
      '2026-07',
    );
    expect(snap.totalBenefitUsed).toBe(1_000); // 하루 1회분만
  });

  it('다른 날이면 다시 할인된다', () => {
    const snap = buildSnapshot(
      ev,
      [PREV, txAt('GS25', 20_000, '2026-07-06'), txAt('GS25', 20_000, '2026-07-07')],
      '2026-07',
    );
    expect(snap.totalBenefitUsed).toBe(2_000);
  });

  it('월 5회를 넘으면 더 이상 할인되지 않는다', () => {
    const days = ['07-01', '07-02', '07-03', '07-04', '07-05', '07-06', '07-07'];
    const snap = buildSnapshot(
      ev,
      [PREV, ...days.map((d) => txAt('GS25', 20_000, `2026-${d}`))],
      '2026-07',
    );
    // 7일 중 5일만 인정
    expect(snap.totalBenefitUsed).toBe(5_000);
  });

  it('횟수를 다 쓰면 다른 영역은 여전히 할인된다', () => {
    const days = ['07-01', '07-02', '07-03', '07-04', '07-05'];
    const snap = buildSnapshot(
      ev,
      [
        PREV,
        ...days.map((d) => txAt('GS25', 20_000, `2026-${d}`)), // 편의점 5회 소진
        txAt('이마트', 50_000, '2026-07-11'), // 토요일 마트
      ],
      '2026-07',
    );
    expect(snap.totalBenefitUsed).toBe(6_000);
  });
});

describe('공유 한도 — 생활서비스 6개 영역이 3만원을 나눠 쓴다', () => {
  it('영역을 섞어 써도 통합 3만원을 넘지 않는다', () => {
    // 영역별로 한도를 따로 줬다면 최대 15만원까지 나왔을 조합
    const txs: Transaction[] = [PREV];
    for (let d = 1; d <= 5; d += 1) {
      txs.push(txAt('GS25', 200_000, `2026-07-0${d}`));
      txs.push(txAt('스타벅스', 200_000, `2026-07-0${d}`));
      txs.push(txAt('강남약국', 200_000, `2026-07-0${d}`));
    }
    // 주말 마트도 여러 번
    txs.push(txAt('이마트', 500_000, '2026-07-11'));
    txs.push(txAt('홈플러스', 500_000, '2026-07-12'));

    const snap = buildSnapshot(ev, txs, '2026-07');
    expect(snap.totalBenefitUsed).toBeLessThanOrEqual(30_000);
  });

  it('화면에는 하나의 그룹으로 합쳐 보인다', () => {
    const snap = buildSnapshot(ev, [PREV, txAt('GS25', 20_000, '2026-07-06')], '2026-07');
    const living = snap.benefitUsage.filter((u) => u.label === '생활서비스 10% 할인');
    // 6개 영역이 6줄로 흩어지면 '3만원 한도'가 여러 개인 것처럼 보인다
    expect(living).toHaveLength(1);
    expect(living[0].cap).toBe(30_000);
    expect(living[0].used).toBe(1_000);
  });

  it('충전·하이패스는 생활서비스와 별개 한도다', () => {
    const snap = buildSnapshot(
      ev,
      [
        PREV,
        txAt('환경부전기차충전', 100_000, '2026-07-03'), // 30% = 30,000 → 한도 20,000
        txAt('GS25', 20_000, '2026-07-06'), // 생활 1,000
      ],
      '2026-07',
    );
    expect(snap.totalBenefitUsed).toBe(21_000);
  });
});

describe('횟수 제한이 차순위 룰을 가리지 않는다', () => {
  it('편의점 횟수를 다 써도 다른 카드 추천에는 영향이 없다', () => {
    // 한 카드의 횟수 소진이 다른 카드 계산에 새어나가면 안 된다
    const days = ['07-01', '07-02', '07-03', '07-04', '07-05'];
    const snap = buildSnapshot(
      CARDS_BY_ID['hyundai-zero-ed2'],
      days.map((d) => txAt('GS25', 20_000, `2026-${d}`, 12, 'hyundai-zero-ed2')),
      '2026-07',
    );
    // ZERO는 횟수 제한이 없다 — 5건 전부 2.5% 적립
    expect(snap.totalBenefitUsed).toBe(2_500);
  });
});

describe('추천 엔진이 횟수·공유 한도를 반영한다', () => {
  it('월 5회를 다 쓴 편의점 할인은 추천하지 않는다', () => {
    const days = ['07-01', '07-02', '07-03', '07-04', '07-05'];
    const snap = buildSnapshot(
      ev,
      [PREV, ...days.map((d) => txAt('GS25', 20_000, `2026-${d}`))],
      '2026-07',
    );
    const result = estimateBenefit(ev, snap, {
      merchant: 'GS25 역삼점',
      amount: 20_000,
      at: '2026-07-20T03:00:00Z',
    });
    // 횟수 소진 → 편의점 룰이 후보에서 빠진다
    expect(result.ruleLabel).not.toBe('편의점 10% 할인');
  });

  it('아직 여유가 있으면 추천한다', () => {
    const snap = buildSnapshot(ev, [PREV, txAt('GS25', 20_000, '2026-07-01')], '2026-07');
    const result = estimateBenefit(ev, snap, {
      merchant: 'GS25 역삼점',
      amount: 20_000,
      at: '2026-07-20T03:00:00Z',
    });
    expect(result.ruleLabel).toBe('편의점 10% 할인');
    expect(result.expectedBenefit).toBe(1_000);
  });

  it('공유 한도를 이미 쓴 만큼 차감해 추천한다', () => {
    // 생활서비스 통합 3만원 중 상당액을 미리 소진시킨다
    const txs: Transaction[] = [PREV];
    for (let d = 1; d <= 5; d += 1) {
      txs.push(txAt('GS25', 500_000, `2026-07-0${d}`));
      txs.push(txAt('스타벅스', 500_000, `2026-07-0${d}`));
    }
    const snap = buildSnapshot(ev, txs, '2026-07');
    const used = snap.benefitUsage.find((u) => u.label === '생활서비스 10% 할인')!.used;

    const result = estimateBenefit(ev, snap, {
      merchant: '이마트 성수점',
      amount: 500_000,
      at: '2026-07-11T03:00:00Z', // 토요일
    });
    // 남은 공유 한도를 넘겨 추천하면 안 된다
    expect(result.expectedBenefit).toBeLessThanOrEqual(30_000 - used);
  });
});
