const { catchAsync } = require("../utilities/catchAsync");
const Invoice = require("../models/invoiceModel");
const Inventory = require("../models/inventoryModel");
const { Op } = require("sequelize");

function toTwoDecimal(value) {
  return Number(Number(value || 0).toFixed(2));
}

exports.getSummary = catchAsync(async (req, res) => {
  const tenant = req.tenant;
  const lowStockThreshold = Math.max(
    0,
    Number.parseInt(req.query.lowStockThreshold, 10) || 10,
  );

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const commonMonthWhere = {
    tenant_id: tenant.id,
    createdAt: {
      [Op.gte]: startOfMonth,
      [Op.lt]: startOfNextMonth,
    },
  };

  const [
    totalInvoicesCurrentMonth,
    stockOutTotalCurrentMonth,
    stockInTotalCurrentMonth,
    pendingReceivableTotal,
    pendingPayableTotal,
    lowStockItemCount,
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
      low_stock_threshold: toTwoDecimal(lowStockThreshold),
      month_start: startOfMonth,
      next_month_start: startOfNextMonth,
    },
  });
});
