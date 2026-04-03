exports.calculateInvoiceData = function (invoiceItems) {
  const roundToNearestDigit = (value) => Math.round(Number(value || 0));

  // calculate cgst

  let sub_total = 0;
  let cgst_total = 0;
  let sgst_total = 0;
  let discount_total = 0;
  let grand_total = 0;

  invoiceItems.forEach((item) => {
    const amount = item.rate * item.product_qty;

    sub_total += amount;

    cgst_total += amount * (item.cgst / 100);
    sgst_total += amount * (item.sgst / 100);
    discount_total += amount * (item.discount / 100); // have to decide later ( if discount will be deducted from amount + gst  or only amount )
  });

  grand_total = sub_total + cgst_total + sgst_total - discount_total;

  return {
    sub_total: roundToNearestDigit(sub_total),
    grand_total: roundToNearestDigit(grand_total),
    cgst_total: roundToNearestDigit(cgst_total),
    sgst_total: roundToNearestDigit(sgst_total),
    discount_total: roundToNearestDigit(discount_total),
  };
};
