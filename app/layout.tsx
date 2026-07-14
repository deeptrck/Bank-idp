import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Deeptrack Bank IDP',
  description: 'KYC document intake dashboard, powered by Deeptrack',
  icons: {
    icon: '/logo-light.ico',
    shortcut: '/logo-light.ico',
    apple: '/logo-light.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
