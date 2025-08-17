// Build lightweight context for the Responses API

function formatLine(msg) {
  const name = msg.member?.nickname || msg.author?.username || 'unknown';
  // Keep markdown; trim to avoid ultra-long lines
  const content = (msg.content || '').slice(0, 800);
  return `${name}: ${content}`;
}

/**
 * Returns a short snippet of recent messages, preferably since the last bot message.
 * Falls back to the last N messages if no bot message is found in fetch window.
 */
async function buildRecentConversationSnippet(message, { window = 30, maxLines = 12 } = {}) {
    //can I replace the message retrieval from discord with a retrieval from the bot?
  try {
    const channel = message.channel;
    const fetched = await channel.messages.fetch({ limit: Math.min(window, 100) });
    // oldest -> newest
    const msgs = Array.from(fetched.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const botId = message.client.user.id;
    let startIdx = msgs.length - 1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].author?.id === botId) { startIdx = i + 1; break; }
    }

    const slice = msgs.slice(Math.max(0, startIdx), msgs.length);
    const lines = slice.map(formatLine).filter(Boolean).slice(-maxLines);
    if (!lines.length) return '';
    return `Recent conversation since last bot message:\n` + lines.join('\n');
  } catch (e) {
    console.error('buildRecentConversationSnippet error:', e);
    return '';
  }
}

module.exports = {
  buildRecentConversationSnippet,
};

// ---- Recent activity snapshot (participants + topics) ----
const STOPWORDS = new Set(['the','a','an','and','or','but','if','then','else','on','in','at','to','for','of','with','by','is','are','was','were','be','been','it','this','that','these','those','you','i','we','they','he','she','them','us','our','your','yours','from','as','so','not','do','did','does','have','has','had','my','me','too','very','just','also','can','could','should','would','will','won\'t','can\'t','don\'t','im','i\'m','u','ya','lol']);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t && t.length > 2 && !STOPWORDS.has(t));
}

async function buildRecentActivitySnapshot(message, { window = 100, maxTopics = 8 } = {}) {
  try {
    const channel = message.channel;
    const fetched = await channel.messages.fetch({ limit: Math.min(window, 100) });
    const msgs = Array.from(fetched.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const users = new Set();
    const freq = new Map();
    let count = 0;
    for (const m of msgs) {
      if (m.system || m.author?.bot) continue;
      count++;
      const name = m.member?.nickname || m.author?.username || 'unknown';
      users.add(name);
      for (const t of tokenize(m.content)) freq.set(t, (freq.get(t) || 0) + 1);
    }
    const participants = Array.from(users).slice(-15);
    const topics = Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]).slice(0, maxTopics).map(([k])=>k);
    if (!count) return '';
    const header = `Recent activity snapshot (last ${count} messages, non-bot):`;
    const parts = [];
    parts.push(header);
    if (participants.length) parts.push(`Participants (${participants.length}): ${participants.join(', ')}`);
    if (topics.length) parts.push(`Topics: ${topics.join(', ')}`);
    return parts.join('\n');
  } catch (e) {
    console.error('buildRecentActivitySnapshot error:', e);
    return '';
  }
}

module.exports.buildRecentActivitySnapshot = buildRecentActivitySnapshot;
