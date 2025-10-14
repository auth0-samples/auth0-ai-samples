# [Asynchronous Authorization with Vercel AI SDK](https://auth0.com/ai/docs/async-authorization)

[Quickstart](https://auth0.com/ai/docs/async-authorization)

## Getting Started

### Prerequisites

- An OpenAI account and API key. You can create one [here](https://platform.openai.com).
  - [Use this page for instructions on how to find your OpenAI API key](https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key)
- An **[Auth0](https://auth0.com)** account and the following settings and resources configured:
  - An application for CIBA with the following settings:
    - **Application Type**: `Web Application`
    - **Grant Type**: `CIBA` (or `urn:openid:params:grant-type:ciba`)
  - An API with the following settings:
    - **Name**: `Sample Stock API`
    - **Identifier**: `sample-stock-api`
    - **Permissions**: `trade:stock`
  - **Push Notifications** using [Auth0 Guardian](https://auth0.com/docs/secure/multi-factor-authentication/auth0-guardian) must be `enabled`
  - A test user enrolled in Guardian MFA.

### Setup the workspace `.env` file

Copy the `.env.example` file to `.env` and fill in the values for the following variables, using the settings obtained from the prerequisites:

```sh
# Auth0
AUTH0_DOMAIN="<auth0-domain>"
# Client for CIBA
AUTH0_CLIENT_ID="<auth0-client-id>"
AUTH0_CLIENT_SECRET="<auth0-client-secret>"

# API
STOCK_API_URL=http://an-api-url
STOCK_API_AUDIENCE=sample-stock-api

# OpenAI
OPENAI_API_KEY="openai-api-key"
```

### How to run it

1. Install dependencies.

   ```sh
   bun install # or npm install
   ```

2. Update your user id in the sample [src/index.ts](./src/index.ts) provided.
  ```typescript
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system: "You are an assistant. Invoke the tool if needed, then respond with a past-tense confirmation.",
      prompt: userPrompt,
      // pass an Auth0 user id. For example, 'auth0|100000000000000000000' or 'google-oauth2|100000000000000000000'
      tools: { buy: buy({ userId: "<authenticated-user-id>" }) },
      stopWhen: stepCountIs(3), // tool call + result + final assistant message
    });
  ```

3. Running the example

   ```sh
   bun start # or npm start
   ```

## License

Apache-2.0
