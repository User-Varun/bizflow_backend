const Invoice = require("../models/invoiceModel");
const InvoiceItem = require("../models/invoiceItemsModel");
const Payment = require("../models/paymentModel");
const Inventory = require("../models/inventoryModel");
const { catchAsync } = require("../utilities/catchAsync");
const AppError = require("../utilities/appError");
const { calculateInvoiceData } = require("../utilities/calculateInvoiceData");
const { Op } = require("sequelize");

function itemIdentityKey(item) {
  if (item.product_catalog_id) return `catalog:${item.product_catalog_id}`;

  return [
    "manual",
    String(item.name || "")
      .trim()
      .toLowerCase(),
    String(item.brand || "")
      .trim()
      .toLowerCase(),
    String(item.hsn_code || "")
      .trim()
      .toLowerCase(),
    String(item.unit_name || "")
      .trim()
      .toLowerCase(),
    Number(item.unit_qty || 0),
  ].join("::");
}

function buildQtyMap(items) {
  const map = new Map();

  for (const item of items) {
    const key = itemIdentityKey(item);
    const qty = Number(item.product_qty || 0);
    const existing = map.get(key);

    if (existing) {
      existing.product_qty += qty;
      map.set(key, existing);
      continue;
    }

    map.set(key, {
      ...item,
      product_qty: qty,
    });
  }

  return map;
}

async function applyInventoryDelta({
  tenantId,
  invoiceType,
  oldItems,
  newItems,
  transaction,
}) {
  const oldMap = buildQtyMap(oldItems);
  const newMap = buildQtyMap(newItems);
  const keys = new Set([...oldMap.keys(), ...newMap.keys()]);

  for (const key of keys) {
    const oldItem = oldMap.get(key);
    const newItem = newMap.get(key);
    const oldQty = Number(oldItem?.product_qty || 0);
    const newQty = Number(newItem?.product_qty || 0);

    // stock_in adds quantity; stock_out deducts quantity
    const deltaQty =
      invoiceType === "stock_in" ? newQty - oldQty : oldQty - newQty;

    if (deltaQty === 0) continue;

    const refItem = newItem || oldItem;
    let inventoryItem = null;

    if (refItem?.product_catalog_id) {
      inventoryItem = await Inventory.findOne({
        where: {
          tenant_id: tenantId,
          product_catalog_id: refItem.product_catalog_id,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
    }

    if (!inventoryItem) {
      inventoryItem = await Inventory.findOne({
        where: {
          tenant_id: tenantId,
          name: refItem.name,
          brand: refItem.brand,
          hsn_code: refItem.hsn_code,
          unit_name: refItem.unit_name,
          unit_qty: refItem.unit_qty,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
    }

    if (!inventoryItem) {
      if (deltaQty < 0) {
        throw new AppError(
          `insufficient stock adjustment for item: ${refItem.name}`,
          400,
        );
      }

      await Inventory.create(
        {
          tenant_id: tenantId,
          product_catalog_id: refItem.product_catalog_id || null,
          name: refItem.name,
          brand: refItem.brand,
          product_qty: deltaQty,
          hsn_code: refItem.hsn_code,
          unit_name: refItem.unit_name,
          unit_qty: refItem.unit_qty,
          mrp: Number(refItem.mrp || 0),
          rate: Number.isFinite(Number(refItem.rate))
            ? Number(refItem.rate)
            : null,
        },
        { transaction },
      );

      continue;
    }

    const nextQty = Number(inventoryItem.product_qty || 0) + deltaQty;

    if (nextQty < 0) {
      throw new AppError(
        `insufficient stock for edit on item: ${refItem.name}`,
        400,
      );
    }

    inventoryItem.product_qty = nextQty;

    if (Number.isFinite(Number(refItem.mrp))) {
      inventoryItem.mrp = Number(refItem.mrp);
    }

    if (Number.isFinite(Number(refItem.rate))) {
      inventoryItem.rate = Number(refItem.rate);
    }

    await inventoryItem.save({ transaction });
  }
}

exports.getInvoices = catchAsync(async (req, res) => {
  const tenant = req.tenant;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.pageSize, 10) || 8),
  );
  const search = String(req.query.search || "").trim();
  const searchFilter = String(req.query.searchFilter || "invoice_number");
  const billType = String(req.query.billType || "all")
    .trim()
    .toLowerCase();

  const where = {
    tenant_id: tenant.id,
  };

  if (billType === "stock_in" || billType === "stock_out") {
    where.invoice_type = billType;
  }

  if (search) {
    if (searchFilter === "invoice_number") {
      where.invoice_number = {
        [Op.iLike]: `%${search}%`,
      };
    }

    if (searchFilter === "invoice_to") {
      where.invoice_to = {
        [Op.iLike]: `%${search}%`,
      };
    }

    if (searchFilter === "invoice_from") {
      where.invoice_from = {
        [Op.iLike]: `%${search}%`,
      };
    }

    if (searchFilter === "createdAt") {
      const matched = search.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);

      if (!matched) {
        return res.status(200).json({
          status: "success",
          page,
          pageSize,
          total: 0,
          totalPages: 0,
          result: [],
        });
      }

      const day = Number(matched[1]);
      const month = Number(matched[2]);
      const year = Number(matched[3]);

      const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));

      where.createdAt = {
        [Op.gte]: startDate,
        [Op.lt]: endDate,
      };
    }
  }

  const offset = (page - 1) * pageSize;

  const { rows: invoices, count: total } = await Invoice.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit: pageSize,
    offset,
  });

  res.status(200).json({
    status: "success",
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    length: invoices.length,
    result: invoices,
  });
});

