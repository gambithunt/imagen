# Video model resolutions

This document explains how to add or update model-specific resolution sets used by the video creation UI.

Location

- The model -> resolutions mapping currently lives inside `frontend/src/lib/video/VideoForm.svelte` as `MODEL_RESOLUTIONS`.

Why this mapping exists

- Different RunwayML model families support different output video resolutions (aspect ratios). The video form only exposes valid resolution choices for the selected model to prevent user errors and invalid requests.

Format

- Resolutions are strings with the format `WIDTH:HEIGHT`, e.g. `1280:720`.
- The mapping value is an array of those strings in the order you want them displayed.

Example mapping

```ts
const MODEL_RESOLUTIONS: Record<string, string[]> = {
  // gen4 family (landscape and portrait)
  gen4_turbo: ["1280:720", "720:1280"],
  gen4_aleph: ["1280:720", "720:1280"],

  // gen3a supports 768:1280 and 1280:768
  gen3a_turbo: ["768:1280", "1280:768"],
};
```

How to add a new model

1. Open `frontend/src/lib/video/VideoForm.svelte`.
2. Add a new entry in `MODEL_RESOLUTIONS` with the new model key and an array of allowed resolutions.
3. Ensure the `models` prop (top of the file) includes the new model if it should appear in the model dropdown.

Behaviour notes

- When the user changes the model, the component will set the `ratio` to the first allowed resolution for that model if the currently selected ratio is not valid for the new model.
- If a model is missing from `MODEL_RESOLUTIONS` the component falls back to a default set `FALLBACK_RESOLUTIONS = ["1280:720", "720:1280"]`.

Making the mapping shared (recommended)

- Currently `MODEL_RESOLUTIONS` is defined local to `VideoForm.svelte`. If other parts of the app (pages, previews) need to use the same mapping, extract the mapping into a new module, e.g. `frontend/src/lib/video/resolutions.ts` and export it. Then import it into `VideoForm.svelte` and any other consumers.

Testing

- After changes, run the frontend typecheck and dev server:

```bash
cd frontend
npm run check
npm run dev
```

If `npm run check` shows unrelated errors in other files, fix them separately — editing the resolutions mapping will not cause unrelated `+page.svelte` type errors.

Questions?

- If you want, I can extract the mapping into a shared module and update any pages that should use the same model/resolution rules.
