/**
 * "왜 이 결제는 혜택이 안 붙었지?"
 *
 * 엔진은 이유를 알면서도 버리고 있었다. 화면에는 금액만 남아, 사용자가
 * 앱이 고장 난 건지 조건을 못 맞춘 건지 구분할 수 없었다. 이제 이유를
 * 남기고, 그 이유가 실제 원인과 맞는지 여기서 고정한다.
 */

import { describe, expect, it } from 'vitest';
import { CARDS_BY_ID } from '@/config/cards';
import { buildSnapshot } from '@/lib/engine/snapshot';
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
    id: `nb-${seq}`,
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

const dp = CARDS_BY_ID['shinhan-discount-plan'];
const tantan = CARDS_BY_ID['kb-tantandaero'];

describe('혜택이 0원인 이유를 남긴다', () => {
  it('대상 가맹점이 아니면 그렇게 말한다', () => {
    const t = tx('shinhan-discount-plan', '동네철물점', 50_000, '2026-08-05');
    const snap = buildSnapshot(dp, [tx('shinhan-discount-plan', '아무데나', 1_300_000, '2026-07-05'), t], '2026-08');
    expect(snap.noBenefit[t.id]?.reason).toBe('대상 가맹점 아님');
  });

  it('실적 미달로 잠긴 거라면 가맹점 탓으로 돌리지 않는다', () => {
    // 지난달 실적 없음 → 모든 영역 잠김. 무신사는 분명 대상 가맹점이다.
    const t = tx('shinhan-discount-plan', '무신사', 50_000, '2026-08-05');
    const snap = buildSnapshot(dp, [t], '2026-08');
    expect(snap.noBenefit[t.id]?.reason).toBe('실적 미달로 잠김');
    expect(snap.noBenefit[t.id]?.ruleLabel).toContain('온라인쇼핑');
  });

  it('건당 최소금액에 걸리면 얼마가 필요한지 알려준다', () => {
    // 탄탄대로 커피는 건당 2만원 이상이어야 한다.
    const t = tx('kb-tantandaero', '스타벅스 강남점', 5_000, '2026-08-05');
    const snap = buildSnapshot(
      tantan,
      [tx('kb-tantandaero', '아무데나', 900_000, '2026-07-05'), t],
      '2026-08',
    );
    expect(snap.noBenefit[t.id]?.reason).toBe('건당 최소금액 미달');
    expect(snap.noBenefit[t.id]?.detail).toBe('건당 20,000원 이상');
  });

  it('일 횟수를 넘기면 그렇게 말한다', () => {
    // Discount Plan 마트는 일 1회. 같은 날 두 번 사면 두 번째는 못 받는다.
    const first = tx('shinhan-discount-plan', '이마트 성수점', 50_000, '2026-08-05', 10);
    const second = tx('shinhan-discount-plan', '이마트 성수점', 50_000, '2026-08-05', 18);
    const snap = buildSnapshot(
      dp,
      [tx('shinhan-discount-plan', '아무데나', 1_300_000, '2026-07-05'), first, second],
      '2026-08',
    );
    expect(snap.noBenefit[first.id]).toBeUndefined(); // 첫 건은 받았다
    expect(snap.noBenefit[second.id]?.reason).toBe('횟수 초과');
    expect(snap.noBenefit[second.id]?.detail).toContain('일 1회');
  });

  it('실적 제외 항목이면 그렇게 말한다', () => {
    const t = tx('shinhan-discount-plan', '서울시청 지방세', 300_000, '2026-08-05');
    const snap = buildSnapshot(
      dp,
      [tx('shinhan-discount-plan', '아무데나', 1_300_000, '2026-07-05'), t],
      '2026-08',
    );
    expect(snap.noBenefit[t.id]?.reason).toBe('실적 제외 항목');
  });

  it('월 한도를 다 쓰면 그렇게 말한다', () => {
    const prev = tx('shinhan-discount-plan', '아무데나', 500_000, '2026-07-05'); // 40만 구간 → Daily 10,000
    // 마트·온라인·잡화로 한도 10,000을 채운 뒤 한 건 더
    const txs = [
      prev,
      tx('shinhan-discount-plan', '이마트 성수점', 50_000, '2026-08-02'),
      tx('shinhan-discount-plan', '무신사', 50_000, '2026-08-03'),
      tx('shinhan-discount-plan', '올리브영', 50_000, '2026-08-04'),
    ];
    const snap = buildSnapshot(dp, txs, '2026-08');
    const last = txs[3];
    expect(snap.benefitUsage.find((u) => u.capGroup === 'dp-daily')?.used).toBe(10_000);
    expect(snap.noBenefit[last.id]?.reason).toBe('월 한도 소진');
  });

  it('혜택을 받은 거래에는 이유를 남기지 않는다', () => {
    const t = tx('shinhan-discount-plan', '무신사', 50_000, '2026-08-05');
    const snap = buildSnapshot(
      dp,
      [tx('shinhan-discount-plan', '아무데나', 1_300_000, '2026-07-05'), t],
      '2026-08',
    );
    expect(snap.noBenefit[t.id]).toBeUndefined();
  });
});
