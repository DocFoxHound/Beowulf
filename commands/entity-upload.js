const path = require('node:path');
const axios = require('axios');
const Papa = require('papaparse');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { upsertGameEntities } = require('../common/game-entities-sync');

const MAX_FILE_BYTES = Number(process.env.ENTITY_UPLOAD_MAX_FILE_BYTES || 2_000_000);
const MAX_ROWS = Number(process.env.ENTITY_UPLOAD_MAX_ROWS || 500);
const SUPPORTED_EXTS = new Set(['.json', '.csv']);
const SUPPORTED_MIME = new Set(['application/json', 'text/csv']);

const name = 'entity-upload';

const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('Upload CSV or JSON entries to the game entity catalog')
  .setDMPermission(false)
  .addAttachmentOption((opt) =>
    opt.setName('file')
      .setDescription('CSV or JSON file describing entities')
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName('source')
      .setDescription('Override the source label stored on each entity')
      .setMaxLength(64)
  );

function getAllowedRoleIds() {
  const isLive = (process.env.LIVE_ENVIRONMENT || 'false').toLowerCase() === 'true';
  const raw = isLive
    ? (process.env.ENTITY_UPLOAD_ROLE_IDS || process.env.DOC_INGEST_ROLE_IDS || '')
    : (process.env.TEST_ENTITY_UPLOAD_ROLE_IDS || process.env.TEST_DOC_INGEST_ROLE_IDS || '');
  return raw.split(',').map((id) => id.trim()).filter(Boolean);
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
  const contentType = attachment?.contentType?.toLowerCase();
  if (contentType && SUPPORTED_MIME.has(contentType)) return true;
  const ext = attachment?.name ? path.extname(attachment.name).toLowerCase() : '';
  if (ext && SUPPORTED_EXTS.has(ext)) return true;
  if (!contentType && !ext) return true;
  return false;
}

async function downloadAttachment(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  return Buffer.from(response.data);
}

function parseList(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[|,\n,]/).map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

function normalizeRow(row = {}) {
  const lookup = (keys) => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
        const val = row[key];
        if (typeof val === 'string') {
          const trimmed = val.trim();
          if (trimmed) return trimmed;
        } else {
          return val;
        }
      }
    }
    return undefined;
  };
  const name = lookup(['name', 'Name', 'display_name', 'title']);
  const type = lookup(['type', 'Type', 'category', 'Category']);
  if (!name || !type) return null;
  const metadataJson = lookup(['metadata', 'Metadata']);
  let metadata = null;
  if (typeof metadataJson === 'string' && metadataJson.trim()) {
    try {
      const parsed = JSON.parse(metadataJson);
      if (parsed && typeof parsed === 'object') metadata = parsed;
    } catch {}
  }
  const entity = {
    name,
    type,
    subcategory: lookup(['subcategory', 'sub_category', 'Subcategory']),
    short_description: lookup(['short_description', 'description', 'summary', 'Details']),
    aliases: parseList(lookup(['aliases', 'Aliases'])),
    tags: parseList(lookup(['tags', 'Tags'])),
    dataset_hint: lookup(['dataset_hint', 'dataset']),
    source: lookup(['source', 'Source']) || undefined,
    metadata,
  };
  if (!metadata) {
    const reserved = new Set(['name', 'Name', 'display_name', 'title', 'type', 'Type', 'category', 'Category', 'subcategory', 'sub_category', 'Subcategory', 'short_description', 'description', 'summary', 'Details', 'aliases', 'Aliases', 'tags', 'Tags', 'dataset', 'dataset_hint', 'source', 'Source', 'metadata', 'Metadata']);
    const extras = {};
    for (const [key, value] of Object.entries(row)) {
      if (reserved.has(key)) continue;
      if (value === undefined || value === null || value === '') continue;
      extras[key] = value;
    }
    if (Object.keys(extras).length) entity.metadata = extras;
  }
  return entity;
}

function parseJsonEntities(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON parse failed: ${error.message || error}`);
  }
  if (Array.isArray(data)) return data.map((entry) => normalizeRow(entry)).filter(Boolean);
  if (data && typeof data === 'object') {
    return [normalizeRow(data)].filter(Boolean);
  }
  throw new Error('JSON payload must be an object or array of objects');
}

function parseCsvEntities(text) {
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
  });
  if (!Array.isArray(parsed.data) || !parsed.data.length) {
    throw new Error('CSV contained no data rows');
  }
  const rows = parsed.data.slice(0, MAX_ROWS).map((row) => normalizeRow(row)).filter(Boolean);
  if (!rows.length) throw new Error('CSV rows were missing the required name/type columns');
  return rows;
}

function parseEntitiesFromAttachment(attachment, text) {
  const ext = attachment?.name ? path.extname(attachment.name).toLowerCase() : '';
  if (ext === '.csv' || (attachment?.contentType || '').toLowerCase().includes('csv')) {
    return parseCsvEntities(text);
  }
  return parseJsonEntities(text);
}

async function execute(interaction) {
  if (!interaction?.guildId) {
    await interaction.reply({ content: 'This command must be used inside the guild.', ephemeral: true });
    return;
  }
  if (!memberHasAllowedRole(interaction)) {
    await interaction.reply({ content: 'You do not have permission to upload entities.', ephemeral: true });
    return;
  }
  const attachment = interaction.options.getAttachment('file', true);
  const sourceOverride = interaction.options.getString('source') || 'manual-upload';
  if (!isSupportedAttachment(attachment)) {
    await interaction.reply({ content: 'Unsupported file type. Provide a CSV or JSON file.', ephemeral: true });
    return;
  }
  if (attachment.size && attachment.size > MAX_FILE_BYTES) {
    await interaction.reply({ content: `File too large. Max supported size is ${(MAX_FILE_BYTES / 1_000_000).toFixed(1)} MB.`, ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  let buffer;
  try {
    buffer = await downloadAttachment(attachment.url);
  } catch (error) {
    console.error('[EntityUpload] download failed:', error?.message || error);
    await interaction.editReply('Failed to download the attachment from Discord.');
    return;
  }
  if (buffer.length > MAX_FILE_BYTES) {
    await interaction.editReply(`File too large after download. Max supported size is ${(MAX_FILE_BYTES / 1_000_000).toFixed(1)} MB.`);
    return;
  }
  const text = buffer.toString('utf8');
  let entities;
  try {
    entities = parseEntitiesFromAttachment(attachment, text);
  } catch (error) {
    await interaction.editReply(`Could not parse entities: ${error.message || error}`);
    return;
  }
  if (!entities.length) {
    await interaction.editReply('No valid entity rows were found in the file.');
    return;
  }
  try {
    const summary = await upsertGameEntities(entities, { defaultSource: sourceOverride });
    await interaction.editReply(`Processed ${summary.total} rows → ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped.`);
  } catch (error) {
    console.error('[EntityUpload] upsert failed:', error?.message || error);
    await interaction.editReply('Failed to store entities. Check the logs for details.');
  }
}

module.exports = {
  name,
  data,
  execute,
};
