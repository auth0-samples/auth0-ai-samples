import { createReactAgent, ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { InMemoryStore, MemorySaver } from '@langchain/langgraph';
import { Calculator } from '@langchain/community/tools/calculator';

import { withAsyncAuthorization } from './auth0-ai';
import { shopOnlineTool } from './tools/shop-online';

const date = new Date().toISOString();

const AGENT_SYSTEM_TEMPLATE = `You are a personal assistant named Assistant0. You are a helpful assistant that can answer questions and help with tasks. 

You have access to a set of tools. When using tools, you MUST provide valid JSON arguments. Always format tool call arguments as proper JSON objects.

For example, when calling shop_online tool, format like this:
{"product": "iPhone", "qty": 1, "priceLimit": 1000}

Use the tools as needed to answer the user's question. Render the email body as a markdown block, do not wrap it in code blocks. The current date and time is ${date}`;

const llm = new ChatOpenAI({
  model: 'gpt-4o',
  temperature: 0,
});

const tools = [new Calculator(), withAsyncAuthorization(shopOnlineTool)];

const checkpointer = new MemorySaver();
const store = new InMemoryStore();

/**
 * Use a prebuilt LangGraph agent.
 */
export const agent = createReactAgent({
  llm,
  tools: new ToolNode(tools, {
    // Error handler must be disabled in order to trigger interruptions from within tools.
    handleToolErrors: false,
  }),
  // Modify the stock prompt in the prebuilt agent.
  prompt: AGENT_SYSTEM_TEMPLATE,
  store,
  checkpointer,
});
