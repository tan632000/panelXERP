import { BadRequestException } from '@nestjs/common';

import { appToday } from '@shared/utils/document-validity.util';

/**
 * The shared rule behind every user-entered business date: today or earlier, never later.
 *
 * It compares against `appToday()` — the application offset — rather than the UTC date. Those
 * two are not the same day for seven hours out of every twenty-four: at 01:00 in Hanoi the UTC
 * date is still yesterday, so a UTC comparison rejects the day the actor is actually working
 * on as being "in the future". Each feature phrases its own label, because the message names
 * the field the form has to mark.
 */
export function assertBusinessDateNotFuture(date: string, label: string): void {
  if (date > appToday()) {
    throw new BadRequestException(`${label} cannot be in the future.`);
  }
}
