import { describe, expect, it } from 'vitest';
import { Runner } from '../src/story/runner';

describe('story runner', () => {
  it('resolves waits on game time and cancels cleanly', async () => {
    const r = new Runner();
    const log: string[] = [];
    const done = r.run(async () => {
      await r.wait(1);
      log.push('a');
      await r.until(() => log.length > 5);
      log.push('never');
    });
    r.tick(0.5);
    await Promise.resolve();
    expect(log).toEqual([]);
    r.tick(0.6);
    await new Promise((res) => setTimeout(res, 0));
    expect(log).toEqual(['a']);
    r.cancel();
    expect(await done).toBe(false);
    expect(log).toEqual(['a']);
  });
});
