const Invoice = require("../models/invoiceModel");
const InvoiceItem = require("../models/invoiceItemsModel");
const { Op } = require("sequelize");
const { catchAsync } = require("../utilities/catchAsync");
const { invoiceToPdfBuffer } = require("../utilities/pdfGenerator");
const puppeteer = require("puppeteer");
const { renderInvoiceHtml } = require("../utilities/htmlInvoiceTemplate");
const archiver = require("archiver");
const { calculateInvoiceData } = require("../utilities/calculateInvoiceData");

exports.downloadBills = catchAsync(async (req, res, next) => {
  const tenant = req.tenant;
  const { range, dateFrom, dateTo } = req.body || {};

  let start = null;
  let end = null;

  const now = new Date();

  if (range === "last_month") {
    const firstDayLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const firstDayThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    start = firstDayLastMonth;
    end = firstDayThisMonth;
  } else if (range === "this_month") {
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  } else if (dateFrom && dateTo) {
    start = new Date(dateFrom);
    end = new Date(dateTo);
    // include the whole end day
    end.setUTCDate(end.getUTCDate() + 1);
  } else {
    return next(new Error("invalid date range"));
  }

  const invoices = await Invoice.findAll({
    where: {
      tenant_id: tenant.id,
      createdAt: { [Op.gte]: start, [Op.lt]: end },
    },
    order: [["createdAt", "ASC"]],
  });

  // set response headers for zip
  res.setHeader("Content-Type", "application/zip");
  const filename = `bills-${new Date().toISOString().slice(0,10)}.zip`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => next(err));
  archive.pipe(res);

  // render all invoices to PDFs using a single headless browser instance
  let browser = null;
  try {
    browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();

    for (const invoice of invoices) {
      const items = await InvoiceItem.findAll({ where: { invoice_id: invoice.id }, order: [["createdAt", "ASC"]] });
      const calculatedData = calculateInvoiceData(items);
      const invoiceObj = {
        ...invoice.toJSON(),
        invoice_items: items,
        company_gstin: tenant.gstin || "",
        account_number: tenant.account_number || "",
        ifsc_code: tenant.ifsc_code || "",
        qr_url: tenant.qr_url || "",
        discount_total: calculatedData.discount_total,
      };
      const html = renderInvoiceHtml(invoiceObj);
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
      const entryName = `invoice-${invoice.invoice_number}.pdf`;
      archive.append(pdfBuffer, { name: entryName });
    }

    await archive.finalize();
  } catch (err) {
    if (!res.headersSent) return next(err);
    console.error("reports download error:", err);
  } finally {
    try {
      if (browser) await browser.close();
    } catch (e) {
      // ignore
    }
  }
});
