# Frontend Documentation

The frontend is implemented using **Svelte 5** and **Tailwind CSS**.

## Structure

- All frontend code is located in the `frontend/` directory.
- Only Svelte 5 code is used for frontend components.
- Tailwind CSS is used for all styling unless a custom solution is required.
- Prefer creating reusable Svelte components over adding all logic to a single page.

## Main Files

- `src/routes/+page.svelte` — Main image generation UI and logic.
- `src/lib/` — Utility functions and shared logic.

## Adding Components

- Place new Svelte components in `src/lib/` or `src/routes/` as appropriate.
- Use Tailwind classes for styling.

## Running the Frontend

```sh
cd frontend
npm install
npm run dev
```
