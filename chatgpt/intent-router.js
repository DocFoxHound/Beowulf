const SAFE_INTENTS = [
  // Piracy-focused intents
  'piracy.latest',        // user wants the most recent hit
  'piracy.summary',       // user wants a recap/summary of recent hits
  'piracy.advice',        // user asks general piracy questions/tips/strategy
  'piracy.find',          // user wants specific hits (by patch/owner/date/keywords)
  'piracy.stats',         // user wants counts or value aggregates over hits
  'piracy.spots',         // user asks about good piracy locations/spots/hotspots
  // Chat/General
  'chat.banter',          // casual banter; keep light, no heavy retrieval
  'chat.recent',          // recent activity in this channel
  'general.info',         // broad info-seeking, let retrieval decide
  'other',                // none of the above
  // Users
  'user.opinion',
  'user.activity',
  'user.stats',
  // Market
  'market.route',
  'market.spot',
  'market.best',
  'market.activity',
  'market.recommend',
  'item.sell',
  'item.buy',
  'location.activity',
  'location.items',
  // Star systems
  'starsystem.info',
  'starsystem.list',
  'starsystem.availability',
  'starsystem.wiki',
  'starsystem.faction',
  'starsystem.jurisdiction',
  'starsystem.search',
  'starsystem.changes',
  'starsystem.default',
  // Space stations
  'spacestation.info',
  'spacestation.list',
  'spacestation.availability',
  'spacestation.features',
  'spacestation.search',
  'spacestation.changes',
  'spacestation.default',
  // Planets
  'planet.info',
  'planet.list',
  'planet.availability',
  'planet.search',
  'planet.changes',
  'planet.default',
  'planet.faction',
  'planet.jurisdiction',
  // Outposts
  'outpost.info',
  'outpost.list',
  'outpost.availability',
  'outpost.features',
  'outpost.search',
  'outpost.changes',
  'outpost.default',
  'outpost.faction',
  'outpost.jurisdiction',
  // Dogfighting
  'dogfighting.ships',
  'dogfighting.meta',
  'dogfighting.equipment',
  'dogfighting.training',
  'dogfighting.strategies',
];

function parseTimeframe(s) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const lower = s.toLowerCase();
  const toIso = (d) => d.toISOString().slice(0,10);
  if (/(right\s*now|currently|now|as\s+of\s+now|these\s+days)\b/.test(lower)) {
    const start = new Date(today.getTime() - 7*86400000);
    return { date_start: toIso(start), date_end: toIso(today) };
  }
  if (/today\b/.test(lower)) {
    return { date_start: toIso(today), date_end: toIso(today) };
  }
  if (/yesterday\b/.test(lower)) {
    const y = new Date(today.getTime() - 86400000);
    return { date_start: toIso(y), date_end: toIso(y) };
  }
  if (/(recent|recently|lately)\b/.test(lower)) {
    const start = new Date(today.getTime() - 14*86400000);
    return { date_start: toIso(start), date_end: toIso(today) };
  }
  if (/this\s+week\b/.test(lower)) {
    const day = today.getUTCDay() || 7; // 1..7
    const start = new Date(today.getTime() - (day-1)*86400000);
    return { date_start: toIso(start), date_end: toIso(today) };
  }
  if (/last\s+week\b/.test(lower)) {
    const day = today.getUTCDay() || 7;
    const start = new Date(today.getTime() - (day-1 + 7)*86400000);
    const end = new Date(start.getTime() + 6*86400000);
    return { date_start: toIso(start), date_end: toIso(end) };
  }
  if (/this\s+month\b/.test(lower)) {
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    return { date_start: toIso(start), date_end: toIso(today) };
  }
  if (/last\s+month\b/.test(lower)) {
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth()-1, 1));
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    return { date_start: toIso(start), date_end: toIso(end) };
  }
  return {};
}

