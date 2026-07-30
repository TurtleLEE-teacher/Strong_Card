import { BRAND_GROUPS } from '../merchants';
import type { Card } from '@/lib/types';
import { COMMON_EXCLUSIONS } from '../exclusions';

/**
 * 신한카드 EV
 *
 *   전기차 충전  전월 30만 → 30% / 60만 → 50%   월 20,000원
 *   하이패스     전월 30만 → 10% 캐시백          월  5,000원
 *   생활서비스   전월 30만 → 10% 할인            월 30,000원 (6개 영역 통합)
 *
 * 세 영역이 각각 독립된 한도를 갖는다. 그래서 구간별 **통합** 한도를 두지
 * 않고(totalBenefitCap = null) 영역별 한도로만 제어한다.
 *
 * 생활서비스는 6개 영역(편의점·병원/약국·3대마트·대중교통·택시·커피)이
 * 하나의 3만원 한도를 나눠 쓴다. 영역별로 룰을 쪼개면 각자 3만원씩 갖는
 * 것처럼 계산돼 최대 18만원까지 부풀어 오른다. 그래서 한 룰로 묶었다.
 *
 * 출처: 신한카드 상품 안내, 카드 서비스 상세
 * https://www.shinhancard.com/pconts/html/card/apply/credit/1188380_2207.html
 */
export const SHINHAN_EV: Card = {
  id: 'shinhan-ev',
  notionOption: '신한 EV',
  issuer: '신한',
  name: '신한카드 EV',
  shortName: '신한 EV',
  last4: ['4401'],
  active: true,
  annualFee: 12_000, // 국내전용 1만2천원 (해외겸용은 1만5천원)
  slot: 6,
  productPageUrl:
    'https://www.shinhancard.com/pconts/html/card/apply/credit/1188380_2207.html',

  performance: {
    required: true,
    countsForeignSpend: true,
    installmentPolicy: 'full',
    tierConfidence: 'confirmed',
    tiers: [
      // 영역별 한도가 따로 있으므로 통합 한도는 두지 않는다.
      { threshold: 0, label: '실적 미달', totalBenefitCap: null },
      { threshold: 300_000, label: '30만원', totalBenefitCap: null },
      { threshold: 600_000, label: '60만원', totalBenefitCap: null },
    ],
    exclusions: COMMON_EXCLUSIONS,
  },

  benefits: [
    // 충전 할인율이 구간에 따라 30% → 50%로 바뀐다.
    // 룰 하나로는 표현이 안 되므로 두 룰로 나누고, 적용 구간에 따라
    // 한쪽 한도를 0으로 만들어 자연스럽게 비활성화한다.
    {
      id: 'ev-charge-50',
      label: '전기차 충전 50% 할인 (60만 구간)',
      type: 'discount',
      rate: 0.5,
      match: {
        brands: [...BRAND_GROUPS.EV_CHARGE],
        keywords: ['전기차충전', '충전소', 'EV충전'],
      },
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 0 },
        { threshold: 600_000, cap: 20_000 },
      ],
      priority: 10, // 50%를 먼저 시도한다
      confidence: 'confirmed',
    },
    {
      id: 'ev-charge-30',
      label: '전기차 충전 30% 할인 (30만 구간)',
      type: 'discount',
      rate: 0.3,
      match: {
        brands: [...BRAND_GROUPS.EV_CHARGE],
        keywords: ['전기차충전', '충전소', 'EV충전'],
      },
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 20_000 },
        { threshold: 600_000, cap: 0 }, // 60만 구간에서는 ev-charge-50이 대신 적용
      ],
      priority: 20,
      confidence: 'confirmed',
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
      confidence: 'confirmed',
      notes: '실적에는 산입되지 않지만(무승인 전표) 캐시백은 받는다',
    },
    {
      id: 'ev-living',
      // 6개 영역이 3만원 한도를 통합해서 쓴다. 쪼개면 한도가 6배로 부푼다.
      label: '생활서비스 10% 할인',
      type: 'discount',
      rate: 0.1,
      match: {
        brands: [
          ...BRAND_GROUPS.CONVENIENCE,
          ...BRAND_GROUPS.CAFE,
          'EMART', 'LOTTE_MART', 'HOMEPLUS', // 3대마트만 (창고형·온라인몰 제외)
          ...BRAND_GROUPS.TRANSIT,
          'PHARMACY',
        ],
        keywords: ['약국', '병원', '의원', '택시'],
        // 동물병원은 대상이 아니다.
        excludeKeywords: ['동물병원'],
      },
      // 건당 1만원까지 할인 대상 → 건당 최대 1,000원
      capPerTx: 1_000,
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 30_000 },
        { threshold: 600_000, cap: 30_000 },
      ],
      priority: 40,
      confidence: 'confirmed',
      notes:
        '3대마트는 주말만, 편의점·병원약국은 각 월 5회, 커피는 월 5회 제한이 ' +
        '있으나 횟수 제한은 엔진이 아직 다루지 않는다 (과다 계상 가능)',
    },
  ],
};
