import { describe, expect, it } from "@jest/globals";

import { ensureConfiguration } from "../../configuration";

describe("Configuration", () => {
  it("should initialize configuration from an empty object", () => {
    const emptyConfig = {};
    const result = ensureConfiguration(emptyConfig);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });
});
