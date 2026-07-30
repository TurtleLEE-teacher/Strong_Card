import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deactivateByEndpoint, upsertSubscription } from '@/lib/notion/subscriptions';

export const dynamic = 'force-dynamic';

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  device: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 JSON입니다.' }, { status: 400 });
  }

  const parsed = SubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '구독 정보 형식이 올바르지 않습니다.', detail: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await upsertSubscription({
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      device: parsed.data.device,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '구독 저장에 실패했습니다.' },
      { status: 500 },
    );
  }
}

const UnsubscribeSchema = z.object({ endpoint: z.string().url() });

export async function DELETE(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 JSON입니다.' }, { status: 400 });
  }

  const parsed = UnsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'endpoint가 필요합니다.' }, { status: 400 });
  }

  try {
    const found = await deactivateByEndpoint(parsed.data.endpoint);
    return NextResponse.json({ ok: true, found });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '구독 해지에 실패했습니다.' },
      { status: 500 },
    );
  }
}
