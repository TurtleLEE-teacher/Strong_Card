import { NextResponse } from 'next/server';
import { z } from 'zod';

import { sendToSubscriptions } from '@/lib/push';
import { fetchActiveSubscriptions } from '@/lib/notion/subscriptions';

export const dynamic = 'force-dynamic';

/**
 * 테스트 알림 발송 — "알림이 안 와요"를 진단하는 유일한 방법.
 *
 * 알림 사슬은 네 토막이고, 어디가 끊겨도 증상은 똑같다(폰이 조용하다).
 *
 *   1. 브라우저가 구독을 만들었나        → PushSetup의 버튼 상태
 *   2. 그 구독이 서버(Notion)에 있나      → subscriptions / thisDeviceRegistered
 *   3. 푸시 서비스가 받아줬나            → sent / failures[].statusCode
 *   4. 기기가 알림을 띄웠나              → 폰을 보면 안다
 *
 * 1과 2가 어긋나는 경우가 특히 조용하다 — 브라우저에는 구독이 살아 있어
 * 화면이 '알림을 받습니다'라고 말하는데, 서버에는 그 기록이 없거나
 * 만료돼 있는 상태다. 이 응답은 그 어긋남을 숫자로 드러낸다.
 */

const Body = z.object({ endpoint: z.string().url().optional() });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  const endpoint = parsed.success ? parsed.data.endpoint : undefined;

  try {
    const subscriptions = await fetchActiveSubscriptions();

    if (subscriptions.length === 0) {
      return NextResponse.json({
        ok: false,
        subscriptions: 0,
        thisDeviceRegistered: false,
        sent: 0,
        failed: 0,
        failures: [],
        hint: '서버에 등록된 기기가 없습니다. 아래 「알림 켜기」를 눌러 등록하세요.',
      });
    }

    const thisDeviceRegistered = endpoint
      ? subscriptions.some((s) => s.endpoint === endpoint)
      : null;

    const result = await sendToSubscriptions(subscriptions, {
      title: 'Strong Card 테스트',
      body: '이 알림이 보이면 설정이 정상입니다.',
      url: '/settings',
      tag: 'test',
    });

    return NextResponse.json({
      ok: result.sent > 0,
      subscriptions: subscriptions.length,
      thisDeviceRegistered,
      sent: result.sent,
      failed: result.failed,
      deactivated: result.deactivated,
      // 엔드포인트 URL은 그대로 돌려주지 않는다 — 기기를 특정하는 값이다.
      failures: result.failures.map((f) => ({
        statusCode: f.statusCode,
        message: f.message.slice(0, 200),
      })),
      hint:
        thisDeviceRegistered === false
          ? '이 기기는 서버에 등록돼 있지 않습니다. 「끄기」 후 다시 「알림 켜기」를 눌러주세요.'
          : result.sent > 0
            ? '발송했습니다. 알림이 안 보이면 기기의 알림 설정(방해 금지 모드 포함)을 확인하세요.'
            : undefined,
    });
  } catch (e) {
    // VAPID 키 누락이 여기로 온다. 조용히 삼키면 원인을 영영 못 찾는다.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
