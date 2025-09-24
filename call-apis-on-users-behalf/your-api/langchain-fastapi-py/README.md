# Assistant0: AI Personal Assistant secured with Auth0 (LangGraph Python / FastAPI)

Assistant0 is a personal AI assistant that connects to multiple tools to help you stay organized and productive. This project demonstrates how to **call third‑party APIs on a user’s behalf** (e.g., Google Calendar) using **Auth0 Token Vault**, **LangGraph (Python, State Graph + CLI)**, and **FastAPI**.

## What’s inside

- **LangGraph (Python, State Graph + CLI)** for building agentic workflows.
- **FastAPI** as the backend (API + tool integrations).
- **React + Vite (SPA)** as the frontend.
- **Auth0 AI SDK (Python)** and **Auth0 FastAPI SDK** for authentication and securely obtaining tokens to call third‑party APIs.
- *(Optional)* **Auth0 FGA** for fine‑grained authorization policies across tools/RAG.

> **Update in approach:** instead of `langgraph.prebuilt`, this project uses **LangGraph CLI** and **State Graph** (`graph`/`state_graph`). This aligns the Python version with the JS approach and enables using a **custom auth handler** together with Auth0/Token Vault.

---

## Prerequisites (Auth0 and providers)

1. **Auth0 account**
2. **Auth0 Application (Regular Web Application)**
  - Dashboard → Applications → **Create Application** → *Regular Web Application*.
  - **Application URIs:**
    - **Allowed Callback URLs:** `http://localhost:8000/api/auth/callback`
    - **Allowed Logout URLs:** `http://localhost:5173`
  - Save changes.
3. **Enable Token Vault Grant**
  - Applications → *Your App* → **Settings** → **Advanced** → **Grant Types** → enable **Token Vault**.
4. **Google Social Integration** (so the agent can call Google APIs like Calendar on the user’s behalf).
5. **LLM provider** – e.g., **OpenAI** (API key).

---

## Quickstart

Clone the repository and navigate to the Python/FastAPI example:

```bash
git clone https://github.com/auth0-samples/auth0-ai-samples.git
cd auth0-ai-samples/call-apis-on-users-behalf/your-api/langchain-fastapi-py
```

Project structure:

- `backend/` – FastAPI + LangGraph agent (Python/State Graph).
- `frontend/` – React + Vite SPA.

---

## Backend — setup & run

From the `backend` directory:

```bash
cd backend
```

Copy and edit environment variables:

```bash
cp .env.example .env
```

Edit `.env`:

```dotenv
# Auth0
APP_BASE_URL='http://localhost:8000'
AUTH0_SECRET='<random 32-byte hex>'
AUTH0_DOMAIN='<your-tenant>.auth0.com'
AUTH0_CLIENT_ID='<your_app_client_id>'
AUTH0_CLIENT_SECRET='<your_app_client_secret>'

# OpenAI (or another supported provider)
OPENAI_API_KEY="<YOUR_API_KEY>"

# LangGraph (local server)
LANGGRAPH_API_URL=http://localhost:54367

# (Optional) Auth0 FGA
FGA_STORE_ID=""
FGA_CLIENT_ID=""
FGA_CLIENT_SECRET=""
FGA_API_URL=""
```

Generate `AUTH0_SECRET`:

```bash
openssl rand -hex 32
```

Install dependencies (e.g., using `uv`):

```bash
uv sync --frozen
```

Run the FastAPI backend:

```bash
source .venv/bin/activate
uv pip install auth0_fastapi
fastapi dev app/main.py
```

---

## LangGraph — local server (CLI)

In a new terminal (with the same virtualenv activated):

```bash
source .venv/bin/activate
uv pip install -U langgraph-api
langgraph dev --port 54367 --allow-blocking
```

This starts an **in‑memory LangGraph server** at `http://localhost:54367` and may open **LangGraph Studio** (you can close it).

---

## Frontend — run

In a third terminal:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

The app starts on `http://localhost:5173`.

> Log in with **Google** (if you were already logged in, log out and log back in).  
> Then ask the agent to list upcoming events in your Google Calendar — it should use **Token Vault** to obtain and use your token.

---

## Links & short “what is it”

- **Starter: new-langgraph-project (Python)**  
  https://github.com/langchain-ai/new-langgraph-project/tree/main  
  *A ready‑to‑use Python skeleton for LangGraph with CLI and State Graph; most similar to the JS “create‑agent‑chat‑app”.*

- **Custom Auth (LangGraph Platform)**  
  https://docs.langchain.com/langgraph-platform/custom-auth  
  *How to plug in your own auth logic (e.g., Auth0/Token Vault) with LangGraph Platform.*

- **Local Server / CLI — prerequisites & run**  
  https://langchain-ai.github.io/langgraph/tutorials/langgraph-platform/local-server/#prerequisites  
  *How to install and run the local server via `langgraph dev`.*

---

## Architecture notes

- **Migration from `langgraph.prebuilt` → State Graph + CLI**
  - Brings parity with the JS State Graph approach.
  - Enables a **custom auth handler** with Auth0 (Token Vault), locally (CLI) and on LangGraph Platform.

- **Where is the agent configured?**  
  Agent graph/tools and logic live under the backend’s `app/` directory (e.g., `backend/app/...`). That’s where you customize prompts, model, tools, and the State Graph flow.

---

## License

MIT — see `LICENSE`.

## Author

Built by [Juan Cruz Martinez](https://github.com/jcmartinezdev).
