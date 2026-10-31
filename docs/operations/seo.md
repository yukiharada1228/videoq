---
title: Search engine visibility
description: How public pages reach crawlers, which search intents they serve, and how to check them.
---

# Search engine visibility

VideoQ follows the same approach as Nuriee: real page content in the first HTML, one page per search intent, correct status codes, and a read-only daily check. Outcomes are measured by signups from search, not by rank alone.

## How public pages are served

| Path type | Examples | Response |
|---|---|---|
| Public | `/`, `/pricing`, legal pages, `/guides`, `/guides/:slug`, and each under `/en` | Prerendered body, indexable, in the sitemap |
| Application | `/videos`, `/login`, `/share/:token` | 200 with the empty shell and `noindex` |
| Unknown | Anything else | 404 with the empty shell and `noindex` |

`npm run build` runs `apps/web/scripts/prerender.mjs` after the client build. It renders each public page with the same React tree the browser hydrates and generates `sitemap.xml`. The Worker then rewrites the head from `src/lib/pageCopy.ts` and `src/lib/seo.ts`. `publicPaths()` is the single list of public pages. On-prem builds skip all of this.

The plan cards on `/pricing` and the Free plan limits on the landing page still load in the browser, because prices come from Stripe at request time and must not go stale in a build.

## Search intents and pages

Search volumes and current rankings have not been measured. This table is a hypothesis to test against Search Console, not a demand ranking.

| Candidate queries | Page | What the reader gets |
|---|---|---|
| 動画講座 質問対応, オンライン講座 受講生 サポート, 講座 AI チャットボット | `/guides/online-course-questions` | Setup, access choice, costs, checks |
| 授業 録画 復習, 塾 授業動画 質問 | `/guides/class-recordings-for-review` | Dividing courses, sharing, using history |
| 研修動画 質問, 社内研修 動画 AI 検索 | `/guides/training-video-questions` | Invitations, attribution, rollout decisions |
| VideoQ 仕組み, 動画 AI 回答 引用 | `/guides/how-ai-answers-work` | Answer flow, limits, who reads questions |
| VideoQ, 講義動画 AI 質問窓口 | `/` | Product overview and demo |
| VideoQ 料金 | `/pricing` | Plans and limits |

## Adding or editing a guide

1. Add a page only when it serves a distinct intent with something the existing pages lack. Do not create variants for similar wording.
2. Add the entry to `src/lib/guideCatalog.ts` and the body to `src/content/guides.ts`, in Japanese and English.
3. Change `updated` only when the content changes. The sitemap publishes that date.
4. State only shipped behavior, checked against `docs/concepts`. Do not add invented figures, customers, testimonials or promised results.

`FAQPage` markup is deliberately not used. The FAQ is ordinary page content.

## Checks

```sh
npm run build --workspace @videoq/web
npm run test:worker --workspace @videoq/web
npm run seo:audit --workspace @videoq/web -- --base-url http://127.0.0.1:8787 --output /tmp/seo-audit.json
```

The `Daily public SEO checks` workflow runs the audit against production and keeps the report for 90 days. It checks status codes, HEAD responses, canonical, hreflang, titles, descriptions, H1, body text, JSON-LD validity, internal links and 404 behavior. It cannot measure indexing, rankings or field Core Web Vitals.

## Measuring results

Measure in Search Console for the `videoq.jp` domain property. After release, save the last 28 days of clicks, impressions, CTR and average position by query and page, then compare every four weeks. Confirm that key URLs are indexed with the expected canonical. A submitted sitemap does not mean a page is indexed.

Set numeric traffic targets only after that baseline exists. Daily automated content changes, as Nuriee uses them, are not set up here. They need Search Console credentials and a baseline to judge changes against.
