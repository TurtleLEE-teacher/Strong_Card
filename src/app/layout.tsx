import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Strong Card',
  description: '카드별 전월실적과 혜택 한도를 한눈에',
  manifest: '/manifest.webmanifest',
  // iOS는 홈 화면에 추가된 상태에서만 Web Push를 허용한다.
  // 이 설정이 없으면 알림 자체가 불가능하다.
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Strong Card' },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export const viewport: Viewport = {
  // 모바일에서 노치 아래까지 배경이 차도록
  viewportFit: 'cover',
  // 미디어 조건부로 두면 토글이 고른 테마와 상태바 색이 어긋난다.
  // 하나만 두고 ThemeToggle이 갱신한다.
  themeColor: '#f4f4f2',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ko"
      data-theme="light"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          첫 페인트 **전에** 저장된 테마를 바른다. 이게 없으면 다크를 고른
          사람이 매번 흰 화면을 한 번 보고 나서 어두워지는 걸 겪는다.
          서버는 선택을 모르므로(쿠키 안 씀) 클라이언트에서 먼저 칠할 수밖에 없다.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sc-theme');if(t==='dark'||t==='system'||t==='light'){document.documentElement.setAttribute('data-theme',t);var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',d?'#121211':'#f4f4f2');}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
