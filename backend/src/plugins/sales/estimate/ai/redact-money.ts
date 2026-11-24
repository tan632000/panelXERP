// A number, with thousands separators or decimals: 85.000.000, 1,2, 12.5.
const NUMBER = String.raw`\d+(?:[.,\s]\d{3})*(?:[.,]\d+)?`;
// A number written with thousands groups only: 85.000.000.
const GROUPED = String.raw`\d{1,3}(?:[.,\s]\d{3})+`;
// Nouns that follow a count unit when it is not money: a ratio, a life of 10 million operations.
const NOT_MONEY_NOUN = String.raw`(?!\s*(?:lệ|số|trọng|suất|lần|chu kỳ|thao tác|giờ|vòng|km))`;
// What turns a number into money. Longest first; `(?!\p{L})` keeps ratings such as "10kA" and plain words after a count intact.
const SUFFIX = String.raw`(?:vnđ|vnd|usd|eur|rmb|cny|jpy|đồng|dong|tệ|triệu|trieu|tỷ|tr|nghìn|nghin|ngàn|ngan|million|billion|đ|₫)`;
const CURRENCY_PREFIX = String.raw`(?:[$₫đ€¥£]|vnđ|vnd|usd|eur|rmb|cny|jpy)`;
const MONEY_AMOUNT = new RegExp(
  [
    String.raw`(?<!\d)${NUMBER}\s*${SUFFIX}(?!\p{L})${NOT_MONEY_NOUN}`,
    // A dong sign typed as an ASCII d is read as money only after a grouped number.
    String.raw`(?<!\d)${GROUPED}\s*d(?!\p{L})`,
    String.raw`(?<!\p{L})${CURRENCY_PREFIX}\s*:?\s*${NUMBER}`,
  ].join('|'),
  'giu',
);
// A thousand shorthand glued to the figure ("500k"); it is also a resistance, so it is skipped on such lines.
const THOUSAND_SHORTHAND = new RegExp(
  String.raw`(?<!\d)${NUMBER}k(?!\p{L})`,
  'giu',
);
const RESISTANCE_CONTEXT = /(?:trở|ohm|Ω|ntc|ptc|pt100|thermistor|icu)/iu;
// An amount spelled in words (number words, then million or billion, then the currency word).
const NUMBER_WORDS = String.raw`(?:(?:một|hai|ba|bốn|tư|năm|sáu|bảy|tám|chín|mười|mươi|trăm|nghìn|ngàn|lăm|rưỡi|linh|lẻ)\s+)`;
const SPELLED_AMOUNT = new RegExp(
  [
    String.raw`${NUMBER_WORDS}*(?:triệu|tỷ|trieu)(?!\p{L})${NOT_MONEY_NOUN}(?:\s*đồng)?`,
    String.raw`${NUMBER_WORDS}+(?:nghìn|ngàn)(?!\p{L})${NOT_MONEY_NOUN}(?:\s*đồng)?`,
  ].join('|'),
  'giu',
);

// Words that only talk about money: the whole line goes.
const STRONG_PRICE_WORD =
  /(?<!\p{L})(?:đơn giá|don gia|thành tiền|thanh tien|tổng tiền|tong tien|chi phí|chi phi|kinh phí|ngân sách|price|cost)(?!\p{L})/iu;
// The bare word for price is also a technical noun (a mounting rack, a value): it counts only when a figure follows.
const WEAK_PRICE_WORD =
  /(?<!\p{L})(?:giá|gia)(?!\p{L})\s*(?::|=|khoảng|tầm|là)?\s*(?:\d|[$₫€¥£]|đ(?!\p{L}))/iu;

// Bounds the work on a hostile string; every field it feeds is far shorter.
const MAX_REDACTED_CHARS = 20_000;

/**
 * AI-authored text is shown to engineers who must never see a price, and the response
 * presenter only strips money keys, not money written inside a sentence.
 */
export function redactMoney(text: string): string {
  return text
    .normalize('NFC')
    .slice(0, MAX_REDACTED_CHARS)
    .split(/\r?\n/)
    .filter((row) => !STRONG_PRICE_WORD.test(row) && !WEAK_PRICE_WORD.test(row))
    .map((row) => {
      const withoutAmounts = row
        .replace(MONEY_AMOUNT, '')
        .replace(SPELLED_AMOUNT, '');
      return (
        RESISTANCE_CONTEXT.test(withoutAmounts)
          ? withoutAmounts
          : withoutAmounts.replace(THOUSAND_SHORTHAND, '')
      )
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
    })
    .filter((row) => row !== '')
    .join('\n');
}
