import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Between, In, MoreThanOrEqual } from 'typeorm';

import { DataScopeService } from '@shared/services/data-scope.service';

import {
  FakeRepo,
  type FakeRow,
} from '@plugins/crm/_shared/crm-fake-repo.helper-spec';
import { CustomerService } from '@plugins/crm/customer/services/customer.service';
import { ProjectService } from '@plugins/crm/project/services/project.service';
import { SalesRequestActivity } from '@plugins/sales/request/entities/request-activity.entity';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';
import {
  buildRequestFixture,
  createDraft,
  ENGINEER_A,
  ENGINEER_B,
  LEAD,
  MANAGER,
  SALES_A,
  SALES_B,
  seedRequest,
} from '@plugins/sales/request/request-fixture.helper-spec';

import type { Customer } from '@plugins/crm/customer/entities/customer.entity';
import type { Project } from '@plugins/crm/project/entities/project.entity';

describe('RequestService', () => {
  describe('create', () => {
    it('creates a draft owned by the caller with the next YC code and a timeline entry', async () => {
      const fixture = buildRequestFixture();
      const customer = fixture.customerOf(SALES_A.userId);

      const created = await fixture.service.create(
        {
          customerId: customer.id,
          title: '  Panel line quote  ',
          technicalRequirements: '  PIR 50mm  ',
          requestedDeliveryDate: '2027-02-15',
          quotationDueDate: '2027-01-20',
        },
        SALES_A,
      );

      expect(created).toMatchObject({
        code: expect.stringMatching(/^YC_\d{4}_0001$/) as string,
        status: 'draft',
        title: 'Panel line quote',
        technicalRequirements: 'PIR 50mm',
        salesOwnerId: SALES_A.userId,
        assignedEngineerId: null,
        requestedDeliveryDate: '2027-02-15',
        quotationDueDate: '2027-01-20',
        salesOwnerName: 'Sales A',
        customer: { code: 'KH_0001', taxCode: '0101234567' },
      });
      expect(fixture.activities.rows).toEqual([
        expect.objectContaining({
          requestId: created.id,
          action: 'created',
          actorId: SALES_A.userId,
          toStatus: 'draft',
        }),
      ]);
    });

    it('numbers consecutive requests 0001, 0002', async () => {
      const fixture = buildRequestFixture();
      const first = await createDraft(fixture);
      const second = await createDraft(fixture);

      expect(first.code.endsWith('_0001')).toBe(true);
      expect(second.code.endsWith('_0002')).toBe(true);
    });

    it('issues the code in the year at the shop (clock 2026-12-31T17:30:00Z → 2027)', async () => {
      jest.useFakeTimers({
        now: new Date('2026-12-31T17:30:00Z'),
        doNotFake: [
          'nextTick',
          'setImmediate',
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
          'queueMicrotask',
        ],
      });
      try {
        const created = await createDraft(buildRequestFixture());
        expect(created.code).toBe('YC_2027_0001');
      } finally {
        jest.useRealTimers();
      }
    });

    it('answers 404 for a customer owned by another sales account, and for a deleted one', async () => {
      const fixture = buildRequestFixture();
      const others = fixture.customerOf(SALES_A.userId, 'KH_0001');
      const gone = fixture.customerOf(SALES_B.userId, 'KH_0002', {
        isDeleted: true,
      });

      await expect(
        fixture.service.create({ customerId: others.id, title: 'x' }, SALES_B),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        fixture.service.create({ customerId: gone.id, title: 'x' }, SALES_B),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        fixture.service.create({ customerId: 9999, title: 'x' }, SALES_B),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fixture.requests.rows).toHaveLength(0);
    });

    it('accepts a project and contact of the customer and rejects those of another', async () => {
      const fixture = buildRequestFixture();
      const customer = fixture.customerOf(SALES_A.userId, 'KH_0001');
      const other = fixture.customerOf(SALES_A.userId, 'KH_0002');
      const project = fixture.projectOf(customer.id);
      const contact = fixture.contactOf(customer.id);

      const created = await fixture.service.create(
        {
          customerId: customer.id,
          title: 'x',
          projectId: project.id,
          contactId: contact.id,
        },
        SALES_A,
      );
      expect(created).toMatchObject({
        projectId: project.id,
        contactId: contact.id,
        project: { code: project.code },
        contact: { name: 'Nguyen An' },
      });

      await expect(
        fixture.service.create(
          {
            customerId: customer.id,
            title: 'x',
            projectId: fixture.projectOf(other.id).id,
          },
          SALES_A,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        fixture.service.create(
          {
            customerId: customer.id,
            title: 'x',
            contactId: fixture.contactOf(other.id).id,
          },
          SALES_A,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        fixture.service.create(
          {
            customerId: customer.id,
            title: 'x',
            projectId: fixture.projectOf(customer.id, { isDeleted: true }).id,
          },
          SALES_A,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fixture.requests.rows).toHaveLength(1);
    });

    it('rejects a blank title', async () => {
      const fixture = buildRequestFixture();
      const customer = fixture.customerOf(SALES_A.userId);

      await expect(
        fixture.service.create(
          { customerId: customer.id, title: '   ' },
          SALES_A,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('takes the owner from the customer, whoever creates it', async () => {
      const fixture = buildRequestFixture();
      const theirs = fixture.customerOf(SALES_B.userId, 'KH_0001');

      const byManager = await fixture.service.create(
        { customerId: theirs.id, title: 'x' },
        MANAGER,
      );
      expect(byManager.salesOwnerId).toBe(SALES_B.userId);
      expect(byManager.salesOwnerName).toBe('Sales B');

      // Another sales account cannot reach the customer at all.
      await expect(
        fixture.service.create({ customerId: theirs.id, title: 'x' }, SALES_A),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('takes the owner from a read made inside the transaction, not from the earlier one', async () => {
      const fixture = buildRequestFixture();
      const customer = fixture.customerOf(SALES_A.userId);
      // The customer is reassigned after the outer read but before the insert.
      fixture.crm.lockCustomerOwner.mockResolvedValueOnce(SALES_B.userId);

      const created = await fixture.service.create(
        { customerId: customer.id, title: 'x' },
        MANAGER,
      );

      expect(created.salesOwnerId).toBe(SALES_B.userId);
      expect(fixture.crm.lockCustomerOwner).toHaveBeenCalledWith(
        fixture.manager,
        customer.id,
      );
    });

    it('answers 404 and inserts nothing when the actor lost the customer in that window', async () => {
      const fixture = buildRequestFixture();
      const customer = fixture.customerOf(SALES_A.userId);
      fixture.crm.lockCustomerOwner.mockResolvedValueOnce(SALES_B.userId);

      await expect(
        fixture.service.create(
          { customerId: customer.id, title: 'x' },
          SALES_A,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fixture.requests.rows).toHaveLength(0);
      expect(fixture.activities.rows).toHaveLength(0);
    });

    it('answers 404 when the customer is gone by the time of the insert', async () => {
      const fixture = buildRequestFixture();
      const customer = fixture.customerOf(SALES_A.userId);
      fixture.crm.lockCustomerOwner.mockResolvedValueOnce(null);

      await expect(
        fixture.service.create(
          { customerId: customer.id, title: 'x' },
          SALES_A,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fixture.requests.rows).toHaveLength(0);
    });

    it('ignores an owner smuggled past the DTO', async () => {
      const fixture = buildRequestFixture();
      const own = fixture.customerOf(SALES_A.userId);

      const created = await fixture.service.create(
        {
          customerId: own.id,
          title: 'x',
          salesOwnerId: SALES_B.userId,
        } as never,
        SALES_A,
      );

      expect(created.salesOwnerId).toBe(SALES_A.userId);
    });
  });

  describe('data scope (D-12)', () => {
    it('lets the assigned engineer read the detail with the customer, project and contact embedded', async () => {
      const fixture = buildRequestFixture();
      const customer = fixture.customerOf(SALES_A.userId);
      const project = fixture.projectOf(customer.id);
      const contact = fixture.contactOf(customer.id);
      const created = await fixture.service.create(
        {
          customerId: customer.id,
          title: 'x',
          projectId: project.id,
          contactId: contact.id,
        },
        SALES_A,
      );
      await fixture.service.assign(
        created.id,
        { engineerId: ENGINEER_A.userId },
        SALES_A,
      );

      const detail = await fixture.service.findOne(created.id, ENGINEER_A);

      expect(detail.customer).toEqual({
        id: customer.id,
        code: 'KH_0001',
        name: 'Customer KH_0001',
        taxCode: '0101234567',
        address: '1 Demo Street',
      });
      expect(detail.project).toEqual({
        id: project.id,
        code: project.code,
        name: 'Tower A',
        siteAddress: '1 Site Road',
      });
      expect(detail.contact).toEqual({
        id: contact.id,
        name: 'Nguyen An',
        position: 'Buyer',
        phone: '0900000001',
        email: 'an@example.com',
      });
      expect(detail.assignedEngineerName).toBe('Engineer A');
    });

    it('answers 404 to another sales account, an unassigned engineer, and any engineer before assignment', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture, SALES_A);
      await expect(
        fixture.service.findOne(created.id, SALES_B),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        fixture.service.findOne(created.id, ENGINEER_A),
      ).rejects.toBeInstanceOf(NotFoundException);

      await fixture.service.assign(
        created.id,
        { engineerId: ENGINEER_A.userId },
        SALES_A,
      );
      await expect(
        fixture.service.findOne(created.id, ENGINEER_B),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        fixture.service.findOne(created.id, ENGINEER_A),
      ).resolves.toMatchObject({ id: created.id });
      await expect(
        fixture.service.findOne(created.id, SALES_A),
      ).resolves.toMatchObject({ id: created.id });
    });

    it('lets a manager and the engineering lead read every request', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture, SALES_A);

      await expect(
        fixture.service.findOne(created.id, MANAGER),
      ).resolves.toMatchObject({ id: created.id });
      await expect(
        fixture.service.findOne(created.id, LEAD),
      ).resolves.toMatchObject({ id: created.id });
    });

    it('answers 404 for a deleted request', async () => {
      const fixture = buildRequestFixture();
      const gone = seedRequest(fixture, RequestStatus.DRAFT, {
        isDeleted: true,
      });

      await expect(
        fixture.service.findOne(gone.id, MANAGER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lists only what the actor’s scope reaches', async () => {
      const fixture = buildRequestFixture();
      const mine = await createDraft(fixture, SALES_A, { title: 'Mine' });
      await createDraft(fixture, SALES_B, { title: 'Theirs' });
      await fixture.service.assign(
        mine.id,
        { engineerId: ENGINEER_A.userId },
        SALES_A,
      );

      const titles = async (actor: typeof SALES_A) =>
        (await fixture.service.findAll({}, actor)).data.map((r) => r.title);

      expect(await titles(SALES_A)).toEqual(['Mine']);
      expect(await titles(SALES_B)).toEqual(['Theirs']);
      expect(await titles(ENGINEER_A)).toEqual(['Mine']);
      expect(await titles(ENGINEER_B)).toEqual([]);
      expect((await titles(MANAGER)).sort()).toEqual(['Mine', 'Theirs']);
    });

    it('shows customer and engineer names on each list row', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture, SALES_A);
      await fixture.service.assign(
        created.id,
        { engineerId: ENGINEER_A.userId },
        SALES_A,
      );

      const [row] = (await fixture.service.findAll({}, MANAGER)).data;

      expect(row).toMatchObject({
        customerCode: 'KH_0001',
        customerName: 'Customer KH_0001',
        salesOwnerName: 'Sales A',
        assignedEngineerName: 'Engineer A',
      });
    });

    describe('list conditions', () => {
      const lastWhere = (fixture: ReturnType<typeof buildRequestFixture>) =>
        (
          fixture.requests.findAndCount.mock.calls.at(-1)?.[0] as {
            where: Record<string, unknown>;
          }
        ).where;

      it('adds the owner of a Sales actor, the engineer of an Engineer, and nothing for others', async () => {
        const fixture = buildRequestFixture();

        await fixture.service.findAll({}, SALES_A);
        expect(lastWhere(fixture)).toMatchObject({ salesOwnerId: 11 });
        await fixture.service.findAll({}, ENGINEER_A);
        expect(lastWhere(fixture)).toMatchObject({ assignedEngineerId: 30 });
        await fixture.service.findAll({}, MANAGER);
        expect(lastWhere(fixture)).toEqual({ isDeleted: false });
      });

      it('applies the status, engineer and quotation due filters', async () => {
        const fixture = buildRequestFixture();

        await fixture.service.findAll(
          {
            status: RequestStatus.ASSIGNED,
            assignedEngineerId: 30,
            quotationDueFrom: '2027-01-01',
            quotationDueTo: '2027-01-31',
          },
          MANAGER,
        );
        expect(lastWhere(fixture)).toMatchObject({
          status: 'assigned',
          assignedEngineerId: 30,
          quotationDueDate: Between('2027-01-01', '2027-01-31'),
        });

        await fixture.service.findAll(
          { quotationDueFrom: '2027-01-01' },
          MANAGER,
        );
        expect(lastWhere(fixture)).toMatchObject({
          quotationDueDate: MoreThanOrEqual('2027-01-01'),
        });
      });

      it('matches nothing when an engineer asks for another engineer’s requests', async () => {
        const fixture = buildRequestFixture();

        await fixture.service.findAll({ assignedEngineerId: 31 }, ENGINEER_A);

        expect(lastWhere(fixture)).toMatchObject({
          assignedEngineerId: In([]),
        });
      });
    });
  });

  describe('update', () => {
    it('edits a draft and an assigned request and records it on the timeline', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture);

      const edited = await fixture.service.update(
        created.id,
        { title: ' New title ', quotationDueDate: null },
        SALES_A,
      );
      expect(edited.title).toBe('New title');
      expect(edited.quotationDueDate).toBeNull();

      await fixture.service.assign(
        created.id,
        { engineerId: ENGINEER_A.userId },
        SALES_A,
      );
      await expect(
        fixture.service.update(created.id, { title: 'Again' }, SALES_A),
      ).resolves.toMatchObject({ title: 'Again' });
      expect(fixture.activities.rows.map((a) => a.action)).toContain('updated');
    });

    it.each([
      RequestStatus.ESTIMATING,
      RequestStatus.ESTIMATED,
      RequestStatus.QUOTED,
      RequestStatus.CANCELLED,
    ])('answers 409 once the request is %s', async (status) => {
      const fixture = buildRequestFixture();
      const request = seedRequest(fixture, status);

      await expect(
        fixture.service.update(request.id, { title: 'x' }, SALES_A),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('answers 404 to another sales account and leaves the row alone', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture, SALES_A);

      await expect(
        fixture.service.update(created.id, { title: 'Hijack' }, SALES_B),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fixture.requests.rows[0].title).toBe('Panel line quote');
    });

    it('checks a new project against the request’s own customer and can clear it', async () => {
      const fixture = buildRequestFixture();
      const customer = fixture.customerOf(SALES_A.userId, 'KH_0001');
      const other = fixture.customerOf(SALES_A.userId, 'KH_0002');
      const project = fixture.projectOf(customer.id);
      const created = await fixture.service.create(
        { customerId: customer.id, title: 'x', projectId: project.id },
        SALES_A,
      );

      await expect(
        fixture.service.update(
          created.id,
          { projectId: fixture.projectOf(other.id).id },
          SALES_A,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        fixture.service.update(created.id, { projectId: null }, SALES_A),
      ).resolves.toMatchObject({ projectId: null, project: null });
    });
  });

  describe('assign', () => {
    it('moves a draft to assigned and notifies the engineer exactly once, after the commit', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture);

      const assigned = await fixture.service.assign(
        created.id,
        { engineerId: ENGINEER_A.userId },
        SALES_A,
      );

      expect(assigned).toMatchObject({
        status: 'assigned',
        assignedEngineerId: ENGINEER_A.userId,
        assignedEngineerName: 'Engineer A',
      });
      expect(fixture.notifications.emit).toHaveBeenCalledTimes(1);
      expect(fixture.notifications.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'sales.request.assigned',
          userIds: [ENGINEER_A.userId],
          roleCodes: [],
          link: `/sales/requests/${created.id}`,
          requiredScope: 'request:read',
          payload: expect.objectContaining({ code: created.code }) as unknown,
        }),
      );
      // Emitted outside the transaction: the call carries no manager.
      expect(fixture.notifications.emit.mock.calls[0]).toHaveLength(1);
      expect(fixture.activities.rows.map((a) => a.action)).toEqual([
        'created',
        'status_changed',
        'assigned',
      ]);
    });

    it('sends nobody a notice when the transaction rolls back', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture);
      // The very last write of the transaction fails, after the request itself was saved.
      const save = fixture.activities.save.getMockImplementation();
      fixture.activities.save.mockImplementation((entity) =>
        entity.action === 'assigned'
          ? Promise.reject(new Error('disk full'))
          : (save as (e: typeof entity) => Promise<typeof entity>)(entity),
      );

      await expect(
        fixture.service.assign(
          created.id,
          { engineerId: ENGINEER_A.userId },
          SALES_A,
        ),
      ).rejects.toThrow('disk full');

      expect(fixture.notifications.emit).not.toHaveBeenCalled();
      expect(fixture.requests.rows[0]).toMatchObject({
        status: 'draft',
        assignedEngineerId: null,
      });
    });

    it('keeps the assignment when the notice itself fails after the commit', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture);
      fixture.notifications.emit.mockRejectedValueOnce(new Error('bell down'));
      const logged = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await expect(
        fixture.service.assign(
          created.id,
          { engineerId: ENGINEER_A.userId },
          SALES_A,
        ),
      ).resolves.toMatchObject({ status: 'assigned' });
      expect(fixture.requests.rows[0].assignedEngineerId).toBe(
        ENGINEER_A.userId,
      );
      expect(logged).toHaveBeenCalledTimes(1);
      logged.mockRestore();
    });

    it('reassigns while assigned or estimating: the status stays and the new engineer is notified', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture);
      await fixture.service.assign(
        created.id,
        { engineerId: ENGINEER_A.userId },
        SALES_A,
      );
      fixture.notifications.emit.mockClear();

      const second = await fixture.service.assign(
        created.id,
        { engineerId: ENGINEER_B.userId },
        MANAGER,
      );
      expect(second).toMatchObject({
        status: 'assigned',
        assignedEngineerId: ENGINEER_B.userId,
      });
      expect(fixture.notifications.emit).toHaveBeenCalledTimes(1);
      expect(fixture.notifications.emit).toHaveBeenCalledWith(
        expect.objectContaining({ userIds: [ENGINEER_B.userId] }),
      );
      expect(fixture.activities.rows.at(-1)).toMatchObject({
        action: 'reassigned',
        note: 'Engineer B',
      });

      fixture.requests.rows[0].status = RequestStatus.ESTIMATING;
      fixture.notifications.emit.mockClear();
      await fixture.service.assign(
        created.id,
        { engineerId: LEAD.userId },
        MANAGER,
      );
      expect(fixture.requests.rows[0]).toMatchObject({
        status: 'estimating',
        assignedEngineerId: LEAD.userId,
      });
      expect(fixture.notifications.emit).toHaveBeenCalledTimes(1);
    });

    it('does not notify again when the same engineer is assigned twice', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture);
      const body = { engineerId: ENGINEER_A.userId };
      await fixture.service.assign(created.id, body, SALES_A);

      await fixture.service.assign(created.id, body, SALES_A);

      expect(fixture.notifications.emit).toHaveBeenCalledTimes(1);
    });

    it.each([
      RequestStatus.ESTIMATED,
      RequestStatus.QUOTED,
      RequestStatus.WON,
      RequestStatus.LOST,
      RequestStatus.CANCELLED,
    ])('answers 409 once the request is %s', async (status) => {
      const fixture = buildRequestFixture();
      const request = seedRequest(fixture, status);

      await expect(
        fixture.service.assign(
          request.id,
          { engineerId: ENGINEER_A.userId },
          MANAGER,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(fixture.notifications.emit).not.toHaveBeenCalled();
    });

    it('accepts only an active engineer or engineering lead', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture);
      fixture.account(50, 'Retired', ['engineer'], false);

      for (const engineerId of [SALES_B.userId, 50, 9999]) {
        await expect(
          fixture.service.assign(created.id, { engineerId }, SALES_A),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      await expect(
        fixture.service.assign(
          created.id,
          { engineerId: LEAD.userId },
          SALES_A,
        ),
      ).resolves.toMatchObject({ assignedEngineerId: LEAD.userId });
      expect(fixture.notifications.emit).toHaveBeenCalledTimes(1);
    });

    it('lets a Sales actor assign only on their own requests', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture, SALES_A);

      await expect(
        fixture.service.assign(
          created.id,
          { engineerId: ENGINEER_A.userId },
          SALES_B,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fixture.notifications.emit).not.toHaveBeenCalled();
      expect(fixture.requests.rows[0].status).toBe('draft');
    });
  });

  describe('cancel and lost', () => {
    it('cancels a draft with a reason and records it', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture);

      const cancelled = await fixture.service.cancel(
        created.id,
        { reason: '  Customer withdrew  ' },
        SALES_A,
      );

      expect(cancelled).toMatchObject({
        status: 'cancelled',
        cancelReason: 'Customer withdrew',
      });
      expect(fixture.activities.rows.at(-1)).toMatchObject({
        action: 'status_changed',
        toStatus: 'cancelled',
        note: 'Customer withdrew',
      });
    });

    it('needs a reason', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture);

      await expect(
        fixture.service.cancel(created.id, { reason: '   ' }, SALES_A),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        fixture.service.markLost(created.id, { reason: '' }, SALES_A),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fixture.requests.rows[0].status).toBe('draft');
    });

    it('cancelling twice keeps the first reason and records nothing new', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture);
      await fixture.service.cancel(created.id, { reason: 'First' }, SALES_A);
      const entries = fixture.activities.rows.length;

      const again = await fixture.service.cancel(
        created.id,
        { reason: 'Second' },
        SALES_A,
      );

      expect(again.cancelReason).toBe('First');
      expect(fixture.activities.rows).toHaveLength(entries);
    });

    it.each([RequestStatus.QUOTED, RequestStatus.WON, RequestStatus.LOST])(
      'refuses to cancel a request that is %s',
      async (status) => {
        const fixture = buildRequestFixture();
        const request = seedRequest(fixture, status);

        await expect(
          fixture.service.cancel(request.id, { reason: 'x' }, MANAGER),
        ).rejects.toBeInstanceOf(ConflictException);
      },
    );

    it('marks lost from estimated or quoted, with a reason', async () => {
      const fixture = buildRequestFixture();
      for (const status of [RequestStatus.ESTIMATED, RequestStatus.QUOTED]) {
        const request = seedRequest(fixture, status);
        await expect(
          fixture.service.markLost(request.id, { reason: 'Price' }, MANAGER),
        ).resolves.toMatchObject({ status: 'lost', lostReason: 'Price' });
      }
    });

    it.each([
      RequestStatus.DRAFT,
      RequestStatus.ASSIGNED,
      RequestStatus.ESTIMATING,
    ])('refuses to mark a %s request lost', async (status) => {
      const fixture = buildRequestFixture();
      const request = seedRequest(fixture, status);

      await expect(
        fixture.service.markLost(request.id, { reason: 'x' }, MANAGER),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('answers 404 to a Sales actor closing another sales account’s request', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture, SALES_A);

      await expect(
        fixture.service.cancel(created.id, { reason: 'x' }, SALES_B),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('status port', () => {
    it('refuses to take a draft straight to won (409)', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture);

      await expect(
        fixture.statusPort.advance(
          fixture.manager as never,
          created.id,
          RequestStatus.WON,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(fixture.requests.rows[0].status).toBe('draft');
    });

    it('is what later features use to move an assigned request to estimating', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture);
      await fixture.service.assign(
        created.id,
        { engineerId: ENGINEER_A.userId },
        SALES_A,
      );

      await fixture.dataSource.transaction((manager) =>
        fixture.statusPort.advance(
          manager as never,
          created.id,
          RequestStatus.ESTIMATING,
        ),
      );

      const detail = await fixture.service.findOne(created.id, ENGINEER_A);
      expect(detail.status).toBe('estimating');
    });
  });

  describe('reference checks', () => {
    it('reports a customer and a project referenced by a live request, not by a deleted one', async () => {
      const fixture = buildRequestFixture();
      const live = seedRequest(fixture, RequestStatus.DRAFT, {
        customerId: 5,
        projectId: 6,
      });

      await expect(fixture.registry.referencingCustomer(5)).resolves.toEqual([
        'request',
      ]);
      await expect(fixture.registry.referencingProject(6)).resolves.toEqual([
        'request',
      ]);
      await expect(fixture.registry.referencingCustomer(7)).resolves.toEqual(
        [],
      );

      live.isDeleted = true;
      await expect(fixture.registry.referencingCustomer(5)).resolves.toEqual(
        [],
      );
      await expect(fixture.registry.referencingProject(6)).resolves.toEqual([]);
    });

    it('stops the customer and project services from deleting what a request references (409)', async () => {
      const fixture = buildRequestFixture();
      const customers = new FakeRepo<Customer & FakeRow>();
      const projects = new FakeRepo<Project & FakeRow>({
        join: (row) => ({
          customer: customers.rows.find((c) => c.id === row.customerId),
        }),
      });
      const customer = customers.seed({
        code: 'KH_0001',
        name: 'Alpha',
        salesOwnerId: SALES_A.userId,
      } as Omit<Customer & FakeRow, 'id' | 'isDeleted'>);
      const project = projects.seed({
        code: 'DA_0001',
        name: 'Tower',
        customerId: customer.id,
      } as Omit<Project & FakeRow, 'id' | 'isDeleted'>);
      seedRequest(fixture, RequestStatus.DRAFT, {
        customerId: customer.id,
        projectId: project.id,
      });
      const scope = new DataScopeService();
      const customerService = new CustomerService(
        customers as never,
        {} as never,
        scope,
        fixture.registry,
        fixture.ownerChanges,
      );
      const projectService = new ProjectService(
        projects as never,
        customers as never,
        scope,
        fixture.registry,
      );

      await expect(
        projectService.remove(project.id, MANAGER),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        customerService.remove(customer.id, MANAGER),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(customers.rows[0].isDeleted).toBe(false);
      expect(projects.rows[0].isDeleted).toBe(false);
    });
  });

  describe('customer reassignment', () => {
    function buildWithCustomerService(failingHook = false) {
      const fixture = buildRequestFixture();
      const customers = new FakeRepo<Customer & FakeRow>();
      const customer = customers.seed({
        code: 'KH_0001',
        name: 'Alpha',
        salesOwnerId: SALES_A.userId,
      } as Omit<Customer & FakeRow, 'id' | 'isDeleted'>);
      const eligible = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      };
      const customerService = new CustomerService(
        customers as never,
        {
          find: jest.fn().mockResolvedValue([]),
          createQueryBuilder: jest.fn().mockReturnValue(eligible),
        } as never,
        new DataScopeService(),
        fixture.registry,
        fixture.ownerChanges,
      );
      // One transaction over both tables, as the real manager is: it rolls both back together.
      const crmManager = customers.manager;
      customers.manager = {
        transaction: <R>(
          work: (m: {
            getRepository: (target: unknown) => unknown;
            update: (...args: unknown[]) => Promise<void>;
          }) => Promise<R>,
        ): Promise<R> =>
          crmManager.transaction(async () => {
            const before = fixture.requests.rows.map((row) => ({ ...row }));
            const beforeActivities = fixture.activities.rows.map((row) => ({
              ...row,
            }));
            try {
              return await work({
                getRepository: (target) => {
                  if (target === SalesRequest) return fixture.requests;
                  if (target === SalesRequestActivity) {
                    return fixture.activities;
                  }
                  return customers;
                },
                update: (_target, where, set) =>
                  fixture.requests.update(
                    _target,
                    where as never,
                    set as never,
                  ),
              });
            } catch (error) {
              fixture.requests.rows = before;
              fixture.activities.rows = beforeActivities;
              throw error;
            }
          }),
      } as never;
      if (failingHook) {
        fixture.ownerChanges.register('failing', () =>
          Promise.reject(new Error('hook failed')),
        );
      }
      return { fixture, customers, customer, customerService };
    }

    it('moves every request of the customer, in any status, to the new owner', async () => {
      const { fixture, customer, customerService } = buildWithCustomerService();
      const draft = seedRequest(fixture, RequestStatus.DRAFT, {
        customerId: customer.id,
      });
      const quoted = seedRequest(fixture, RequestStatus.QUOTED, {
        customerId: customer.id,
      });
      const cancelled = seedRequest(fixture, RequestStatus.CANCELLED, {
        customerId: customer.id,
      });
      const other = seedRequest(fixture, RequestStatus.DRAFT, {
        customerId: 999,
      });

      await customerService.update(
        customer.id,
        { salesOwnerId: SALES_B.userId },
        MANAGER,
      );

      for (const moved of [draft, quoted, cancelled]) {
        expect(moved.salesOwnerId).toBe(SALES_B.userId);
      }
      expect(other.salesOwnerId).toBe(SALES_A.userId);
    });

    it('records the move on the timeline of each request it moved, and only those', async () => {
      const { fixture, customer, customerService } = buildWithCustomerService();
      const first = seedRequest(fixture, RequestStatus.DRAFT, {
        customerId: customer.id,
      });
      const alreadyThere = seedRequest(fixture, RequestStatus.DRAFT, {
        customerId: customer.id,
        salesOwnerId: SALES_B.userId,
      });

      await customerService.update(
        customer.id,
        { salesOwnerId: SALES_B.userId },
        MANAGER,
      );

      expect(fixture.activities.rows).toEqual([
        expect.objectContaining({
          requestId: first.id,
          action: 'owner_changed',
          note: 'Sales A → Sales B',
        }),
      ]);
      expect(
        fixture.activities.rows.some((a) => a.requestId === alreadyThere.id),
      ).toBe(false);
    });

    it('takes the request away from the old owner (404) and gives it to the new one (200)', async () => {
      const { fixture, customer, customerService } = buildWithCustomerService();
      const request = seedRequest(fixture, RequestStatus.DRAFT, {
        customerId: customer.id,
      });
      fixture.customerOf(SALES_A.userId); // gateway knows a customer to embed
      fixture.crm.getCustomerSummary.mockResolvedValue({
        id: customer.id,
        code: 'KH_0001',
        name: 'Alpha',
        taxCode: null,
        address: null,
        salesOwnerId: SALES_A.userId,
        isDeleted: false,
      });
      await expect(
        fixture.service.findOne(request.id, SALES_A),
      ).resolves.toMatchObject({ id: request.id });
      await expect(
        fixture.service.findOne(request.id, SALES_B),
      ).rejects.toBeInstanceOf(NotFoundException);

      await customerService.update(
        customer.id,
        { salesOwnerId: SALES_B.userId },
        MANAGER,
      );

      await expect(
        fixture.service.findOne(request.id, SALES_A),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        fixture.service.findOne(request.id, SALES_B),
      ).resolves.toMatchObject({ salesOwnerId: SALES_B.userId });
    });

    it('rolls the customer back when a hook fails, leaving requests with the old owner', async () => {
      const { fixture, customers, customer, customerService } =
        buildWithCustomerService(true);
      seedRequest(fixture, RequestStatus.DRAFT, {
        customerId: customer.id,
      });

      await expect(
        customerService.update(
          customer.id,
          { salesOwnerId: SALES_B.userId },
          MANAGER,
        ),
      ).rejects.toThrow('hook failed');

      expect(customers.rows[0].salesOwnerId).toBe(SALES_A.userId);
      expect(fixture.requests.rows[0].salesOwnerId).toBe(SALES_A.userId);
    });
  });

  describe('timeline and options', () => {
    it('lists the timeline oldest first with actor names, through the data scope', async () => {
      const fixture = buildRequestFixture();
      const created = await createDraft(fixture);
      await fixture.service.assign(
        created.id,
        { engineerId: ENGINEER_A.userId },
        SALES_A,
      );

      const timeline = await fixture.service.listActivities(
        created.id,
        ENGINEER_A,
      );

      expect(timeline.map((entry) => entry.action)).toEqual([
        'created',
        'status_changed',
        'assigned',
      ]);
      expect(timeline[0].actorName).toBe('Sales A');
      await expect(
        fixture.service.listActivities(created.id, SALES_B),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('offers only active engineers and engineering leads for assignment', async () => {
      const fixture = buildRequestFixture();
      fixture.account(50, 'Retired', ['engineer'], false);

      const options = await fixture.service.listEngineerOptions();

      expect(options.map((o) => o.id).sort()).toEqual([30, 31, 40]);
    });
  });
});
