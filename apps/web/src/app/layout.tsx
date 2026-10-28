import type { Metadata } from 'next';
import { IBM_Plex_Mono, Newsreader, Schibsted_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const ui = Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-schibsted', display: 'swap' });
const display = Newsreader({ subsets: ['latin'], variable: '--font-newsreader', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Nexo Assist — Service desk de TI',
  description: 'Agent de atendimento do service desk de TI da Nexo',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${ui.variable} ${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
