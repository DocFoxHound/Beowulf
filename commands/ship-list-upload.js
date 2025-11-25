const path = require('node:path');
const axios = require('axios');
const Papa = require('papaparse');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { ShipListModel } = require('../api/models/ship-list');
const { shipItemToEntity } = require('../common/entities/items-to-entities');
const { upsertGameEntities } = require('../common/game-entities-sync');

const MAX_FILE_BYTES = Number(process.env.SHIP_LIST_UPLOAD_MAX_FILE_BYTES || 2_000_000);
const MAX_ROWS = Number(process.env.SHIP_LIST_UPLOAD_MAX_ROWS || 1000);
const EXISTING_FETCH_LIMIT = Number(process.env.SHIP_LIST_UPLOAD_EXISTING_LIMIT || 20000);
const SUPPORTED_EXTS = new Set(['.csv']);
const SUPPORTED_MIME = new Set(['text/csv']);

const name = 'ship-list-upload';

const GENERATED_ID_BASE = Date.now() * 1000;
let generatedIdCounter = 0;

function generateItemId() {
  return GENERATED_ID_BASE + generatedIdCounter++;
}

const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('Upload curated ship definitions (CSV only) into ship_list')
  .setDMPermission(false)
  .addAttachmentOption((opt) =>
    opt.setName('file')
      .setDescription('CSV file with ship names, manufacturer, roles, and stats')
      .setRequired(true)
  )
  .addBooleanOption((opt) =>
    opt.setName('dry_run')
      .setDescription('Validate rows without storing anything')
  );

function resolveRoleList(isLive) {
  const candidates = isLive
    ? [
      process.env.SHIP_LIST_UPLOAD_ROLE_IDS,
      process.env.COMPONENT_ITEM_UPLOAD_ROLE_IDS,
      process.env.PLAYER_ITEM_UPLOAD_ROLE_IDS,
      process.env.ENTITY_UPLOAD_ROLE_IDS,
      process.env.DOC_INGEST_ROLE_IDS,
    ]
    : [
      process.env.TEST_SHIP_LIST_UPLOAD_ROLE_IDS,
      process.env.TEST_COMPONENT_ITEM_UPLOAD_ROLE_IDS,
      process.env.TEST_PLAYER_ITEM_UPLOAD_ROLE_IDS,
      process.env.TEST_ENTITY_UPLOAD_ROLE_IDS,
      process.env.TEST_DOC_INGEST_ROLE_IDS,
    ];
  for (const raw of candidates) {
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
  if (contentType.includes('csv')) return true;
  if (SUPPORTED_MIME.has(contentType)) return true;
  if (SUPPORTED_EXTS.has(ext)) return true;
  return false;
}

async function downloadAttachment(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  return Buffer.from(response.data);
}

function normalizeIdValue(value) {
  if (typeof ShipListModel.normalizeId === 'function') {
    return ShipListModel.normalizeId(value);
  }
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const num = Number(String(value).trim());
  return Number.isFinite(num) ? num : null;
}

function normalizeString(value) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : undefined;
}

function normalizeNameKey(value) {
  const str = normalizeString(value);
  return str ? str.toLowerCase() : null;
}

function normalizeNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (!cleaned) return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

function pickValue(row, keys = []) {
  for (const key of keys) {
    if (row[key] === undefined || row[key] === null) continue;
    const value = row[key];
    if (typeof value === 'string') {
      if (value.trim().length === 0) continue;
      return value;
    }
    return value;
  }
  return undefined;
}

function parseList(value) {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.map((entry) => normalizeString(entry)).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[|;,\n]/)
      .map((entry) => normalizeString(entry))
      .filter(Boolean);
  }
  return undefined;
}

function coerceStatValue(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const lower = trimmed.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    const num = Number(trimmed);
    if (Number.isFinite(num)) return num;
    return trimmed;
  }
  return value;
}

