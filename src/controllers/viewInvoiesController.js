const Invoice = require("../models/invoiceModel");
const InvoiceItem = require("../models/invoiceItemsModel");
const Payment = require("../models/paymentModel");
const { catchAsync } = require("../utilities/catchAsync");
const AppError = require("../utilities/appError");
const { Op } = require("sequelize");

exports.getInvoices = catchAsync(async (req, res) => {
  const tenant = req.tenant;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.pageSize, 10) || 8),
  );
  const search = String(req.query.search || "").trim();
  const searchFilter = String(req.query.searchFilter || "invoice_number");

  const where = {
    tenant_id: tenant.id,
  };

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
