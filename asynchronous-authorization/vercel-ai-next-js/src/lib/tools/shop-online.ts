import { type Tool } from 'ai';
import { z } from 'zod';
import { getCIBACredentials } from '@auth0/ai-vercel';

const baseShopOnlineTool: Tool = {
  description: 'Tool to buy products online',
  parameters: z.object({
    product: z.string(),
    qty: z.number().int().positive(),
    priceLimit: z.number().positive().optional(),
  }),
  async execute(args) {
    const { product, qty, priceLimit } = args as { product: string; qty: number; priceLimit?: number };
    const apiUrl = process.env.SHOP_API_URL;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    const credentials = getCIBACredentials();
    if (credentials?.accessToken) headers.Authorization = `Bearer ${credentials.accessToken}`;

    if (!apiUrl) return `Ordered ${qty} ${product}${priceLimit ? ` (≤ ${priceLimit})` : ''}`;

    const res = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify({ product, qty, priceLimit }) });
    if (!res.ok) throw new Error(`SHOP_API error ${res.status}: ${await res.text().catch(() => res.statusText)}`);
    return await res.text();
  },
};

export const shopOnlineTool = baseShopOnlineTool;
