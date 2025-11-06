/* Model for uex_refinery_yields wrapping `/refineryyields/` */
const uex = require('../uexApi');
const { toIntLike } = require('./_utils');

const ID_FIELDS = [
  'id','id_commodity','id_star_system','id_planet','id_orbit','id_moon','id_space_station','id_city','id_outpost','id_poi','id_terminal','id_report',
  'value','value_week','value_month','date_added','date_modified'
];
const STR_FIELDS = [
  'commodity_name','star_system_name','planet_name','orbit_name','moon_name','space_station_name','city_name','outpost_name','poi_name','terminal_name'
];

function toApiPayload(input){
  const payload = {};
  for(const f of ID_FIELDS) if(input[f]!==undefined) payload[f]=toIntLike(input[f]);
  for(const f of STR_FIELDS) if(input[f]!==undefined) payload[f]=String(input[f]);
  return payload;
}
function validate(input){
  const value = toApiPayload(input||{});
  const errors = [];
  if(value.id===undefined) errors.push('id is required');
  return { ok: errors.length===0, errors, value };
}
function fromApiRow(row){
  if(!row || typeof row !== 'object') return null;
  const out = {};
  for(const f of ID_FIELDS) out[f] = row[f]!==undefined ? toIntLike(row[f]) : undefined;
  for(const f of STR_FIELDS) out[f] = row[f]!==undefined ? String(row[f]) : undefined;
  return out;
}

const UexRefineryYieldsModel = {
  table: 'uex_refinery_yields', validate, toApiPayload, fromApiRow,
  async list(){ const rows = await uex.getAllRefineryYields(); if(!Array.isArray(rows)) return []; return rows.map(fromApiRow).filter(Boolean); },
  async getById(id){ const row = await uex.getRefineryYieldById(id); return row ? fromApiRow(row) : null; },
  async upsert(doc){ const {ok,errors,value}=validate(doc); if(!ok) return {ok:false,errors}; try{ await uex.createOrUpdateRefineryYield(value); return {ok:true}; } catch(e){ return {ok:false, errors:[e?.response?.data||e?.message||'upsert failed']}; } },
};

module.exports = { UexRefineryYieldsModel };
