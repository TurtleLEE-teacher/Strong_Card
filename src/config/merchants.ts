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
  PAULBASSETT: ['폴바셋', 'PAULBASSETT'],

  // 편의점
  CU: ['CU', '씨유', 'BGF리테일'],
  GS25: ['GS25', 'GS리테일'],
  SEVEN_ELEVEN: ['세븐일레븐', '코리아세븐'],
  EMART24: ['이마트24'],

  // 배달
  BAEMIN: ['배달의민족', '우아한형제들', '배민'],
  COUPANG_EATS: ['쿠팡이츠'],
  YOGIYO: ['요기요'],
  DDANGYO: ['땡겨요'],

  // 쿠팡
  COUPANG: ['쿠팡', 'COUPANG', '쿠팡페이'],
  COUPANG_PLAY: ['쿠팡플레이'],

  // 대형마트·백화점
  EMART: ['이마트'],
  TRADERS: ['트레이더스', '이마트트레이더스'],
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
  SOCAR: ['쏘카', 'SOCAR'],

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

  // 카페 (추가)
  HOLLYS: ['할리스', 'HOLLYS'],
  ANGELINUS: ['엔제리너스'],
  TOMNTOMS: ['탐앤탐스', 'TOMNTOMS'],
  COFFEEBEAN: ['커피빈', 'COFFEEBEAN'],
  GONGCHA: ['공차', 'GONGCHA'],
  MAMMOTH: ['매머드커피', '매머드익스프레스'],
  BANAPRESSO: ['바나프레소'],
  DROPTOP: ['드롭탑'],

  // 패스트푸드·외식
  MCDONALDS: ['맥도날드', 'MCDONALDS'],
  BURGERKING: ['버거킹', 'BURGERKING'],
  LOTTERIA: ['롯데리아'],
  MOMSTOUCH: ['맘스터치'],
  SUBWAY: ['써브웨이', 'SUBWAY'],
  KFC: ['KFC'],
  NOBRANDBURGER: ['노브랜드버거'],
  BHC: ['BHC', '비에이치씨'],
  BBQ: ['BBQ'],
  KYOCHON: ['교촌치킨', '교촌'],
  GOOBNE: ['굽네치킨', '굽네'],
  PIZZAHUT: ['피자헛'],
  DOMINO: ['도미노피자', '도미노'],

  // 편의점 (추가)
  MINISTOP: ['미니스톱'],

  // 마트·생활 (추가)
  COSTCO: ['코스트코', 'COSTCO'],
  NONGHYUP_HANARO: ['하나로마트', '농협하나로'],
  DAISO: ['다이소', 'DAISO'],
  OLIVEYOUNG: ['올리브영', 'OLIVEYOUNG'],
  MUSINSA: ['무신사', 'MUSINSA'],
  TWENTYNINECM: ['29CM', '이십구센티미터'],
  NAVER_STORE: ['네이버플러스스토어', '네이버쇼핑', '네이버스토어'],
  SSG: ['SSG닷컴', '에스에스지'],
  GMARKET: ['지마켓', 'GMARKET'],
  ELEVENST: ['11번가'],
  AUCTION: ['옥션', 'AUCTION'],
  NAVERPAY: ['네이버페이', 'NAVERPAY', '네이버파이낸셜'],
  KAKAOPAY: ['카카오페이'],
  ALIEXPRESS: ['ALIEXPRESS', '알리익스프레스'],
  TEMU: ['TEMU', '테무'],

  // 식품배송
  KURLY: ['마켓컬리', '컬리', 'KURLY'],
  OASIS: ['오아시스마켓', '오아시스'],

  // 백화점·아울렛 (추가)
  STARFIELD: ['스타필드'],
  AKPLAZA: ['AK플라자'],
  GALLERIA: ['갤러리아백화점', '갤러리아'],

  // 교통 (추가)
  SRT: ['SRT', '에스알'],
  UBER_TAXI: ['UBER', '우버'],
  ITAXI: ['아이엠택시', 'IM택시'],
  PARKING: ['하이파킹', '아이파킹', '파킹클라우드'],

  // 주유 (추가)
  ALTTEUL: ['알뜰주유소'],

  // 전기차 충전 (추가)
  EV_CHARGE_HYUNDAI: ['이피트', 'E-PIT', '현대이피트'],
  EV_CHARGE_STARKOFF: ['스타코프', 'STARKOFF'],
  EV_CHARGE_PLUGLINK: ['플러그링크'],
  EV_CHARGE_HUMAX: ['휴맥스이브이', '휴맥스EV'],

  // 구독·디지털 (추가)
  APPLE: ['APPLE', '애플', 'ITUNES'],
  GOOGLE: ['GOOGLE', '구글'],
  MICROSOFT: ['MICROSOFT', '마이크로소프트'],
  OPENAI: ['OPENAI'],
  ANTHROPIC: ['ANTHROPIC'],
  MILLIE: ['밀리의서재', '밀리'],
  RIDI: ['리디', 'RIDIBOOKS'],
  MELON: ['멜론', 'MELON'],
  GENIE: ['지니뮤직', 'GENIE'],
  FLO: ['FLO', '플로'],
  CHZZK: ['치지직'],
  LAFTEL: ['라프텔'],
  APPLE_TV: ['APPLETV'],

  // 통신 (추가)
  ALDDLE_PHONE: ['알뜰폰'],

  // 공과금
  KEPCO_BILL: ['한국전력공사', '전기요금'],
  CITY_GAS: ['도시가스', '서울도시가스', '삼천리', '예스코'],
  WATER_BILL: ['상하수도', '수도요금'],
  APT_FEE: ['아파트관리비', '관리사무소'],

  // 의료
  PHARMACY: ['약국'],

  // 여가
  CGV: ['CGV'],
  LOTTE_CINEMA: ['롯데시네마'],
  MEGABOX: ['메가박스', 'MEGABOX'],
  YES24: ['YES24', '예스24'],
  KYOBO: ['교보문고', '교보'],
  ALADIN: ['알라딘'],
};

