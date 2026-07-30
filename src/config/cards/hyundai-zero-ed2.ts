import { BRAND_GROUPS } from '../merchants';
import type { Card } from '@/lib/types';
import { COMMON_EXCLUSIONS } from '../exclusions';

/**
 * 현대카드 ZERO Edition2 (포인트형)
 *
 * 전월실적 없음, 적립한도 없음(1회·월·연간 모두). 이 앱에서 유일하게
 * 바(bar)가 성립하지 않는 카드다 — 분모가 없으니 진행률이 정의되지 않는다.
 *
 *   국내외 전 가맹점  1%   M포인트
 *   생활 필수 영역   2.5%  M포인트
 *
 * 생활 필수 영역: 편의점(현장결제만), 대형마트, 통신, 주유, 학원, 병원, 약국
 *
 * 출처: 현대카드 상품 가이드북
 * https://www.hyundaicard.com/upload/card/20210329_ZERO-Edition2%20포인트형.pdf
 */
export const HYUNDAI_ZERO_ED2: Card = {
  id: 'hyundai-zero-ed2',
  notionOption: 'ZERO Edition2',
  issuer: '현대',
  name: '현대카드 ZERO Edition2 (포인트형)',
  shortName: 'ZERO Ed2',
  last4: ['7316'],
  active: true,
  annualFee: 10_000,
  slot: 4,
  productPageUrl: 'https://www.hyundaicard.com/cpc/na/CPCNA0101_01.hc',

  performance: {
    required: false,
    countsForeignSpend: true,
    installmentPolicy: 'full',
    tierConfidence: 'confirmed', // 무실적 카드 — 구간 자체가 없다
    tiers: [{ threshold: 0, label: '실적 조건 없음', totalBenefitCap: null }],
    // 실적 조건은 없지만 세금·상품권 등은 적립 대상에서 빠진다.
    exclusions: COMMON_EXCLUSIONS,
  },

  benefits: [
    {
      id: 'zero-essential',
      label: '생활 필수 2.5% 적립',
      type: 'point',
      rate: 0.025,
      match: {
        brands: [
          ...BRAND_GROUPS.CONVENIENCE, // 현장 결제만 대상
          ...BRAND_GROUPS.MART,
          ...BRAND_GROUPS.TELECOM,
          ...BRAND_GROUPS.FUEL,
          'PHARMACY',
        ],
        keywords: ['학원', '병원', '의원', '약국'],
        categories: ['생활', '의료', '교육'],
      },
      capPerMonth: null, // 한도 없음
      priority: 10,
      confidence: 'confirmed',
    },
    {
      id: 'zero-all',
      label: '전 가맹점 1% 적립',
      type: 'point',
      rate: 0.01,
      match: {},
      capPerMonth: null, // 한도 없음
      priority: 90,
      confidence: 'confirmed',
    },
  ],
};
