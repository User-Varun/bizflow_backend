require("dotenv").config({ path: "./config.env" });

const sequelize = require("../src/config/db");
const Dealer = require("../src/models/dealerModel");
const Invoice = require("../src/models/invoiceModel");

function normalizeDealerSnapshot(invoice) {
  const invoiceType = String(invoice.invoice_type || "")
    .trim()
    .toLowerCase();

  const source =
    invoiceType === "stock_out"
      ? {
          name: invoice.invoice_to,
          address: invoice.address_to,
          phone: invoice.phone_to,
          gst: invoice.other_party_gst,
        }
      : {
          name: invoice.invoice_from,
          address: invoice.address_from,
          phone: invoice.phone_from,
          gst: invoice.other_party_gst,
        };

  return {
    invoice_type: invoiceType,
    name: String(source.name || "").trim(),
    address: String(source.address || "").trim(),
    phone: String(source.phone || "")
      .replace(/\s+/g, "")
      .trim(),
    gst: String(source.gst || "")
      .trim()
      .toUpperCase(),
  };
}

async function runBackfill() {
  const summary = {
    totalInvoicesScanned: 0,
    linkedExistingDealers: 0,
    createdDealers: 0,
    updatedInvoices: 0,
    skippedInvalidSnapshots: 0,
  };

  await sequelize.transaction(async (transaction) => {
    const invoices = await Invoice.findAll({
      where: {
        dealer_id: null,
      },
      order: [["createdAt", "ASC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    summary.totalInvoicesScanned = invoices.length;

    for (const invoice of invoices) {
      const snapshot = normalizeDealerSnapshot(invoice);

      if (!snapshot.name || !snapshot.phone) {
        summary.skippedInvalidSnapshots += 1;
        continue;
      }

      let dealer = await Dealer.findOne({
        where: {
          tenant_id: invoice.tenant_id,
          invoice_type: snapshot.invoice_type,
          name: snapshot.name,
          phone: snapshot.phone,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (dealer) {
        summary.linkedExistingDealers += 1;

        if (!dealer.address && snapshot.address) {
          dealer.address = snapshot.address;
        }

        if (!dealer.gst && snapshot.gst) {
          dealer.gst = snapshot.gst;
        }

        await dealer.save({ transaction });
      } else {
        dealer = await Dealer.create(
          {
            tenant_id: invoice.tenant_id,
            invoice_type: snapshot.invoice_type,
            name: snapshot.name,
            address: snapshot.address,
            phone: snapshot.phone,
            gst: snapshot.gst,
          },
          { transaction },
        );

        summary.createdDealers += 1;
      }

      invoice.dealer_id = dealer.id;
      await invoice.save({ transaction });
      summary.updatedInvoices += 1;
    }

    const nullCount = await Invoice.count({
      where: { dealer_id: null },
      transaction,
    });

    if (nullCount > 0) {
      throw new Error(
        `Backfill incomplete: ${nullCount} invoice(s) still have null dealer_id.`,
      );
    }

    await sequelize.query(
      `ALTER TABLE "invoices" ALTER COLUMN "dealer_id" SET NOT NULL;`,
      { transaction },
    );
  });

  return summary;
}

(async () => {
  try {
    const summary = await runBackfill();
    console.log("Invoice dealer_id backfill completed.");
    console.table(summary);
    process.exitCode = 0;
  } catch (err) {
    console.error("Invoice dealer_id backfill failed:", err.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
