import jsPDF from "jspdf";

const A4_RATIO = 297 / 210; // výška / šířka

/**
 * Najde nejbližší „prázdný“ řádek pixelů nad navrhovaným zlomem stránky,
 * aby se text ani řádky tabulky nerozřízly v půlce.
 */
function findBreak(data: Uint8ClampedArray, width: number, ideal: number, min: number): number {
  const isBlank = (y: number) => {
    const start = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = start + x * 4;
      if (data[i]! < 245 || data[i + 1]! < 245 || data[i + 2]! < 245) return false;
    }
    return true;
  };
  for (let y = ideal; y > min; y--) {
    if (isBlank(y)) return y;
  }
  return ideal;
}

/** Vykreslí DOM uzel (dokument faktury) do A4 PDF se správným stránkováním. */
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
  const margin = 8; // mm okraj kolem obsahu
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - margin * 2;

  // Kolik pixelů zdrojového plátna se vejde na jednu stránku
  const pxPerPage = Math.floor((canvas.width * contentHeight) / contentWidth);

  const ctx = canvas.getContext("2d");
  let imageData: Uint8ClampedArray | null = null;
  try {
    imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height).data ?? null;
  } catch {
    imageData = null;
  }

  let offset = 0;
  let page = 0;
  while (offset < canvas.height) {
    let sliceHeight = Math.min(pxPerPage, canvas.height - offset);
    if (imageData && offset + sliceHeight < canvas.height) {
      const ideal = offset + sliceHeight;
      const cut = findBreak(imageData, canvas.width, ideal, offset + Math.floor(pxPerPage * 0.6));
      sliceHeight = cut - offset;
    }

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;
    const pctx = pageCanvas.getContext("2d")!;
    pctx.fillStyle = "#ffffff";
    pctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    pctx.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    if (page > 0) pdf.addPage();
    const imgHeight = (sliceHeight * contentWidth) / canvas.width;
    pdf.addImage(
      pageCanvas.toDataURL("image/jpeg", 0.95),
      "JPEG",
      margin,
      margin,
      contentWidth,
      Math.min(imgHeight, contentHeight),
    );

    offset += sliceHeight;
    page += 1;
    if (page > 40) break; // pojistka
  }

  // Číslování stránek
  const total = pdf.getNumberOfPages();
  if (total > 1) {
    for (let i = 1; i <= total; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(140);
      pdf.text(`Strana ${i} / ${total}`, pageWidth - margin, pageHeight - 4, { align: "right" });
    }
  }
  return pdf;
}

export async function downloadInvoicePdf(element: HTMLElement, invoiceNumber: string) {
  const pdf = await elementToPdf(element);
  pdf.save(`faktura-${invoiceNumber || "bez-cisla"}.pdf`);
}

export const PDF_PAGE_RATIO = A4_RATIO;