function quickHeuristic(text) {
  const s = String(text || '').toLowerCase();
  const isPiracy = /(\bhit\b|\bhits\b|\bpiracy\b|\bpirate\b)/.test(s);
  const mentionsStarSystem = /(\bstar\s*systems?\b|\bsystems?\b\s*(?:list|available|visible|default)|\bpyro\b|\bstanton\b|\bnyx\b|\bterra\b|\bsol\b)/.test(s);
  const mentionsSpaceStation = /(\bspace\s*stations?\b|\bstation\b|\bport\b|\brest\s*stop\b|\bgrim\s*hex\b|\bport\s*olisar\b|\bhorizon\b|\bcru\s*l\d+\b|\bunknown\s*station\b)/.test(s);
  const mentionsPlanet = /(\bplanets?\b|\bhurston\b|\bmicrotech\b|\barccorp\b|\bcrusader\b|\bterra\b|\bhur-l\d\b)/.test(s);
  const mentionsOutpost = /(\boutposts?\b|\bresearch\s*outpost\b|\bmining\s*outpost\b|\bshubin\b|\brayari\b|\boutpost:\s*[a-z0-9\-\' ]{3,40})/.test(s);
  const getLoc = () => {
    const m = s.match(/\b(?:in|at|on|around|near)\s+([a-z0-9\-\'\s]{2,40})/i);
    if (!m) return null;
    // Trim trailing timeframe or filler like "right now", "today", etc., and punctuation
    let loc = m[1].trim();
    loc = loc.replace(/\b(right\s*now|currently|today|yesterday|this\s+week|last\s+week|this\s+month|last\s+month|recently|lately|as\s+of\s+now)\b.*$/i, '').trim();
    loc = loc.replace(/[,.;?!].*$/, '').trim();
    return loc || null;
  };
  const getSystemName = () => {
    // Try a few patterns to extract a system name
    const p1 = s.match(/(?:star\s*system|system|about|in|of|called|named)\s+([a-z0-9\-\' ]{3,30})\b/i);
    if (p1 && p1[1]) return p1[1].trim();
    // Common system names (expandable)
    const p2 = s.match(/\b(pyro|stanton|nyx|terra|sol|odin|tyrol|chronos)\b/i);
    if (p2 && p2[1]) return p2[1].trim();
    return null;
  };
  // Allow both singular and plural (e.g., "latest hit" and "latest hits")
  if (isPiracy && /(latest|most\s*recent|last)\s+hits?/.test(s)) {
    return { intent: 'piracy.latest', confidence: 0.95, filters: {} };
  }
  // Recap/summary of recent hits, broader phrasing than just "latest"
  if (isPiracy && /(summar(y|ise|ize)|recap|overview|what\s+happened|what\s+did\s+we\s+do|brief me|catch\s+me\s+up)/.test(s)) {
    const filters = { ...parseTimeframe(s) };
    // Optional limit detection: "top 3", "last 5"
    const lim = (s.match(/\b(last|top)\s+(\d{1,2})\b/) || [])[2];
    if (lim) filters.limit = Math.max(1, Math.min(10, Number(lim)));
    return { intent: 'piracy.summary', confidence: 0.9, filters };
  }
  if (isPiracy && /(how many|count|sum|total|average|avg|highest|max|lowest|min|best|biggest|largest|most\s+valuable)/.test(s)) {
    let metric = undefined;
    if (/(highest|max|best|biggest|largest|most\s+valuable)/.test(s)) metric = 'max_value';
    if (/(lowest|min|least\s+valuable|smallest)/.test(s)) metric = metric || 'min_value';
    if (/(average|avg|mean)/.test(s)) metric = metric || 'avg_value';
    if (/(sum|total)/.test(s)) metric = metric || 'total_value';
    if (/(how many|count)/.test(s)) metric = metric || 'count';
    return { intent: 'piracy.stats', confidence: 0.85, filters: { metric, ...parseTimeframe(s) } };
  }
  // Piracy spots / hotspots / where to pirate
  if (isPiracy && /(spots?|hot\s*spots?|hotspots?|where\s+(to|should)\s+(pirate|hit)|best\s+(place|area|route|lane|spot)|targets?|target\s+rich)/.test(s)) {
    const filters = { ...parseTimeframe(s) };
    const location_name = getLoc();
    if (location_name) filters.location_name = location_name;
    return { intent: 'piracy.spots', confidence: 0.9, filters };
  }
  // General piracy Q&A / advice
  if (isPiracy && /(how\b|what\b|why\b|where\b|when\b|should\b|tips?|advice|guide|strategy|strategies|strats|tactic|tactics|approach|recommend|avoid|counter|deal\s+with|handle|board|trap|ambush|disable|scan)/.test(s)) {
    return { intent: 'piracy.advice', confidence: 0.8, filters: { ...parseTimeframe(s) } };
  }
  if (isPiracy) {
    const patch = (s.match(/\b(\d+\.\d+(?:\.\d+)?)\b/) || [])[1] || null;
    return { intent: 'piracy.find', confidence: 0.7, filters: { patch, ...parseTimeframe(s) } };
  }
  // Market: item buy/sell
  if (/(where\s+to\s+buy|where\s+can\s+i\s+buy|\bbuy\b|best\s+(place|location)\s+to\s+buy|best\s+buy(ing)?\s+location)/.test(s)) {
    const m = s.match(/(?:buy|to\s+buy)\s+([a-z0-9\-\s]{3,60})/i) || s.match(/best\s+buy(?:ing)?\s+location\s+for\s+([a-z0-9\-\s]{3,60})/i);
    const item_name = m ? m[1].trim() : null;
    const location_name = getLoc();
    return { intent: 'item.buy', confidence: 0.75, filters: { item_name, location_name, ...parseTimeframe(s) } };
  }
  if (/(where\s+to\s+sell|where\s+can\s+i\s+sell|\bsell\b|best\s+(place|location)\s+to\s+sell|best\s+selling\s+locations?)/.test(s)) {
    const m = s.match(/(?:sell|to\s+sell)\s+([a-z0-9\-\s]{3,60})/i) || s.match(/best\s+selling\s+locations?\s+for\s+([a-z0-9\-\s]{3,60})/i);
    const item_name = m ? m[1].trim() : null;
    const location_name = getLoc();
    return { intent: 'item.sell', confidence: 0.75, filters: { item_name, location_name, ...parseTimeframe(s) } };
  }
  if (/\broute\b/.test(s)) {
    // Try to extract item name for route queries
    const m = s.match(/(?:route|profit\s*route|trade\s*route)\s*(?:for)?\s*([a-z0-9\-\s]{3,60})/i) || s.match(/for\s+([a-z0-9\-\s]{3,60})\s+route/i);
    const item_name = m ? m[1]?.trim() : null;
    const location_name = getLoc();
    return { intent: 'market.route', confidence: 0.75, filters: { item_name, location_name, ...parseTimeframe(s) } };
  }
  if (/\bspot\b|\bspot\s+price\b/.test(s)) {
    const m = s.match(/(?:for|of)\s+([a-z0-9\-\s]{3,60})\b/);
    const item_name = m ? m[1].trim() : null;
    const location_name = getLoc();
    return { intent: 'market.spot', confidence: 0.7, filters: { item_name, location_name, ...parseTimeframe(s) } };
  }
  if (/\b(best|optimal)\b/.test(s) && /\b(price|profit|route|sell|buy|location|place)\b/.test(s)) {
    const m = s.match(/(?:for|of)\s+([a-z0-9\-\s]{3,60})\b/);
    const item_name = m ? m[1].trim() : null;
    const location_name = getLoc();
    return { intent: 'market.best', confidence: 0.7, filters: { item_name, location_name, ...parseTimeframe(s) } };
  }
  if (/(most\s+movement|most\s+active|transactions?|reports?)/.test(s)) {
    const location_name = getLoc();
    const scope = (/\bby\s+terminal\b|\bper\s+terminal\b|\bterminals?\b|\bstations?\b|\boutposts?\b/.test(s)) ? 'terminal' : undefined;
    return { intent: 'market.activity', confidence: 0.75, filters: { location_name, scope, ...parseTimeframe(s) } };
  }
  // Star systems
  if (mentionsStarSystem || /\bstar\s*systems?\b/.test(s)) {
    const system_name = getSystemName();
    const live_only = /(live|available\s+in\s+live)/.test(s) || undefined;
    const visible_only = /\bvisible\b/.test(s) || undefined;
    const default_only = /\bdefault\b/.test(s) || undefined;
    if (/\b(list|which|show)\b/.test(s) || (!system_name && /(available|visible|default|systems?)/.test(s))) {
      return { intent: 'starsystem.list', confidence: 0.85, filters: { live_only, visible_only, default_only } };
    }
    if (/\b(available|status|live|visible|default)\b/.test(s) && system_name) {
      return { intent: 'starsystem.availability', confidence: 0.85, filters: { system_name } };
    }
    if (/\b(wiki|lore|info|details|about)\b/.test(s) && system_name) {
      return { intent: 'starsystem.info', confidence: 0.8, filters: { system_name } };
    }
    if (/\bfaction\b/.test(s)) {
      return { intent: 'starsystem.faction', confidence: 0.75, filters: { system_name } };
    }
    if (/\bjurisdiction\b/.test(s)) {
      return { intent: 'starsystem.jurisdiction', confidence: 0.75, filters: { system_name } };
    }
    if (/\b(search|find)\b/.test(s)) {
      const q = system_name || (s.replace(/.*\b(search|find)\b/i, '').trim() || null);
      return { intent: 'starsystem.search', confidence: 0.7, filters: { query: q } };
    }
    if (/\b(changes?|updated|modified|added|recent)\b/.test(s)) {
      return { intent: 'starsystem.changes', confidence: 0.7, filters: { ...parseTimeframe(s) } };
    }
    if (/\bdefault\b/.test(s)) {
      return { intent: 'starsystem.default', confidence: 0.75, filters: {} };
    }
    if (system_name) {
      return { intent: 'starsystem.info', confidence: 0.7, filters: { system_name } };
    }
  }

  // Space stations
  if (mentionsSpaceStation || /\b(space\s*stations?|station)\b/.test(s)) {
    const stationFromAt = (s.match(/(?:station|at|in|on)\s+([a-z0-9\-\' ]{3,40})\b/i) || [])[1] || null;
    const station_name = stationFromAt ? stationFromAt.trim() : null;
    // Feature flags/services
    const serviceFlags = {
      has_refinery: /\brefinery\b/.test(s),
      has_cargo_center: /\bcargo\s*center\b/.test(s),
      has_clinic: /\bclinic\b|\bmed\b/.test(s),
      has_food: /\bfood\b|\brestaurant\b|\bbar\b|\bcafe\b/.test(s),
      has_shops: /\bshops?\b|\bstores?\b|\btraders?\b/.test(s),
      has_refuel: /\brefuel\b/.test(s),
      has_repair: /\brepair\b/.test(s),
      has_habitation: /\bhabit(ation|s)?\b|\bhab(s)?\b/.test(s),
      has_trade_terminal: /\btrade\s*terminal\b|\bterminal\b/.test(s),
    };
    const policyFlags = {
      is_monitored: /\bmonitored\b/.test(s),
      is_armistice: /\barmistice\b/.test(s),
      is_landable: /\blandable\b|\bland\b/.test(s),
      is_decommissioned: /\bdecommissioned\b/.test(s),
      is_lagrange: /\blagrange\b/.test(s),
      has_quantum_marker: /\bquantum\s*marker\b/.test(s),
    };
    const live_only = /(live|available\s+in\s+live)/.test(s) || undefined;
    const visible_only = /\bvisible\b/.test(s) || undefined;
    const default_only = /\bdefault\b/.test(s) || undefined;
    const location_name = getLoc();

    // Lists and filters
    if (/\b(list|which|show)\b/.test(s) || (!station_name && /(available|visible|default|stations?)\b/.test(s))) {
      return { intent: 'spacestation.list', confidence: 0.85, filters: { station_name, location_name, live_only, visible_only, default_only, ...serviceFlags, ...policyFlags } };
    }
    // Availability/status for specific station
    if (/\b(available|status|live|visible|default|monitored|armistice|landable|decommissioned|lagrange)\b/.test(s) && station_name) {
      return { intent: 'spacestation.availability', confidence: 0.85, filters: { station_name } };
    }
    // Feature check for a station or general feature listing
    if (/\b(has|services?|features?)\b/.test(s) || Object.values(serviceFlags).some(Boolean)) {
      return { intent: 'spacestation.features', confidence: 0.8, filters: { station_name, location_name, ...serviceFlags } };
    }
    if (/\b(search|find)\b/.test(s)) {
      const q = station_name || (s.replace(/.*\b(search|find)\b/i, '').trim() || null);
      return { intent: 'spacestation.search', confidence: 0.75, filters: { query: q, location_name } };
    }
    if (/\b(changes?|updated|modified|added|recent)\b/.test(s)) {
      return { intent: 'spacestation.changes', confidence: 0.75, filters: { ...parseTimeframe(s) } };
    }
    if (/\bdefault\b/.test(s)) {
      return { intent: 'spacestation.default', confidence: 0.75, filters: {} };
    }
    if (station_name) {
      return { intent: 'spacestation.info', confidence: 0.75, filters: { station_name } };
    }
  }

  // Planets
  if (mentionsPlanet || /\bplanets?\b/.test(s)) {
    const planetFromIn = (s.match(/(?:planet|on|in|at)\s+([a-z0-9\-\' ]{3,40})\b/i) || [])[1] || null;
    const planet_name = planetFromIn ? planetFromIn.trim() : null;
    const system_name = (s.match(/(?:in|of)\s+(?:the\s+)?([a-z0-9\-\' ]{3,30})\s+system\b/i) || [])[1] || null;
    const live_only = /(live|available\s+in\s+live)/.test(s) || undefined;
    const visible_only = /\bvisible\b/.test(s) || undefined;
    const default_only = /\bdefault\b/.test(s) || undefined;
    if (/\b(list|which|show)\b/.test(s) || (!planet_name && /(available|visible|default|planets?)/.test(s))) {
      return { intent: 'planet.list', confidence: 0.85, filters: { planet_name, system_name, live_only, visible_only, default_only } };
    }
    if (/\b(available|status|live|visible|default)\b/.test(s) && planet_name) {
      return { intent: 'planet.availability', confidence: 0.85, filters: { planet_name, system_name } };
    }
    if (/\bfaction\b/.test(s)) {
      return { intent: 'planet.faction', confidence: 0.75, filters: { planet_name, system_name } };
    }
    if (/\bjurisdiction\b/.test(s)) {
      return { intent: 'planet.jurisdiction', confidence: 0.75, filters: { planet_name, system_name } };
    }
    if (/\b(search|find)\b/.test(s)) {
      const q = planet_name || (s.replace(/.*\b(search|find)\b/i, '').trim() || null);
      return { intent: 'planet.search', confidence: 0.75, filters: { query: q, system_name } };
    }
    if (/\b(changes?|updated|modified|added|recent)\b/.test(s)) {
      return { intent: 'planet.changes', confidence: 0.75, filters: { ...parseTimeframe(s) } };
    }
    if (/\bdefault\b/.test(s)) {
      return { intent: 'planet.default', confidence: 0.75, filters: {} };
    }
    if (planet_name) {
      return { intent: 'planet.info', confidence: 0.75, filters: { planet_name, system_name } };
    }
  }

  // Outposts
  if (mentionsOutpost || /\boutposts?\b/.test(s)) {
    const outpostFromAt = (s.match(/(?:outpost|at|in|on)\s+([a-z0-9\-\' ]{3,40})\b/i) || [])[1] || null;
    const outpost_name = outpostFromAt ? outpostFromAt.trim() : null;
    let location_name = (s.match(/(?:on|in|near|around)\s+([a-z0-9\-\' ]{3,40})\b/i) || [])[1] || null;
    if (location_name) {
      location_name = location_name
        .replace(/\b(right\s*now|currently|today|yesterday|this\s+week|last\s+week|this\s+month|last\s+month|recently|lately|as\s+of\s+now)\b.*$/i, '')
        .replace(/[,.;?!].*$/, '')
        .trim();
    }
    // Services and policy flags (mirror space station set sans lagrange)
    const serviceFlags = {
      has_refinery: /\brefinery\b/.test(s),
      has_cargo_center: /\bcargo\s*center\b/.test(s),
      has_clinic: /\bclinic\b|\bmed\b/.test(s),
      has_food: /\bfood\b|\bbar\b|\bcafe\b/.test(s),
      has_shops: /\bshops?\b|\bstores?\b/.test(s),
      has_refuel: /\brefuel\b/.test(s),
      has_repair: /\brepair\b/.test(s),
      has_habitation: /\bhabit(ation|s)?\b|\bhab(s)?\b/.test(s),
      has_trade_terminal: /\btrade\s*terminal\b|\bterminal\b/.test(s),
      has_gravity: /\bgravity\b/.test(s),
      has_loading_dock: /\bloading\s*dock\b/.test(s),
      has_docking_port: /\bdocking\s*port\b/.test(s),
      has_freight_elevator: /\bfreight\s*elevator\b/.test(s),
    };
    const policyFlags = {
      is_monitored: /\bmonitored\b/.test(s),
      is_armistice: /\barmistice\b/.test(s),
      is_landable: /\blandable\b|\bland\b/.test(s),
      is_decommissioned: /\bdecommissioned\b/.test(s),
    };
    const live_only = /(live|available\s+in\s+live)/.test(s) || undefined;
    const visible_only = /\bvisible\b/.test(s) || undefined;
    const default_only = /\bdefault\b/.test(s) || undefined;

    if (/\b(list|which|show)\b/.test(s) || (!outpost_name && /(available|visible|default|outposts?)/.test(s))) {
      return { intent: 'outpost.list', confidence: 0.85, filters: { outpost_name, location_name, live_only, visible_only, default_only, ...serviceFlags, ...policyFlags } };
    }
    if (/\b(available|status|live|visible|default|monitored|armistice|landable|decommissioned)\b/.test(s) && outpost_name) {
      return { intent: 'outpost.availability', confidence: 0.85, filters: { outpost_name } };
    }
    if (/\b(has|services?|features?)\b/.test(s) || Object.values(serviceFlags).some(Boolean)) {
      return { intent: 'outpost.features', confidence: 0.8, filters: { outpost_name, location_name, ...serviceFlags } };
    }
    if (/\b(search|find)\b/.test(s)) {
      const q = outpost_name || (s.replace(/.*\b(search|find)\b/i, '').trim() || null);
      return { intent: 'outpost.search', confidence: 0.75, filters: { query: q, location_name } };
    }
    if (/\b(changes?|updated|modified|added|recent)\b/.test(s)) {
      return { intent: 'outpost.changes', confidence: 0.75, filters: { ...parseTimeframe(s) } };
    }
    if (/\bdefault\b/.test(s)) {
      return { intent: 'outpost.default', confidence: 0.75, filters: {} };
    }
    if (/\bfaction\b/.test(s)) {
      return { intent: 'outpost.faction', confidence: 0.75, filters: { outpost_name } };
    }
    if (/\bjurisdiction\b/.test(s)) {
      return { intent: 'outpost.jurisdiction', confidence: 0.75, filters: { outpost_name } };
    }
    if (outpost_name) {
      return { intent: 'outpost.info', confidence: 0.75, filters: { outpost_name } };
    }
  }
  // Dogfighting (pilotry, loadouts, equipment, strategies)
  const dogfightCue = /(\bdogfight\b|\bpvp\b|\bvtol\b|\bspace\s*pvp\b|\bpilotry\b|\bpiloting\b|\bflight\b|\bflying\b|\baim\b|\bpip\b|\bdecouple\b|\bstrafe\b|\bjoust\b|\bduel\b|\bace\b|\bintercept\b|\bloadouts?\b|\boutfits?\b|\bequipment\b|\bcomponents?\b|\bmeta\b|\bstrat|\btactic|\btraining\b)/;
  if (dogfightCue.test(s)) {
    // Try to extract a simple ship name phrase e.g. "for my Gladius” or “Arrow loadout”
    const shipFromFor = (s.match(/(?:for|on|in)\s+(?:the|my|an|a)?\s*([a-z0-9\-\' ]{3,30})\b/) || [])[1] || null;
    const shipFromBare = (s.match(/\b([a-z][a-z0-9\-\' ]{2,30})\s+(?:loadouts?|outfits?|fit|build|setup)/) || [])[1] || null;
    const ship_name = (shipFromBare || shipFromFor || '').trim() || null;

    // Equipment / loadout oriented
    if (/(\bloadouts?|outfits?|fit|build|setup\b|\bguns?\b|\bcannons?\b|\brepeaters?\b|\bballistic\b|\blaser\b|\bdisto|\bdistortion\b|\bgimbal|\bgimballed\b|\bfixed\b|\bshield\b|\bpower\b|\bcoolers?\b|\bcomponents?\b)/.test(s)) {
      return { intent: 'dogfighting.equipment', confidence: 0.8, filters: { ship_name } };
    }
    // Which/best ship queries or ship vs ship matchups
    if (/(\bbest\b|\bwhich\b|\bwhat\b).*\b(ship|fighter)\b/.test(s) || /\bvs\.?\b/.test(s)) {
      return { intent: 'dogfighting.ships', confidence: 0.75, filters: { ship_name } };
    }
    // Meta
    if (/\bmeta\b/.test(s)) {
      return { intent: 'dogfighting.meta', confidence: 0.8, filters: { ship_name } };
    }
    // Training / piloting fundamentals
    if (/(\btraining\b|\bpractice\b|\blearn\b|\bhow\s+to\s+fly\b|\bimprove\s+(aim|pip|strafe|tracking)\b)/.test(s)) {
      return { intent: 'dogfighting.training', confidence: 0.75, filters: { ship_name } };
    }
    return { intent: 'dogfighting.strategies', confidence: 0.75, filters: { ship_name } };
  }
  // User-focused
  if (/<@!?\d+>/.test(text) || /\buser\b|\bmember\b|\bstats\b/.test(s)) {
    const m = text.match(/<@!?(\d+)>/);
    const owner_id = m ? m[1] : null;
    if (/\bstats?\b/.test(s)) return { intent: 'user.stats', confidence: 0.7, filters: { owner_id, ...parseTimeframe(s) } };
    if (/\b(activity|did|doing)\b/.test(s)) return { intent: 'user.activity', confidence: 0.7, filters: { owner_id, ...parseTimeframe(s) } };
    return { intent: 'user.opinion', confidence: 0.6, filters: { owner_id } };
  }
  // Banter: short, casual, emoji/laughter/greetings without strong question cues
  const isShort = s.length <= 120;
  const hasLaugh = /(\blol\b|\blmao\b|\brofl\b|haha|hehe|lmao|lmfao|xd)/.test(s);
  const hasGreeting = /(\bhey\b|\bhi\b|\byo\b|\bsup\b|\bhiya\b|\bgm\b|\bgn\b|\bgg\b)/.test(s);
  const hasCustomEmoji = /<a?:\w+:\d+>|:\w+:/i.test(text || '');
  const hasUnicodeEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text || '');
  const hasQuestion = /\?/.test(s);
  if ((isShort && (hasLaugh || hasGreeting || hasCustomEmoji || hasUnicodeEmoji)) && !hasQuestion) {
    return { intent: 'chat.banter', confidence: 0.8, filters: {} };
  }
  // Small-talk question like "how are you" should be treated as banter, not info-seeking
  const smallTalkQ = /(how\s*(are|r)\s*(you|ya|y’all|yall)|how\s*('?s| is)\s*(it|it going|things|everything)|how\s*(you|ya)\s*(doing|doin')|how\s*are\s*we\s*doing|how\s*are\s*you\s*handling\s*(today|tonight|this))/i;
  if (smallTalkQ.test(s)) {
    return { intent: 'chat.banter', confidence: 0.85, filters: {} };
  }
  // Thanks / Apologies / Farewells
  if (/(^|\b)(thanks|thank\s*you|ty|thx|appreciate\s*it|much\s*appreciated)(\b|!|\.)/i.test(s)) {
    return { intent: 'chat.banter', confidence: 0.85, filters: { kind: 'thanks' } };
  }
  if (/(^|\b)(sorry|my\s*bad|oops|whoops)(\b|!|\.)/i.test(s)) {
    return { intent: 'chat.banter', confidence: 0.85, filters: { kind: 'apology' } };
  }
  if (/(^|\b)(bye|good\s*night|goodnight|gn|good\s*morning|gm|good\s*evening|ge|cya|see\s*ya|later|l8r|brb|gtg|g2g)(\b|!|\.)/i.test(s) && !hasQuestion) {
    return { intent: 'chat.banter', confidence: 0.85, filters: { kind: 'farewell' } };
  }
  // Jokes / persona queries / preferences (off-topic, conversational)
  if (/(tell\s*me\s*a\s*joke|make\s*me\s*laugh|another\s*joke|got\s*jokes?)/i.test(s)) {
    return { intent: 'chat.banter', confidence: 0.85, filters: { kind: 'joke' } };
  }
  if (/(who\s*are\s*you|what\s*are\s*you|are\s*you\s*(alive|real)|do\s*you\s*sleep|do\s*you\s*eat)/i.test(s)) {
    return { intent: 'chat.banter', confidence: 0.85, filters: { kind: 'persona' } };
  }
  if (/(what\s*(is|\'s)\s*your\s*favo(u)?rite|do\s*you\s*like|what\s*do\s*you\s*think\s*about)/i.test(s)) {
    return { intent: 'chat.banter', confidence: 0.8, filters: { kind: 'preferences' } };
  }
  // Roasts / light insults / banter between users (keep it non-toxic on response)
  const roastCue = /(noob|trash|garbage|skill\s*issue|git\s*gud|cope|seethe|mald|ratio\b|cry\s*about\s*it|you\s*suck|loser|clown|bozo|npc\b|ez\b|u\s*mad)/i;
  if (roastCue.test(s)) {
    return { intent: 'chat.banter', confidence: 0.85, filters: { kind: 'roast' } };
  }
  // General off-topic small questions (weather/life/day) that aren’t SC queries
  if (/(how\s*('s|is)\s*(life|your\s*day)|hows\s*your\s*day|how\s*was\s*your\s*day|what\s*'s\s*up|what\s*are\s*you\s*up\s*to|wyd\b|wya\b|weather\b)/i.test(s)) {
    return { intent: 'chat.banter', confidence: 0.8, filters: {} };
  }
  if (/(what\s+has\s+everyone\s+been\s+doing|recent\s+activity|what\'s\s+been\s+going\s+on)/.test(s)) {
    return { intent: 'chat.recent', confidence: 0.8, filters: {} };
  }
  // If it looks like a casual/general question but doesn’t match domain intents, treat as banter
  if (hasQuestion && !isPiracy && !mentionsStarSystem && !mentionsSpaceStation && !mentionsPlanet && !mentionsOutpost && !dogfightCue.test(s)) {
    // Avoid promoting broad general.info for off-topic chatter
    if (/(life|day|feeling|feelings|age|name|from|where\s*are\s*you|favorite|joke|sleep|eat|robot|ai|bot)/i.test(s)) {
      return { intent: 'chat.banter', confidence: 0.7, filters: {} };
    }
  }
  if (/[?]/.test(s) || /(what|how|why|where|when|who|rules?|policy)/.test(s)) {
    return { intent: 'general.info', confidence: 0.6, filters: {} };
  }
  return { intent: 'other', confidence: 0.5, filters: {} };
}

async function llmRouteIntent(openai, model, text) {
  if (!openai || !model) return null;
  const system = 'You are an intent router for a Discord bot. Classify the user message into one of a small set of intents and extract simple filters. Output ONLY compact JSON matching the schema. Keep it strict and avoid extra fields.';
  const schema = {
    intent: 'one of: ' + SAFE_INTENTS.join(', '),
    confidence: '0.0..1.0',
    filters: {
      patch: 'optional string like 3.23 or 3.23.1',
      owner_name: 'optional string',
      owner_id: 'optional string',
      hit_id: 'optional string or number',
  timeframe: 'optional string (today|yesterday|this week|last week|this month|last month)',
      date_start: 'optional ISO date YYYY-MM-DD',
      date_end: 'optional ISO date YYYY-MM-DD',
      keywords: 'optional array of strings',
      metric: 'for piracy.stats: count|total_value|max_value|min_value|avg_value',
      group_by: 'for piracy.stats: day|week|patch|owner',
  item_name: 'for item.buy/sell: commodity/item name',
  location_name: 'for market/location: place, station, or area name',
  ship_name: 'for dogfighting.equipment/strategies/meta: ship name',
  opponent_ship: 'for dogfighting: opponent ship type (optional)',
  // Star systems
  system_name: 'for starsystem.*: system name (e.g., Pyro, Stanton)',
  system_code: 'for starsystem.*: system code if provided',
  live_only: 'for starsystem.list: boolean to filter only live-available systems',
  visible_only: 'for starsystem.list: boolean to filter only visible systems',
  default_only: 'for starsystem.list: boolean to filter only default systems',
  query: 'for starsystem.search: free-text search query',
  // Space stations
  station_name: 'for spacestation.*: station name (e.g., Grim Hex, Port Olisar)',
  has_refinery: 'for spacestation.list/features: boolean filter',
  has_cargo_center: 'for spacestation.list/features: boolean filter',
  has_clinic: 'for spacestation.list/features: boolean filter',
  has_food: 'for spacestation.list/features: boolean filter',
  has_shops: 'for spacestation.list/features: boolean filter',
  has_refuel: 'for spacestation.list/features: boolean filter',
  has_repair: 'for spacestation.list/features: boolean filter',
  has_habitation: 'for spacestation.list/features: boolean filter',
  has_trade_terminal: 'for spacestation.list/features: boolean filter',
  is_monitored: 'for spacestation.list: boolean filter',
  is_armistice: 'for spacestation.list: boolean filter',
  is_landable: 'for spacestation.list: boolean filter',
  is_decommissioned: 'for spacestation.list: boolean filter',
  is_lagrange: 'for spacestation.list: boolean filter',
  // Planets
  planet_name: 'for planet.*: planet name (e.g., Hurston, microTech, Crusader, ArcCorp)',
  planet_code: 'for planet.*: planet code if provided',
  system_name: 'for planet.*: star system name filter',
  // Outposts
  outpost_name: 'for outpost.*: outpost name',
  // Outpost flags and services
  has_refinery: 'for outpost.list/features: boolean filter',
  has_cargo_center: 'for outpost.list/features: boolean filter',
  has_clinic: 'for outpost.list/features: boolean filter',
  has_food: 'for outpost.list/features: boolean filter',
  has_shops: 'for outpost.list/features: boolean filter',
  has_refuel: 'for outpost.list/features: boolean filter',
  has_repair: 'for outpost.list/features: boolean filter',
  has_habitation: 'for outpost.list/features: boolean filter',
  has_trade_terminal: 'for outpost.list/features: boolean filter',
  is_monitored: 'for outpost.list: boolean filter',
  is_armistice: 'for outpost.list: boolean filter',
  is_landable: 'for outpost.list: boolean filter',
  is_decommissioned: 'for outpost.list: boolean filter',
    },
  };
  const user = `Message: ${text}\n\nReturn JSON only with fields: { intent, confidence, filters }.`;
  try {
    if (openai?.responses?.create) {
      const res = await openai.responses.create({
        model,
        input: [
          { role: 'system', content: [{ type: 'text', text: system }] },
          { role: 'user', content: [{ type: 'text', text: `Allowed intents: ${SAFE_INTENTS.join(', ')}` }] },
          { role: 'user', content: [{ type: 'text', text: `Schema: ${JSON.stringify(schema)}` }] },
          { role: 'user', content: [{ type: 'text', text: user }] },
        ],
      });
      const out = res.output_text?.trim?.() || '';
      try { return JSON.parse(out); } catch { return null; }
    }
    if (openai?.chat?.completions?.create) {
      const resp = await openai.chat.completions.create({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Allowed intents: ${SAFE_INTENTS.join(', ')}` },
          { role: 'user', content: `Schema: ${JSON.stringify(schema)}` },
          { role: 'user', content: user },
        ],
      });
      const out = resp.choices?.[0]?.message?.content?.trim() || '';
      try { return JSON.parse(out); } catch { return null; }
    }
    return null;
  } catch (e) {
    console.error('llmRouteIntent error:', e?.response?.data || e?.message || e);
    return null;
  }
}

async function routeIntent(openai, text) {
  const heuristic = quickHeuristic(text);
  // If high enough confidence, skip LLM for speed
  if (heuristic.confidence >= 0.9) return heuristic;
  try {
    const model = process.env.KNOWLEDGE_AI_MODEL || 'gpt-4o-mini';
    const llm = await llmRouteIntent(openai, model, text);
    if (llm && SAFE_INTENTS.includes(llm.intent)) return llm;
  } catch (e) {}
  return heuristic;
}

module.exports = {
  SAFE_INTENTS,
  routeIntent,
};
