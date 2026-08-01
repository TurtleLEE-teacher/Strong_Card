/**
 * 혜택 매칭·한도 계산 엔진.
 *
 * 카드사는 "이용 순서대로 월간 한도 내에서 할인을 적용"한다.
 * 따라서 거래를 **승인 시각 오름차순으로** 처리해야 한도 소진 결과가
 * 실제 청구서와 일치한다. 정렬을 빼먹으면 한도에 걸리는 거래가 달라진다.
 *
 * 한도는 3중으로 걸린다:
 *   1. 건당 한도 (capPerTx)
 *   2. 룰별 월 한도 (capPerMonth) — 적용 구간에 따라 달라질 수 있음
 *   3. 카드 통합 월 한도 (appliedTier.totalBenefitCap)
 *
 * 취소 전표(음수 금액)는 원거래에 붙었던 혜택을 **되감아** 한도를
 * 돌려준다. 짝짓기는 engine/reversal.ts가 한다.
 */

import type {
  AppliedBenefit,
  BenefitRule,
  BenefitUsage,
  Card,
  PerformanceVerdict,
  SpendTier,
  TierCap,
  Transaction,
} from '@/lib/types';
import { normalizeMerchant, resolveBrand } from '@/config/merchants';
import {
  isRuleEffective,
  isRuleEffectiveInMonth,
  isWithinHours,
  kstDayOfMonth,
  kstDayOfWeek,
  toKstDateString,
  type MonthKey,
} from '@/lib/date';
import { isReversal, linkReversals } from './reversal';

export interface BenefitResult {
  appliedBenefits: AppliedBenefit[];
  usage: BenefitUsage[];
  totalUsed: number;
  totalCap: number | null;
  /** 어떤 룰에도 매칭되지 않은 거래 */
  unmatchedTransactionIds: string[];
  /** 혜택이 0원인 거래와 그 이유. "왜 안 먹었지"에 답하기 위한 것. */
  noBenefit: Record<string, NoBenefitNote>;
  /**
   * 룰별 이번 달 적용 횟수.
   * 추천 엔진이 "이미 월 5회를 다 썼는지"를 알려면 이 값이 필요하다.
   */
  ruleCounts: Record<string, number>;
}

/**
 * 구간별 한도(TierCap[])를 적용 구간에 맞춰 단일 값으로 푼다.
 * appliedTier가 null이면 실적 미달로 보고 가장 낮은 구간을 쓴다.
 */
export function resolveCap(
  cap: number | TierCap[] | null | undefined,
  appliedTier: SpendTier | null,
): number | null {
  if (cap === null || cap === undefined) return null; // 무제한
  if (typeof cap === 'number') return cap;

  const threshold = appliedTier?.threshold ?? 0;
  let resolved: number | null = null;
  for (const entry of cap) {
    if (threshold >= entry.threshold) resolved = entry.cap;
    else break;
  }
  // 구간표에 해당 항목이 없으면 혜택 없음으로 본다 (과다 계상보다 안전)
  return resolved ?? 0;
}

