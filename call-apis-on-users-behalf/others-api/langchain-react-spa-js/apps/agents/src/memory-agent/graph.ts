import { initChatModel } from "langchain/chat_models/universal";

import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { StructuredTool } from "@langchain/core/tools";
// Main graph
import {
  END,
  LangGraphRunnableConfig,
  START,
  StateGraph,
} from "@langchain/langgraph";

import { ConfigurationAnnotation, ensureConfiguration } from "./configuration";
import { GraphAnnotation } from "./state";
import { initializeTools } from "./tools";
import { getStoreFromConfigOrThrow, splitModelAndProvider } from "./utils";

async function callModel(
  state: typeof GraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<{ messages: BaseMessage[] }> {
  const configurable = ensureConfiguration(config);
  const { model, provider } = splitModelAndProvider(configurable.model);

  // Access authenticated user data from the standard LangGraph location
  const authenticatedUser = config?.configurable?.langgraph_auth_user;
  if (authenticatedUser) {
    console.log("👤 Authenticated user found:", authenticatedUser.identity);
  } else {
    console.log(
      "❌ No authenticated user found in config.configurable.langgraph_auth_user"
    );
  }

  const llm = await initChatModel(model, {
    modelProvider: provider,
    configurable: config?.configurable,
  });

  const store = getStoreFromConfigOrThrow(config);

  const memories = await store.search(["memories", configurable.userId], {
    limit: 10,
  });

  let formatted =
    memories
      ?.map((mem) => `[${mem.key}]: ${JSON.stringify(mem.value)}`)
      ?.join("\n") || "";
  if (formatted) {
    formatted = `\n<memories>\n${formatted}\n</memories>`;
  }

  let sys = configurable.systemPrompt
    .replace("{user_info}", formatted)
    .replace("{time}", new Date().toISOString());

  // Add user context to the system message if authenticated
  if (authenticatedUser) {
    const userContext = `You are authenticated as ${authenticatedUser.identity || authenticatedUser.sub} via Auth0.`;
    const scopeInfo = authenticatedUser.permissions
      ? ` The user has the following permissions: ${authenticatedUser.permissions.join(", ")}.`
      : "";
    sys += `\n\n${userContext}${scopeInfo}`;
  }

  const tools = initializeTools(config);
  const boundLLM = llm.bind({
    tools: tools,
    tool_choice: "auto",
  });

  const result = await boundLLM.invoke([
    { role: "system", content: sys },
    ...state.messages,
  ]);

  return { messages: [result] };
}

async function storeMemory(
  state: typeof GraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<{ messages: BaseMessage[] }> {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = lastMessage.tool_calls || [];

  const tools = initializeTools(config);

  const toolMessages = await Promise.all(
    toolCalls.map(async (tc) => {
      const tool = tools.find((t) => t.name === tc.name);
      if (!tool) {
        throw new Error(`Tool ${tc.name} not found`);
      }

      const result = await (tool as StructuredTool).invoke(tc.args, config);

      // Format the result for better readability
      let formattedContent: string;
      if (typeof result === "string") {
        // If it's already a string, check if it contains JSON and format it
        try {
          const parsed = JSON.parse(result);
          formattedContent = JSON.stringify(parsed, null, 2);
        } catch {
          // If it's not JSON, keep as is
          formattedContent = result;
        }
      } else {
        // If it's an object, format it nicely
        formattedContent = JSON.stringify(result, null, 2);
      }

      // Create a proper ToolMessage with the correct tool_call_id
      return new ToolMessage({
        content: formattedContent,
        tool_call_id: tc.id!,
        name: tc.name,
      });
    })
  );

  return { messages: toolMessages };
}

function routeMessage(
  state: typeof GraphAnnotation.State
): "store_memory" | typeof END {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  if (lastMessage.tool_calls?.length) {
    return "store_memory";
  }
  return END;
}

// Create the graph + all nodes
export const builder = new StateGraph(
  {
    stateSchema: GraphAnnotation,
  },
  ConfigurationAnnotation
)
  .addNode("call_model", callModel)
  .addNode("store_memory", storeMemory)
  .addEdge(START, "call_model")
  .addConditionalEdges("call_model", routeMessage, {
    store_memory: "store_memory",
    [END]: END,
  })
  .addEdge("store_memory", "call_model");

export const graph = builder.compile();
graph.name = "MemoryAgent";
