import { initApiPassthrough } from 'langgraph-nextjs-api-passthrough';

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS, runtime } = initApiPassthrough({
  apiUrl: process.env.LANGGRAPH_API_URL,
  baseRoute: 'chat/',
  bodyParameters: async (req, body) => {
    if (req.nextUrl.pathname.endsWith('/runs/stream') && req.method === 'POST') {
      return {
        ...body,
        config: {
          configurable: {
            _credentials: {

            },
          },
        },
      };
    }

    return body;
  },
});
