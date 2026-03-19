import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

const tabs = ['python', 'typescript', 'javascript'] as const;
type Tab = (typeof tabs)[number];

type Example = {
  titleKey: string;
  descriptionKey: string;
  snippets: Record<Tab, string>;
};

type CodeStrings = {
  ragComment: string;
  sampleQuestion: string;
  relatedVideosComment: string;
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

# ${c.relatedVideosComment}
related_videos = msg.model_extra.get("related_videos")  # list | None
chat_log_id = msg.model_extra.get("chat_log_id")        # int | None

if related_videos:
    for scene in related_videos:
        print(f"{scene['title']} ({scene['start_time']} - {scene['end_time']})")`,

        typescript: `import OpenAI from 'openai';

type VideoQMessage = OpenAI.Chat.ChatCompletionMessage & {
  related_videos?: { video_id: number; title: string; start_time: string; end_time: string }[];
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

// ${c.relatedVideosComment}
msg.related_videos?.forEach(scene => {
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

// ${c.relatedVideosComment}
msg.related_videos?.forEach(scene => {
  console.log(\`\${scene.title} (\${scene.start_time} - \${scene.end_time})\`);
});
console.log('chat_log_id:', msg.chat_log_id);`,
      },
    },
  ];
}

export function OpenAiSdkExampleList() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('python');

  const baseUrl = `${window.location.origin}/api/v1/`;

  const codeStrings: CodeStrings = {
    ragComment: t('docs.openai.code.ragComment'),
    sampleQuestion: t('docs.openai.code.sampleQuestion'),
    relatedVideosComment: t('docs.openai.code.relatedVideosComment'),
    language: t('docs.openai.code.language'),
  };
  const examples = buildExamples(baseUrl, codeStrings);

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              activeTab === tab
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            {tab === 'typescript' ? 'TypeScript' : tab === 'javascript' ? 'JavaScript' : 'Python'}
          </button>
        ))}
      </div>

      {examples.map((example) => (
        <Card key={example.titleKey}>
          <CardHeader>
            <CardTitle className="text-base">{t(example.titleKey)}</CardTitle>
            <CardDescription>{t(example.descriptionKey)}</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-4 text-xs text-slate-100">
              <code>{example.snippets[activeTab]}</code>
            </pre>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
