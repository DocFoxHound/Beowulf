#!/usr/bin/env node
require('dotenv').config();

const UEX = require('../api/uexApi');
const { upsertGameEntities } = require('../common/game-entities-sync');
const { ItemsFpsModel } = require('../api/models/items-fps');
const { ItemsComponentsModel } = require('../api/models/items-components');
const { ShipListModel } = require('../api/models/ship-list');
const { RcoMiningDataModel } = require('../api/models/rco-mining-data');
const { fpsItemToEntity, componentItemToEntity, shipItemToEntity, miningDataRowToEntities } = require('../common/entities/items-to-entities');

const LIMITERS = {
  commodities: Number(process.env.GAME_ENTITIES_COMMODITY_LIMIT || 5000),
  items: Number(process.env.GAME_ENTITIES_ITEM_LIMIT || 5000),
  ships: Number(process.env.GAME_ENTITIES_SHIP_LIMIT || 2000),
  locations: Number(process.env.GAME_ENTITIES_LOCATION_LIMIT || 5000),
  fpsItems: Number(process.env.GAME_ENTITIES_FPS_LIMIT || 5000),
  componentItems: Number(process.env.GAME_ENTITIES_COMPONENT_LIMIT || 5000),
  shipList: Number(process.env.GAME_ENTITIES_SHIP_LIST_LIMIT || 2000),
  rcoMining: Number(process.env.GAME_ENTITIES_RCO_MINING_LIMIT || 5000),
};

function takeLimit(list, limit) {
  if (!Array.isArray(list)) return [];
  if (!Number.isFinite(limit) || limit <= 0) return list;
  return list.slice(0, limit);
}

function cleanNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function ensureString(value) {
  if (value === undefined || value === null) return undefined;
  const str = String(value).trim();
  return str || undefined;
}

function listFromValue(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[|,\n]/).map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

function buildCommodityEntity(record) {
  const name = ensureString(record?.commodity_name || record?.name || record?.label);
  if (!name) return null;
  const tags = [];
  if (record?.category) tags.push(`category:${record.category}`);
  if (record?.commodity_type) tags.push(`type:${record.commodity_type}`);
  if (record?.region) tags.push(`region:${record.region}`);
  const metadata = {
    category: record?.category || record?.commodity_type,
    group: record?.group,
    commodity_type: record?.commodity_type,
    best_buy_price: cleanNumber(record?.best_buy_price ?? record?.buy_price),
    best_sell_price: cleanNumber(record?.best_sell_price ?? record?.sell_price),
    demand: record?.demand || record?.demand_level,
    supply: record?.supply || record?.inventory_level,
    volatility: record?.volatility || record?.risk_level,
  };
  return {
    name,
    type: 'commodity',
    subcategory: record?.commodity_type || record?.category || null,
    short_description: record?.description || record?.notes || null,
    dataset_hint: 'commodities',
    tags,
    metadata,
    source: 'uex-sync',
  };
}

function buildItemEntity(record) {
  const name = ensureString(record?.item_name || record?.name || record?.label);
  if (!name) return null;
  const tags = [];
  if (record?.item_category) tags.push(`category:${record.item_category}`);
  if (record?.sub_category) tags.push(`subcategory:${record.sub_category}`);
  if (record?.manufacturer) tags.push(`manufacturer:${record.manufacturer}`);
  const inferredType = inferItemType(record);
  const metadata = {
    manufacturer: record?.manufacturer,
    size: record?.size,
    class: record?.class,
    grade: record?.grade || record?.rating,
    role: record?.role || record?.function,
    item_category: record?.item_category,
    sub_category: record?.sub_category,
  };
  if (record?.min_power) metadata.min_power = cleanNumber(record.min_power);
  if (record?.max_power) metadata.max_power = cleanNumber(record.max_power);
  return {
    name,
    type: inferredType,
    subcategory: record?.item_category || record?.sub_category || record?.type || null,
    short_description: record?.description || record?.notes || null,
    dataset_hint: 'items',
    aliases: listFromValue(record?.aliases || record?.item_aliases || record?.short_name),
    tags,
    metadata,
    source: 'uex-sync',
  };
}

