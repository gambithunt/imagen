# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## When working

Always make a list to keep track of where you are.

## Development Commands

### Frontend (Svelte 5 + TailwindCSS)

```bash
cd frontend
npm install
npm run dev          # Start dev server on port 3002
npm run build        # Build for production
npm run preview      # Preview production build
npm run check        # Type checking and validation
npm run check:watch  # Continuous type checking
```

### Backend (Node.js + Express)

```bash
cd backend
npm install
npm run dev          # Start with nodemon (auto-restart)
npm start           # Start production server on port 3000
```

### Full Stack Development

```bash
# From project root - runs both frontend and backend concurrently
npm run dev:all
```

## Architecture Overview

### Project Structure

- **Monorepo**: Root package.json orchestrates frontend/backend development
- **Frontend**: SvelteKit application in `frontend/` directory
- **Backend**: Express.js API server in `backend/` directory
- **Docs**: Comprehensive documentation in `docs/` directory

### Frontend Architecture (SvelteKit)

- **Framework**: Svelte 5 with SvelteKit for routing and SSR
- **Styling**: TailwindCSS for all UI components
- **Type Safety**: TypeScript throughout with strict type checking
- **Key Directories**:
  - `src/routes/` - Page components and routing
  - `src/lib/` - Reusable components and utilities
  - `src/lib/video/` - Video-specific components and logic

### Backend Architecture (Express.js)

- **Framework**: Express.js with CORS enabled
- **Image Generation**: Google Imagen and Stability AI integrations
- **Video Processing**: RunwayML API integration via `/routes/video.js`
- **Storage**: Dual storage system (local disk + Cloudflare R2)
- **Key Features**:
  - Session-based image/video tracking
  - Gallery API for browsing generated content
  - Proxy endpoints for secure media streaming

### Data Flow

1. **Generation**: Frontend forms → Backend API → External AI services
2. **Storage**: Generated content saved locally + R2 with session metadata
3. **Gallery**: Session-based organization with signed URL access
4. **Video Reference**: Images can be used as video generation inputs

## Key Technical Details

### Environment Configuration

- **Frontend Proxy**: Configurable via `VITE_API_PROXY_PATH` and `VITE_API_TARGET`
- **Backend Storage**: Feature flag `ENABLE_LOCAL_STORAGE` controls disk writes
- **API Keys**: `GOOGLE_API_KEY`, `STABILITY_API_KEY`, R2 credentials required

### Video Model Resolution Mapping

- Model-specific resolution sets defined in `frontend/src/lib/video/VideoForm.svelte`
- Prevents invalid resolution/model combinations
- Automatically updates UI when model selection changes

### Storage Strategy

- **Dual Storage**: Local disk (development) + Cloudflare R2 (production)
- **Session Structure**: Each generation creates a session with metadata and assets
- **Gallery Organization**: Sessions grouped by model type and generation date
- **URL Strategy**: Signed URLs for secure R2 access, local URLs for development

### Type Definitions

- Shared types in `frontend/src/lib/types.ts`
- Strong typing for gallery items, video sessions, and API responses
- Discriminated unions for different content types (image/video)

## Development Workflow

### Adding New Image Generation Models

1. Add endpoint in `backend/index.js` following existing patterns
2. Update gallery categories mapping
3. Add UI controls in appropriate frontend components
4. Test with both local and R2 storage configurations

### Adding New Video Models

1. Update `MODEL_RESOLUTIONS` in `VideoForm.svelte`
2. Add model to backend video routes if needed
3. Test resolution validation and form behavior
4. Update documentation in `docs/video-resolutions.md`

### Gallery Feature Development

- Sessions automatically created for all generations
- Gallery API supports both image and video content types
- Deletion endpoints handle both local and R2 cleanup
- Reference image flow connects gallery to video generation

## Testing and Validation

### Type Checking

```bash
cd frontend && npm run check
```

### Development Server Testing

- Frontend: http://localhost:3002
- Backend: http://localhost:3000
- API proxy automatically configured during development

### Gallery Reference Flow Testing

1. Generate images through any model
2. Navigate to `/gallery`
3. Click image → modal → "Use as Video Ref"
4. Verify navigation to `/video` with reference image loaded

### Code editing rules

Write code for clarity first. Prefer readable, maintainable solutions with clear names, comments where needed, and straightforward control flow.
Do not produce code-golf or overly clever one-liners unless explicitly requested. Use high verbosity for writing co

### guiding_principles

- Clarity and Reuse: Every component and page should be modular and reusable. Avoid duplication by factoring repeated UI patterns into components.
- Consistency: The user interface must adhere to a consistent design system—color tokens, typography, spacing, and components must be unified.
- Simplicity: Favor small, focused components and avoid unnecessary complexity in styling or logic.
- Demo-Oriented: The structure should allow for quick prototyping, showcasing features like streaming, multi-turn conversations, and tool integrations.
- Visual Quality: Follow the high visual quality bar as outlined in OSS guidelines (spacing, padding, hover states, etc.)
