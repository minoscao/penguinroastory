import type { Metadata } from 'next';
import './globals.css';
import './responsive.css';
import './accounts.css';
import AuthProvider from '@/components/auth-provider';
export const metadata: Metadata = {
  metadataBase: new URL('https://roastory.mia-dynamic.com'),
  title: '企鹅烘焙 · 烘焙工作台',
  description: '记录客户、豆子和烘焙方案，轻松管理每一张烘焙订单。',
  openGraph: {
    title: '企鹅烘焙 · 烘焙工作台',
    description: '认真烘焙，简单记录。',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1536,
        height: 1024,
        alt: '企鹅烘焙：认真烘焙，简单记录。',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og.png'],
    title: '企鹅烘焙 · 烘焙工作台',
    description: '认真烘焙，简单记录。',
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
