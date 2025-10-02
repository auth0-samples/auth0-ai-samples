import { LogIn, UserPlus } from 'lucide-react';
import Chat from '@/components/chat';
import { GuideInfoBox } from '@/components/guide/GuideInfoBox';
import { Button } from '@/components/ui/button';
import { auth0 } from '@/lib/auth0';

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

  return (
    <Chat />
  );
}
