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

  // 패밀리레스토랑·뷔페 (신한 Time Plan 음식점 영역의 양식·뷔페 업종)
  OUTBACK: ['아웃백스테이크하우스', '아웃백', 'OUTBACK'],
  VIPS: ['빕스', 'VIPS'],
  ASHLEY: ['애슐리퀸즈', '애슐리'],
  TGIF: ['TGI프라이데이스', '티지아이프라이데이스', 'TGIF'],
  MADFORGARLIC: ['매드포갈릭'],

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
  /*
   * 상호에 정유사 이름이 없는 주유소.
   *
   * 주유소는 대부분 개인 사업자라 간판 브랜드(폴)와 상호가 따로 논다 —
   * '판교서일주유소'는 GS칼텍스 폴이지만 이름 어디에도 GS가 없다. 이런
   * 이름에서 **업종이 주유소라는 것까지는** 확실히 알 수 있고, **어느
   * 정유사인지는 이름만으로 절대 알 수 없다.** 그래서 둘을 분리한다.
   *   - 업종만 필요한 혜택(현대 ZERO 생활필수) → 이 브랜드로 걸린다
   *   - 정유사를 가리는 혜택(탄탄대로 SK·GS만) → MERCHANT_BRAND_OVERRIDES로
   *     사용자가 폴을 알려줘야 한다. 추측으로 붙이면 S-OIL 주유소에까지
   *     할인이 붙어 과다 계상된다.
   */
  FUEL_UNBRANDED: ['주유소', '셀프주유'],

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
  // '이마트몰'은 SSG.COM으로 통합됐다. 여기 없으면 접두일치로 EMART(마트
  // 영역)에 붙는데, 신한 Discount Plan 약관은 마트 영역을 **오프라인 매장
  // 이용 시에만** 할인한다고 못 박는다. 금액은 같아도(둘 다 10%) 일 1회·
  // 월 5회 횟수가 엉뚱한 영역에서 깎인다. 완전일치가 접두일치를 이기므로
  // 여기 적어 두면 온라인쇼핑 영역으로 간다.
  SSG: ['SSG닷컴', 'SSG.COM', '쓱닷컴', '에스에스지', '이마트몰'],
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

  // ── 삼성 Amex Blue 약관에 열거된 가맹점 ──────────────────────────────
  // 쇼핑 1.5%는 '온라인 간편결제 수단'이 대상이라 가맹점이 아니라 결제수단이
  // 찍힌다. 문자에 그 이름이 남는 경우가 많아 브랜드로 잡는다.
  SAMSUNG_PAY: ['삼성페이', 'SAMSUNGPAY', '삼성월렛'],
  PAYCO: ['PAYCO', '페이코'],
  SMILEPAY: ['스마일페이', 'SMILEPAY'],
  COUPAY: ['coupay', '쿠페이', '쿠팡페이'],
  SSGPAY: ['SSGPAY', 'SSG페이', '쓱페이'],
  LPAY: ['L.pay', 'LPAY', '엘페이'],
  SHINSEGAE_SIMON: ['신세계사이먼', '사이먼프리미엄아울렛'],
  HYUNDAI_OUTLET: ['현대프리미엄아울렛', '현대아울렛'],
  EIGHT_SECONDS: ['8SECONDS', '에이트세컨즈', '에잇세컨즈'],

  // ── 탄탄대로 약관에 열거된 가맹점 ────────────────────────────────────
  // 약관이 "SPA패션: ZARA, H&M, 유니클로"처럼 **열거식**이라 그대로 넣는다.
  ZARA: ['ZARA', '자라'],
  H_AND_M: ['H&M', 'HM', '에이치앤엠'],
  UNIQLO: ['UNIQLO', '유니클로'],
  DABANCHAN: ['더반찬'],
  IKEA: ['IKEA', '이케아'],
  MUJI: ['MUJI', '무인양품'],
  CASAMIA: ['까사미아', 'CASAMIA'],
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
  /*
   * 음식점.
   *
   * 신한 Discount Plan Time Plan의 음식점 영역은 **브랜드 열거가 아니라
   * 업종 기준**이다 — 한식·일식·양식·중식·일반대중음식·패스트푸드·뷔페.
   * 그래서 카드 룰은 카테고리('식비') 폴백을 함께 쓴다.
   *
   * 그래도 브랜드를 적어 두는 이유는, Notion 카테고리가 비어 있을 때
   * 가맹점명만으로도 걸리게 하기 위해서다. 예전에는 패스트푸드만 있어서
   * 아웃백·빕스 같은 패밀리레스토랑이 카테고리 없이는 '대상 가맹점 아님'
   * 으로 떨어졌다 — 업종상 명백한 대상인데도.
   */
  DINING: [
    'MCDONALDS', 'BURGERKING', 'LOTTERIA', 'MOMSTOUCH', 'SUBWAY', 'KFC',
    'NOBRANDBURGER', 'BHC', 'BBQ', 'KYOCHON', 'GOOBNE', 'PIZZAHUT', 'DOMINO',
    // 패밀리레스토랑·뷔페 (양식/뷔페 업종)
    'OUTBACK', 'VIPS', 'ASHLEY', 'TGIF', 'MADFORGARLIC',
  ],
  MART: ['EMART', 'HOMEPLUS', 'LOTTE_MART', 'COSTCO', 'NONGHYUP_HANARO'],
  DEPARTMENT: [
    'SHINSEGAE_DEPT', 'LOTTE_DEPT', 'HYUNDAI_DEPT', 'GALLERIA', 'AKPLAZA', 'STARFIELD',
  ],
  /*
   * 주유 **업종** 전체. 정유사를 가리지 않는 혜택에만 쓴다(현대 ZERO 생활필수).
   * FUEL_UNBRANDED가 들어 있으므로, 정유사를 열거하는 약관에는 쓰면 안 된다 —
   * 그런 카드는 TT_FUEL처럼 브랜드를 직접 적는다.
   */
  FUEL: ['SK_ENERGY', 'GS_CALTEX', 'HYUNDAI_OILBANK', 'S_OIL', 'ALTTEUL', 'FUEL_UNBRANDED'],
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

  /*
   * ── 삼성 Amex Blue 전용 묶음 ──────────────────────────────────────
   * 약관이 대상점을 열거한다. 일반 묶음을 쓰면 대상이 아닌 곳까지 붙는다.
   *   대중교통  버스·지하철만 (TRANSIT에 든 택시·KTX는 대상이 아니다)
   *   스트리밍  6곳만 (SUBSCRIPTION 14곳을 쓰면 과다 계상)
   *   쇼핑     간편결제 수단 · 프리미엄아울렛 · 트렌디패션
   */
  AB_TRANSIT: ['TMONEY'],
  AB_STREAMING: ['NETFLIX', 'WAVVE', 'TVING', 'WATCHA', 'MELON', 'FLO'],
  AB_EASY_PAY: [
    'SAMSUNG_PAY', 'NAVERPAY', 'KAKAOPAY', 'PAYCO', 'SMILEPAY',
    'COUPAY', 'SSGPAY', 'LPAY',
  ],
  AB_OUTLET: ['SHINSEGAE_SIMON', 'HYUNDAI_OUTLET'],
  AB_TRENDY_FASHION: ['ZARA', 'H_AND_M', 'EIGHT_SECONDS'],

  /*
   * ── 탄탄대로 전용 묶음 ────────────────────────────────────────────
   * 약관이 가맹점을 **열거**한다. 일반 묶음(CONVENIENCE 5곳, MART 5곳)을
   * 그대로 쓰면 대상이 아닌 곳까지 할인이 붙어 과다 계상된다.
   *   편의점  GS25, CU만            (세븐일레븐·이마트24·미니스톱 제외)
   *   대형마트 이마트·롯데마트·홈플러스만 (코스트코·하나로마트 제외, SSM 제외)
   *   주유    SK·GS칼텍스만          (S-OIL·현대오일뱅크 제외)
   */
  TT_CVS: ['GS25', 'CU'],
  TT_DEPT: ['SHINSEGAE_DEPT', 'LOTTE_DEPT', 'HYUNDAI_DEPT'],
  TT_MART: ['EMART', 'LOTTE_MART', 'HOMEPLUS'],
  TT_FUEL: ['SK_ENERGY', 'GS_CALTEX'],
  TT_SPA: ['ZARA', 'H_AND_M', 'UNIQLO'],
  TT_FOOD_DELIVERY: ['BAEMIN', 'DABANCHAN', 'KURLY'],
  TT_INTERIOR: ['IKEA', 'MUJI', 'CASAMIA'],
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

