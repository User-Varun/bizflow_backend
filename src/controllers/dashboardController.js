const { catchAsync } = require("../utilities/catchAsync");
const Invoice = require("../models/invoiceModel");
const Inventory = require("../models/inventoryModel");
const { Op } = require("sequelize");

function toTwoDecimal(value) {
  return Number(Number(value || 0).toFixed(2));
}

function parseIsoDateOnly(value) {
  const raw = String(value || "").trim();
  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;

  const year = Number(matched[1]);
  const monthIndex = Number(matched[2]) - 1;
  const day = Number(matched[3]);

  const date = new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

exports.getSummary = catchAsync(async (req, res) => {
  const tenant = req.tenant;
  const lowStockThreshold = Math.max(
    0,
    Number.parseInt(req.query.lowStockThreshold, 10) || 10,
  );
  const rangeType = String(req.query.rangeType || "month")
    .trim()
    .toLowerCase();
  const dateFromRaw = String(req.query.dateFrom || "").trim();
  const dateToRaw = String(req.query.dateTo || "").trim();

  const now = new Date();
  let periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  let periodEndExclusive = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  let periodLabel = "This Month";

  if (rangeType === "today") {
    periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    periodEndExclusive = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    periodLabel = "Today";
  }

  if (rangeType === "year") {
    periodStart = new Date(now.getFullYear(), 0, 1);
    periodEndExclusive = new Date(now.getFullYear() + 1, 0, 1);
    periodLabel = "This Year";
  }

  if (rangeType === "custom") {
    const fromDate = parseIsoDateOnly(dateFromRaw);
    const toDate = parseIsoDateOnly(dateToRaw);

    if (!fromDate || !toDate) {
      return res.status(400).json({
        status: "fail",
        message: "dateFrom and dateTo must be valid dates in YYYY-MM-DD format",
      });
    }

    if (fromDate > toDate) {
      return res.status(400).json({
        status: "fail",
        message: "dateFrom cannot be later than dateTo",
      });
    }

    periodStart = fromDate;
    periodEndExclusive = new Date(toDate);
    periodEndExclusive.setUTCDate(periodEndExclusive.getUTCDate() + 1);
    periodLabel = `${dateFromRaw} to ${dateToRaw}`;
  }

  const commonMonthWhere = {
    tenant_id: tenant.id,
    createdAt: {
      [Op.gte]: periodStart,
      [Op.lt]: periodEndExclusive,
    },
  };

  const [
    totalInvoicesCurrentMonth,
    stockOutTotalCurrentMonth,
    stockInTotalCurrentMonth,
    pendingReceivableTotal,
    pendingPayableTotal,
    lowStockItemCount,
    outOfStockItemCount,
  ] = await Promise.all([
    Invoice.count({
      where: commonMonthWhere,
    }),
    Invoice.sum("grand_total", {
      where: {
        ...commonMonthWhere,
        invoice_type: "stock_out",
      },
    }),
    Invoice.sum("grand_total", {
      where: {
        ...commonMonthWhere,
        invoice_type: "stock_in",
      },
    }),
    Invoice.sum("pending_amount", {
      where: {
        tenant_id: tenant.id,
        invoice_type: "stock_out",
        pending_amount: { [Op.gt]: 0 },
      },
    }),
    Invoice.sum("pending_amount", {
      where: {
        tenant_id: tenant.id,
        invoice_type: "stock_in",
        pending_amount: { [Op.gt]: 0 },
      },
    }),
    Inventory.count({
      where: {
        tenant_id: tenant.id,
        product_qty: { [Op.lte]: lowStockThreshold },
      },
    }),
    Inventory.count({
      where: {
        tenant_id: tenant.id,
        product_qty: { [Op.lte]: 0 },
      },
    }),
  ]);

  res.status(200).json({
    status: "success",
    result: {
      total_invoices_current_month: toTwoDecimal(totalInvoicesCurrentMonth),
      stock_out_total_current_month: toTwoDecimal(stockOutTotalCurrentMonth),
      stock_in_total_current_month: toTwoDecimal(stockInTotalCurrentMonth),
      pending_receivable_total: toTwoDecimal(pendingReceivableTotal),
      pending_payable_total: toTwoDecimal(pendingPayableTotal),
      low_stock_item_count: toTwoDecimal(lowStockItemCount),
      out_of_stock_item_count: toTwoDecimal(outOfStockItemCount),
      low_stock_threshold: toTwoDecimal(lowStockThreshold),
      month_start: periodStart,
      next_month_start: periodEndExclusive,
      range_type:
        rangeType === "custom"
          ? "custom"
          : rangeType === "year"
            ? "year"
            : rangeType === "today"
              ? "today"
              : "month",
      period_label: periodLabel,
      period_start: periodStart,
      period_end_exclusive: periodEndExclusive,
    },
  });
});
