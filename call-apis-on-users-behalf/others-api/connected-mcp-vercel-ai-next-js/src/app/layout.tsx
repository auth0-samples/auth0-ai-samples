import './globals.css';
import { Roboto_Mono, Inter } from 'next/font/google';
import Image from 'next/image';
import { Github } from 'lucide-react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

import { ActiveLink } from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { auth0 } from '@/lib/auth0';
import UserButton from '@/components/auth0/user-button';

const robotoMono = Roboto_Mono({ weight: '400', subsets: ['latin'] });
const publicSans = Inter({ weight: '400', subsets: ['latin'] });

const TITLE = 'Auth0 Connected MCP: Call remote MCP servers with Token Vault';
const DESCRIPTION =
  'Sample app showing how an agent calls a remote MCP server (Notion) using Auth0 Connected Accounts + Token Vault.';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth0.getSession();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>{TITLE}</title>
        <link rel="shortcut icon" type="image/png" href="/images/favicon.png" />
        <meta name="description" content={DESCRIPTION} />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />
      </head>
      <body className={publicSans.className}>
        <NuqsAdapter>
          <div className="bg-secondary grid grid-rows-[auto,1fr] h-[100dvh]">
            <div className="grid grid-cols-[1fr,auto] gap-2 p-4 bg-black/25">
              <div className="flex gap-4 flex-col md:flex-row md:items-center">
                <a
                  href="https://a0.to/ai-event"
                  rel="noopener noreferrer"
                  target="_blank"
                  className="flex items-center gap-2 px-4"
                >
                  <Image src="/images/auth0-logo.svg" alt="Auth0 AI Logo" className="h-8" width={143} height={32} />
                </a>
                <span className={`${robotoMono.className} text-white text-2xl`}>Connected MCP</span>
                <nav className="flex gap-1 flex-col md:flex-row">
                  <ActiveLink href="/">Chat</ActiveLink>
                </nav>
              </div>
              <div className="flex justify-center">
                {session && (
                  <div className="flex items-center gap-2 px-4 text-white">
                    <UserButton user={session?.user!} logoutUrl="/auth/logout" />
                  </div>
                )}
                <Button asChild variant="header" size="default">
                  <a href="https://github.com/auth0-samples/auth0-ai-samples" target="_blank">
                    <Github className="size-3" />
                    <span>Open in GitHub</span>
                  </a>
                </Button>
              </div>
            </div>
            <div className="gradient-up bg-gradient-to-b from-white/10 to-white/0 relative grid border-input border-b-0">
              <div className="absolute inset-0">{children}</div>
            </div>
          </div>
          <Toaster richColors />
        </NuqsAdapter>
      </body>
    </html>
  );
}
