import { auth0Provider } from "@xmcp-dev/auth0";
import {
  DOMAIN,
  AUDIENCE,
  BASE_URL,
  CLIENT_ID,
  CLIENT_SECRET,
  SCOPES,
} from "./config";

export default auth0Provider({
  domain: DOMAIN,
  audience: AUDIENCE,
  baseURL: BASE_URL,
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  scopesSupported: SCOPES,
});
