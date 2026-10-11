/**
 * 적재 감시용 조회 — 날짜 범위가 아니라 '최근에 무엇이 들어왔나'를 본다.
 *
 * 월 단위 조회(fetchTransactionsBetween)는 `사용 일시`로 거르므로 이 두
 * 가지를 못 본다.
 *   - 적재 시각: 대기열이 풀리면 지난주 결제가 오늘 들어온다
 *   - 파싱 실패 행: `사용 일시`가 비어 있어 어느 달 범위에도 안 걸린다
 */

import type { PageObjectResponse } from '@notionhq/client';
import { PARSE_FAILURE_TITLE, type ParseFailure } from '@/lib/alerts/ingest';
import { getNotionClient, getTransactionsDataSourceId } from './client';
import { PROP } from './transactions';

/** Make가 문자로 만든 행의 `데이터 출처` 값. 손으로 넣은 행은 적재 신호가 아니다. */
const SOURCE_PROP = '데이터 출처';
const SOURCE_SMS = '문자';

/** 문자에서 온 행 가운데 가장 최근에 만들어진 행의 생성 시각(UTC ISO). 없으면 null. */
export async function fetchLastIngestedAt(): Promise<string | null> {
  const notion = getNotionClient();
  const response = await notion.dataSources.query({
    data_source_id: getTransactionsDataSourceId(),
    page_size: 1,
    filter: { property: SOURCE_PROP, select: { equals: SOURCE_SMS } },
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
  });

  const page = response.results[0];
  return page && 'created_time' in page ? page.created_time : null;
}

/**
 * 아직 알리지 않은 파싱 실패 행.
 *
 * `알림 상태`가 비었거나 '대기'(지난번에 받을 기기가 없었음)인 것만 고른다.
 * 사람이 행을 고쳐 `사용 내역`을 바꾸면 더 이상 걸리지 않는다.
 */
export async function fetchUnnotifiedParseFailures(): Promise<ParseFailure[]> {
  const notion = getNotionClient();
  const failures: ParseFailure[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.dataSources.query({
      data_source_id: getTransactionsDataSourceId(),
      start_cursor: cursor,
      page_size: 100,
      filter: {
        and: [
          { property: PROP.title, title: { equals: PARSE_FAILURE_TITLE } },
          {
            or: [
              { property: PROP.alertStatus, select: { is_empty: true } },
              { property: PROP.alertStatus, select: { equals: '대기' } },
            ],
          },
        ],
      },
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
    });

    for (const page of response.results) {
      if (!('properties' in page)) continue;
      const prop = (page as PageObjectResponse).properties[PROP.rawMessage];
      const rawMessage =
        prop?.type === 'rich_text' ? prop.rich_text.map((t) => t.plain_text).join('') : '';
      failures.push({ id: page.id, rawMessage: rawMessage || null });
    }

    cursor = response.next_cursor ?? undefined;
  } while (cursor);

  return failures;
}
