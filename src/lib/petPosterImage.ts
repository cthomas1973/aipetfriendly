import type { Pet } from '../types';
import { formatLostDateEs, imageToDataUrl, SPECIES_LABEL } from './petPosterPdf';

// Genera una imagen PNG (formato vertical 1080x1920, ideal para estado de
// WhatsApp/Instagram Stories) del mismo cartel "SE BUSCA" que buildPetPosterPdf,
// pensada para compartir directo desde el celular (Web Share API) en vez de
// imprimir. Usa Canvas 2D nativo, sin librerias adicionales.

const WIDTH = 1080;
const HEIGHT = 1920;
const MARGIN = 56;
const RED: [number, number, number] = [217, 33, 33];
const rgb = (c: [number, number, number]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
    img.src = dataUrl;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPawPrint(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, color: [number, number, number]) {
  ctx.fillStyle = rgb(color);
  ctx.beginPath();
  ctx.ellipse(cx, cy + scale * 0.28, scale * 0.5, scale * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  const toes: Array<[number, number]> = [[-0.5, -0.4], [-0.18, -0.62], [0.18, -0.62], [0.5, -0.4]];
  for (const [dx, dy] of toes) {
    ctx.beginPath();
    ctx.ellipse(cx + dx * scale, cy + dy * scale, scale * 0.2, scale * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWhatsAppIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
  ctx.fillStyle = 'rgb(37, 211, 102)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  const bubbleR = radius * 0.52;
  roundRectPath(ctx, cx - bubbleR, cy - bubbleR, bubbleR * 2, bubbleR * 1.75, bubbleR * 0.5);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - bubbleR * 0.15, cy + bubbleR * 0.68);
  ctx.lineTo(cx + bubbleR * 0.35, cy + bubbleR * 0.68);
  ctx.lineTo(cx - bubbleR * 0.35, cy + bubbleR * 1.25);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgb(37, 211, 102)';
  for (const dx of [-0.42, 0, 0.42]) {
    ctx.beginPath();
    ctx.arc(cx + dx * bubbleR, cy - bubbleR * 0.05, bubbleR * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
}

export async function buildPetPosterImage(params: {
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

  const qrcodeModule = await import('qrcode');
  const QRCode = (qrcodeModule as any).default ?? qrcodeModule;

  const [logoDataUrl, photoDataUrl, qrDataUrl] = await Promise.all([
    logoUrl ? imageToDataUrl(logoUrl) : Promise.resolve(null),
    pet.photoUrl ? imageToDataUrl(pet.photoUrl) : Promise.resolve(null),
    QRCode.toDataURL(publicUrl, { margin: 1, width: 480 }) as Promise<string>,
  ]);
  const [logoImg, photoImg, qrImg] = await Promise.all([
    logoDataUrl ? loadImageElement(logoDataUrl) : Promise.resolve(null),
    photoDataUrl ? loadImageElement(photoDataUrl) : Promise.resolve(null),
    loadImageElement(qrDataUrl),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo crear el lienzo para la imagen.');
  }
  const contentWidth = WIDTH - MARGIN * 2;

  // Fondo + marco rojo.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = rgb(RED);
  ctx.lineWidth = 10;
  ctx.strokeRect(30, 30, WIDTH - 60, HEIGHT - 60);

  let y = 78;

  // Encabezado con marca.
  if (logoImg) {
    ctx.drawImage(logoImg, MARGIN, y - 30, 46, 46);
  }
  ctx.fillStyle = 'rgb(100, 116, 139)';
  ctx.font = '700 30px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('AiPetFriendly', MARGIN + (logoImg ? 58 : 0), y);
  y += 44;

  // Foto grande (contain, sin recortar).
  const photoBoxHeight = 560;
  ctx.fillStyle = 'rgb(248, 250, 252)';
  ctx.strokeStyle = 'rgb(226, 232, 240)';
  ctx.lineWidth = 2;
  ctx.fillRect(MARGIN, y, contentWidth, photoBoxHeight);
  ctx.strokeRect(MARGIN, y, contentWidth, photoBoxHeight);
  if (photoImg) {
    const srcRatio = photoImg.naturalWidth / photoImg.naturalHeight;
    const boxRatio = contentWidth / photoBoxHeight;
    let drawW = contentWidth;
    let drawH = photoBoxHeight;
    if (srcRatio > boxRatio) {
      drawH = contentWidth / srcRatio;
    } else {
      drawW = photoBoxHeight * srcRatio;
    }
    const drawX = MARGIN + (contentWidth - drawW) / 2;
    const drawY = y + (photoBoxHeight - drawH) / 2;
    ctx.drawImage(photoImg, drawX, drawY, drawW, drawH);
  } else {
    drawPawPrint(ctx, WIDTH / 2, y + photoBoxHeight / 2 - 20, 60, [148, 163, 184]);
    ctx.fillStyle = 'rgb(148, 163, 184)';
    ctx.font = '400 34px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin foto', WIDTH / 2, y + photoBoxHeight / 2 + 60);
  }
  y += photoBoxHeight + 20;

  // Banner rojo "SE BUSCA".
  const bannerHeight = 100;
  ctx.fillStyle = rgb(RED);
  ctx.fillRect(MARGIN, y, contentWidth, bannerHeight);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 66px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SE BUSCA', WIDTH / 2, y + bannerHeight / 2 + 22);
  y += bannerHeight + 30;

  ctx.fillStyle = 'rgb(15, 23, 42)';
  ctx.font = '700 34px Arial, sans-serif';
  ctx.fillText('AYUDAME A REGRESAR A CASA', WIDTH / 2, y);
  y += 66;

  // Nombre con patitas a los costados.
  const petNameUpper = pet.name.toUpperCase();
  ctx.font = '700 84px Arial, sans-serif';
  const nameWidth = ctx.measureText(petNameUpper).width;
  ctx.fillStyle = 'rgb(15, 23, 42)';
  ctx.fillText(petNameUpper, WIDTH / 2, y);
  drawPawPrint(ctx, WIDTH / 2 - nameWidth / 2 - 46, y - 18, 28, RED);
  drawPawPrint(ctx, WIDTH / 2 + nameWidth / 2 + 46, y - 18, 28, RED);
  y += 54;

  ctx.font = '400 32px Arial, sans-serif';
  ctx.fillStyle = 'rgb(71, 85, 105)';
  ctx.fillText(`${SPECIES_LABEL[pet.species]} · ${pet.breed}`, WIDTH / 2, y);
  y += 34;

  ctx.strokeStyle = 'rgb(226, 232, 240)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, y);
  ctx.lineTo(WIDTH - MARGIN, y);
  ctx.stroke();
  y += 44;

  // Dos columnas: fecha/lugar de extravio y señas particulares.
  const colGap = 30;
  const colWidth = (contentWidth - colGap) / 2;
  const colLeftX = MARGIN;
  const colRightX = MARGIN + colWidth + colGap;
  const colTop = y;
  const lineHeight = 34;

  ctx.textAlign = 'left';
  ctx.font = '700 28px Arial, sans-serif';
  ctx.fillStyle = rgb(RED);
  ctx.fillText('FECHA Y LUGAR DE EXTRAVIO', colLeftX, colTop);
  ctx.fillText('SEÑAS PARTICULARES', colRightX, colTop);

  ctx.font = '400 28px Arial, sans-serif';
  ctx.fillStyle = 'rgb(51, 65, 85)';

  const lostDateLabel = formatLostDateEs(lostDate);
  const leftLines: string[] = [];
  if (lostDateLabel) leftLines.push(lostDateLabel);
  if (lostPlace) leftLines.push(...wrapText(ctx, lostPlace, colWidth));
  if (leftLines.length === 0) leftLines.push('No especificado');
  leftLines.forEach((line, i) => ctx.fillText(line, colLeftX, colTop + 40 + i * lineHeight));

  const rightLines = distinguishingMarks ? wrapText(ctx, distinguishingMarks, colWidth) : ['No especificadas'];
  rightLines.forEach((line, i) => ctx.fillText(line, colRightX, colTop + 40 + i * lineHeight));

  const colLinesCount = Math.max(leftLines.length, rightLines.length);
  y = colTop + 40 + colLinesCount * lineHeight + 26;

  // Mensaje adicional (opcional), a todo el ancho.
  if (extraMessage) {
    ctx.strokeStyle = 'rgb(226, 232, 240)';
    ctx.beginPath();
    ctx.moveTo(MARGIN, y - 20);
    ctx.lineTo(WIDTH - MARGIN, y - 20);
    ctx.stroke();
    ctx.font = '700 28px Arial, sans-serif';
    ctx.fillStyle = rgb(RED);
    ctx.fillText('DATO ADICIONAL', MARGIN, y);
    ctx.font = '400 28px Arial, sans-serif';
    ctx.fillStyle = 'rgb(51, 65, 85)';
    const extraLines = wrapText(ctx, extraMessage, contentWidth);
    extraLines.forEach((line, i) => ctx.fillText(line, MARGIN, y + 40 + i * lineHeight));
    y += 40 + extraLines.length * lineHeight + 24;
  }

  // Mensaje de aviso.
  ctx.font = '700 34px Arial, sans-serif';
  ctx.fillStyle = 'rgb(15, 23, 42)';
  const headingLines = wrapText(ctx, 'Si lo encontraste o lo viste, por favor avisame', contentWidth);
  headingLines.forEach((line, i) => ctx.fillText(line, MARGIN, y + i * 40));
  y += headingLines.length * 40 + 24;

  // Banner de WhatsApp con el telefono.
  if (contactPhone) {
    const bandHeight = 130;
    roundRectPath(ctx, MARGIN, y, contentWidth, bandHeight, 20);
    ctx.fillStyle = 'rgb(240, 253, 244)';
    ctx.fill();
    ctx.strokeStyle = 'rgb(37, 211, 102)';
    ctx.lineWidth = 3;
    ctx.stroke();

    const iconR = 40;
    const iconCx = MARGIN + 66;
    const iconCy = y + bandHeight / 2;
    drawWhatsAppIcon(ctx, iconCx, iconCy, iconR);

    ctx.font = '700 46px Arial, sans-serif';
    ctx.fillStyle = 'rgb(15, 23, 42)';
    ctx.textAlign = 'left';
    ctx.fillText(contactPhone, iconCx + iconR + 30, iconCy + 16);
    y += bandHeight + 30;
  }

  // QR con leyenda, centrado.
  ctx.font = '400 26px Arial, sans-serif';
  ctx.fillStyle = 'rgb(71, 85, 105)';
  ctx.textAlign = 'center';
  const qrCaptionLines = wrapText(ctx, 'Escaneá el QR y mandale un mensaje a la familia', contentWidth);
  qrCaptionLines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, y + i * 32));
  y += qrCaptionLines.length * 32 + 16;

  const qrSize = 220;
  const qrX = WIDTH / 2 - qrSize / 2;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgb(226, 232, 240)';
  ctx.lineWidth = 2;
  ctx.fillRect(qrX - 10, y - 10, qrSize + 20, qrSize + 20);
  ctx.strokeRect(qrX - 10, y - 10, qrSize + 20, qrSize + 20);
  ctx.drawImage(qrImg, qrX, y, qrSize, qrSize);
  y += qrSize + 30;

  // Footer.
  ctx.font = '400 22px Arial, sans-serif';
  ctx.fillStyle = 'rgb(148, 163, 184)';
  ctx.fillText('Generado gratis en AiPetFriendly.ar - Cuidado inteligente para tu mascota', WIDTH / 2, HEIGHT - 46);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new Error('No se pudo generar la imagen del cartel.');
  }
  const safePetName = pet.name.toLowerCase().replace(/\s+/g, '-');
  return { fileName: `cartel-${safePetName}.png`, blob };
}
