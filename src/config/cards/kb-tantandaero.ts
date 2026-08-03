import { BRAND_GROUPS } from '../merchants';
import type { Card, TierCap } from '@/lib/types';
import { COMMON_EXCLUSIONS } from '../exclusions';

/**
 * KB국민 탄탄대로 Miz&Mr 티타늄카드
 *
 * **통합 한도가 아니라 영역별 한도 6개**로 굴러간다.
 * 마케팅의 "월 최대 10만원"은 2구간 영역 한도의 합계다.
 *
 *   Trendy 서비스                      40만    80만
 *   ─────────────────────────────────────────────
 *   미용·화장품 / 스포츠·골프 / 결혼·가전  20%   15,000  20,000
 *   SPA패션 / 식품배송 / 인테리어         20%   15,000  20,000
 *
 *   Daily 서비스
 *   ─────────────────────────────────────────────
 *   커피·베이커리·아이스크림 (건당 2만↑)  10%   10,000  15,000
 *   대중교통·택시 10% + 주유 100원/ℓ           10,000  15,000
 *   백화점 / 편의점                      10%   10,000  15,000
 *   대형마트 / 약국                       5%   10,000  15,000
 *                                        ───────────────────
 *                                            70,000 100,000
 *
 * ⚠️ 실적 함정 — **Trendy 서비스 할인을 받은 거래는 실적에서 통째로 빠진다.**
 *    약관 "이용실적 제외 대상: 'Trendy서비스' 받은 이용건(해당 매출 전체)".
 *    20% 할인 12만원짜리 결제 한 건이 실적 12만원을 통째로 날린다.
 *    40만/80만 구간이 걸린 문제라 performance.excludeBenefitedGroups로
 *    반영한다. 할인은 그대로 받고, 빠지는 건 실적뿐이다.
 *
 *    **Daily 서비스는 해당 없다.** 약관의 제외 문구는 'Trendy서비스'만
 *    가리킨다. 그래서 주유·대중교통·커피·백화점·편의점·마트에서 할인을
 *    받아도 결제액은 실적에 그대로 남는다.
 *
 *      주유 6만원 → 리터당 100원 할인(≈3,500원)을 받고도 실적 6만원 인정
 *      헤어살롱 6만원 → 20% 할인(12,000원)을 받는 대신 실적 0원
 *
 *    같은 6만원인데 실적 기여가 정반대다. 어느 쪽인지는 아래 각 룰의
 *    `excludesPerformanceSpend` 주석에 못 박아 둔다 — 코드에서 이걸 아는
 *    유일한 근거가 `excludeBenefitedGroups` 배열 하나라, 룰을 추가하면서
 *    배열을 안 건드리면 조용히 틀린 실적이 나온다.
 *
 *    ⚠️ 무승인 전표(대중교통·택시)는 **다른 이유로** 실적에서 빠진다.
 *       혜택을 받아서가 아니라 전표 종류가 그래서다. 둘을 섞지 말 것.
 *
 * 대상 가맹점이 **열거식**이다. 일반 브랜드 묶음을 쓰면 과다 계상된다.
 *   편의점   GS25, CU만            (세븐일레븐·이마트24 제외)
 *   백화점   신세계·롯데·현대만
 *   대형마트 이마트·롯데마트·홈플러스만 (SSM·코스트코 제외)
 *   주유     SK·GS칼텍스만
 *   SPA패션  ZARA·H&M·유니클로만
 *   식품배송 배달의민족·더반찬·마켓컬리만
 *   인테리어 IKEA·MUJI·까사미아만
 *
 * 출처: KB국민카드 공식 상품 안내 전문 (사용자 제공)
 */

/** Trendy 서비스 공통 한도 */
const TRENDY_CAP: TierCap[] = [
  { threshold: 0, cap: 0 },
  { threshold: 400_000, cap: 15_000 },
  { threshold: 800_000, cap: 20_000 },
];

