import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure, DisclosureSummary } from '@/components/ui/disclosure';
import { Heading, HeadingTitle } from '@/components/ui/heading';
import { Tab, TabItem, TabList, TabPanel, useTabAria } from '@/components/ui/tabs';

const tabs = ['python', 'typescript', 'javascript'] as const;
type TabId = (typeof tabs)[number];

type Example = {
  titleKey: string;
  descriptionKey: string;
  snippets: Record<TabId, string>;
};

type CodeStrings = {
  ragComment: string;
  sampleQuestion: string;
  citationsComment: string;
  language: string;
};

function buildExamples(baseUrl: string, c: CodeStrings): Example[] {
  return [
    {
      titleKey: 'docs.openai.ragExample.title',
      descriptionKey: 'docs.openai.ragExample.description',
      snippets: {
        python: `from openai import OpenAI

client = OpenAI(
    api_key="vq_your_key_here",
    base_url="${baseUrl}",
)

# ${c.ragComment}
response = client.chat.completions.create(
    model="videoq",
    messages=[{"role": "user", "content": "${c.sampleQuestion}"}],
    extra_body={"group_id": 1, "language": "${c.language}"},
)

msg = response.choices[0].message
print(msg.content)

# ${c.citationsComment}
citations = msg.model_extra.get("citations")  # list | None
chat_log_id = msg.model_extra.get("chat_log_id")        # int | None

if citations:
    for scene in citations:
        print(f"{scene['title']} ({scene['start_time']} - {scene['end_time']})")`,

        typescript: `import OpenAI from 'openai';

type VideoQMessage = OpenAI.Chat.ChatCompletionMessage & {
  citations?: { id: number; video_id: number; title: string; start_time: string; end_time: string }[];
  chat_log_id?: number;
};

const client = new OpenAI({
  apiKey: 'vq_your_key_here',
  baseURL: '${baseUrl}',
  dangerouslyAllowBrowser: true,
});

// ${c.ragComment}
const response = await client.chat.completions.create({
  model: 'videoq',
  messages: [{ role: 'user', content: '${c.sampleQuestion}' }],
  // @ts-expect-error: VideoQ extension fields
  group_id: 1,
  language: '${c.language}',
});

const msg = response.choices[0].message as VideoQMessage;
console.log(msg.content);

// ${c.citationsComment}
msg.citations?.forEach(scene => {
  console.log(\`\${scene.title} (\${scene.start_time} - \${scene.end_time})\`);
});
console.log('chat_log_id:', msg.chat_log_id);`,

        javascript: `import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'vq_your_key_here',
  baseURL: '${baseUrl}',
  dangerouslyAllowBrowser: true,
});

// ${c.ragComment}
const response = await client.chat.completions.create({
  model: 'videoq',
  messages: [{ role: 'user', content: '${c.sampleQuestion}' }],
  group_id: 1,
  language: '${c.language}',
});

const msg = response.choices[0].message;
console.log(msg.content);

// ${c.citationsComment}
msg.citations?.forEach(scene => {
  console.log(\`\${scene.title} (\${scene.start_time} - \${scene.end_time})\`);
});
console.log('chat_log_id:', msg.chat_log_id);`,
      },
    },
  ];
}

const tabLabels: Record<TabId, string> = {
  python: 'Python',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
};

export function OpenAiSdkExampleList() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>('python');
  const tabAria = useTabAria({
    defaultSelectedIndex: 0,
    onTabChange: ({ selectedIndex }) => {
      setActiveTab(tabs[selectedIndex] ?? 'python');
    },
  });

  const baseUrl = `${window.location.origin}/api/v1/`;

  const codeStrings: CodeStrings = {
    ragComment: t('docs.openai.code.ragComment'),
    sampleQuestion: t('docs.openai.code.sampleQuestion'),
    citationsComment: t('docs.openai.code.relatedVideosComment'),
    language: t('docs.openai.code.language'),
  };
  const examples = buildExamples(baseUrl, codeStrings);

  return (
    <Tab>
      <TabList aria-label="SDK language" {...tabAria.getListProps()} className="mb-6">
        {tabs.map((tab, index) => (
          <TabItem key={tab} {...tabAria.getTabProps(index)}>
            {tabLabels[tab]}
          </TabItem>
        ))}
      </TabList>

      {tabs.map((tab, index) => (
        <TabPanel key={tab} {...tabAria.getPanelProps(index)} className="space-y-4">
          {examples.map((example) => (
            <Disclosure
              key={`${example.titleKey}-${tab}`}
              className="border-t border-solid-gray-420 py-4"
              open
            >
              <DisclosureSummary>
                <Heading size="16">
                  <HeadingTitle level="h3">{t(example.titleKey)}</HeadingTitle>
                </Heading>
              </DisclosureSummary>
              <div className="mt-4 space-y-3 pl-8">
                <p className="text-std-16N-170 text-solid-gray-700">
                  {t(example.descriptionKey)}
                </p>
                <pre className="overflow-x-auto border border-solid-gray-420 bg-solid-gray-800 p-4 text-dns-14N-130 text-white">
                  <code>{example.snippets[activeTab]}</code>
                </pre>
              </div>
            </Disclosure>
          ))}
        </TabPanel>
      ))}
    </Tab>
  );
}
