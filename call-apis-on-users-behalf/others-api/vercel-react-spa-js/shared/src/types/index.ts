export type ApiResponse = {
  message: string;
  success: true;
};

export type Auth0Config = {
  domain: string;
  clientId: string;
  audience: string;
};

export type User = {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
};

// Chat-related types
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

export type ChatRequest = {
  message: string;
};

export type StreamDataRequest = {
  prompt: string;
};
