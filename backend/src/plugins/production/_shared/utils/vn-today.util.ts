const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

// en-CA writes a date as YYYY-MM-DD, the form a planned end date is stored and compared in.
const VIETNAM_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: VIETNAM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * The calendar date in Vietnam (YYYY-MM-DD) at `now`. A planned end date is a Vietnamese day,
 * so "today" is never the container's UTC date: at 23:30Z Vietnam is already on the next day.
 */
export function vnToday(now: Date = new Date()): string {
  return VIETNAM_DATE.format(now);
}
