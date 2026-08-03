import type { BenefitRule, BenefitUsage, Card } from '@/lib/types';
import { BRAND_ALIASES } from '@/config/merchants';
import { excludesSpendFromPerformance } from '@/lib/engine/performance';
import { won, wonShort, percent } from '@/lib/format';

/**
 * "이 혜택, 어디서 어떻게 써야 받나"를 사람 말로 옮긴다.
 *
 * 설정 파일에는 조건이 다 들어 있는데 화면에는 한 줄도 안 나오고 있었다.
 * 그중 **횟수 제한**이 특히 위험하다 — 금액 한도가 남아 있어도 횟수를 다
 * 쓰면 더 못 받는데, 바는 여전히 여유가 있는 것처럼 보인다. 신한 Discount
 * Plan의 Daily Plan은 영역마다 일 1회·월 5회라 이 함정에 그대로 걸린다.
 */

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

/** 브랜드 키를 사람이 읽는 이름으로. 별칭 목록의 첫 항목이 대표 표기다. */
function brandName(key: string): string {
  return BRAND_ALIASES[key]?.[0] ?? key;
}

export interface RuleGuide {
  ruleId: string;
  label: string;
  /** '10%' 같은 표시용 요율. 정액 할인이면 null. */
  rateLabel: string | null;
  /** 이 혜택이 붙는 곳 */
  targets: string[];
  /** 대상이 너무 많아 잘렸으면 남은 개수 */
  moreTargets: number;
  /** 시간·요일·금액 조건 */
  conditions: string[];
  /** 횟수 제한. 없으면 null. */
  counts: {
    perDay?: number;
    perMonth?: number;
    /** 이번 달 이미 쓴 횟수 */
    used: number;
    /** 월 횟수를 다 썼는가 */
    exhausted: boolean;
  } | null;
  /** 추정치인 규칙인지 */
  estimated: boolean;
  /**
   * 이 할인을 받으면 **결제액 전체가 다음 달 실적에서 빠지는가.**
   *
   * 탄탄대로 Trendy가 그렇다. 이 사실은 결제하기 **전에** 알아야 뜻이 있는데
   * (그때만 다른 카드를 고를 수 있다), 지금까지는 실적 제외 내역 패널에서
   * 사후에만 볼 수 있었다. 혜택 설명 안에 넣어 결제 직전 화면에 띄운다.
   */
  excludesPerformanceSpend: boolean;
  notes?: string;
}

const MAX_TARGETS = 8;

/** 이 혜택이 붙는 가맹점·조건을 목록으로 만든다. */
function describeTargets(rule: BenefitRule): { targets: string[]; more: number } {
  const { match } = rule;
  const all: string[] = [];

  if (match.paymentKinds?.length) {
    all.push(...match.paymentKinds.map((k) => `${k} 결제`));
  }
  all.push(...(match.brands ?? []).map(brandName));
  // 키워드는 이미 '약국', '미용실'처럼 사람이 읽는 말이라 그대로 쓴다.
  all.push(...(match.keywords ?? []));

  // 중복을 없앤다 — 브랜드 대표명과 키워드가 겹치는 경우가 있다.
  const unique = [...new Set(all)];
  if (unique.length === 0) return { targets: ['모든 가맹점'], more: 0 };

  return {
    targets: unique.slice(0, MAX_TARGETS),
    more: Math.max(0, unique.length - MAX_TARGETS),
  };
}

function describeConditions(rule: BenefitRule): string[] {
  const out: string[] = [];

  if (rule.timeWindow) out.push(`${rule.timeWindow.label}에만`);

  if (rule.daysOfWeek?.length) {
    const days = rule.daysOfWeek;
    const isWeekend = days.length === 2 && days.includes(0) && days.includes(6);
    out.push(isWeekend ? '주말만' : `${days.map((d) => DAY_NAMES[d]).join('·')}요일만`);
  }

  if (rule.minAmountPerTx) out.push(`건당 ${wonShort(rule.minAmountPerTx)} 이상`);

  // 이용금액 상한은 "얼마까지 할인 대상인가"라 실제 상한액을 함께 보여준다.
  if (rule.maxEligibleAmountPerTx !== undefined) {
    const ceiling = Math.floor(rule.maxEligibleAmountPerTx * rule.rate);
    out.push(`건당 ${wonShort(rule.maxEligibleAmountPerTx)}까지 (최대 ${won(ceiling)})`);
  } else if (rule.capPerTx !== undefined && rule.rate < 1) {
    out.push(`건당 최대 ${won(rule.capPerTx)}`);
  }

  if (rule.bonusDay) out.push(`매월 ${rule.bonusDay.dayOfMonth}일 ${rule.bonusDay.multiplier}배`);

  if (rule.match.excludeKeywords?.length) {
    out.push(`제외: ${rule.match.excludeKeywords.join('·')}`);
  }

  return out;
}

/**
 * 한 영역(=화면의 바 한 줄)에 묶인 규칙들을 풀어 설명한다.
 *
 * 공유 한도(capGroup)면 그 그룹의 모든 규칙이 한 줄로 합쳐져 있다.
 * 금액은 합산이지만 **횟수는 규칙마다 따로** 센다 — 신한 Daily Plan이
 * "영역별 월 5회"인 게 정확히 이 구조다. 그래서 규칙 단위로 펼쳐야 한다.
 */
export function guidesFor(
  card: Card,
  usage: BenefitUsage,
  ruleCounts: Record<string, number> | undefined,
): RuleGuide[] {
  const members = usage.capGroup
    ? card.benefits.filter((r) => r.capGroup === usage.capGroup)
    : card.benefits.filter((r) => r.id === usage.ruleId);

  return members.map((rule) => {
    const { targets, more } = describeTargets(rule);
    const used = ruleCounts?.[rule.id] ?? 0;
    const hasCount = rule.maxCountPerDay !== undefined || rule.maxCountPerMonth !== undefined;

    return {
      ruleId: rule.id,
      label: rule.label,
      // 정액 할인(rate 1)은 요율로 말하면 '100%'가 되어 거짓말이 된다.
      rateLabel: rule.rate < 1 ? percent(rule.rate) : null,
      targets,
      moreTargets: more,
      conditions: describeConditions(rule),
      counts: hasCount
        ? {
            perDay: rule.maxCountPerDay,
            perMonth: rule.maxCountPerMonth,
            used,
            exhausted:
              rule.maxCountPerMonth !== undefined && used >= rule.maxCountPerMonth,
          }
        : null,
      estimated: rule.confidence === 'estimated',
      excludesPerformanceSpend: excludesSpendFromPerformance(card, rule),
      notes: rule.notes,
    };
  });
}

/**
 * 이 영역에서 횟수를 다 쓴 규칙 수.
 * 대시보드에서 "돈은 남았는데 횟수가 없다"를 한 눈에 알리는 데 쓴다.
 */
export function exhaustedCountRules(
  card: Card,
  usage: BenefitUsage,
  ruleCounts: Record<string, number> | undefined,
): number {
  return guidesFor(card, usage, ruleCounts).filter((g) => g.counts?.exhausted).length;
}
