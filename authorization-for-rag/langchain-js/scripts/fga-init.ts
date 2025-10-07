import "dotenv/config";

import { CredentialsMethod, OpenFgaClient } from "@openfga/sdk";

/**
 * Initializes the OpenFgaClient, writes an authorization model, and configures pre-defined tuples.
 *
 * This function performs the following steps:
 *    1. Creates an instance of OpenFgaClient with the necessary configuration.
 *    2. Writes an authorization model with specified schema version and type definitions.
 *    3. Configures pre-defined tuples using the newly created authorization model.
 */
async function main() {
  const fgaClient = new OpenFgaClient({
    apiUrl: process.env.FGA_API_URL || "https://api.us1.fga.dev",
    storeId: process.env.FGA_STORE_ID!,
    credentials: {
      method: CredentialsMethod.ClientCredentials,
      config: {
        apiTokenIssuer: process.env.FGA_API_TOKEN_ISSUER || "auth.fga.dev",
        apiAudience: process.env.FGA_API_AUDIENCE || "https://api.us1.fga.dev/",
        clientId: process.env.FGA_CLIENT_ID!,
        clientSecret: process.env.FGA_CLIENT_SECRET!,
      },
    },
  });

  // 01. WRITE MODEL
  const model = await fgaClient.writeAuthorizationModel({
    schema_version: "1.1",
    type_definitions: [
      { type: "user" },
      {
        type: "doc",
        relations: { owner: { this: {} }, viewer: { this: {} } },
        metadata: {
          relations: {
            owner: { directly_related_user_types: [{ type: "user" }] },
            viewer: {
              directly_related_user_types: [
                { type: "user" },
                { type: "user", wildcard: {} },
              ],
            },
          },
        },
      },
    ],
  });

  console.log("NEW MODEL ID: ", model.authorization_model_id);

  // 02. CONFIGURE PRE-DEFINED TUPLES
  await fgaClient.write(
    {
      writes: [
        { user: "user:*", relation: "viewer", object: "doc:public-doc" }
      ],
    },
    {
      authorizationModelId: model.authorization_model_id,
    }
  );
}

main().catch(console.error);
