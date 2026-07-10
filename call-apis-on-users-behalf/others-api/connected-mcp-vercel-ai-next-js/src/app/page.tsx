import { LogIn, UserPlus } from 'lucide-react';
import { ChatWindow } from '@/components/chat-window';
import { GuideInfoBox } from '@/components/guide/GuideInfoBox';
import { Button } from '@/components/ui/button';

import { auth0 } from '@/integrations/auth0';

export default async function Home() {
  const session = await auth0.getSession();

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] my-auto gap-4">
        <h2 className="text-xl">You are not logged in</h2>
        <div className="flex gap-4">
          <Button asChild variant="default" size="default">
            <a href="/auth/login" className="flex items-center gap-2">
              <LogIn />
              <span>Login</span>
            </a>
          </Button>
          <Button asChild variant="default" size="default">
            <a href="/auth/login?screen_hint=signup">
              <UserPlus />
              <span>Sign up</span>
            </a>
          </Button>
        </div>
      </div>
    );
  }

  const InfoCard = (
    <GuideInfoBox>
      <ul>
        <li className="text-l">
          🤝
          <span className="ml-2">
            This template shows an agent calling a remote{' '}
            <a className="text-blue-500" href="https://modelcontextprotocol.io/" target="_blank">
              MCP
            </a>{' '}
            server (Notion) on your behalf, using Auth0{' '}
            <a className="text-blue-500" href="https://auth0.com/docs/secure/tokens/token-vault" target="_blank">
              Connected Accounts + Token Vault
            </a>{' '}
            for the access token.
          </span>
        </li>
        <li className="hidden text-l md:block">
          🔐
          <span className="ml-2">
            The Token Vault exchange and MCP connection live in <code>src/integrations/mcp/</code>; the chat route is{' '}
            <code>app/api/chat/route.ts</code>.
          </span>
        </li>
        <li className="hidden text-l md:block">
          🔌
          <span className="ml-2">
            The first time you call a Notion tool, you&apos;ll be prompted to connect your Notion account.
          </span>
        </li>
        <li className="text-l">
          👇
          <span className="ml-2">
            Try asking e.g. <code>Search my Notion for meeting notes</code> below!
          </span>
        </li>
      </ul>
    </GuideInfoBox>
  );

  return (
    <ChatWindow
      endpoint="api/chat"
      emoji="🤖"
      placeholder={`Hello ${session?.user?.name}, I'm your personal assistant. How can I help you today?`}
      emptyStateComponent={InfoCard}
    />
  );
}
