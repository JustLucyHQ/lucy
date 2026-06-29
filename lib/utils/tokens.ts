/**
 * Lightweight token estimation utilities.
 *
 * Uses the rough heuristic: tokens ≈ chars / 4.
 * This avoids shipping tiktoken (heavy WASM) to the browser.
 * Accuracy: within ~10–15% for English text.
 */

/**
 * Estimate the number of tokens in a text string.
 * Heuristic: 1 token ≈ 4 characters (OpenAI's rule of thumb for English).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Estimate total tokens across an array of messages.
 * Adds a small overhead per message for role and formatting tokens.
 */
export function estimateConversationTokens(
  messages: Array<{ role: string; content: string }>
): number {
  const MESSAGE_OVERHEAD = 4; // tokens per message for metadata
  return messages.reduce(
    (total, msg) => total + estimateTokens(msg.content) + MESSAGE_OVERHEAD,
    0
  );
}
