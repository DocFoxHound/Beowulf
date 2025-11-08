# Operations Runbook

This runbook covers install, configuration, start/stop, deployment, monitoring, and recovery procedures.

## Prerequisites
- Node.js LTS (18+ recommended)
- PostgreSQL reachable with correct schema
- Discord bot application (token, intents configured)
- OpenAI API key

## Installation
```bash
# On first setup
git clone <repo>
cd Beowulf
npm install
```

Post-install hooks create `logs/` and `chatlogs/` directories.

## Configuration
- Copy your environment to `.env` (see `docs/ENVIRONMENT.md`).
- For test vs live, toggle `LIVE_ENVIRONMENT` to select the correct token/channels/roles.
- Optional: Create separate `.env.live` and `.env.test` and pass the file path as an argument to `node index.js <envFile>`.

## Starting the Bot
### Development
```bash
npm run start
```

### Production with PM2
PM2 is included as a dependency; here's a basic usage pattern:
```bash
# Start (test env)
pm run start &  # or use PM2 for supervision

# Using PM2 directly
npx pm2 start index.js --name beowulf --env test
# Or specify a custom env file
npx pm2 start index.js --name beowulf -- -- .env

# View logs
npx pm2 logs beowulf

# Restart / Stop
npx pm2 restart beowulf
npx pm2 stop beowulf
```

Consider a pm2 ecosystem file for multiple environments.

## Single-Instance Lock
- A lock file `beowulf-bot-<live|test>.lock` is created in the OS temp directory when `BOT_SINGLE_INSTANCE` is 'true'.
- On startup, if an existing PID is alive, the process exits to avoid duplicate bots.
- If the PID is stale, the lock is reclaimed automatically.

## Health Checks (Suggested)
- Add a `/health` endpoint summarizing last successful run of each interval.
- Current server exposes only domain endpoints; consider adding a lightweight status JSON.

## Monitoring & Logs
- Default console logs; redirect to a file or external aggregator in production.
- Recommended: structured JSON logs (future work).
- Watch for frequent errors from intervals (OpenAI/DB rate limits).

## Deployment
- `deploy.sh` and `deploy-commands.js` exist; align with your CI/CD.
- After updating commands, redeploy slash commands as needed (guild-scoped faster during testing).

## Recovery Procedures
- Bot not responding:
  1) Check PM2 or process status.
  2) Inspect logs for rate limits or token errors.
  3) Verify `.env` values (especially `CLIENT_TOKEN`, `OPENAI_API_KEY`).
  4) Remove stale lock if process crashed without cleanup: delete `beowulf-bot-*.lock` from `/tmp`.
- Market data stale:
  - Manually run UEX refresh by temporarily setting `UEX_FRESH_LOAD_ON_START=true` and restarting. Or add a manual trigger command (future).
- Vector store bloat:
  - Reduce `CHAT_VECTOR_MAX`, restart to prune on next cycle; consider implementing age-based pruning.

## Discord Permissions & Intents
- Required intents: Guilds, GuildMessages, MessageContent, GuildMembers, Presences, VoiceStates, Emojis+Stickers, DirectMessages.
- Ensure the bot role has permission to create threads, post embeds, and manage messages in target channels.

## Backups
- Schedule DB backups (nightly dumps).
- Consider exporting vector store metadata periodically (not built-in yet).

## Safe Maintenance Windows
- Prefer off-peak times to run UEX fresh loads and large batch ingests.
- Set feature flags to disable live ingest during heavy operations if necessary.

