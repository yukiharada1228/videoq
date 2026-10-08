# Security dependency updates

The root `package.json` contains temporary overrides for security fixes that
upstream packages do not yet allow in their dependency ranges. Reviewed on
2026-10-08 after [Dependabot update 1616384278](https://github.com/yukiharada1228/videoq/actions/runs/37714524219)
could not create a complete security update.

| Override | Reason | Remove when |
| --- | --- | --- |
| `@docusaurus/core` → `tinypool >=2.1.2` | Docusaurus 3.10.2 requests 1.x; both prototype-pollution advisories require 2.1.2. Tinypool 2 drops Node 18, which this project does not use. | Docusaurus accepts a patched version. |
| `mermaid` → `katex >=0.18.6 <0.19` | Mermaid 11 requests vulnerable KaTeX 0.16.x. | Mermaid accepts a patched KaTeX release. |
| `miniflare` → `sharp >=0.35.5 <0.36` | Miniflare pins 0.35.4, whose bundled librsvg is vulnerable. | Miniflare pins a patched version. |
| `postcss-selector-parser >=7.1.6 <8` | Older CSS optimization plugins request vulnerable 6.x. | Every parent dependency accepts a patched parser. |

Keep `brace-expansion` on its existing major versions: 1.1.21+, 2.1.7+, and
5.0.12+ are patched. No major-version override is needed for those updates.

For changes to these overrides, verify a clean `npm ci`, installed versions,
and `npm audit --json`, as well as the affected builds. In particular, exercise
Docusaurus SSG worker threads when changing Tinypool, Mermaid math labels when
changing KaTeX, and Workers tests when changing Miniflare's dependencies.
Workspace override resolution can retain older lockfile entries even when an
npm command exits successfully; check every installed copy, including nested
packages.

## Unresolved upstream advisory

[`braces` GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
affects all published versions through 3.0.3, with no patched release available
at the review date. It remains a dependency of Micromatch and Chokidar in the
tooling dependency tree. Keep this alert open and recheck when upstream ships
a fix; it is not an audit exemption or a claim that exploitation is impossible.
Dependabot's security update job can continue reporting
`security_update_not_found` for this package until a fix is available.
Track [upstream PR #82](https://github.com/micromatch/braces/pull/82), which is
still under review and unpublished at the review date, for a maintained fix.
