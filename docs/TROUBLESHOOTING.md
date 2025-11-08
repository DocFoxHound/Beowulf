# Troubleshooting Guide

Common issues, symptoms, diagnostics, and resolutions.

## Index
- Startup Failures
- Discord Interaction Issues
- Market Data Problems
- Embedding / Vector Errors
- Award & Leaderboard Issues
- Schedule & RSVP Problems
- Environment Misconfiguration
- Performance & Rate Limits
- Lock File Issues

## Startup Failures
| Symptom | Cause | Resolution |
|---------|-------|-----------|
| Process exits immediately | Another instance running | Remove stale lock in `/tmp/beowulf-bot-*.lock` or disable `BOT_SINGLE_INSTANCE`. |
| Cannot login (Invalid Token) | Wrong `CLIENT_TOKEN` | Recreate bot token; update `.env`. |
| Permissions errors | Missing intents or channel perms | Enable required intents in Discord Developer Portal; adjust bot role permissions. |

## Discord Interaction Issues
| Symptom | Cause | Resolution |
|---------|-------|-----------|
| Commands not found | Slash commands not deployed | Run command deployment script (guild-specific first). |
| Bot silent on mention | Retrieval handler error | Check logs; ensure `OPENAI_API_KEY` valid and not quota-exhausted. |
| Autocomplete fails | Missing `autocomplete` export | Add function or remove autocomplete usage. |

## Market Data Problems
| Symptom | Cause | Resolution |
|---------|-------|-----------|
| Old prices returned | UEX refresh failed mid-sequence | Inspect logs; set `UEX_FRESH_LOAD_ON_START=true` and restart for full rebuild. |
| Missing location entries | Partial cache prime failure | Verify DB tables; run manual refresh sequence. |
| Fallback errors logged | `DEBUG_MARKET_FALLBACK=true` reveals issues | Check network/API connectivity; review UEX responses. |

## Embedding / Vector Errors
| Symptom | Cause | Resolution |
|---------|-------|-----------|
| Retrieval empty | Flags disabled | Enable `KNOWLEDGE_RETRIEVAL` and ingestion flags. |
| High latency responses | Large prompt assembly | Reduce ingestion volume (`CHAT_VECTOR_MAX`) or disable live ingest temporarily. |
| "Quota exceeded" logs | Rate limit / plan cap | Reduce `INGEST_CONCURRENCY`; stagger intervals; upgrade plan. |

## Award & Leaderboard Issues
| Symptom | Cause | Resolution |
|---------|-------|-----------|
| Awards not granted | Interval not running | Confirm `automatedAwards` logs hourly; inspect errors. |
| Leaderboard stale | Interval skipped due to crash | Restart bot; check `processPlayerLeaderboards` logs. |

## Schedule & RSVP Problems
| Symptom | Cause | Resolution |
|---------|-------|-----------|
| Buttons unresponsive | Channel not in allowed list | Ensure interaction channel matches event channels. |
| Wrong RSVP counts | Update handler failed | Check `/updateschedule` API calls and handler exceptions. |

## Environment Misconfiguration
| Symptom | Cause | Resolution |
|---------|-------|-----------|
| Roles not detected | Missing role IDs | Populate role env vars; verify live vs test sets. |
| User rank undefined | Incorrect prestige mapping | Confirm `userlist-controller.js` role arrays match server roles. |
| Persona generic | `BOT_INSTRUCTIONS` unset | Define concise persona instructions in env. |

## Performance & Rate Limits
| Symptom | Cause | Resolution |
|---------|-------|-----------|
| Frequent OpenAI errors | Concurrency too high | Lower `INGEST_CONCURRENCY`, batch ingest off-peak. |
| Memory growth | Excessive cache size | Reduce `CHAT_VECTOR_MAX`; consider pruning market data subsets. |
| Slow startup | Full UEX re-fetch + batch ingest | Disable fresh load and batch ingest on simultaneous boot. |

## Lock File Issues
| Symptom | Cause | Resolution |
|---------|-------|-----------|
| Bot never starts | Stale lock with active PID check failing | Manually delete lock file; ensure no other instance is running. |
| Multiple instances | `BOT_SINGLE_INSTANCE=false` | Re-enable single-instance setting in prod. |

## Diagnostic Commands (Planned)
- `/status` – Summarize last run times of intervals.
- `/refresh-market` – Manual UEX refresh (admin).
- `/ingest-chat-batch` – Force batch chat ingest.

## Log Review Tips
- Search for `Failed to` prefixes for concise error leads.
- Use `DEBUG_RETRIEVAL=true` temporarily to inspect retrieval decisions (disable afterward).

## Escalation
1. Capture logs & environment diff.
2. Reproduce in test environment.
3. File an issue with clear steps, expected vs actual outcomes, and any relevant IDs.

