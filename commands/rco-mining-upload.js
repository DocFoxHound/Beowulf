const path = require('node:path');
const axios = require('axios');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { RcoMiningDataModel } = require('../api/models/rco-mining-data');
const { miningDataRowToEntities } = require('../common/entities/items-to-entities');
const { upsertGameEntities } = require('../common/game-entities-sync');

const MAX_FILE_BYTES = Number(process.env.RCO_MINING_UPLOAD_MAX_FILE_BYTES || 2_000_000);
const MAX_ROWS = Number(process.env.RCO_MINING_UPLOAD_MAX_ROWS || 1000);
const SUPPORTED_MIME = new Set(['application/json', 'text/json', 'application/octet-stream']);
const SUPPORTED_EXTS = new Set(['.json']);
const INLINE_SOURCE_LABEL = 'inline-json';

const name = 'rco-mining-upload';

const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('Upload JSON mining stats into rco_mining_data')
  .setDMPermission(false)
  .addAttachmentOption((opt) =>
    opt.setName('file')
      .setDescription('JSON attachment containing an array of mining rows')
  )
  .addStringOption((opt) =>
    opt.setName('json')
      .setDescription('Inline JSON payload (array/object)')
      .setMaxLength(1900)
  )
  .addStringOption((opt) =>
    opt.setName('stat_grain')
      .setDescription('Default stat_grain when providing raw rows')
      .setMaxLength(64)
  )
  .addBooleanOption((opt) =>
    opt.setName('dry_run')
      .setDescription('Validate rows without writing to the API')
  );

function resolveRoleList(isLive) {
  const sources = isLive
    ? [
      process.env.RCO_MINING_UPLOAD_ROLE_IDS,
      process.env.SHIP_LIST_UPLOAD_ROLE_IDS,
      process.env.COMPONENT_ITEM_UPLOAD_ROLE_IDS,
      process.env.PLAYER_ITEM_UPLOAD_ROLE_IDS,
      process.env.ENTITY_UPLOAD_ROLE_IDS,
      process.env.DOC_INGEST_ROLE_IDS,
    ]
    : [
      process.env.TEST_RCO_MINING_UPLOAD_ROLE_IDS,
      process.env.TEST_SHIP_LIST_UPLOAD_ROLE_IDS,
      process.env.TEST_COMPONENT_ITEM_UPLOAD_ROLE_IDS,
      process.env.TEST_PLAYER_ITEM_UPLOAD_ROLE_IDS,
      process.env.TEST_ENTITY_UPLOAD_ROLE_IDS,
      process.env.TEST_DOC_INGEST_ROLE_IDS,
    ];
  for (const raw of sources) {
    if (raw && raw.trim()) {
      return raw.split(',').map((id) => id.trim()).filter(Boolean);
    }
  }
  return [];
}

function getAllowedRoleIds() {
  const isLive = (process.env.LIVE_ENVIRONMENT || 'false').toLowerCase() === 'true';
  return resolveRoleList(isLive);
}

function getBloodedRoleId() {
  const isLive = (process.env.LIVE_ENVIRONMENT || 'false').toLowerCase() === 'true';
  return isLive ? process.env.BLOODED_ROLE : process.env.TEST_BLOODED_ROLE;
}

function memberHasAllowedRole(interaction) {
  const allowed = new Set(getAllowedRoleIds());
  const blooded = getBloodedRoleId();
  if (blooded) allowed.add(blooded);
  if (!allowed.size) {
    return interaction?.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) || false;
  }
  const roleIds = Array.from(interaction?.member?.roles?.cache?.keys?.() || []);
  return roleIds.some((roleId) => allowed.has(roleId));
}

function isSupportedAttachment(attachment) {
  const contentType = attachment?.contentType?.toLowerCase() || '';
  const ext = attachment?.name ? path.extname(attachment.name).toLowerCase() : '';
  if (contentType && SUPPORTED_MIME.has(contentType)) return true;
  if (contentType.includes('json')) return true;
  if (SUPPORTED_EXTS.has(ext)) return true;
  return false;
}

