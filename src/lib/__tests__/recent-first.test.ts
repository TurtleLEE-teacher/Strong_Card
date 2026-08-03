/**
 * 이력 목록의 정렬 — 최근 거래가 맨 위다.
 *
 * 이 앱은 결제 직후에 열린다. 그때 확인할 것은 "방금 그 결제가 어떻게
 * 잡혔나" 하나뿐인데, 목록이 금액순이거나 노션에서 받은 순서(오래된 것부터)
 * 그대로면 방금 쓴 결제를 매번 눈으로 찾아야 한다.
 *
 * 특히 앞 N건만 잘라 보여주는 목록(설정 화면의 미매핑 30건)은 정렬이
 * 뒤집히면 방금 들어온 거래가 아예 화면에서 사라진다.
 */

import { describe, expect, it } from 'vitest';
import { byRecentFirst } from '@/lib/date';
import { findUnmappedTransactions } from '@/lib/engine/snapshot';
import type { Transaction } from '@/lib/types';

/** KST 시각('YYYY-MM-DD HH:mm')으로 거래를 만든다 */
function txKst(id: string, kstIso: string, cardId: Transaction['cardId'] = null): Transaction {
  const [d, t = '12:00'] = kstIso.split(' ');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return {
    id,
    title: id,
    merchant: id,
    rawAmount: 10_000,
    currency: 'KRW',
    krwAmount: 10_000,
    approvedAt: new Date(Date.UTC(y, mo - 1, da, h - 9, mi, 0)).toISOString(),
    issuer: '국민',
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

describe('byRecentFirst', () => {
  it('최신이 맨 앞으로 온다', () => {
    const rows = [
      txKst('중간', '2026-08-10 12:00'),
      txKst('가장오래', '2026-08-01 09:00'),
      txKst('최신', '2026-08-20 21:00'),
    ];
    expect(byRecentFirst(rows).map((r) => r.id)).toEqual(['최신', '중간', '가장오래']);
  });

  it('같은 날이라도 늦은 시각이 위로 온다', () => {
    const rows = [txKst('아침', '2026-08-10 08:00'), txKst('저녁', '2026-08-10 20:00')];
    expect(byRecentFirst(rows).map((r) => r.id)).toEqual(['저녁', '아침']);
  });

  it('KST 날짜가 바뀌는 자정 근처도 시각 순서를 지킨다', () => {
    // 8/11 00:30 KST = 8/10 15:30 UTC — UTC 날짜로 비교하면 순서가 뒤집힌다
    const rows = [txKst('자정후', '2026-08-11 00:30'), txKst('자정전', '2026-08-10 23:30')];
    expect(byRecentFirst(rows).map((r) => r.id)).toEqual(['자정후', '자정전']);
  });

  it('원본 배열을 건드리지 않는다', () => {
    // 노션에서 받은 순서(오래된 것부터)를 그대로 쓰는 계산 코드가 따로 있다.
    const rows = [txKst('먼저', '2026-08-01 09:00'), txKst('나중', '2026-08-20 09:00')];
    byRecentFirst(rows);
    expect(rows.map((r) => r.id)).toEqual(['먼저', '나중']);
  });

  it('같은 시각이면 받은 순서를 유지한다', () => {
    const rows = [txKst('a', '2026-08-10 12:00'), txKst('b', '2026-08-10 12:00')];
    expect(byRecentFirst(rows).map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('미매핑 거래', () => {
  it('최신순으로 나온다 — 앞 N건만 잘라도 최근 것이 남는다', () => {
    // 노션은 오래된 것부터 돌려준다. 그 순서 그대로면 잘랐을 때 달 초만 남는다.
    const transactions = [
      txKst('1일', '2026-08-01 09:00'),
      txKst('15일', '2026-08-15 09:00'),
      txKst('30일', '2026-08-30 09:00'),
    ];
    const unmapped = findUnmappedTransactions(transactions, '2026-08');
    expect(unmapped.map((tx) => tx.id)).toEqual(['30일', '15일', '1일']);
  });

  it('카드가 매핑된 거래와 다른 달 거래는 빠진다', () => {
    const transactions = [
      txKst('매핑됨', '2026-08-20 09:00', 'kb-tantandaero'),
      txKst('지난달', '2026-07-20 09:00'),
      txKst('이번달미매핑', '2026-08-10 09:00'),
    ];
    const unmapped = findUnmappedTransactions(transactions, '2026-08');
    expect(unmapped.map((tx) => tx.id)).toEqual(['이번달미매핑']);
  });
});
