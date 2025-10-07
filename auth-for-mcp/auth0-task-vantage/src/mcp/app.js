import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {z} from 'zod';
import {createMcpHandler, metadataCorsOptionsRequestHandler, protectedResourceHandler, withMcpAuth, generateProtectedResourceMetadata,} from 'mcp-handler';

import * as env from './env.js';
import {callApi, enc, qs} from './client.js';
import {createMcpAuthFunction} from './auth.js';
import {createLogger} from '../utils/logger.js';

const log = createLogger('mcp-server');

export const formatResult = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });

const baseHandler = createMcpHandler(
  (server) => {
    if (server.setInstructions) {
      server.setInstructions(`You manage Task Vantage projects and tasks for an organization.

Key behaviors:
- When user asks for "my tasks" or "my open tasks", use tv_list_tasks with ownerId set to the current user's ID
- When user asks for "team tasks" or "all tasks", use tv_list_tasks without ownerId filter
- Status values are: todo, in_progress, done
- Always prefer list/search operations before mutating data
- Use tv_due_soon for time-based urgency queries
- Task ownership (ownerId) is separate from who can see tasks (organization-based access)

Data consistency and concurrent access:
- ALWAYS refresh data before bulk operations (e.g., "move all my tasks to todo")
- Multiple users may be editing tasks simultaneously via web, agent, or other interfaces
- Before bulk updates: 1) Query current state, 2) Confirm with user if needed, 3) Update individual tasks
- For bulk operations, process tasks individually and handle failures gracefully
- If a task update fails, continue with remaining tasks and report what succeeded/failed
- Warn users when performing operations on potentially stale data
- Consider suggesting user refresh or verify current state before major changes`);
    }

    // Create project tool
    server.tool(
      'tv_create_project',
      'Create a project.',
      {
        name: z.string().min(1),
        description: z.string().optional(),
      },
      async (args, extra) => {
        const session = createSession(extra);
        const principal = session?.extra?.sub || 'anonymous';
        log.log(`TOOL tv_create_project:`, { principal, auth: session?.token ? `${session.token[0]}***` : 'none', args });
        const result = await callApi('/projects', { method: 'POST', body: args, session });
        return formatResult(result);
      }
    );

    // List projects tool
    server.tool(
      'tv_list_projects',
      'List projects.',
      {
        q: z.string().optional(),
      },
      async ({ q }, extra) => {
        const session = createSession(extra);
        const principal = session?.extra?.sub || 'anonymous';
        log.log(`TOOL tv_list_projects:`, { principal, auth: session?.token ? `${session.token[0]}***` : 'none', args: { q } });
        const result = await callApi(q ? `/projects?q=${enc(q)}` : '/projects', { session });
        return formatResult(result);
      },
      { readOnlyHint: true, title: 'List projects' }
    );

    // Create task tool
    server.tool(
      'tv_create_task',
      'Create a task.',
      {
        projectId: z.string().min(1),
        title: z.string().min(1).optional(),
        name: z.string().min(1).optional(), // alias for title
        description: z.string().optional(),
        ownerId: z.string().min(1).optional(),
        dueAt: z.string().datetime().optional(),
        tags: z.array(z.string()).default([]),
      },
      async (args, extra) => {
        const session = createSession(extra);
        log.log('tv_create_task original args:', args);
        const taskData = {
          ...args,
          title: args.title || args.name,
          ownerId: args.ownerId || session?.extra?.sub || 'default-user',
        };
        delete taskData.name;
        log.log('tv_create_task transformed args:', taskData);
        const result = await callApi('/tasks', { method: 'POST', body: taskData, session });
        return formatResult(result);
      }
    );

    // Get task tool
    server.tool(
      'tv_get_task',
      'Get a task by id.',
      {
        taskId: z.string().min(1),
      },
      async ({ taskId }, extra) => {
        const session = createSession(extra);
        const principal = session?.extra?.sub || 'anonymous';
        log.log(`TOOL tv_get_task:`, { principal, auth: session?.token ? `${session.token[0]}***` : 'none', args: { taskId } });
        const result = await callApi(`/tasks/${enc(taskId)}`, { session });
        return formatResult(result);
      },
      { readOnlyHint: true }
    );

    // List tasks tool
    server.tool(
      'tv_list_tasks',
      'Search and filter tasks within the organization. Supports filtering by projectId, ownerId (user ID who owns the task), status (todo/in_progress/done), tags, text search, and due dates. Returns paginated results.',
      {
        projectId: z.string().min(1).optional(),
        ownerId: z.string().min(1).optional(),
        status: z.enum(['todo', 'in_progress', 'done']).optional(),
        tag: z.string().optional(),
        q: z.string().optional(),
        dueBefore: z.string().datetime().optional(),
        dueAfter: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0),
      },
      async (args, extra) => {
        const session = createSession(extra);
        const principal = session?.extra?.sub || 'anonymous';
        log.log(`TOOL tv_list_tasks:`, { principal, auth: session?.token ? `${session.token[0]}***` : 'none', args });
        const result = await callApi(`/tasks?${qs(args)}`, { session });
        return formatResult(result);
      },
      { readOnlyHint: true, title: 'Search tasks' }
    );

    // Update task status tool
    server.tool(
      'tv_update_task_status',
      'Move a task to todo, in_progress, or done.',
      {
        taskId: z.string().min(1),
        status: z.enum(['todo', 'in_progress', 'done']),
      },
      async ({ taskId, status }, extra) => {
        const session = createSession(extra);
        const principal = session?.extra?.sub || 'anonymous';
        log.log(`TOOL tv_update_task_status:`, { principal, auth: session?.token ? `${session.token[0]}***` : 'none', args: { taskId, status } });
        const result = await callApi(`/tasks/${enc(taskId)}/status`, {
          method: 'PATCH',
          body: { status },
          session,
        });
        return formatResult(result);
      }
    );

    // Assign task tool
    server.tool(
      'tv_assign_task',
      'Assign or reassign a task.',
      {
        taskId: z.string().min(1),
        ownerId: z.string().min(1),
      },
      async ({ taskId, ownerId }, extra) => {
        const session = createSession(extra);
        const principal = session?.extra?.sub || 'anonymous';
        log.log(`TOOL tv_assign_task:`, { principal, auth: session?.token ? `${session.token[0]}***` : 'none', args: { taskId, ownerId } });
        return formatResult(await callApi(`/tasks/${enc(taskId)}/assign`, {
          method: 'PATCH',
          body: { ownerId },
          session,
        }));
      }
    );

    // Comment task tool
    server.tool(
      'tv_comment_task',
      'Add a short comment.',
      {
        taskId: z.string().min(1),
        text: z.string().min(1),
      },
      async ({ taskId, text }, extra) => {
        const session = createSession(extra);
        const principal = session?.extra?.sub || 'anonymous';
        log.log(`TOOL tv_comment_task:`, { principal, auth: session?.token ? `${session.token[0]}***` : 'none', args: { taskId, text } });
        return formatResult(await callApi(`/tasks/${enc(taskId)}/comments`, {
          method: 'POST',
          body: { text },
          session,
        }));
      }
    );

    // Tag task tool
    server.tool(
      'tv_tag_task',
      'Add or remove tags.',
      {
        taskId: z.string().min(1),
        add: z.array(z.string()).optional(),
        remove: z.array(z.string()).optional(),
      },
      async ({ taskId, add, remove }, extra) => {
        const session = createSession(extra);
        const principal = session?.extra?.sub || 'anonymous';
        log.log(`TOOL tv_tag_task:`, { principal, auth: session?.token ? `${session.token[0]}***` : 'none', args: { taskId, add, remove } });
        return formatResult(await callApi(`/tasks/${enc(taskId)}/tags`, {
          method: 'PATCH',
          body: { add, remove },
          session,
        }));
      }
    );

    // Due soon tool
    server.tool(
      'tv_due_soon',
      'List tasks due within N days (default 7, max 90). Only includes tasks with status todo or in_progress. Optionally filter by ownerId (user ID who owns the task).',
      {
        days: z.number().int().min(0).max(90).default(7),
        ownerId: z.string().min(1).optional(),
      },
      async (args, extra) => {
        const session = createSession(extra);
        const principal = session?.extra?.sub || 'anonymous';
        log.log(`TOOL tv_due_soon:`, { principal, auth: session?.token ? `${session.token[0]}***` : 'none', args });
        return formatResult(await callApi(`/tasks-due-soon?${qs(args)}`, { session }));
      },
      { readOnlyHint: true, title: 'Due soon' }
    );

    // Delete project tool
    server.tool(
      'tv_delete_project',
      'Delete a project and all its tasks.',
      {
        projectId: z.string().min(1),
      },
      async ({ projectId }, extra) => {
        const session = createSession(extra);
        const principal = session?.extra?.sub || 'anonymous';
        log.log(`TOOL tv_delete_project:`, { principal, auth: session?.token ? `${session.token[0]}***` : 'none', args: { projectId } });
        const result = await callApi(`/projects/${enc(projectId)}`, { method: 'DELETE', session });
        return formatResult(result);
      }
    );

    // Delete task tool
    server.tool(
      'tv_delete_task',
      'Delete a task.',
      {
        taskId: z.string().min(1),
      },
      async ({ taskId }, extra) => {
        const session = createSession(extra);
        const principal = session?.extra?.sub || 'anonymous';
        log.log(`TOOL tv_delete_task:`, { principal, auth: session?.token ? `${session.token[0]}***` : 'none', args: { taskId } });
        const result = await callApi(`/tasks/${enc(taskId)}`, { method: 'DELETE', session });
        return formatResult(result);
      }
    );
  },
  {},
  { basePath: '' }
);

