---
title: Change the frontend
description: Where to edit React pages, translations, data fetching, and Storybook, and how to verify changes.
---

# Change the frontend

UI changes are easier to follow when you distinguish display components from data-fetching hooks. Start the [development environment](../getting-started/local-setup.md) first.

## Choose files by the change you need

| What you want to change | Main location |
|---|---|
| URL-to-screen mapping | `apps/web/src/App.tsx` |
| Page content | `apps/web/src/pages/`, `components/` |
| Fetching and updating data | `apps/web/src/hooks/` |
| English and Japanese copy | `apps/web/src/i18n/locales/` |
| API types and operations | `packages/trpc/src/` |
| Loading, error, and empty state examples | The relevant `*.stories.tsx` |

## Use the development server

Use Compose's `web-dev`, or run the following on the host. Both use port 3000, so choose one.

```bash
VITE_API_URL=/api VITE_USE_S3_STORAGE=true npm run dev:web
```

The host Vite server normally proxies API requests to `127.0.0.1:8787`. Keep the API and database running in Compose.

## Start with existing data-fetching hooks

For example, `useTags.ts` fetches tags with:

```tsx
const tagsQuery = useQuery(
  trpc.tags.list.queryOptions({ limit: 100, offset: 0 }),
);
```

This example runs inside a hook. TanStack Query manages results, loading, and errors; tRPC shares input and output types. After a mutation, update the cache or refetch according to the existing implementation.

## Add a page

Add ordinary screens to `appPageRoutes` in `App.tsx`. Use `handle` to specify the active navigation item and layout type. Authentication pages use `AuthRouteLayout`; shared courses have their own setup.

Pages return their main content. Leave shared headers and footers to the parent layout to avoid rendering them twice.

## Verify

```bash
npm run typecheck --workspace @videoq/web
npm run lint --workspace @videoq/web
npm run build --workspace @videoq/web
```

Check appearance and interactions in Storybook and the app. Cover loading, failure, and empty states as well as success. See [changing and reviewing Storybook](https://github.com/yukiharada1228/videoq/blob/main/apps/web/STORYBOOK.md).

**Related:** [Screen transitions](../requirements/screen-transition-diagram.md), [Tests and verification commands](testing.md).