/** 거래가 이 룰의 매칭 조건에 걸리는지 */
export function matchesRule(rule: BenefitRule, tx: Transaction): boolean {
  const { match } = rule;

  // 시각·요일 조건이 있으면 가맹점을 보기 전에 먼저 거른다.
  // (신한 Discount Plan의 DAY 07~15시 / NIGHT 18~22시, 신한EV 3대마트 주말)
  if (
    rule.timeWindow &&
    !isWithinHours(tx.approvedAt, rule.timeWindow.startHour, rule.timeWindow.endHour)
  ) {
    return false;
  }

  if (rule.daysOfWeek?.length && !rule.daysOfWeek.includes(kstDayOfWeek(tx.approvedAt))) {
    return false;
  }
  const hasCondition =
    !!match.paymentKinds?.length ||
    !!match.brands?.length ||
    !!match.keywords?.length ||
    !!match.categories?.length;

  const merchantText = normalizeMerchant(
    [tx.title, tx.merchant].filter(Boolean).join(' '),
  );

  if (match.excludeKeywords?.length) {
    for (const kw of match.excludeKeywords) {
      if (merchantText.includes(normalizeMerchant(kw))) return false;
    }
  }

  // 조건이 하나도 없으면 catch-all 룰 (예: ZERO 전 가맹점 1%)
  if (!hasCondition) return true;

  // 결제 구분은 가맹점과 무관하게 판정한다 (해외 결제 적립 등).
  if (match.paymentKinds?.length && tx.paymentKind) {
    if (match.paymentKinds.includes(tx.paymentKind)) return true;
  }

  if (match.brands?.length) {
    // 노션에서 사람이 지정한 브랜드가 이름 사전을 이긴다. 상호에 브랜드가
    // 없는 가맹점(자영 주유소)은 거기 가 본 사람만 아는 사실이라, 이름을
    // 다시 뜯어봐야 나올 게 없다.
    const brand = tx.brand ?? resolveBrand(tx.merchant ?? tx.title);
    if (brand && match.brands.includes(brand)) return true;
  }

  if (match.keywords?.length) {
    for (const kw of match.keywords) {
      if (merchantText.includes(normalizeMerchant(kw))) return true;
    }
  }

  // 카테고리는 브랜드·키워드 매칭 실패 시의 폴백 신호다.
  if (match.categories?.length && tx.category) {
    if (match.categories.includes(tx.category)) return true;
  }

  return false;
}

/**
 * 거래에 적용할 룰 하나를 고른다.
 * priority 오름차순(낮을수록 우선) → 먼저 매칭되는 룰 하나만 적용한다.
 * 카드사는 보통 중복 할인을 주지 않으므로 최초 1건만 적용한다.
 *
 * 적용 구간에서 한도가 0인 룰은 **비활성**으로 보고 건너뛴다.
 * 이게 없으면 같은 대상에 요율만 다른 룰이 여러 개일 때
 * (예: 신한EV 충전 30% / 50%) 우선순위가 높은 쪽이 다른 쪽을 가려버려
 * 혜택이 0원으로 나온다.
 */
export function selectRule(
  card: Card,
  tx: Transaction,
  appliedTier: SpendTier | null,
  counters?: UsageCounters,
): BenefitRule | null {
  const candidates = card.benefits
    .filter((r) => isRuleEffective(tx.approvedAt, r.effectiveFrom, r.effectiveUntil))
    .filter((r) => resolveCap(r.capPerMonth, appliedTier) !== 0)
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

  for (const rule of candidates) {
    if (rule.minAmountPerTx && tx.krwAmount < rule.minAmountPerTx) continue;
    // 횟수를 다 쓴 룰은 건너뛴다. 그래야 차순위 룰이 대신 적용될 기회를 갖는다.
    if (counters && !counters.hasRemainingCount(rule, tx)) continue;
    if (matchesRule(rule, tx)) return rule;
  }
  return null;
}

/**
 * 룰별 적용 횟수 추적기.
 *
 * 카드사는 금액 한도와 **별개로** 횟수를 제한하는 일이 잦다.
 * (신한EV 편의점 월 5회, 커피 일 1회 등) 횟수를 안 보면 한 영역에서
 * 한도를 다 채워버려 실제보다 혜택이 크게 나온다.
 */
export class UsageCounters {
  private readonly monthly = new Map<string, number>();
  private readonly daily = new Map<string, number>();

  hasRemainingCount(rule: BenefitRule, tx: Transaction): boolean {
    if (rule.maxCountPerMonth !== undefined) {
      if ((this.monthly.get(rule.id) ?? 0) >= rule.maxCountPerMonth) return false;
    }
    if (rule.maxCountPerDay !== undefined) {
      const key = `${rule.id}:${toKstDateString(tx.approvedAt)}`;
      if ((this.daily.get(key) ?? 0) >= rule.maxCountPerDay) return false;
    }
    return true;
  }

  record(rule: BenefitRule, tx: Transaction): void {
    this.monthly.set(rule.id, (this.monthly.get(rule.id) ?? 0) + 1);
    const key = `${rule.id}:${toKstDateString(tx.approvedAt)}`;
    this.daily.set(key, (this.daily.get(key) ?? 0) + 1);
  }

