/**
 * Heuristic guard against storing secrets/credentials/PII in memory.
 * This is a first-pass filter; the extractor prompt is also instructed to omit secrets.
 */

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-ant-[a-zA-Z0-9-]{20,}\b/,            // Anthropic keys (check before generic sk-)
  /\bsk-[a-zA-Z0-9]{20,}\b/,                 // OpenAI-style keys
  /\bAIza[0-9A-Za-z_-]{30,}\b/,              // Google API keys
  /\bghp_[0-9A-Za-z]{30,}\b/,                // GitHub tokens
  /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/,        // Slack tokens
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,      // PEM private keys
  /\bpassword\s*[:=]\s*\S+/i,                // "password: ..."
  /\bsecret\s*[:=]\s*\S+/i,                  // "secret: ..."
  /\b\d{3}-\d{2}-\d{4}\b/,                   // US SSN
  /\b(?:\d[ -]*?){13,16}\b/,                 // credit-card-ish digit runs
];

export function containsSecret(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
    out = out.replace(new RegExp(re.source, flags), '[REDACTED]');
  }
  return out;
}
