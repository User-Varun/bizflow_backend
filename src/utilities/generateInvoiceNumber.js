const { catchAsync } = require("./catchAsync");
const Invoice = require("../models/invoiceModel");
const { Op } = require("sequelize");

exports.generateInvoiceNumber = catchAsync(
  async ({ tenantId, transaction }) => {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    const lastInvoice = await Invoice.findOne({
      where: {
        tenantId: tenantId,
        invoice_number: { [Op.like]: `${prefix}%` },
      },
      attributes: ["invoice_number"],
      order: [["invoice_number", "DESC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const lastSeq = lastInvoice
      ? Number(lastInvoice.invoice_number.split("-")[2])
      : 0;

    const nextSeq = lastSeq + 1;

    return `${prefix}${String(nextSeq).padStart(3, "0")}`;
  },
);
