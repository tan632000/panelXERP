import { memoizeAsync } from '@shared/utils/memoize-async.util';

describe('memoizeAsync', () => {
  it('reads once per distinct argument list', async () => {
    const read = jest.fn((a: string, b?: number) =>
      Promise.resolve(`${a}:${b ?? ''}`),
    );
    const memo = memoizeAsync(read);

    expect(await memo('x', 1)).toBe('x:1');
    expect(await memo('x', 1)).toBe('x:1');
    expect(await memo('x', 2)).toBe('x:2');
    expect(await memo('x')).toBe('x:');
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('keeps a rejection, so a repeated failing read fails the same way', async () => {
    const read = jest.fn(() => Promise.reject(new Error('boom')));
    const memo = memoizeAsync(read);

    await expect(memo()).rejects.toThrow('boom');
    await expect(memo()).rejects.toThrow('boom');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('uses the supplied key function', async () => {
    const read = jest.fn((a: { id: number }) => Promise.resolve(a.id));
    const memo = memoizeAsync(read, (a) => String(a.id));

    await memo({ id: 1 });
    await memo({ id: 1 });
    expect(read).toHaveBeenCalledTimes(1);
  });
});
