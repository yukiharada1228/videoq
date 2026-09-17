import type {Config} from '@docusaurus/types';
import type {Options, ThemeConfig} from '@docusaurus/preset-classic';
import type {PluginOptions as SearchOptions} from '@easyops-cn/docusaurus-search-local';

const config: Config = {
  title: 'VideoQ Docs',
  tagline: '初めての参加から、日々の開発まで',
  url: process.env.DOCS_URL ?? 'https://docs.videoq.jp',
  baseUrl: process.env.DOCS_BASE_URL ?? '/',
  trailingSlash: true,
  favicon: 'img/favicon.ico',
  organizationName: 'yukiharada1228',
  projectName: 'videoq',
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  onDuplicateRoutes: 'throw',
  i18n: {
    defaultLocale: 'ja',
    locales: ['ja'],
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
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: ({docPath}) =>
            `https://github.com/yukiharada1228/videoq/edit/main/docs/${docPath}`,
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
      items: [
        {type: 'doc', docId: 'getting-started/local-setup', label: 'はじめる', position: 'left'},
        {type: 'doc', docId: 'guides/frontend', label: '開発ガイド', position: 'left'},
        {type: 'doc', docId: 'reference/glossary', label: '用語集', position: 'left'},
        {href: 'https://videoq.jp', label: 'VideoQ', position: 'right'},
        {href: 'https://github.com/yukiharada1228/videoq', label: 'GitHub', position: 'right'},
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'VideoQ',
          items: [
            {label: 'アプリを開く', href: 'https://videoq.jp'},
            {label: 'ソースコード', href: 'https://github.com/yukiharada1228/videoq'},
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
