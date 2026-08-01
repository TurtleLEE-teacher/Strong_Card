/**
 * 전월실적 계산 엔진.
 *
 * 핵심 규칙:
 * - 산정 기간: 해당 월 1일 00:00 ~ 말일 23:59:59 (KST), **승인일 기준**
 * - 취소 표시가 붙은 원거래는 전액 제외
 * - **취소 전표(음수)는 원거래와 같은 칸에서 상계한다** (engine/reversal.ts)
 * - 카드별 제외 규칙(세금·상품권·무승인 전표 등)을 적용
 * - 계산은 오직 `krwAmount`(원화 환산액)로만 한다
 */

import type {
  Card,
  ExclusionRule,
  ExclusionSummary,
  PerformanceVerdict,
  SpendTier,
  Transaction,
} from '@/lib/types';
import { normalizeMerchant } from '@/config/merchants';
import { isReversal, linkReversals } from './reversal';

export interface PerformanceResult {
  /** 실적으로 인정된 금액 */
  includedSpend: number;
  /** 제외된 금액 */
  excludedSpend: number;
  exclusions: ExclusionSummary[];
  /** 거래별 판정 (Notion 역기입 및 상세 화면용) */
  verdicts: Map<string, PerformanceVerdict>;
}

/**
 * 거래 1건이 실적에 산입되는지 판정한다.
 * 제외되면 그 사유를, 산입되면 '인정'을 돌려준다.
 */
export function judgeTransaction(card: Card, tx: Transaction): PerformanceVerdict {
  // 1. 취소 표시가 붙은 **양수** 건은 원거래 자체가 무효다 → 전액 제외.
  //
  //    음수 건(취소 전표)은 여기 걸리면 안 된다. '제외-취소'로 빼버리면
  //    원거래의 양수만 실적에 남아 취소한 만큼 실적이 부풀어 오른다.
  //    취소 전표는 원거래와 같은 판정을 받아 같은 칸에서 상계돼야 한다.
  if (!isReversal(tx) && (tx.canceled || tx.paymentKind === '취소·환불')) {
    return '제외-취소';
  }

  // 2. 해외결제 산입 여부
  if (!card.performance.countsForeignSpend && tx.paymentKind === '해외') {
    return '제외-기타';
  }

  // 3. 카드별 제외 규칙
  const haystack = normalizeMerchant(
    [tx.title, tx.merchant].filter(Boolean).join(' '),
  );

  for (const rule of card.performance.exclusions) {
    if (matchesExclusion(rule, haystack, tx)) {
      return rule.verdict;
    }
  }

  return '인정';
}

function matchesExclusion(
  rule: ExclusionRule,
  normalizedMerchant: string,
  tx: Transaction,
): boolean {
  if (rule.keywords?.length) {
    for (const kw of rule.keywords) {
      if (normalizedMerchant.includes(normalizeMerchant(kw))) return true;
    }
  }
  if (rule.categories?.length && tx.category) {
    if (rule.categories.includes(tx.category)) return true;
  }
  return false;
}

/**
 * 한 달치 거래에서 실적을 집계한다.
 * `transactions`는 **이미 해당 월·해당 카드로 필터링돼 있어야 한다.**
 */
export interface PerformanceOptions {
  /**
   * 판정과 무관하게 실적에서 뺄 거래 id.
   * 탄탄대로처럼 "이 혜택을 받은 건은 실적에서 뺀다"는 약관을 반영할 때 쓴다.
   * 혜택 계산이 끝나야 알 수 있는 값이라 2패스로 돌린다.
   */
  forceExclude?: ReadonlySet<string>;
  /** forceExclude에 붙일 사유 */
  forceExcludeVerdict?: PerformanceVerdict;
}

