// Unified embeddings helper: supports local (no external API) and OpenAI providers.
// Usage: const { getEmbedding } = require('./common/embeddings');
// const emb = await getEmbedding({ text, openai });

let localPipeline = null;
let localModelName = null;
const CACHE_LIMIT = Number(process.env.EMBEDDINGS_CACHE_LIMIT || 500);
const cache = new Map(); // simple LRU: key -> Float32Array

function lruGet(key) {
  if (!cache.has(key)) return null;
  const val = cache.get(key);
  cache.delete(key);
  cache.set(key, val);
  return val;
}

function lruSet(key, val) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, val);
  while (cache.size > CACHE_LIMIT) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

function hashText(text) {
  // Lightweight hash to avoid bringing in crypto; collisions are acceptable for cache purposes
  const s = String(text || '');
  let h1 = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i);
    h1 = Math.imul(h1, 16777619) >>> 0;
  }
  return h1.toString(36);
}

async function getLocalEmbedding(text) {
  // Lazy-load @xenova/transformers to avoid cost if unused
  if (!localPipeline) {
    const { pipeline } = await import('@xenova/transformers');
    localModelName = process.env.EMBEDDINGS_MODEL || 'Xenova/all-MiniLM-L6-v2';
    localPipeline = await pipeline('feature-extraction', localModelName, {
      quantized: true,
      progress_callback: null,
    });
  }
  const input = String(text || '').slice(0, 8000);
  const out = await localPipeline(input, { pooling: 'mean', normalize: true });
  // out.data is a TypedArray
  const arr = Array.from(out.data);
  return arr;
}

async function getOpenAIEmbedding(openai, text) {
  const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
  const input = String(text || '').slice(0, 8000);
  const resp = await openai.embeddings.create({ model, input });
  const embedding = resp?.data?.[0]?.embedding;
  return Array.isArray(embedding) ? embedding : null;
}

async function getEmbedding({ text, openai }) {
  const provider = (process.env.EMBEDDINGS_PROVIDER || 'none').toLowerCase();
  const t = String(text || '');
  if (!t) return null;
  const key = provider + ':' + hashText(t);
  const cached = lruGet(key);
  if (cached) return Array.from(cached);

  let emb = null;
  if (provider === 'local') {
    emb = await getLocalEmbedding(t);
  } else if (provider === 'openai') {
    if (!openai) return null;
    emb = await getOpenAIEmbedding(openai, t);
  } else {
    // provider none/unknown: do nothing
    return null;
  }

  if (Array.isArray(emb) && emb.length) lruSet(key, Float32Array.from(emb));
  return emb;
}

module.exports = { getEmbedding };
