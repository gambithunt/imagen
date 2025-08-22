This folder contains UI components and a small API client for creating videos from images using RunwayML models.

Files:

- `VideoForm.svelte` - form UI for entering prompt, model, and uploading an image.
- `VideoPreview.svelte` - shows a preview of the selected image.
- `VideoResultCard.svelte` - displays generated video results.
- `videoApi.ts` - client that posts form data to `/api/video/create` (backend stub).

Usage:

1. Start the frontend dev server (see project root `package.json`).
2. Open `/video` route.
3. Fill the form and submit. The frontend will call `/api/video/create` which should be implemented in the backend to call RunwayML.

Notes:

- This is UI-only. Backend must implement `/api/video/create` to integrate with RunwayML.
