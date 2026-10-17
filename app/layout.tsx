import type { Metadata,Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './sharing.css';
import {auth} from '../auth';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const viewport:Viewport={width:'device-width',initialScale:1,interactiveWidget:'resizes-content'};
export const metadata: Metadata = {
  title: 'Personal Task Space',
  description: 'A focused personal task manager with a private workspace for each account.',
  icons: {
    icon: [{ url: '/favicon.svg?v=4', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg?v=4',
  },
  openGraph: {
    title: 'Personal Task Space',
    description: 'A focused personal task manager with a private workspace for each account.',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session=await auth();
  return (
    <html lang="vi">
      <body
        data-workspace-id={session?.user?.ownerId||undefined}
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <script src="/ph-shell-bridge.js?v=3" defer />
      </body>
    </html>
  );
}
