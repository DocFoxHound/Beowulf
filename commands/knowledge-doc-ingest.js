const path = require('node:path');
const axios = require('axios');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Papa = require('papaparse');
const { KnowledgeDocsModel } = require('../api/models/knowledge-docs');
const { getEmbedding } = require('../common/embeddings');

const DEFAULT_CHUNK_SIZE = Number(process.env.DOC_INGEST_CHUNK_SIZE || 1600);
const MIN_CHUNK_SIZE = Number(process.env.DOC_INGEST_CHUNK_MIN || 600);
const MAX_CHUNK_SIZE = Number(process.env.DOC_INGEST_CHUNK_MAX || 4000);
const CHUNK_OVERLAP = Number(process.env.DOC_INGEST_CHUNK_OVERLAP || 200);
const MAX_CHUNKS = Number(process.env.DOC_INGEST_MAX_CHUNKS || 25);
const MAX_CSV_ROWS = Number(process.env.DOC_INGEST_MAX_CSV_ROWS || 250);
const MAX_JSON_CHUNKS = Number(process.env.DOC_INGEST_MAX_JSON_CHUNKS || 200);
const MAX_FILE_BYTES = Number(process.env.DOC_INGEST_MAX_FILE_BYTES || 4_000_000);
const SUPPORTED_MIME = new Set(['text/plain', 'text/markdown', 'text/csv', 'application/json']);
const SUPPORTED_EXTS = new Set(['.txt', '.md', '.markdown', '.csv', '.json']);
const DOC_EMBED_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const CLASSIFICATION_CHOICES = [
  { name: 'Piracy Intel', value: 'piracy' },
  { name: 'Dogfighting Tactics', value: 'dogfighting' },
  { name: 'Logistics / Market', value: 'logistics' },
  { name: 'Operations / SOP', value: 'operations' },
  { name: 'Training / Onboarding', value: 'training' },
  { name: 'Org Lore', value: 'lore' },
];

const name = 'knowledge-doc-ingest';

const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('Upload a reference document into the knowledge base')
  .setDMPermission(false)
  .addAttachmentOption((opt) =>
    opt.setName('file')
      .setDescription('Text/markdown attachment to ingest')
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName('title')
      .setDescription('Override the document title (defaults to filename)')
      .setMaxLength(200)
  )
  .addStringOption((opt) =>
    opt.setName('tags')
      .setDescription('Comma-separated tags to include (piracy, logistics, etc)')
      .setMaxLength(200)
  )
  .addStringOption((opt) => {
    opt.setName('classification')
      .setDescription('Primary knowledge classification tag');
    for (const choice of CLASSIFICATION_CHOICES) {
      opt.addChoices(choice);
    }
    return opt;
  })
  .addIntegerOption((opt) =>
    opt.setName('chunk_size')
      .setDescription(`Override chunk size (${MIN_CHUNK_SIZE}-${MAX_CHUNK_SIZE} chars)`)
      .setMinValue(MIN_CHUNK_SIZE)
      .setMaxValue(MAX_CHUNK_SIZE)
  );

function getAllowedRoleIds() {
  const raw = process.env.LIVE_ENVIRONMENT === 'true'
    ? process.env.DOC_INGEST_ROLE_IDS
    : process.env.TEST_DOC_INGEST_ROLE_IDS;
  if (!raw) return [];
  return raw.split(',').map((id) => id.trim()).filter(Boolean);
}

function getBloodedRoleId() {
  return process.env.LIVE_ENVIRONMENT === 'true'
    ? process.env.BLOODED_ROLE
    : process.env.TEST_BLOODED_ROLE;
}

function memberHasAllowedRole(interaction) {
  const memberRoles = interaction?.member?.roles;
  const roleIds = Array.from(memberRoles?.cache?.keys?.() || []);
  const allowed = new Set(getAllowedRoleIds());
  const bloodedRole = getBloodedRoleId();
  if (bloodedRole) allowed.add(bloodedRole);

  if (allowed.size && roleIds.length) {
    for (const roleId of roleIds) {
      if (allowed.has(roleId)) return true;
    }
  }

  if (!allowed.size) {
    return interaction?.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) || false;
  }
  return false;
}

function normalizeChunkSize(requested) {
  const val = Number(requested || DEFAULT_CHUNK_SIZE);
  if (!Number.isFinite(val)) return DEFAULT_CHUNK_SIZE;
  return Math.max(MIN_CHUNK_SIZE, Math.min(MAX_CHUNK_SIZE, val));
}