/** Daily 서비스 공통 한도 */
const DAILY_CAP: TierCap[] = [
  { threshold: 0, cap: 0 },
  { threshold: 400_000, cap: 10_000 },
  { threshold: 800_000, cap: 15_000 },
];

/** 대중교통·택시와 주유가 한 한도를 나눠 쓴다 */
const TRANSIT_GROUP = 'tt-daily-transit';

/**
 * 주유 할인은 **리터당 100원**이라 결제금액 비율로 표현할 수 없다.
 * 리터 수를 알 방법이 없으므로 기준유가를 가정해 환산한다.
 * 유가가 움직이면 이 값도 움직인다 — 그래서 'estimated'로 표시한다.
 */
const ASSUMED_FUEL_PRICE_PER_L = 1_700;
const FUEL_RATE = 100 / ASSUMED_FUEL_PRICE_PER_L; // ≈ 5.9%

export const KB_TANTANDAERO: Card = {
  id: 'kb-tantandaero',
  notionOption: '탄탄대로 Miz&Mr',
  issuer: '국민',
  name: 'KB국민 탄탄대로 Miz&Mr 티타늄카드',
  shortName: '탄탄대로',
  last4: ['6089'],
  active: true,
  annualFee: 30_000, // JCB·Master 모두 3만원
  slot: 1,
  productPageUrl: 'https://m.kbcard.com/CXHIACRC0002.cms?allianceCode=09230&mainCC=b',

  performance: {
    required: true,
    countsForeignSpend: true,
    installmentPolicy: 'full',
    tierConfidence: 'confirmed',
    // Trendy 할인을 받은 거래는 실적에서 통째로 빠진다 (약관 명시).
    // Daily 서비스(커피·교통·주유·백화점·편의점·마트)는 여기 없다 —
    // 약관의 제외 대상이 'Trendy서비스'로 한정돼 있기 때문이다.
    // 넣고 빼는 판단은 반드시 약관 문구 기준으로만 한다.
    excludeBenefitedGroups: ['tt-trendy-beauty', 'tt-trendy-spa'],
    tiers: [
      // 통합 한도를 두지 않는다 — 이 카드는 영역별 한도로만 제어된다.
      { threshold: 0, label: '실적 미달', totalBenefitCap: null },
      { threshold: 400_000, label: '40만원', totalBenefitCap: null }, // KB 앱의 '1구간'
      { threshold: 800_000, label: '80만원', totalBenefitCap: null }, // KB 앱의 '2구간'
    ],
    exclusions: COMMON_EXCLUSIONS,
  },

  benefits: [
    // ── Trendy 서비스 20% (영역별 15,000 / 20,000) ─────────────────────
    // 이 두 영역의 할인을 받은 거래는 실적에서 빠진다.
    {
      id: 'tt-trendy-beauty',
      label: '미용·스포츠·결혼 20%',
      type: 'discount',
      rate: 0.2,
      match: {
        keywords: [
          // 미용/화장품: 미용원, 피부미용원, 화장품점
          '미용실', '미용원', '헤어', '네일', '피부관리', '에스테틱', '왁싱', '화장품',
          // 스포츠/골프: 종합스포츠센터, 스포츠용품점, 골프장, 골프연습장
          '골프', 'GOLF', '컨트리클럽', '스포츠센터', '스포츠용품',
          // 결혼서비스/가전: 결혼식장, 결혼식서비스업, 가전제품점
          '웨딩', '결혼', '예식장', '하이마트', '전자랜드', '디지털프라자', '베스트샵',
        ],
      },
      capPerMonth: TRENDY_CAP,
      priority: 10,
      confidence: 'confirmed',
      notes: '이 할인을 받은 거래는 실적에서 제외된다',
    },
    {
      id: 'tt-trendy-spa',
      label: 'SPA패션·식품배송·인테리어 20%',
      type: 'discount',
      rate: 0.2,
      match: {
        brands: [
          ...BRAND_GROUPS.TT_SPA,
          ...BRAND_GROUPS.TT_FOOD_DELIVERY,
          ...BRAND_GROUPS.TT_INTERIOR,
        ],
      },
      // 약관: 온라인 쇼핑몰·상품권·건물 내 임대 매장은 할인 제외
      capPerMonth: TRENDY_CAP,
      priority: 10,
      confidence: 'confirmed',
      notes: '이 할인을 받은 거래는 실적에서 제외된다',
    },

    // ── Daily 서비스 (영역별 10,000 / 15,000) ──────────────────────────
    {
      id: 'tt-daily-coffee',
      label: '커피·베이커리·아이스크림 10%',
      type: 'discount',
      rate: 0.1,
      match: {
        brands: [...BRAND_GROUPS.CAFE],
        categories: ['카페'],
        keywords: ['베이커리', '파리바게뜨', '뚜레쥬르', '배스킨라빈스', '설빙', '아이스크림'],
      },
      // 약관: 건당 2만원 이상 이용 시에만 할인
      minAmountPerTx: 20_000,
      capPerMonth: DAILY_CAP,
      priority: 20,
      confidence: 'confirmed',
    },
    {
      id: 'tt-daily-transit',
      label: '대중교통·택시 10%',
      type: 'discount',
      rate: 0.1,
      match: {
        brands: ['TMONEY', 'KAKAO_T', 'UBER_TAXI', 'ITAXI'],
        keywords: ['버스', '지하철', '교통카드', '택시'],
        // 약관: 시외버스·고속버스·모바일 티머니 후불형은 제외
        excludeKeywords: ['시외버스', '고속버스'],
      },
      // 교통요금은 무승인전표라 실적에서는 빠지지만 할인은 나온다.
      applyToExcludedSpend: true,
      capGroup: TRANSIT_GROUP,
      capGroupLabel: '대중교통·택시·주유',
      capPerMonth: DAILY_CAP,
      priority: 20,
      confidence: 'confirmed',
    },
    {
      id: 'tt-daily-fuel',
      label: '주유 리터당 100원',
      type: 'discount',
      // 리터 수를 모르므로 기준유가로 환산한 근사치다.
      rate: FUEL_RATE,
      match: { brands: [...BRAND_GROUPS.TT_FUEL] },
      capGroup: TRANSIT_GROUP,
      capPerMonth: DAILY_CAP,
      priority: 20,
      confidence: 'estimated',
      // 실적은 그대로 인정된다 — Daily 서비스는 약관의 실적 제외 대상이
      // 아니다. 6만원 주유는 할인을 받고도 실적 6만원으로 남는다.
      notes: `리터당 100원 → 기준유가 ${ASSUMED_FUEL_PRICE_PER_L.toLocaleString('ko-KR')}원/ℓ 가정으로 환산. 유가에 따라 달라진다. 실적에는 그대로 인정된다`,
    },
    {
      id: 'tt-daily-dept-cvs',
      label: '백화점·편의점 10%',
      type: 'discount',
      rate: 0.1,
      match: { brands: [...BRAND_GROUPS.TT_DEPT, ...BRAND_GROUPS.TT_CVS] },
      capPerMonth: DAILY_CAP,
      priority: 20,
      confidence: 'confirmed',
    },
    {
      id: 'tt-daily-mart-pharmacy',
      label: '대형마트·약국 5%',
      type: 'discount',
      rate: 0.05,
      match: {
        brands: [...BRAND_GROUPS.TT_MART],
        keywords: ['약국'],
        // 약관: SSM(이마트에브리데이·홈플러스익스프레스·롯데슈퍼) 제외
        excludeKeywords: ['에브리데이', '익스프레스', '롯데슈퍼'],
      },
      capPerMonth: DAILY_CAP,
      priority: 30,
      confidence: 'confirmed',
    },
  ],
};
