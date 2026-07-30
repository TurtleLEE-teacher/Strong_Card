import type { Card } from '@/lib/types';
import { COMMON_EXCLUSIONS } from '../exclusions';

/**
 * KB국민 쿠팡 와우 카드 — 전월실적 조건 없음.
 *
 *   기본     쿠팡 2%  (월 20,000원) / 그 외 0.2%
 *   프로모션 쿠팡 4%  (월 40,000원) / 그 외 1.2%
 *            = 기본 2% + 추가 2%      = 기본 0.2% + 추가 1%
 *
 * 프로모션 기간: 2026-04-15 ~ 2026-10-15
 *
 * 기간을 effectiveFrom/Until로 관리한다. 날짜가 지나면 코드 수정 없이
 * 자동으로 기본 요율로 돌아간다.
 *
 * 출처: KB국민카드·쿠팡 공동 안내, 토스 카드라운지
 * https://card-lounge.toss.im/card/6090
 */

const PROMO_FROM = '2026-04-15';
const PROMO_UNTIL = '2026-10-15';

export const KB_COUPANG_WOW: Card = {
  id: 'kb-coupang-wow',
  notionOption: '쿠팡 와우',
  issuer: '국민',
  name: 'KB국민 쿠팡 와우 카드',
  shortName: '쿠팡와우',
  last4: ['3211'],
  active: true,
  annualFee: 20_000,
  slot: 2,
  productPageUrl: 'https://card-lounge.toss.im/card/6090',

  performance: {
    required: false,
    countsForeignSpend: true,
    installmentPolicy: 'full',
    tierConfidence: 'confirmed', // 무실적 카드 — 구간 자체가 없다
    tiers: [{ threshold: 0, label: '실적 조건 없음', totalBenefitCap: null }],
    // 실적 조건은 없지만 제외 규칙은 여전히 필요하다.
    // 이게 없으면 catch-all 룰(그 외 0.2%)이 세금·상품권 결제에도 적립을 붙인다.
    exclusions: COMMON_EXCLUSIONS,
  },

  benefits: [
    // --- 프로모션 (2026-04-15 ~ 2026-10-15) ---
    {
      id: 'cw-coupang-promo',
      label: '쿠팡 4% 적립 (프로모션)',
      type: 'point',
      rate: 0.04,
      match: { brands: ['COUPANG', 'COUPANG_EATS', 'COUPANG_PLAY'] },
      capPerMonth: 40_000,
      effectiveFrom: PROMO_FROM,
      effectiveUntil: PROMO_UNTIL,
      priority: 10,
      confidence: 'confirmed',
      notes: '기본 2% + 추가 프로모션 2%',
    },
    {
      id: 'cw-other-promo',
      label: '그 외 1.2% 적립 (프로모션)',
      type: 'point',
      rate: 0.012,
      match: {},
      // 그 외 영역의 월 한도는 공개 자료로 확인하지 못했다.
      // 무제한으로 두면 과다 계상되므로 보수적으로 12,000원을 잡되
      // '확인 필요'로 표시한다.
      capPerMonth: 12_000,
      effectiveFrom: PROMO_FROM,
      effectiveUntil: PROMO_UNTIL,
      priority: 90,
      confidence: 'estimated',
      notes: '기본 0.2% + 추가 1%. 월 한도는 미확인',
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
      confidence: 'confirmed',
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
      confidence: 'estimated',
      notes: '월 한도는 미확인',
    },
  ],
};
