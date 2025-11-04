// Shared utilities for UEX models

function limitStr(v, max) {
  if (v === undefined || v === null) return undefined;
  const s = String(v);
  return max && s.length > max ? s.slice(0, max) : s;
}

function toIntLike(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function toFloat(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toFlag01(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v).toLowerCase();
  if (s === 'true') return 1;
  if (s === 'false') return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n >= 1 ? 1 : 0;
}

function fromFlag(v) {
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n >= 1;
}

function toIntArray(v) {
  if (!Array.isArray(v)) return undefined;
  const out = [];
  for (const x of v) {
    const n = toIntLike(x);
    if (n === undefined) continue;
    out.push(n);
  }
  return out;
}

function toStrArray(v) {
  if (!Array.isArray(v)) return undefined;
  const out = [];
  for (const x of v) {
    if (x === undefined || x === null) continue;
    out.push(String(x));
  }
  return out;
}

function toJson(v) {
  if (v === undefined || v === null) return undefined;
  // Accept object/array or JSON string
  if (typeof v === 'object') return v;
  try { return JSON.parse(String(v)); } catch {
    return undefined;
  }
}

module.exports = { limitStr, toIntLike, toFloat, toFlag01, fromFlag, toIntArray, toStrArray, toJson };
