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

module.exports = { limitStr, toIntLike, toFloat, toFlag01, fromFlag };