/**
 * 자주 쓰이는 브랜드 묶음.
 *
 * 카드마다 브랜드 목록을 따로 적으면, 새 가맹점을 추가할 때 한 카드에만
 * 반영되고 나머지는 빠지는 일이 생긴다. 그러면 추천 결과가 조용히 틀린다.
 * 공통 묶음은 여기서 한 번만 정의한다.
 */
export const BRAND_GROUPS = {
  CAFE: [
    'STARBUCKS', 'EDIYA', 'TWOSOME', 'MEGA_COFFEE', 'COMPOSE', 'PAIK_COFFEE',
    'HOLLYS', 'ANGELINUS', 'TOMNTOMS', 'COFFEEBEAN', 'GONGCHA', 'MAMMOTH',
    'BANAPRESSO', 'DROPTOP',
  ],
  CONVENIENCE: ['CU', 'GS25', 'SEVEN_ELEVEN', 'EMART24', 'MINISTOP'],
  DELIVERY: ['BAEMIN', 'COUPANG_EATS', 'YOGIYO'],
  DINING: [
    'MCDONALDS', 'BURGERKING', 'LOTTERIA', 'MOMSTOUCH', 'SUBWAY', 'KFC',
    'NOBRANDBURGER', 'BHC', 'BBQ', 'KYOCHON', 'GOOBNE', 'PIZZAHUT', 'DOMINO',
  ],
  MART: ['EMART', 'HOMEPLUS', 'LOTTE_MART', 'COSTCO', 'NONGHYUP_HANARO'],
  DEPARTMENT: [
    'SHINSEGAE_DEPT', 'LOTTE_DEPT', 'HYUNDAI_DEPT', 'GALLERIA', 'AKPLAZA', 'STARFIELD',
  ],
  FUEL: ['SK_ENERGY', 'GS_CALTEX', 'HYUNDAI_OILBANK', 'S_OIL', 'ALTTEUL'],
  TRANSIT: ['KORAIL', 'SRT', 'TMONEY', 'KAKAO_T', 'UBER_TAXI', 'ITAXI'],
  TELECOM: ['SKT', 'KT', 'LGU', 'ALDDLE_PHONE'],
  /** OTT·음악·도서 등 정기결제 구독 */
  SUBSCRIPTION: [
    'NETFLIX', 'DISNEY_PLUS', 'WATCHA', 'TVING', 'WAVVE', 'YOUTUBE_PREMIUM',
    'SPOTIFY', 'COUPANG_PLAY', 'APPLE_TV', 'LAFTEL', 'MELON', 'GENIE', 'FLO',
    'MILLIE', 'RIDI', 'CHZZK',
  ],
  EV_CHARGE: [
    'EV_CHARGE_ENVIRONMENT', 'EV_CHARGE_KEPCO', 'EV_CHARGE_CHAEVI',
    'EV_CHARGE_EVERON', 'EV_CHARGE_HAEVICHI', 'EV_CHARGE_SK', 'EV_CHARGE_GS',
    'EV_CHARGE_TESLA', 'EV_CHARGE_HYUNDAI', 'EV_CHARGE_STARKOFF',
    'EV_CHARGE_PLUGLINK', 'EV_CHARGE_HUMAX',
  ],
  ONLINE_SHOPPING: [
    'COUPANG', 'SSG', 'GMARKET', 'ELEVENST', 'AUCTION', 'MUSINSA',
    'ALIEXPRESS', 'TEMU', 'NAVERPAY',
  ],
  LIVING: ['DAISO', 'OLIVEYOUNG'],
  FRESH_DELIVERY: ['KURLY', 'OASIS'],
  UTILITY: ['KEPCO_BILL', 'CITY_GAS', 'WATER_BILL', 'APT_FEE'],
  /** 신한 Discount Plan Time Plan 카페 영역 (지정 6개 브랜드만) */
  DP_CAFE: [
    'STARBUCKS', 'TWOSOME', 'PAULBASSETT', 'COFFEEBEAN', 'MEGA_COFFEE', 'EDIYA',
  ],
  /** 신한 Discount Plan Daily Plan 온라인쇼핑 (지정 5개만) */
  DP_ONLINE: ['NAVER_STORE', 'COUPANG', 'SSG', 'MUSINSA', 'TWENTYNINECM'],
  /** 신한 Discount Plan Daily Plan 마트 (창고형·기업형 슈퍼 제외) */
  DP_MART: ['EMART', 'TRADERS', 'LOTTE_MART'],
  /** 온라인서점 */
  BOOKSTORE: ['KYOBO', 'YES24'],
} as const;

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
