const { listKnowledge, createKnowledge, updateKnowledge, deleteKnowledge } = require('../api/knowledgeApi');
const { getAllHitLogs } = require('../api/hitTrackerApi');

function utcDayKey(d = new Date()) {
  const dt = new Date(d);
  dt.setUTCHours(0,0,0,0);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth()+1).padStart(2,'0');
  const day = String(dt.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function snowflakeToDate(id) {
  try {
    const EPOCH = 1420070400000n; // Discord epoch
    const bn = BigInt(String(id));
    const ms = Number((bn >> 22n) + EPOCH);
    return new Date(ms);
  } catch { return null; }
}

function getHitDate(hit) {
  if (hit?.created_at) return new Date(hit.created_at);
  if (hit?.createdAt) return new Date(hit.createdAt);
  if (hit?.thread_id) {
    const d = snowflakeToDate(hit.thread_id);
    if (d) return d;
  }
  return new Date();
}

function fmtCurrency(v) {
  if (v == null || isNaN(Number(v))) return 'n/a';
  const n = Number(v);
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(2)}M aUEC`;
  if (n >= 1_000) return `${(n/1_000).toFixed(1)}k aUEC`;
  return `${n.toFixed(0)} aUEC`;
}

function topCargoLines(cargo) {
  try {
    const items = Array.isArray(cargo) ? cargo : (typeof cargo === 'object' && cargo ? Object.entries(cargo).map(([k,v])=>({name:k, qty:v})) : []);
    const arr = items
      .map(it => ({ name: it.name || it.item || it[0] || 'item', qty: Number(it.qty || it.quantity || it[1] || 0) }))
      .filter(it => it.name)
      .sort((a,b)=>b.qty-a.qty)
      .slice(0,6)
      .map(it => `- ${it.name}: ${it.qty}`);
    return arr;
  } catch { return []; }
}

async function llmSummarizeHit(openai, model, hit, dateKey) {
  const system = 'You summarize piracy hits into concise, factual bullet points: target, method, location/air-ground, team, loot (value/SCU), notable moments, and outcome. Avoid fluff.';
  const prompt = `Hit: ${hit.title || 'Untitled'}\nDate(UTC): ${dateKey}\nType: ${hit.type_of_piracy}\nAir/Ground: ${hit.air_or_ground}\nOwner: ${hit.username || hit.user_id}\nAssists: ${(hit.assists_usernames || hit.assists || []).join(', ') || 'none'}\nTotal Value: ${fmtCurrency(hit.total_value)} (cut ${fmtCurrency(hit.total_cut_value)}, ${hit.total_cut_scu || 0} SCU)\nCargo(top):\n${topCargoLines(hit.cargo).join('\n') || '- none'}\nVictims: ${(hit.victims || []).join(', ') || 'unknown'}\nStory: ${hit.story || ''}\n\nSummarize in 5-8 bullets.`;
  try {
    if (openai?.responses?.create) {
      const res = await openai.responses.create({ model, input: [
        { role: 'system', content: [{ type: 'text', text: system }] },
        { role: 'user', content: [{ type: 'text', text: prompt }] },
      ]});
      return res.output_text?.trim?.() || '';
    }
    if (openai?.chat?.completions?.create) {
      const res = await openai.chat.completions.create({ model, temperature: 0.3, messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ]});
      return res.choices?.[0]?.message?.content?.trim() || '';
    }
    return '';
  } catch (e) {
    console.error('llmSummarizeHit error:', e?.response?.data || e?.message || e);
    return '';
  }
}

async function upsertHitKnowledge(openai, hit) {
  const date = getHitDate(hit);
  const dateKey = utcDayKey(date);
  const url = `hit://${hit.id}`;
  const version = 'v1';
  const source = 'hit-tracker';
  const section = 'hit-log';
  const title = `Hit ${hit.title || '#'+hit.id} — ${dateKey} — ${hit.type_of_piracy || ''} — ${fmtCurrency(hit.total_value)}`;
  const tags = [
    'piracy','hit',
    `date:${dateKey}`,
    hit.patch ? `patch:${hit.patch}` : null,
    `owner:${hit.user_id}`,
    hit.air_or_ground ? `mode:${String(hit.air_or_ground).toLowerCase()}` : null,
    hit.fleet_activity ? 'fleet:true' : 'fleet:false',
  ].filter(Boolean);

  let content = [
    `Date (UTC): ${dateKey}`,
    `Title: ${hit.title || 'Untitled'}`,
    `Type: ${hit.type_of_piracy} | Mode: ${hit.air_or_ground}`,
    `Owner: ${hit.username || hit.user_id}`,
    `Assists: ${(hit.assists_usernames || hit.assists || []).join(', ') || 'none'}`,
    `Value: total=${fmtCurrency(hit.total_value)}, cut=${fmtCurrency(hit.total_cut_value)} (${hit.total_cut_scu || 0} SCU)`,
    `Cargo (top):`,
    ...(topCargoLines(hit.cargo).length ? topCargoLines(hit.cargo) : ['- none']),
    hit.victims?.length ? `Victims: ${hit.victims.join(', ')}` : null,
    hit.video_link ? `Video: ${hit.video_link}` : null,
    Array.isArray(hit.additional_media_links) && hit.additional_media_links.length ? `Media: ${hit.additional_media_links.join(', ')}` : null,
    '',
    hit.story ? `Story:\n${hit.story}` : null,
  ].filter(Boolean).join('\n');

  try {
    if ((process.env.KNOWLEDGE_AI_SUMMARY || 'false') === 'true') {
      const model = process.env.KNOWLEDGE_AI_MODEL || 'gpt-4o-mini';
      const ai = await llmSummarizeHit(openai, model, hit, dateKey);
      if (ai) content = `${content}\n\nAI Summary:\n${ai}`;
    }
  } catch (e) {
    console.error('AI summarize hit failed:', e?.response?.data || e?.message || e);
  }

  const doc = {
    source,
    category: 'piracy',
    title,
    section,
    content: String(content).slice(0, 4000),
    tags,
    url,
    version,
  guild_id: process.env.GUILD_ID,
  };

  // Try create, else attempt a targeted update by looking up existing by URL
  const created = await createKnowledge(doc);
  if (created && created.id) return created.id;
  try {
    const rows = await listKnowledge({ category: 'piracy', section: 'hit-log', limit: 200, order: 'created_at.desc' }) || [];
    const existing = rows.find(r => r.url === url);
    if (existing?.id) {
      await updateKnowledge(existing.id, doc);
      return existing.id;
    }
  } catch (e) {
    console.error('lookup/update hit knowledge failed:', e?.response?.data || e?.message || e);
  }
  return null;
}

