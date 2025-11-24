const { sanitizeEntityInput, normalizeKey } = require('../game-entities-sync');

function ensureString(value) {
  if (value === undefined || value === null) return undefined;
  const str = String(value).trim();
  return str || undefined;
}

function ensureArray(value) {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.map((entry) => ensureString(entry)).filter(Boolean);
  const str = ensureString(value);
  return str ? [str] : undefined;
}

function statsToMetadata(stats = {}) {
  if (!stats || typeof stats !== 'object') return undefined;
  const metadata = {};
  for (const [key, value] of Object.entries(stats)) {
    if (value === undefined || value === null) continue;
    metadata[key] = value;
  }
  return Object.keys(metadata).length ? metadata : undefined;
}

function normalizeMetadataValue(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  return ensureString(value);
}

function gatherMetadataFields(item = {}, fields = []) {
  const metadata = {};
  for (const entry of fields) {
    let from;
    let to;
    if (typeof entry === 'string') {
      from = entry;
      to = entry;
    } else if (Array.isArray(entry)) {
      [from, to] = entry;
    } else if (entry && typeof entry === 'object') {
      from = entry.from || entry.key || entry.name;
      to = entry.to || entry.key || entry.name || from;
    }
    if (!from) continue;
    const value = normalizeMetadataValue(item[from]);
    if (value === undefined) continue;
    metadata[to || from] = value;
  }
  return metadata;
}

function mergeMetadata(...chunks) {
  const merged = {};
  for (const chunk of chunks) {
    if (!chunk || typeof chunk !== 'object') continue;
    Object.assign(merged, chunk);
  }
  return Object.keys(merged).length ? merged : undefined;
}

function pickString(item = {}, keys = []) {
  for (const key of keys) {
    const value = ensureString(item[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function buildBaseItemEntity(
  item = {},
  {
    type = 'component',
    datasetHint = 'items',
    source = 'item-upload',
    metadataFields = [],
    descriptionKeys = ['description', 'summary', 'notes', 'short_description'],
    tagsBuilder,
    categoryKeys = ['category'],
    subcategoryKeys = ['type', 'subcategory'],
  } = {}
) {
  const name = ensureString(item.name);
  if (!name) return null;
  const category = pickString(item, categoryKeys) || ensureString(item.category);
  const subcategory = pickString(item, subcategoryKeys) || category;
  const statsMetadata = statsToMetadata(item.stats);
  const fieldMetadata = gatherMetadataFields(item, metadataFields);
  const metadata = mergeMetadata(statsMetadata, fieldMetadata);
  const baseTags = ensureArray(item.tags);
  const extraTags = typeof tagsBuilder === 'function' ? ensureArray(tagsBuilder(item)) : undefined;
  const allTags = extraTags?.length ? [...(baseTags || []), ...extraTags] : baseTags;
  const description = metadata ? undefined : pickString(item, descriptionKeys);
  const payload = sanitizeEntityInput(
    {
      name,
      type,
      subcategory: subcategory || category,
      short_description: description,
      aliases: ensureArray(item.aliases || item.nicknames),
      tags: allTags,
      dataset_hint: datasetHint,
      metadata,
    },
    { defaultSource: source }
  );
  if (!payload) return null;
  const key = normalizeKey(payload.name, payload.type);
  return key ? { payload, key } : null;
}

function fpsItemToEntity(item, opts = {}) {
  return buildBaseItemEntity(item, { type: 'fps_item', datasetHint: 'items_fps', source: 'fps-item-upload', ...opts });
}

function componentItemToEntity(item, opts = {}) {
  return buildBaseItemEntity(item, { type: 'component', datasetHint: 'items_components', source: 'component-item-upload', ...opts });
}

function shipItemToEntity(item, opts = {}) {
  return buildBaseItemEntity(item, {
    type: 'ship',
    datasetHint: 'ships_curated',
    source: 'ship-list-upload',
    metadataFields: [
      'manufacturer',
      'role',
      'ship_role',
      'size',
      'size_class',
      'crew',
      'min_crew',
      'max_crew',
      'cargo',
      'focus',
      'classification',
      'variant',
    ],
    subcategoryKeys: ['role', 'ship_role', 'subcategory', 'type', 'classification'],
    tagsBuilder: (row) => {
      const tags = [];
      const manufacturer = ensureString(row.manufacturer);
      if (manufacturer) tags.push(`manufacturer:${manufacturer}`);
      const role = ensureString(row.role || row.ship_role);
      if (role) tags.push(`role:${role}`);
      const size = ensureString(row.size_class || row.size);
      if (size) tags.push(`size:${size}`);
      return tags;
    },
    ...opts,
  });
}

module.exports = {
  fpsItemToEntity,
  componentItemToEntity,
  shipItemToEntity,
  buildBaseItemEntity,
};
