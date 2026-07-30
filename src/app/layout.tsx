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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f4f2' },
    { media: '(prefers-color-scheme: dark)', color: '#121211' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