async function downloadAttachment(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  return Buffer.from(response.data);
}

function extractRawId(row) {
  if (!row || typeof row !== 'object') return undefined;
  if (row.id !== undefined) return row.id;
  if (row.Id !== undefined) return row.Id;
  if (row.ID !== undefined) return row.ID;
  return undefined;
}

function parseJsonPayload(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('JSON payload was empty.');
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) throw error;
    const entries = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch (lineError) {
        throw error;
      }
    }
    return entries;
  }
}

function coerceEntries(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.data)) return payload.data;
    return [payload];
  }
  throw new Error('JSON payload must be an object or array of objects.');
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function deriveSourceLabel(attachment) {
  if (attachment?.name) return attachment.name;
  return INLINE_SOURCE_LABEL;
}

function applyEntryDefaults(entry, { sourceFile, statGrain } = {}) {
  const enriched = { ...entry };
  if (sourceFile && enriched.source_file === undefined) enriched.source_file = sourceFile;
  if (statGrain && enriched.stat_grain === undefined) enriched.stat_grain = statGrain;
  return enriched;
}

function buildMiningEntityPayloads(rows = [], { source = 'rco-mining-upload' } = {}) {
  const dedupe = new Set();
  const payloads = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const entities = miningDataRowToEntities(row, { source });
    for (const entity of entities) {
      if (!entity?.payload || !entity.key) continue;
      if (dedupe.has(entity.key)) continue;
      dedupe.add(entity.key);
      payloads.push(entity.payload);
    }
  }
  return payloads;
}

function flattenRockTypesByLocation(payload, { sourceFile }) {
  if (!isRecord(payload)) return null;
  const rows = [];
  let matches = 0;
  for (const [locationCode, entry] of Object.entries(payload)) {
    if (!isRecord(entry) || !isRecord(entry.rockTypes)) continue;
    for (const [rockType, stats] of Object.entries(entry.rockTypes)) {
      if (!isRecord(stats)) continue;
      matches += 1;
      rows.push({
        source_file: sourceFile,
        stat_grain: 'rock_type_location',
        location_code: locationCode,
        rock_type: rockType,
        scans: stats.scans ?? entry.scans ?? null,
        clusters: stats.clusters ?? entry.clusters ?? null,
        mass_min: stats.mass?.min ?? null,
        mass_max: stats.mass?.max ?? null,
        mass_med: stats.mass?.med ?? null,
        inst_min: stats.inst?.min ?? null,
        inst_max: stats.inst?.max ?? null,
        inst_med: stats.inst?.med ?? null,
        res_min: stats.res?.min ?? null,
        res_max: stats.res?.max ?? null,
        res_med: stats.res?.med ?? null,
        ore_prob: stats.prob ?? null,
        finds: entry.finds ?? null,
      });
    }
  }
  return matches ? rows : null;
}

function flattenOreLocations(payload, { sourceFile }) {
  if (!isRecord(payload)) return null;
  const rows = [];
  let matches = 0;
  for (const [locationCode, entry] of Object.entries(payload)) {
    if (!isRecord(entry) || !isRecord(entry.ores)) continue;
    const clusterCount = entry.clusterCount || {};
    const mass = entry.mass || {};
    const inst = entry.inst || {};
    const res = entry.res || {};
    for (const [oreName, oreStats] of Object.entries(entry.ores)) {
      if (!isRecord(oreStats)) continue;
      const hasPct = oreStats.minPct !== undefined || oreStats.maxPct !== undefined || oreStats.medPct !== undefined;
      if (!hasPct) continue;
      matches += 1;
      rows.push({
        source_file: sourceFile,
        stat_grain: 'ore_location',
        location_code: locationCode,
        ore_name: oreName,
        scans: entry.scans ?? null,
        clusters: entry.clusters ?? null,
        cluster_min: clusterCount.min ?? null,
        cluster_max: clusterCount.max ?? null,
        cluster_med: clusterCount.med ?? null,
        mass_min: mass.min ?? null,
        mass_max: mass.max ?? null,
        mass_med: mass.med ?? null,
        inst_min: inst.min ?? null,
        inst_max: inst.max ?? null,
        inst_med: inst.med ?? null,
        res_min: res.min ?? null,
        res_max: res.max ?? null,
        res_med: res.med ?? null,
        ore_prob: oreStats.prob ?? null,
        ore_pct_min: oreStats.minPct ?? null,
        ore_pct_max: oreStats.maxPct ?? null,
        ore_pct_med: oreStats.medPct ?? null,
      });
    }
  }
  return matches ? rows : null;
}

