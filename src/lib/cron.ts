import 'server-only';
import { NextResponse } from 'next/server';

/**
 * 크론 엔드포인트 인증.
 *
 * Vercel Hobby 플랜의 크론은 하루 1회로 제한된다. 15분 간격 동기화가
 * 불가능하므로 GitHub Actions 크론이 이 엔드포인트를 호출하는 구조로 간다.
 * 공개 URL이니 공유 시크릿으로 막는다.
 */
export function assertCronAuthorized(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET이 설정되지 않았습니다. 인증 없이 실행할 수 없습니다.' },
      { status: 500 },
    );
  }

  const header = request.headers.get('authorization');
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  return null;
}
