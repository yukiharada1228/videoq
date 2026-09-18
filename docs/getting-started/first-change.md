---
title: Make your first change
description: Practice editing, verification, and review with a small UI change.
---

# Make your first change

A copy improvement or small display fix related to your assigned task is a good first change. This guide uses improving the help text in the tag creation dialog as an example. You do not need to change feature behavior just for practice.

## 1. Define done before you edit

For example: “New users understand what tags are for, and the layout works in both English and Japanese.” Check the current screen and its Storybook stories before editing.

```bash
git status --short
git switch -c docs/improve-tag-help
```

Use your existing working branch if you already have one. Check any unfinished changes so they do not get mixed into this task.

## 2. Find the UI and its copy

```bash
rg --files apps/web/src | rg 'TagCreateDialog|useTags'
rg -n 'tag|タグ' apps/web/src/i18n/locales
```

Components control the display. Translations live in `apps/web/src/i18n/locales/ja/translation.json` and `en/translation.json`. Use the same keys in both languages.

Updating form help text does not require API or DB changes. If you also change API inputs, review the scope in [Change the API](../guides/api.md).

## 3. Check the states users see

```bash
npm run storybook
```

Open [http://127.0.0.1:6006](http://127.0.0.1:6006). Switch between English and Japanese, mobile and desktop, and check long text and error messages. To try interactions in the app, use `web-dev` from the [development environment](local-setup.md).

## 4. Verify the change

```bash
npm run typecheck --workspace @videoq/web
npm run lint --workspace @videoq/web
npm run build --workspace @videoq/web
```

When changing interactions or state, update the existing tests and stories that cover that behavior. For copy-only changes, prioritize visual checks over adding tests that simply compare the same text. See [choosing the right checks](../guides/testing.md).

## 5. Make the change ready for review

Read the diff and check for unrelated changes.

```bash
git diff --check
git diff
```

In the review request, describe the problem, the resulting behavior, and what you verified. For UI changes, include a screenshot or story name. Update the documentation in the same change if user instructions have changed.

**Read next:** Choose the guide for your area: [frontend](../guides/frontend.md), [API](../guides/api.md), [database](../guides/database.md), or [video processing](../guides/worker.md).
