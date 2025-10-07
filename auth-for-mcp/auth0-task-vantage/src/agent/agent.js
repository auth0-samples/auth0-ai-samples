import * as env from './env.js';
import { openai } from "@llamaindex/openai";
import { agent } from "@llamaindex/workflow";
import { createTools } from './tools.js';
import { getMemory } from './memory.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('agent-handler');

// Constants
const SYSTEM_PROMPTS = {
  base: 'You are Task Vantage Assistant, a helpful AI that can manage projects and tasks.',

  withTools: (toolCount) => `You are Task Vantage Assistant, a helpful AI that can manage projects and tasks.

You have access to ${toolCount} tools including:
- Task Vantage tools for managing projects and tasks
- Local utility tools for time and calculations

Always prefer to list or search before making changes. Be precise with filters and provide helpful summaries of retrieved data.

When a tool call has optional fields that are not supplied, infer reasonable values from context and proceed without asking. Record all assumptions in a short "Assumptions" note in your reply.

Never invent values for required fields. If a required field is missing and you cannot infer it from the current message or recent context with high confidence, ask one concise follow up question, then continue.

Inference rules for optional fields:
- description: if missing, synthesize a one sentence description from the name and recent context.
- priority: map keywords to high/medium/low defaults.
- status: default to "todo" for new items unless implied otherwise.
- dueDate: extract from natural language; if timeframe only, pick a sensible date inside it.
- assignee: use the mentioned person; if none, use the user if implied, else leave unassigned.
- tags: pull #hashtags or obvious thematic tags.
- projectId: resolve by search; if multiple matches, pick the most recent; if none and not explicit, ask once.
- estimates/points: infer conservative values if hinted; otherwise omit.
- slug/key fields: derive from name with lowercase-hyphen convention.

You can also create visual diagrams using Mermaid syntax when helpful. Use Mermaid diagrams to illustrate:
- Project workflows and processes
- Task dependencies and relationships
- Team structures and reporting lines
- System architecture and data flows
- Timelines and project schedules
- Decision trees and flowcharts

When creating diagrams, use \`\`\`mermaid code blocks with appropriate diagram types (flowchart, sequence, gantt, etc.).`,

  noTools: 'No tools are currently available. You can provide general assistance but cannot access external data.'
};

// Helper functions
const getUserType = (email) =>
  email?.includes('@pledgerocket.com') || email?.includes('@okta.com')
    ? 'Analyst @ PledgeRocket'
    : email ? 'B2B Customer' : 'Guest';

const createUserContext = (auth) => ({
  userId: auth.userId,
  userName: auth.userName,
  firstName: auth.firstName,
  lastName: auth.lastName,
  profilePicture: auth.profilePicture,
  isB2BCustomer: auth.userType === 'B2B Customer',
  userType: auth.userType
});

const extractResponseText = (response) =>
  response?.data?.message?.content ||
  response?.data?.content ||
  response?.data ||
  response?.message?.content ||
  response?.content ||
  String(response);

async function handleUserCheck(context) {
  const auth = await getAuth(context);
  return context.json({
    response: '',
    context: env.AUTH_ENABLED && auth.userId
      ? createUserContext(auth)
      : { message: "Running without authentication" }
  });
}

// Extract authentication context from request
async function getAuth(context) {
  const client = context.var?.auth0Client;
  const session = await client?.getSession(context);

  if (!session) {
    return { userId: null, userName: null, firstName: null, lastName: null, profilePicture: null, accessToken: null, userType: 'Guest' };
  }

  // Find the token set with the MCP audience
  const mcpTokenSet = session.tokenSets.find(tokenSet =>
    tokenSet.audience === env.MCP_AUTH0_AUDIENCE ||
    (Array.isArray(tokenSet.audience) && tokenSet.audience.includes(env.MCP_AUTH0_AUDIENCE))
  );

  // Handle internal employee demo logic
  const isInternal = session.user.email?.includes('@pledgerocket.com') || session.user.email?.includes('@okta.com');
  const userName = isInternal && session.user.name?.includes('@okta.com')
    ? session.user.name.replace('@okta.com', '@pledgerocket.com')
    : session.user.name;

  return {
    userId: session.user.sub,
    userName,
    firstName: session.user.given_name || session.user.firstName,
    lastName: session.user.family_name || session.user.lastName,
    profilePicture: session.user.picture,
    accessToken: mcpTokenSet?.accessToken,
    userType: getUserType(session.user.email)
  };
}

// Main chat API endpoint handler
export async function handleChat(context) {
  let toolsCleanup = () => {};

  try {
    const { message } = await context.req.json();

    if (!message) {
      return context.json({ error: "Message is required" }, 400);
    }

    // Handle user context check without AI processing
    if (message === '__CHECK_USER__') {
      return handleUserCheck(context);
    }

    // Generate request ID for tracing
    const reqId = log.newRequest();
    context.reqId = reqId;

    // Get authentication context
    const auth = await getAuth(context);
    log.log(`[${reqId}] USER:`, {
      principal: auth.userId || 'anonymous',
      token: auth.accessToken ? `${auth.accessToken[0]}***` : 'none',
      userType: auth.userType,
      query: message
    });

    // Get per-user memory
    const memory = getMemory(auth.userId || "anonymous", { userName: auth.userName });

    // Get all available tools (local + MCP) with metadata tracking
    const { tools, metadata: toolsMetadata, cleanup } = await createTools(auth.accessToken);
    toolsCleanup = cleanup;

    // Create agent with tools and memory
    const llm = openai({ model: "gpt-4o" });
    const requestAgent = agent({
      name: "assistant",
      tools,
      llm,
      memory,
      verbose: false,
      systemPrompt: tools.length > 0 ? SYSTEM_PROMPTS.withTools(tools.length) : SYSTEM_PROMPTS.noTools,
    });

    // Add user message to memory
    await memory.add({ role: "user", content: message });

    // Process with agent
    const contextualMessage = env.AUTH_ENABLED && auth.userId
      ? `[User: ${auth.userId}] ${message}`
      : message;

    const response = await requestAgent.run(contextualMessage);

    // Extract response text
    const responseText = extractResponseText(response);

    // Store assistant response in memory
    await memory.add({ role: "assistant", content: String(responseText) });

    // Get MCP metadata and tool calls
    const mcpMetadata = toolsMetadata.getMetadata();
    const toolCalls = toolsMetadata.toolCalls;
    const mcpToolCount = toolsMetadata.mcpClient?.tools?.length || 0;

    // Build response payload with full metadata
    const responsePayload = {
      response: responseText,
      context: env.AUTH_ENABLED && auth.userId
        ? createUserContext(auth)
        : { message: "Running without authentication" },
      metadata: {
        requestId: reqId,
        userId: auth.userId || null,
        userName: auth.userName || null,
        firstName: auth.firstName || null,
        lastName: auth.lastName || null,
        tokenHint: auth.accessToken || null,
        scopes: mcpMetadata.exchangedScopes ? mcpMetadata.exchangedScopes.split(' ') : [],
        mcpTools: mcpToolCount,
        toolCalls: toolCalls,
        tokenExchangeTime: mcpMetadata.tokenExchangeTime
      }
    };

    return context.json(responsePayload);

  } catch (error) {
    log.error("ERROR:", { message: error.message, type: error.constructor.name });
    return context.json({ error: "Sorry, I encountered an error processing your request." }, 500);
  } finally {
    await toolsCleanup();
  }
}