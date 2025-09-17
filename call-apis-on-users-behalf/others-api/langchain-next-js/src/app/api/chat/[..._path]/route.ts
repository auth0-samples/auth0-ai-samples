import { initApiPassthrough } from 'langgraph-nextjs-api-passthrough';

import { getAccessToken } from '@/lib/auth0';
import { NextRequest } from 'next/server';

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS, runtime } = initApiPassthrough({
  apiUrl: process.env.LANGGRAPH_API_URL,
  baseRoute: 'chat/',
  headers: async (req: NextRequest) => {
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const accessToken = await getAccessToken();
    headers["Authorization"] = `Bearer ${accessToken}`;
    return headers;
  },
});
