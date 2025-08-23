Maintain a documentation dir at ./docs

Keep this updated with docs for the backend and frontend as well as a readme file in the ./docs directory.

# frontend

Only use svelte 5 code for the frontend components.
Use primarily tailwind for all css unless a custom item is needs where tailwind is not sufficiant.
Prefer creating components rather than endlessly adding to one page.

# backend

Only use JavaScript (Node.js) for the backend components.
Use primarily Express.js for all server-side logic unless a custom solution is needed where Express is not sufficient.

# running the development server

Do not ask me to run it because it is most likely running already.

# ui

Keep all pages consistent in design and behavior.

<context_gathering>
Goal: Get enough context fast. Parallelize discovery and stop as soon as you can act.
Method:

- Start broad, then fan out to focused subqueries.
- In parallel, launch varied queries; read top hits per query. Deduplicate paths and cache; don’t repeat queries.
- Avoid over searching for context. If needed, run targeted searches in one parallel batch.
  Early stop criteria:
- You can name exact content to change.
- Top hits converge (~70%) on one area/path.
  Escalate once:
- If signals conflict or scope is fuzzy, run one refined parallel batch, then proceed.
  Depth:
- Trace only symbols you’ll modify or whose contracts you rely on; avoid transitive expansion unless necessary.
  Loop:
- Batch search → minimal plan → complete task.
- Search again only if validation fails or new unknowns appear. Prefer acting over more searching.
  Unsure: - If unsure ask specific questions that will add context quicly

Be THOROUGH when gathering information. Make sure you have the FULL picture before replying. Use additional tool calls or clarifying questions as needed.
</context_gathering>
