/**
 * 가맹점명 → 브랜드 정규화 사전.
 *
 * 카드사 승인 문자의 가맹점명은 지저분하다.
 *   '(주)아방가르드(아방'   ← 사업자 형태 + 잘림
 *   '스타벅스*강남점'        ← 지점 구분자
 *   '이디야커피 역삼2호점'
 *
 * 그래서 2단계로 처리한다.
 *   1) normalizeMerchant(): 잡음 제거
 *   2) resolveBrand():      별칭 사전으로 브랜드 키 확정
 *
 * 매칭에 실패하면 null을 돌려주고, 앱은 그 거래를 '미분류'로 노출한다.
 * 미분류를 조용히 삼키면 혜택 누락을 영원히 못 찾는다.
 */

/** 브랜드 키 → 별칭 목록 (정규화된 형태로 적을 것) */
export const BRAND_ALIASES: Record<string, string[]> = {
  // 카페
  STARBUCKS: ['스타벅스', 'STARBUCKS', '스타벅스코리아'],
  EDIYA: ['이디야', '이디야커피', 'EDIYA'],
  TWOSOME: ['투썸플레이스', '투썸', 'TWOSOME'],
  MEGA_COFFEE: ['메가엠지씨커피', '메가커피', 'MEGAMGC'],
  COMPOSE: ['컴포즈커피', '컴포즈'],
  PAIK_COFFEE: ['빽다방'],

  // 편의점
  CU: ['CU', '씨유', 'BGF리테일'],
  GS25: ['GS25', 'GS리테일'],
  SEVEN_ELEVEN: ['세븐일레븐', '코리아세븐'],
  EMART24: ['이마트24'],

  // 배달
  BAEMIN: ['배달의민족', '우아한형제들', '배민'],
  COUPANG_EATS: ['쿠팡이츠'],
  YOGIYO: ['요기요'],

  // 쿠팡
  COUPANG: ['쿠팡', 'COUPANG', '쿠팡페이'],
  COUPANG_PLAY: ['쿠팡플레이'],

  // 대형마트·백화점
  EMART: ['이마트'],
  HOMEPLUS: ['홈플러스'],
  LOTTE_MART: ['롯데마트'],
  SHINSEGAE_DEPT: ['신세계백화점'],
  LOTTE_DEPT: ['롯데백화점'],
  HYUNDAI_DEPT: ['현대백화점'],

  // OTT·구독
  NETFLIX: ['NETFLIX', '넷플릭스'],
  DISNEY_PLUS: ['DISNEY', '디즈니플러스'],
  WATCHA: ['왓챠', 'WATCHA'],
  TVING: ['티빙', 'TVING'],
  WAVVE: ['웨이브', 'WAVVE'],
  YOUTUBE_PREMIUM: ['GOOGLEYOUTUBE', 'YOUTUBEPREMIUM'],
  SPOTIFY: ['SPOTIFY', '스포티파이'],

  // 교통
  KORAIL: ['코레일', '한국철도공사'],
  TMONEY: ['티머니', 'TMONEY'],
  KAKAO_T: ['카카오T', '카카오모빌리티'],

  // 주유
  SK_ENERGY: ['SK에너지', 'SK주유소'],
  GS_CALTEX: ['GS칼텍스'],
  HYUNDAI_OILBANK: ['현대오일뱅크', 'HD현대오일뱅크'],
  S_OIL: ['S-OIL', 'SOIL', '에쓰오일'],

  // 전기차 충전
  EV_CHARGE_ENVIRONMENT: ['환경부전기차충전', '한국환경공단'],
  EV_CHARGE_KEPCO: ['한국전력', 'KEPCO충전'],
  EV_CHARGE_CHAEVI: ['차지비', 'CHAEVI'],
  EV_CHARGE_EVERON: ['에버온', 'EVERON'],
  EV_CHARGE_HAEVICHI: ['해피차저'],
  EV_CHARGE_SK: ['SK일렉링크', '일렉링크'],
  EV_CHARGE_GS: ['GS차지비', '지앤이비즈'],
  EV_CHARGE_TESLA: ['TESLA', '테슬라수퍼차저'],

  // 통신
  SKT: ['SK텔레콤', 'SKT'],
  KT: ['KT', '케이티'],
  LGU: ['LG유플러스', 'LGU+'],

  // 하이패스
  HIPASS: ['하이패스', '한국도로공사'],
};

/**
 * 제거할 사업자 형태 접두·접미.
 * normalizeMerchant()가 참조하므로 아래 ALIAS_TO_BRAND 생성보다 먼저 선언해야 한다.
 */
const BUSINESS_FORMS = [
  '주식회사', '유한회사', '합자회사', '농업회사법인', '사회복지법인',
  '(주)', '（주）', '㈜', '(유)', '(사)', '(재)',
];

/** 별칭 → 브랜드 키 역인덱스 (모듈 로드 시 1회 생성) */
const ALIAS_TO_BRAND: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [brand, aliases] of Object.entries(BRAND_ALIASES)) {
    for (const alias of aliases) {
      map.set(normalizeMerchant(alias), brand);
    }
  }
  return map;
})();

/**
 * 가맹점명에서 잡음을 제거한다.
 * - 사업자 형태, 괄호 내용, 지점 구분자, 공백, 특수문자 제거
 * - 영문 대문자로 통일
 *
 * '(주)아방가르드(아방' → '아방가르드'
 * '스타벅스*강남점'      → '스타벅스강남점'
 */
export function normalizeMerchant(raw: string): string {
  let s = raw.trim();

  for (const form of BUSINESS_FORMS) {
    s = s.split(form).join('');
  }

  // 괄호와 그 내용 제거. 승인 문자는 가맹점명이 잘려서 닫는 괄호가 없는 경우가 잦으므로
  // 닫히지 않은 여는 괄호 이후도 통째로 버린다.
  s = s.replace(/\([^)]*\)/g, '');
  s = s.replace(/\([^)]*$/, '');

  // 구분자·공백·특수문자 제거
  s = s.replace(/[\s*_\-.,/\\|#]/g, '');

  return s.toUpperCase();
}

/**
 * 정규화된 가맹점명에서 브랜드 키를 찾는다.
 * 완전일치 → 접두일치 → 부분일치 순으로 시도한다.
 * 못 찾으면 null (= 미분류).
 */
export function resolveBrand(rawMerchant: string | null | undefined): string | null {
  if (!rawMerchant) return null;
  const normalized = normalizeMerchant(rawMerchant);
  if (!normalized) return null;

  const exact = ALIAS_TO_BRAND.get(normalized);
  if (exact) return exact;

  // 접두일치를 부분일치보다 먼저 본다.
  // '스타벅스강남점'은 '스타벅스'로 시작하므로 STARBUCKS.
  let prefixHit: string | null = null;
  let prefixLen = 0;
  let containsHit: string | null = null;
  let containsLen = 0;

  for (const [alias, brand] of ALIAS_TO_BRAND) {
    if (alias.length < 2) continue;
    if (normalized.startsWith(alias) && alias.length > prefixLen) {
      prefixHit = brand;
      prefixLen = alias.length;
    } else if (normalized.includes(alias) && alias.length > containsLen) {
      containsHit = brand;
      containsLen = alias.length;
    }
  }

  return prefixHit ?? containsHit;
}
