const { catchAsync } = require("../utilities/catchAsync");
const AppError = require("../utilities/appError");
const Dealer = require("../models/dealerModel");
const Invoice = require("../models/invoiceModel");
const Payment = require("../models/paymentModel");
const { Op } = require("sequelize");

const VALID_INVOICE_TYPES = new Set(["stock_in", "stock_out"]);

function sendSuccess(res, { result, meta = {}, statusCode = 200 }) {
  res.status(statusCode).json({
    status: "success",
    result,
    meta,
  });
}

function assertInvoiceType(invoiceType) {
  if (!VALID_INVOICE_TYPES.has(invoiceType)) {
    throw new AppError("invoice_type must be stock_in or stock_out", 400);
  }
}

function normalizeDealerPayload(payload = {}) {
  const invoice_type = String(payload.invoice_type || "")
    .trim()
    .toLowerCase();

  const name = String(payload.name || "").trim();
  const address = String(payload.address || "").trim();
  const phone = String(payload.phone || "")
    .replace(/\s+/g, "")
    .trim();
  const gst = String(payload.gst || "")
    .trim()
    .toUpperCase();

  return {
    invoice_type,
    name,
    address,
    phone,
    gst,
  };
}

async function getDealerOrThrow({ tenantId, dealerId, invoiceType }) {
  const dealer = await Dealer.findOne({
    where: {
      id: dealerId,
      tenant_id: tenantId,
      invoice_type: invoiceType,
    },
  });

  if (!dealer) {
    throw new AppError("dealer not found", 404);
  }

  return dealer;
}

function buildDealerInvoiceWhere({ tenantId, invoiceType, dealer }) {
  return {
    tenant_id: tenantId,
    invoice_type: invoiceType,
    dealer_id: dealer.id,
  };
}

exports.getDealers = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const invoiceType = String(req.query.invoice_type || "")
    .trim()
    .toLowerCase();
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(
      1,
      Number.parseInt(req.query.pageSize ?? req.query.limit, 10) || 20,
    ),
  );
  const search = String(req.query.search || "").trim();

  try {
    assertInvoiceType(invoiceType);
  } catch (err) {
    return next(err);
  }

  const where = {
    tenant_id: tenant.id,
    invoice_type: invoiceType,
  };

  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { phone: { [Op.iLike]: `%${search}%` } },
      { address: { [Op.iLike]: `%${search}%` } },
      { gst: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const offset = (page - 1) * pageSize;

  const { rows: dealers, count: total } = await Dealer.findAndCountAll({
    where,
    order: [["updatedAt", "DESC"]],
    limit: pageSize,
    offset,
  });

  sendSuccess(res, {
    result: dealers,
    meta: {
      invoice_type: invoiceType,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      search,
    },
  });
});

exports.getDealerById = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const dealerId = String(req.params.id || "").trim();
  const invoiceType = String(req.query.invoice_type || "")
    .trim()
    .toLowerCase();

  try {
    assertInvoiceType(invoiceType);
  } catch (err) {
    return next(err);
  }

  if (!dealerId) return next(new AppError("dealer id is required", 400));

  const dealer = await Dealer.findOne({
    where: {
      id: dealerId,
      tenant_id: tenant.id,
      invoice_type: invoiceType,
    },
  });

  if (!dealer) return next(new AppError("dealer not found", 404));

  sendSuccess(res, {
    result: dealer,
    meta: {
      invoice_type: invoiceType,
    },
  });
});

exports.updateDealer = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const dealerId = String(req.params.id || "").trim();
  const payload = normalizeDealerPayload(req.body);

  if (!dealerId) return next(new AppError("dealer id is required", 400));

  try {
    assertInvoiceType(payload.invoice_type);
  } catch (err) {
    return next(err);
  }

  if (!payload.name || !payload.phone) {
    return next(new AppError("name and phone are required", 400));
  }

  const existingDealer = await Dealer.findOne({
    where: {
      id: dealerId,
      tenant_id: tenant.id,
    },
  });

  if (!existingDealer) return next(new AppError("dealer not found", 404));

  const duplicateDealer = await Dealer.findOne({
    where: {
      tenant_id: tenant.id,
      invoice_type: payload.invoice_type,
      name: payload.name,
      phone: payload.phone,
      id: {
        [Op.ne]: dealerId,
      },
    },
  });

  if (duplicateDealer) {
    return next(
      new AppError(
        "dealer with same name and phone already exists for this invoice type",
        409,
      ),
    );
  }

  await existingDealer.update({
    invoice_type: payload.invoice_type,
    name: payload.name,
    address: payload.address,
    phone: payload.phone,
    gst: payload.gst,
  });

  sendSuccess(res, {
    result: existingDealer,
    meta: {
      action: "updated",
      invoice_type: payload.invoice_type,
    },
  });
});

