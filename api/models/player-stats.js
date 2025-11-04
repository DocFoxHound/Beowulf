/* Model for materialized view public.player_stats wrapping playerStatsApi.js */
const api = require('../playerStatsApi');
const { toIntLike, toFloat } = require('./_utils');

// This is a read-only view model with a refresh action.
function fromApiRow(row) {
  if (!row || typeof row !== 'object') return null;
  const out = { ...row };
  // Cast common numeric-like fields where sensible
  const intFields = [
    'user_id','shipackills','shippukills','shipkills','fpsackills','fpspukills','fpskills',
    'shipsbleaderboardrank','flighthours','piracyhits','piracyhitspublished','fleetleads','fleetassists','fleetparticipated','recentgatherings','voicehours',
  ];
  const floatFields = [
    'shipacdamages','shippudamages','shipdamages','piracyscustolen','piracyvaluestolen','fleetscu','fleetvalue','fleetdamages',
  ];
  for (const f of intFields) if (out[f] !== undefined) out[f] = toIntLike(out[f]);
  for (const f of floatFields) if (out[f] !== undefined) out[f] = toFloat(out[f]);
  // Computed booleans might arrive as true/false already
  if (out.ronin !== undefined) out.ronin = !!out.ronin;
  if (out.fleetcommander !== undefined) out.fleetcommander = !!out.fleetcommander;
  // Rank name string normalize
  if (out.rank_name !== undefined) out.rank_name = String(out.rank_name);
  // Career levels
  if (out.corsair !== undefined) out.corsair = toIntLike(out.corsair);
  if (out.raider !== undefined) out.raider = toIntLike(out.raider);
  if (out.raptor !== undefined) out.raptor = toIntLike(out.raptor);
  return out;
}

const PlayerStatsModel = {
  table: 'player_stats',
  fromApiRow,

  async list() {
    const rows = await api.getAllPlayerStats();
    if (!Array.isArray(rows)) return [];
    return rows.map(fromApiRow).filter(Boolean);
  },

  async getByUserId(user_id) {
    const row = await api.getPlayerStatsByUserId(user_id);
    return row ? fromApiRow(row) : null;
  },

  async refresh() {
    return await api.refreshPlayerStatsView();
  },
};

module.exports = { PlayerStatsModel };
