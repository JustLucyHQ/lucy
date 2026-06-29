/**
 * Parse a Server-Sent Events (SSE) stream from a ReadableStream.
 * Calls onChunk for each data event, onDone when stream ends, onError on errors.
 */
export async function parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: Error) => void,
  onMetadata?: (meta: Record<string, unknown>) => void
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        onDone();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            onDone();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              onChunk(parsed.content);
            } else if (parsed.metadata && onMetadata) {
              onMetadata(parsed.metadata as Record<string, unknown>);
            }
          } catch {
            // Not JSON, ignore
          }
        }
      }
    }
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
  } finally {
    reader.releaseLock();
  }
}

/**
 * Create an SSE response encoder that writes data events.
 */
export function createSSEEncoder() {
  const encoder = new TextEncoder();

  return {
    encode: (data: object | string) => {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      return encoder.encode(`data: ${payload}\n\n`);
    },
    encodeDone: () => encoder.encode('data: [DONE]\n\n'),
    encodeError: (message: string) =>
      encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`),
  };
}