const RESERVED_KEYS = new Set([
  'id', 'Id', 'ID', 'ship_id', 'shipId', 'ShipId',
  'name', 'Name', 'display_name', 'displayName',
  'category', 'Category',
  'type', 'Type',
  'manufacturer', 'Manufacturer',
  'role', 'Role', 'ship_role', 'ShipRole',
  'size', 'Size', 'size_class', 'SizeClass',
  'focus', 'Focus', 'classification', 'Classification', 'variant', 'Variant',
  'crew', 'Crew', 'min_crew', 'MinCrew', 'max_crew', 'MaxCrew',
  'cargo', 'Cargo',
  'aliases', 'Aliases', 'tags', 'Tags',
  'description', 'Description', 'summary', 'Summary', 'notes', 'Notes', 'short_description', 'ShortDescription',
]);

function buildStatsFromExtras(row = {}) {
  const stats = {};
  for (const [key, value] of Object.entries(row)) {
    if (RESERVED_KEYS.has(key)) continue;
    const coerced = coerceStatValue(value);
    if (coerced === undefined) continue;
    const statKey = String(key).trim();
    if (!statKey) continue;
    stats[statKey] = coerced;
  }
  return Object.keys(stats).length ? stats : undefined;
}

function normalizeShipRow(row = {}) {
  if (!row || typeof row !== 'object') return null;
  const rawIdValue = pickValue(row, ['id', 'Id', 'ID', 'ship_id', 'shipId', 'ShipId']);
  let id;
  if (rawIdValue !== undefined) {
    const normalizedId = normalizeIdValue(rawIdValue);
    if (normalizedId === null) return null;
    id = normalizedId;
  }
  const name = normalizeString(pickValue(row, ['name', 'Name', 'display_name', 'displayName']));
  if (name === undefined) return null;
  const normalized = { name };
  if (id !== undefined) normalized.id = id;
  const category = normalizeString(pickValue(row, ['category', 'Category']));
  normalized.category = category ?? null;
  const type = normalizeString(pickValue(row, ['type', 'Type']));
  normalized.type = type ?? null;
  const manufacturer = normalizeString(pickValue(row, ['manufacturer', 'Manufacturer']));
  if (manufacturer !== undefined) normalized.manufacturer = manufacturer;
  const role = normalizeString(pickValue(row, ['role', 'Role', 'ship_role', 'ShipRole']));
  if (role !== undefined) normalized.role = role;
  const focus = normalizeString(pickValue(row, ['focus', 'Focus']));
  if (focus !== undefined) normalized.focus = focus;
  const size = normalizeString(pickValue(row, ['size', 'Size']));
  if (size !== undefined) normalized.size = size;
  const sizeClass = normalizeString(pickValue(row, ['size_class', 'SizeClass']));
  if (sizeClass !== undefined) normalized.size_class = sizeClass;
  const crew = normalizeString(pickValue(row, ['crew', 'Crew']));
  if (crew !== undefined) normalized.crew = crew;
  const minCrew = normalizeNumber(pickValue(row, ['min_crew', 'MinCrew']));
  if (minCrew !== undefined) normalized.min_crew = minCrew;
  const maxCrew = normalizeNumber(pickValue(row, ['max_crew', 'MaxCrew']));
  if (maxCrew !== undefined) normalized.max_crew = maxCrew;
  const cargo = normalizeNumber(pickValue(row, ['cargo', 'Cargo']));
  if (cargo !== undefined) normalized.cargo = cargo;
  const classification = normalizeString(pickValue(row, ['classification', 'Classification']));
  if (classification !== undefined) normalized.classification = classification;
  const variant = normalizeString(pickValue(row, ['variant', 'Variant']));
  if (variant !== undefined) normalized.variant = variant;
  const aliases = parseList(pickValue(row, ['aliases', 'Aliases']));
  if (aliases?.length) normalized.aliases = aliases;
  const tags = parseList(pickValue(row, ['tags', 'Tags']));
  if (tags?.length) normalized.tags = tags;
  const description = normalizeString(pickValue(row, ['short_description', 'ShortDescription', 'description', 'Description', 'summary', 'Summary', 'notes', 'Notes']));
  if (description !== undefined) normalized.description = description;
  const stats = buildStatsFromExtras(row);
  if (stats) normalized.stats = stats;
  return normalized;
}

