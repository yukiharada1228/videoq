import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Docusaurus silently disables ELK when its optional peer is not resolvable
// from the theme, even if a different copy exists in the docs workspace.
const theme = createRequire(import.meta.url).resolve("@docusaurus/theme-mermaid");
await import(import.meta.resolve("@mermaid-js/layout-elk", pathToFileURL(theme).href));
console.log("Mermaid ELK layout is available to Docusaurus.");
