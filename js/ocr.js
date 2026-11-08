// Leitura das fotos (Tesseract.js) e dos PDFs (pdf.js), tudo no próprio aparelho.
// As bibliotecas ficam em ./vendor (o GitHub as inclui na publicação).
import { parseReceipt, vote, parseEspelho, personalWords, isSensitiveLine, isBareLabel, guidedRead, isTrained, timesIn, datesIn, textArea, toAbsolute } from './logic.js';

const VENDOR = new URL('../vendor/', import.meta.url).href;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Falha ao carregar ' + src));
    document.head.appendChild(s);
  });
}

let workerPromise = null;
async function getWorker(onStatus) {
  if (window.OCR_STUB) return window.OCR_STUB; // usado nos testes automáticos
  if (!workerPromise) {
    workerPromise = (async () => {
      onStatus?.('Preparando o leitor (só na primeira vez)...');
      await loadScript(VENDOR + 'tesseract/tesseract.min.js');
      return window.Tesseract.createWorker('por', 1, {
        workerPath: VENDOR + 'tesseract/worker.min.js',
        corePath: VENDOR + 'tesseract-core/',
        langPath: VENDOR + 'lang',
        gzip: true,
        workerBlobURL: false,
      });
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

/** Abre a imagem já "em pé" (o navegador aplica a rotação da câmera) com lado maior <= maxSide. */
/** Comprovante em PDF (REP-P manda PDF): desenha a 1ª página. */
async function pdfToCanvas(file, width = 1800) {
  await loadScript(VENDOR + 'pdfjs/pdf.min.js');
  const pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = VENDOR + 'pdfjs/pdf.worker.min.js';
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await doc.getPage(1);
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: width / vp1.width });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.min(6000, Math.round(vp.height));
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return c;
}

export async function fileToCanvas(file, maxSide = 2400) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) return pdfToCanvas(file);
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url;
    });
    const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

export function canvasToBlob(canvas, quality = 0.85) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/** Recorte em tons de cinza com mais contraste, redimensionado para [targetWidth]. */
function enhance(src, crop, targetWidth) {
  const area = crop || { x: 0, y: 0, w: src.width, h: src.height };
  const scale = targetWidth / Math.max(1, area.w);
  const c = document.createElement('canvas');
  c.width = targetWidth; c.height = Math.max(1, Math.round(area.h * scale));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, area.x, area.y, area.w, area.h, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data, k = 1.7, t = (-0.5 * k + 0.5) * 255;
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.max(0, Math.min(255, (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * k + t));
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, area, scale };
}

/** Preto e branco (limiar de Otsu). */
function binarize(gray) {
  const c = document.createElement('canvas');
  c.width = gray.width; c.height = gray.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(gray, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data, hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
  const total = d.length / 4;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, th = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; th = i; }
  }
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = d[i] > th ? 255 : 0;
  ctx.putImageData(img, 0, 0);
  return c;
}

const linesOf = (data) => (data.lines || []).filter((l) => l.bbox && l.text.trim());

/** Linhas ordenadas por posição (ignora a ordem dos blocos). */
function geometricText(data) {
  const lines = linesOf(data);
  if (!lines.length) return data.text || '';
  const hs = lines.map((l) => l.bbox.y1 - l.bbox.y0).sort((a, b) => a - b);
  const band = Math.max(1, hs[Math.floor(hs.length / 2)] * 0.6);
  return [...lines].sort((a, b) => Math.floor((a.bbox.y0 + a.bbox.y1) / 2 / band) - Math.floor((b.bbox.y0 + b.bbox.y1) / 2 / band) || a.bbox.x0 - b.bbox.x0)
    .map((l) => l.text.trim()).join('\n');
}

