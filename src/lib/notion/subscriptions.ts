/**
 * Notion `📲 Card_Push_Subscriptions` 접근.
 *
 * Web Push 구독은 기기마다 하나씩 생긴다. 엔드포인트 URL이 사실상 기기
 * 식별자 역할을 하므로 그것을 title로 쓴다.
 *
 * 엔드포인트는 500자를 넘을 수 있다. Notion rich_text 한 조각의 상한은
 * 2000자이므로 그대로 들어가지만, 조회 필터에서는 앞부분만 비교한다.
 */

import type { PageObjectResponse } from '@notionhq/client';
import { getNotionClient } from './client';

export const SUB_PROP = {
  endpoint: '엔드포인트',
  p256dh: 'p256dh',
  auth: 'auth',
  device: '기기 이름',
  active: '활성',
  lastSentAt: '마지막 발송',
} as const;

export interface PushSubscriptionRecord {
  pageId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  device: string | null;
}

function getSubscriptionsDataSourceId(): string {
  const id = process.env.NOTION_SUBSCRIPTION_DATA_SOURCE_ID;
  if (!id) throw new Error('NOTION_SUBSCRIPTION_DATA_SOURCE_ID가 설정되지 않았습니다.');
  return id;
}

function plain(page: PageObjectResponse, name: string): string {
  const p = page.properties[name];
  if (!p) return '';
  if (p.type === 'title') return p.title.map((t) => t.plain_text).join('');
  if (p.type === 'rich_text') return p.rich_text.map((t) => t.plain_text).join('');
  return '';
}

/** 활성 구독 전체 */
export async function fetchActiveSubscriptions(): Promise<PushSubscriptionRecord[]> {
  const notion = getNotionClient();
  const out: PushSubscriptionRecord[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.dataSources.query({
      data_source_id: getSubscriptionsDataSourceId(),
      start_cursor: cursor,
      page_size: 100,
      filter: { property: SUB_PROP.active, checkbox: { equals: true } },
    });

    for (const page of response.results) {
      if (!('properties' in page)) continue;
      const p = page as PageObjectResponse;
      const endpoint = plain(p, SUB_PROP.endpoint);
      const p256dh = plain(p, SUB_PROP.p256dh);
      const auth = plain(p, SUB_PROP.auth);
      if (!endpoint || !p256dh || !auth) continue;

      out.push({
        pageId: p.id,
        endpoint,
        keys: { p256dh, auth },
        device: plain(p, SUB_PROP.device) || null,
      });
    }

    cursor = response.next_cursor ?? undefined;
  } while (cursor);

  return out;
}

/**
 * 구독을 저장한다. 같은 엔드포인트가 이미 있으면 갱신한다.
 * 브라우저가 구독을 갱신하면 엔드포인트가 그대로일 수도, 바뀔 수도 있다.
 */
export async function upsertSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  device?: string;
}): Promise<void> {
  const notion = getNotionClient();
  const dataSourceId = getSubscriptionsDataSourceId();

  const existing = await notion.dataSources.query({
    data_source_id: dataSourceId,
    page_size: 1,
    filter: { property: SUB_PROP.endpoint, title: { equals: input.endpoint.slice(0, 2000) } },
  });

  const properties = {
    [SUB_PROP.endpoint]: { title: [{ text: { content: input.endpoint.slice(0, 2000) } }] },
    [SUB_PROP.p256dh]: { rich_text: [{ text: { content: input.p256dh } }] },
    [SUB_PROP.auth]: { rich_text: [{ text: { content: input.auth } }] },
    [SUB_PROP.device]: {
      rich_text: input.device ? [{ text: { content: input.device.slice(0, 200) } }] : [],
    },
    [SUB_PROP.active]: { checkbox: true },
  } as never;

  const found = existing.results[0];
  if (found) {
    await notion.pages.update({ page_id: found.id, properties });
  } else {
    await notion.pages.create({
      parent: { type: 'data_source_id', data_source_id: dataSourceId },
      properties,
    });
  }
}

/**
 * 구독을 비활성화한다.
 *
 * 푸시 서비스가 404/410을 돌려주면 그 구독은 영구히 죽은 것이다.
 * 지우지 않고 비활성 처리만 하면 노션에서 이력을 볼 수 있다.
 */
export async function deactivateSubscription(pageId: string): Promise<void> {
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: pageId,
    properties: { [SUB_PROP.active]: { checkbox: false } } as never,
  });
}

export async function markSubscriptionSent(pageId: string): Promise<void> {
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: pageId,
    properties: {
      [SUB_PROP.lastSentAt]: { date: { start: new Date().toISOString() } },
    } as never,
  });
}

/** 엔드포인트로 구독을 찾아 비활성화 (구독 해지 API용) */
export async function deactivateByEndpoint(endpoint: string): Promise<boolean> {
  const notion = getNotionClient();
  const found = await notion.dataSources.query({
    data_source_id: getSubscriptionsDataSourceId(),
    page_size: 1,
    filter: { property: SUB_PROP.endpoint, title: { equals: endpoint.slice(0, 2000) } },
  });
  const page = found.results[0];
  if (!page) return false;
  await deactivateSubscription(page.id);
  return true;
}
