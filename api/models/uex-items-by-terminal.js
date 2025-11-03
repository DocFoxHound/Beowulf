/* Model for uex_items_by_terminal wrapping `/terminalitems/` */
const uex = require('../uexApi');
const { toIntLike, toFloat } = require('./_utils');

const ID_FIELDS=['id','id_item','id_terminal'];
const STR_FIELDS=['item_name','terminal_name'];
const FLOAT_FIELDS=['price_buy','price_sell'];

function toApiPayload(input){ const payload={};
  for(const f of ID_FIELDS) if(input[f]!==undefined) payload[f]=toIntLike(input[f]);
  for(const f of STR_FIELDS) if(input[f]!==undefined) payload[f]=String(input[f]);
  for(const f of FLOAT_FIELDS) if(input[f]!==undefined) payload[f]=toFloat(input[f]);
  return payload; }
function validate(input){ const value=toApiPayload(input||{}); const errors=[]; if(value.id===undefined) errors.push('id is required'); return {ok:errors.length===0, errors, value}; }
function fromApiRow(row){ if(!row||typeof row!=='object') return null; const out={};
  for(const f of ID_FIELDS) out[f]=toIntLike(row[f]);
  for(const f of STR_FIELDS) out[f]=row[f]!==undefined?String(row[f]):undefined;
  for(const f of FLOAT_FIELDS) out[f]=row[f]!==undefined?Number(row[f]):undefined; return out; }

const UexItemsByTerminalModel={
  table:'uex_items_by_terminal', validate,toApiPayload,fromApiRow,
  async list(){ const rows=await uex.getAllTerminalItems(); if(!Array.isArray(rows)) return []; return rows.map(fromApiRow).filter(Boolean); },
  async getById(id){ const row=await uex.getTerminalItemById(id); return row?fromApiRow(row):null; },
  async upsert(doc){ const {ok,errors,value}=validate(doc); if(!ok) return {ok:false,errors}; try{ await uex.createOrUpdateTerminalItem(value); return {ok:true}; } catch(e){ return {ok:false, errors:[e?.response?.data||e?.message||'upsert failed']}; } },
};

module.exports={ UexItemsByTerminalModel };