// Helper to create session from auth info
function createSession(extra) {
  const auth = extra?.authInfo;
  return auth
    ? { token: auth.token, extra: auth.extra || {}, scopes: auth.scopes || [], clientId: auth.clientId }
    : null;
}

const handler = env.AUTH_ENABLED
  ? withMcpAuth(
    (req) => baseHandler(req),
    createMcpAuthFunction(env.AUTH0_DOMAIN, env.MCP_AUTH0_AUDIENCE),
    { required: true }
  )
  : baseHandler;

export default function createApp() {
  const app = new Hono();
  app.use('*', cors());

  app.get('/health', (c) => c.text('ok'));

  // Public redirect for OIDC discovery under /mcp → PRM metadata for ChatGPT compliance
  // See: https://community.openai.com/t/resolved-trouble-with-chatgpt-connector-oauth-detailed/1359112
  app.get('/mcp/.well-known/openid-configuration', (c) => {
    return c.redirect(`https://${env.AUTH0_DOMAIN}/.well-known/oauth-authorization-server`, 302);
  });

  // PRM endpoint so compliant clients discover the AS (only when auth is enabled)
  if (env.AUTH_ENABLED) {
    app.get('/.well-known/oauth-protected-resource', (c) => {
      const url = new URL(c.req.url);
      const baseUrl = `${url.protocol}//${url.host}`;
      const metadata = generateProtectedResourceMetadata({
        authServerUrls: env.AUTH0_DOMAIN ? [`https://${env.AUTH0_DOMAIN}`] : [],
        resourceUrl: `${baseUrl}/mcp`, // NOTE:This is a requirement for VS Code
      });
      return c.json(metadata, {
        headers: {
          'Cache-Control': 'max-age=3600',
        }
      });
    });
    app.options('/.well-known/oauth-protected-resource', (c) =>
      metadataCorsOptionsRequestHandler()(c.req.raw)
    );
  }

  // MCP endpoints
  app.all('/mcp', (c) => handler(c.req.raw));
  app.all('/mcp/*', (c) => handler(c.req.raw));

  return app;
}
