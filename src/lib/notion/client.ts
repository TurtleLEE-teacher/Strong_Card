import { Client } from '@notionhq/client';

/**
 * Notion 클라이언트는 **서버에서만** 생성한다.
 * 토큰이 클라이언트 번들에 섞이면 노션 워크스페이스 전체가 노출된다.
 */

let cached: Client | null = null;

export function getNotionClient(): Client {
  if (cached) return cached;

  const auth = process.env.NOTION_API_KEY;
  if (!auth) {
    throw new Error(
      'NOTION_API_KEY가 설정되지 않았습니다. .env.local 또는 Vercel 환경변수를 확인하세요.',
    );
  }

  cached = new Client({ auth });
  return cached;
}

/** 거래 데이터 소스 ID (Card_Transactions) */
export function getTransactionsDataSourceId(): string {
  const id = process.env.NOTION_TX_DATA_SOURCE_ID;
  if (!id) {
    throw new Error('NOTION_TX_DATA_SOURCE_ID가 설정되지 않았습니다.');
  }
  return id;
}

/** 알림 로그 데이터 소스 ID (Card_Alert_Log) */
export function getAlertDataSourceId(): string {
  const id = process.env.NOTION_ALERT_DATA_SOURCE_ID;
  if (!id) {
    throw new Error('NOTION_ALERT_DATA_SOURCE_ID가 설정되지 않았습니다.');
  }
  return id;
}
