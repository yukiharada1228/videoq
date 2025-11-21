# TalkVid Frontend

A frontend application built with Next.js, TypeScript, Tailwind CSS, and shadcn/ui.

## Overview

This frontend provides:
- User authentication (signup, login, email verification, password reset)
- Video upload and management
- Video group management with drag-and-drop reordering
- AI chat interface (RAG-enabled)
- Share link functionality
- User settings
- Internationalization (English/Japanese)

## Setup

**This project is designed to run with Docker Compose.** For setup instructions, see the root [README.md](../README.md).

### Quick Start with Docker Compose

```bash
# From project root
docker compose up --build -d

# Access frontend
# http://localhost (via Nginx reverse proxy)
```

### Local Development (Optional)

If you need to run the frontend locally without Docker:

1. **Requirements:**
   - Node.js 18+
   - npm or yarn

2. **Install dependencies:**
```bash
npm install
```

3. **Configure environment variables:**

Create a `.env.local` file:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

4. **Start development server:**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**Note:** For production and most development scenarios, Docker Compose is recommended.

## Features

- User registration and email verification (`/signup`, `/verify-email`)
- Login and logout (`/login`)
- Password reset (`/forgot-password`, `/reset-password`)
- Video upload and management (`/videos`)
- Video group management (`/videos/groups`)
- AI chat (RAG-enabled)
- Share links (`/share/[token]`)
- User settings (`/settings`) - View and update user information
- Session management via JWT
- Responsive design

## Tech

- **Next.js 16** - React framework
- **React 19** - UI library
- **TypeScript** - Type-safe development
- **Tailwind CSS 4** - Utility-first CSS
- **Radix UI** - Accessible UI primitives
- **shadcn/ui** - High quality UI components
- **react-hook-form** - Form state management
- **zod** - Schema validation
- **@dnd-kit** - Drag & drop

## Internationalization (i18n)

This frontend supports multiple languages using [i18next](https://www.i18next.com/) and `react-i18next`.

### Supported Languages
- English (`en`) - Default
- Japanese (`ja`)

### Language Detection

Language is auto-detected in this order:
1. `lang` query parameter (e.g., `?lang=ja`)
2. Cookie (`i18next` cookie)
3. localStorage (`i18nextLng`)
4. Browser settings (navigator language)

### Usage in React Components

```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  return <div>{t('translation.key')}</div>;
}
```

### Usage in Non-React Code

```typescript
import { initI18n } from '@/i18n/config';

const i18n = initI18n();
const text = i18n.t('translation.key');
```

### Translation Files

Translation strings are defined in:
- `frontend/i18n/locales/en/translation.json` (English)
- `frontend/i18n/locales/ja/translation.json` (Japanese)

**Important:** When adding new translation keys, update both files.

### Configuration

The root layout wraps the app with `I18nProvider`, which:
- Initializes i18next on the client
- Updates `document.documentElement.lang` based on detected language
- Provides translation context to all components

## Directory structure

```
frontend/
├── app/                      # Next.js App Router
│   ├── page.tsx              # Home page
│   ├── login/                # Login page
│   ├── signup/               # Sign-up page
│   │   └── check-email/      # Waiting-for-confirmation page
│   ├── verify-email/         # Email verification page
│   ├── forgot-password/      # Password reset request page
│   ├── reset-password/       # Password reset page
│   ├── settings/             # Settings page
│   ├── videos/               # Video pages
│   │   ├── page.tsx          # Video list page
│   │   ├── [id]/             # Video detail page
│   │   └── groups/           # Video group pages
│   │       └── [id]/         # Video group detail page
│   └── share/                # Share pages
│       └── [token]/          # Share token page
├── components/               # React components
│   ├── auth/                 # Auth components
│   ├── video/                # Video components
│   ├── chat/                 # Chat components
│   ├── layout/               # Layout components
│   ├── common/               # Common components
│   └── ui/                   # UI components (shadcn/ui)
├── hooks/                    # Custom hooks (useAuth, useVideos, useAsyncState, etc.)
├── lib/                      # Libraries and utilities (api, errorUtils, etc.)
├── public/                   # Static assets
├── package.json              # Node.js dependencies
├── Dockerfile                # Frontend Docker image
└── README.md                 # This file
```

## Integration with Backend

This frontend communicates with a Django REST Framework backend API.

### API Endpoints

#### Auth
- `POST /api/auth/signup/` - User registration (requires email verification)
- `POST /api/auth/verify-email/` - Email verification
- `POST /api/auth/login/` - Login
- `POST /api/auth/logout/` - Logout
- `POST /api/auth/refresh/` - Token refresh
- `GET /api/auth/me/` - Current user info
- `POST /api/auth/password-reset/` - Request password reset
- `POST /api/auth/password-reset/confirm/` - Confirm password reset

#### Videos
- `GET /api/videos/` - List videos
- `POST /api/videos/` - Upload video
- `GET /api/videos/<id>/` - Get video detail
- `PATCH /api/videos/<id>/` - Update video
- `DELETE /api/videos/<id>/` - Delete video

#### Video Groups
- `GET /api/videos/groups/` - List groups
- `POST /api/videos/groups/` - Create group
- `GET /api/videos/groups/<id>/` - Group detail
- `PATCH /api/videos/groups/<id>/` - Update group
- `DELETE /api/videos/groups/<id>/` - Delete group
- `POST /api/videos/groups/<id>/videos/` - Add videos to group
- `DELETE /api/videos/groups/<id>/videos/<video_id>/remove/` - Remove video from group
- `POST /api/videos/groups/<id>/reorder/` - Reorder videos in group
- `POST /api/videos/groups/<id>/share/` - Create share link
- `DELETE /api/videos/groups/<id>/share/delete/` - Delete share link
- `GET /api/videos/groups/shared/<token>/` - Get shared group info

#### Chat
- `POST /api/chat/` - Send chat
- `GET /api/chat/history/` - Get chat history
- `GET /api/chat/history/export/` - Export chat history
- `POST /api/chat/feedback/` - Send chat feedback

### CORS Settings

When running locally (frontend on port 3000, backend on port 8000), configure CORS in the backend:

**Via environment variable:**
```env
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
CORS_ALLOW_CREDENTIALS=true
```

**Or in backend `settings.py`:**
```python
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
CORS_ALLOW_CREDENTIALS = True
```

**Note:** In Docker Compose, Nginx works as the reverse proxy, so CORS is typically not needed between frontend and backend (they communicate internally). CORS is only needed for external API access or when running services separately.

## Development

### Docker Compose Environment (Recommended)

```bash
# Build the frontend
docker compose exec frontend npm run build

# View logs
docker compose logs -f frontend

# Run linter
docker compose exec frontend npm run lint

# Type check
docker compose exec frontend npm run typecheck

# Run unit tests
docker compose exec frontend npm run test

# Run tests with coverage
docker compose exec frontend npm run test:coverage
```

### Local Development

```bash
# Build
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Type check
npm run typecheck

# Run unit tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Production Deployment

### Using Docker Compose (Recommended)

1. Set environment variables in `.env`:
```env
NEXT_PUBLIC_API_URL=https://api.example.com/api
```

2. Build and start:
```bash
docker compose up --build -d
```

### Standalone Deployment

1. Set `NEXT_PUBLIC_API_URL` to the production API URL
2. Build:
```bash
npm run build
```
3. Start:
```bash
npm start
```

The frontend will run on port 3000 by default (or the port specified by `PORT` environment variable).