export function computePerformance(
  card: Card,
  transactions: Transaction[],
  options: PerformanceOptions = {},
): PerformanceResult {
  let includedSpend = 0;
  let excludedSpend = 0;
  const verdicts = new Map<string, PerformanceVerdict>();
  const buckets = new Map<PerformanceVerdict, { amount: number; count: number }>();

  const judge = (tx: Transaction): PerformanceVerdict =>
    // 강제 제외가 먼저다. 가맹점 판정으로는 '인정'인데 혜택을 받았다는
    // 이유로 빠지는 건이라 일반 제외 규칙으로는 표현할 수 없다.
    options.forceExclude?.has(tx.id)
      ? (options.forceExcludeVerdict ?? '제외-기타')
      : judgeTransaction(card, tx);

  // 1. 정상 거래를 먼저 판정한다.
  for (const tx of transactions) {
    if (!isReversal(tx)) verdicts.set(tx.id, judge(tx));
  }

  // 2. 취소 전표는 **원거래와 같은 판정을 물려받는다.** 그래야 양수와 음수가
  //    같은 칸(인정 또는 같은 제외 사유)에서 만나 정확히 상계된다. 다른
  //    칸에 떨어지면 한쪽은 부풀고 한쪽은 음수가 된다.
  //
  //    forceExclude(탄탄대로 Trendy)도 이 한 줄이 함께 처리한다 — 원거래가
  //    강제 제외되면 전표도 같은 '제외-기타'를 물려받는다. 전표만 '인정'으로
  //    남으면 실적이 취소액만큼 마이너스로 깎인다.
  //    짝을 못 찾은 전표는 일반 규칙으로 판정한다.
  const links = linkReversals(transactions);
  for (const tx of transactions) {
    if (!isReversal(tx)) continue;
    const link = links.get(tx.id);
    const inherited = link ? verdicts.get(link.originalId) : undefined;
    verdicts.set(tx.id, inherited ?? judge(tx));
  }

  for (const tx of transactions) {
    const verdict = verdicts.get(tx.id)!;

    if (verdict === '인정') {
      includedSpend += tx.krwAmount;
    } else {
      excludedSpend += tx.krwAmount;
      const b = buckets.get(verdict) ?? { amount: 0, count: 0 };
      b.amount += tx.krwAmount;
      b.count += 1;
      buckets.set(verdict, b);
    }
  }

  const exclusions: ExclusionSummary[] = [...buckets.entries()]
    .map(([verdict, b]) => ({ verdict, amount: b.amount, count: b.count }))
    // 취소 전표가 상계해서 0원이 된 칸은 보여줄 게 없다. 남겨 두면
    // '제외-공과금 2건 0원' 같은 줄이 생겨 읽는 사람만 헷갈린다.
    .filter((e) => e.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return {
    // 취소가 그달 결제보다 많으면 음수가 나올 수 있다(지난달 결제를 이번 달에
    // 취소). 실적이 음수라는 건 뜻이 없고 바 너비도 뒤집히므로 0에서 멈춘다.
    includedSpend: Math.max(0, includedSpend),
    excludedSpend,
    exclusions,
    verdicts,
  };
}

/**
 * 실적 금액으로 달성 구간을 찾는다.
 * tiers는 threshold 오름차순이라고 가정한다.
 */
export function resolveTier(card: Card, spend: number): SpendTier | null {
  const tiers = card.performance.tiers;
  if (tiers.length === 0) return null;

  let reached: SpendTier | null = null;
  for (const tier of tiers) {
    if (spend >= tier.threshold) reached = tier;
    else break;
  }
  return reached;
}

/** 아직 못 넘은 다음 구간. 최상위 구간이면 null. */
export function resolveNextTier(card: Card, spend: number): SpendTier | null {
  for (const tier of card.performance.tiers) {
    if (spend < tier.threshold) return tier;
  }
  return null;
}

/** 다음 구간까지 남은 금액. 다음 구간이 없으면 0. */
export function remainingToNextTier(card: Card, spend: number): number {
  const next = resolveNextTier(card, spend);
  return next ? Math.max(0, next.threshold - spend) : 0;
}
