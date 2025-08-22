# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project in the current directory
npx sv create

# create a new project in my-app
npx sv create my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Quick test: Gallery -> Video reference flow

To test the 'Use as Video Ref' flow which sends an image from the gallery to the video creation page:

1. Start the backend and frontend dev servers:

```sh
# backend
cd backend
npm install
npm run dev

# frontend
cd frontend
npm install
npm run dev
```

2. Open the app in your browser and navigate to `/gallery`.
3. Click any gallery image to open the modal.
4. Click `Use as Video Ref`.

What happens:

- The gallery code will request a signed URL for R2-hosted images (1 hour) and then navigate to `/video?ref=<signed-url>`.
- The video page reads the `ref` query parameter, obtains a signed URL if necessary, and sets the preview image to that URL so you can immediately submit the video form.

Notes:

- The backend endpoint `/api/video/sign` is used to obtain signed R2 URLs when required.
- If you still see no preview, ensure the backend is running and R2 credentials are configured so signed URLs can be issued.