function textBounds(data, w, h) {
  const words = (data.words || []).filter((x) => x.bbox && x.confidence > 30 && x.text.trim().length > 1);
  if (!words.length) return null;
  let l = Math.min(...words.map((x) => x.bbox.x0)), t = Math.min(...words.map((x) => x.bbox.y0));
  let r = Math.max(...words.map((x) => x.bbox.x1)), b = Math.max(...words.map((x) => x.bbox.y1));
  const mx = (r - l) * 0.06, my = (b - t) * 0.06;
  l = Math.max(0, l - mx); t = Math.max(0, t - my); r = Math.min(w, r + mx); b = Math.min(h, b + my);
  return r - l > 20 && b - t > 20 ? { x: l, y: t, w: r - l, h: b - t } : null;
}

function findTimeBox(data, time, toOrig) {
  const hh = `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`;
  const lines = linesOf(data);
  const hit = lines.find((l) => {
    const t = l.text.toUpperCase().replace(/O/g, '0').replace(/\s/g, '');
    return t.includes(hh) || (t.replace(/[:.]/g, '').includes(hh.replace(':', '')) && t.includes('RA'));
  });
  if (!hit) return null;
  const hb = hit.bbox, hH = hb.y1 - hb.y0;
  const above = lines.filter((l) => l !== hit && l.bbox.y1 <= (hb.y0 + hb.y1) / 2 && hb.y0 - l.bbox.y1 < hH * 1.5)
    .sort((a, b) => b.bbox.y1 - a.bbox.y1)[0];
  let x0 = Math.min(hb.x0, above ? above.bbox.x0 : hb.x0), x1 = Math.max(hb.x1, above ? above.bbox.x1 : hb.x1);
  let y0 = above ? above.bbox.y0 : hb.y0, y1 = hb.y1;
  const py = (y1 - y0) * 0.35, px = (x1 - x0) * 0.04;
  const r = toOrig({ x0: x0 - px, y0: y0 - py, x1: x1 + px, y1: y1 + py });
  return [r.x0, r.y0, r.x1, r.y1].map((v) => Math.max(0, Math.min(1, v)));
}

/** Trechos com dados pessoais (frações da imagem). Numa linha com a data/hora, tarja só as palavras pessoais. */
function sensitiveBoxes(pass, words, time) {
  const hh = time !== null && time !== undefined ? `${String(Math.floor(time / 60)).padStart(2, '0')}${String(time % 60).padStart(2, '0')}` : null;
  const out = [];
  let prevLabel = false;
  for (const line of linesOf(pass.data)) {
    const text = line.text.trim();
    const sensitive = prevLabel || isSensitiveLine(text, words);
    prevLabel = isBareLabel(text);
    if (!sensitive) continue;
    const compact = text.toUpperCase().replace(/O/g, '0').replace(/[^0-9]/g, '');
    const keepsPunch = (hh && compact.includes(hh)) || /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(text);
    if (!keepsPunch) { out.push(pass.toOrig(line.bbox)); continue; }
    let hideNext = 0;
    for (const w of line.words || []) {
      const t = w.text || '';
      if (/\d{1,2}[:/.]\d{2}/.test(t) || /^(DATA|HORA)/i.test(t)) { hideNext = 0; continue; }
      if (isSensitiveLine(t, words)) { out.push(pass.toOrig(w.bbox)); hideNext = 4; continue; }
      if (hideNext > 0) { out.push(pass.toOrig(w.bbox)); hideNext--; }
    }
  }
  return out;
}

function redact(canvas, boxes) {
  if (!boxes.length) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#26262e';
  for (const b of boxes) {
    const h = (b.y1 - b.y0) * H;
    ctx.fillRect(b.x0 * W - h * 0.3, b.y0 * H - h * 0.25, (b.x1 - b.x0) * W + h * 0.6, h * 1.5);
  }
}

/**
 * Lê o comprovante em 3 versões (foto, recorte realçado, preto e branco) e vota no horário,
 * dando mais peso ao que veio do rótulo "HORA:".
 */
