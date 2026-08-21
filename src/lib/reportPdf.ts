import type { ClinicalEntryCategory, ClinicalTimelineEntry, Pet } from '../types';

// Genera PDFs de reportes de mascota (libreta sanitaria, control de medicacion, etc.)
// reutilizando el mismo formato visual que el Historial Clinico: encabezado con logo,
// foto de la mascota, datos de mascota/tutor, y una lista de eventos ordenada de mas
// reciente a mas antigua.

async function imageToDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) ?? null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const CATEGORY_LABELS: Record<ClinicalEntryCategory, string> = {
  medication: 'Medicamento',
  deworming: 'Desparasitario',
  vaccine: 'Vacuna',
  treatment: 'Tratamiento',
  clinical_note: 'Nota clinica',
};

export interface BuildReportPdfParams {
  pet: Pet;
  ownerEmail: string;
  entries: ClinicalTimelineEntry[];
  reportHeaderTitle: string;
  sectionTitle: string;
  emptyMessage: string;
  fileNamePrefix: string;
  logoUrl?: string;
}

export async function buildTimelineReportPdf(params: BuildReportPdfParams): Promise<{ fileName: string; blob: Blob }> {
  const { pet, ownerEmail, entries, reportHeaderTitle, sectionTitle, emptyMessage, fileNamePrefix, logoUrl } = params;

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const footerY = pageHeight - 8;
  let y = 12;

  const logoData = logoUrl ? await imageToDataUrl(logoUrl) : null;
  const petPhoto = pet.photoUrl ? await imageToDataUrl(pet.photoUrl) : null;

  const drawHeader = () => {
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(marginX, 10, pageWidth - marginX * 2, 18, 2, 2, 'F');

    if (logoData) {
      const logoFormat = logoData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(logoData, logoFormat, marginX + 2, 12.5, 12, 12);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(reportHeaderTitle, logoData ? marginX + 17 : marginX + 3, 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(new Date().toLocaleDateString(), pageWidth - marginX - 2, 18, { align: 'right' });
    doc.setTextColor(15, 23, 42);
  };

  const drawSectionTitle = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text(sectionTitle, marginX, y);
    doc.setDrawColor(203, 213, 225);
    doc.line(marginX, y + 1.5, pageWidth - marginX, y + 1.5);
    y += 8;
  };

  drawHeader();
  y = 36;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, y, pageWidth - marginX * 2, 36, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`Mascota: ${pet.name}`, marginX + 4, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Raza: ${pet.breed} | Especie: ${pet.species}`, marginX + 4, y + 14);
  doc.text(
    `Sexo: ${pet.sex} | Edad: ${pet.ageYears}a ${pet.ageMonths}m | Peso: ${pet.weightKg} kg`,
    marginX + 4,
    y + 20,
  );

  const tutorLine = doc.splitTextToSize(`Tutor: ${ownerEmail || 'N/D'}`, pageWidth - marginX * 2 - 40);
  doc.text(tutorLine, marginX + 4, y + 26);

  if (petPhoto) {
    const petFormat = petPhoto.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.setDrawColor(148, 163, 184);
    doc.roundedRect(pageWidth - marginX - 28, y + 4, 24, 24, 2, 2);
    doc.addImage(petPhoto, petFormat, pageWidth - marginX - 27, y + 5, 22, 22);
  }

  y += 44;
  drawSectionTitle();

  if (entries.length === 0) {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(marginX, y, pageWidth - marginX * 2, 18, 2, 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(emptyMessage, marginX + 4, y + 11);
  }

  for (const entry of entries) {
    const dateLabel = new Date(entry.eventDate).toLocaleDateString();
    const chip = CATEGORY_LABELS[entry.category] ?? entry.category;
    const description = doc.splitTextToSize(entry.description, pageWidth - marginX * 2 - 8);
    const cardHeight = 20 + description.length * 4.8;

    if (y + cardHeight > footerY - 8) {
      doc.addPage();
      drawHeader();
      y = 36;
      drawSectionTitle();
    }

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(marginX, y, pageWidth - marginX * 2, cardHeight, 2, 2, 'FD');

    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(110, 231, 183);
    doc.roundedRect(marginX + 4, y + 4, 33, 6, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(6, 95, 70);
    doc.text(chip, marginX + 6, y + 8.2);

    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8.5);
    doc.text(dateLabel, pageWidth - marginX - 4, y + 8.2, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(entry.title, marginX + 4, y + 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    doc.text(description, marginX + 4, y + 19);

    y += cardHeight + 5;
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Pagina ${page} de ${totalPages}`, pageWidth - marginX, footerY, { align: 'right' });
  }

  const output = doc.output('blob');
  const safePetName = pet.name.toLowerCase().replace(/\s+/g, '-');
  const fileName = `${fileNamePrefix}-${safePetName}.pdf`;
  return { fileName, blob: output };
}