function flattenHandMining(payload, { sourceFile }) {
  if (!isRecord(payload)) return null;
  const rows = [];
  let matches = 0;
  for (const [locationCode, entry] of Object.entries(payload)) {
    if (!isRecord(entry) || !isRecord(entry.ores)) continue;
    for (const [oreName, oreStats] of Object.entries(entry.ores)) {
      if (!isRecord(oreStats)) continue;
      const hasRocks = oreStats.minRocks !== undefined || oreStats.maxRocks !== undefined || oreStats.medianRocks !== undefined;
      if (!hasRocks) continue;
      matches += 1;
      rows.push({
        source_file: sourceFile,
        stat_grain: 'hand_mining_location',
        location_code: locationCode,
        ore_name: oreName,
        finds: oreStats.finds ?? entry.finds ?? null,
        ore_prob: oreStats.prob ?? null,
        rocks_min: oreStats.minRocks ?? null,
        rocks_max: oreStats.maxRocks ?? null,
        rocks_med: oreStats.medianRocks ?? null,
      });
    }
  }
  return matches ? rows : null;
}

function flattenRockTypesBySystem(payload, { sourceFile }) {
  if (!isRecord(payload)) return null;
  const rows = [];
  let matches = 0;
  for (const [systemName, rockMap] of Object.entries(payload)) {
    if (!isRecord(rockMap)) continue;
    for (const [rockType, rockStats] of Object.entries(rockMap)) {
      if (!isRecord(rockStats)) continue;
      if (!rockStats.mass && !rockStats.ores && !rockStats.scans && !rockStats.clusters && !rockStats.clusterCount) continue;
      matches += 1;
      const base = {
        source_file: sourceFile,
        stat_grain: 'rock_type_system',
        system_name: systemName,
        rock_type: rockType,
        scans: rockStats.scans ?? null,
        clusters: rockStats.clusters ?? null,
        cluster_min: rockStats.clusterCount?.min ?? null,
        cluster_max: rockStats.clusterCount?.max ?? null,
        cluster_med: rockStats.clusterCount?.med ?? null,
        mass_min: rockStats.mass?.min ?? null,
        mass_max: rockStats.mass?.max ?? null,
        mass_med: rockStats.mass?.med ?? null,
        inst_min: rockStats.inst?.min ?? null,
        inst_max: rockStats.inst?.max ?? null,
        inst_med: rockStats.inst?.med ?? null,
        res_min: rockStats.res?.min ?? null,
        res_max: rockStats.res?.max ?? null,
        res_med: rockStats.res?.med ?? null,
      };
      rows.push({ ...base });
      if (isRecord(rockStats.ores)) {
        for (const [oreName, oreStats] of Object.entries(rockStats.ores)) {
          if (!isRecord(oreStats)) continue;
          rows.push({
            ...base,
            stat_grain: 'rock_type_system_ore',
            ore_name: oreName,
            ore_prob: oreStats.prob ?? null,
            ore_pct_min: oreStats.minPct ?? null,
            ore_pct_max: oreStats.maxPct ?? null,
            ore_pct_med: oreStats.medPct ?? null,
          });
        }
      }
    }
  }
  return matches ? rows : null;
}

