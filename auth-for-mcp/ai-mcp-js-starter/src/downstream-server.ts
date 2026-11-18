import { loadDownstreamConfig } from "./config.js";
import { createDownstreamServer } from "./downstream-api.js";

const config = loadDownstreamConfig();
createDownstreamServer(config).listen(config.port, () => {
  console.log(`Downstream API listening on port ${config.port}`);
});
