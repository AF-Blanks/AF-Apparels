/**
 * What a customer agrees to before we take money out of their bank account.
 *
 * Kept in one place, and sent with the order so the exact wording is filed
 * alongside it. A bank can be told up to two years later that a debit was never
 * authorised; what answers that is what the customer actually read, not what we
 * think the page said at the time. The server keeps its own copy of this as a
 * fallback, so the record still means something if nothing is sent.
 */
export const ACH_AUTHORIZATION_TEXT =
  "I authorise AF Apparels to debit the bank account above for the total of " +
  "this order. This authorisation is for this order only. If the transfer is " +
  "returned unpaid, I understand AF Apparels may charge a returned-item fee. " +
  "To withdraw this authorisation, contact AF Apparels before the transfer is " +
  "processed.";
