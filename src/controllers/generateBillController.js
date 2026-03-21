const sequelize = require("../config/db");
const Invoice = require("../models/invoiceModel");
const { catchAsync } = require("../utilities/catchAsync");
const AppError = require("../utilities/appError");

const { generateInvoiceNumber } = require("../utilities/generateInvoiceNumber");
const Payment = require("../models/paymentModel");

exports.generateBill = catchAsync(async (req, res, next) => {
  /* generate bill in transaction */

  const user = req.user;
  const tenant = req.tenant;

  // calc cgst total and store in invoice details
  // calc sgst total and store in invoice details
  // calc total amount
  // calc pending about (based on money given in invoiceDetails)
  // calc bill_state based on claculations

  const invoiceDetails = {
    invoice_type: req.body.invoice_type,
    invoice_to: req.body.invoice_to,
    address_to: req.body.address_to,
    phone_to: req.body.phone_to,
    invoice_from: req.body.invoice_from,
    address_from: req.body.address_from,
    phone_from: req.body.phone_from,
  };

  if (
    !invoiceDetails.invoice_type ||
    !invoiceDetails.invoice_to ||
    !invoiceDetails.address_to ||
    !invoiceDetails.phone_to ||
    !invoiceDetails.invoice_from ||
    !invoiceDetails.address_from ||
    !invoiceDetails.phone_from
  )
    return next(new AppError("invoice invoice details!", 400));

  const invoiceItemsDetails = req.body.invoiceItems.map((item) => {
    if (
      !item.name ||
      !item.brand ||
      !item.hsn_code ||
      !item.unit_name ||
      !item.unit_qty ||
      !item.rate ||
      !item.mrp ||
      !item.cgst ||
      !item.sgst ||
      !item.dicount ||
      !item.product_qty
    ) {
      return next(new AppError("invoice invoice items details! ", 400));
    }

    return {
      name: item.name,
      brand: item.brand,
      hsn_code: item.hsn_code,
      unit_name: item.unit_name,
      unit_qty: item.unit_qty,
      product_qty: item.product_qty,
      rate: item.rate,
      mrp: item.mrp,
      cgst: item.cgst,
      sgst: item.sgst,
      discount: item.dicount,
      total_amount: item.rate * item.product_qty,
    };
  });

  const paymentDetails = {
    // invoice id remaining
    amount: req.body.amountPaidNow,
    payment_method: req.body.payment_method,
  };

  if (!amount || !payment_method || amount < 0) {
    return next(new AppError("invalid payments details", 400));
  }
  // adding remaining properties to invoice details (some still left)
  invoiceDetails.tenant_id = tenant.id;
  const { subTotal, grandTotal, cgstTotal, sgstTotal, dicountTotal } =
    claculateInvoiceData(invoiceItemsDetails);
  invoiceDetails.cgst_total = cgstTotal;
  invoiceDetails.sgst_total = sgstTotal;
  invoiceDetails.discount_total = dicountTotal;
  invoiceDetails.sub_total = subTotal;
  invoiceDetails.grand_total = grandTotal;

  const {} = await sequelize.transaction(async (transaction) => {
    // retrying for race condition
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        /*
     # Steps for invoice Generation
     
     1. generate invoice ( with pending amount full + bill_state = pending  , cgst_total // in price , sgst_total // in price , discount_total // in price , sub_total ( total amount before adding gst and discount ) , grand_total (after calc gst and discount ) )

     2. generate payment record if needed ( with invoice_id now )
     - generate invoice_items (with invoice_id now )
     - update or generate inventory (with tenant id )


     */

        // **********Step 1*********

        // generating invoice number (for invoice )
        invoiceDetails.invoice_number = generateInvoiceNumber({
          tenantId: tenant.id,
          transaction,
        });
        invoiceDetails.tenant_id = tenant.id;
        // filling invoice with fake data for now
        invoiceDetails.cgst_total = 0;
        invoiceDetails.sgst_total = 0;
        invoiceDetails.discount_total = 0;
        invoiceDetails.sub_total = 0;
        invoiceDetails.grand_total = 0;
        invoiceDetails.pending_amount = 0;
        invoiceDetails.bill_state = "pending";

        const invoice = await Invoice.create(invoiceDetails);

        // ******** Step 2 *********
        if (paymentDetails.amount > 0) {
          paymentDetails.invoice_id = invoice.id;
          const payment = await Payment.create(paymentDetails);
          // update the invoice (pending_amount , bill_state)
        }
      } catch (err) {
        const isUniqueError = err?.name === "SequelizeUniqueConstraintError";
        if (!isUniqueError || attempt === 2)
          next(new AppError(`Error: ${err}`, 500));
      }
    }

    // create invoice
    const invoice = await Invoice.create();
    // create invoice_items
    // update inventory
    // update payment
  });
});

// caluclate

// - subtotal
// - cgst
// - sgst
// - grand_total
// - discount total

const claculateInvoiceData = function (invoiceItemsDetails) {
  // calculate cgst

  let subTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let dicountTotal = 0;
  let grandTotal = 0;

  invoiceItemsDetails.map((item) => {
    const amount = item.rate * item.product_qty;

    subTotal += amount;

    cgstTotal += amount * (item.cgst / 100);
    sgstTotal += amount * (item.sgst / 100);
    dicountTotal += amount * (item.dicount / 100); // have to decide later ( if dicount will be deducted from amount + gst  or only amount )
  });

  grandTotal = subTotal + cgstTotal + sgstTotal + dicountTotal;

  return {
    subTotal,
    grandTotal,
    cgstTotal,
    sgstTotal,
    dicountTotal,
  };
};
