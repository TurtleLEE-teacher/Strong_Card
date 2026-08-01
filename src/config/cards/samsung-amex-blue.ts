import { BRAND_GROUPS } from '../merchants';
import type { Card, TierCap } from '@/lib/types';
import { COMMON_EXCLUSIONS } from '../exclusions';

/**
 * 삼성카드 American Express Blue
 *
 * 공식 상품 안내(카드 서비스 상세) 기준.
 *
 * **전월 이용금액 구간이 3단계다** — 30만 / 60만 / 90만.
 * 적립 혜택의 한도가 구간마다 다르다. 이걸 한 단계로 알고 있으면 60만 미만
 * 구간에서 한도를 3배로 잡게 된다.
 *
 *   서비스                       30만↑    60만↑    90만↑
 *   ─────────────────────────────────────────────────
 *   편의점·배달앱 7% 적립        5,000P  10,000P  15,000P
 *   교통·통신 5% 적립           5,000P  10,000P  15,000P
 *   스타벅스·이디야 20% 할인      5,000원  5,000원  5,000원  (구간 무관)
 *   스트리밍 20% 할인            5,000원  5,000원  5,000원  (구간 무관)
 *   쇼핑 1.5% 적립             30,000P — **전월실적 무관**
 *
 * 쇼핑 적립만 "전월 이용금액에 관계없이"라고 명시돼 있다. 그래서 이 카드는
 * 구간별 **통합** 한도를 두지 않고(totalBenefitCap = null) 항목별 한도로만
 * 제어한다. 통합 한도를 두면 실적 미달일 때 쇼핑 적립까지 0원이 된다.
 *
 * 출처: 삼성카드 앱 '카드 서비스 상세' 화면 (사용자 제공, 2026-07-31)
 *
 * ⚠️ 받은 화면은 7장 중 5장이다. **해외 결제 5% 적립은 그 5장에 없어
 *    확인하지 못했다.** 예전 조사 기준으로 남겨 두되 'estimated'로 표시한다.
 *    나머지 2장을 받으면 확정하거나 삭제한다.
 */

/** 구간별로 한도가 오르는 적립 (30만/60만/90만) */
function tieredCap(t30: number, t60: number, t90: number): TierCap[] {
  return [
    { threshold: 0, cap: 0 },
    { threshold: 300_000, cap: t30 },
    { threshold: 600_000, cap: t60 },
    { threshold: 900_000, cap: t90 },
  ];
}

/** 실적 30만만 넘으면 구간과 무관하게 같은 한도인 할인 */
function flatCap(cap: number): TierCap[] {
  return tieredCap(cap, cap, cap);
}

export const SAMSUNG_AMEX_BLUE: Card = {
  id: 'samsung-amex-blue',
  notionOption: 'Amex Blue',
  issuer: '삼성',
  name: '삼성카드 American Express Blue',
  shortName: 'Amex Blue',
  last4: ['2055'],
  active: true,
  annualFee: 20_000,
  slot: 3,
  productPageUrl:
    'https://www.americanexpress.com/ko-kr/network/credit-cards/samsung/blue-card.html',

  performance: {
    required: true,
    countsForeignSpend: true,
    installmentPolicy: 'full',
    tierConfidence: 'confirmed',
    tiers: [
      // 통합 한도를 두지 않는다 — 쇼핑 적립이 실적과 무관하기 때문이다.
      { threshold: 0, label: '실적 미달', totalBenefitCap: null },
      { threshold: 300_000, label: '30만원', totalBenefitCap: null },
      { threshold: 600_000, label: '60만원', totalBenefitCap: null },
      { threshold: 900_000, label: '90만원', totalBenefitCap: null },
    ],
    exclusions: COMMON_EXCLUSIONS,
  },

  benefits: [
    {
      id: 'ab-overseas',
      label: '해외 결제 5% 적립',
      type: 'point',
      rate: 0.05,
      match: { paymentKinds: ['해외'] },
      capPerMonth: 30_000,
      priority: 5,
      // 받은 약관 화면 5장에 이 서비스가 없었다. 예전 조사 기준이라 추정으로 둔다.
      confidence: 'estimated',
      notes: '약관 화면 미확인 — 나머지 2장으로 확인 필요',
    },
    {
      id: 'ab-starbucks',
      label: '스타벅스·이디야 20% 할인',
      type: 'discount',
      rate: 0.2,
      // 약관: 이 두 곳만. 사이렌오더 결제건도 포함.
      match: { brands: ['STARBUCKS', 'EDIYA'] },
      // 구간이 올라도 5,000원 고정이다.
      capPerMonth: flatCap(5_000),
      priority: 10,
      confidence: 'confirmed',
      notes: '오프라인 일반 결제건만 — 임대매장 제외',
    },
    {
      id: 'ab-streaming',
      label: '스트리밍 20% 할인',
      type: 'discount',
      rate: 0.2,
      // 약관에 열거된 6곳뿐이다. 일반 구독 묶음(14곳)을 쓰면 과다 계상된다.
      match: { brands: [...BRAND_GROUPS.AB_STREAMING] },
      // 약관: 건별 6,000원 이상 정기결제만.
      minAmountPerTx: 6_000,
      capPerMonth: flatCap(5_000),
      priority: 10,
      confidence: 'confirmed',
      notes: '간편결제·앱스토어 인앱결제는 제외',
    },
    {
      id: 'ab-cvs-delivery',
      label: '편의점·배달앱 7% 적립',
      type: 'point',
      rate: 0.07,
      // 편의점 5곳(CU·GS25·세븐일레븐·미니스톱·이마트24), 배달앱 3곳.
      match: { brands: [...BRAND_GROUPS.CONVENIENCE, ...BRAND_GROUPS.DELIVERY] },
      capPerMonth: tieredCap(5_000, 10_000, 15_000),
      priority: 20,
      confidence: 'confirmed',
    },
    {
      id: 'ab-transit-telecom',
      label: '교통·통신 5% 적립',
      type: 'point',
      rate: 0.05,
      // 약관: 대중교통은 **버스·지하철만**이다. 일반 TRANSIT 묶음에는 택시와
      // KTX가 들어 있어 그대로 쓰면 대상이 아닌 결제에 적립이 붙는다.
      match: {
        brands: [...BRAND_GROUPS.AB_TRANSIT, ...BRAND_GROUPS.TELECOM],
        keywords: ['버스', '지하철', '교통카드'],
        excludeKeywords: ['고속버스', '시외버스'],
      },
      capPerMonth: tieredCap(5_000, 10_000, 15_000),
      priority: 20,
      confidence: 'confirmed',
      notes: '이동통신은 SKT·KT·LG U+ 자동납부건',
    },
    {
      id: 'ab-shopping',
      label: '쇼핑 1.5% 적립',
      type: 'point',
      rate: 0.015,
      // 약관의 '쇼핑'은 온라인 쇼핑몰이 아니다. **간편결제 수단**,
      // 프리미엄 아울렛, 트렌디패션 세 가지다.
      match: {
        brands: [
          ...BRAND_GROUPS.AB_EASY_PAY,
          ...BRAND_GROUPS.AB_OUTLET,
          ...BRAND_GROUPS.AB_TRENDY_FASHION,
        ],
      },
      // **전월 이용금액에 관계없이** 제공된다. 구간표를 쓰면 실적 미달일 때
      // 0원이 되어 실제로 받는 적립을 못 받는 것으로 계산한다.
      capPerMonth: 30_000,
      priority: 50,
      confidence: 'confirmed',
      notes: '전월실적 조건 없음. 택시·고속버스·통행료·세금은 적립 제외',
    },
  ],
};
