// api/cron/social-video-audio-captions.js
//
// Agrega guion-gancho (IA de texto) + voz en off (TTS) + subtitulos
// dinamicos en frases cortas a los videos "Ken Burns" del pipeline de blog.
// Usado por generate-blog-social-video.js como el estandar (con fallback
// automatico al video mudo si algo de este modulo falla).
//
// A diferencia del resto del pipeline (ffmpeg, sharp), esto SI tiene costo:
// llama a una API de texto-a-voz y a una de transcripcion (mismo proveedor
// que el resto de la IA del sitio, ver AI_API_KEY/AI_BASE_URL). Ver
// generate-blog-post.js para el patron de llamadas ya usado con ese mismo
// proveedor (texto e imagen).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { TITLE_FONT_PATH, TITLE_FONT_FAMILY, callAiTextModel } from './generate-blog-post.js';
import { pickKenBurnsEffect, buildKenBurnsBackgroundFilter } from './ken-burns-effects.js';

const execFileAsync = promisify(execFile);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }
  return value;
}

function stripMarkdownForPrompt(content) {
  return String(content || '')
    .replace(/[#*_>`]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Genera el guion de la voz en off como un "gancho" publicitario del
// articulo (NO un fragmento textual del contenido, que quedaba cortado a
// mitad de idea): presenta el problema en una frase, insinua la duda o
// solucion sin resolverla, e invita a leer la nota completa. Reutiliza el
// mismo modelo de texto que redacta los articulos.
export async function generateReelHookScript({ title, content }) {
  const contentExcerpt = stripMarkdownForPrompt(content).slice(0, 600);

  const prompt = `Sos el redactor de contenido para redes sociales de AiPetFriendly, una app para duenios de mascotas.
Escribi el guion de la voz en off de un reel corto que promociona esta nota del blog (el reel invita a leer la nota, no la resume entera):

Titulo: "${title}"
Contenido (referencia, no leer textual): "${contentExcerpt}"

Reglas del guion:
- Maximo 35 palabras, en 2 o 3 frases cortas.
- Frase 1: presenta el problema o tema central, directo y que enganche.
- Frase 2: plantea la duda o insinua la solucion SIN resolverla (genera intriga).
- Frase final: invita explicitamente a leer la nota completa (ej: "te contamos como en la nota").
- Espanol neutro, tono calido y cercano, sin tecnicismos.
- Listo para leerse en voz alta: sin markdown, sin comillas, sin emojis, sin hashtags.

Devolve SOLO el texto del guion, nada mas.`;

  const raw = await callAiTextModel(prompt);
  return raw.trim().replace(/^["'\u201c]+|["'\u201d]+$/g, '');
}

// Genera la voz en off (mp3) a partir de un texto corto (pensado para el
// resumen/tip del articulo, no el contenido completo). Costo por caracter,
// ver precios del proveedor. "onyx" quedo elegida como voz estandar tras
// escuchar las muestras; se puede pisar por env (AI_TTS_VOICE) sin tocar
// codigo si se quiere probar otra mas adelante.
export async function generateVoiceOverAudio(text, { voice = process.env.AI_TTS_VOICE || 'onyx' } = {}) {
  const apiKey = requireEnv('AI_API_KEY');
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.AI_TTS_MODEL || 'tts-1';

  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, voice, input: text, response_format: 'mp3' }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Fallo la generacion de voz (status ${response.status}): ${detail.slice(0, 300)}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

// Transcribe el audio generado con timestamps por palabra, para poder armar
// subtitulos sincronizados. Costo por minuto de audio, ver precios del
// proveedor.
export async function transcribeAudioWithWordTimestamps(audioBuffer, { language = 'es' } = {}) {
  const apiKey = requireEnv('AI_API_KEY');
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.AI_TRANSCRIBE_MODEL || 'whisper-1';

  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'audio.mp3');
  form.append('model', model);
  form.append('language', language);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Fallo la transcripcion (status ${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  return Array.isArray(data.words) ? data.words : [];
}

function escapeAssText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/\n/g, ' ')
    .trim();
}

function formatAssTimestamp(seconds) {
  const totalCentiseconds = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(totalCentiseconds / 360000);
  const minutes = Math.floor((totalCentiseconds % 360000) / 6000);
  const secs = Math.floor((totalCentiseconds % 6000) / 100);
  const centis = totalCentiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

// Agrupa palabras sueltas (con sus timestamps) en frases cortas, para que
// cada subtitulo quede mas tiempo en pantalla y se alcance a leer. Corta un
// grupo al llegar a maxWords o si ya paso minSeconds y la palabra siguiente
// empieza con una pausa notoria (fin de frase natural).
function groupWordsIntoChunks(words, { maxWords = 5, minSeconds = 1.4 } = {}) {
  const chunks = [];
  let current = [];

  for (const word of words) {
    current.push(word);
    const start = current[0].start;
    const end = word.end;
    const reachedMax = current.length >= maxWords;
    const reachedMinDuration = end - start >= minSeconds;
    if (reachedMax || (reachedMinDuration && current.length >= 2)) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length) {
    chunks.push(current);
  }
  return chunks;
}

// Arma un archivo .ass con frases cortas (2-4 palabras) a la vez, estilo
// "influencer" (mayusculas, negrita, amarillo con borde negro), sincronizadas
// con los timestamps de la transcripcion. Se muestra en la mitad inferior
// del cuadro, arriba del logo.
function buildKaraokeAssSubtitles(words, { size = 1080 } = {}) {
  const fontSize = Math.round(size * 0.075);
  const marginV = Math.round(size * 0.16);

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${size}`,
    `PlayResY: ${size}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Relleno amarillo (&H0000FFFF), borde negro grueso, negrita, centrado
    // abajo (Alignment 2).
    `Style: Word,${TITLE_FONT_FAMILY},${fontSize},&H0000FFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,7,0,2,60,60,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const chunks = groupWordsIntoChunks(words);

  const lines = chunks
    .map((chunk) => {
      const text = escapeAssText(chunk.map((w) => String(w.word || '').toUpperCase()).join(' '));
      if (!text) {
        return null;
      }
      const chunkStart = chunk[0].start;
      const chunkEnd = Math.max(chunk[chunk.length - 1].end, chunkStart + 0.4);
      const start = formatAssTimestamp(chunkStart);
      const end = formatAssTimestamp(chunkEnd);
      return `Dialogue: 0,${start},${end},Word,,0,0,0,,${text}`;
    })
    .filter(Boolean);

  return `${header}\n${lines.join('\n')}\n`;
}

// El filtro `subtitles` de ffmpeg usa su propia mini-sintaxis donde ":" separa
// opciones, asi que hay que escapar los ":" del path (ej. "C:/...") aunque no
// se pase por una shell.
function escapeFfmpegFilterPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
}

// Version completa del video Ken Burns: fondo animado + banner/logo fijos
// (igual que generateKenBurnsVideoWithBranding) + pista de audio (voz en
// off) + subtitulos palabra-por-palabra quemados, sincronizados con la
// transcripcion. La duracion del video se ajusta a la duracion del audio (no
// a un valor fijo), para que no sobre ni falte video.
export async function generateReelVideoWithAudioAndCaptions(rawImageBuffer, {
  bannerLayer,
  logoLayer,
  audioBuffer,
  words,
  fps = 25,
  size = 1080,
  timeoutMs = 55000,
  seed = '',
  tailSeconds = 0.6,
} = {}) {
  if (!ffmpegPath) {
    throw new Error('No se encontro el binario de ffmpeg (ffmpeg-static).');
  }

  const tmpDir = await mkdtemp(path.join(tmpdir(), 'apf-social-reel-'));
  const outputPath = path.join(tmpDir, 'output.mp4');

  try {
    const bgPath = path.join(tmpDir, 'bg.png');
    await writeFile(bgPath, rawImageBuffer);
    const audioPath = path.join(tmpDir, 'audio.mp3');
    await writeFile(audioPath, audioBuffer);
    const assPath = path.join(tmpDir, 'captions.ass');
    await writeFile(assPath, buildKaraokeAssSubtitles(words, { size }));

    const lastWordEnd = words.length ? words[words.length - 1].end : 0;
    const durationSeconds = Math.max(3, Math.ceil((lastWordEnd + tailSeconds) * 2) / 2);
    const totalFrames = Math.round(durationSeconds * fps);

    const effect = pickKenBurnsEffect(seed, totalFrames);
    const bgFilter = buildKenBurnsBackgroundFilter(effect, { size, totalFrames, fps });

    const inputArgs = ['-loop', '1', '-framerate', String(fps), '-i', bgPath];
    const filterSteps = [`[0:v]${bgFilter}[bg]`];
    let lastLabel = 'bg';
    let nextInputIndex = 1;

    if (bannerLayer) {
      const bannerPath = path.join(tmpDir, 'banner.png');
      await writeFile(bannerPath, bannerLayer.buffer);
      inputArgs.push('-loop', '1', '-framerate', String(fps), '-i', bannerPath);
      const label = `b${nextInputIndex}`;
      filterSteps.push(`[${lastLabel}][${nextInputIndex}:v]overlay=${bannerLayer.left}:${bannerLayer.top}[${label}]`);
      lastLabel = label;
      nextInputIndex += 1;
    }

    if (logoLayer) {
      const logoPath = path.join(tmpDir, 'logo.png');
      await writeFile(logoPath, logoLayer.buffer);
      inputArgs.push('-loop', '1', '-framerate', String(fps), '-i', logoPath);
      const label = `l${nextInputIndex}`;
      filterSteps.push(`[${lastLabel}][${nextInputIndex}:v]overlay=${logoLayer.left}:${logoLayer.top}[${label}]`);
      lastLabel = label;
      nextInputIndex += 1;
    }

    const escapedAss = escapeFfmpegFilterPath(assPath);
    const escapedFontsDir = escapeFfmpegFilterPath(path.dirname(TITLE_FONT_PATH));
    filterSteps.push(`[${lastLabel}]subtitles=filename='${escapedAss}':fontsdir='${escapedFontsDir}'[subbed]`);
    filterSteps.push('[subbed]format=yuv420p[outv]');

    const audioInputIndex = nextInputIndex;
    inputArgs.push('-i', audioPath);
    // El TTS suele salir bajo de volumen (~-25dB medido); loudnorm lo sube a
    // un nivel parejo y comodo para escuchar sin distorsionar.
    filterSteps.push(`[${audioInputIndex}:a]loudnorm=I=-16:TP=-1.5:LRA=11[outa]`);

    await execFileAsync(ffmpegPath, [
      '-y',
      ...inputArgs,
      '-filter_complex', filterSteps.join(';'),
      '-map', '[outv]',
      '-map', '[outa]',
      '-t', String(durationSeconds),
      '-r', String(fps),
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      '-preset', 'fast',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath,
    ], { timeout: timeoutMs });

    return { buffer: await readFile(outputPath), effectName: effect.name, durationSeconds };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