function chunkByChars(text, chunkSize) {
  const clean = String(text || '').replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
  if (!clean) return [];
  const chunks = [];
  const step = Math.max(chunkSize - CHUNK_OVERLAP, MIN_CHUNK_SIZE);
  for (let idx = 0; idx < clean.length && chunks.length < MAX_CHUNKS + 5; idx += step) {
    const slice = clean.slice(idx, idx + chunkSize).trim();
    if (slice) chunks.push(slice);
    if (chunks.length >= MAX_CHUNKS && clean.length - idx > chunkSize) break;
  }
  return chunks;
}

function chunkByRows(text, chunkSize) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
  if (!normalized) return [];
  const lines = normalized.split('\n');
  const chunks = [];
  let current = [];
  let currentLen = 0;

  const flush = () => {
    if (!current.length) return;
    chunks.push(current.join('\n').trimEnd());
    current = [];
    currentLen = 0;
  };

  for (const line of lines) {
    if (chunks.length >= MAX_CHUNKS + 5) break;
    const lineWithBreak = line + '\n';
    if (lineWithBreak.length > chunkSize) {
      flush();
      const fallbackChunks = chunkByChars(line, chunkSize);
      for (const fbChunk of fallbackChunks) {
        if (chunks.length >= MAX_CHUNKS + 5) break;
        chunks.push(fbChunk);
      }
      continue;
    }
    if (currentLen + lineWithBreak.length > chunkSize && current.length) {
      flush();
    }
    current.push(line);
    currentLen += lineWithBreak.length;
  }
  flush();
  return chunks;
}

function chunkText(text, chunkSize, { preferRowBoundaries = false } = {}) {
  if (preferRowBoundaries) {
    const rowChunks = chunkByRows(text, chunkSize);
    if (rowChunks.length) return rowChunks;
  }
  return chunkByChars(text, chunkSize);
}

function isJsonAttachment(attachment) {
  const contentType = attachment?.contentType?.toLowerCase() || '';
  const ext = attachment?.name ? path.extname(attachment.name).toLowerCase() : '';
  return contentType.includes('json') || ext === '.json';
}

function parseCsvRows(text) {
  try {
    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
    });
    const headers = Array.isArray(parsed.meta?.fields)
      ? parsed.meta.fields.map((field) => String(field || '').trim()).filter(Boolean)
      : [];
    if (!headers.length) return null;
    const rows = Array.isArray(parsed.data)
      ? parsed.data.filter((row) => {
          if (!row || typeof row !== 'object') return false;
          return headers.some((header) => String(row[header] ?? '').trim().length);
        })
      : [];
    if (!rows.length) return null;
    return { headers, rows };
  } catch (err) {
    console.error('[KnowledgeDocIngest] CSV parse failed:', err?.message || err);
    return null;
  }
}

function formatCsvRowText(headers, row) {
  const lines = [];
  for (const header of headers) {
    const rawValue = row[header];
    const value = rawValue === undefined || rawValue === null ? '' : String(rawValue).trim();
    if (!value) continue;
    lines.push(`${header}: ${value}`);
  }
  return lines.join('\n').trim();
}

function pickRowLabel(headers, row) {
  for (const header of headers) {
    const value = row[header];
    if (value === undefined || value === null) continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function buildCsvRowChunks(text) {
  const parsed = parseCsvRows(text);
  if (!parsed) return null;
  const { headers, rows } = parsed;
  const csvChunks = [];
  for (let idx = 0; idx < rows.length && csvChunks.length < MAX_CSV_ROWS; idx++) {
    const textBlock = formatCsvRowText(headers, rows[idx]);
    if (!textBlock) continue;
    csvChunks.push({
      text: textBlock,
      rowNumber: idx + 1,
      label: pickRowLabel(headers, rows[idx]),
      headers,
    });
  }
  return csvChunks.length ? csvChunks : null;
}

function pickJsonLabel(value, fallback) {
  if (value && typeof value === 'object') {
    if (value.name) return String(value.name);
    if (value.id) return String(value.id);
    if (value.slug) return String(value.slug);
  }
  return fallback;
}

function buildJsonChunks(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error('[KnowledgeDocIngest] JSON parse failed:', err?.message || err);
    return null;
  }
  const chunks = [];
  const pushChunk = (label, value) => {
    if (chunks.length >= MAX_JSON_CHUNKS) return;
    const pretty = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    const textBlock = label ? `"${label}": ${pretty}` : pretty;
    chunks.push({ text: textBlock, label });
  };

  if (Array.isArray(data)) {
    data.forEach((value, idx) => {
      if (chunks.length >= MAX_JSON_CHUNKS) return;
      const label = pickJsonLabel(value, `Entry ${idx + 1}`);
      pushChunk(label, value);
    });
  } else if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      if (chunks.length >= MAX_JSON_CHUNKS) break;
      pushChunk(key, value);
    }
  } else {
    pushChunk('Document', data);
  }

  return chunks.length ? chunks : null;
}

