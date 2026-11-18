/** Scopes a caller needs to run each tool. These are part of the server's contract. */
export const SCOPE_ORDER_STATUS = "tool:order_status_report";
export const SCOPE_FULFILL = "tool:fulfill_order";
export const SCOPE_ANALYTICS = "tool:sales_analytics_report";

export const TOOL_SCOPES = [
  SCOPE_ORDER_STATUS,
  SCOPE_FULFILL,
  SCOPE_ANALYTICS,
] as const;

/** Scopes the server asks the store APIs for. */
export const READ_ORDERS = "read:orders";
export const READ_INVENTORY = "read:inventory";
export const WRITE_INVENTORY = "write:inventory";
export const READ_ANALYTICS = "read:analytics";