  /**
   * 취소된 거래가 태운 횟수를 돌려준다.
   *
   * **원거래의 승인일**로 일 횟수를 되돌린다 — 하루 1회짜리 혜택을
   * 취소일 기준으로 되돌리면 엉뚱한 날의 잔여 횟수가 늘어난다.
   *
   * 이미 지나간 거래에 소급 적용하지는 않는다. 5회를 다 써서 6번째가
   * 혜택을 못 받았는데 그 뒤에 취소가 들어와도, 6번째는 그대로 0원이다.
   * 카드사도 그렇게 처리한다.
   */
  release(rule: BenefitRule, tx: Transaction): void {
    const month = this.monthly.get(rule.id) ?? 0;
    if (month > 0) this.monthly.set(rule.id, month - 1);
    const key = `${rule.id}:${toKstDateString(tx.approvedAt)}`;
    const day = this.daily.get(key) ?? 0;
    if (day > 0) this.daily.set(key, day - 1);
  }

  countFor(ruleId: string): number {
    return this.monthly.get(ruleId) ?? 0;
  }
}

/**
 * 한도·구간을 무시하고 어떤 룰에든 걸리는지만 본다.
 * "혜택 대상이지만 실적이 모자라 못 받은 것"과 "애초에 혜택 대상이 아닌 것"을
 * 구분하기 위해 쓴다. 후자만 '미분류'로 노출해야 한다.
 */
export function matchesAnyRule(card: Card, tx: Transaction): boolean {
  return card.benefits.some(
    (r) =>
      isRuleEffective(tx.approvedAt, r.effectiveFrom, r.effectiveUntil) &&
      matchesRule(r, tx),
  );
}

/** 매칭 조건이 완전히 같은 두 룰인지 (가려짐 판정에 쓴다) */
function sameMatcher(a: BenefitRule, b: BenefitRule): boolean {
  const key = (r: BenefitRule) =>
    JSON.stringify([
      [...(r.match.brands ?? [])].sort(),
      [...(r.match.keywords ?? [])].sort(),
      [...(r.match.categories ?? [])].sort(),
      [...(r.match.paymentKinds ?? [])].sort(),
      [...(r.match.excludeKeywords ?? [])].sort(),
      r.timeWindow ?? null,
      [...(r.daysOfWeek ?? [])].sort(),
      r.minAmountPerTx ?? null,
    ]);
  return key(a) === key(b);
}

/**
 * 이 룰이 같은 달 내내 다른 룰에 가려져 한 번도 적용될 수 없는가.
 *
 * 조건이 완전히 같고 우선순위가 더 높은(숫자가 작은) 룰이 같은 기간에
 * 살아 있으면, selectRule은 항상 그쪽을 고른다 — 이 룰은 존재하지 않는 것과
 * 같다. 프로모션을 기본 요율 위에 겹쳐 쌓는 구조에서 생긴다.
 *
 * **적용 구간에서 한도가 0인 룰은 가리지 못한다.** selectRule이 그런 룰을
 * 건너뛰기 때문이다. 신한EV 충전이 이 경우다 — 50%와 30%는 조건이 같고
 * 우선순위만 다른데, 구간에 따라 한쪽 한도가 0이 되면서 서로 자리를
 * 넘겨준다. 이 조건이 없으면 30% 룰이 화면에서 통째로 사라진다.
 */
function isShadowed(
  card: Card,
  rule: BenefitRule,
  appliedTier: SpendTier | null,
  month?: MonthKey,
): boolean {
  return card.benefits.some(
    (other) =>
      other.id !== rule.id &&
      (other.priority ?? 100) < (rule.priority ?? 100) &&
      sameMatcher(other, rule) &&
      resolveCap(other.capPerMonth, appliedTier) !== 0 &&
      (!month || isRuleEffectiveInMonth(month, other.effectiveFrom, other.effectiveUntil)),
  );
}

/**
 * 이 룰이 처음으로 한도를 갖는 구간을 찾는다.
 * 실적 미달이라 지금은 0원이지만 얼마를 채우면 얼마가 열리는지 알려 준다.
 */
