const sequelize = require("../config/db");
const Invoice = require("../models/invoiceModel");
const { catchAsync } = require("../utilities/catchAsync");
const AppError = require("../utilities/appError");
const { generateInvoiceNumber } = require("../utilities/generateInvoiceNumber");
const Payment = require("../models/paymentModel");
const InvoiceItem = require("../models/invoiceItemsModel");
const { calculateInvoiceData } = require("../utilities/calculateInvoiceData");
const { updateInventory } = require("../utilities/updateInventory");

exports.generateInvoice = catchAsync(async (req, res, next) => {
  /* ### What is component does 

- Creates a stock-in or stock-out invoice in a DB transaction by validating input,
- generating a tenant-scoped invoice number, calculating totals, storing invoice/payment/items,
- and retrying on unique-constraint race conditions.

 */

  const tenant = req.tenant;
  const { cname, caddress, cphone_number } = tenant;
  let invoiceDetails;
  let result;

  if (
    req.body.invoiceDetails.invoice_type !== "stock_in" &&
    req.body.invoiceDetails.invoice_type !== "stock_out"
  ) {
    throw new AppError("invalid invoice type!", 400);
  }

  // auto-filling customer data based on invoice_type
  if (req.body.invoiceDetails.invoice_type === "stock_in") {
    const { invoice_type, invoice_from, address_from, phone_from } =
      req.body.invoiceDetails;

    invoiceDetails = {
      invoice_type,
      invoice_from,
      address_from,
      phone_from,
      invoice_to: cname,
      address_to: caddress,
      phone_to: cphone_number,
    };
  }

  if (req.body.invoiceDetails.invoice_type === "stock_out") {
    const { invoice_type, invoice_to, address_to, phone_to } =
      req.body.invoiceDetails;

    invoiceDetails = {
      invoice_type,
      invoice_to,
      address_to,
      phone_to,
      invoice_from: cname,
      address_from: caddress,
      phone_from: cphone_number,
    };
  }

  // white-listing values
  const invoiceItems = req.body.invoiceItemsDetails.map((item) => {
    const {
      name,
      brand,
      hsn_code,
      unit_name,
      unit_qty,
      product_qty,
      rate,
      mrp,
      cgst,
      sgst,
      discount,
      product_catalog_id,
    } = item;

    return {
      name,
      brand,
      hsn_code,
      unit_name,
      unit_qty,
      product_qty,
      rate,
      mrp,
      cgst,
      sgst,
      discount,
      total_amount: rate * product_qty,
      product_catalog_id,
    };
  });

  // payments details
  const { amount, payment_method } = req.body.paymentDetails;

  if (amount == null || !payment_method)
    throw new AppError("invalid payments details", 400);

  // Starting Transaction in a loop to reduce concurreny issues (race condition)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await sequelize.transaction(async (transaction) => {
        // generating invoice number (for invoice )
        const invoice_number = await generateInvoiceNumber({
          tenantId: tenant.id,
          transaction,
        });

        const {
          sub_total,
          grand_total,
          cgst_total,
          sgst_total,
          discount_total,
        } = calculateInvoiceData(invoiceItems);

        if (amount > grand_total) {
          throw new AppError(
            "invalid payment amount! shouldn't be more than grand total",
            400,
          );
        }

        // set pending_bill and bill_state
        let pending_amount;
        let bill_state;

        if (amount >= 0 && payment_method) {
          if (amount === 0) {
            pending_amount = grand_total;
            bill_state = "pending";
          }

          if (amount < grand_total) {
            pending_amount = grand_total - amount;
            bill_state = "partial";
          }
          if (amount === grand_total) {
            pending_amount = 0;
            bill_state = "paid";
          }
        }

        const invoiceRes = await Invoice.create(
          {
            ...invoiceDetails,
            pending_amount,
            bill_state,
            sub_total,
            grand_total,
            cgst_total,
            sgst_total,
            discount_total,
            tenant_id: tenant.id,
            invoice_number,
          },
          { transaction },
        );

        // create payment record
        if (amount > 0 && amount <= grand_total) {
          const invoice_id = invoiceRes.id;
          await Payment.create(
            { amount, payment_method, invoice_id },
            {
              transaction,
            },
          );
        }

        // adding invoice_id to every record
        invoiceItems.forEach((item) => (item.invoice_id = invoiceRes.id));

        // create invoice_items
        const invoiceItemsRes = await InvoiceItem.bulkCreate(invoiceItems, {
          transaction,
        });

        await updateInventory({
          tenantId: tenant.id,
          invoiceType: invoiceDetails.invoice_type,
          invoiceItems,
          transaction,
        });

        return { invoiceRes, invoiceItemsRes };
      });

      break;
    } catch (err) {
      const isUniqueError = err?.name === "SequelizeUniqueConstraintError";
      if (isUniqueError && attempt < 2) {
        continue;
      }
      throw err; // catchAsync will handle
    }
  }

  if (!result) {
    throw new AppError(
      "Failed to generate invoice: transaction completed without a valid result.",
      500,
    );
  }

  res.status(200).json({
    status: "success",
    result,
  });
});
