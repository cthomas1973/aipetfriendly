import type { Pet } from '../types';

// Genera el cartel PDF de identificacion de una mascota, estilo "SE BUSCA":
// foto grande, banner rojo, nombre destacado, datos de extravio y señas
// particulares en dos columnas, y el QR de contacto en la esquina inferior derecha.

export async function imageToDataUrl(url: string): Promise<string | null> {
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

// Devuelve las dimensiones naturales de una imagen (para poder encajarla sin
// recortarla dentro de un recuadro de tamaño fijo).
async function getImageNaturalSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = dataUrl;
  });
}

function drawPawPrint(doc: any, cx: number, cy: number, scale: number, color: [number, number, number]) {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.ellipse(cx, cy + scale * 0.28, scale * 0.5, scale * 0.4, 'F');
  const toes: Array<[number, number]> = [[-0.5, -0.4], [-0.18, -0.62], [0.18, -0.62], [0.5, -0.4]];
  for (const [dx, dy] of toes) {
    doc.ellipse(cx + dx * scale, cy + dy * scale, scale * 0.2, scale * 0.26, 'F');
  }
}

// Icono estilo WhatsApp: circulo verde con un globo de chat blanco.
function drawWhatsAppIcon(doc: any, cx: number, cy: number, radius: number) {
  doc.setFillColor(37, 211, 102);
  doc.circle(cx, cy, radius, 'F');
  doc.setFillColor(255, 255, 255);
  const bubbleR = radius * 0.52;
  doc.roundedRect(cx - bubbleR, cy - bubbleR, bubbleR * 2, bubbleR * 1.75, bubbleR * 0.5, bubbleR * 0.5, 'F');
  doc.triangle(
    cx - bubbleR * 0.15, cy + bubbleR * 0.68,
    cx + bubbleR * 0.35, cy + bubbleR * 0.68,
    cx - bubbleR * 0.35, cy + bubbleR * 1.25,
    'F',
  );
  doc.setFillColor(37, 211, 102);
  doc.circle(cx - bubbleR * 0.42, cy - bubbleR * 0.05, bubbleR * 0.16, 'F');
  doc.circle(cx, cy - bubbleR * 0.05, bubbleR * 0.16, 'F');
  doc.circle(cx + bubbleR * 0.42, cy - bubbleR * 0.05, bubbleR * 0.16, 'F');
}

// Calcula el mayor tamaño de fuente (entre minSize y maxSize) que hace que el
// texto entre en maxWidth, usando la fuente/estilo ya seteados en doc.
function fitFontSize(doc: any, text: string, maxWidth: number, maxSize: number, minSize: number): number {
  let size = maxSize;
  while (size > minSize) {
    doc.setFontSize(size);
    if (doc.getTextWidth(text) <= maxWidth) break;
    size -= 1;
  }
  return size;
}

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function formatLostDateEs(isoDate?: string): string | undefined {
  if (!isoDate) return undefined;
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  const monthLabel = MESES_ES[Number(month) - 1] ?? month;
  return `${Number(day)} de ${monthLabel} de ${year}`;
}

export const SPECIES_LABEL: Record<Pet['species'], string> = {
  dog: 'Perro',
  cat: 'Gato',
  other: 'Otra especie',
};

