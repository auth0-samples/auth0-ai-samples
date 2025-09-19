import { BaseStore, LangGraphRunnableConfig } from "@langchain/langgraph";

/**
 * Get the store from the configuration or throw an error.
 */
export function getStoreFromConfigOrThrow(
  config: LangGraphRunnableConfig
): BaseStore {
  if (!config.store) {
    throw new Error("Store not found in configuration");
  }

  return config.store;
}

/**
 * Split the fully specified model name into model and provider.
 */
export function splitModelAndProvider(fullySpecifiedName: string): {
  model: string;
  provider?: string;
} {
  let provider: string | undefined;
  let model: string;

  if (fullySpecifiedName.includes("/")) {
    const parts = fullySpecifiedName.split("/", 2);
    provider = parts[0];
    model = parts[1] || "";
  } else {
    model = fullySpecifiedName;
  }

  return { model, provider };
}