exports.getInvoiceById = catchAsync(async (req, res) => {
  const tenant = req.tenant;

  const invoiceId = req.params.id;

  if (!invoiceId) throw new Error("invalid invoice id!");

  const invoice = await Invoice.findOne({
    where: { tenant_id: tenant.id, id: invoiceId },
  });

  if (!invoice) {
    return res.status(404).json({
      status: "fail",
      message: "Invoice not found",
    });
  }

  const invoiceItems = await InvoiceItem.findAll({
    where: { invoice_id: invoice.id },
    order: [["createdAt", "ASC"]],
  });

  const result = {
    ...invoice.toJSON(),
    company_gstin: tenant.gstin || "",
    account_number: tenant.account_number || "",
    ifsc_code: tenant.ifsc_code || "",
    qr_url: tenant.qr_url || "",
    tenant_payment_updated_at: tenant.updatedAt || null,
    invoice_items: invoiceItems,
  };

  res.status(200).json({
    status: "success",
    result,
  });
});

exports.addPaymentToInvoice = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const invoiceId = req.params.id;

  const amount = Number(req.body.amount);
  const payment_method = String(req.body.payment_method || "cash");

  if (!Number.isFinite(amount) || amount <= 0) {
    return next(new AppError("payment amount must be greater than zero", 400));
  }

  if (!["cash", "online", "check"].includes(payment_method)) {
    return next(new AppError("invalid payment method", 400));
  }

  const invoice = await Invoice.findOne({
    where: { id: invoiceId, tenant_id: tenant.id },
  });

  if (!invoice) {
    return next(new AppError("invoice not found", 404));
  }

  if (invoice.pending_amount <= 0 || invoice.bill_state === "paid") {
    return next(new AppError("invoice is already fully paid", 400));
  }

  if (amount > Number(invoice.pending_amount)) {
    return next(
      new AppError("payment amount cannot exceed pending bill amount", 400),
    );
  }

  const nextPending = Number(invoice.pending_amount) - amount;
  const nextBillState = nextPending === 0 ? "paid" : "partial";

  await Payment.create({
    invoice_id: invoice.id,
    amount,
    payment_method,
  });

  await invoice.update({
    pending_amount: nextPending,
    bill_state: nextBillState,
  });

  res.status(200).json({
    status: "success",
    result: {
      id: invoice.id,
      pending_amount: nextPending,
      bill_state: nextBillState,
    },
  });
});

exports.updateInvoiceDate = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const invoiceId = req.params.id;
  const rawDate = String(req.body.created_at || "").trim();

  if (!rawDate) {
    return next(new AppError("created_at is required", 400));
  }

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    return next(new AppError("invalid created_at value", 400));
  }

  const [rows] = await Invoice.sequelize.query(
    `
      UPDATE "invoices"
      SET "createdAt" = :createdAt
      WHERE "id" = :invoiceId
        AND "tenant_id" = :tenantId
      RETURNING "id", "createdAt";
    `,
    {
      replacements: {
        createdAt: parsed,
        invoiceId,
        tenantId: tenant.id,
      },
    },
  );

  if (!rows || rows.length === 0) {
    return next(new AppError("invoice not found", 404));
  }

  const updatedInvoice = rows[0];

  res.status(200).json({
    status: "success",
    result: {
      id: updatedInvoice.id,
      createdAt: updatedInvoice.createdAt,
    },
  });
});