function flattenSpecialSchemas(payload, context) {
  if (!isRecord(payload)) return null;
  const detectors = [
    flattenRockTypesByLocation,
    flattenOreLocations,
    flattenHandMining,
    flattenRockTypesBySystem,
  ];
  for (const detector of detectors) {
    const rows = detector(payload, context);
    if (rows?.length) return rows;
  }
  return null;
}

function normalizeEntries(entries, defaults = {}) {
  const normalized = [];
  const errors = [];
  entries.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object') {
      errors.push(`[Row ${idx + 1}] Entry must be a JSON object.`);
      return;
    }
    const rawId = extractRawId(entry);
    const hasExplicitId = rawId !== undefined && rawId !== null && `${rawId}`.trim() !== '';
    const workingEntry = hasExplicitId ? { ...entry } : applyEntryDefaults(entry, defaults);
    const { ok, errors: rowErrors, value } = RcoMiningDataModel.normalizeInput(workingEntry, { partial: hasExplicitId });
    if (!ok) {
      errors.push(`[Row ${idx + 1}] ${rowErrors.join('; ')}`);
      return;
    }
    const normalizedId = value.id;
    if (hasExplicitId) {
      if (normalizedId === undefined || normalizedId === null) {
        errors.push(`[Row ${idx + 1}] id is required for updates.`);
        return;
      }
      const payload = { ...value };
      delete payload.id;
      if (!Object.keys(payload).length) {
        errors.push(`[Row ${idx + 1}] Provide at least one field besides id for updates.`);
        return;
      }
      normalized.push({ type: 'update', id: normalizedId, payload, rowNumber: idx + 1, entitySource: workingEntry });
    } else {
      const payload = { ...value };
      delete payload.id;
      normalized.push({ type: 'create', payload, rowNumber: idx + 1, entitySource: workingEntry });
    }
  });
  return { normalized, errors };
}

async function applyRows(rows, { dryRun = false } = {}) {
  const summary = { created: 0, updated: 0, skipped: 0, errors: [], successes: [] };
  for (const row of rows) {
    if (dryRun) {
      if (row.type === 'update') summary.updated += 1;
      else summary.created += 1;
       summary.successes.push(row.entitySource || { ...row.payload, id: row.id });
      continue;
    }
    try {
      if (row.type === 'update') {
        const result = await RcoMiningDataModel.update(row.id, row.payload);
        if (result?.ok) {
          summary.updated += 1;
          summary.successes.push(row.entitySource || { ...row.payload, id: row.id });
        } else {
          summary.skipped += 1;
          summary.errors.push(`[Row ${row.rowNumber}] ${result?.errors?.join(', ') || 'update failed'}`);
        }
      } else {
        const result = await RcoMiningDataModel.create(row.payload);
        if (result?.ok) {
          summary.created += 1;
          summary.successes.push(row.entitySource || row.payload);
        } else {
          summary.skipped += 1;
          summary.errors.push(`[Row ${row.rowNumber}] ${result?.errors?.join(', ') || 'create failed'}`);
        }
      }
    } catch (error) {
      summary.skipped += 1;
      summary.errors.push(`[Row ${row.rowNumber}] ${error?.response?.data || error?.message || error}`);
    }
  }
  return summary;
}

