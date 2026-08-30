import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  metadataBase: new URL('https://penguinroastory.minoscao.chatgpt.site'),
  title: '企鹅烘焙 · 烘焙工作台',
  description: '记录客户、豆子和烘焙方案，轻松管理每一张烘焙订单。',
  openGraph: {
    title: '企鹅烘焙 · 烘焙工作台',
    description: '认真烘焙，简单记录。',
    type: 'website',
    images: [
      {
        url: 'https://penguinroastory.minoscao.chatgpt.site/og.png',
        width: 1536,
        height: 1024,
        alt: '企鹅烘焙：认真烘焙，简单记录。',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['https://penguinroastory.minoscao.chatgpt.site/og.png'],
    title: '企鹅烘焙 · 烘焙工作台',
    description: '认真烘焙，简单记录。',
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
