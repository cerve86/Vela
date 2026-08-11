import type { Metadata } from 'next';
import { Outfit, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

// Outfit carries headlines (heavy, tight, geometric). Plus Jakarta Sans carries body and
// data — it has true tabular figures, which the roster and vitals tables depend on.
const outfit = Outfit({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-outfit',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Vela — Coach Portal',
  description: 'Monitor client exercise, nutrition and health vitals.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${jakarta.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
