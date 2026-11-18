import { describe, expect, it } from "vitest";
import { loadAppConfig } from "../src/config.js";

const BASE = { ORDERS_AUDIENCE: "https://orders.api/", ORDERS_API_URL: "http://localhost:3003" };

describe("the listening port", () => {
  it("is the port of AUTH0_AUDIENCE, so the URL and the port are set once", () => {
    expect(loadAppConfig({ ...BASE, AUTH0_AUDIENCE: "http://localhost:4123/mcp" }).port).toBe(4123);
  });

  it("is overridden by MCP_PORT when a proxy makes the public port differ", () => {
    expect(loadAppConfig({ ...BASE, AUTH0_AUDIENCE: "https://mcp.example.com/mcp", MCP_PORT: "8080" }).port).toBe(8080);
    expect(loadAppConfig({ ...BASE, AUTH0_AUDIENCE: "http://localhost:4123/mcp", MCP_PORT: "9000" }).port).toBe(9000);
  });

  it("is 3001 when the audience names no port", () => {
    expect(loadAppConfig({ ...BASE, AUTH0_AUDIENCE: "https://mcp.example.com/mcp" }).port).toBe(3001);
    expect(loadAppConfig({ ...BASE }).port).toBe(3001);
    expect(loadAppConfig({ ...BASE, AUTH0_AUDIENCE: "urn:acme:mcp" }).port).toBe(3001);
  });

  it("still refuses a port that is not a number", () => {
    expect(() => loadAppConfig({ ...BASE, MCP_PORT: "abc" })).toThrow(/MCP_PORT/);
  });
});
