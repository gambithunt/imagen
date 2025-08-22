---
applyTo: "**"
---

When changes are made to the codebase that significantly change the way things work, document it in the ./docs folder.
Create a README file that provides an overview of that part of the code base.
For example:
backend.md
frontend.md
gallery-page.md

Update the docs as changes are made and make sure that they are always current to the code base.

- Use Markdown **only where semantically correct** (e.g., `inline code`, `code fences`, lists, tables).
- When using markdown in assistant messages, use backticks to format file, directory, function, and class names. Use \( and \) for inline math, \[ and \] for block math.
