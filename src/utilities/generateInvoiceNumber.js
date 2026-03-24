const Invoice = require("../models/invoiceModel");
const { Op, literal } = require("sequelize");

exports.generateInvoiceNumber = async ({ tenantId, transaction }) => {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  try {
    const lastInvoice = await Invoice.findOne({
      where: {
        tenant_id: tenantId,
        invoice_number: { [Op.like]: `${prefix}%` },
      },
      attributes: ["invoice_number"],
      order: [
        [
          literal(`CAST(split_part("invoice_number", '-', 3) AS INTEGER)`),
          "DESC",
        ],
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const rawSeq = lastInvoice?.invoice_number?.split("-")[2];
    const lastSeq = Number.isFinite(Number(rawSeq)) ? Number(rawSeq) : 0;
    const nextSeq = lastSeq + 1;

    return `${prefix}${String(nextSeq).padStart(3, "0")}`;
  } catch (err) {
    throw err;
  }
};
