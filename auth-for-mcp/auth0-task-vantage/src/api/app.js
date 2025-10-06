import * as env from './env.js';
import { Hono } from 'hono';
import { applyAuth, getAuth } from './auth.js';
import { randomUUID } from 'node:crypto';
import { createStore } from './store.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('api-server');
const db = createStore();
const app = new Hono();
applyAuth(app);

const json = (c, data, code = 200) => c.json(data, code);

// scope helpers
const hasScope = (c, needed) => {
  if (!env.AUTH_ENABLED) return true; // bypass in open mode
  const { scopes } = getAuth(c);
  return scopes.includes(needed);
};
const requireScope = needed => c => {
  if (!hasScope(c, needed)) {
    const { userId } = env.AUTH_ENABLED ? getAuth(c) : { userId: 'anonymous' };
    log.warn('DENIED:', { principal: userId, scope: needed });
    return c.json({ error: 'insufficient_scope', needed }, 403);
  }
};

// Projects
app.post('/projects', async c => {
  const err = requireScope('projects:write')(c); if (err) return err;

  const { orgId } = getAuth(c);
  const { name, description = '' } = await c.req.json().catch(() => ({}));
  if (!name) return json(c, { error: 'name is required' }, 400);

  const id = randomUUID();
  const now = new Date().toISOString();
  const project = { id, orgId, name, description, createdAt: now };
  await db.projects.set(id, project);
  log.log('Project created:', { id, name, orgId });
  return json(c, project, 201);
});

app.get('/projects', async c => {
  const err = requireScope('projects:read')(c); if (err) return err;

  const { orgId } = getAuth(c);
  const q = (c.req.query('q') || '').toLowerCase();
  const items = (await db.projects.values())
    .filter(p => p.orgId === orgId)
    .filter(p => (q ? (p.name + ' ' + p.description).toLowerCase().includes(q) : true))
    .sort((a, b) => a.name.localeCompare(b.name));
  log.log('PROJECTS listed:', { orgId, count: items.length, query: q || 'all' });
  return json(c, items);
});

// Tasks
app.post('/tasks', async c => {
  const err = requireScope('tasks:write')(c); if (err) return err;

  const { orgId, userId } = getAuth(c);
  const b = await c.req.json().catch(() => ({}));
  const { projectId, title, ownerId, description = '', dueAt = null, tags = [] } = b;
  if (!projectId || !title || !ownerId) {
    return json(c, { error: 'projectId, title, ownerId are required' }, 400);
  }
  const project = await db.projects.get(projectId);
  if (!project || project.orgId !== orgId) return json(c, { error: 'project not found' }, 404);

  const id = randomUUID();
  const now = new Date().toISOString();
  const due = dueAt ? new Date(dueAt) : null;
  const task = {
    id,
    orgId,
    projectId,
    title,
    description,
    ownerId,
    dueAt: due && !Number.isNaN(due.getTime()) ? due.toISOString() : null,
    status: 'todo',
    tags: [...new Set(tags)],
    comments: [],
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  };
  await db.tasks.set(id, task);
  log.log('TASK created:', { id, title, projectId, ownerId });
  return json(c, task, 201);
});

app.get('/tasks/:id', async c => {
  const err = requireScope('tasks:read')(c); if (err) return err;

  const { orgId } = getAuth(c);
  const t = await db.tasks.get(c.req.param('id'));
  if (!t || t.orgId !== orgId) return json(c, { error: 'not found' }, 404);
  return json(c, t);
});

app.get('/tasks', async c => {
  const err = requireScope('tasks:read')(c); if (err) return err;

  const { orgId } = getAuth(c);
  const qp = c.req.query;
  const projectId = qp.projectId;
  const ownerId = qp.ownerId;
  const status = qp.status;
  const tag = qp.tag;
  const q = (qp.q || '').toLowerCase();
  const dueBefore = qp.dueBefore ? new Date(qp.dueBefore) : null;
  const dueAfter = qp.dueAfter ? new Date(qp.dueAfter) : null;
  const limit = Math.min(parseInt(qp.limit || '100', 10), 500);
  const offset = Math.max(parseInt(qp.offset || '0', 10), 0);

  let items = (await db.tasks.values()).filter(t => t.orgId === orgId);
  if (projectId) items = items.filter(t => t.projectId === projectId);
  if (ownerId) items = items.filter(t => t.ownerId === ownerId);
  if (status) items = items.filter(t => t.status === status);
  if (tag) items = items.filter(t => t.tags.includes(tag));
  if (dueBefore && !Number.isNaN(dueBefore.getTime())) items = items.filter(t => t.dueAt && new Date(t.dueAt) <= dueBefore);
  if (dueAfter && !Number.isNaN(dueAfter.getTime())) items = items.filter(t => t.dueAt && new Date(t.dueAt) >= dueAfter);
  if (q) items = items.filter(t => [t.title, t.description, t.ownerId, ...(t.tags || [])].join(' ').toLowerCase().includes(q));
  items.sort((a, b) => {
    const ad = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const bd = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    return ad - bd || a.title.localeCompare(b.title);
  });
  const page = items.slice(offset, offset + limit);

  log.log('TASKS listed:', { orgId, count: page.length, status: status || 'all' });

  return json(c, { total: items.length, items: page });
});

