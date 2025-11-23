1. Diagnose the problem
Right now your flow is roughly:
user text → intent classifier → “this is ship info” → feed ship list → GPT answers
That’s brittle because:
•	“What is a Pontes?” is too short → classifier overgeneralizes to “ship talk”.
•	Once you’ve forced it into the ship lane, there is no way for GPT to discover it’s actually a component.
So the fix isn’t “more data in the prompt”; it’s changing when and how you decide what data to fetch.
________________________________________
2. Use an entity catalog instead of per-dataset guesses
Instead of guessing “ships vs items vs locations” first, build a unified catalog of Star Citizen entities:
Table: game_entities
•	id
•	name ("Pontes")
•	aliases[] (["Pontes QD", "Pontes quantum drive"])
•	type ("ship" | "component" | "weapon" | "location" | "manufacturer" | ...)
•	subcategory (optional: "quantum_drive", "cooler", "fighter", etc.)
•	short_description
•	tags[]
•	vector (embedding of name + description)
•	plus whatever metadata you need
Then your pipeline becomes:
1.	User: “What is a Pontes?”
2.	Entity lookup tool (searches game_entities across all types, not just ships)
3.	Tool returns: best match = Pontes, type=component, subcategory=quantum_drive
4.	Now you know:
o	It’s a component, not a ship
o	Which detailed dataset/table to load (components table, item docs, etc.)
5.	Then you build context and call GPT to explain it.
In other words:
Don’t route by intent alone. Route by an actual lookup in your canonical entity index.
________________________________________
3. Use tools / function calling for entity resolution
Instead of trying to teach GPT a massive noun list, give it a tool like:
{
  "name": "search_game_entities",
  "description": "Search Star Citizen entities by name or description.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "top_k": { "type": "integer", "default": 5 }
    },
    "required": ["query"]
  }
}
The handler:
•	Runs a vector search on game_entities (and maybe a fuzzy text match).
•	Returns an array of {name, type, subcategory, id, score}.
Then your main model flow for game questions becomes:
1.	Classifier: “Is this about Star Citizen at all?” (yes/no/general)
2.	If yes → GPT is allowed to call search_game_entities.
3.	GPT gets back: “Pontes → component (quantum drive)”
4.	Your orchestrator then:
o	Fetches the right details from the components dataset.
o	Builds a small “Knowledge” block.
o	Calls GPT again: “Explain what this is, using the knowledge block.”
No giant noun list in the prompt, no fine-tuning: all the knowledge lives in your DB + retrieval.
________________________________________
4. RAG across everything, then filter
A slightly different but complementary approach:
•	Instead of: intent → choose dataset → search only there
•	Do: query → search across all SC docs/entities → let similarity decide.
So “Pontes” would retrieve chunks from:
•	entities where name≈Pontes (component)
•	“component reference manual” chunks mentioning Pontes
•	Maybe ship loadout docs where Pontes is listed
You label each chunk with type metadata. For example:
{
  "source": "entity",
  "entity_type": "component",
  "name": "Pontes",
  "text": "The Pontes is a size X quantum drive ...",
}
Then either:
•	You let GPT see the top K snippets (ships + components) and ask it:
“Based on these snippets, what does ‘Pontes’ most likely refer to?”
•	Or you do a tiny second pass where GPT picks the best snippet before generating the answer.
Again, the model is not guessing from scratch; it’s choosing among retrieved options.
________________________________________
5. Fixing your existing intent logic without ripping it apart
You don’t have to throw away your current intents. Just:
A. Add a “game_entity_lookup” step before hard routing
Current:
user → intent: “ships_info” → ship dataset
Improved:
user → intent: “star_citizen_game_data” →
→ search_game_entities(query) →
→ check top result type:
•	if type=ship → ship dataset
•	if type=component → item dataset
•	else → broader knowledge RAG
B. Allow ambiguous / fallback answers
If your lookup finds multiple plausible categories:
•	Return them all to GPT and let it answer like:
“I couldn’t find a ship named Pontes, but there is a quantum drive called Pontes. Here’s what it is…”
This alone makes the bot feel way smarter and more honest.
________________________________________
6. Why not a huge “noun list in the prompt” or fine-tuning?
•	Big noun list in prompt
o	Extremely token-hungry.
o	Hard to maintain.
o	Still ambiguous: GPT has to reason over a wall of text each time.
•	Fine-tuning
o	Good for style / formatting / special reasoning patterns.
o	Not good as a primary “database” for fast-changing or huge game content.
o	Updating it as the game changes is painful and expensive.
The scalable pattern is:
External knowledge base + retrieval + small, focused context per query.
________________________________________
7. Concrete “do this next” checklist
Here’s how I’d iterate your current system:
1.	Create a game_entities table
o	name, aliases, type, subcategory, description, tags, vector
2.	Write a search_game_entities tool
o	Input: query string
o	Behavior: hybrid text + vector search across all entities, return top K
3.	Update orchestrator
o	For any Star Citizen–ish intent, first call search_game_entities
o	Use result type to choose which dataset to query next
4.	Update knowledge retrieval
o	Optionally, add a second RAG step for detailed docs about that entity type
5.	Add a fallback rule
o	If no strong entity match, don’t force a ship answer
o	Let GPT say “I couldn’t find that in the database; here’s my best guess or how you might check in-game”

