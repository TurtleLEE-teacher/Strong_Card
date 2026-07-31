/**
 * 카드 설정의 정합성·MECE 불변식.
 *
 * 카드 데이터는 손으로 옮겨 적는 것이라 조용히 어긋나기 쉽다. 요율 하나가
 * 틀리면 눈에 띄지만, 구간 임계값이 카드 구간표와 반 칸 어긋나거나 두 룰이
 * 같은 가맹점을 같은 우선순위로 물면 화면은 멀쩡해 보이면서 금액만 틀린다.
 *
 * 여기 있는 건 값이 아니라 **구조**에 대한 검사다. 카드를 추가하거나 약관을
 * 반영할 때 이 파일이 먼저 깨져야 한다.
 */

import { describe, expect, it } from 'vitest';
import { CARDS } from '@/config/cards';
import { BRAND_ALIASES } from '@/config/merchants';
import { computeBenefits, matchesRule } from '@/lib/engine/benefits';
import { isRuleEffective } from '@/lib/date';
import type { Card, Transaction } from '@/lib/types';

const MERCHANT_NAMES = Object.values(BRAND_ALIASES).flat() as string[];

function probeTx(card: Card, name: string, hour: number, dow: number): Transaction {
  // 2026-07-01은 수요일(dow 3). dow만큼 밀어 요일 조건을 건드린다.
  const d = new Date(Date.UTC(2026, 6, 1 + ((dow - 3 + 7) % 7), hour - 9, 0, 0));
  return {
    id: 'probe',
    title: name,
    merchant: name,
    rawAmount: 100_000,
    currency: 'KRW',
    krwAmount: 100_000,
    approvedAt: d.toISOString(),
    issuer: null,
    last4: null,
    cardId: card.id,
    category: null,
    paymentKind: '일시불',
    installmentMonths: null,
    canceled: false,
    rawMessage: null,
    issuerCumulative: null,
    alertStatus: null,
  };
}

