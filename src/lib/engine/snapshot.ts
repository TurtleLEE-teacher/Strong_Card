/**
 * 카드 × 월 스냅샷 조립기.
 *
 * 실적과 혜택은 **한 달 어긋나 있다**. 이 파일이 그 어긋남을 처리하는
 * 유일한 지점이므로, 여기 로직이 틀리면 화면 전체가 틀린다.
 *
 *   이번 달 실적  → 다음 달 구간을 결정      (currentSpend, reachedTier)
 *   지난달 실적  → 이번 달 구간을 이미 결정  (previousSpend, appliedTier)
 */

import type { Card, CardMonthlySnapshot, Transaction } from '@/lib/types';
import { monthRangeUtc, previousMonthKey, toMonthKey, type MonthKey } from '@/lib/date';
import {
  computePerformance,
  remainingToNextTier,
  resolveNextTier,
  resolveTier,
} from './performance';
import { computeBenefits } from './benefits';

/** 해당 카드·해당 월(KST)의 거래만 골라낸다. */
export function filterTransactions(
  transactions: Transaction[],
  cardId: string,
  month: MonthKey,
): Transaction[] {
  const { startUtc, endUtc } = monthRangeUtc(month);
  return transactions.filter((tx) => {
    if (tx.cardId !== cardId) return false;
    const t = new Date(tx.approvedAt).getTime();
    return t >= startUtc.getTime() && t < endUtc.getTime();
  });
}

/**
 * 카드사가 문자에 찍어준 공식 누계 중 **가장 최근 값**을 고른다.
 * 누계는 단조 증가하므로 최신 거래의 값이 곧 그 달의 현재 누계다.
 */
function latestIssuerCumulative(transactions: Transaction[]): number | null {
  const withValue = transactions
    .filter((tx) => tx.issuerCumulative !== null)
    .sort((a, b) => new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime());
  return withValue[0]?.issuerCumulative ?? null;
}

export function buildSnapshot(
  card: Card,
  allTransactions: Transaction[],
  month: MonthKey,
): CardMonthlySnapshot {
  const current = filterTransactions(allTransactions, card.id, month);
  const previous = filterTransactions(allTransactions, card.id, previousMonthKey(month));

  // --- 이번 달 실적 (다음 달 구간을 결정) ---
  const perf = computePerformance(card, current);
  const reachedTier = resolveTier(card, perf.includedSpend);
  const nextTier = resolveNextTier(card, perf.includedSpend);

  // --- 지난달 실적 → 이번 달 적용 구간 ---
  const prevPerf = computePerformance(card, previous);
  const appliedTier = resolveTier(card, prevPerf.includedSpend);

  // --- 이번 달 혜택 (적용 구간 기준으로 한도를 건다) ---
  const benefits = computeBenefits({
    card,
    transactions: current,
    appliedTier,
    verdicts: perf.verdicts,
    month,
  });

  const issuerReportedSpend = latestIssuerCumulative(current);

  return {
    cardId: card.id,
    month,

    currentSpend: perf.includedSpend,
    excludedSpend: perf.excludedSpend,
    exclusions: perf.exclusions,
    reachedTier,
    nextTier,
    remainingToNextTier: remainingToNextTier(card, perf.includedSpend),
    issuerReportedSpend,
    reconciliationDelta:
      issuerReportedSpend === null ? null : perf.includedSpend - issuerReportedSpend,

    previousSpend: prevPerf.includedSpend,
    appliedTier,
    benefitUsage: benefits.usage,
    appliedBenefits: benefits.appliedBenefits,
    totalBenefitUsed: benefits.totalUsed,
    totalBenefitCap: benefits.totalCap,

    unmatchedTransactionIds: benefits.unmatchedTransactionIds,
    transactionCount: current.length,
  };
}

/** 활성 카드 전체의 스냅샷 */
export function buildAllSnapshots(
  cards: Card[],
  transactions: Transaction[],
  month: MonthKey,
): CardMonthlySnapshot[] {
  return cards.map((card) => buildSnapshot(card, transactions, month));
}

/** 카드에 매핑되지 않은 거래 (뒷4자리 파싱 실패 등) */
export function findUnmappedTransactions(
  transactions: Transaction[],
  month: MonthKey,
): Transaction[] {
  const { startUtc, endUtc } = monthRangeUtc(month);
  return transactions.filter((tx) => {
    if (tx.cardId !== null) return false;
    const t = new Date(tx.approvedAt).getTime();
    return t >= startUtc.getTime() && t < endUtc.getTime();
  });
}

export { toMonthKey };
