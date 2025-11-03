/* Model for uex_cities wrapping `/cities/` */
const uex = require('../uexApi');
const { toIntLike, toFlag01, fromFlag } = require('./_utils');

const ID_FIELDS=['id','id_star_system','id_planet','id_orbit','id_moon','id_faction','id_jurisdiction','date_added','date_modified'];
const FLAG_FIELDS=['is_available','is_available_live','is_visible','is_default','is_monitored','is_armistice','is_landable','is_decommissioned','has_quantum_marker','has_trade_terminal','has_habitation','has_refinery','has_cargo_center','has_clinic','has_food','has_shops','has_refuel','has_repair','has_gravity','has_loading_dock','has_docking_port','has_freight_elevator'];
const STR_FIELDS=['name','code','pad_types','wiki','star_system_name','planet_name','orbit_name','moon_name','faction_name','jurisdiction_name'];

function toApiPayload(input){ const payload={};
  for(const f of ID_FIELDS) if(input[f]!==undefined) payload[f]=toIntLike(input[f]);
  for(const f of FLAG_FIELDS) if(input[f]!==undefined) payload[f]=toFlag01(input[f]);
  for(const f of STR_FIELDS) if(input[f]!==undefined) payload[f]=String(input[f]);
  return payload; }
function validate(input){ const value=toApiPayload(input||{}); const errors=[]; if(value.id===undefined) errors.push('id is required'); return {ok:errors.length===0, errors, value}; }
function fromApiRow(row){ if(!row||typeof row!=='object') return null; const out={};
  for(const f of ID_FIELDS) out[f]=row[f]!==undefined?toIntLike(row[f]):undefined;
  for(const f of FLAG_FIELDS) out[f]=fromFlag(row[f]);
  for(const f of STR_FIELDS) out[f]=row[f]!==undefined?String(row[f]):undefined; return out; }

const UexCitiesModel={
  table:'uex_cities', validate,toApiPayload,fromApiRow,
  async list(){ const rows=await uex.getAllCities(); if(!Array.isArray(rows)) return []; return rows.map(fromApiRow).filter(Boolean); },
  async getById(id){ const row=await uex.getCityById(id); return row?fromApiRow(row):null; },
  async upsert(doc){ const {ok,errors,value}=validate(doc); if(!ok) return {ok:false,errors}; try{ await uex.createOrUpdateCity(value); return {ok:true}; } catch(e){ return {ok:false, errors:[e?.response?.data||e?.message||'upsert failed']}; } },
};

module.exports={ UexCitiesModel };
