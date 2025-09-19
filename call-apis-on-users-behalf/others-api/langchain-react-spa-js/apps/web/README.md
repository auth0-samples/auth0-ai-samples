# Agent Chat UI with Auth0

Agent Chat UI is a Vite + React application which enables chatting with any LangGraph server with a `messages` key through a chat interface.

## Setup

> [!TIP]
> Don't want to run the app locally? Use the deployed site here: [agent-chat-ui.vercel.app](https://agentchat.vercel.app)!

First, clone the repository:

```bash
git clone https://github.com/langchain-ai/agent-chat-ui.git

cd agent-chat-ui
```

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm dev
```

The app will be available at `http://localhost:5173`.

## Usage

Once the app is running (or if using the deployed site), you'll first be prompted to:
- **Login** with Auth0 using your [Universal Login](https://auth0.com/docs/authenticate/login/auth0-universal-login).

After returning to the app and logged in, you will then prompted for:
- **Deployment URL**: The URL of the LangGraph server you want to chat with. This can be a production or development URL.
- **Assistant/Graph ID**: The name of the graph, or ID of the assistant to use when fetching, and submitting runs via the chat interface.

After entering these values, click `Continue`. You'll then be redirected to a chat interface where you can start chatting with your LangGraph server.
