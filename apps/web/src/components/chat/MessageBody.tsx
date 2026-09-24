import { Fragment, memo, useMemo } from 'react';
import katex from 'katex';
import type { Citation } from '@/lib/api';
import { parseMessageContent } from '@/lib/chat/parseMessageContent';
import { linkVariants } from '@/components/ui/link';
import { cn } from '@/lib/digital-agency/cn';
import 'katex/dist/katex.min.css';

interface MessageBodyProps {
  content: string;
  citations?: Citation[];
  onVideoNavigate: (videoId: number, startTime: string) => void;
}

function formatInlineTime(time: string | null | undefined) {
  if (!time) return '';
  const main = time.split(',')[0];
  return main.replace(/^00:/, '').replace(/^0(\d:)/, '$1');
}

function formatTimeRange(startTime: string | null | undefined, endTime: string | null | undefined) {
  const start = formatInlineTime(startTime);
  const end = formatInlineTime(endTime);
  if (start && end) return `${start}-${end}`;
  return start || end;
}

const MathExpression = memo(function MathExpression({ tex, display }: { tex: string; display: boolean }) {
  const html = katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    trust: false,
  });
  return (
    <span
      className={cn('whitespace-normal', display && 'my-3 block overflow-x-auto text-center')}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

export function MessageBody({ content, citations, onVideoNavigate }: MessageBodyProps) {
  const nodes = useMemo(() => parseMessageContent(content), [content]);
  const citationMap = useMemo(() => new Map((citations ?? []).map((citation) => [citation.id, citation])), [citations]);

  return (
    <div className="text-solid-gray-700 leading-relaxed whitespace-pre-wrap">
      {nodes.map((node, i) => {
        if (node.type === 'text') {
          return <Fragment key={`text-${i}`}>{node.value}</Fragment>;
        }

        if (node.type === 'math') {
          return (
            <MathExpression
              key={`math-${i}`}
              tex={node.value}
              display={node.display}
            />
          );
        }

        const video = citationMap.get(node.id);
        if (!video) {
          return <Fragment key={`ref-${i}`}>[{node.id}]</Fragment>;
        }

        const primaryRange = formatTimeRange(video.start_time, video.end_time);

        return (
          <Fragment key={`${video.video_id}-${video.start_time}-${i}`}>
            {primaryRange && (
              <button
                type="button"
                onClick={() => onVideoNavigate(video.video_id, video.start_time ?? '')}
                className={cn(linkVariants(), 'inline text-left')}
                title={`${video.title} ${video.start_time}`}
                aria-label={`${video.title} ${video.start_time}`}
              >
                {` (${primaryRange})`}
              </button>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
