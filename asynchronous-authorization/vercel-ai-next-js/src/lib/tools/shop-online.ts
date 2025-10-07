import { tool } from 'ai';
import { z } from 'zod';

import { getCIBACredentials } from '@auth0/ai-vercel';
import { withAsyncAuthorization } from '../auth0-ai';

export const shopOnlineTool = withAsyncAuthorization(
  tool({
    description: 'Tool to buy products online',
    parameters: z.object({
      product: z.string(),
      qty: z.number(),
      priceLimit: z.number().optional(),
    }),
    execute: async ({ product, qty, priceLimit }) => {
      console.log(`Ordering ${qty} ${product} with price limit ${priceLimit}`);

      const apiUrl = process.env['SHOP_API_URL']!;

      if (!apiUrl) {
        // No API set, mock a response or return error
        return `Ordered ${qty} ${product}`;
      }

      const headers = {
        'Content-Type': 'application/json',
        Authorization: '',
      };
      const body = {
        product,
        qty,
        priceLimit,
      };

      const credentials = getCIBACredentials();
      const accessToken = credentials?.accessToken;

      if (accessToken) {
        headers['Authorization'] = 'Bearer ' + accessToken;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
      });

      return response.statusText;
    },
  }),
);
