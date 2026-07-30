/**
 * Notion `💳 Card_Transactions` ↔ 앱 도메인 변환.
 *
 * 여기서 하는 가장 중요한 일은 **카드 상품 확정**과 **원화 환산**이다.
 * Notion의 `카드명`은 카드사 단위라 그대로는 못 쓴다.
 *
 * 카드 상품 결정 순서:
 *   1. Notion `카드 상품` 속성 (앱이 이전에 역기입해 둔 값)
 *   2. Notion `카드 뒷4자리` 속성
 *   3. 원문 파싱
 *   4. 승인번호 합성키 파싱
 * 전부 실패하면 null → '미매핑'으로 대시보드에 노출된다.
 */

import type { PageObjectResponse } from '@notionhq/client';
import type { Currency, Issuer, PaymentKind, Transaction, TxCategory } from '@/lib/types';
import { NOTION_OPTION_TO_CARD_ID, resolveCardIdByLast4 } from '@/config/cards';
import { extractIssuerCumulative, extractLast4, extractLast4FromApprovalNo } from '@/lib/parse/sms';
import { toKrw, type FxOptions } from '@/lib/fx';
import { getNotionClient, getTransactionsDataSourceId } from './client';
import { monthRangeUtc, type MonthKey } from '@/lib/date';

// --- Notion 속성 이름 (DB에서 바꾸면 여기도 바꿔야 한다) ---
export const PROP = {
  title: '사용 내역',
  merchant: '가맹점',
  amount: '금액',
  currency: '통화',
  usedAt: '사용 일시',
  issuer: '카드명',
  cardKind: '카드 종류',
  paymentKind: '결제 구분',
  category: '카테고리',
  canceled: '취소 여부',
  approvalNo: '승인번호',
  rawMessage: '원문',
  installment: '할부 개월',
  // 앱이 추가한 파생 속성
  last4: '카드 뒷4자리',
  cardProduct: '카드 상품',
  krwAmount: '원화금액',
  performanceVerdict: '실적 인정',
  benefitAmount: '혜택 적용액',
  alertStatus: '알림 상태',
} as const;

type Props = PageObjectResponse['properties'];

function plainText(props: Props, name: string): string | null {
  const p = props[name];
  if (!p) return null;
  if (p.type === 'title') return p.title.map((t) => t.plain_text).join('') || null;
  if (p.type === 'rich_text') return p.rich_text.map((t) => t.plain_text).join('') || null;
  return null;
}

function numberValue(props: Props, name: string): number | null {
  const p = props[name];
  return p && p.type === 'number' ? p.number : null;
}

function selectValue(props: Props, name: string): string | null {
  const p = props[name];
  return p && p.type === 'select' ? (p.select?.name ?? null) : null;
}

function checkboxValue(props: Props, name: string): boolean {
  const p = props[name];
  return p && p.type === 'checkbox' ? p.checkbox : false;
}

function dateStart(props: Props, name: string): string | null {
  const p = props[name];
  return p && p.type === 'date' ? (p.date?.start ?? null) : null;
}

/**
 * Notion 페이지 → Transaction.
 * 필수값(사용 일시)이 없으면 null을 돌려 조용히 건너뛴다.
 */
export function toTransaction(page: PageObjectResponse, fx: FxOptions = {}): Transaction | null {
  const props = page.properties;

  const approvedAt = dateStart(props, PROP.usedAt);
  if (!approvedAt) return null;

  const rawMessage = plainText(props, PROP.rawMessage);
  const approvalNo = plainText(props, PROP.approvalNo);

  // 카드 뒷4자리: 저장된 값 → 원문 → 승인번호 순으로 시도
  const last4 =
    plainText(props, PROP.last4) ??
    extractLast4(rawMessage) ??
    extractLast4FromApprovalNo(approvalNo);

  // 카드 상품: 저장된 select → 뒷4자리 매핑
  const storedProduct = selectValue(props, PROP.cardProduct);
  const cardId =
    (storedProduct && storedProduct !== '미매핑'
      ? (NOTION_OPTION_TO_CARD_ID[storedProduct] ?? null)
      : null) ?? resolveCardIdByLast4(last4);

  const rawAmount = numberValue(props, PROP.amount) ?? 0;
  const currency = (selectValue(props, PROP.currency) as Currency | null) ?? 'KRW';

  // 원화금액: 저장된 값이 있으면 그대로 신뢰(카드사 청구액을 수동 보정했을 수 있다),
  // 없으면 환산한다.
  const krwAmount = numberValue(props, PROP.krwAmount) ?? toKrw(rawAmount, currency, fx);

  return {
    id: page.id,
    title: plainText(props, PROP.title) ?? '(제목 없음)',
    merchant: plainText(props, PROP.merchant),
    rawAmount,
    currency,
    krwAmount,
    approvedAt: new Date(approvedAt).toISOString(),
    issuer: selectValue(props, PROP.issuer) as Issuer | null,
    last4,
    cardId,
    category: selectValue(props, PROP.category) as TxCategory | null,
    paymentKind: selectValue(props, PROP.paymentKind) as PaymentKind | null,
    installmentMonths: numberValue(props, PROP.installment),
    canceled: checkboxValue(props, PROP.canceled),
    rawMessage,
    issuerCumulative: extractIssuerCumulative(rawMessage),
  };
}

