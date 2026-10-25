import { NotFoundException } from '@nestjs/common';

import { Item } from '@plugins/catalog/item/entities/item.entity';
import { Contact } from '@plugins/crm/contact/entities/contact.entity';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';
import { Project } from '@plugins/crm/project/entities/project.entity';
import { QuotationFeedbackChannel } from '@plugins/sales/quotation/enums/quotation-feedback-channel.enum';
import {
  describeWithDatabase,
  openQuotationDb,
  type QuotationDb,
} from '@plugins/sales/quotation/quotation-db.helper-spec';

jest.setTimeout(30_000);

/** The customer feedback log against the real Postgres of the compose stack. */
describeWithDatabase('Quotation feedback against Postgres', () => {
  let db: QuotationDb;

  beforeAll(async () => {
    db = await openQuotationDb([Customer, Project, Contact, Item]);
  });
  afterEach(async () => {
    await db.cleanup();
  });
  afterAll(async () => {
    await db?.close();
  });

  const quote = async () => {
    const { requestId } = await db.estimatedRequest();
    const quotation = await db.quotations.create({ requestId }, db.salesA);
    return { requestId, id: quotation.id };
  };

  it('appends entries and lists them newest day first, then newest entry first', async () => {
    const { id } = await quote();
    await db.feedback.add(
      id,
      {
        feedbackDate: '2027-01-10',
        channel: QuotationFeedbackChannel.PHONE,
        content: 'Asked for a lower price',
      },
      db.salesA,
    );
    await db.feedback.add(
      id,
      {
        feedbackDate: '2027-01-12',
        channel: QuotationFeedbackChannel.EMAIL,
        content: 'Accepts the delivery time',
      },
      db.salesA,
    );
    await db.feedback.add(
      id,
      {
        feedbackDate: '2027-01-12',
        channel: QuotationFeedbackChannel.MEETING,
        content: 'Will confirm next week',
      },
      db.salesA,
    );

    const entries = await db.feedback.list(id, db.salesA);

    expect(
      entries.map(({ feedbackDate, channel, content, createdBy }) => ({
        feedbackDate,
        channel,
        content,
        createdBy,
      })),
    ).toEqual([
      {
        feedbackDate: '2027-01-12',
        channel: 'meeting',
        content: 'Will confirm next week',
        createdBy: db.salesA.userId,
      },
      {
        feedbackDate: '2027-01-12',
        channel: 'email',
        content: 'Accepts the delivery time',
        createdBy: db.salesA.userId,
      },
      {
        feedbackDate: '2027-01-10',
        channel: 'phone',
        content: 'Asked for a lower price',
        createdBy: db.salesA.userId,
      },
    ]);
  });

  it('writes a line on the request timeline for each entry', async () => {
    const { id, requestId } = await quote();

    await db.feedback.add(
      id,
      {
        feedbackDate: '2027-01-10',
        channel: QuotationFeedbackChannel.CHAT,
        content: 'Thumbs up',
      },
      db.salesA,
    );

    const rows = await db.dataSource.query<Array<{ action: string }>>(
      `SELECT action FROM sales_request_activities
       WHERE request_id = $1 AND action = 'quotation_feedback_added'`,
      [requestId],
    );
    expect(rows).toHaveLength(1);
  });

  it('lets a manager read and write the feedback of any quotation', async () => {
    const { id } = await quote();

    await db.feedback.add(
      id,
      {
        feedbackDate: '2027-01-10',
        channel: QuotationFeedbackChannel.OTHER,
        content: 'Via the distributor',
      },
      db.manager,
    );

    expect(await db.feedback.list(id, db.manager)).toHaveLength(1);
  });

  it('answers 404 to a sales outside the data scope, reading or writing', async () => {
    const { id } = await quote();

    await expect(db.feedback.list(id, db.salesB)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      db.feedback.add(
        id,
        {
          feedbackDate: '2027-01-10',
          channel: QuotationFeedbackChannel.PHONE,
          content: 'Should not land',
        },
        db.salesB,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await db.feedback.list(id, db.salesA)).toHaveLength(0);
  });

  it('answers 404 to an unknown quotation', async () => {
    await expect(
      db.feedback.list(2_000_000_000, db.salesA),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('racing a decision or a close of the request', () => {
    const entry = {
      feedbackDate: '2027-01-10',
      channel: QuotationFeedbackChannel.PHONE,
      content: 'Race',
    };
    const submittedQuote = async () => {
      const made = await quote();
      await db.approvals.submit(made.id, db.salesA);
      return made;
    };
    const deadlocked = (results: Array<PromiseSettledResult<unknown>>) =>
      results.some(
        (r) =>
          r.status === 'rejected' &&
          (r.reason as { code?: string }).code === '40P01',
      );

    it('never deadlocks with an approval, round after round', async () => {
      for (let round = 0; round < 5; round += 1) {
        const made = await submittedQuote();

        const results = await Promise.allSettled([
          db.feedback.add(made.id, entry, db.salesA),
          db.approvals.approve(made.id, db.manager),
          db.feedback.add(made.id, entry, db.salesA),
        ]);

        expect(deadlocked(results)).toBe(false);
        expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      }
    });

    it('never deadlocks with the close of its request, round after round', async () => {
      for (let round = 0; round < 5; round += 1) {
        const made = await quote();

        const results = await Promise.allSettled([
          db.feedback.add(made.id, entry, db.salesA),
          db.requests.cancel(made.requestId, { reason: 'Race' }, db.salesA),
          db.feedback.add(made.id, entry, db.salesA),
        ]);

        expect(deadlocked(results)).toBe(false);
        expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      }
    });
  });

  it('goes with its quotation when the quotation is removed', async () => {
    const { id } = await quote();
    await db.feedback.add(
      id,
      {
        feedbackDate: '2027-01-10',
        channel: QuotationFeedbackChannel.PHONE,
        content: 'Gone with it',
      },
      db.salesA,
    );

    await db.cleanup();

    const rows = await db.dataSource.query<unknown[]>(
      `SELECT 1 FROM sales_quotation_feedbacks WHERE quotation_id = $1`,
      [id],
    );
    expect(rows).toHaveLength(0);
  });
});