function firstUnlock(
  card: Card,
  rule: BenefitRule,
): { threshold: number; cap: number } | undefined {
  for (const tier of card.performance.tiers) {
    const cap = resolveCap(rule.capPerMonth, tier);
    if (cap !== null && cap > 0) return { threshold: tier.threshold, cap };
  }
  return undefined;
}

/**
 * 혜택이 0원인 이유.
 *
 * "왜 이 결제는 혜택이 안 붙었지?"에 앱이 답할 수 있어야 한다. 엔진은
 * 이유를 알면서도 버리고 있었고, 화면에는 금액만 남아 사용자가 앱이
 * 고장 났는지 조건을 못 맞춘 건지 구분할 수 없었다.
 */
export type NoBenefitReason =
  | '대상 가맹점 아님'
  | '실적 미달로 잠김'
  | '건당 최소금액 미달'
  | '횟수 초과'
  | '실적 제외 항목'
  | '월 한도 소진'
  | '취소·환불';

export interface NoBenefitNote {
  reason: NoBenefitReason;
  /** 어느 혜택에 걸릴 뻔했는지 (알 수 있으면) */
  ruleLabel?: string;
  /** 조건을 숫자로 (예: '건당 20,000원 이상') */
  detail?: string;
}

/**
 * selectRule이 아무것도 못 고른 이유를 짚는다.
 *
 * 후보를 우선순위대로 훑으면서 **어디서 걸렸는지** 기록한다. 가장 먼저
 * 만난 '아깝게 놓친' 이유를 돌려준다 — 조건만 맞았으면 받았을 혜택이
 * 사용자에게 가장 쓸모 있는 정보다.
 */
function explainNoRule(
  card: Card,
  tx: Transaction,
  appliedTier: SpendTier | null,
  counters: UsageCounters,
): NoBenefitNote {
  let best: NoBenefitNote | null = null;

  const candidates = card.benefits
    .filter((r) => isRuleEffective(tx.approvedAt, r.effectiveFrom, r.effectiveUntil))
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

  for (const rule of candidates) {
    // 가맹점·시각·요일이 안 맞으면 애초에 이 룰의 문제가 아니다.
    if (!matchesRule(rule, tx)) continue;

    if (resolveCap(rule.capPerMonth, appliedTier) === 0) {
      best ??= { reason: '실적 미달로 잠김', ruleLabel: rule.label };
      continue;
    }
    if (rule.minAmountPerTx && tx.krwAmount < rule.minAmountPerTx) {
      // 금액만 채우면 받는 혜택이다. 가장 알려줄 값어치가 있으므로 즉시 확정.
      return {
        reason: '건당 최소금액 미달',
        ruleLabel: rule.label,
        detail: `건당 ${rule.minAmountPerTx.toLocaleString('ko-KR')}원 이상`,
      };
    }
    if (!counters.hasRemainingCount(rule, tx)) {
      best ??= {
        reason: '횟수 초과',
        ruleLabel: rule.label,
        detail:
          rule.maxCountPerDay !== undefined && rule.maxCountPerMonth !== undefined
            ? `일 ${rule.maxCountPerDay}회 · 월 ${rule.maxCountPerMonth}회`
            : rule.maxCountPerDay !== undefined
              ? `일 ${rule.maxCountPerDay}회`
              : `월 ${rule.maxCountPerMonth}회`,
      };
    }
  }

  return best ?? { reason: '대상 가맹점 아님' };
}

export interface ComputeBenefitsInput {
  card: Card;
  /** 이번 달 거래 (해당 카드로 이미 필터링된 것) */
  transactions: Transaction[];
  /** **지난달** 실적으로 확정된 이번 달 적용 구간 */
  appliedTier: SpendTier | null;
  /** 거래별 실적 판정. 제외 거래에 혜택을 주지 않기 위해 참조한다. */
  verdicts?: Map<string, PerformanceVerdict>;
  /**
   * 집계 대상 월. 이 달에 유효하지 않은 룰(아직 시작 전이거나 이미 끝난
   * 프로모션)을 혜택 목록에서 감추는 데 쓴다.
   */
  month?: MonthKey;
}