exports.getDealerInvoices = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const dealerId = String(req.params.id || "").trim();
  const invoiceType = String(req.query.invoice_type || "")
    .trim()
    .toLowerCase();
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.pageSize, 10) || 8),
  );
  const billState = String(req.query.bill_state || "all")
    .trim()
    .toLowerCase();
  const search = String(req.query.search || "").trim();

  if (!dealerId) return next(new AppError("dealer id is required", 400));

  try {
    assertInvoiceType(invoiceType);
  } catch (err) {
    return next(err);
  }

  let dealer;

  try {
    dealer = await getDealerOrThrow({
      tenantId: tenant.id,
      dealerId,
      invoiceType,
    });
  } catch (err) {
    return next(err);
  }

  const where = buildDealerInvoiceWhere({
    tenantId: tenant.id,
    invoiceType,
    dealer,
  });

  if (["pending", "partial", "paid"].includes(billState)) {
    where.bill_state = billState;
  }

  if (search) {
    where.invoice_number = {
      [Op.iLike]: `%${search}%`,
    };
  }

  const offset = (page - 1) * pageSize;

  const { rows, count: total } = await Invoice.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit: pageSize,
    offset,
  });

  sendSuccess(res, {
    result: rows,
    meta: {
      dealer_id: dealerId,
      invoice_type: invoiceType,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      bill_state: billState,
      search,
      linkage_mode: "dealer_id",
    },
  });
});

exports.getDealerLedgerSummary = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const dealerId = String(req.params.id || "").trim();
  const invoiceType = String(req.query.invoice_type || "")
    .trim()
    .toLowerCase();

  if (!dealerId) return next(new AppError("dealer id is required", 400));

  try {
    assertInvoiceType(invoiceType);
  } catch (err) {
    return next(err);
  }

  let dealer;

  try {
    dealer = await getDealerOrThrow({
      tenantId: tenant.id,
      dealerId,
      invoiceType,
    });
  } catch (err) {
    return next(err);
  }

  const invoiceWhere = buildDealerInvoiceWhere({
    tenantId: tenant.id,
    invoiceType,
    dealer,
  });

  const invoices = await Invoice.findAll({
    where: invoiceWhere,
    attributes: ["id", "grand_total", "pending_amount"],
  });

  const invoiceCount = invoices.length;
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const totalInvoiced = invoices.reduce(
    (acc, invoice) => acc + Number(invoice.grand_total || 0),
    0,
  );
  const totalPending = invoices.reduce(
    (acc, invoice) => acc + Number(invoice.pending_amount || 0),
    0,
  );

  let totalPaid = 0;

  if (invoiceIds.length > 0) {
    totalPaid = await Payment.sum("amount", {
      where: {
        invoice_id: {
          [Op.in]: invoiceIds,
        },
      },
    });
  }

  sendSuccess(res, {
    result: {
      dealer_id: dealerId,
      invoice_type: invoiceType,
      invoice_count: invoiceCount,
      total_invoiced: Number(totalInvoiced.toFixed(2)),
      total_paid: Number((Number(totalPaid || 0) || 0).toFixed(2)),
      total_pending: Number(totalPending.toFixed(2)),
      ledger_kind: invoiceType === "stock_out" ? "receivable" : "payable",
    },
    meta: {
      linkage_mode: "dealer_id",
    },
  });
});

