import type { Card } from '@/lib/types';
import { BRAND_GROUPS } from '../merchants';
import { COMMON_EXCLUSIONS } from '../exclusions';

/**
 * KB국민 쿠팡 와우 카드 — 전월실적 조건 없음.
 *
 *   기간                      쿠팡·이츠·플레이      그 외 국내외       카페·편의점·해외
 *   ───────────────────────────────────────────────────────────────────────
 *   기본 (프로모션 없을 때)    2%   월 20,000원     0.2%               없음
 *   2026-04-15 ~ 10-15        4%   월 40,000원     1.2%               없음
 *   2026-11-01 ~ 2027-04-30   3.5% 월 35,000원     1%  월 10,000원    영역마다 1% 추가 · 월 10,000원
 *
 * 2026-10-16 ~ 10-31은 두 프로모션 사이라 기본 요율이다.
 *
 * 2026-11 프로모션 — 월 최대 75,000원 (35,000 + 10,000 + 30,000)
 *   쿠팡 3.5%  = 기본 2% + 프로모션 1.5%
 *   그 외 1%   = 기본 0.2% + 프로모션 0.8%. 키오스크·앱·간편결제 포함
 *   추가 1%    = 카페·편의점·해외 가맹점, 영역마다 월 10,000원.
 *                '그 외 1%'와 **중복**으로 붙는다(stackable). '그 외' 한도를
 *                다 쓰면 추가 1%만 남는다.
 *     카페    KB국민카드 가맹점 분류 '커피/음료' 업종
 *     편의점  CU · GS25 · 세븐일레븐 · 이마트24 오프라인 매장
 *     해외    해외 온라인·오프라인 승인 건
 *
 *   플레이스토어·앱스토어로 낸 쿠팡플레이는 쿠팡 혜택이 아니라 '그 외'로 간다.
 *   그런 결제는 가맹점명이 GOOGLE·APPLE로 찍혀 쿠팡 브랜드로 잡히지 않으므로
 *   따로 막지 않아도 그렇게 계산된다.
 *
 *   ⚠️ 편의점 '오프라인 매장만'은 문자로 구분할 수 없다. 편의점 앱 온라인
 *      결제도 추가 1%로 잡힐 수 있다.
 *
 * 기간은 effectiveFrom/Until로 관리한다. 날짜가 지나면 코드 수정 없이
 * 자동으로 기본 요율로 돌아간다.
 *
 * 출처: KB국민카드·쿠팡 공동 안내, 토스 카드라운지
 * https://card-lounge.toss.im/card/6090
 * 2026-11 프로모션: 「쿠팡 와우카드 혜택 변경 예정」 안내 (기보유 고객 대상,
 * 사용자 제공 화면, 2026-10-29). 받은 화면은 혜택 안내까지다 — 그 아래
 * 유의사항은 보지 못했다.
 */

const PROMO_FROM = '2026-04-15';
const PROMO_UNTIL = '2026-10-15';

/** 두 번째 프로모션 (쿠팡 와우카드 기보유 고객) */
const PROMO2_FROM = '2026-11-01';
const PROMO2_UNTIL = '2027-04-30';

/** 편의점 추가 적립 대상. 미니스톱은 안내에 없다. */
const CVS_2611 = ['CU', 'GS25', 'SEVEN_ELEVEN', 'EMART24'];

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
   * 중복도 생길 수 없다. 두 프로모션은 기간이 겹치지 않아 같은 우선순위를 쓴다.
   *
   * 2026-11 '추가 1%' 세 룰만 예외다. 주 룰과 따로 골라 그 위에 얹는다
   * (stackable). 우선순위가 아니라 각자의 한도로만 갈린다.
   */
  benefits: [
    // --- 프로모션 1 (2026-04-15 ~ 2026-10-15) ---
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

    // --- 프로모션 2 (2026-11-01 ~ 2027-04-30) ---
    {
      id: 'cw-coupang-2611',
      label: '쿠팡 3.5% 적립 (프로모션)',
      type: 'point',
      rate: 0.035,
      match: { brands: ['COUPANG', 'COUPANG_EATS', 'COUPANG_PLAY'] },
      capPerMonth: 35_000,
      effectiveFrom: PROMO2_FROM,
      effectiveUntil: PROMO2_UNTIL,
      priority: 10,
      confidence: 'confirmed',
      notes: '기본 2% + 프로모션 1.5%. 앱스토어·플레이스토어로 낸 쿠팡플레이는 그 외 1%',
    },
    {
      id: 'cw-other-2611',
      label: '그 외 1% 적립 (프로모션)',
      type: 'point',
      rate: 0.01,
      match: {},
      capPerMonth: 10_000,
      effectiveFrom: PROMO2_FROM,
      effectiveUntil: PROMO2_UNTIL,
      priority: 90,
      confidence: 'confirmed',
      notes: '기본 0.2% + 프로모션 0.8%. 국내외 가맹점, 키오스크·앱·간편결제 포함',
    },
    {
      id: 'cw-cafe-2611',
      label: '카페 1% 추가 적립',
      type: 'point',
      rate: 0.01,
      stackable: true,
      match: { brands: [...BRAND_GROUPS.CAFE], categories: ['카페'] },
      capPerMonth: 10_000,
      effectiveFrom: PROMO2_FROM,
      effectiveUntil: PROMO2_UNTIL,
      priority: 50,
      confidence: 'confirmed',
      notes: "KB국민카드 가맹점 분류 '커피/음료' 업종. 그 외 1%와 중복",
    },
    {
      id: 'cw-cvs-2611',
      label: '편의점 1% 추가 적립',
      type: 'point',
      rate: 0.01,
      stackable: true,
      match: { brands: CVS_2611 },
      capPerMonth: 10_000,
      effectiveFrom: PROMO2_FROM,
      effectiveUntil: PROMO2_UNTIL,
      priority: 51,
      confidence: 'confirmed',
      notes: 'CU·GS25·세븐일레븐·이마트24 오프라인 매장. 그 외 1%와 중복',
    },
    {
      id: 'cw-overseas-2611',
      label: '해외 1% 추가 적립',
      type: 'point',
      rate: 0.01,
      stackable: true,
      match: { paymentKinds: ['해외'] },
      capPerMonth: 10_000,
      effectiveFrom: PROMO2_FROM,
      effectiveUntil: PROMO2_UNTIL,
      priority: 52,
      confidence: 'confirmed',
      notes: '해외 온라인·오프라인 승인 건. 그 외 1%와 중복',
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
