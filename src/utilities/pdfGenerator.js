const puppeteer = require("puppeteer");
const { renderInvoiceHtml } = require("./htmlInvoiceTemplate");

async function invoiceToPdfBuffer(invoice) {
  // Launch puppeteer headless browser and render HTML to PDF buffer
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    const html = renderInvoiceHtml(invoice);
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    await page.close();
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

module.exports = {
  invoiceToPdfBuffer,
};