export async function buildPetPosterPdf(params: {
  pet: Pet;
  publicUrl: string;
  logoUrl?: string;
  lostDate?: string;
  lostPlace?: string;
  contactPhone?: string;
  distinguishingMarks?: string;
  extraMessage?: string;
}): Promise<{ fileName: string; blob: Blob }> {
  const { pet, publicUrl, logoUrl, lostDate, lostPlace, contactPhone, distinguishingMarks, extraMessage } = params;

  const [{ jsPDF }, qrcodeModule] = await Promise.all([
    import('jspdf'),
    import('qrcode'),
  ]);
  const QRCode = (qrcodeModule as any).default ?? qrcodeModule;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 16;
  const contentWidth = pageWidth - marginX * 2;

  const logoData = logoUrl ? await imageToDataUrl(logoUrl) : null;
  const rawPetPhoto = pet.photoUrl ? await imageToDataUrl(pet.photoUrl) : null;
  const photoBoxHeight = 106;
  const petPhotoSize = rawPetPhoto ? await getImageNaturalSize(rawPetPhoto) : null;
  const qrDataUrl = await QRCode.toDataURL(publicUrl, { margin: 1, width: 480 });

  const RED: [number, number, number] = [217, 33, 33];

  // Marco rojo alrededor de todo el cartel.
  doc.setDrawColor(RED[0], RED[1], RED[2]);
  doc.setLineWidth(2.2);
  doc.rect(6, 6, pageWidth - 12, pageHeight - 12);

  let y = 15;

  // Encabezado chico con marca AiPetFriendly.
  if (logoData) {
    const logoFormat = logoData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(logoData, logoFormat, marginX, y - 6, 9, 9);
  }
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('AiPetFriendly', logoData ? marginX + 11 : marginX, y);
  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(
    'Generado gratis en AiPetFriendly.ar - Cuidado inteligente para tu mascota',
    marginX + contentWidth,
    y,
    { align: 'right' },
  );
  y += 9;

  // Foto grande: se muestra completa (sin recortar), centrada dentro del recuadro.
  if (rawPetPhoto && petPhotoSize) {
    const petFormat = rawPetPhoto.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.rect(marginX, y, contentWidth, photoBoxHeight, 'FD');
    const srcRatio = petPhotoSize.width / petPhotoSize.height;
    const boxRatio = contentWidth / photoBoxHeight;
    let drawW = contentWidth;
    let drawH = photoBoxHeight;
    if (srcRatio > boxRatio) {
      drawH = contentWidth / srcRatio;
    } else {
      drawW = photoBoxHeight * srcRatio;
    }
    const drawX = marginX + (contentWidth - drawW) / 2;
    const drawY = y + (photoBoxHeight - drawH) / 2;
    doc.addImage(rawPetPhoto, petFormat, drawX, drawY, drawW, drawH);
  } else {
    doc.setFillColor(241, 245, 249);
    doc.rect(marginX, y, contentWidth, photoBoxHeight, 'F');
    drawPawPrint(doc, pageWidth / 2, y + photoBoxHeight / 2 - 6, 16, [148, 163, 184]);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Sin foto', pageWidth / 2, y + photoBoxHeight / 2 + 14, { align: 'center' });
  }
  y += photoBoxHeight + 3;

  // Banner rojo "SE BUSCA".
  doc.setFillColor(RED[0], RED[1], RED[2]);
  doc.rect(marginX, y, contentWidth, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(27);
  doc.text('SE BUSCA', pageWidth / 2, y + 12.5, { align: 'center' });
  y += 18 + 4;

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text('AYUDAME A REGRESAR A CASA', pageWidth / 2, y, { align: 'center' });
  y += 13;

  // Nombre con patitas a los costados.
  const petNameUpper = pet.name.toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(34);
  const nameWidth = doc.getTextWidth(petNameUpper);
  doc.setTextColor(15, 23, 42);
  doc.text(petNameUpper, pageWidth / 2, y, { align: 'center' });
  drawPawPrint(doc, pageWidth / 2 - nameWidth / 2 - 10, y - 4, 8, RED);
  drawPawPrint(doc, pageWidth / 2 + nameWidth / 2 + 10, y - 4, 8, RED);
  y += 9;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`${SPECIES_LABEL[pet.species]} · ${pet.breed}`, pageWidth / 2, y, { align: 'center' });
  y += 8;

  doc.setDrawColor(226, 232, 240);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 7;

  // Dos columnas: fecha/lugar de extravio y señas particulares.
  const colGap = 10;
  const colWidth = (contentWidth - colGap) / 2;
  const colLeftX = marginX;
  const colRightX = marginX + colWidth + colGap;
  const colTop = y;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(RED[0], RED[1], RED[2]);
  doc.text('FECHA Y LUGAR DE EXTRAVIO', colLeftX, colTop);
  doc.text('SEÑAS PARTICULARES', colRightX, colTop);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(51, 65, 85);

  const lostDateLabel = formatLostDateEs(lostDate);
  const leftLines: string[] = [];
  if (lostDateLabel) leftLines.push(lostDateLabel);
  if (lostPlace) leftLines.push(...doc.splitTextToSize(lostPlace, colWidth));
  if (leftLines.length === 0) leftLines.push('No especificado');
  doc.text(leftLines, colLeftX, colTop + 6);

  const rightLines = distinguishingMarks
    ? doc.splitTextToSize(distinguishingMarks, colWidth)
    : ['No especificadas'];
  doc.text(rightLines, colRightX, colTop + 6);

  const colLinesCount = Math.max(leftLines.length, rightLines.length);
  y = colTop + 6 + colLinesCount * 5 + 7;

  // Mensaje adicional (opcional), a todo el ancho.
  if (extraMessage) {
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, y - 4, pageWidth - marginX, y - 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(RED[0], RED[1], RED[2]);
    doc.text('DATO ADICIONAL', marginX, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(51, 65, 85);
    const extraLines = doc.splitTextToSize(extraMessage, contentWidth);
    doc.text(extraLines, marginX, y + 6);
    y += 6 + extraLines.length * 5 + 5;
  }

  // Texto de aviso + fila final: banner de WhatsApp (izquierda) y QR con leyenda (derecha).
  const qrSize = 40;
  const qrColWidth = 48;
  const rowGap = 8;
  const bannerWidth = contentWidth - qrColWidth - rowGap;
  const qrColX = marginX + bannerWidth + rowGap;
  const qrBoxPadding = 3;

  // Columna izquierda: mensaje de aviso apilado arriba del banner de WhatsApp.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const headingLines: string[] = doc.splitTextToSize('Si lo encontraste o lo viste, por favor avisame', bannerWidth);
  const headingLineHeight = 5;
  const headingHeight = headingLines.length * headingLineHeight;
  const headingBandGap = 4;
  const bandHeight = 30;
  const leftColHeight = headingHeight + headingBandGap + bandHeight;

  // Columna derecha: QR con su leyenda (con un pequeño espacio entre el texto y la imagen).
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const qrCaptionLines: string[] = doc.splitTextToSize('Escaneá el QR y mandale un mensaje a la familia', qrColWidth);
  const qrCaptionHeight = qrCaptionLines.length * 4 + 2;
  const captionQrGap = 3;
  const rightColHeight = qrCaptionHeight + captionQrGap + qrSize;

  const rowHeight = Math.max(leftColHeight, rightColHeight);

  // La fila arranca siempre despues del contenido de arriba (para no pisarlo).
  // Si con eso no entra dentro del margen de seguridad respecto del marco, se
  // reduce el espacio previo a la fila (sin llegar a superponerla con el
  // contenido anterior) para que, dentro de lo posible, quede dentro del cartel.
  const gapBeforeRow = 6;
  const safeBottom = pageHeight - 6 - 6;
  const maxRowTop = safeBottom - rowHeight - qrBoxPadding;
  let rowTop = y + gapBeforeRow;
  if (rowTop > maxRowTop) {
    rowTop = Math.max(y, maxRowTop);
  }

  // Mensaje de aviso, arriba del banner.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(headingLines, marginX, rowTop + headingLineHeight - 1);

  // Banner de WhatsApp, debajo del mensaje.
  const bandTop = rowTop + headingHeight + headingBandGap;
  if (contactPhone) {
    const digitsOnly = contactPhone.replace(/[^\d+]/g, '').replace(/^\+/, '');
    doc.setDrawColor(37, 211, 102);
    doc.setLineWidth(0.6);
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(marginX, bandTop, bannerWidth, bandHeight, 4, 4, 'FD');

    const iconR = 11;
    const iconCx = marginX + 17;
    const iconCy = bandTop + bandHeight / 2;
    drawWhatsAppIcon(doc, iconCx, iconCy, iconR);

    const textX = iconCx + iconR + 8;
    const textMaxWidth = marginX + bannerWidth - 6 - textX;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    const phoneSize = fitFontSize(doc, contactPhone, textMaxWidth, 34, 16);
    doc.setFontSize(phoneSize);
    const phoneTextY = bandTop + bandHeight / 2 + phoneSize * 0.12;
    doc.textWithLink(contactPhone, textX, phoneTextY, { url: `https://wa.me/${digitsOnly}` });
  }

  // QR con leyenda, a la derecha.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(qrCaptionLines, qrColX + qrColWidth / 2, rowTop + 3.5, { align: 'center' });

  const qrX = qrColX + (qrColWidth - qrSize) / 2;
  const qrY = rowTop + qrCaptionHeight + captionQrGap;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.rect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6, 'FD');
  doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

  const output = doc.output('blob');
  const safePetName = pet.name.toLowerCase().replace(/\s+/g, '-');
  const fileName = `cartel-${safePetName}.pdf`;
  return { fileName, blob: output };
}

