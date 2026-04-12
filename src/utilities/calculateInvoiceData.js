exports.calculateInvoiceData = function (invoiceItems) {
  const toTwoDecimal = (value) => Number(Number(value || 0).toFixed(2));

  // calculate cgst

  let sub_total = 0;
  let cgst_total = 0;
  let sgst_total = 0;
  let discount_total = 0;
  let grand_total = 0;

  invoiceItems.forEach((item) => {
    const amount = item.rate * item.product_qty;
    const discountAmount = amount * (item.discount / 100);
    const taxableAmount = Math.max(0, amount - discountAmount);

    sub_total += amount;

    cgst_total += taxableAmount * (item.cgst / 100);
    sgst_total += taxableAmount * (item.sgst / 100);
    discount_total += discountAmount;
  });

  const raw_grand_total = sub_total + cgst_total + sgst_total - discount_total;
  grand_total = Math.round(raw_grand_total);
  const round_off = toTwoDecimal(grand_total - raw_grand_total);

  return {
    sub_total: toTwoDecimal(sub_total),
    grand_total,
    round_off,
    cgst_total: toTwoDecimal(cgst_total),
    sgst_total: toTwoDecimal(sgst_total),
    discount_total: toTwoDecimal(discount_total),
  };
};