async function fetchExistingHitUrls() {
  try {
    // Fetch a reasonably large recent set to build a URL index
    const rows = await listKnowledge({ category: 'piracy', section: 'hit-log', limit: 2000, order: 'created_at.desc' }) || [];
    const set = new Set();
    for (const r of rows) if (r?.url) set.add(r.url);
    return set;
  } catch (e) {
    console.error('[hit-ingest] failed to list existing hits:', e?.response?.data || e?.message || e);
    return new Set();
  }
}

async function cleanupOldHitLogs(days = 90) {
  try {
    const cutoff = Date.now() - days * 86400000;
    const rows = await listKnowledge({ category: 'piracy', section: 'hit-log', limit: 2000, order: 'created_at.desc' }) || [];
    const toDelete = rows.filter(r => r?.created_at && new Date(r.created_at).getTime() < cutoff);
    for (const r of toDelete) {
      try { await deleteKnowledge(r.id); } catch (e) { console.error('[hit-ingest] delete old hit failed id=', r.id, e?.response?.data || e?.message || e); }
    }
    if (toDelete.length) console.log(`[hit-ingest] cleanup deleted=${toDelete.length}`);
  } catch (e) {
    console.error('[hit-ingest] cleanup error:', e?.response?.data || e?.message || e);
  }
}

async function ingestHitLogs(client, openai) {
  const startIso = new Date().toISOString();
  const days = Number(process.env.KNOWLEDGE_HITLOG_BACKFILL_DAYS || 90);
  const cutoff = Date.now() - days * 86400000;
  if ((process.env.KNOWLEDGE_RETRIEVAL || 'true').toLowerCase() === 'false') {
    console.log(`[hit-ingest] SKIP ${startIso} (KNOWLEDGE_RETRIEVAL=false)`);
    return;
  }
  console.log(`[hit-ingest] START ${startIso} window_days=${days}`);
  let created = 0, seen = 0, skippedExisting = 0;
  try {
    const exists = await fetchExistingHitUrls();
    const hits = await getAllHitLogs();
    if (!Array.isArray(hits) || !hits.length) {
      console.log('[hit-ingest] No hits returned');
      return;
    }
    // Process newest first so recent items are prioritized
    hits.sort((a,b)=> new Date(b.created_at||b.createdAt||0) - new Date(a.created_at||a.createdAt||0));
    for (const h of hits) {
      const dt = getHitDate(h);
      if (dt.getTime && dt.getTime() < cutoff) continue;
      const url = `hit://${h.id}`;
      const force = (process.env.KNOWLEDGE_HITLOG_FORCE || 'false') === 'true';
      if (!force && exists.has(url)) { skippedExisting++; continue; }
      seen++;
      const id = await upsertHitKnowledge(openai, h);
      if (id) created++;
    }
    // cleanup old entries beyond retention
    await cleanupOldHitLogs(days);
  } catch (e) {
    console.error('[hit-ingest] failure:', e?.response?.data || e?.message || e);
  } finally {
    const endIso = new Date().toISOString();
    console.log(`[hit-ingest] DONE ${endIso} processed=${seen} upserts=${created} skipped_existing=${skippedExisting}`);
  }
}

module.exports = { ingestHitLogs };