function buildChunksWithAutoScaling({ text, initialSize, preferRowBoundaries }) {
  let currentSize = normalizeChunkSize(initialSize || DEFAULT_CHUNK_SIZE);
  let chunks = chunkText(text, currentSize, { preferRowBoundaries });
  while (chunks.length > MAX_CHUNKS && currentSize < MAX_CHUNK_SIZE) {
    const nextSize = Math.min(MAX_CHUNK_SIZE, Math.round(currentSize * 1.5));
    if (nextSize === currentSize) break;
    currentSize = nextSize;
    chunks = chunkText(text, currentSize, { preferRowBoundaries });
  }
  return { chunks, chunkSize: currentSize };
}

function parseTagsInput(raw) {
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.toLowerCase().replace(/\s+/g, '-'));
}

function buildTags({ baseTags = [], classification, interaction }) {
  const tags = [...baseTags];
  if (classification) tags.push(classification);
  tags.push('source:knowledge_doc_ingest');
  if (interaction?.guildId) tags.push(`guild:${interaction.guildId}`);
  if (interaction?.user?.id) tags.push(`uploader:${interaction.user.id}`);
  const seen = new Set();
  const capped = [];
  for (const tag of tags) {
    const trimmed = tag.slice(0, 63);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    capped.push(trimmed);
    if (capped.length >= KnowledgeDocsModel.limits.tags) break;
  }
  return capped;
}

function deduceTitle(attachmentName, providedTitle) {
  if (providedTitle) return providedTitle.trim();
  if (!attachmentName) return 'Uploaded Document';
  const parsed = path.parse(attachmentName);
  return parsed.name || attachmentName;
}

function isSupportedAttachment(attachment) {
  const contentType = attachment?.contentType?.toLowerCase();
  if (contentType && SUPPORTED_MIME.has(contentType)) return true;
  const ext = attachment?.name ? path.extname(attachment.name).toLowerCase() : '';
  if (ext && SUPPORTED_EXTS.has(ext)) return true;
  if (!contentType && !ext) return true; // last resort, assume text
  return false;
}

function isCsvAttachment(attachment) {
  const contentType = attachment?.contentType?.toLowerCase() || '';
  const ext = attachment?.name ? path.extname(attachment.name).toLowerCase() : '';
  return contentType.includes('csv') || ext === '.csv';
}

async function downloadAttachment(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  return Buffer.from(response.data);
}

async function maybeEmbed(text, openai) {
  if ((process.env.KNOWLEDGE_EMBED_ON_INGEST || 'true').toLowerCase() !== 'true') return null;
  if (!openai) return null;
  const payload = String(text || '').slice(0, 8000);
  if (!payload) return null;
  try {
    const vector = await getEmbedding({ text: payload, openai });
    if (Array.isArray(vector) && vector.length === KnowledgeDocsModel.vectorDim) return vector;
  } catch (err) {
    console.error('[KnowledgeDocIngest] embedding helper failed:', err?.message || err);
  }
  try {
    const resp = await openai.embeddings.create({ model: DOC_EMBED_MODEL, input: payload });
    const fallback = resp?.data?.[0]?.embedding;
    if (Array.isArray(fallback) && fallback.length === KnowledgeDocsModel.vectorDim) return fallback;
  } catch (err) {
    console.error('[KnowledgeDocIngest] direct embedding failed:', err?.message || err);
  }
  return null;
}

