const fs = require("fs");
const path = require("path");

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildItemsTableRows(items) {
  if (!Array.isArray(items) || items.length === 0) return "";

  return items
    .map((item, idx) => {
      const baseAmount = Number(item.rate || 0) * Number(item.product_qty || 0);
      const discountPct = Number(item.discount || 0);
      const discountAmount = (baseAmount * discountPct) / 100;
      const taxableAmount = Math.max(0, baseAmount - discountAmount);
      const cgstAmount = (taxableAmount * Number(item.cgst || 0)) / 100;
      const sgstAmount = (taxableAmount * Number(item.sgst || 0)) / 100;
      const lineAmount = taxableAmount + cgstAmount + sgstAmount;

      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(String(item.product_qty || 0))}</td>
          <td class="prod-col prod-name">${escapeHtml(item.name || "")}</td>
          <td>${escapeHtml(item.hsn_code || "-")}</td>
          <td>₹ ${(Number(item.mrp) || 0).toFixed(2)}</td>
          <td>₹ ${(Number(item.rate) || 0).toFixed(2)}</td>
          <td class="discount-cell">${(Number(item.discount) || 0).toFixed(2)}%</td>
          <td>${(Number(item.sgst) || 0).toFixed(2)}%</td>
          <td>${(Number(item.cgst) || 0).toFixed(2)}%</td>
          <td>₹ ${lineAmount.toFixed(2)}</td>
        </tr>
      `;
    })
    .join("\n");
}

function readCss() {
  // Try to read frontend invoice CSS; fall back to minimal styles if missing
  const cssPath = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "bizflow_frontend",
    "src",
    "styles",
    "invoiceTemplate.css",
  );

  try {
    return fs.readFileSync(cssPath, "utf8");
  } catch (e) {
    // fallback minimal styles
    return `body{font-family:Arial,sans-serif}`;
  }
}

const frontendCss = readCss();

function readFallbackQrDataUrl() {
  // try to read frontend public/qr.png and return data url
  const candidate = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "bizflow_frontend",
    "public",
    "qr.png",
  );
  try {
    const buf = fs.readFileSync(candidate);
    const mime = "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch (e) {
    return "";
  }
}

const fallbackQrDataUrl = readFallbackQrDataUrl();

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch (e) {
    return "";
  }
}

function numberToWords(num) {
  if (num === 0) return "zero";

  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const teens = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

  function convertLessThanThousand(n) {
    if (n === 0) return "";
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " hundred" + (n % 100 !== 0 ? " " + convertLessThanThousand(n % 100) : "");
  }

  let integer = Math.floor(num);
  const decimal = Math.round((num - integer) * 100);

  let result = "";

  if (integer >= 10000000) {
    const crores = Math.floor(integer / 10000000);
    result += convertLessThanThousand(crores) + " crore ";
    integer %= 10000000;
  }

  if (integer >= 100000) {
    const lakhs = Math.floor(integer / 100000);
    result += convertLessThanThousand(lakhs) + " lakh ";
    integer %= 100000;
  }

  if (integer >= 1000) {
    const thousands = Math.floor(integer / 1000);
    result += convertLessThanThousand(thousands) + " thousand ";
    integer %= 1000;
  }

  if (integer > 0) {
    result += convertLessThanThousand(integer);
  }

  result = result.trim();

  if (decimal > 0) {
    result += " and " + convertLessThanThousand(decimal) + " paise";
  }

  return result + " only";
}

function renderInvoiceHtml(data) {
  const items = Array.isArray(data.invoice_items) ? data.invoice_items : [];
  const itemsRows = buildItemsTableRows(items);

  const invoiceType = String(data.invoice_type || "").toLowerCase();
  const isStockIn = invoiceType === "stock_in";
  const displayInvoiceNumber =
    isStockIn && String(data.supplier_invoice_number || "").trim()
      ? data.supplier_invoice_number
      : data.invoice_number;
  const companyGstin = String(data.company_gstin || "").trim();
  const partyGstin = String(data.other_party_gst || "").trim();
  const gstinValue = invoiceType === "stock_out" ? companyGstin : partyGstin;
  const gstValue = invoiceType === "stock_out" ? partyGstin : companyGstin;

  return `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>@page { size: A4 landscape; margin: 0; }</style>
    <style>
      .invoice-border { margin: 10px; }
    </style>
    <style>${frontendCss}</style>
  </head>
  <body>
    <div class="invoice-template-container">
      <div id="invoice-root" class="invoice-pages-stack">
        <div class="invoice-print-sheet">
          <div class="invoice-print-page">
            <div class="invoice-container">
              <div class="invoice-border">
                <div class="invoice-page-tag">1/1</div>
                <header class="inv-top">
                  <div class="inv-left">
                    <h2 class="company">${escapeHtml(data.invoice_from || "")}</h2>
                    <span class="text-s">${escapeHtml(data.address_from || "")}</span>
                    <span class="text-s">Phone: ${escapeHtml(data.phone_from || "")}</span>
                  </div>
                  <div class="inv-right">
                    <h2 class="company">${escapeHtml(data.invoice_to || "")}</h2>
                    <p class="text-s">${escapeHtml(data.address_to || "")}</p>
                    <p class="text-s">Phone: ${escapeHtml(data.phone_to || "")}</p>
                    <p class="text-s">GST : ${escapeHtml(gstValue || "-")}</p>
                  </div>
                </header>

                <section class="bill-meta">
                  <div class="container-pad"><span>GSTIN: ${escapeHtml(gstinValue || "-")}</span></div>
                  <div class="inv-center"><h1 class="inv-title">GST INVOICE</h1></div>
                  <div class="inv-right-inner container-pad-2">
                    <span>Invoice No. : ${escapeHtml(displayInvoiceNumber || "")}</span>
                    <span>Date : ${escapeHtml(formatDate(data.createdAt))}</span>
                  </div>
                </section>

                <table class="inv-table">
                  <colgroup>
                    <col class="inv-col-sn" />
                    <col class="inv-col-qty" />
                    <col class="inv-col-product" />
                    <col class="inv-col-hsn" />
                    <col class="inv-col-mrp" />
                    <col class="inv-col-rate" />
                    <col class="inv-col-discount" />
                    <col class="inv-col-sgst" />
                    <col class="inv-col-cgst" />
                    <col class="inv-col-amount" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Sn.</th>
                      <th>QTY</th>
                      <th>Product</th>
                      <th>HSN</th>
                      <th>MRP (₹)</th>
                      <th>RATE (₹)</th>
                      <th>DIS (%)</th>
                      <th>SGST (%)</th>
                      <th>CGST (%)</th>
                      <th>Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemsRows || "<tr><td colSpan=10 style='text-align:center'>NO Items available</td></tr>"}
                  </tbody>
                </table>

                <div class="subTotalContainer">
                  <div class="inner-stc">
                    <span>SUB TOTAL</span>
                    <span>₹ ${(Number(data.sub_total) || 0).toFixed(2)}</span>
                  </div>
                </div>

                <div class="totals-row">
                  <div class="left-block">
                    <div class="inner-left-block">
                      <p class="in-words">Rs. ${escapeHtml(numberToWords(Math.round(Number(data.grand_total || 0))))}</p>
                      <div class="terms">
                        <a href="#">Terms & Conditions</a>
                      </div>
                      <div class="terms-more">
                        <p>Goods once sold will not be taken back or exchanged.</p>
                        <span>Bills not paid due date will attract 24% interest.</span>
                      </div>
                      <div class="bank">
                        <span><strong>A/C NO: </strong> ${escapeHtml(data.account_number || "-")}</span>
                        <span><strong>IFSC CODE: </strong> ${escapeHtml(data.ifsc_code || "-")}</span>
                        <span><strong>GSTIN: </strong> ${escapeHtml(gstinValue || "-")}</span>
                      </div>
                    </div>
                    <div class="inner-right-block">
                      ${!isStockIn ? `<img class="qr" src="${escapeHtml(data.qr_url || fallbackQrDataUrl || "")}" alt="QR code" />
                      <span class="company-name">For ${escapeHtml(data.invoice_from || "Business")}</span>` : `<span>Seller: ${escapeHtml(data.invoice_from || "-")}</span>`}
                    </div>
                    <div class="inner-middle-down-block">
                      <a href="#" class="auth-sig">Authorised Signatory</a>
                    </div>
                  </div>
                  <div class="right-block">
                    <div class="tot-line"><span>SGST PAYABLE</span><span>₹ ${(Number(data.sgst_total) || 0).toFixed(2)}</span></div>
                    <div class="tot-line"><span>CGST PAYABLE</span><span>₹ ${(Number(data.cgst_total) || 0).toFixed(2)}</span></div>
                    <div class="tot-line"><span>DISCOUNT</span><span>₹ ${(Number(data.discount_total) || 0).toFixed(2)}</span></div>
                    <div class="tot-line grand"><span>GRAND TOTAL</span><span>₹ ${(Number(data.grand_total) || 0).toFixed(2)}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body>
  </html>`;
}

module.exports = { renderInvoiceHtml };
