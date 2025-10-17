import "dotenv/config";
import { createExpressApp } from "./server.js";

async function main() {
  try {
    const PORT = parseInt(process.env.PORT ?? "3001", 10);
    const app = await createExpressApp();

    app.listen(PORT, () => {
      console.log(`Example Express MCP Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main();