async function execute(interaction, context = {}) {
  if (!interaction?.guildId) {
    await interaction.reply({ content: 'This command is only available inside the guild.', ephemeral: true });
    return;
  }

  if (!memberHasAllowedRole(interaction)) {
    await interaction.reply({ content: 'You do not have permission to ingest documents.', ephemeral: true });
    return;
  }

  const attachment = interaction.options.getAttachment('file', true);
  if (!isSupportedAttachment(attachment)) {
    await interaction.reply({ content: 'Unsupported file type. Provide a text or markdown document.', ephemeral: true });
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
  } catch (err) {
    console.error('[KnowledgeDocIngest] download failed:', err?.message || err);
    await interaction.editReply('Failed to download the attachment from Discord.');
    return;
  }

  if (buffer.length > MAX_FILE_BYTES) {
    await interaction.editReply(`File too large after download. Max supported size is ${(MAX_FILE_BYTES / 1_000_000).toFixed(1)} MB.`);
    return;
  }

  let textContent = buffer.toString('utf8');
  const printableRatio = textContent.replace(/[\x00-\x08\x0E-\x1F]/g, '').length / Math.max(1, textContent.length);
  if (printableRatio < 0.9) {
    await interaction.editReply('The uploaded file does not appear to be plain text. Provide a .txt or .md document.');
    return;
  }

  textContent = textContent.replace(/\u0000/g, '').trim();
  if (!textContent) {
    await interaction.editReply('The uploaded file was empty after parsing.');
    return;
  }

  const requestedChunkSize = normalizeChunkSize(interaction.options.getInteger('chunk_size'));
  const preferRowBoundaries = isCsvAttachment(attachment);
  const preferJsonChunks = !preferRowBoundaries && isJsonAttachment(attachment);
  let chunkSize = null;
  let chunkEntries = null;
  let usingCsvRows = false;
  let usingJsonChunks = false;
  if (preferRowBoundaries) {
    const csvChunks = buildCsvRowChunks(textContent);
    if (csvChunks && csvChunks.length) {
      chunkEntries = csvChunks;
      usingCsvRows = true;
    }
  }
  if (!chunkEntries && preferJsonChunks) {
    const jsonChunks = buildJsonChunks(textContent);
    if (jsonChunks && jsonChunks.length) {
      chunkEntries = jsonChunks;
      usingJsonChunks = true;
    }
  }
  if (!chunkEntries) {
    const built = buildChunksWithAutoScaling({
      text: textContent,
      initialSize: requestedChunkSize,
      preferRowBoundaries,
    });
    chunkEntries = built.chunks.map((block) => ({ text: block }));
    chunkSize = built.chunkSize;
  }

  if (!chunkEntries.length) {
    await interaction.editReply('No content chunks were generated. Provide a longer text file.');
    return;
  }

  if (usingCsvRows) {
    if (chunkEntries.length > MAX_CSV_ROWS) {
      await interaction.editReply(`Too many CSV rows (${chunkEntries.length}). Reduce the file length or split the sheet so each upload stays under ${MAX_CSV_ROWS} rows.`);
      return;
    }
  } else if (usingJsonChunks) {
    if (chunkEntries.length > MAX_JSON_CHUNKS) {
      await interaction.editReply(`Too many JSON blocks (${chunkEntries.length}). Split the JSON file so each upload stays under ${MAX_JSON_CHUNKS} top-level entries.`);
      return;
    }
  } else if (chunkEntries.length > MAX_CHUNKS) {
    await interaction.editReply(`Too many chunks (${chunkEntries.length}). Reduce the file length or increase chunk size (currently ${chunkSize}).`);
    return;
  }

  const baseTitle = deduceTitle(attachment.name, interaction.options.getString('title'));
  const baseTags = parseTagsInput(interaction.options.getString('tags'));
  const classification = interaction.options.getString('classification');
  const tags = buildTags({ baseTags, classification, interaction });

  const ingestResults = [];
  for (let i = 0; i < chunkEntries.length; i++) {
    const entry = chunkEntries[i];
    const chunkTitle = (() => {
      if (usingCsvRows && entry) {
        if (entry.label) return `${baseTitle} – ${entry.label}`;
        if (entry.rowNumber !== undefined) return `${baseTitle} (row ${entry.rowNumber})`;
      }
      if (usingJsonChunks && entry) {
        if (entry.label) return `${baseTitle} – ${entry.label}`;
      }
      return chunkEntries.length > 1 ? `${baseTitle} (part ${i + 1}/${chunkEntries.length})` : baseTitle;
    })();
    const chunk = String(entry?.text || '');
    const payload = {
      title: chunkTitle.slice(0, KnowledgeDocsModel.limits.title),
      text: chunk.slice(0, KnowledgeDocsModel.limits.text),
      tags,
    };
    const vector = await maybeEmbed(`${chunkTitle}\n\n${chunk}`, context.openai);
    if (vector) payload.vector = vector;

    try {
      const created = await KnowledgeDocsModel.create(payload);
      if (created?.ok) {
        ingestResults.push({ ok: true, id: created.data?.id });
      } else {
        ingestResults.push({ ok: false, error: created?.errors?.join(', ') || 'validation failed' });
      }
    } catch (err) {
      console.error('[KnowledgeDocIngest] create failed:', err?.message || err);
      ingestResults.push({ ok: false, error: err?.message || 'request failed' });
    }
  }

  const success = ingestResults.filter((r) => r.ok).length;
  const failed = ingestResults.length - success;

  let response = `Ingested ${success} chunk${success === 1 ? '' : 's'} for **${baseTitle}**.`;
  response += `\nTags: ${tags.join(', ')}`;
  response += `\nTotal characters processed: ${textContent.length.toLocaleString()}`;
  if (failed) {
    const sampleErrors = ingestResults.filter((r) => !r.ok).slice(0, 2).map((r) => r.error || 'unknown error');
    response += `\n${failed} chunk${failed === 1 ? '' : 's'} failed: ${sampleErrors.join('; ')}`;
  }

  await interaction.editReply(response);
}

module.exports = {
  name,
  data,
  execute,
};
