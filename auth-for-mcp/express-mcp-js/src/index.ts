import { createExpressApp } from "./server.js";

const port = parseInt(process.env.PORT ?? "3001", 10);
const app = createExpressApp();

app.listen(port, () => {
  console.log(`Express MCP server listening on port ${port}`);
});
