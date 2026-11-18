import { loadOrdersApiConfig } from "./config.js";
import { createOrdersServer } from "./orders-api.js";

const config = loadOrdersApiConfig();
createOrdersServer(config).listen(config.port, () => {
  console.log(`Orders API listening on port ${config.port}`);
});
