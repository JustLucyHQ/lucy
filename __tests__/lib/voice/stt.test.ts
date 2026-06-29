/**
 * @jest-environment jsdom
 *
 * Tests the browser STT session's transient-network recovery: a 'network' blip
 * should silently restart the recogniser (bounded), and only surface an error
 * if it persists. A fake webkitSpeechRecognition drives the lifecycle.
 */
import { createSttSession } from '@/lib/voice/stt';

let lastRecognizer: FakeRecognizer | null = null;

class FakeRecognizer {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = jest.fn();
  stop = jest.fn();
  constructor() {
    lastRecognizer = this;
  }
  fireError(error: string) {
    this.onerror?.({ error });
  }
  fireEnd() {
    this.onend?.();
  }
}

function makeSession() {
  const onError = jest.fn();
  const onEnd = jest.fn();
  const session = createSttSession({
    provider: 'browser',
    onInterim: () => {},
    onFinal: () => {},
    onError,
    onEnd,
  })!;
  return { session, onError, onEnd, rec: lastRecognizer! };
}

describe('browser STT — transient network recovery', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    lastRecognizer = null;
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognizer;
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = undefined;
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('silently restarts on a transient network blip (no error surfaced)', () => {
    const { session, onError, onEnd, rec } = makeSession();
    session.start();
    expect(rec.start).toHaveBeenCalledTimes(1);

    rec.fireError('network'); // within retry budget
    rec.fireEnd(); // schedules restart
    expect(onError).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();

    jest.advanceTimersByTime(350);
    expect(rec.start).toHaveBeenCalledTimes(2); // restarted, session continues
  });

  it('surfaces the error after the retry budget is exhausted', () => {
    const { session, onError, rec } = makeSession();
    session.start();
    for (let i = 0; i < 3; i++) {
      rec.fireError('network');
      rec.fireEnd();
      jest.advanceTimersByTime(350);
    }
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/Speech service unreachable/i);
  });

  it('does not restart after the user stops', () => {
    const { session, onEnd, rec } = makeSession();
    session.start();
    session.stop();
    expect(rec.stop).toHaveBeenCalled();
    rec.fireEnd();
    expect(onEnd).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(350);
    expect(rec.start).toHaveBeenCalledTimes(1); // never restarted
  });

  it('replenishes the retry budget after a successful result', () => {
    const { session, onError, rec } = makeSession();
    session.start();
    // Two blips, each recovered.
    rec.fireError('network');
    rec.fireEnd();
    jest.advanceTimersByTime(350);
    rec.fireError('network');
    rec.fireEnd();
    jest.advanceTimersByTime(350);
    // A good result resets the budget.
    rec.onresult?.({ resultIndex: 0, results: { length: 0 } } as unknown);
    // Another blip should still be retried (budget replenished), not surfaced.
    rec.fireError('network');
    rec.fireEnd();
    jest.advanceTimersByTime(350);
    expect(onError).not.toHaveBeenCalled();
  });
});