describe('카드 간 유일성', () => {
  it('룰 id가 카드 전체에서 유일하다', () => {
    const seen = new Map<string, string>();
    for (const card of CARDS) {
      for (const rule of card.benefits) {
        expect(seen.has(rule.id), `룰 id '${rule.id}' 중복 (${seen.get(rule.id)} ↔ ${card.id})`)
          .toBe(false);
        seen.set(rule.id, card.id);
      }
    }
  });

  it('색 슬롯이 겹치지 않는다', () => {
    // 겹치면 두 카드가 같은 색으로 나와 정체성 색이 무의미해진다.
    const slots = CARDS.map((c) => c.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('카드 뒷 4자리가 겹치지 않는다', () => {
    // 겹치면 거래를 어느 카드에 붙일지 결정할 수 없다.
    const all = CARDS.flatMap((c) => c.last4);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('실적 구간표', () => {
  it.each(CARDS.map((c) => [c.id, c] as const))('%s: 임계값 오름차순', (_id, card) => {
    const th = card.performance.tiers.map((t) => t.threshold);
    expect(th).toEqual([...th].sort((a, b) => a - b));
  });

  it.each(CARDS.map((c) => [c.id, c] as const))('%s: 실적형은 0원 구간부터', (_id, card) => {
    if (!card.performance.required) return;
    expect(card.performance.tiers[0].threshold).toBe(0);
  });

  it.each(CARDS.map((c) => [c.id, c] as const))('%s: 구간 라벨이 임계값과 일치', (_id, card) => {
    for (const tier of card.performance.tiers) {
      const m = tier.label.match(/^(\d+(?:\.\d+)?)만원?$/);
      if (!m) continue; // '실적 미달' 같은 서술형 라벨은 검사 대상이 아니다
      expect(Number(m[1]) * 10_000, `${card.id} 라벨 '${tier.label}'`).toBe(tier.threshold);
    }
  });
});

describe('룰 한도', () => {
  it.each(CARDS.map((c) => [c.id, c] as const))(
    '%s: 구간별 한도표가 카드 구간표와 정확히 대응',
    (_id, card) => {
      const tiers = card.performance.tiers.map((t) => t.threshold);
      for (const rule of card.benefits) {
        if (!Array.isArray(rule.capPerMonth)) continue;
        const caps = rule.capPerMonth.map((c) => c.threshold);
        // 구간표에 없는 임계값이 있으면 그 한도는 영영 안 쓰인다.
        // 반대로 빠진 구간이 있으면 resolveCap이 0으로 떨어져 혜택이 사라진다.
        expect(caps, `${rule.id}`).toEqual(tiers);
      }
    },
  );

  it.each(CARDS.map((c) => [c.id, c] as const))(
    '%s: 같은 capGroup은 같은 한도를 쓴다',
    (_id, card) => {
      const byGroup = new Map<string, Set<string>>();
      for (const rule of card.benefits) {
        if (!rule.capGroup) continue;
        const set = byGroup.get(rule.capGroup) ?? new Set<string>();
        set.add(JSON.stringify(rule.capPerMonth));
        byGroup.set(rule.capGroup, set);
      }
      // 공유 한도인데 룰마다 값이 다르면 어느 쪽이 진짜 한도인지 알 수 없다.
      for (const [group, sigs] of byGroup) {
        expect(sigs.size, `capGroup '${group}'`).toBe(1);
      }
    },
  );

  it.each(CARDS.map((c) => [c.id, c] as const))('%s: capGroup에 표시용 이름이 있다', (_id, card) => {
    const groups = new Set(card.benefits.map((r) => r.capGroup).filter(Boolean));
    for (const group of groups) {
      const labeled = card.benefits.some((r) => r.capGroup === group && r.capGroupLabel);
      expect(labeled, `capGroup '${group}'에 capGroupLabel 없음`).toBe(true);
    }
  });

  it.each(CARDS.map((c) => [c.id, c] as const))('%s: 모든 구간에서 죽은 룰이 없다', (_id, card) => {
    for (const rule of card.benefits) {
      if (!Array.isArray(rule.capPerMonth)) continue;
      const dead = rule.capPerMonth.every((c) => c.cap === 0);
      expect(dead, `${rule.id}은 어떤 구간에서도 한도가 0`).toBe(false);
    }
  });

  it.each(CARDS.map((c) => [c.id, c] as const))(
    '%s: 건당 상한을 두 가지 방식으로 동시에 걸지 않는다',
    (_id, card) => {
      for (const rule of card.benefits) {
        const both = rule.capPerTx !== undefined && rule.maxEligibleAmountPerTx !== undefined;
        expect(both, `${rule.id}: capPerTx와 maxEligibleAmountPerTx 동시 지정`).toBe(false);
      }
    },
  );
});

describe('브랜드 사전', () => {
  it.each(CARDS.map((c) => [c.id, c] as const))('%s: 없는 브랜드를 참조하지 않는다', (_id, card) => {
    const known = new Set(Object.keys(BRAND_ALIASES));
    for (const rule of card.benefits) {
      for (const brand of rule.match.brands ?? []) {
        expect(known.has(brand), `${rule.id}이 없는 브랜드 '${brand}' 참조`).toBe(true);
      }
    }
  });
});

describe('MECE — 룰이 서로를 가리지 않는가', () => {
  /**
   * 같은 시점에 유효한 두 룰이 **같은 가맹점**을 물면서 **우선순위가 같으면**
   * 어느 쪽이 적용될지가 배열 순서에 좌우된다. 그 순간 혜택 금액이 설정
   * 파일의 줄 순서에 달라붙는다 — 리팩터링 한 번에 금액이 바뀐다.
   *
   * 우선순위가 다르면 겹쳐도 괜찮다. 그게 '구체적 룰 먼저, catch-all 나중'
   * 이라는 의도된 설계다.
   */
  it.each(CARDS.map((c) => [c.id, c] as const))(
    '%s: 동시 유효한 룰이 같은 가맹점을 같은 우선순위로 물지 않는다',
    (_id, card) => {
      const clashes: string[] = [];
      for (const name of MERCHANT_NAMES) {
        for (const hour of [9, 13, 20]) {
          for (const dow of [1, 6]) {
            const tx = probeTx(card, name, hour, dow);
            const hits = card.benefits.filter(
              (r) =>
                isRuleEffective(tx.approvedAt, r.effectiveFrom, r.effectiveUntil) &&
                matchesRule(r, tx),
            );
            if (hits.length < 2) continue;
            const prios = hits.map((r) => r.priority ?? 100);
            if (new Set(prios).size === prios.length) continue;
            clashes.push(`'${name}' → ${hits.map((r, i) => `${r.id}(p${prios[i]})`).join(' + ')}`);
          }
        }
      }
      expect([...new Set(clashes)]).toEqual([]);
    },
  );

  /**
   * catch-all 룰(매칭 조건이 하나도 없는 룰)을 가진 카드는 **어느 날짜에도**
   * 적용할 catch-all이 하나는 있어야 하고, 그게 유일하게 정해져야 한다.
   *
   * 빈틈이 생기면 그 기간 '그 외' 적립이 통째로 0원이 된다. 프로모션 룰과
   * 기본 룰의 유효기간을 잘라 이어 붙이면 프로모션 **시작 이전**이 비는데,
   * 화면에는 그냥 0원으로 보여서 눈치채기 어렵다.
   *
   * 겹치는 것 자체는 문제가 아니다 — 우선순위로 정확히 하나가 뽑히면 된다.
   * 그래서 '유효한 개수'가 아니라 '최우선 룰이 유일한가'를 본다.
   */
  it('catch-all 룰이 어느 날짜에도 빈틈 없이, 유일하게 정해진다', () => {
    const probes = [
      '2025-01-01',
      '2026-04-14', '2026-04-15', '2026-04-16',
      '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17',
      '2027-01-01',
    ];
    for (const card of CARDS) {
      if (!card.benefits.some(isCatchAll)) continue;
      for (const day of probes) {
        const at = `${day}T03:00:00Z`;
        const live = card.benefits.filter(
          (r) => isCatchAll(r) && isRuleEffective(at, r.effectiveFrom, r.effectiveUntil),
        );
        expect(live.length, `${card.id} ${day}: catch-all이 하나도 없다`).toBeGreaterThan(0);

        const top = Math.min(...live.map((r) => r.priority ?? 100));
        const winners = live.filter((r) => (r.priority ?? 100) === top);
        expect(
          winners.length,
          `${card.id} ${day}: 최우선 catch-all이 ${winners.map((r) => r.id)}로 갈림`,
        ).toBe(1);
      }
    }
  });
});

function isCatchAll(rule: Card['benefits'][number]): boolean {
  const m = rule.match;
  return (
    !m.brands?.length && !m.keywords?.length && !m.categories?.length && !m.paymentKinds?.length
  );
}

describe('가려진 룰은 화면에 뜨지 않는다', () => {
  /**
   * 프로모션을 기본 요율 위에 겹쳐 쌓으면(쿠팡와우) 기본 룰은 프로모션 기간
   * 내내 한 번도 적용되지 않는다. 목록에 남으면 '0 / 20,000원' 줄이 두 배로
   * 늘어 한도를 실제의 두 배로 오해하게 된다.
   */
  it('쿠팡와우는 프로모션 기간에 프로모션 룰만 보여준다', () => {
    const card = CARDS.find((c) => c.id === 'kb-coupang-wow')!;
    const result = computeBenefits({
      card,
      transactions: [],
      appliedTier: card.performance.tiers[0],
      month: '2026-07', // 프로모션 기간(2026-04-15 ~ 10-15)
    });
    const ids = result.usage.map((u) => u.ruleId).sort();
    expect(ids).toEqual(['cw-coupang-promo', 'cw-other-promo']);
  });

  it('프로모션이 끝나면 기본 룰만 보여준다', () => {
    const card = CARDS.find((c) => c.id === 'kb-coupang-wow')!;
    const result = computeBenefits({
      card,
      transactions: [],
      appliedTier: card.performance.tiers[0],
      month: '2026-12', // 프로모션 종료 후
    });
    const ids = result.usage.map((u) => u.ruleId).sort();
    expect(ids).toEqual(['cw-coupang-base', 'cw-other-base']);
  });

  it('프로모션 시작 전에도 기본 룰이 살아 있다 (빈틈 없음)', () => {
    const card = CARDS.find((c) => c.id === 'kb-coupang-wow')!;
    const result = computeBenefits({
      card,
      transactions: [],
      appliedTier: card.performance.tiers[0],
      month: '2026-01',
    });
    expect(result.usage.map((u) => u.ruleId).sort()).toEqual([
      'cw-coupang-base',
      'cw-other-base',
    ]);
  });
});
