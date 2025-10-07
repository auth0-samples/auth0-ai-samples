import "./App.css";

import { LoaderCircle, LogIn, User } from "lucide-react";

import { Thread } from "@/components/thread";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth0 } from "@/hooks/useAuth0";

function App() {
  const { isAuthenticated, isLoading, login, logout, user, error } = useAuth0();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-2">
          <LoaderCircle className="h-6 w-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-red-600">Authentication Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => login()} className="w-full">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <LogIn className="h-6 w-6" />
              Welcome to Auth0 AI Chat
            </CardTitle>
            <CardDescription>
              Please sign in to access the AI-powered chat with calendar
              integration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => login()} className="w-full" size="lg">
              Sign In with Auth0
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="bg-white border-b px-4 py-2 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Auth0 AI Chat</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="text-sm">{user?.name || user?.email}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => logout()}>
            Sign Out
          </Button>
        </div>
      </header>
      <main className="flex-1">
        <Thread />
      </main>
    </div>
  );
}

export default App;