function inferItemType(record = {}) {
  const haystack = [record?.item_category, record?.sub_category, record?.type, record?.category]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(' ');
  if (!haystack) return 'component';
  const includes = (needle) => haystack.includes(needle);
  if (includes('helmet') || includes('armor') || includes('undersuit') || includes('backpack')) return 'armor';
  if (includes('weapon') || includes('rifle') || includes('pistol') || includes('shotgun') || includes('sniper') || includes('smg') || includes('lmg')) return 'weapon';
  if (includes('grenade') || includes('explosive')) return 'ordnance';
  if (includes('medical') || includes('medgun') || includes('med tool')) return 'medical';
  if (includes('tractor') || includes('multitool') || includes('mining tool') || includes('gadget') || includes('utility')) return 'gear';
  return 'component';
}

function buildShipEntity(record) {
  const name = ensureString(record?.ship_name || record?.name || record?.label);
  if (!name) return null;
  const tags = [];
  if (record?.manufacturer) tags.push(`manufacturer:${record.manufacturer}`);
  if (record?.ship_role) tags.push(`role:${record.ship_role}`);
  const metadata = {
    manufacturer: record?.manufacturer,
    size: record?.size_class || record?.size,
    crew: record?.min_crew ? `${record.min_crew}-${record.max_crew || record.min_crew}` : undefined,
    cargo: cleanNumber(record?.cargo),
    ship_role: record?.ship_role,
    focus: record?.focus,
  };
  return {
    name,
    type: 'ship',
    subcategory: record?.ship_role || record?.focus || null,
    short_description: record?.description || record?.focus || null,
    dataset_hint: 'ships',
    aliases: listFromValue(record?.aliases || record?.nickname),
    tags,
    metadata,
    source: 'uex-sync',
  };
}

function buildLocationEntity(record, dataset) {
  const name = ensureString(record?.name || record?.label || record?.city_name || record?.planet_name || record?.moon_name || record?.station_name);
  if (!name) return null;
  const typeMap = {
    cities: 'city',
    planets: 'planet',
    moons: 'moon',
    outposts: 'outpost',
    space_stations: 'space_station',
    star_systems: 'star_system',
  };
  const resolvedType = typeMap[dataset] || 'location';
  const tags = [];
  if (record?.region) tags.push(`region:${record.region}`);
  if (record?.system_name || record?.star_system) tags.push(`system:${record.system_name || record.star_system}`);
  const metadata = {
    system: record?.system_name || record?.star_system,
    parent: record?.planet_name || record?.primary_body,
    services: record?.services || record?.services_summary || record?.amenities,
    population: cleanNumber(record?.population),
    biome: record?.biome,
  };
  return {
    name,
    type: resolvedType,
    subcategory: dataset,
    short_description: record?.description || record?.notes || record?.services_summary || null,
    dataset_hint: dataset,
    tags,
    metadata,
    source: 'uex-sync',
  };
}

function buildTerminalEntity(record) {
  const name = ensureString(record?.terminal_name || record?.name || record?.label);
  if (!name) return null;
  const tags = [];
  if (record?.terminal_type) tags.push(`type:${record.terminal_type}`);
  const metadata = {
    terminal_type: record?.terminal_type,
    location_name: record?.location_name || record?.planet_name || record?.city_name,
    services: record?.services,
    pad_count: cleanNumber(record?.pad_count || record?.hangar_count),
  };
  return {
    name,
    type: 'terminal',
    subcategory: record?.terminal_type || null,
    short_description: record?.services_summary || record?.notes || null,
    dataset_hint: 'terminals',
    tags,
    metadata,
    source: 'uex-sync',
  };
}

function registerItemEntity(builderResult, target, dedupeSet) {
  if (!builderResult || !builderResult.payload || !builderResult.key) return;
  if (dedupeSet.has(builderResult.key)) return;
  dedupeSet.add(builderResult.key);
  target.push(builderResult.payload);
}

