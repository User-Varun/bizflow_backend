const sequelize = require("../config/db");
const Invoice = require("../models/invoiceModel");
const { catchAsync } = require("../utilities/catchAsync");
const AppError = require("../utilities/appError");
const { generateInvoiceNumber } = require("../utilities/generateInvoiceNumber");
const Payment = require("../models/paymentModel");
const InvoiceItem = require("../models/invoiceItemsModel");
const ProductCatalog = require("../models/productCatalogModel");
const Dealer = require("../models/dealerModel");
const { calculateInvoiceData } = require("../utilities/calculateInvoiceData");
const { updateInventory } = require("../utilities/updateInventory");
const { Op } = require("sequelize");

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
  const rawCreatedAt = req.body?.invoiceDetails?.created_at;
  const incomingDealerId = String(req.body?.invoiceDetails?.dealer_id || "").trim();
  let createdAtOverride = null;

  if (rawCreatedAt) {
    const parsed = new Date(rawCreatedAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new AppError("invalid created_at value", 400);
    }
    createdAtOverride = parsed;
  }

  if (
    req.body.invoiceDetails.invoice_type !== "stock_in" &&
    req.body.invoiceDetails.invoice_type !== "stock_out"
  ) {
    throw new AppError("invalid invoice type!", 400);
  }

  if (!incomingDealerId) {
    throw new AppError("dealer_id is required", 400);
  }

  const selectedDealer = await Dealer.findOne({
    where: {
      id: incomingDealerId,
      tenant_id: tenant.id,
      invoice_type: req.body.invoiceDetails.invoice_type,
    },
  });

  if (!selectedDealer) {
    throw new AppError(
      "invalid dealer selection for this invoice type",
      400,
    );
  }

  if (
    !String(selectedDealer.name || "").trim() ||
    !String(selectedDealer.phone || "").trim()
  ) {
    throw new AppError("selected dealer details are incomplete", 400);
  }

  if (!String(selectedDealer.gst || "").trim()) {
    throw new AppError("selected dealer gst is required", 400);
  }

  // auto-filling customer data based on invoice_type
  if (req.body.invoiceDetails.invoice_type === "stock_in") {
    const { invoice_type } = req.body.invoiceDetails;

    invoiceDetails = {
      invoice_type,
      dealer_id: selectedDealer.id,
      invoice_from: String(selectedDealer.name || "").trim(),
      address_from: String(selectedDealer.address || "").trim(),
      phone_from: String(selectedDealer.phone || "").trim(),
      other_party_gst: String(selectedDealer.gst || "")
        .trim()
        .toUpperCase(),
      invoice_to: cname,
      address_to: caddress,
      phone_to: cphone_number,
    };
  }

  if (req.body.invoiceDetails.invoice_type === "stock_out") {
    const { invoice_type } = req.body.invoiceDetails;

    invoiceDetails = {
      invoice_type,
      dealer_id: selectedDealer.id,
      invoice_to: String(selectedDealer.name || "").trim(),
      address_to: String(selectedDealer.address || "").trim(),
      phone_to: String(selectedDealer.phone || "").trim(),
      other_party_gst: String(selectedDealer.gst || "")
        .trim()
        .toUpperCase(),
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

  if (Number(amount) < 0) {
    throw new AppError("payment amount cannot be less than zero", 400);
  }

  // Starting Transaction in a loop to reduce concurreny issues (race condition)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await sequelize.transaction(async (transaction) => {
        // Resolve product_catalog_id for every invoice item using only
        // payload product_catalog_id; no fallback to inventory id.
        const requestedCatalogIds = [
          ...new Set(
            invoiceItems.map((item) => item.product_catalog_id).filter(Boolean),
          ),
        ];

        let validCatalogIdSet = new Set();
        if (requestedCatalogIds.length > 0) {
          const catalogRows = await ProductCatalog.findAll({
            attributes: ["id"],
            where: {
              tenant_id: tenant.id,
              id: { [Op.in]: requestedCatalogIds },
            },
            transaction,
          });

          validCatalogIdSet = new Set(catalogRows.map((row) => row.id));
        }

        const normalizedInvoiceItems = invoiceItems.map((item) => {
          let resolvedProductCatalogId = null;

          if (
            item.product_catalog_id &&
            validCatalogIdSet.has(item.product_catalog_id)
          ) {
            resolvedProductCatalogId = item.product_catalog_id;
          }

          if (item.product_catalog_id && !resolvedProductCatalogId) {
            throw new AppError(
              `invalid product_catalog_id for item: ${item.name}`,
              400,
            );
          }

          return {
            ...item,
            // Keep invoice history insertable even when product catalog rows
            // were deleted; FK is nullable and old links can be null.
            product_catalog_id: resolvedProductCatalogId,
          };
        });

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
        } = calculateInvoiceData(normalizedInvoiceItems);

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
            ...(createdAtOverride ? { createdAt: createdAtOverride } : {}),
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
        normalizedInvoiceItems.forEach(
          (item) => (item.invoice_id = invoiceRes.id),
        );

        // create invoice_items
        const invoiceItemsRes = await InvoiceItem.bulkCreate(
          normalizedInvoiceItems,
          {
            transaction,
          },
        );

        await updateInventory({
          tenantId: tenant.id,
          invoiceType: invoiceDetails.invoice_type,
          invoiceItems: normalizedInvoiceItems,
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
