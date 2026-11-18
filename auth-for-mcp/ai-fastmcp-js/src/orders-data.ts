/** In-memory seed data for the orders API. It resets when the process restarts. */

export interface OrderRecord {
  id: string;
  /** The subject (`sub`) of the shopper who owns the order. */
  customer: string;
  item: string;
  qty: number;
  status: "processing" | "shipped" | "cancelled";
}

export type CancelResult = "cancelled" | "already_cancelled" | "shipped" | "not_found";

export interface OrdersData {
  /** The orders of one shopper. Orders of other shoppers are never included. */
  orders: (customer: string) => OrderRecord[];
  /**
   * Cancels an order of `customer` that has not shipped. Cancelling twice is not an error. An
   * order that belongs to someone else is `not_found`, the same answer as for an unknown id.
   */
  cancel: (customer: string, id: string) => CancelResult;
}

type Starter = Omit<OrderRecord, "customer">;

/** Every shopper gets these three orders the first time they ask, so any test user has data. */
const STARTER_ORDERS: Starter[] = [
  { id: "ord_1001", item: "Wireless Headphones", qty: 1, status: "shipped" },
  { id: "ord_1002", item: "Mechanical Keyboard", qty: 1, status: "processing" },
  { id: "ord_1003", item: "USB-C Dock", qty: 2, status: "processing" },
];

/**
 * An order that belongs to a shopper nobody signs in as, so the sample shows that the orders API
 * returns and cancels only the orders of the caller.
 */
export const OTHER_SHOPPER = "auth0|another-shopper";
const OTHER_SHOPPER_ORDER: OrderRecord = {
  id: "ord_9001",
  customer: OTHER_SHOPPER,
  item: "Webcam",
  qty: 1,
  status: "processing",
};

export function createOrdersData(): OrdersData {
  const books = new Map<string, OrderRecord[]>([[OTHER_SHOPPER, [{ ...OTHER_SHOPPER_ORDER }]]]);

  function bookOf(customer: string): OrderRecord[] {
    let book = books.get(customer);
    if (!book) {
      book = STARTER_ORDERS.map((starter) => ({ ...starter, customer }));
      books.set(customer, book);
    }
    return book;
  }

  return {
    orders: (customer) => bookOf(customer).map((order) => ({ ...order })),
    cancel: (customer, id) => {
      const order = bookOf(customer).find((candidate) => candidate.id === id);
      if (order === undefined) return "not_found";
      if (order.status === "shipped") return "shipped";
      if (order.status === "cancelled") return "already_cancelled";
      order.status = "cancelled";
      return "cancelled";
    },
  };
}
