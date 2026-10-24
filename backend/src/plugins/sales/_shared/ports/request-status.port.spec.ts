import { ConflictException, NotFoundException } from '@nestjs/common';

import { REQUEST_STATUS_TRANSITIONS } from '@plugins/sales/request/constants/request-status-transitions.constant';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';
import {
  buildRequestFixture,
  seedRequest,
} from '@plugins/sales/request/request-fixture.helper-spec';

const ALL = Object.values(RequestStatus);

describe('RequestStatusPort', () => {
  it('walks a request forward through every step to won', async () => {
    const fixture = buildRequestFixture();
    const request = seedRequest(fixture, RequestStatus.DRAFT);
    const path = [
      RequestStatus.ASSIGNED,
      RequestStatus.ESTIMATING,
      RequestStatus.ESTIMATED,
      RequestStatus.QUOTED,
      RequestStatus.WON,
    ];

    for (const to of path) {
      const moved = await fixture.statusPort.advance(
        fixture.manager as never,
        request.id,
        to,
      );
      expect(moved.status).toBe(to);
    }
  });

  it('answers 409 for a draft that is marked won', async () => {
    const fixture = buildRequestFixture();
    const request = seedRequest(fixture, RequestStatus.DRAFT);

    await expect(
      fixture.statusPort.advance(
        fixture.manager as never,
        request.id,
        RequestStatus.WON,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(request.status).toBe(RequestStatus.DRAFT);
  });

  describe.each(ALL)('from %s', (from) => {
    it.each(ALL.filter((to) => to !== from))(
      'to %s follows the transition table',
      async (to) => {
        const fixture = buildRequestFixture();
        const request = seedRequest(fixture, from);
        const advance = fixture.statusPort.advance(
          fixture.manager as never,
          request.id,
          to,
        );

        if (REQUEST_STATUS_TRANSITIONS[from].includes(to)) {
          await expect(advance).resolves.toMatchObject({ status: to });
        } else {
          await expect(advance).rejects.toBeInstanceOf(ConflictException);
          expect(request.status).toBe(from);
        }
      },
    );
  });

  it('is idempotent: moving to the status it already has changes nothing and records nothing', async () => {
    const fixture = buildRequestFixture();
    const request = seedRequest(fixture, RequestStatus.QUOTED);

    const again = await fixture.statusPort.advance(
      fixture.manager as never,
      request.id,
      RequestStatus.QUOTED,
    );

    expect(again.status).toBe(RequestStatus.QUOTED);
    expect(fixture.activities.rows).toHaveLength(0);
  });

  it('records who moved the request and between which statuses', async () => {
    const fixture = buildRequestFixture();
    const request = seedRequest(fixture, RequestStatus.ASSIGNED);

    await fixture.statusPort.advance(
      fixture.manager as never,
      request.id,
      RequestStatus.ESTIMATING,
      { actorId: 30 },
    );

    expect(fixture.activities.rows).toEqual([
      expect.objectContaining({
        requestId: request.id,
        action: 'status_changed',
        actorId: 30,
        fromStatus: 'assigned',
        toStatus: 'estimating',
      }),
    ]);
  });

  it('answers 404 for a request that does not exist or is deleted', async () => {
    const fixture = buildRequestFixture();
    const deleted = seedRequest(fixture, RequestStatus.DRAFT, {
      isDeleted: true,
    });

    await expect(
      fixture.statusPort.advance(
        fixture.manager as never,
        999,
        RequestStatus.ASSIGNED,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      fixture.statusPort.advance(
        fixture.manager as never,
        deleted.id,
        RequestStatus.ASSIGNED,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('locks the row it moves, so two features cannot both act on the status they read', async () => {
    const fixture = buildRequestFixture();
    const request = seedRequest(fixture, RequestStatus.DRAFT);

    await fixture.statusPort.advance(
      fixture.manager as never,
      request.id,
      RequestStatus.ASSIGNED,
    );

    expect(fixture.requests.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });
});
