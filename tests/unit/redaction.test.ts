import { describe, expect, it } from "vitest";
import { isSensitivePath, redactSecrets } from "../../src/security/redaction.js";

describe("redaction", () => {
  it("detects sensitive paths before reading", () => {
    expect(isSensitivePath(".env")).toBe(true);
    expect(isSensitivePath("config/private.key")).toBe(true);
    expect(isSensitivePath("certs/server.pem")).toBe(true);
    expect(isSensitivePath("docs/rules.md")).toBe(false);
  });

  it("redacts secret assignments and private key blocks", () => {
    const apiKeyLine = ["API_KEY", "abc123"].join("=");
    const passwordLine = ["password", "open-sesame"].join(" = ");
    const privateKeyHeader = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
    const privateKeyFooter = ["-----END", "PRIVATE KEY-----"].join(" ");
    const input = [
      apiKeyLine,
      passwordLine,
      privateKeyHeader,
      "secret material",
      privateKeyFooter
    ].join("\n");

    const output = redactSecrets(input);

    expect(output).not.toContain("abc123");
    expect(output).not.toContain("open-sesame");
    expect(output).not.toContain("secret material");
    expect(output.match(/\[REDACTED_SECRET\]/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
