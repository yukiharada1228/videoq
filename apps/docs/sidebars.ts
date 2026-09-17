import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'README',
    {
      type: 'category',
      label: 'はじめる',
      collapsed: false,
      items: [
        'getting-started/local-setup',
        'getting-started/first-walkthrough',
        'getting-started/codebase',
        'getting-started/first-change',
      ],
    },
    {
      type: 'category',
      label: '基本を理解する',
      items: [
        'concepts/domain-model',
        'architecture/system-configuration-diagram',
        'concepts/auth',
        'plog/README',
      ],
    },
    {
      type: 'category',
      label: '開発ガイド',
      items: [
        'guides/frontend',
        'guides/api',
        'guides/database',
        'guides/worker',
        'guides/testing',
        'guides/troubleshooting',
        'guides/documentation',
      ],
    },
    {
      type: 'category',
      label: '設計リファレンス',
      items: [
        {
          type: 'category',
          label: 'APIと処理',
          items: [
            'architecture/trpc-api',
            'architecture/flowchart',
            'architecture/prompt-engineering',
            'architecture/bpmn',
          ],
        },
        {
          type: 'category',
          label: 'データベース',
          items: ['database/er-diagram', 'database/data-dictionary', 'database/data-flow-diagram'],
        },
        {
          type: 'category',
          label: '画面と機能',
          items: [
            'requirements/use-case-diagram',
            'requirements/activity-diagram',
            'requirements/screen-transition-diagram',
          ],
        },
        {
          type: 'category',
          label: 'モジュールと状態',
          items: [
            'design/component-diagram',
            'design/class-diagram',
            'design/sequence-diagram',
            'design/state-diagram',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: '運用',
      items: ['design/deployment-diagram', 'billing/stripe-dashboard'],
    },
    'reference/glossary',
  ],
};

export default sidebars;
