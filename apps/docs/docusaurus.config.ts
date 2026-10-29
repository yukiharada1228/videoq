import type {Config} from '@docusaurus/types';
import type {Options, ThemeConfig} from '@docusaurus/preset-classic';
import type {PluginOptions as SearchOptions} from '@easyops-cn/docusaurus-search-local';
import publicContent from './public-content.json';

const config: Config = {
  title: 'VideoQ Docs',
  tagline: 'From your first contribution to everyday development',
  url: process.env.DOCS_URL ?? 'https://docs.videoq.jp',
  baseUrl: process.env.DOCS_BASE_URL ?? '/',
  trailingSlash: true,
  favicon: 'img/favicon.ico',
  organizationName: 'videoq-jp',
  projectName: 'videoq',
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  onDuplicateRoutes: 'throw',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ja'],
    localeConfigs: {
      en: {label: 'English'},
      ja: {label: '日本語'},
    },
  },
  markdown: {
    // Keep GitHub-compatible .md documents; opt into React with .mdx files.
    format: 'detect',
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
      onBrokenMarkdownImages: 'throw',
    },
  },
  presets: [
    [
      'classic',
      {
        debug: false,
        docs: {
          path: '../../docs',
          // A new source file must never become public merely by being committed.
          include: publicContent.documents,
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: ({locale, docPath}) => {
            const docsPath = locale === 'ja'
              ? 'apps/docs/i18n/ja/docusaurus-plugin-content-docs/current'
              : 'docs';
            return `https://github.com/videoq-jp/videoq/edit/main/${docsPath}/${docPath}`;
          },
        },
        blog: false,
        pages: false,
        theme: {customCss: './src/css/custom.css'},
      } satisfies Options,
    ],
  ],
  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: 'filename',
        language: ['en', 'ja'],
        docsDir: '../../docs',
        docsRouteBasePath: '/',
        indexBlog: false,
        highlightSearchTermsOnTargetPage: true,
      } satisfies SearchOptions,
    ],
  ],
  themeConfig: {
    colorMode: {respectPrefersColorScheme: true},
    navbar: {
      title: 'VideoQ Docs',
      logo: {alt: '', src: 'img/videoq-icon.png', width: 32, height: 32},
      items: [
        {type: 'doc', docId: 'getting-started/local-setup', label: 'Get started', position: 'left'},
        {type: 'doc', docId: 'concepts/how-ai-works', label: 'AI behavior', position: 'left'},
        {type: 'doc', docId: 'guides/frontend', label: 'Development guides', position: 'left'},
        {type: 'doc', docId: 'reference/glossary', label: 'Glossary', position: 'left'},
        {type: 'localeDropdown', position: 'right'},
        {href: 'https://videoq.jp', label: 'VideoQ', position: 'right'},
        {href: 'https://github.com/videoq-jp/videoq', label: 'GitHub', position: 'right'},
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'VideoQ',
          items: [
            {label: 'Open the app', href: 'https://videoq.jp'},
            {label: 'Source code', href: 'https://github.com/videoq-jp/videoq'},
          ],
        },
      ],
    },
    prism: {
      additionalLanguages: ['bash', 'diff', 'json', 'python', 'sql', 'toml', 'yaml'],
    },
  } satisfies ThemeConfig,
};

export default config;
