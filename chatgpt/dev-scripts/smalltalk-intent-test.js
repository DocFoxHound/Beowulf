const { routeIntent } = require('../intent-router');

(async () => {
  const samples = [
    "how are you handling today?",
    "How are you doing?",
    "hey there",
    "what's the best place to sell laranite?",
    "lol you trash",
    "git gud @User",
    "thanks!",
    "sorry about that",
    "good night everyone",
    "tell me a joke",
    "who are you?",
    "what's your favorite movie?",
    "do you sleep?",
    "what do you think about pizza?",
    "wyd bro",
  ];
  for (const s of samples) {
    const routed = await routeIntent(null, s);
    console.log(JSON.stringify({ input: s, routed }, null, 2));
  }
})();