/**
 * 이름만으로는 브랜드를 알 수 없는 **개별 가맹점** → 브랜드 확정.
 *
 * 별칭 사전(BRAND_ALIASES)은 "이 문자열이 그 브랜드를 가리킨다"는 일반 규칙이다.
 * 여기는 다르다 — "이 가게가 그 브랜드다"라는 **사용자가 직접 가서 보고 아는
 * 사실**을 적는다. 자영 주유소·프랜차이즈 가맹점이 상호를 따로 쓰는 경우가
 * 그렇고, 사전을 아무리 키워도 맞힐 수 없다.
 *
 * 적어 두지 않으면 그 가맹점은 영원히 '미분류'로 남아 혜택 판정에서 빠진다
 * (실적 금액에는 그대로 들어간다 — 혜택만 못 받는다).
 *
 * 값은 BRAND_ALIASES의 브랜드 키여야 한다. 오타는 아래 테스트가 잡는다.
 */
export const MERCHANT_BRAND_OVERRIDES: Record<string, string> = {
  // 판교 서일주유소 — 상호에 없지만 GS칼텍스 폴이다 (사용자 확인, 2026-08)
  판교서일주유소: 'GS_CALTEX',
  서일주유소: 'GS_CALTEX',
};

/** 별칭 → 브랜드 키 역인덱스 (모듈 로드 시 1회 생성) */
const ALIAS_TO_BRAND: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [brand, aliases] of Object.entries(BRAND_ALIASES)) {
    for (const alias of aliases) {
      map.set(normalizeMerchant(alias), brand);
    }
  }
  // 개별 가맹점 지정이 일반 별칭을 이긴다. '서일주유소'는 일반 규칙으로는
  // FUEL_UNBRANDED지만, 폴을 아는 이상 GS칼텍스로 봐야 맞다.
  for (const [merchant, brand] of Object.entries(MERCHANT_BRAND_OVERRIDES)) {
    map.set(normalizeMerchant(merchant), brand);
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
 * 브랜드 키를 사람이 읽는 이름으로. 첫 별칭이 대표 표기다.
 * 화면에 'GS_CALTEX'가 그대로 나가면 앱이 내부 사정을 떠드는 꼴이 된다.
 */
export function brandDisplayName(brand: string): string {
  return BRAND_ALIASES[brand]?.[0] ?? brand;
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
