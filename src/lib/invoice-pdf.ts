import jsPDF from "jspdf";

/** Render a DOM node (the invoice document) into an A4 PDF. */
export async function elementToPdf(element: HTMLElement): Promise<jsPDF> {
  const { default: html2canvas } = await import("html2canvas-pro");
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
  });

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const img = canvas.toDataURL("image/jpeg", 0.95);

  let remaining = imgHeight;
  let position = 0;
  pdf.addImage(img, "JPEG", 0, 0, imgWidth, imgHeight);
  remaining -= pageHeight;
  while (remaining > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(img, "JPEG", 0, position, imgWidth, imgHeight);
    remaining -= pageHeight;
  }
  return pdf;
}

export async function downloadInvoicePdf(element: HTMLElement, invoiceNumber: string) {
  const pdf = await elementToPdf(element);
  pdf.save(`faktura-${invoiceNumber || "bez-cisla"}.pdf`);
}