async function gatherUploadedItemEntities() {
  const entities = [];
  const dedupe = new Set();
  const [fpsRowsRaw, componentRowsRaw, shipListRaw, miningRowsRaw] = await Promise.all([
    ItemsFpsModel.list({ limit: LIMITERS.fpsItems, order: 'updated_at.desc' }),
    ItemsComponentsModel.list({ limit: LIMITERS.componentItems, order: 'updated_at.desc' }),
    ShipListModel.list({ limit: LIMITERS.shipList, order: 'updated_at.desc' }),
    RcoMiningDataModel.list({ limit: LIMITERS.rcoMining, order: 'updated_at.desc' }),
  ]);

  const fpsRows = takeLimit(fpsRowsRaw || [], LIMITERS.fpsItems);
  for (const row of fpsRows) {
    registerItemEntity(fpsItemToEntity(row, { source: 'items-fps-table' }), entities, dedupe);
  }

  const componentRows = takeLimit(componentRowsRaw || [], LIMITERS.componentItems);
  for (const row of componentRows) {
    registerItemEntity(componentItemToEntity(row, { source: 'items-components-table' }), entities, dedupe);
  }

  const shipRows = takeLimit(shipListRaw || [], LIMITERS.shipList);
  for (const row of shipRows) {
    registerItemEntity(shipItemToEntity(row, { source: 'ship-list-table' }), entities, dedupe);
  }

  const miningRows = takeLimit(miningRowsRaw || [], LIMITERS.rcoMining);
  for (const row of miningRows) {
    const miningEntities = miningDataRowToEntities(row, { source: 'rco-mining-table' });
    for (const entity of miningEntities) {
      registerItemEntity(entity, entities, dedupe);
    }
  }

  return entities;
}

async function gatherUexEntities() {
  const entities = [];
  const [commodities, items, ships, terminals, cities, planets, moons, outposts, stations, starSystems] = await Promise.all([
    UEX.getAllCommodities(),
    UEX.getAllItems?.() || UEX.getAllTerminalItems?.(),
    UEX.getAllShips(),
    UEX.getAllTerminals?.(),
    UEX.getAllCities(),
    UEX.getAllPlanets(),
    UEX.getAllMoons?.(),
    UEX.getAllOutposts?.(),
    UEX.getAllSpaceStations?.(),
    UEX.getAllStarSystems?.(),
  ]);

  for (const record of takeLimit(commodities, LIMITERS.commodities)) {
    const entity = buildCommodityEntity(record);
    if (entity) entities.push(entity);
  }
  for (const record of takeLimit(items, LIMITERS.items)) {
    const entity = buildItemEntity(record);
    if (entity) entities.push(entity);
  }
  for (const record of takeLimit(ships, LIMITERS.ships)) {
    const entity = buildShipEntity(record);
    if (entity) entities.push(entity);
  }
  for (const record of takeLimit(terminals, LIMITERS.locations)) {
    const entity = buildTerminalEntity(record);
    if (entity) entities.push(entity);
  }
  const locationDatasets = [
    { data: cities, key: 'cities' },
    { data: planets, key: 'planets' },
    { data: moons, key: 'moons' },
    { data: outposts, key: 'outposts' },
    { data: stations, key: 'space_stations' },
    { data: starSystems, key: 'star_systems' },
  ];
  for (const { data, key } of locationDatasets) {
    for (const record of takeLimit(data, LIMITERS.locations)) {
      const entity = buildLocationEntity(record, key);
      if (entity) entities.push(entity);
    }
  }
  return entities;
}

async function main() {
  console.log('[GameEntitiesSync] Fetching UEX datasets...');
  const [uexEntities, uploadedEntities] = await Promise.all([
    gatherUexEntities(),
    gatherUploadedItemEntities(),
  ]);
  const entities = uexEntities.concat(uploadedEntities);
  console.log(`[GameEntitiesSync] Prepared ${entities.length} entities (UEX: ${uexEntities.length}, curated: ${uploadedEntities.length}). Upserting...`);
  const summary = await upsertGameEntities(entities, { defaultSource: 'uex-sync' });
  console.log('[GameEntitiesSync] Done:', summary);
}

main().catch((error) => {
  console.error('[GameEntitiesSync] Failed:', error?.message || error);
  process.exit(1);
});
