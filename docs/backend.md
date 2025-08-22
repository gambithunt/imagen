# Backend Documentation

The backend is implemented in **Node.js** using **Express.js** for all server-side logic.

## Structure

- All backend code is located in the `backend/` directory.
- Only JavaScript (Node.js) is used for backend components.
- Express.js is the primary framework for API endpoints and server logic.

## Key Endpoints

- `/api/generate` — Handles Google Imagen image generation and saves images to the correct directory.
- `/api/sd/core`, `/api/sd/ultra`, `/api/sd/xl` — Handle Stable Diffusion image generation for different models.

## Image Saving

- Images are saved to `/generated/` subdirectories based on the model used.
- Filenames are generated from the prompt (first two words) and a random number.

## Adding New Endpoints

- Use Express.js route handlers in `backend/index.js`.
- Follow the pattern of existing endpoints for new model integrations.

## Environment Variables

- `GOOGLE_API_KEY` — Google Imagen API key
- `STABILITY_API_KEY` — Stability AI API key

## Running the Backend

```sh
cd backend
npm install
node index.js
```
