# Security & Privacy

This document outlines core security considerations: secrets management, access control, data privacy, and recommended hardening steps.

## Secrets Management
| Secret | Location | Notes |
|--------|----------|-------|
| Discord Bot Token (`CLIENT_TOKEN` / `TEST_CLIENT_TOKEN`) | `.env` | Never commit; rotate on suspected leakage. |
| OpenAI API Key (`OPENAI_API_KEY`) | `.env` | Scope usage to required models only. |
| Org API Key (`ORG_API_KEY`) | `.env` / DM distribution | Provide minimal privileges; audit usage. |
| Vector Store ID (`VECTOR_STORE`) | `.env` | Non-sensitive but treat as internal. |

Recommendations:
- Provide a `.env.example` for developers without actual secrets.
- Rotate tokens quarterly or after team changes.
- Consider using a secret manager (Vault, AWS SSM) in production.

## Access Control
- Role-based gating for moderator/admin commands using `MODERATOR_ROLES`, `ADMIN_ROLES` lists.
- Prestige roles (RAPTOR/CORSAIR/RAIDER) feed ranking logic; ensure only authorized promotions.
- Event creation restricted by `RONIN_ROLE` and similar gating.

## HTTP Endpoints
- Current endpoints lack authentication; rely on network isolation.
- Recommendation: Add HMAC or Bearer token check middleware (e.g., `X-Org-Signature` or `Authorization: Bearer <token>`).
- Rate limit externally (API gateway) to mitigate abuse.

## Data Privacy
- Vector embeddings of chat messages can persist user content; maintain retention limits (`CHAT_VECTOR_MAX`).
- Avoid ingesting highly sensitive channels; restrict `CHANNELS` set.
- Consider adding a profanity/PPI filter before embedding.

## Logging & Audit
- Enable `DEBUG_*` flags only in test environments or short investigative windows.
- Add structured moderation action logs to `AUDIT_CHANNEL` (already used for removals).
- Suggested: Write command usage metrics to DB for auditing high-risk actions (e.g., deletion, award grant).

## Least Privilege
- Discord bot should have only necessary permissions (avoid Administrator). Required: manage threads, read/send messages, embed links.
- Database user: principle of least privilege (limit to specific schemas).

## Transport & Network
- Use HTTPS for any external backend that calls the bot’s API.
- Restrict inbound firewall rules to known backend IP ranges.

## Threat Scenarios & Mitigations
| Threat | Vector | Mitigation |
|--------|--------|-----------|
| Token Leak | Public repo / logs | Use env only, rotate immediately, revoke old token. |
| Unauthorized API Call | Open port exposed | Add auth middleware; restrict network access. |
| Prompt Injection | Malicious user messages | Sanitize retrieval context; cap message length; detect known attack patterns. |
| Data Exfil via Embeddings | Sensitive text embedded | Implement content filter & opt-out channels. |
| Stale Lock Denial | Lock file persists after crash | Startup reclaim logic already present; manual deletion fallback. |
| Rate Limit Exhaustion | High-frequency embeddings | Concurrency cap (`INGEST_CONCURRENCY`), add backoff. |

## Hardening Roadmap
1. Authentication layer for Express endpoints.
2. Add environment validation (schema + required secret checks on boot).
3. Implement content filtering pre-embedding.
4. Structured audit log (JSON) pushed to secure storage.
5. Automated secret rotation pipeline.
6. Role-based permission matrix documented & enforced via config file.

## Incident Response
1. Identify scope (which secrets / channels affected).
2. Rotate affected secrets; invalidate sessions.
3. Temporarily disable live ingestion flags.
4. Review audit channel + logs for anomalous command usage.
5. Restore from backups if data corruption detected.

## Compliance Considerations
- If storing personal data (user IDs, usernames) ensure retention adheres to organizational policies.
- Provide a user data deletion path (command or admin tool) for compliance if required.

