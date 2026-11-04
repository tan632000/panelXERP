import { Logger } from '@nestjs/common';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';

import { OverdueJob } from '@plugins/production/progress/services/overdue.job';

import type { OverdueService } from '@plugins/production/progress/services/overdue.service';

describe('OverdueJob', () => {
  const serviceWith = (run: jest.Mock) =>
    ({ run }) as unknown as OverdueService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-02T23:30:00Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('checks once at start-up for the Vietnam date, not the UTC one', async () => {
    const run = jest.fn().mockResolvedValue({ candidates: 0, notified: 0 });

    const job = new OverdueJob(serviceWith(run));
    job.onApplicationBootstrap();
    await job.beforeApplicationShutdown();

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('2026-11-03');
  });

  it('logs a failed pass instead of stopping the backend', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const run = jest.fn().mockRejectedValue(new Error('database is down'));
    const job = new OverdueJob(serviceWith(run));

    job.onApplicationBootstrap();
    await expect(job.beforeApplicationShutdown()).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  it('lets the app listen before the start-up check ends, and waits for it on shutdown', async () => {
    let finish: () => void = () => undefined;
    const run = jest.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const job = new OverdueJob(serviceWith(run));

    // Nothing is returned, so Nest has nothing to wait for and the app starts listening.
    expect(job.onApplicationBootstrap()).toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);

    let shutDown = false;
    const shutdown = job.beforeApplicationShutdown().then(() => {
      shutDown = true;
    });
    await Promise.resolve();
    expect(shutDown).toBe(false);

    finish();
    await shutdown;
    expect(shutDown).toBe(true);
  });

  it('shuts down at once when no start-up check ran', async () => {
    const job = new OverdueJob(serviceWith(jest.fn()));
    await expect(job.beforeApplicationShutdown()).resolves.toBeUndefined();
  });

  it('is scheduled every day at 07:00 Vietnam time', () => {
    const options: unknown = Reflect.getMetadata(
      SCHEDULE_CRON_OPTIONS,
      Object.getOwnPropertyDescriptor(OverdueJob.prototype, 'runToday')
        ?.value as object,
    );

    expect(options).toMatchObject({
      cronTime: '0 7 * * *',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
  });
});
