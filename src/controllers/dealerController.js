const { catchAsync } = require("../utilities/catchAsync");
const AppError = require("../utilities/appError");
const Dealer = require("../models/dealerModel");

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

exports.getDealers = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const invoiceType = String(req.query.invoice_type || "")
    .trim()
    .toLowerCase();
  const limit = Math.min(
    50,
    Math.max(1, Number.parseInt(req.query.limit, 10) || 20),
  );

  if (invoiceType !== "stock_in" && invoiceType !== "stock_out") {
    return next(
      new AppError("invoice_type must be stock_in or stock_out", 400),
    );
  }

  const dealers = await Dealer.findAll({
    where: {
      tenant_id: tenant.id,
      invoice_type: invoiceType,
    },
    order: [["updatedAt", "DESC"]],
    limit,
  });

  res.status(200).json({
    status: "success",
    length: dealers.length,
    result: dealers,
  });
});

exports.upsertDealer = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const payload = normalizeDealerPayload(req.body);

  if (
    payload.invoice_type !== "stock_in" &&
    payload.invoice_type !== "stock_out"
  ) {
    return next(
      new AppError("invoice_type must be stock_in or stock_out", 400),
    );
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

    return res.status(200).json({
      status: "success",
      result: existingDealer,
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

  res.status(201).json({
    status: "success",
    result: createdDealer,
  });
});
