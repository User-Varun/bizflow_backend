const Invoice = require("../models/invoiceModel");
const { catchAsync } = require("../utilities/catchAsync");

exports.getInvoices = catchAsync(async (req, res) => {
  const tenant = req.tenant;

  const invoices = await Invoice.findAll({ where: { tenant_id: tenant.id } });

  res.status(200).json({
    status: "success",
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

  res.status(200).json({
    status: "success",
    result: invoice,
  });
});
