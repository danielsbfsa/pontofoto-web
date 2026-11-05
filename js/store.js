// Armazenamento no próprio aparelho (IndexedDB). Nada sai do celular.
import { DEFAULT_CONFIG } from './logic.js';

const DB_NAME = 'pontofoto';
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export function emptyData() {
  return {
    punches: [],      // {id, dateTime, type, source, note, employeeName, companyName, nsr, ocrBox, photoId}
    adjustments: [],  // {id, referenceDate, minutesDelta, reason}
    marks: {},        // date -> {date, type, note, doubled}
    settings: { ...DEFAULT_CONFIG, name: '', company: '', checkpoint: null, goal: null,
      uf: '', city: '', customHolidays: [], disabledHolidays: [], includeOptional: false, autoDouble: true,
      strategy: { even: true, sat: 0, sun: 0, alt: 0 },
      reminders: { punchTimes: ['07:30', '12:00', '13:00', '17:30'], punchLead: 10, holidayDaysBefore: 30, punch: true, holidays: true, monthly: true } },
    lastReadId: null,
  };
}

export async function loadData() {
  try {
    const d = await tx('kv', 'readonly', (s) => s.get('data'));
    if (d) return { ...emptyData(), ...d, settings: { ...emptyData().settings, ...d.settings } };
  } catch (e) {
    const ls = localStorage.getItem('pontofoto-data');
    if (ls) return { ...emptyData(), ...JSON.parse(ls) };
  }
  return emptyData();
}

let saveTimer = null;
export function saveData(data) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await tx('kv', 'readwrite', (s) => s.put(data, 'data')); }
    catch (e) { try { localStorage.setItem('pontofoto-data', JSON.stringify(data)); } catch (_) { /* sem espaço */ } }
  }, 150);
}

export async function putPhoto(blob) {
  const id = newId();
  await tx('photos', 'readwrite', (s) => s.put(blob, id));
  return id;
}
export async function getPhoto(id) {
  if (!id) return null;
  try { return await tx('photos', 'readonly', (s) => s.get(id)); } catch (e) { return null; }
}
export async function deletePhoto(id) {
  if (!id) return;
  try { await tx('photos', 'readwrite', (s) => s.delete(id)); } catch (e) { /* ignora */ }
}

export function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Pede ao navegador para não apagar os dados quando faltar espaço. */
export async function requestPersistence() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch (e) { /* ignora */ }
}

// ---------- backup (mesmo formato do app Android) ----------

export function toBackup(data) {
  return {
    version: 2,
    exportedAt: new Date().toISOString().slice(0, 19),
    punches: data.punches.map((p) => ({
      dateTime: p.dateTime, type: p.type, source: p.source, note: p.note || null,
      employeeName: p.employeeName || null, companyName: p.companyName || null, nsr: p.nsr || null, ocrBox: p.ocrBox || null,
    })),
    adjustments: data.adjustments.map((a) => ({ referenceDate: a.referenceDate, minutesDelta: a.minutesDelta, reason: a.reason || '' })),
    dayMarks: Object.values(data.marks).map((m) => ({ date: m.date, type: m.type || null, note: m.note || null, doubled: !!m.doubled, doubleMode: m.doubleMode || null })),
    checkpoint: data.settings.checkpoint,
    webSettings: { weekly: data.settings.weekly, tolerance: data.settings.tolerance, lunch: data.settings.lunch, goal: data.settings.goal, name: data.settings.name, company: data.settings.company,
      uf: data.settings.uf, city: data.settings.city, customHolidays: data.settings.customHolidays, disabledHolidays: data.settings.disabledHolidays,
      includeOptional: data.settings.includeOptional, autoDouble: data.settings.autoDouble, strategy: data.settings.strategy },
  };
}

/** Soma o backup ao que já existe (pontos repetidos são ignorados). Devolve quantos pontos entraram. */
export function mergeBackup(data, b) {
  const seen = new Set(data.punches.map((p) => `${p.dateTime}|${p.type}`));
  let added = 0;
  for (const p of b.punches || []) {
    const dateTime = String(p.dateTime).slice(0, 16);
    if (seen.has(`${dateTime}|${p.type}`)) continue;
    data.punches.push({ id: newId(), dateTime, type: p.type, source: p.source || 'MANUAL_PUNCH', note: p.note || null,
      employeeName: p.employeeName || null, companyName: p.companyName || null, nsr: p.nsr || null, ocrBox: p.ocrBox || null, photoId: null });
    seen.add(`${dateTime}|${p.type}`);
    added++;
  }
  for (const a of b.adjustments || []) data.adjustments.push({ id: newId(), referenceDate: a.referenceDate, minutesDelta: a.minutesDelta, reason: a.reason || '' });
  for (const m of b.dayMarks || []) data.marks[m.date] = { date: m.date, type: m.type || null, note: m.note || null, doubled: !!m.doubled, doubleMode: m.doubleMode || null };
  if (b.checkpoint) data.settings.checkpoint = b.checkpoint;
  if (b.webSettings) Object.assign(data.settings, Object.fromEntries(Object.entries(b.webSettings).filter(([, v]) => v !== undefined && v !== null)));
  return added;
}