function parseCsvShips(text) {
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
  });
  if (!Array.isArray(parsed.data) || !parsed.data.length) {
    throw new Error('CSV must include at least one row with a name column.');
  }
  if (parsed.data.length > MAX_ROWS) {
    throw new Error(`CSV contains ${parsed.data.length} rows. Limit uploads to ${MAX_ROWS} rows at a time.`);
  }
  const headers = Array.isArray(parsed.meta?.fields) ? parsed.meta.fields.map((h) => String(h || '').trim()) : [];
  const lcHeaders = headers.map((h) => h.toLowerCase());
  if (!lcHeaders.includes('name')) {
    throw new Error('CSV missing required column: name.');
  }
  const items = [];
  let skipped = 0;
  for (const row of parsed.data) {
    const normalized = normalizeShipRow(row);
    if (normalized) items.push(normalized);
    else skipped += 1;
  }
  if (!items.length) {
    throw new Error('CSV rows were missing valid names.');
  }
  return { items, parseSkipped: skipped, sourceRows: parsed.data.length };
}

async function loadExistingShipsByName() {
  try {
    const rows = await ShipListModel.list({ limit: EXISTING_FETCH_LIMIT, order: 'updated_at.desc' });
    const map = new Map();
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const key = normalizeNameKey(row?.name);
        if (key && !map.has(key)) {
          map.set(key, row);
        }
      }
    }
    return map;
  } catch (error) {
    console.error('[ShipListUpload] existing lookup failed:', error?.message || error);
    return new Map();
  }
}

async function upsertShips(items, { dryRun = false } = {}) {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];
  const entityCandidates = [];
  const entityKeys = new Set();
  const existingByName = await loadExistingShipsByName();
  const seenUploadNames = new Set();
  for (const item of items) {
    if (!item) {
      skipped += 1;
      errors.push('Encountered an empty row after parsing.');
      continue;
    }
    try {
      const nameKey = normalizeNameKey(item.name);
      if (!nameKey) {
        skipped += 1;
        errors.push('Row missing a valid name after normalization.');
        continue;
      }
      if (seenUploadNames.has(nameKey)) {
        skipped += 1;
        errors.push(`Duplicate name in upload: ${item.name}`);
        continue;
      }
      seenUploadNames.add(nameKey);
      let existing = existingByName.get(nameKey) || null;
      const hadUploadId = item.id !== undefined;
      if (existing && !hadUploadId) {
        item.id = existing.id;
      }
      if (item.id === undefined) {
        item.id = generateItemId();
      }
      if (!existing && hadUploadId) {
        existing = await ShipListModel.getById(item.id);
      }
      if (item.id === undefined) {
        item.id = generateItemId();
      }
      if (!existing && hadUploadId) {
        existing = await ShipListModel.getById(item.id);
      }
      let allowEntitySync = dryRun;
      if (dryRun) {
        if (existing) updated += 1;
        else created += 1;
      } else if (existing) {
        const patch = { ...item };
        delete patch.id;
        if (!Object.keys(patch).length) {
          skipped += 1;
          continue;
        }
        const result = await ShipListModel.update(item.id, patch);
        if (result?.ok) {
          updated += 1;
          allowEntitySync = true;
        } else {
          skipped += 1;
          errors.push(`Update failed for id ${item.id}: ${(result?.errors || []).join(', ') || 'unknown error'}`);
          continue;
        }
      } else {
        const result = await ShipListModel.create(item);
        if (result?.ok) {
          created += 1;
          allowEntitySync = true;
          if (!existingByName.has(nameKey)) {
            existingByName.set(nameKey, { id: item.id, name: item.name });
          }
        } else {
          skipped += 1;
          errors.push(`Create failed for id ${item.id}: ${(result?.errors || []).join(', ') || 'unknown error'}`);
          continue;
        }
      }
      if (allowEntitySync) {
        const entity = shipItemToEntity(item);
        if (entity && !entityKeys.has(entity.key)) {
          entityCandidates.push(entity.payload);
          entityKeys.add(entity.key);
        }
      }
    } catch (error) {
      skipped += 1;
      errors.push(`Row id ${item.id}: ${error?.response?.data || error?.message || error}`);
      console.error('[ShipListUpload] upsert error:', error?.message || error);
    }
  }
  let entities = null;
  if (entityCandidates.length) {
    try {
      entities = await upsertGameEntities(entityCandidates, { defaultSource: 'ship-list-upload', dryRun });
    } catch (error) {
      errors.push(`Failed to sync entity index: ${error?.message || error}`);
      console.error('[ShipListUpload] entity sync failed:', error?.message || error);
    }
  }
  return { created, updated, skipped, total: items.length, errors, entitySummary: entities };
}

