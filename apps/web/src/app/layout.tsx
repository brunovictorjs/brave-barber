import type { Metadata, Viewport } from 'next';
import { Montserrat, Mr_Dafoe, Oswald } from 'next/font/google';
import { IconSprite } from '@/components/brand/icon';
import { Providers } from './providers';
import './globals.css';

const montserrat = Montserrat({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-montserrat', display: 'swap' });
const oswald = Oswald({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-oswald', display: 'swap' });
const mrDafoe = Mr_Dafoe({ subsets: ['latin'], weight: '400', variable: '--font-mr-dafoe', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Brave Barber — hora marcada em Gaibu', template: '%s · Brave Barber' },
  description: 'Corte, barba e coloração com hora marcada. Escolha o serviço, o horário e o profissional, pague e apareça. Estilo • Respeito • Confiança.',
  icons: { icon: '/brand/logo.png' },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${montserrat.variable} ${oswald.variable} ${mrDafoe.variable}`}>
      <body>
        <IconSprite />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