app.patch('/tasks/:id/status', async c => {
  const err = requireScope('tasks:write')(c); if (err) return err;

  const { orgId } = getAuth(c);
  const id = c.req.param('id');
  const t = await db.tasks.get(id);
  if (!t || t.orgId !== orgId) return json(c, { error: 'not found' }, 404);
  const { status } = await c.req.json().catch(() => ({}));
  if (!['todo', 'in_progress', 'done'].includes(status)) return json(c, { error: 'invalid status' }, 400);
  t.status = status;
  t.updatedAt = new Date().toISOString();
  await db.tasks.set(id, t);
  return json(c, t);
});

app.patch('/tasks/:id/assign', async c => {
  const err = requireScope('tasks:write')(c); if (err) return err;

  const { orgId } = getAuth(c);
  const id = c.req.param('id');
  const t = await db.tasks.get(id);
  if (!t || t.orgId !== orgId) return json(c, { error: 'not found' }, 404);
  const { ownerId } = await c.req.json().catch(() => ({}));
  if (!ownerId) return json(c, { error: 'ownerId required' }, 400);
  t.ownerId = ownerId;
  t.updatedAt = new Date().toISOString();
  await db.tasks.set(id, t);
  return json(c, t);
});

app.post('/tasks/:id/comments', async c => {
  const err = requireScope('tasks:write')(c); if (err) return err;

  const { orgId, userId } = getAuth(c);
  const id = c.req.param('id');
  const t = await db.tasks.get(id);
  if (!t || t.orgId !== orgId) return json(c, { error: 'not found' }, 404);
  const { text } = await c.req.json().catch(() => ({}));
  if (!text) return json(c, { error: 'text required' }, 400);
  const comment = { id: randomUUID(), authorId: userId, text, createdAt: new Date().toISOString() };
  t.comments.push(comment);
  t.updatedAt = comment.createdAt;
  await db.tasks.set(id, t);
  return json(c, comment, 201);
});

app.patch('/tasks/:id/tags', async c => {
  const err = requireScope('tasks:write')(c); if (err) return err;

  const { orgId } = getAuth(c);
  const id = c.req.param('id');
  const t = await db.tasks.get(id);
  if (!t || t.orgId !== orgId) return json(c, { error: 'not found' }, 404);
  const { add = [], remove = [] } = await c.req.json().catch(() => ({}));
  const cur = new Set(t.tags || []);
  add.forEach(x => cur.add(x));
  remove.forEach(x => cur.delete(x));
  t.tags = [...cur];
  t.updatedAt = new Date().toISOString();
  await db.tasks.set(id, t);
  return json(c, t);
});

app.get('/tasks-due-soon', async c => {
  const err = requireScope('tasks:read')(c); if (err) return err;

  const { orgId } = getAuth(c);
  const days = Math.min(parseInt(c.req.query('days') || '7', 10), 90);
  const ownerId = c.req.query('ownerId') || null;
  const horizon = Date.now() + days * 86400000;
  let items = (await db.tasks.values()).filter(
    t => t.orgId === orgId && t.dueAt && new Date(t.dueAt).getTime() <= horizon && t.status !== 'done',
  );
  if (ownerId) items = items.filter(t => t.ownerId === ownerId);
  items.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  return json(c, items);
});

// Delete project
app.delete('/projects/:id', async c => {
  const err = requireScope('projects:write')(c); if (err) return err;

  const { orgId } = getAuth(c);
  const id = c.req.param('id');
  const project = await db.projects.get(id);
  if (!project || project.orgId !== orgId) return json(c, { error: 'project not found' }, 404);

  // Delete all tasks in the project first
  const projectTasks = (await db.tasks.values()).filter(t => t.projectId === id && t.orgId === orgId);
  for (const task of projectTasks) {
    await db.tasks.delete(task.id);
  }

  await db.projects.delete(id);
  log.log('Project deleted:', { id, name: project.name, orgId, tasksDeleted: projectTasks.length });
  return json(c, { message: 'Project and associated tasks deleted successfully' });
});

// Delete task
app.delete('/tasks/:id', async c => {
  const err = requireScope('tasks:write')(c); if (err) return err;

  const { orgId } = getAuth(c);
  const id = c.req.param('id');
  const task = await db.tasks.get(id);
  if (!task || task.orgId !== orgId) return json(c, { error: 'task not found' }, 404);

  await db.tasks.delete(id);
  log.log('Task deleted:', { id, title: task.title, projectId: task.projectId, orgId });
  return json(c, { message: 'Task deleted successfully' });
});

app.post('/admin/clear', async c => {
  const err = requireScope('projects:write')(c); if (err) return err; // Require admin-level access

  const { orgId, userId } = getAuth(c);

  try {
    await db.projects.clear();
    await db.tasks.clear();

    log.log('ADMIN: All data cleared', { userId, orgId });
    return json(c, { message: 'All data cleared successfully' });
  } catch (error) {
    log.warn('ADMIN: Clear failed', { userId, orgId, error: String(error) });
    return json(c, { error: 'Failed to clear data' }, 500);
  }
});

export default function createApp() {
  return app;
}
