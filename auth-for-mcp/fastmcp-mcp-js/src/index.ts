import { createServer } from "./server.js";

const port = parseInt(process.env.PORT ?? "3001", 10);
const { server, endpoint } = createServer();

try {
  await server.start({
    transportType: "httpStream",
    httpStream: { port, endpoint, stateless: true },
  });
  console.log(`FastMCP server listening on port ${port} at ${endpoint}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
