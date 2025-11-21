# Contributing Guide

Thanks for your interest in contributing! This guide explains how to set up your environment, coding conventions, and the PR process.

## Getting Started
- Fork and clone the repo.
- Create a `.env` from `docs/ENVIRONMENT.md` (or `.env.example` when available).
- Install dependencies: `npm install`
- Start in test mode: `npm start`

## Branching
- Use feature branches: `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`.
- Keep changes scoped and focused; split large efforts into multiple PRs.

## Coding Conventions
- Language: Node.js (CommonJS modules).
- Style: Keep consistent with nearby code; prefer meaningful names and small modules.
- Errors: Always `try/catch` in scheduled jobs; log with sufficient context.
- Env flags: Default-safe patterns like `(process.env.FLAG || 'false').toLowerCase() === 'true'`.
- Side effects: Avoid blocking operations in `messageCreate`; favor fire-and-forget with error logging.

## Documentation
- Update relevant docs in `docs/` when adding features.
- If adding new env vars, update `docs/ENVIRONMENT.md` and propose `.env.example` changes.
- Add/adjust diagrams with Mermaid where helpful.

## Testing
- Manual testing in a test guild is expected for Discord features.
- For pure modules, write lightweight unit tests (future infra) or add a small script under `scripts/` for quick checks.

## Commits & PRs
- Commit messages: concise and imperative (e.g., "add schedule RSVP update flow").
- PR description: include what/why, screenshots (embeds), and any config/env changes.
- Link issues if applicable.

## Review
- Reviews focus on correctness, clarity, resilience, and minimal blast radius.
- Expect feedback on error handling and env flag design.

## Release & Deployment
- After merging, ensure scheduled jobs and HTTP endpoints are deployed to the correct environment (test vs live) before flipping feature flags.
- Coordinate production enablement of feature flags with maintainers.

## Code of Conduct
- Be respectful and constructive. Assume positive intent and communicate clearly.

