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

    await new OverdueJob(serviceWith(run)).onApplicationBootstrap();

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('2026-11-03');
  });

  it('logs a failed pass instead of stopping the backend', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const run = jest.fn().mockRejectedValue(new Error('database is down'));

    await expect(
      new OverdueJob(serviceWith(run)).onApplicationBootstrap(),
    ).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
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
