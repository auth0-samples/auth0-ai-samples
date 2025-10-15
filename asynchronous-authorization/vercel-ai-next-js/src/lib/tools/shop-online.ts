import { tool } from 'ai';
import { z } from 'zod';
import { getAsyncAuthorizationCredentials } from '@auth0/ai-vercel';
import { withAsyncAuthorization } from '../auth0-ai';

export const shopOnlineTool = withAsyncAuthorization(
  tool({
    description: 'Tool to buy products online',
    inputSchema: z.object({
      product: z.string(),
      qty: z.number().int().positive(),
      priceLimit: z.number().positive().optional(),
    }),
    execute: async (args) => {
      const { product, qty, priceLimit } = args;
      const apiUrl = process.env.SHOP_API_URL;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      const credentials = getAsyncAuthorizationCredentials();
      if (credentials?.accessToken) {
        headers.Authorization = `Bearer ${credentials.accessToken}`;
      }

      if (!apiUrl) {
        return `Ordered ${qty} ${product}${priceLimit ? ` (≤ ${priceLimit})` : ''}`;
      }

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ product, qty, priceLimit }),
      });
      if (!res.ok) {
        throw new Error(`SHOP_API error ${res.status}: ${await res.text().catch(() => res.statusText)}`);
      }
      return await res.text();
    },
  }),
);
