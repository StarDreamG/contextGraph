const sensitivePathPatterns = [
  /(^|\/)\.env(\..*)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /(^|\/)id_rsa$/i,
  /(^|\/)id_ed25519$/i
];

const privateKeyPattern =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

const assignmentPattern =
  /\b(API_KEY|SECRET|TOKEN|PASSWORD|PASSWD|PASSPHRASE)\b\s*=\s*([^\n\r]+)/gi;

export function isSensitivePath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  return sensitivePathPatterns.some((pattern) => pattern.test(normalized));
}

export function redactSecrets(content: string): string {
  return content
    .replace(privateKeyPattern, "[REDACTED_SECRET]")
    .replace(assignmentPattern, "$1=[REDACTED_SECRET]");
}
