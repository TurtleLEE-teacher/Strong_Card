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

  /*
   * 프로모션과 기본 요율은 **겹쳐 쌓는다**(overlay).
   *
   * 예전에는 유효기간을 잘라 이어 붙였다 — 프로모션 04-15~10-15, 기본
   * 10-16부터. 그러면 프로모션 시작 **이전** 날짜에는 어떤 룰도 유효하지
   * 않아 그 기간 적립이 통째로 0원이 된다.
   *
   * 지금은 기본 룰에 유효기간을 두지 않아 항상 살아 있고, 프로모션 룰이
   * 더 높은 우선순위(작은 priority)로 그 위를 덮는다. selectRule은 매칭되는
   * 첫 룰 하나만 쓰므로 어느 시점에도 정확히 하나가 적용된다 — 빈틈도
   * 중복도 생길 수 없다.
   */
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

    // --- 기본 요율 (프로모션이 없을 때 적용) ---
    {
      id: 'cw-coupang-base',
      label: '쿠팡 2% 적립',
      type: 'point',
      rate: 0.02,
      match: { brands: ['COUPANG', 'COUPANG_EATS', 'COUPANG_PLAY'] },
      capPerMonth: 20_000,
      // 유효기간 없음 — 항상 살아 있고 프로모션이 위를 덮는다.
      priority: 11,
      confidence: 'confirmed',
    },
    {
      id: 'cw-other-base',
      label: '그 외 0.2% 적립',
      type: 'point',
      rate: 0.002,
      match: {},
      capPerMonth: 2_000,
      // 유효기간 없음 — 항상 살아 있고 프로모션이 위를 덮는다.
      priority: 91,
      confidence: 'estimated',
      notes: '월 한도는 미확인',
    },
  ],
};
