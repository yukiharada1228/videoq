# Ask Video Frontend

A frontend application built with Next.js, TypeScript, Tailwind CSS, and shadcn/ui.

## Setup

### Requirements
- Node.js 18+
- npm or yarn

### Install

```bash
npm install
```

### Environment variables

Create a `.env.local` file and add:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

### Start development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features

- User registration and email verification (`/signup`, `/verify-email`)
- Login and logout (`/login`)
- Password reset (`/forgot-password`, `/reset-password`)
- Video upload and management (`/videos`)
- Video group management (`/videos/groups`)
- AI chat (RAG-enabled)
- Share links (`/share/[token]`)
- User settings (`/settings`)
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

- All UI texts are managed by [i18next](https://www.i18next.com/) + `react-i18next`. The default language is English (`en`). Language is auto-detected in this order: browser settings, `lang` query, localStorage, then Cookie. It switches to Japanese (`ja`) if matched.
- The root layout wraps the app with `I18nProvider`, so in React code you can use `const { t } = useTranslation();` and call `t('translation.key')`.
- For non-React code (utilities, API wrappers), initialize an i18next instance with `import { initI18n } from '@/i18n/config';` and then call `initI18n().t(...)`.
- Translation strings are defined in `frontend/i18n/locales/en/translation.json` (English) and `frontend/i18n/locales/ja/translation.json` (Japanese). When adding new keys, update both files together.
- The document root `<html>` starts with `lang="en"`. After client-side language detection, `I18nProvider` updates `document.documentElement.lang` automatically.

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
- `PATCH /api/auth/me/` - Update user info (save OpenAI API key)
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
- `POST /api/videos/groups/<id>/share/` - Create share link
- `GET /api/videos/groups/shared/<token>/` - Get shared group info

#### Chat
- `POST /api/chat/` - Send chat
- `GET /api/chat/history/` - Get chat history
- `GET /api/chat/history/export/` - Export chat history
- `POST /api/chat/feedback/` - Send chat feedback

### CORS settings

Configure the following in backend `settings.py` (or via `CORS_ALLOWED_ORIGINS` env):

```python
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

CORS_ALLOW_CREDENTIALS = True
```

**Note:** This project is designed for Docker Compose. In Docker, Nginx works as the reverse proxy to serve both frontend and backend.

## Build

```bash
npm run build
```

## Development in Docker

This project assumes Docker Compose. See the root README for details.

```bash
# Example commands in Docker environment
docker-compose exec frontend npm run build
docker-compose logs -f frontend
```

## Production

Steps for production:

1. Set `NEXT_PUBLIC_API_URL` to the production API URL
2. Build with `npm run build`
3. Start with `npm start`

Or deploy using Docker Compose.
