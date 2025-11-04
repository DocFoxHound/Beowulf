// Heuristic piracy route advice leveraging cache relations and terminal activity
// Input: { from, to, item }
// Output: { text }

const { getCache, getRelations } = require('./data-cache');
const { mostActiveTerminals } = require('./market-answerer');

function norm(s) { return String(s || '').trim().toLowerCase(); }
function fmt(n) { const x = Number(n||0); return isFinite(x) ? Math.round(x).toLocaleString() : String(n); }

function pickStationsLike(rel, systemName, prefixRe) {
  const out = [];
  const sysNameLc = norm(systemName);
  for (const id in rel.stationsById || {}) {
    const st = rel.stationsById[id];
    const sys = st?.id_star_system != null ? rel.systemsById[String(st.id_star_system)] : null;
    const sysOk = sys ? norm(sys.name).includes(sysNameLc) : (norm(st.system).includes(sysNameLc));
    if (!sysOk) continue;
    const name = st?.name || '';
    if (prefixRe && !prefixRe.test(name)) continue;
    out.push(name);
  }
  return Array.from(new Set(out)).slice(0, 6);
}

async function piracyAdviceForRoute({ from, to, item = null } = {}) {
  const rel = getRelations();
  const cache = getCache();
  const A = String(from || '').trim();
  const B = String(to || '').trim();
  if (!A || !B) return { text: 'I need the two endpoints, e.g., between Hurston and Monox.' };

  // Identify systems tied to endpoints (best-effort, fall back to substring rules)
  const guessSystem = (name) => {
    const n = norm(name);
    for (const id in rel.systemsById || {}) {
      const sys = rel.systemsById[id];
      if (norm(sys.name) === n || norm(sys.code) === n || norm(sys.name).includes(n)) return sys.name;
    }
    // If it's a planet/city/outpost/station, lift its system
    for (const mp of [rel.planetsById, rel.citiesById, rel.outpostsById, rel.stationsById]) {
      for (const id in (mp || {})) {
        const o = mp[id];
        const nm = norm(o?.name);
        if (!nm) continue;
        if (nm === n || nm.includes(n)) {
          const sid = o.id_star_system != null ? String(o.id_star_system) : null;
          if (sid && rel.systemsById[sid]) return rel.systemsById[sid].name;
        }
      }
    }
    // Last resort: common known names
    if (/stanton/.test(n)) return 'Stanton';
    if (/pyro/.test(n)) return 'Pyro';
    return null;
  };

  const sysA = guessSystem(A) || 'Stanton';
  const sysB = guessSystem(B) || 'Pyro';

  // Candidate choke points: Lagrange points or major stations in each system
  const lagreA = pickStationsLike(rel, sysA, /-L\d/i);
  const lagreB = pickStationsLike(rel, sysB, /-L\d/i);
  const stationsA = lagreA.length ? lagreA : pickStationsLike(rel, sysA, null);
  const stationsB = lagreB.length ? lagreB : pickStationsLike(rel, sysB, null);

  // Activity hints: most active terminals near each endpoint/system
  const actA = await mostActiveTerminals({ top: 5, location: sysA });
  const actB = await mostActiveTerminals({ top: 5, location: sysB });

  const lines = [];
  const header = `Piracy route advice for ${item ? (item + ' ') : ''}run between ${A} (${sysA}) and ${B} (${sysB}):`;
  lines.push(header);
  lines.push('');

  // Snare/interdiction
  lines.push('Snare (quantum interdiction) suggestions:');
  if (stationsA.length) lines.push(`- Departing ${sysA}: set up off-lane between ${A} and ${stationsA[0]} (avoid armistice zones).`);
  if (stationsB.length) lines.push(`- Arriving ${sysB}: snare just outside QT from ${stationsB[0]} toward ${B}; catch ships exiting QT still aligning.`);
  if (lagreA.length) lines.push(`- ${sysA} L-points: ${lagreA.join(', ')} are common transit choke points—offset your snare ~100–300km from the marker.`);
  if (lagreB.length) lines.push(`- ${sysB} L-points: ${lagreB.join(', ')} are good arrival funnels; avoid direct armistice bubbles.`);

  lines.push('');
  lines.push('Camp/ambush positions:');
  if (stationsA.length) lines.push(`- Stage near ${stationsA.slice(0,2).join(' or ')} for scans; intercept laden ships leaving ${A}.`);
  if (stationsB.length) lines.push(`- Camp near ${stationsB.slice(0,2).join(' or ')} to tag freighters before they reach ${B}.`);
  lines.push('- Use terrain/asteroid cover if available; keep a scout on the lane to relay targets.');

  lines.push('');
  lines.push('Invade at terminal (high risk):');
  lines.push(`- Infiltrate landing areas around ${B} only if security is light and server pop is low; otherwise prefer intercept away from armistice.`);

  // Activity summaries
  lines.push('');
  lines.push(`Recent terminal activity hints in ${sysA}:`);
  if (actA?.text) lines.push(actA.text.split('\n').slice(1, 4).map(s=>`  ${s}`).join('\n'));
  lines.push(`Recent terminal activity hints in ${sysB}:`);
  if (actB?.text) lines.push(actB.text.split('\n').slice(1, 4).map(s=>`  ${s}`).join('\n'));

  lines.push('');
  lines.push('Tips:');
  lines.push('- Rotate positions every few grabs to avoid counter-hunters.');
  lines.push('- If traffic is thin, switch systems (Stanton <-> Pyro) or pivot to a different commodity route.');

  return { text: lines.filter(Boolean).join('\n') };
}

module.exports = { piracyAdviceForRoute };