export async function readReceipt(file, onStatus, profile = null) {
  const canvas = await fileToCanvas(file, 2400);
  const worker = await getWorker(onStatus);
  const W = canvas.width, H = canvas.height;
  const passes = [];

  onStatus?.('Lendo o comprovante...');
  const full = (await worker.recognize(canvas)).data;
  passes.push({ data: full, weight: 1.0, toOrig: (b) => ({ x0: b.x0 / W, y0: b.y0 / H, x1: b.x1 / W, y1: b.y1 / H }) });

  const crop = textBounds(full, W, H);
  const { canvas: enh, area, scale } = enhance(canvas, crop, 1800);
  const back = (b) => ({ x0: (area.x + b.x0 / scale) / W, y0: (area.y + b.y0 / scale) / H, x1: (area.x + b.x1 / scale) / W, y1: (area.y + b.y1 / scale) / H });
  onStatus?.('Conferindo os minutos...');
  passes.push({ data: (await worker.recognize(enh)).data, weight: 1.3, toOrig: back });
  passes.push({ data: (await worker.recognize(binarize(enh))).data, weight: 1.1, toOrig: back });

  const cands = passes.flatMap((p) => [...new Set([p.data.text || '', geometricText(p.data)])].map((t) => ({ r: parseReceipt(t), w: p.weight })));
  const tv = cands.map((c) => ({ value: c.r.time ?? null, weight: c.w * (c.r.timeLabeled ? 2 : 1) }));
  const dv = cands.map((c) => ({ value: c.r.date ?? null, weight: c.w * (c.r.dateLabeled ? 2 : 1) }));
  const plainTime = vote(tv);
  // Assistente: procura primeiro onde a hora e a data costumam estar no comprovante deste usuário.
  const best = [...passes].sort((a, b) => b.weight - a.weight)[0];
  const lines = linesOf(best.data).map((l) => { const r = best.toOrig(l.bbox); return { text: l.text.trim(), box: { l: r.x0, t: r.y0, r: r.x1, b: r.y1 } }; });
  let g = profile && (profile.time || profile.date) ? guidedRead(profile, lines) : null;
  if (profile?.time?.manual && g && g.time === null) {
    const area = textArea(lines);
    if (area) {
      const abs = toAbsolute(profile.time.box, area);
      const r = await readAreaCanvas(canvas, abs, worker);
      if (r.time !== null) g = { ...g, time: r.time, timeScore: 1.5, date: g.date ?? r.date, dateScore: g.date ? g.dateScore : (r.date ? 1 : 0) };
    }
  }
  const k = isTrained(profile) ? 1.5 : 0.6;
  if (g?.time !== null && g?.time !== undefined) tv.push({ value: g.time, weight: 3 * g.timeScore * k });
  if (g?.date) dv.push({ value: g.date, weight: 3 * g.dateScore * k });
  const time = vote(tv);
  const date = vote(dv);
  const uncertain = isTrained(profile) && g?.time != null && plainTime !== null && g.time !== plainTime;
  const receipt = {
    time, date,
    nsr: vote(cands.map((c) => ({ value: c.r.nsr ?? null, weight: c.w }))),
    employeeName: vote(cands.map((c) => ({ value: c.r.employeeName ?? null, weight: c.w }))),
    company: vote(cands.map((c) => ({ value: c.r.company ?? null, weight: c.w }))),
  };
  let box = null;
  if (time !== null) {
    for (const p of [...passes].sort((a, b) => b.weight - a.weight)) { box = findTimeBox(p.data, time, p.toOrig); if (box) break; }
  }
  // Privacidade: a foto só é guardada com CPF, nome, empresa e endereço cobertos por tarja.
  redact(canvas, passes.flatMap((p) => sensitiveBoxes(p, personalWords(receipt), time)));
  const photoBlob = await canvasToBlob(canvas);
  return { receipt, box: box ? box.map((v) => v.toFixed(4)).join(',') : null, photoBlob, lines, uncertain };
}

