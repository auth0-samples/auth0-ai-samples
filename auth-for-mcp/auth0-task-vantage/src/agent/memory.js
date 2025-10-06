import {createMemory, staticBlock} from "llamaindex";

// very simple in-process cache; replace with a DB if you need durability
const memories = new Map();

/**
 * Get or create a Memory instance for a given user key.
 * userKey can be an Auth0 user sub or "anonymous".
 */
export function getMemory(userKey, { userName } = {}) {
  const key = userKey || "anonymous";
  if (memories.has(key)) return memories.get(key);

  const blocks = [];

  // always include a small static context, if we know it
  if (userName) {
    blocks.push(
      staticBlock({
        content: `The user's display name is ${userName}. They are using Task Vantage.`,
      })
    );
  }

  const memory = createMemory({
    // tune if you like; defaults are fine
    tokenLimit: 30000,
    shortTermTokenLimitRatio: 0.7,
    memoryBlocks: blocks,
  });

  memories.set(key, memory);
  return memory;
}
