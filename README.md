# Auth for Generative AI Applications

Sample applications showcasing [Auth0's](https://www.auth0.ai/) authentication and authorization capabilities in the context of generative AI applications.

You can find a [hosted demo here](https://demo.auth0.ai/).

Samples are organized as below:

- [**authenticate-users**](https://auth0.com/ai/docs/user-authentication): Easily implement login experiences, tailor made for AI agents. Whether for chatbots or background agents.
- [**call-apis-on-users-behalf**](https://auth0.com/ai/docs/call-others-apis-on-users-behalf): Use secure standards to get API tokens for Google, Github and more. Seamlessly integrate your app with other products.
- [**authorization-for-rag**](https://auth0.com/ai/docs/authorization-for-rag): Only retrieve documents users have access to. Avoid leaking data to a user that should not have access to it.
- [**asynchronous-authorization**](https://auth0.com/ai/docs/async-authorization): Let your autonomous, async agents do work in the background. Use Async Auth to request approval when needed.
- [**auth-for-mcp**](./auth-for-mcp/auth0-task-vantage): A comprehensive task management demo showcasing Auth0 integration with MCP (Model Context Protocol), REST API, AI agents, and web applications.

[**Sign up for Auth0 AI**](https://auth0.com/signup?onboard_app=genai&ocid=7014z000001NyoxAAC-aPA4z0000008OZeGAM)

# Quickstart releases

To support users' ability to download individual quickstarts from the [Auth for AI Agents docs site](https://auth0.com/ai/docs), this repository contains a Github Action to generate downloadable zip file artifacts of each quickstart. This action will run on any change within a quickstart folder on `main` branch, ensuring that the latest artifacts are always available for download.

To **include** a new quickstart, add a `release-config.yml` file to the quickstart's base directory, for example:

```
// authorization-for-rag/langchain-js/release-config.yml

category: "authorization-for-rag"
framework: "langchain-js"
included: true
```

You can *optionally* add an `exclude_patterns` to the `release-config.yml` if you want to exclude any particular files from the release. Note that the release script already excludes and scans for common sensitive files. Example:

```
// release-config.yml

exclude_patterns:
  - "*.tmp"
  - "debug.log"
  - "test-data/*"
  - ".env.test"
  - "node_modules/.cache/*"
```

To **exclude** an existing quickstart, within the `release-config.yml` file, switch `included` to `false`.