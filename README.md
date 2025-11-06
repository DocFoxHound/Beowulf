# ChatGPT Assistant Discord Bot
A Discord Chat Bot that utilizes OpenAI's Assistant features.


## Hit Tracker features

- Create hits via natural language or `/hit-tracker-add`.
- Edit your hit inside its thread with simple phrases like "edit value to 14000".
- Delete your own hit via:
	- Natural language: "delete hit 123" or "remove this hit" (only the original author may delete).
	- Slash command: `/hit-tracker-remove` with autocomplete for your hits.

On deletion, the bot removes the database record but posts a red embed in the thread stating the hit was removed; the thread remains for history.

