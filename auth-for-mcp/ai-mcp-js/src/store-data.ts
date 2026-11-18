/** In-memory seed data for the store API. It resets when the process restarts. */

export interface OrderRecord {
  id: string;
  /** The subject (`sub`) of the shopper who owns the order. */
  customer: string;
  item: string;
  sku: string;
  qty: number;
  status: string;
}

export interface StoreData {
  /** The orders of one shopper. Orders of other shoppers are never included. */
  orders: (customer: string) => OrderRecord[];
  /** One order, only when `customer` owns it. */
  order: (customer: string, id: string) => OrderRecord | undefined;
  stock: (sku: string) => number | undefined;
  /** Reserves stock once per order of a shopper. Returns undefined for an unknown sku. */
  reserve: (
    customer: string,
    sku: string,
    qty: number,
    orderId: string,
  ) => { alreadyReserved: boolean; before: number; after: number } | undefined;
}

type Starter = Omit<OrderRecord, "customer">;

/** Every shopper gets these three orders the first time they ask, so any test user has data. */
const STARTER_ORDERS: Starter[] = [
  { id: "ORD-1001", item: "Wireless Headphones", sku: "SKU-HEAD-01", qty: 1, status: "shipped" },
  { id: "ORD-1002", item: "Mechanical Keyboard", sku: "SKU-KEYB-02", qty: 1, status: "processing" },
  { id: "ORD-1003", item: "USB-C Dock", sku: "SKU-DOCK-03", qty: 2, status: "processing" },
];

/**
 * An order that belongs to a shopper nobody signs in as, so the sample shows that the store API
 * returns only the orders of the caller.
 */
export const OTHER_SHOPPER = "auth0|another-shopper";
const OTHER_SHOPPER_ORDER: OrderRecord = {
  id: "ORD-9001",
  customer: OTHER_SHOPPER,
  item: "Webcam",
  sku: "SKU-DOCK-03",
  qty: 1,
  status: "processing",
};

export function createStoreData(): StoreData {
  const books = new Map<string, OrderRecord[]>([[OTHER_SHOPPER, [OTHER_SHOPPER_ORDER]]]);
  const stock = new Map<string, number>([
    ["SKU-HEAD-01", 24],
    ["SKU-KEYB-02", 12],
    ["SKU-DOCK-03", 7],
  ]);
  const reserved = new Set<string>();

  function bookOf(customer: string): OrderRecord[] {
    let book = books.get(customer);
    if (!book) {
      book = STARTER_ORDERS.map((starter) => ({ ...starter, customer }));
      books.set(customer, book);
    }
    return book;
  }

  return {
    orders: (customer) => bookOf(customer).map((o) => ({ ...o })),
    order: (customer, id) => {
      const found = bookOf(customer).find((o) => o.id === id);
      return found && { ...found };
    },
    stock: (sku) => stock.get(sku),
    reserve: (customer, sku, qty, orderId) => {
      const before = stock.get(sku);
      if (before === undefined) return undefined;
      const key = JSON.stringify([customer, orderId]);
      if (reserved.has(key)) {
        return { alreadyReserved: true, before, after: before };
      }
      reserved.add(key);
      stock.set(sku, before - qty);
      return { alreadyReserved: false, before, after: before - qty };
    },
  };
}
