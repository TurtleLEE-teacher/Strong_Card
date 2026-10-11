/**
 * Notion `🔔 Card_Alert_Log` 접근.
 *
 * 별도 DB를 두지 않기로 했으므로 알림 중복 방지 상태도 노션에 저장한다.
 * 멱등 키(`알림 키`)가 이미 있으면 재발송하지 않는다.
 */

import type { PageObjectResponse } from '@notionhq/client';
import type { Alert } from '@/lib/alerts/rules';
import type { WatchAlert } from '@/lib/alerts/ingest';
import { CARDS_BY_ID } from '@/config/cards';
import { getAlertDataSourceId, getNotionClient } from './client';
import type { MonthKey } from '@/lib/date';

export const ALERT_PROP = {
  key: '알림 키',
  cardProduct: '카드 상품',
  month: '기준월',
  type: '알림 유형',
  sentAt: '발송 일시',
  body: '본문',
  success: '발송 성공',
} as const;

/**
 * 해당 월에 이미 발송된 알림 키 집합.
 *
 * 알림을 보낼 때마다 개별 조회하면 Notion API 3req/s에 금방 걸린다.
 * 월 단위로 한 번만 긁어서 메모리에서 대조한다.
 */
export async function fetchSentAlertKeys(month: MonthKey): Promise<Set<string>> {
  const notion = getNotionClient();
  const keys = new Set<string>();
  let cursor: string | undefined;

  do {
    const response = await notion.dataSources.query({
      data_source_id: getAlertDataSourceId(),
      start_cursor: cursor,
      page_size: 100,
      filter: { property: ALERT_PROP.month, rich_text: { equals: month } },
    });

    for (const page of response.results) {
      if (!('properties' in page)) continue;
      const prop = (page as PageObjectResponse).properties[ALERT_PROP.key];
      if (prop?.type === 'title') {
        const value = prop.title.map((t) => t.plain_text).join('');
        if (value) keys.add(value);
      }
    }

    cursor = response.next_cursor ?? undefined;
  } while (cursor);

  return keys;
}

/**
 * 이 멱등 키가 Alert_Log에 있는가.
 *
 * 월 단위로 긁을 필요 없이 키 하나만 볼 때 쓴다(적재 공백 알림). 그 알림은
 * 공백이 달을 넘어갈 수 있어 기준월로 거르면 같은 공백에 두 번 울린다.
 */
export async function hasAlertKey(key: string): Promise<boolean> {
  const notion = getNotionClient();
  const response = await notion.dataSources.query({
    data_source_id: getAlertDataSourceId(),
    page_size: 1,
    filter: { property: ALERT_PROP.key, title: { equals: key } },
  });
  return response.results.length > 0;
}

/** 발송 이력을 기록한다. 이 행이 다음 실행의 중복 방지 근거가 된다. */
export async function recordAlert(alert: Alert, success: boolean): Promise<void> {
  await createAlertLogRow({
    key: alert.key,
    type: alert.type,
    month: alert.month,
    cardProduct: CARDS_BY_ID[alert.cardId].notionOption,
    text: `${alert.title} — ${alert.body}`,
    success,
  });
}

/** 카드와 무관한 시스템 알림(적재 감시)의 발송 이력. `카드 상품`은 비워 둔다. */
export async function recordWatchAlert(
  alert: WatchAlert,
  month: MonthKey,
  success: boolean,
): Promise<void> {
  await createAlertLogRow({
    key: alert.key,
    type: alert.type,
    month,
    cardProduct: null,
    text: `${alert.title} — ${alert.body}`,
    success,
  });
}

async function createAlertLogRow(row: {
  key: string;
  type: string;
  month: MonthKey;
  cardProduct: string | null;
  text: string;
  success: boolean;
}): Promise<void> {
  const notion = getNotionClient();

  await notion.pages.create({
    parent: { type: 'data_source_id', data_source_id: getAlertDataSourceId() },
    properties: {
      [ALERT_PROP.key]: { title: [{ text: { content: row.key } }] },
      ...(row.cardProduct ? { [ALERT_PROP.cardProduct]: { select: { name: row.cardProduct } } } : {}),
      [ALERT_PROP.month]: { rich_text: [{ text: { content: row.month } }] },
      [ALERT_PROP.type]: { select: { name: row.type } },
      [ALERT_PROP.sentAt]: { date: { start: new Date().toISOString() } },
      [ALERT_PROP.body]: { rich_text: [{ text: { content: row.text.slice(0, 2000) } }] },
      [ALERT_PROP.success]: { checkbox: row.success },
    } as never,
  });
}