/** Lê só um pedaço do canvas ([b] em frações), ampliado. */
async function readAreaCanvas(canvas, b, worker) {
  const W = canvas.width, H = canvas.height;
  const padY = (b.b - b.t) * H * 0.35, padX = (b.r - b.l) * W * 0.08;
  const x = Math.max(0, b.l * W - padX), y = Math.max(0, b.t * H - padY);
  const w = Math.min(W - x, (b.r - b.l) * W + 2 * padX), h = Math.min(H - y, (b.b - b.t) * H + 2 * padY);
  if (w < 8 || h < 8) return { time: null, date: null };
  const { canvas: enh } = enhance(canvas, { x, y, w, h }, 1400);
  const texts = [(await worker.recognize(enh)).data.text || '', (await worker.recognize(binarize(enh))).data.text || ''];
  const pick = (arr) => { const c = new Map(); arr.forEach((v) => c.set(v, (c.get(v) || 0) + 1)); let bv = null, bn = 0; for (const [v, n] of c) if (n > bn) { bv = v; bn = n; } return bv; };
  return { time: pick(texts.flatMap((t) => timesIn(t.replace(/\n/g, ' ')))), date: pick(texts.flatMap((t) => datesIn(t.replace(/\n/g, ' ')))) };
}

/** Texto de um print (ex.: resumo de ganhos de app de corrida). */
export async function readText(file, onStatus) {
  const canvas = await fileToCanvas(file, 2000);
  const worker = await getWorker(onStatus);
  onStatus?.('Lendo o print...');
  return (await worker.recognize(canvas)).data.text || '';
}

/** Marcação manual: lê os pedaços que o usuário marcou na foto guardada (já tarjada). */
export async function readMarked(photoBlob, timeBox, dateBox, onStatus) {
  const canvas = await fileToCanvas(photoBlob, 2400);
  const worker = await getWorker(onStatus);
  onStatus?.('Lendo o pedaço marcado...');
  const t = timeBox ? await readAreaCanvas(canvas, timeBox, worker) : { time: null };
  const d = dateBox ? await readAreaCanvas(canvas, dateBox, worker) : { date: null };
  return { time: t.time, date: d.date };
}

// ---------------- espelho de ponto ----------------

async function pdfWords(file, onStatus) {
  await loadScript(VENDOR + 'pdfjs/pdf.min.js');
  const pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = VENDOR + 'pdfjs/pdf.worker.min.js';
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let n = 1; n <= Math.min(doc.numPages, 6); n++) {
    onStatus?.(`Lendo a página ${n} do PDF...`);
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const words = [];
    for (const it of content.items) {
      const str = it.str || '';
      if (!str.trim()) continue;
      const [a, , , d, e, f] = it.transform;
      const h = Math.abs(d) || Math.abs(a) || 8;
      const charW = (it.width || str.length * h * 0.5) / str.length;
      const top = vp.height - f - h;
      const re = /\S+/g; let m;
      while ((m = re.exec(str))) {
        words.push({ text: m[0], left: e + m.index * charW, right: e + (m.index + m[0].length) * charW, top, bottom: top + h });
      }
    }
    if (words.length > 30) { pages.push(words); continue; }
    // PDF escaneado (sem texto): desenha a página e lê com OCR
    const scale = 2600 / vp.width;
    const c = document.createElement('canvas');
    const v2 = page.getViewport({ scale });
    c.width = v2.width; c.height = v2.height;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: v2 }).promise;
    pages.push(await ocrWords(c, onStatus));
  }
  return pages;
}

async function ocrWords(canvas, onStatus) {
  const worker = await getWorker(onStatus);
  onStatus?.('Lendo a tabela...');
  const data = (await worker.recognize(canvas)).data;
  return (data.words || []).filter((w) => w.bbox).map((w) => ({ text: w.text, left: w.bbox.x0, top: w.bbox.y0, right: w.bbox.x1, bottom: w.bbox.y1 }));
}

/** Lê fotos e/ou PDF do espelho e devolve o espelho interpretado. */
export async function readEspelho(files, onStatus) {
  const pages = [];
  for (const f of files) {
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) pages.push(...await pdfWords(f, onStatus));
    else pages.push(await ocrWords(await fileToCanvas(f, 3200), onStatus));
  }
  return parseEspelho(pages);
}
