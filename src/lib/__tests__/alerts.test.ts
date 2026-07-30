import { describe, expect, it } from 'vitest';
import { CARDS_BY_ID } from '@/config/cards';
import { buildSnapshot } from '@/lib/engine/snapshot';
import { buildBenefitAlert, evaluateMonthlyAlerts } from '@/lib/alerts/rules';
import type { CardId, Transaction } from '@/lib/types';

let seq = 0;
function tx(cardId: CardId, title: string, krwAmount: number, day: string): Transaction {
  seq += 1;
  return {
    id: `a-${seq}`,
    title,
    merchant: title,
    rawAmount: krwAmount,
    currency: 'KRW',
    krwAmount,
    approvedAt: new Date(`2026-${day}T03:00:00Z`).toISOString(),
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

const tantan = CARDS_BY_ID['kb-tantandaero'];
const zero = CARDS_BY_ID['hyundai-zero-ed2'];

describe('실적 미달 경고', () => {
  // 6월 40만 실적 → 7월 40만 구간 적용. 7월에는 10만원만 썼다.
  const transactions = [
    tx('kb-tantandaero', '아방가르드', 400_000, '06-15'),
    tx('kb-tantandaero', '아방가르드', 100_000, '07-05'),
  ];
  const snapshot = buildSnapshot(tantan, transactions, '2026-07');

  it('D-7 / D-3 / D-1에만 경고한다', () => {
    for (const days of [7, 3, 1]) {
      const alerts = evaluateMonthlyAlerts({ card: tantan, snapshot, daysRemaining: days });
      expect(alerts.filter((a) => a.type === '실적미달')).toHaveLength(1);
    }
  });

  it('그 외 날짜에는 조용하다', () => {
    for (const days of [20, 10, 5, 2, 0]) {
      const alerts = evaluateMonthlyAlerts({ card: tantan, snapshot, daysRemaining: days });
      expect(alerts.filter((a) => a.type === '실적미달')).toHaveLength(0);
    }
  });

  it('경고 키에 날짜가 들어가 D-7과 D-3이 서로를 막지 않는다', () => {
    const d7 = evaluateMonthlyAlerts({ card: tantan, snapshot, daysRemaining: 7 })
      .find((a) => a.type === '실적미달')!;
    const d3 = evaluateMonthlyAlerts({ card: tantan, snapshot, daysRemaining: 3 })
      .find((a) => a.type === '실적미달')!;
    expect(d7.key).not.toBe(d3.key);
    expect(d7.key).toContain('d7');
    expect(d3.key).toContain('d3');
  });

  it('남은 금액을 본문에 담는다', () => {
    const alert = evaluateMonthlyAlerts({ card: tantan, snapshot, daysRemaining: 7 })
      .find((a) => a.type === '실적미달')!;
    // 7월에 10만원 사용 → 40만 구간까지 30만원 남음
    expect(alert.body).toContain('300,000원');
  });

  it('무실적 카드는 실적 경고 대상이 아니다', () => {
    const zeroSnapshot = buildSnapshot(zero, [tx('hyundai-zero-ed2', '어디든', 10_000, '07-05')], '2026-07');
    const alerts = evaluateMonthlyAlerts({ card: zero, snapshot: zeroSnapshot, daysRemaining: 3 });
    expect(alerts.filter((a) => a.type === '실적미달')).toHaveLength(0);
  });
});

describe('실적 구간 달성', () => {
  it('구간을 넘으면 달성 알림이 난다', () => {
    const snapshot = buildSnapshot(
      tantan,
      [tx('kb-tantandaero', '아방가르드', 800_000, '07-05')],
      '2026-07',
    );
    const alerts = evaluateMonthlyAlerts({ card: tantan, snapshot, daysRemaining: 20 });
    const reached = alerts.find((a) => a.type === '실적달성');
    expect(reached).toBeDefined();
    expect(reached!.key).toContain('tier_reached_800000');
    expect(reached!.title).toContain('80만원');
  });

  it('실적 미달 구간(0원)은 달성이 아니다', () => {
    const snapshot = buildSnapshot(
      tantan,
      [tx('kb-tantandaero', '아방가르드', 50_000, '07-05')],
      '2026-07',
    );
    const alerts = evaluateMonthlyAlerts({ card: tantan, snapshot, daysRemaining: 20 });
    expect(alerts.filter((a) => a.type === '실적달성')).toHaveLength(0);
  });

  it('같은 구간에 머무는 동안 키가 바뀌지 않는다 (중복 발송 방지)', () => {
    const a = buildSnapshot(tantan, [tx('kb-tantandaero', 'A', 800_000, '07-05')], '2026-07');
    const b = buildSnapshot(
      tantan,
      [tx('kb-tantandaero', 'A', 800_000, '07-05'), tx('kb-tantandaero', 'B', 50_000, '07-06')],
      '2026-07',
    );
    const keyA = evaluateMonthlyAlerts({ card: tantan, snapshot: a, daysRemaining: 20 })
      .find((x) => x.type === '실적달성')!.key;
    const keyB = evaluateMonthlyAlerts({ card: tantan, snapshot: b, daysRemaining: 20 })
      .find((x) => x.type === '실적달성')!.key;
    expect(keyA).toBe(keyB);
  });
});

describe('혜택 한도 소진', () => {
  // 6월 40만 실적 → 7월 통합 한도 70,000원.
  const base = tx('kb-tantandaero', '아방가르드', 400_000, '06-15');

  it('80% 미만이면 조용하다', () => {
    const snapshot = buildSnapshot(
      tantan,
      [base, tx('kb-tantandaero', '헤어살롱', 100_000, '07-05')], // 20,000
      '2026-07',
    );
    expect(snapshot.totalBenefitCap).toBe(70_000);
    const alerts = evaluateMonthlyAlerts({ card: tantan, snapshot, daysRemaining: 20 });
    expect(alerts.filter((a) => a.type === '한도소진임박')).toHaveLength(0);
  });

  it('80%를 넘으면 80% 알림만 난다 (아직 여유가 있으니 소진 알림은 이르다)', () => {
    // 미용 20% × 30만 = 60,000 / 70,000 ≈ 86%
    const snapshot = buildSnapshot(
      tantan,
      [base, tx('kb-tantandaero', '헤어살롱', 300_000, '07-05')],
      '2026-07',
    );
    expect(snapshot.totalBenefitUsed).toBe(60_000);

    const capAlerts = evaluateMonthlyAlerts({ card: tantan, snapshot, daysRemaining: 20 }).filter(
      (a) => a.type === '한도소진임박',
    );
    expect(capAlerts).toHaveLength(1);
    expect(capAlerts[0].key).toContain('cap_80');
  });

  it('한도를 다 쓰면 80% 알림과 100% 알림이 각각 난다', () => {
    const snapshot = buildSnapshot(
      tantan,
      [
        base,
        tx('kb-tantandaero', '헤어살롱', 300_000, '07-05'), // 60,000
        tx('kb-tantandaero', '스크린골프', 200_000, '07-06'), // 잔여 10,000
      ],
      '2026-07',
    );
    expect(snapshot.totalBenefitUsed).toBe(70_000);

    const capAlerts = evaluateMonthlyAlerts({ card: tantan, snapshot, daysRemaining: 20 }).filter(
      (a) => a.type === '한도소진임박',
    );
    expect(capAlerts).toHaveLength(2);
    expect(capAlerts.map((a) => a.key)).toEqual([
      expect.stringContaining('cap_80'),
      expect.stringContaining('cap_100'),
    ]);
    expect(capAlerts[1].title).toContain('한도 소진');
  });

  it('한도가 없는 카드는 소진 알림 대상이 아니다', () => {
    const snapshot = buildSnapshot(
      zero,
      [tx('hyundai-zero-ed2', '어디든', 10_000_000, '07-05')],
      '2026-07',
    );
    const alerts = evaluateMonthlyAlerts({ card: zero, snapshot, daysRemaining: 20 });
    expect(alerts.filter((a) => a.type === '한도소진임박')).toHaveLength(0);
  });
});

describe('혜택 적용 알림', () => {
  const transactions = [
    tx('kb-tantandaero', '아방가르드', 400_000, '06-15'),
    tx('kb-tantandaero', '스타벅스 강남점', 30_000, '07-05'),
  ];
  const snapshot = buildSnapshot(tantan, transactions, '2026-07');
  const coffeeTx = transactions[1];

  it('혜택이 붙은 거래에 알림을 만든다', () => {
    const alert = buildBenefitAlert(tantan, snapshot, coffeeTx.id, coffeeTx.title);
    expect(alert).not.toBeNull();
    expect(alert!.type).toBe('혜택적용');
    expect(alert!.title).toContain('3,000원');
    expect(alert!.body).toContain('스타벅스 강남점');
    expect(alert!.body).toContain('커피·베이커리·아이스크림 10%');
  });

  it('혜택이 없는 거래에는 알림을 만들지 않는다', () => {
    const alert = buildBenefitAlert(tantan, snapshot, 'no-such-tx', '없음');
    expect(alert).toBeNull();
  });

  it('알림 키에 거래 ID가 들어가 거래마다 유일하다', () => {
    const alert = buildBenefitAlert(tantan, snapshot, coffeeTx.id, coffeeTx.title)!;
    expect(alert.key).toContain(coffeeTx.id);
  });
});

describe('알림 공통', () => {
  it('모든 알림이 해당 카드 상세로 연결된다', () => {
    const snapshot = buildSnapshot(
      tantan,
      [tx('kb-tantandaero', '아방가르드', 800_000, '07-05')],
      '2026-07',
    );
    const alerts = evaluateMonthlyAlerts({ card: tantan, snapshot, daysRemaining: 7 });
    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) {
      expect(alert.url).toBe('/card/kb-tantandaero');
      expect(alert.key).toContain('2026-07');
      expect(alert.key).toContain('kb-tantandaero');
    }
  });
});
