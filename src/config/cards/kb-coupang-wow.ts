import type { Card } from '@/lib/types';
import { COMMON_EXCLUSIONS } from '../exclusions';

/**
 * KB국민 쿠팡 와우 카드 — 전월실적 조건 없음.
 *
 * 기본: 쿠팡/쿠팡이츠/쿠팡플레이 2% (월 2만), 그 외 0.2% (월 2천)
 * 프로모션(~2026-10-15): 쿠팡 4% (월 4만), 그 외 1.2% (월 1.2만)
 *
 * 프로모션 종료를 effectiveUntil로 관리한다. 날짜가 지나면 자동으로
 * 기본 룰로 넘어가므로 코드 수정 없이 숫자가 맞는다.
 * https://card-lounge.toss.im/card/6090
 */
export const KB_COUPANG_WOW: Card = {
  id: 'kb-coupang-wow',
  notionOption: '쿠팡 와우',
  issuer: '국민',
  name: 'KB국민 쿠팡 와우 카드',
  shortName: '쿠팡와우',
  last4: ['3211'],
  active: true,
  annualFee: 20_000,
  color: '#C7332F',
  productPageUrl: 'https://card-lounge.toss.im/card/6090',

  performance: {
    required: false,
    countsForeignSpend: true,
    installmentPolicy: 'full',
    tiers: [{ threshold: 0, label: '실적 조건 없음', totalBenefitCap: null }],
    // 실적 조건은 없지만 제외 규칙은 여전히 필요하다.
    // 이게 없으면 catch-all 룰(그 외 0.2%)이 세금·상품권 결제에도 적립을 붙인다.
    exclusions: COMMON_EXCLUSIONS,
  },

  benefits: [
    // --- 프로모션 (~2026-10-15) ---
    {
      id: 'cw-coupang-promo',
      label: '쿠팡 4% 적립 (프로모션)',
      type: 'point',
      rate: 0.04,
      match: { brands: ['COUPANG', 'COUPANG_EATS', 'COUPANG_PLAY'] },
      capPerMonth: 40_000,
      effectiveUntil: '2026-10-15',
      priority: 10,
      notes: '프로모션 종료 후 cw-coupang-base(2%)로 자동 전환',
    },
    {
      id: 'cw-other-promo',
      label: '그 외 1.2% 적립 (프로모션)',
      type: 'point',
      rate: 0.012,
      match: {},
      capPerMonth: 12_000,
      effectiveUntil: '2026-10-15',
      priority: 90,
    },

    // --- 프로모션 종료 후 기본 ---
    {
      id: 'cw-coupang-base',
      label: '쿠팡 2% 적립',
      type: 'point',
      rate: 0.02,
      match: { brands: ['COUPANG', 'COUPANG_EATS', 'COUPANG_PLAY'] },
      capPerMonth: 20_000,
      effectiveFrom: '2026-10-16',
      priority: 10,
    },
    {
      id: 'cw-other-base',
      label: '그 외 0.2% 적립',
      type: 'point',
      rate: 0.002,
      match: {},
      capPerMonth: 2_000,
      effectiveFrom: '2026-10-16',
      priority: 90,
    },
  ],
};