async function execute(interaction) {
  if (!interaction?.guildId) {
    await interaction.reply({ content: 'This command must be used inside the guild.', ephemeral: true });
    return;
  }
  if (!memberHasAllowedRole(interaction)) {
    await interaction.reply({ content: 'You do not have permission to upload mining data.', ephemeral: true });
    return;
  }

  const attachment = interaction.options.getAttachment('file');
  const inlineJson = interaction.options.getString('json');
  const requestedStatGrain = interaction.options.getString('stat_grain')?.trim() || null;
  const dryRun = interaction.options.getBoolean('dry_run') === true;

  if (!attachment && (!inlineJson || !inlineJson.trim())) {
    await interaction.reply({ content: 'Provide a JSON attachment or inline JSON payload.', ephemeral: true });
    return;
  }
  if (attachment && !isSupportedAttachment(attachment)) {
    await interaction.reply({ content: 'Unsupported file type. Provide a .json attachment.', ephemeral: true });
    return;
  }
  if (attachment?.size && attachment.size > MAX_FILE_BYTES) {
    await interaction.reply({ content: `File too large. Max allowed size is ${(MAX_FILE_BYTES / 1_000_000).toFixed(1)} MB.`, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  let textPayload = inlineJson?.trim() || '';
  if (attachment) {
    let buffer;
    try {
      buffer = await downloadAttachment(attachment.url);
    } catch (error) {
      console.error('[RcoMiningUpload] download failed:', error?.message || error);
      await interaction.editReply('Failed to download the attachment from Discord.');
      return;
    }
    if (buffer.length > MAX_FILE_BYTES) {
      await interaction.editReply(`File too large after download. Max allowed size is ${(MAX_FILE_BYTES / 1_000_000).toFixed(1)} MB.`);
      return;
    }
    textPayload = buffer.toString('utf8');
  }

  let parsed;
  try {
    parsed = parseJsonPayload(textPayload);
  } catch (error) {
    await interaction.editReply(`Could not parse the JSON payload: ${error?.message || error}`);
    return;
  }

  const sourceFileLabel = deriveSourceLabel(attachment);
  const specialRows = flattenSpecialSchemas(parsed, { sourceFile: sourceFileLabel });
  let entries;
  let sourceRowCount = 0;

  if (specialRows) {
    entries = specialRows;
    sourceRowCount = entries.length;
  } else {
    try {
      entries = coerceEntries(parsed);
    } catch (error) {
      await interaction.editReply(error?.message || 'JSON payload must contain objects.');
      return;
    }
    sourceRowCount = entries.length;
  }

  if (!entries.length) {
    await interaction.editReply('No rows were found in the JSON payload.');
    return;
  }
  if (entries.length > MAX_ROWS) {
    await interaction.editReply(`Too many rows (${entries.length}). Limit uploads to ${MAX_ROWS} rows at a time.`);
    return;
  }

  const defaults = {
    sourceFile: sourceFileLabel,
    statGrain: specialRows ? null : requestedStatGrain,
  };

  const { normalized, errors } = normalizeEntries(entries, defaults);
  if (!normalized.length) {
    const detail = errors.slice(0, 3).join('\n');
    await interaction.editReply(`No valid rows were found:\n${detail}`);
    return;
  }
  if (errors.length) {
    console.warn('[RcoMiningUpload] row normalization errors:', errors);
  }

  const summary = await applyRows(normalized, { dryRun });
  summary.skipped += errors.length;
  summary.errors.push(...errors);

  let entitySummary = null;
  try {
    const entityPayloads = buildMiningEntityPayloads(summary.successes, { source: 'rco-mining-upload' });
    if (entityPayloads.length) {
      entitySummary = await upsertGameEntities(entityPayloads, { defaultSource: 'rco-mining-upload', dryRun });
    }
  } catch (error) {
    summary.errors.push(`Failed to sync entity index: ${error?.message || error}`);
  }

  let response = `Processed ${normalized.length} row${normalized.length === 1 ? '' : 's'} (source rows: ${sourceRowCount}).`;
  response += `\nCreated: ${summary.created}, Updated: ${summary.updated}, Skipped: ${summary.skipped}.`;
  if (dryRun) response += '\nDry run enabled — no API writes were attempted.';
  if (entitySummary) {
    response += `\nEntity index sync → created ${entitySummary.created}, updated ${entitySummary.updated}, skipped ${entitySummary.skipped}.`;
  }
  if (summary.errors.length) {
    const details = summary.errors.slice(0, 5).map((msg) => `• ${msg}`).join('\n');
    response += `\nErrors:\n${details}`;
    if (summary.errors.length > 5) {
      response += `\n…and ${summary.errors.length - 5} more.`;
    }
  }

  await interaction.editReply(response);
}

module.exports = {
  name,
  data,
  execute,
};
