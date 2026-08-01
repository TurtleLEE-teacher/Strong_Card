'use server';

import { revalidatePath } from 'next/cache';

/**
 * 화면 데이터를 지금 다시 읽어온다.
 *
 * 이 앱은 ISR로 300초 캐시를 둔다 — Notion API가 3 req/s로 제한돼 있어
 * 매 요청마다 긁을 수 없기 때문이다. 그런데 카드를 긁고 바로 앱을 열면
 * 최대 5분 동안 낡은 화면을 보게 된다. 앱을 껐다 켜도 캐시는 그대로라
 * 사용자가 할 수 있는 일이 없었다.
 *
 * `revalidatePath('/', 'layout')`은 클라이언트 캐시까지 비운다. 대시보드와
 * 카드 상세가 같은 `getDashboardData()`를 쓰므로 한쪽만 비우면 두 화면의
 * 숫자가 갈린다 — 그게 이 앱에서 가장 나쁜 실패다.
 *
 * Server Function 안에서 부르면 Next가 현재 라우트를 서버에서 다시 렌더해
 * 그 응답에 새 RSC 페이로드를 실어 보낸다. 그래서 별도로 refresh()를
 * 부르거나 페이지를 새로고침할 필요가 없다.
 */
export async function refreshData(): Promise<void> {
  revalidatePath('/', 'layout');
}