/**
 * 특정 기간의 거래를 모두 가져온다 (페이지네이션 포함).
 *
 * Notion API는 3 req/s로 제한된다. 월 단위로 한 번에 긁고 캐싱하는 전제이므로
 * 화면마다 호출하지 말 것.
 */
export async function fetchTransactionsBetween(
  startUtc: Date,
  endUtc: Date,
  fx: FxOptions = {},
): Promise<Transaction[]> {
  const notion = getNotionClient();
  const dataSourceId = getTransactionsDataSourceId();

  const results: Transaction[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
      filter: {
        and: [
          { property: PROP.usedAt, date: { on_or_after: startUtc.toISOString() } },
          { property: PROP.usedAt, date: { before: endUtc.toISOString() } },
        ],
      },
      sorts: [{ property: PROP.usedAt, direction: 'ascending' }],
    });

    for (const page of response.results) {
      if (!('properties' in page)) continue;
      const tx = toTransaction(page as PageObjectResponse, fx);
      if (tx) results.push(tx);
    }

    cursor = response.next_cursor ?? undefined;
  } while (cursor);

  return results;
}

/**
 * 대시보드에 필요한 범위를 한 번에 가져온다.
 * 이번 달 혜택 한도는 지난달 실적으로 정해지므로 **두 달치**가 필요하다.
 */
export async function fetchTransactionsForMonth(
  month: MonthKey,
  fx: FxOptions = {},
): Promise<Transaction[]> {
  const { startUtc: prevStart } = monthRangeUtc(previousMonth(month));
  const { endUtc } = monthRangeUtc(month);
  return fetchTransactionsBetween(prevStart, endUtc, fx);
}

function previousMonth(month: MonthKey): MonthKey {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// 역기입 — 앱이 계산한 파생값을 Notion에 되돌려 쓴다
// ---------------------------------------------------------------------------

export interface DerivedFields {
  last4?: string | null;
  cardProduct?: string | null;
  krwAmount?: number | null;
  performanceVerdict?: string | null;
  benefitAmount?: number | null;
  alertStatus?: string | null;
}

/**
 * 계산 결과를 Notion 거래 행에 기록한다.
 * 이걸 해두면 Notion에서도 카드별로 필터링이 되고, 룰이 왜 그렇게
 * 판정했는지 노션 화면에서 바로 확인할 수 있다.
 */
export async function writeDerivedFields(pageId: string, fields: DerivedFields): Promise<void> {
  const notion = getNotionClient();
  const properties: Record<string, unknown> = {};

  if (fields.last4 !== undefined) {
    properties[PROP.last4] = {
      rich_text: fields.last4 ? [{ text: { content: fields.last4 } }] : [],
    };
  }
  if (fields.cardProduct !== undefined) {
    properties[PROP.cardProduct] = {
      select: fields.cardProduct ? { name: fields.cardProduct } : null,
    };
  }
  if (fields.krwAmount !== undefined) {
    properties[PROP.krwAmount] = { number: fields.krwAmount };
  }
  if (fields.performanceVerdict !== undefined) {
    properties[PROP.performanceVerdict] = {
      select: fields.performanceVerdict ? { name: fields.performanceVerdict } : null,
    };
  }
  if (fields.benefitAmount !== undefined) {
    properties[PROP.benefitAmount] = { number: fields.benefitAmount };
  }
  if (fields.alertStatus !== undefined) {
    properties[PROP.alertStatus] = {
      select: fields.alertStatus ? { name: fields.alertStatus } : null,
    };
  }

  if (Object.keys(properties).length === 0) return;

  await notion.pages.update({
    page_id: pageId,
    // SDK 타입이 속성별 union이라 여기서만 느슨하게 넘긴다.
    properties: properties as never,
  });
}