exports.editInvoice = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const invoiceId = req.params.id;

  const payloadItems = Array.isArray(req.body?.invoiceItemsDetails)
    ? req.body.invoiceItemsDetails
    : [];

  if (payloadItems.length === 0) {
    return next(new AppError("at least one invoice item is required", 400));
  }

  const result = await Invoice.sequelize.transaction(async (transaction) => {
    const invoice = await Invoice.findOne({
      where: { id: invoiceId, tenant_id: tenant.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!invoice) {
      throw new AppError("invoice not found", 404);
    }

    if (String(invoice.bill_state || "") === "paid") {
      throw new AppError("fully paid invoices cannot be edited", 400);
    }

    const existingItems = await InvoiceItem.findAll({
      where: { invoice_id: invoice.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const defaultCgst = Number(existingItems?.[0]?.cgst || 0);
    const defaultSgst = Number(existingItems?.[0]?.sgst || 0);

    const normalizedItems = payloadItems.map((item) => {
      const normalized = {
        name: String(item.name || "").trim(),
        brand: String(item.brand || "").trim(),
        hsn_code: String(item.hsn_code || "").trim(),
        unit_name: String(item.unit_name || "").trim(),
        unit_qty: Number(item.unit_qty || 0),
        product_qty: Number(item.product_qty || 0),
        rate: Number(item.rate || 0),
        mrp: Number(item.mrp || 0),
        cgst: Number(item.cgst ?? req.body?.taxDetails?.cgst ?? defaultCgst),
        sgst: Number(item.sgst ?? req.body?.taxDetails?.sgst ?? defaultSgst),
        discount: Number(item.discount || 0),
        product_catalog_id: item.product_catalog_id || null,
      };

      if (
        !normalized.name ||
        !normalized.brand ||
        !normalized.hsn_code ||
        !normalized.unit_name
      ) {
        throw new AppError("invoice item has missing required fields", 400);
      }

      if (!Number.isFinite(normalized.unit_qty) || normalized.unit_qty <= 0) {
        throw new AppError("item unit quantity must be greater than zero", 400);
      }

      if (
        !Number.isFinite(normalized.product_qty) ||
        normalized.product_qty <= 0
      ) {
        throw new AppError("item quantity must be greater than zero", 400);
      }

      if (!Number.isFinite(normalized.rate) || normalized.rate < 0) {
        throw new AppError("item rate must be a non-negative number", 400);
      }

      if (
        !Number.isFinite(normalized.discount) ||
        normalized.discount < 0 ||
        normalized.discount > 100
      ) {
        throw new AppError("item discount must be between 0 and 100", 400);
      }

      if (!Number.isFinite(normalized.cgst) || normalized.cgst < 0) {
        throw new AppError("cgst must be a non-negative number", 400);
      }

      if (!Number.isFinite(normalized.sgst) || normalized.sgst < 0) {
        throw new AppError("sgst must be a non-negative number", 400);
      }

      return {
        ...normalized,
        total_amount: normalized.rate * normalized.product_qty,
      };
    });

    const { sub_total, grand_total, cgst_total, sgst_total, discount_total } =
      calculateInvoiceData(normalizedItems);

    const paidResult = await Payment.findOne({
      attributes: [
        [
          Invoice.sequelize.fn(
            "COALESCE",
            Invoice.sequelize.fn("SUM", Invoice.sequelize.col("amount")),
            0,
          ),
          "paid_amount",
        ],
      ],
      where: { invoice_id: invoice.id },
      raw: true,
      transaction,
    });

    const paidAmount = Number(paidResult?.paid_amount || 0);
    if (paidAmount > Number(grand_total)) {
      throw new AppError(
        "cannot edit invoice: paid amount exceeds recalculated total",
        400,
      );
    }

    const pending_amount = Number((grand_total - paidAmount).toFixed(2));
    const bill_state =
      pending_amount === 0 ? "paid" : paidAmount > 0 ? "partial" : "pending";

    const editablePartyFields =
      invoice.invoice_type === "stock_out"
        ? {
            invoice_to: String(
              req.body?.invoiceDetails?.invoice_to ?? invoice.invoice_to,
            ).trim(),
            address_to: String(
              req.body?.invoiceDetails?.address_to ?? invoice.address_to,
            ).trim(),
            phone_to: String(
              req.body?.invoiceDetails?.phone_to ?? invoice.phone_to,
            ).trim(),
            other_party_gst: String(
              req.body?.invoiceDetails?.other_party_gst ??
                invoice.other_party_gst,
            )
              .trim()
              .toUpperCase(),
          }
        : {
            invoice_from: String(
              req.body?.invoiceDetails?.invoice_from ?? invoice.invoice_from,
            ).trim(),
            address_from: String(
              req.body?.invoiceDetails?.address_from ?? invoice.address_from,
            ).trim(),
            phone_from: String(
              req.body?.invoiceDetails?.phone_from ?? invoice.phone_from,
            ).trim(),
            other_party_gst: String(
              req.body?.invoiceDetails?.other_party_gst ??
                invoice.other_party_gst,
            )
              .trim()
              .toUpperCase(),
          };

    for (const value of Object.values(editablePartyFields)) {
      if (!String(value || "").trim()) {
        throw new AppError("party details cannot be empty", 400);
      }
    }

    await applyInventoryDelta({
      tenantId: tenant.id,
      invoiceType: invoice.invoice_type,
      oldItems: existingItems.map((item) => item.toJSON()),
      newItems: normalizedItems,
      transaction,
    });

    await InvoiceItem.destroy({
      where: { invoice_id: invoice.id },
      transaction,
    });

    await InvoiceItem.bulkCreate(
      normalizedItems.map((item) => ({ ...item, invoice_id: invoice.id })),
      {
        transaction,
      },
    );

    await invoice.update(
      {
        ...editablePartyFields,
        sub_total,
        grand_total,
        cgst_total,
        sgst_total,
        discount_total,
        pending_amount,
        bill_state,
      },
      { transaction },
    );

    const refreshedItems = await InvoiceItem.findAll({
      where: { invoice_id: invoice.id },
      order: [["createdAt", "ASC"]],
      transaction,
    });

    return {
      invoice,
      invoice_items: refreshedItems,
    };
  });

  res.status(200).json({
    status: "success",
    result: {
      ...result.invoice.toJSON(),
      invoice_items: result.invoice_items,
    },
  });
});
