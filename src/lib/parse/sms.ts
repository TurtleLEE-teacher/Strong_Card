/**
 * 카드사 승인 문자(SMS/이메일) 원문 파서.
 *
 * Notion의 `카드명` 속성은 카드사 단위(국민/신한/…)라서 같은 카드사의
 * 카드 2장을 구분하지 못한다. 원문에 박혀 있는 **카드 뒤 4자리**만이
 * 카드 상품을 특정할 수 있는 유일한 단서다.
 *
 * 실제 관측된 포맷:
 *   <제목: KB국민카드6089 승인>
 *   KB국민카드6089
 *   승인
 *   2,500 원(일시불)
 *   (주)아방가르드(아방
 *   고객명 이*석님
 *   승인시각 07/30 10:32
 *   누적 2,040,509원
 *
 *   [Web발신]
 *   삼성2055해외승인 이*석
 *   USD 22.00
 *   07/02 09:06 ANTHROPIC,PBC
 */

import type { Currency } from '@/lib/types';

const ISSUER_TOKENS = [
  'KB국민카드', 'KB국민', '국민카드', '국민',
  '신한카드', '신한',
  '삼성카드', '삼성',
  '현대카드', '현대',
  '하나카드', '하나',
  '우리카드', '우리',
  '롯데카드', '롯데',
  'BC카드', 'BC',
];

/**
 * 원문에서 카드 뒤 4자리를 뽑는다.
 *
 * 우선순위:
 *   1. 카드사명 바로 뒤 4자리 (가장 신뢰도 높음)
 *   2. 마스킹 뒤 4자리 (****1234, 1234-****-****-5678)
 *   3. '카드' 키워드 근처 4자리
 *
 * 못 찾으면 null. 이 경우 카드 상품 매핑이 '미매핑'으로 남고
 * 대시보드에 노출되므로 조용히 사라지지 않는다.
 */
export function extractLast4(rawMessage: string | null | undefined): string | null {
  if (!rawMessage) return null;
  const text = rawMessage.replace(/\s+/g, ' ');

  // 1. 카드사명 + 4자리
  for (const token of ISSUER_TOKENS) {
    const re = new RegExp(`${escapeRegExp(token)}\\s*[(\\[*-]?\\s*(\\d{4})(?!\\d)`);
    const m = text.match(re);
    if (m) return m[1];
  }

  // 2. 마스킹 뒤 4자리
  const masked = text.match(/[*x]{2,}\s*[-\s]?\s*(\d{4})(?!\d)/i);
  if (masked) return masked[1];

  // 3. '카드' 키워드 뒤 4자리
  const nearCard = text.match(/카드\s*[(\[*-]?\s*(\d{4})(?!\d)/);
  if (nearCard) return nearCard[1];

  return null;
}

/**
 * 승인번호에서 카드 뒤 4자리를 뽑는다 (원문 파싱 실패 시 백업 경로).
 * 자동화가 만든 합성키 포맷: `KB-6089-N-07301032-2500`
 */
export function extractLast4FromApprovalNo(approvalNo: string | null | undefined): string | null {
  if (!approvalNo) return null;
  const m = approvalNo.match(/^[A-Z]{2,3}-(\d{4})-/);
  return m ? m[1] : null;
}

/**
 * 카드사가 문자에 찍어주는 공식 누적 이용금액.
 *
 * 이건 우리 계산의 **정답지**다. 우리가 계산한 실적과 대조하면
 * 실적 제외 규칙이 틀렸는지 즉시 드러난다.
 * 예: `누적 2,040,509원`
 */
export function extractIssuerCumulative(rawMessage: string | null | undefined): number | null {
  if (!rawMessage) return null;
  const m = rawMessage.match(/누적\s*([\d,]+)\s*원/);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

const CURRENCY_TOKENS: Record<string, Currency> = {
  USD: 'USD', $: 'USD',
  JPY: 'JPY', '¥': 'JPY',
  EUR: 'EUR', '€': 'EUR',
  KRW: 'KRW', '원': 'KRW',
};

/**
 * 해외승인 문자에서 통화를 뽑는다. 예: `USD 22.00`
 * Notion `통화` 속성이 비어 있을 때의 폴백.
 */
export function extractCurrency(rawMessage: string | null | undefined): Currency | null {
  if (!rawMessage) return null;
  const m = rawMessage.match(/\b(USD|JPY|EUR|KRW)\b/);
  if (m) return CURRENCY_TOKENS[m[1]];
  return null;
}

/** 해외 승인 문자인지 */
export function isForeignApproval(rawMessage: string | null | undefined): boolean {
  if (!rawMessage) return false;
  return /해외\s*승인|해외이용|OVERSEAS/i.test(rawMessage);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
