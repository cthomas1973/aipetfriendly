import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArrowRight, Bath, Bed, Briefcase, Building2, Calendar, Cat, ChevronDown, ClipboardList, Droplet, FileText, Heart, Home, Info, MessageCircle, NotebookPen, Phone, Pill, Shield, Smartphone, Soup, Users } from 'lucide-react';
import sharp from 'sharp';

export const INFOGRAPHIC_VERSION = 'visual-editorial-v2.1';
export const OFFICIAL_LOGO_SHA256 = '887a0dd685f76128b1e990dd044bc6b03e3c05c8f5eacf8fc079f05e6ceaec61';
export const BRAND = { green: '#2E7D32', mint: '#10b981', blue: '#0284c7', light: '#f7fbf7', sky: '#f0f9ff', warm: '#fbbf24', ink: '#1f2937' };
const ICONS = { home: Home, caregiver: Users, residence: Building2, food: Soup, water: Droplet, rest: Bed, carrier: Briefcase,
  litter: Bath,
  record: ClipboardList, routine: Calendar, medicine: Pill, contact: Phone, message: MessageCircle, phone: Smartphone,
  history: FileText, agenda: NotebookPen, safety: Shield, wellbeing: Heart, cat: Cat, info: Info };
const LAYOUTS = ['comparison', 'scene', 'record', 'conversation', 'timeline', 'relationship'];
const normalized = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function infographicContentHash(article) {
  return crypto.createHash('sha256').update(JSON.stringify({ title: article.title, content: article.content, sources: article.sources?.map((source) => ({ url: source.url, hash: source.text_sha256 })), plan: article.visual_plan, version: INFOGRAPHIC_VERSION })).digest('hex');
}

export function validateVisualPlan(article) {
  const plan = article.visual_plan;
  const issues = [];
  if (!plan || !['process', 'comparison', 'scene', 'relationships'].includes(plan.kind)) return { valid: false, issues: ['Falta un plan visual editorial'] };
  if (typeof plan.title !== 'string' || plan.title.length < 15 || plan.title.length > 72) issues.push('Titulo visual fuera de rango');
  if (!Array.isArray(plan.sections) || plan.sections.length < 3 || plan.sections.length > 5) issues.push('Se requieren de tres a cinco bloques visuales');
  let textLength = 0;
  const layouts = new Set();
  for (const section of plan.sections || []) {
    if (!LAYOUTS.includes(section.layout)) issues.push('Composicion visual desconocida');
    layouts.add(section.layout);
    if (!section.heading || section.heading.length > 42) issues.push('Encabezado visual demasiado extenso');
    if (!Array.isArray(section.items) || section.items.length < 1 || section.items.length > 5) issues.push('Cantidad de objetos visuales fuera de rango');
    for (const item of section.items || []) {
      textLength += (item.label || '').length;
      if (!ICONS[item.icon]) issues.push('Icono no disponible');
      if (typeof item.label !== 'string' || item.label.length < 3 || item.label.length > 28) issues.push('Etiqueta visual demasiado extensa');
      if (typeof item.anchor !== 'string' || item.anchor.length < 12 || !article.content.includes(item.anchor)) issues.push('Objeto visual sin respaldo literal en el articulo');
      const words = normalized(item.label).split(/\W+/).filter((word) => word.length > 3);
      if (!words.every((word) => normalized(item.anchor).includes(word))) issues.push('Etiqueta no respaldada por su fragmento');
    }
  }
  if (layouts.size < 2) issues.push('La composicion no debe ser una plantilla uniforme de tarjetas');
  if (textLength > 460) issues.push('Exceso de texto dentro del grafico');
  if (typeof plan.closing !== 'string' || plan.closing.length > 100 || !article.content.includes(plan.closing)) issues.push('Cierre visual sin respaldo literal');
  return { valid: issues.length === 0, issues: [...new Set(issues)], renderer: INFOGRAPHIC_VERSION };
}

