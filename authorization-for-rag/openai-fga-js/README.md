# OpenAI + RAG + Auth0 FGA

## Getting Started

### Prerequisites

- An Auth0 FGA account, you can create one [here](https://dashboard.fga.dev).
- An OpenAI account and API key create one [here](https://platform.openai.com).

### Setup

1. Create a `.env` file using the format below:

   ```sh
   # OpenAI
   OPENAI_API_KEY=

   # Auth0 FGA
   FGA_STORE_ID=
   FGA_CLIENT_ID=
   FGA_CLIENT_SECRET=
   # Required only for non-US regions
   FGA_API_URL=https://api.xxx.fga.dev
   FGA_API_AUDIENCE=https://api.xxx.fga.dev/
   ```

#### Obtain OpenAI API Key

[Use this page for instructions on how to find your OpenAI API key](https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key). Once you have your key, update the `.env` file accordingly.

#### Configure Auth0 FGA

1. Add the model: Under Model Explorer update the model to contain the model below:

   ```
   model
     schema 1.1

   type user

   type doc
     relations
       define owner: [user]
       define viewer: [user, user:*]
   ```

2. Create a client: Navigate to _Settings_ and in the _Authorized Clients_ section click **+ Create Client** button. On the new page give your client a name and mark all three client permissions then click **Create**.

3. Copy the information on the modal and update your `.env` file with the values you now have for `FGA_STORE_ID`, `FGA_CLIENT_ID`, and `FGA_CLIENT_SECRET`. Click **Continue** to get values for `FGA_API_URL` and `FGA_API_AUDIENCE`.

### How to run it

1. Install dependencies. If you want to run with local dependencies follow root instructions.

   ```sh
   npm install
   ```

2. Initialize Auth0 FGA with the necessary model and tuples.

   ```sh
   npm run fga:init
   ```

3. Running the example
   ```sh
   npm start
   ```


---

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="https://cdn.auth0.com/website/sdks/logos/auth0_light_mode.png"   width="150">
    <source media="(prefers-color-scheme: dark)" srcset="https://cdn.auth0.com/website/sdks/logos/auth0_dark_mode.png" width="150">
    <img alt="Auth0 Logo" src="https://cdn.auth0.com/website/sdks/logos/auth0_light_mode.png" width="150">
  </picture>
</p>
<p align="center">Auth0 is an easy to implement, adaptable authentication and authorization platform. To learn more checkout <a href="https://auth0.com/why-auth0">Why Auth0?</a></p>
<p align="center">
This project is licensed under the Apache 2.0 license. See the <a href="/LICENSE"> LICENSE</a> file for more info.</p>