exports.getDealerLedgerStatement = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const dealerId = String(req.params.id || "").trim();
  const invoiceType = String(req.query.invoice_type || "")
    .trim()
    .toLowerCase();
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, Number.parseInt(req.query.pageSize, 10) || 10),
  );

  if (!dealerId) return next(new AppError("dealer id is required", 400));

  try {
    assertInvoiceType(invoiceType);
  } catch (err) {
    return next(err);
  }

  let dealer;

  try {
    dealer = await getDealerOrThrow({
      tenantId: tenant.id,
      dealerId,
      invoiceType,
    });
  } catch (err) {
    return next(err);
  }

  const invoiceWhere = buildDealerInvoiceWhere({
    tenantId: tenant.id,
    invoiceType,
    dealer,
  });

  const invoices = await Invoice.findAll({
    where: invoiceWhere,
    attributes: [
      "id",
      "invoice_number",
      "grand_total",
      "pending_amount",
      "bill_state",
      "createdAt",
    ],
    order: [["createdAt", "ASC"]],
  });

  const invoiceIds = invoices.map((invoice) => invoice.id);

  let payments = [];

  if (invoiceIds.length > 0) {
    payments = await Payment.findAll({
      where: {
        invoice_id: {
          [Op.in]: invoiceIds,
        },
      },
      attributes: ["id", "invoice_id", "amount", "payment_method", "createdAt"],
      order: [["createdAt", "ASC"]],
    });
  }

  const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));

  const rows = [
    ...invoices.map((invoice) => ({
      row_id: `invoice:${invoice.id}`,
      row_type: "invoice",
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      amount: Number(invoice.grand_total || 0),
      payment_method: null,
      bill_state: invoice.bill_state,
      event_at: invoice.createdAt,
      sign: +1,
    })),
    ...payments.map((payment) => ({
      row_id: `payment:${payment.id}`,
      row_type: "payment",
      invoice_id: payment.invoice_id,
      invoice_number: invoiceMap.get(payment.invoice_id)?.invoice_number || "",
      amount: Number(payment.amount || 0),
      payment_method: payment.payment_method,
      bill_state: invoiceMap.get(payment.invoice_id)?.bill_state || "",
      event_at: payment.createdAt,
      sign: -1,
    })),
  ];

  rows.sort((a, b) => {
    const timeDiff = new Date(a.event_at).getTime() - new Date(b.event_at).getTime();
    if (timeDiff !== 0) return timeDiff;
    if (a.row_type === b.row_type) return 0;
    return a.row_type === "invoice" ? -1 : 1;
  });

  let runningBalance = 0;

  const withBalance = rows.map((row) => {
    runningBalance += row.amount * row.sign;
    return {
      ...row,
      running_balance: Number(runningBalance.toFixed(2)),
      amount: Number(row.amount.toFixed(2)),
    };
  });

  const total = withBalance.length;
  const offset = (page - 1) * pageSize;
  const pagedRows = withBalance.slice(offset, offset + pageSize);

  sendSuccess(res, {
    result: pagedRows,
    meta: {
      dealer_id: dealerId,
      invoice_type: invoiceType,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      ledger_kind: invoiceType === "stock_out" ? "receivable" : "payable",
      linkage_mode: "dealer_id",
    },
  });
});

exports.upsertDealer = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const payload = normalizeDealerPayload(req.body);

  try {
    assertInvoiceType(payload.invoice_type);
  } catch (err) {
    return next(err);
  }

  if (!payload.name || !payload.phone) {
    return next(new AppError("name and phone are required", 400));
  }

  const existingDealer = await Dealer.findOne({
    where: {
      tenant_id: tenant.id,
      invoice_type: payload.invoice_type,
      name: payload.name,
      phone: payload.phone,
    },
  });

  if (existingDealer) {
    await existingDealer.update({
      address: payload.address,
      gst: payload.gst,
    });

    return sendSuccess(res, {
      result: existingDealer,
      meta: {
        action: "updated",
        invoice_type: payload.invoice_type,
      },
    });
  }

  const createdDealer = await Dealer.create({
    tenant_id: tenant.id,
    invoice_type: payload.invoice_type,
    name: payload.name,
    address: payload.address,
    phone: payload.phone,
    gst: payload.gst,
  });

  sendSuccess(res, {
    statusCode: 201,
    result: createdDealer,
    meta: {
      action: "created",
      invoice_type: payload.invoice_type,
    },
  });
});
