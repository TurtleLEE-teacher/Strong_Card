import { NextResponse, type NextRequest } from 'next/server';

/**
 * 단일 사용자 비밀번호 보호.
 *
 * 이 앱은 카드 사용 내역 전체를 보여준다. 공개 URL로 방치하면
 * 누구나 소비 패턴을 들여다볼 수 있다.
 *
 * APP_PASSWORD가 없으면 통과시킨다 — 로컬 개발에서 매번 로그인하지
 * 않도록. 배포 환경에는 반드시 설정해야 한다.
 *
 * 크론 엔드포인트는 자체 시크릿(CRON_SECRET)으로 인증하므로 제외한다.
 */
export function middleware(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // 크론과 푸시 구독은 별도 인증 경로를 쓴다.
  if (pathname.startsWith('/api/cron/')) return NextResponse.next();

  const cookie = request.cookies.get('sc_auth')?.value;
  if (cookie && timingSafeEqual(cookie, password)) return NextResponse.next();

  // Basic 인증. 별도 로그인 화면 없이 브라우저 기본 다이얼로그를 쓴다.
  const header = request.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    const decoded = atob(header.slice(6));
    const supplied = decoded.slice(decoded.indexOf(':') + 1);
    if (timingSafeEqual(supplied, password)) {
      const response = NextResponse.next();
      response.cookies.set('sc_auth', password, {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      });
      return response;
    }
  }

  return new NextResponse('인증이 필요합니다.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Strong Card", charset="UTF-8"' },
  });
}

/**
 * 길이가 달라도 조기 반환하지 않는 비교.
 * 미들웨어는 Edge 런타임이라 node:crypto를 못 쓴다.
 */
function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export const config = {
  // Service Worker와 매니페스트, 아이콘은 인증 없이 접근 가능해야 한다.
  // 여기가 막히면 PWA 설치와 푸시 등록이 통째로 실패한다.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|icon-.*\\.png|badge-.*\\.png).*)',
  ],
};