export function computeBenefits(input: ComputeBenefitsInput): BenefitResult {
  const { card, appliedTier, verdicts, month } = input;

  // 이용 순서대로 한도를 소진해야 실제 청구서와 일치한다.
  const transactions = [...input.transactions].sort(
    (a, b) => new Date(a.approvedAt).getTime() - new Date(b.approvedAt).getTime(),
  );

  const totalCap = appliedTier ? appliedTier.totalBenefitCap : null;
  // capGroup이 있으면 그 키로 한도를 공유한다. 없으면 룰 하나가 곧 한 그룹.
  const monthlyUsed = new Map<string, number>();
  const txCount = new Map<string, number>();
  /** Plan Day 보너스를 이미 쓴 capGroup. 그룹당 월 1회. */
  const bonusDayUsed = new Set<string>();
  const counters = new UsageCounters();
  const appliedBenefits: AppliedBenefit[] = [];
  const unmatchedTransactionIds: string[] = [];
  const noBenefit: Record<string, NoBenefitNote> = {};
  let totalUsed = 0;

  // 취소 전표를 원거래에 미리 짝지어 둔다. 거래를 시각순으로 도는 이상
  // 원거래는 항상 먼저 처리되므로, 전표를 만날 때는 되감을 금액이 이미
  // appliedByTx에 들어 있다.
  const links = linkReversals(input.transactions);
  const appliedByTx = new Map<string, AppliedBenefit>();
  const txById = new Map(transactions.map((t) => [t.id, t]));

  for (const tx of transactions) {
    /*
     * 취소 전표(음수) — 원거래에 붙었던 혜택을 **되감는다.**
     *
     * 그냥 건너뛰면 취소한 결제가 태운 한도가 영영 돌아오지 않는다.
     * 사용자는 쓰지도 않은 5,000원이 소진된 화면을 보고, 남은 한도를
     * 실제보다 적게 알고 다른 카드를 꺼내게 된다.
     */
    if (isReversal(tx)) {
      const link = links.get(tx.id);
      if (!link) {
        // 이번 달 안에 짝이 없다 — 지난달 결제를 이번 달에 취소한 경우다.
        // 그 혜택은 지난달 한도에서 나갔으므로 이번 달 한도를 되돌리면
        // 이번 달 소진량이 실제보다 작아진다. 건드리지 않는다.
        noBenefit[tx.id] = { reason: '취소·환불', detail: '원거래를 못 찾아 회수 안 함' };
        continue;
      }

      const origin = appliedByTx.get(link.originalId);
      const rule = origin ? card.benefits.find((r) => r.id === origin.ruleId) : undefined;
      if (!origin || !rule) {
        // 원거래가 애초에 혜택을 못 받았다. 되돌릴 게 없다.
        noBenefit[tx.id] = { reason: '취소·환불' };
        continue;
      }

      const capKey = rule.capGroup ?? rule.id;
      const used = monthlyUsed.get(capKey) ?? 0;
      // 부분취소는 되감은 비율만큼만 회수한다.
      const share = link.full
        ? origin.netAmount
        : Math.floor((origin.netAmount * link.amount) / link.originalAmount);
      // 소진된 적 없는 한도를 되돌리면 음수가 된다. 실제로 태운 만큼까지만.
      const refund = Math.max(0, Math.min(share, used, totalUsed));

      monthlyUsed.set(capKey, used - refund);
      totalUsed -= refund;

      if (link.full) {
        txCount.set(rule.id, Math.max(0, (txCount.get(rule.id) ?? 0) - 1));
        const original = txById.get(link.originalId);
        if (original) counters.release(rule, original);
      }

      if (refund === 0) noBenefit[tx.id] = { reason: '취소·환불', ruleLabel: rule.label };

      // 음수 혜택으로 남긴다. 화면이 '−1,000원 회수'라고 말할 수 있어야
      // 한도가 왜 줄었는지 사용자가 추적할 수 있다.
      appliedBenefits.push({
        transactionId: tx.id,
        ruleId: rule.id,
        ruleLabel: rule.label,
        type: rule.type,
        grossAmount: -refund,
        netAmount: -refund,
        cappedAmount: 0,
        cappedBy: 'none',
      });
      continue;
    }

    if (tx.canceled || tx.paymentKind === '취소·환불') {
      noBenefit[tx.id] = { reason: '취소·환불' };
      continue;
    }

    const rule = selectRule(card, tx, appliedTier, counters);
    const verdictForTx = verdicts?.get(tx.id);
    const excluded = verdictForTx !== undefined && verdictForTx !== '인정';

    if (!rule) {
      // 실적 미달로 룰이 비활성이면 '미분류'가 아니다. 브랜드 사전에
      // 아예 없는 가맹점만 미분류로 올려야 관리 화면이 신호를 유지한다.
      if (!matchesAnyRule(card, tx)) unmatchedTransactionIds.push(tx.id);
      // 실적에서 빠지는 거래라면 그걸 먼저 말한다. '대상 가맹점 아님'보다
      // 중요한 사실이다 — 혜택뿐 아니라 실적에도 안 잡힌다는 뜻이니까.
      noBenefit[tx.id] = excluded
        ? { reason: '실적 제외 항목', detail: verdictForTx.replace('제외-', '') }
        : explainNoRule(card, tx, appliedTier, counters);
      continue;
    }

    // 실적에서 제외된 거래(세금·상품권 등)는 원칙적으로 혜택도 없다.
    // 단, 룰이 명시적으로 opt-in 하면 준다 (예: 신한EV 하이패스 캐시백).
    if (excluded && !rule.applyToExcludedSpend) {
      noBenefit[tx.id] = {
        reason: '실적 제외 항목',
        ruleLabel: rule.label,
        detail: verdictForTx.replace('제외-', ''),
      };
      continue;
    }

    const ruleCap = resolveCap(rule.capPerMonth, appliedTier);
    const capKey = rule.capGroup ?? rule.id;
    const used = monthlyUsed.get(capKey) ?? 0;

    // Plan Day: 매월 1일, 그룹별 첫 **할인** 거래에만 요율 배수를 적용한다.
    // 실제로 할인이 붙은 뒤에 소진 처리해야 한도에 걸려 0원이 된 거래가
    // 보너스를 헛되이 태우지 않는다.
    const bonusEligible =
      rule.bonusDay !== undefined &&
      kstDayOfMonth(tx.approvedAt) === rule.bonusDay.dayOfMonth &&
      !bonusDayUsed.has(capKey);
    const rate = bonusEligible ? rule.rate * rule.bonusDay!.multiplier : rule.rate;

    // 요율은 '할인 전 이용금액' 상한까지만 걸린다. 상한을 할인액이 아니라
    // 이용금액에 두어야 Plan Day로 요율이 2배가 될 때 상한도 함께 2배가 된다.
    const eligibleAmount =
      rule.maxEligibleAmountPerTx !== undefined
        ? Math.min(tx.krwAmount, rule.maxEligibleAmountPerTx)
        : tx.krwAmount;

    // gross는 상한이 하나도 없었다면 받았을 금액이다. 이 값을 기준으로 해야
    // cappedAmount가 "한도 때문에 못 받은 금액"이라는 뜻을 유지한다.
    const gross = Math.floor(tx.krwAmount * rate);
    let amount = Math.floor(eligibleAmount * rate);
    let cappedBy: AppliedBenefit['cappedBy'] = amount < gross ? 'per-tx' : 'none';

    // 1. 건당 한도
    if (rule.capPerTx !== undefined && amount > rule.capPerTx) {
      amount = rule.capPerTx;
      cappedBy = 'per-tx';
    }

    // 2. 룰별 월 한도
    if (ruleCap !== null) {
      const remaining = Math.max(0, ruleCap - used);
      if (amount > remaining) {
        amount = remaining;
        cappedBy = 'per-month';
      }
    }

    // 3. 카드 통합 월 한도
    if (totalCap !== null) {
      const remainingTotal = Math.max(0, totalCap - totalUsed);
      if (amount > remainingTotal) {
        amount = remainingTotal;
        cappedBy = 'total';
      }
    }

    // 실제로 할인이 붙었을 때만 보너스를 소진한다. 약관의 "첫 번째 **할인**
    // 거래"가 그 뜻이다 — 한도에 걸려 0원이 된 거래는 할인 거래가 아니다.
    if (bonusEligible && amount > 0) bonusDayUsed.add(capKey);

    if (amount === 0) {
      noBenefit[tx.id] = { reason: '월 한도 소진', ruleLabel: rule.label };
    }

    monthlyUsed.set(capKey, used + amount);
    txCount.set(rule.id, (txCount.get(rule.id) ?? 0) + 1);
    // 금액이 0원이어도 횟수는 소진된 것으로 본다. 카드사도 그렇게 센다.
    counters.record(rule, tx);
    totalUsed += amount;

    const applied: AppliedBenefit = {
      transactionId: tx.id,
      ruleId: rule.id,
      ruleLabel: rule.label,
      type: rule.type,
      grossAmount: gross,
      netAmount: amount,
      cappedAmount: gross - amount,
      cappedBy,
    };
    appliedBenefits.push(applied);
    appliedByTx.set(tx.id, applied);
  }

  const usage: BenefitUsage[] = card.benefits
    .filter(
      (rule) =>
        !month || isRuleEffectiveInMonth(month, rule.effectiveFrom, rule.effectiveUntil),
    )
    // 더 높은 우선순위의 같은 조건 룰에 완전히 가려진 룰은 감춘다.
    // 프로모션 룰과 기본 룰을 겹쳐 쌓는 구조(쿠팡와우)에서 기본 룰은
    // 프로모션 기간 내내 한 번도 적용되지 않는데, 목록에 남으면
    // '0 / 20,000원'짜리 줄이 두 배로 늘어 한도를 오해하게 된다.
    .filter((rule) => !isShadowed(card, rule, appliedTier, month))
    .map((rule) => {
      const cap = resolveCap(rule.capPerMonth, appliedTier);
      const capKey = rule.capGroup ?? rule.id;
      const used = monthlyUsed.get(capKey) ?? 0;
      return {
        ruleId: rule.id,
        capGroup: rule.capGroup,
        label: rule.label,
        type: rule.type,
        used,
        cap,
        ratio: cap && cap > 0 ? Math.min(1, used / cap) : null,
        txCount: txCount.get(rule.id) ?? 0,
        // 지금 한도가 0이면 어느 구간에서 열리는지 찾아 둔다.
        unlock: cap === 0 ? firstUnlock(card, rule) : undefined,
      };
    })
    // 어느 구간에서도 열리지 않는 룰만 감춘다. 실적만 채우면 열리는 룰은
    // 잠긴 채로 남겨야 "이 카드에 뭐가 있는지"를 볼 수 있다.
    .filter((u) => !(u.cap === 0 && u.used === 0 && !u.unlock));

  // 같은 한도를 나눠 쓰는 룰들은 한 줄로 합친다. 안 합치면 화면에
  // '3만원 한도'가 여러 개 있는 것처럼 보여 총 한도를 오해하게 된다.
  const grouped: BenefitUsage[] = [];
  const groupIndex = new Map<string, number>();
  for (const u of usage) {
    if (!u.capGroup) {
      grouped.push(u);
      continue;
    }
    const seen = groupIndex.get(u.capGroup);
    if (seen === undefined) {
      const label =
        card.benefits.find((r) => r.capGroup === u.capGroup)?.capGroupLabel ?? u.label;
      groupIndex.set(u.capGroup, grouped.length);
      grouped.push({ ...u, ruleId: u.capGroup, label, txCount: u.txCount });
    } else {
      // used는 그룹 공유값이라 그대로 두고 건수만 더한다.
      grouped[seen].txCount += u.txCount;
    }
  }

  return {
    appliedBenefits,
    usage: grouped,
    totalUsed,
    totalCap,
    unmatchedTransactionIds,
    noBenefit,
    ruleCounts: Object.fromEntries(
      card.benefits.map((r) => [r.id, counters.countFor(r.id)]),
    ),
  };
}
