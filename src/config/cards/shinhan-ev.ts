import type { Card } from '@/lib/types';
import { COMMON_EXCLUSIONS } from '../exclusions';

/**
 * 신한카드 EV
 *
 * 전월 30만/60만 → 전기차 충전 30%/50% 결제일할인 (월 최대 2만원)
 * 전월 30만 이상 → 신한 하이패스 10% 캐시백 (월 5천원)
 * https://www.shinhancard.com/pconts/html/card/apply/credit/1188380_2207.html
 *
 * ⚠️ 하이패스는 공통 실적 제외 항목('무승인 전표')이면서 동시에 혜택 대상이다.
 *    즉 하이패스 결제는 실적에는 안 잡히지만 캐시백은 받는다.
 *    이 카드에 한해 하이패스 제외 규칙을 유지하되 혜택 룰은 별도로 둔다.
 */
export const SHINHAN_EV: Card = {
  id: 'shinhan-ev',
  notionOption: '신한 EV',
  issuer: '신한',
  name: '신한카드 EV',
  shortName: '신한 EV',
  last4: ['4401'],
  active: true,
  annualFee: 15_000,
  color: '#2E9E6B',
  productPageUrl:
    'https://www.shinhancard.com/pconts/html/card/apply/credit/1188380_2207.html',

  performance: {
    required: true,
    countsForeignSpend: true,
    installmentPolicy: 'full',
    tiers: [
      { threshold: 0, label: '실적 미달', totalBenefitCap: 0 },
      { threshold: 300_000, label: '30만원', totalBenefitCap: 25_000 },
      { threshold: 600_000, label: '60만원', totalBenefitCap: 25_000 },
    ],
    exclusions: COMMON_EXCLUSIONS,
  },

  benefits: [
    // 충전 할인율이 구간에 따라 30% → 50%로 바뀐다.
    // 룰 하나로는 표현이 안 되므로 두 룰로 나누고, 적용 구간에 따라
    // 한쪽 한도를 0으로 만들어 자연스럽게 비활성화한다.
    {
      id: 'ev-charge-30',
      label: '전기차 충전 30% 할인 (30만 구간)',
      type: 'discount',
      rate: 0.3,
      match: {
        brands: [
          'EV_CHARGE_ENVIRONMENT', 'EV_CHARGE_KEPCO', 'EV_CHARGE_CHAEVI',
          'EV_CHARGE_EVERON', 'EV_CHARGE_HAEVICHI', 'EV_CHARGE_SK',
          'EV_CHARGE_GS', 'EV_CHARGE_TESLA',
        ],
        keywords: ['전기차충전', '충전소', 'EV충전'],
      },
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 20_000 },
        { threshold: 600_000, cap: 0 }, // 60만 구간에서는 ev-charge-50이 대신 적용
      ],
      priority: 20,
    },
    {
      id: 'ev-charge-50',
      label: '전기차 충전 50% 할인 (60만 구간)',
      type: 'discount',
      rate: 0.5,
      match: {
        brands: [
          'EV_CHARGE_ENVIRONMENT', 'EV_CHARGE_KEPCO', 'EV_CHARGE_CHAEVI',
          'EV_CHARGE_EVERON', 'EV_CHARGE_HAEVICHI', 'EV_CHARGE_SK',
          'EV_CHARGE_GS', 'EV_CHARGE_TESLA',
        ],
        keywords: ['전기차충전', '충전소', 'EV충전'],
      },
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 0 },
        { threshold: 600_000, cap: 20_000 },
      ],
      priority: 10, // 50%를 먼저 시도한다
    },
    {
      id: 'ev-hipass',
      label: '하이패스 10% 캐시백',
      type: 'discount',
      rate: 0.1,
      match: { brands: ['HIPASS'], keywords: ['하이패스', '통행료'] },
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 5_000 },
        { threshold: 600_000, cap: 5_000 },
      ],
      priority: 30,
      applyToExcludedSpend: true,
      notes: '실적에는 산입되지 않지만(무승인 전표) 캐시백은 받는다',
    },
  ],
};
