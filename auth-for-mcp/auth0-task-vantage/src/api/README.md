# 🚀 Task Vantage REST API

Core REST endpoints for Task Vantage, built with [Hono](https://hono.dev/) with JWT authentication via Auth0.

**Local Development**: `http://localhost:8787`
**Production**: Deployed to Vercel as serverless functions

## Authentication

Behavior depends on environment variables:

- If `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` are set  
  - All routes are protected by `@auth0/auth0-api-js`.  
  - Send `Authorization: Bearer <access_token>` where the token is issued by Auth0 for your API audience.  
  - These tokens may come from a normal login flow or from Auth0 Custom Token Exchange if you use that upstream. The API does not need to know how the token was minted as long as it is valid for the configured audience.

- If either are missing  
  - Auth is disabled.  
  - Server runs fully open.  
  - A warning is logged: `⚠️  Missing AUTH0_DOMAIN / AUTH0_AUDIENCE. Running with NO AUTH ❌`

## 🔧 Environment Configuration

### Required Variables

* `AUTH0_DOMAIN` - Your Auth0 domain (e.g., your-domain.auth0.com) - **Shared across all services**
* `API_AUTH0_AUDIENCE` - API audience identifier (e.g., https://api.taskvantage.com)

### Optional Variables

* `API_PORT` - REST API port (default: `8787`)
* `API_BASE_URL` - Base URL for API service (default: `http://localhost:8787`)
* `API_DEFAULT_ORG` - Default organization (default: `demo-org`)

### Authentication Detection

The service automatically detects authentication configuration:
- ✅ **Auth Enabled**: Both `AUTH0_DOMAIN` and `API_AUTH0_AUDIENCE` are set
- ⚠️ **No Auth Mode**: Either variable is missing - runs fully open with warning

### Custom Token Exchange notes (optional)

If you enable Auth0 Custom Token Exchange for your application, the API works the same. Your upstream service (for example the MCP server) exchanges its incoming token for an Auth0 access token and then calls this API with that token in the `Authorization` header. Make sure your Auth0 application is first-party, OIDC conformant, has Custom Token Exchange enabled, and the exchanged token’s `aud` matches your API identifier.

## Entities and Endpoints

This diagram shows how core entities relate to the API endpoints that create, retrieve, and modify them.

```mermaid
flowchart TD
  subgraph Entities
    Project[Project]:::entity
    Task[Task]:::entity
    Tag[Tag]:::entity
    Comment[Comment]:::entity
  end

  subgraph Endpoints
    E1[/POST /projects/]:::write
    E2[/GET /projects/]:::read
    E3[/POST /tasks/]:::write
    E4[/GET /tasks/:id/]:::read
    E5[/GET /tasks/]:::read
    E6[/PATCH /tasks/:id/status/]:::write
    E7[/PATCH /tasks/:id/assign/]:::write
    E8[/POST /tasks/:id/comments/]:::write
    E9[/PATCH /tasks/:id/tags/]:::write
    E10[/GET /tasks-due-soon/]:::read
  end

  E1 --> Project
  E2 --> Project
  E3 --> Task
  E3 --> Project
  E4 --> Task
  E5 --> Task
  E6 --> Task
  E7 --> Task
  E8 --> Comment
  Comment --> Task
  E9 --> Tag
  Tag --> Task
  E10 --> Task

  classDef entity fill:#D6EAF8,stroke:#5DADE2,color:#1B4F72;
  classDef read fill:#FCF3CF,stroke:#F1C40F,color:#7D6608;
  classDef write fill:#E8DAEF,stroke:#A569BD,color:#512E5F;

  class E2,E4,E5,E10 read;
  class E1,E3,E6,E7,E8,E9 write;
````

## Endpoints

### Projects

| Method | Path        | Description      | Query or body fields         |
| ------ | ----------- | ---------------- | ---------------------------- |
| POST   | `/projects` | Create a project | body: `name`, `description?` |
| GET    | `/projects` | List projects    | query: `q?` (fuzzy search)   |

### Tasks

| Method | Path                  | Description              | Query or body fields                                                                                     |
| ------ | --------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| POST   | `/tasks`              | Create a task            | body: `projectId`, `title`, `ownerId`, `description?`, `dueAt?`, `tags?[]`                               |
| GET    | `/tasks/:id`          | Get a task by id         | none                                                                                                     |
| GET    | `/tasks`              | List tasks with filters  | query: `projectId?`, `ownerId?`, `status?`, `tag?`, `q?`, `dueBefore?`, `dueAfter?`, `limit?`, `offset?` |
| PATCH  | `/tasks/:id/status`   | Update task status       | body: `status` (`todo`, `in_progress`, `done`)                                                           |
| PATCH  | `/tasks/:id/assign`   | Assign or reassign owner | body: `ownerId`                                                                                          |
| POST   | `/tasks/:id/comments` | Add a comment            | body: `text`                                                                                             |
| PATCH  | `/tasks/:id/tags`     | Add or remove tags       | body: `add?[]`, `remove?[]`                                                                              |

### Due Soon

| Method | Path              | Description             | Query fields                            |
| ------ | ----------------- | ----------------------- | --------------------------------------- |
| GET    | `/tasks-due-soon` | Tasks due within N days | `days?` (default 7, max 90), `ownerId?` |

## Scopes

The following scopes are used to protect the endpoints:

| Scope            | Description                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `projects:read`  | Read project lists and details (`GET /projects`).                                                                                        |
| `projects:write` | Create or modify projects (`POST /projects`).                                                                                            |
| `tasks:read`     | Read tasks, single or list, and due-soon (`GET /tasks*`, `GET /tasks-due-soon`).                                                         |
| `tasks:write`    | Create or modify tasks and related resources (`POST /tasks`, `PATCH /tasks/:id/*`, `POST /tasks/:id/comments`, `PATCH /tasks/:id/tags`). |

Notes for curl:

* In auth mode include `-H "Authorization: Bearer $TOKEN"`.
* In no-auth mode omit that header.
