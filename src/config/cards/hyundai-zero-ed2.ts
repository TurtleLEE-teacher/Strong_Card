import type { Card } from '@/lib/types';
import { COMMON_EXCLUSIONS } from '../exclusions';

/**
 * 현대카드 ZERO Edition2 (포인트형)
 *
 * 전월실적 없음, 적립한도 없음. 이 앱에서 유일하게 바(bar)가 성립하지 않는 카드다.
 * (분모가 없으니 진행률이 정의되지 않는다 → UI에서 숫자만 표시한다)
 *
 * 국내·외 모든 가맹점 1% / 생활 필수 영역 2.5%
 * https://www.hyundaicard.com/upload/card/20201124_ZERO-Edition2포인트형.pdf
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
  color: '#4A4A4A',
  productPageUrl: 'https://www.hyundaicard.com/cpc/na/CPCNA0101_01.hc',

  performance: {
    required: false,
    countsForeignSpend: true,
    installmentPolicy: 'full',
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
          'EMART', 'HOMEPLUS', 'LOTTE_MART',
          'CU', 'GS25', 'SEVEN_ELEVEN', 'EMART24',
          'SKT', 'KT', 'LGU',
          'SK_ENERGY', 'GS_CALTEX', 'HYUNDAI_OILBANK', 'S_OIL',
        ],
        categories: ['생활', '교통'],
      },
      capPerMonth: null, // 한도 없음
      priority: 10,
    },
    {
      id: 'zero-all',
      label: '전 가맹점 1% 적립',
      type: 'point',
      rate: 0.01,
      match: {},
      capPerMonth: null, // 한도 없음
      priority: 90,
    },
  ],
};