export async function loadOfficialLogo() {
  let buffer;
  try {
    buffer = await readFile(new URL('../../public/logo-aipetfriendly.png', import.meta.url));
  } catch {
    const response = await fetch('https://www.aipetfriendly.ar/logo-aipetfriendly.png', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Logo oficial no disponible: no se genera una imitacion');
    buffer = Buffer.from(await response.arrayBuffer());
  }
  if (crypto.createHash('sha256').update(buffer).digest('hex') !== OFFICIAL_LOGO_SHA256) throw new Error('El recurso no coincide con el logo oficial verificado');
  return buffer;
}

function lines(text, maximum) {
  const result = [];
  for (const word of text.split(/\s+/)) {
    if (!result.length || `${result[result.length - 1]} ${word}`.length > maximum) result.push(word);
    else result[result.length - 1] += ` ${word}`;
  }
  return result;
}
function label(text, x, y, { size = 32, width = 25, color = BRAND.ink, centered = false } = {}) {
  const wrapped = lines(text, width);
  if (wrapped.length > 3) throw new Error('Texto no legible en el bloque visual');
  return wrapped.map((line, index) => `<text x="${x}" y="${y + index * (size + 6)}" font-size="${size}" fill="${color}" ${centered ? 'text-anchor="middle"' : ''}>${escape(line)}</text>`).join('');
}
function icon(name, x, y, size = 66, color = BRAND.green) {
  return `<g transform="translate(${x} ${y})">${renderToStaticMarkup(React.createElement(ICONS[name] || Info, { width: size, height: size, color, strokeWidth: 1.8 }))}</g>`;
}
function arrow(x, y, down = false) {
  return `<g transform="translate(${x} ${y})">${renderToStaticMarkup(React.createElement(down ? ChevronDown : ArrowRight, { width: 35, height: 35, color: BRAND.blue, strokeWidth: 2 }))}</g>`;
}
function drawSection(section, top, height, index) {
  const background = index % 2 ? BRAND.sky : BRAND.light;
  const heading = label(section.heading, 72, top + 39, { size: 33, color: BRAND.green, width: 48 });
  const items = section.items;
  if (section.layout === 'conversation') {
    return `<rect x="40" y="${top}" width="1000" height="${height - 10}" rx="8" fill="${background}"/>${heading}
      ${icon('phone', 100, top + 59, 90, BRAND.blue)}<path d="M225 ${top + 92} H970" stroke="#bae6fd" stroke-width="4"/>
      ${items.map((item, itemIndex) => { const x = 280 + itemIndex * (670 / items.length); return `${icon(item.icon, x, top + 55, 48)}${label(item.label, x, top + 132, { size: 28, width: 18 })}`; }).join('')}`;
  }
  const column = 900 / items.length;
  const objects = items.map((item, itemIndex) => {
    const center = 90 + column * (itemIndex + 0.5);
    const size = 48;
    const maxWord = Math.max(...item.label.split(/\s+/).map((word) => word.length));
    const font = Math.min(29, Math.floor((column - 12) / (maxWord * 0.62)));
    if (font < 25) throw new Error('Etiqueta demasiado larga para el espacio visual');
    const labelWidth = Math.floor((column - 12) / (font * 0.6));
    const lineCount = lines(item.label, labelWidth).length;
    if (132 + (lineCount - 1) * (font + 6) + Math.ceil(font * 0.22) > height - 10) throw new Error('La etiqueta se sale del bloque visual');
    const body = `${icon(item.icon, center - size / 2, top + 55, size, itemIndex % 2 ? BRAND.blue : BRAND.green)}
      ${label(item.label, center, top + 132, { size: font, width: labelWidth, centered: true })}`;
    return body + (section.layout === 'timeline' && itemIndex < items.length - 1 ? arrow(center + column / 2 - 18, top + 74) : '');
  }).join('');
  let context = '';
  if (section.layout === 'scene') context = `<path d="M76 ${top + 130} V${top + 55} L104 ${top + 33} M1004 ${top + 55} V${top + 130}" stroke="#a7d7b5" stroke-width="3" fill="none"/>${icon('cat', 925, top + 8, 39, BRAND.blue)}`;
  if (section.layout === 'record') context = `<path d="M60 ${top + 60} V${top + height - 22} H1020" stroke="#cbd5e1" stroke-width="3" fill="none"/>`;
  if (section.layout === 'relationship') context = `<path d="M150 ${top + 113} H930" stroke="#a7d7b5" stroke-width="4" stroke-dasharray="5 8"/>`;
  return `<rect x="40" y="${top}" width="1000" height="${height - 10}" rx="8" fill="${background}"/>${context}${heading}${objects}`;
}

export async function renderVisualInfographic(article, { logoLoader = loadOfficialLogo } = {}) {
  const validation = validateVisualPlan(article);
  if (!article.quality?.ready || !validation.valid) throw new Error(`Grafico pendiente: ${validation.issues.join('; ')}`);
  const logo = await logoLoader();
  if (crypto.createHash('sha256').update(logo).digest('hex') !== OFFICIAL_LOGO_SHA256) throw new Error('Logo no autorizado');
  const titleLines = lines(article.visual_plan.title, 33);
  if (titleLines.length > 3) throw new Error('Titulo visual demasiado extenso');
  const titleSize = titleLines.length > 2 ? 42 : 48;
  const sectionHeight = Math.floor(920 / article.visual_plan.sections.length);
  const sections = article.visual_plan.sections.map((section, index) => drawSection(section, 190 + index * sectionHeight, sectionHeight, index)
    + (article.visual_plan.kind === 'process' && index < article.visual_plan.sections.length - 1 ? arrow(8, 190 + (index + 1) * sectionHeight - 22, true) : '')).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="white"/>
    <path d="M0 176 H1080" stroke="${BRAND.warm}" stroke-width="7"/>
    <g font-family="Segoe UI, DejaVu Sans, sans-serif" font-weight="bold">${label(article.visual_plan.title, 52, 60, { size: titleSize, width: 33, color: BRAND.green })}
    ${sections}<rect x="0" y="1125" width="1080" height="225" fill="#F1E5D0"/>
    ${label(article.visual_plan.closing, 280, 1185, { size: 29, width: 43, color: BRAND.green })}
    ${label('Contenido informativo. Ante dudas de salud, consultá a tu veterinario.', 280, 1285, { size: 23, width: 58 })}
    </g></svg>`;
  const logoImage = await sharp(logo).resize({ width: 190, height: 174, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  return sharp(Buffer.from(svg)).composite([{ input: logoImage, left: 52, top: 1152 }]).png({ compressionLevel: 9, palette: false }).toBuffer();
}