async function execute(interaction) {
  if (!interaction?.guildId) {
    await interaction.reply({ content: 'This command must be used inside the guild.', ephemeral: true });
    return;
  }
  if (!memberHasAllowedRole(interaction)) {
    await interaction.reply({ content: 'You do not have permission to upload ship data.', ephemeral: true });
    return;
  }
  const attachment = interaction.options.getAttachment('file', true);
  const dryRun = interaction.options.getBoolean('dry_run') === true;
  if (!isSupportedAttachment(attachment)) {
    await interaction.reply({ content: 'Unsupported file type. Provide a CSV file.', ephemeral: true });
    return;
  }
  if (attachment.size && attachment.size > MAX_FILE_BYTES) {
    await interaction.reply({ content: `File too large. Max allowed size is ${(MAX_FILE_BYTES / 1_000_000).toFixed(1)} MB.`, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  let buffer;
  try {
    buffer = await downloadAttachment(attachment.url);
  } catch (error) {
    console.error('[ShipListUpload] download failed:', error?.message || error);
    await interaction.editReply('Failed to download the attachment from Discord.');
    return;
  }

  if (buffer.length > MAX_FILE_BYTES) {
    await interaction.editReply(`File too large after download. Max allowed size is ${(MAX_FILE_BYTES / 1_000_000).toFixed(1)} MB.`);
    return;
  }

  const text = buffer.toString('utf8');
  let parsed;
  try {
    parsed = parseCsvShips(text);
  } catch (error) {
    await interaction.editReply(`Could not parse the file: ${error.message || error}`);
    return;
  }

  const { items, parseSkipped, sourceRows } = parsed;
  if (!items.length) {
    await interaction.editReply('No valid ship rows were found in the file.');
    return;
  }

  const summary = await upsertShips(items, { dryRun });
  const totalSkipped = summary.skipped + (parseSkipped || 0);
  const totalSourceRows = typeof sourceRows === 'number' ? sourceRows : summary.total + (parseSkipped || 0);
  let response = `Processed ${summary.total} ship${summary.total === 1 ? '' : 's'} (source rows: ${totalSourceRows}).`;
  response += `\nCreated: ${summary.created}, Updated: ${summary.updated}, Skipped: ${totalSkipped}.`;
  if (dryRun) {
    response += '\nDry run enabled — no database writes were performed.';
  }
  if (parseSkipped) {
    response += `\n${parseSkipped} row${parseSkipped === 1 ? '' : 's'} were ignored for missing required name values.`;
  }
  if (summary.entitySummary) {
    response += `\nEntity index sync → created ${summary.entitySummary.created}, updated ${summary.entitySummary.updated}, skipped ${summary.entitySummary.skipped}.`;
  }
  if (summary.errors.length) {
    const details = summary.errors.slice(0, 3).map((msg) => `• ${msg}`).join('\n');
    response += `\nErrors:\n${details}`;
    if (summary.errors.length > 3) {
      response += `\n…and ${summary.errors.length - 3} more.`;
    }
  }

  await interaction.editReply(response);
}

module.exports = {
  name,
  data,
  execute,
};
