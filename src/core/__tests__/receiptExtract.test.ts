import { amountsInLine, extractAmountCents, extractMerchant, extractReceiptFields } from '../../ocr/extract';

const TRADER_JOES = `
TRADER JOE'S
1000 Market Street
San Francisco CA 94103
(415) 555-0134

BANANAS            0.79
OAT MILK           3.49
FROZEN PIZZA       4.99
PAPER TOWELS       6.99

SUBTOTAL          16.26
TAX                1.42
TOTAL             17.68

VISA ****4242
THANK YOU
`;

const CHIPOTLE = `
CHIPOTLE MEXICAN GRILL
Order 4471

2 BURRITO BOWL    19.50
1 CHIPS & GUAC     4.25

Subtotal          23.75
Tax                2.14
TOTAL DUE         25.89
Tip                5.00
`;

describe('amountsInLine', () => {
  it('reads plain and decimal amounts', () => {
    expect(amountsInLine('TOTAL 17.68')).toEqual([1768]);
    expect(amountsInLine('$4.99')).toEqual([499]);
    expect(amountsInLine('TOTAL 1,234.56')).toEqual([123_456]);
  });

  it('reads every amount on a line, in order', () => {
    expect(amountsInLine('2 x 3.50   7.00')).toEqual([200, 350, 700]);
  });

  it('returns nothing for a line without numbers', () => {
    expect(amountsInLine('THANK YOU')).toEqual([]);
  });
});

describe('extractAmountCents', () => {
  it('prefers the labelled total over subtotal and tax', () => {
    expect(extractAmountCents(TRADER_JOES).amountCents).toBe(1768);
  });

  it('handles "TOTAL DUE" and ignores a trailing tip line', () => {
    expect(extractAmountCents(CHIPOTLE).amountCents).toBe(2589);
  });

  it('reads a total that sits on the following line', () => {
    const text = 'CORNER STORE\nITEM  2.00\nTOTAL\n12.75\n';
    expect(extractAmountCents(text).amountCents).toBe(1275);
  });

  it('falls back to the largest amount when nothing is labelled', () => {
    const text = 'QUICK MART\nGUM 1.25\nSODA 2.50\nWATER 9.99\n';
    const result = extractAmountCents(text);
    expect(result.amountCents).toBe(999);
    expect(result.confidence).toBeLessThan(0.6);
  });

  it('reports low confidence and a null amount for unreadable text', () => {
    const result = extractAmountCents('~~~ blurry ~~~\nnothing here');
    expect(result.amountCents).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('is confident about a clearly labelled total', () => {
    expect(extractAmountCents(TRADER_JOES).confidence).toBeGreaterThanOrEqual(0.9);
  });
});

describe('extractMerchant', () => {
  it('takes the shop name from the top of the receipt', () => {
    expect(extractMerchant(TRADER_JOES)).toBe("Trader Joe's");
    expect(extractMerchant(CHIPOTLE)).toBe('Chipotle Mexican Grill');
  });

  it('skips phone numbers and addresses', () => {
    const text = '(415) 555-0134\n1000 Market Street\nBLUE BOTTLE COFFEE\nLATTE 5.50\n';
    expect(extractMerchant(text)).toBe('Blue Bottle Coffee');
  });

  it('returns null when there is no usable name', () => {
    expect(extractMerchant('12345\n67.89\n')).toBeNull();
  });
});

describe('extractReceiptFields', () => {
  it('returns both fields ready to prefill the expense form', () => {
    expect(extractReceiptFields(TRADER_JOES)).toEqual({
      amountCents: 1768,
      merchant: "Trader Joe's",
      confidence: 1,
    });
  });

  it('degrades gracefully on empty input', () => {
    expect(extractReceiptFields('')).toEqual({
      amountCents: null,
      merchant: null,
      confidence: 0,
    });
  });
});
