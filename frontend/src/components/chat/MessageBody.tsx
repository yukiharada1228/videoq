import { Fragment } from 'react';
import type { Citation } from '@/lib/api';
import { linkVariants } from '@/components/ui/link';
import { cn } from '@/lib/utils';

interface MessageBodyProps {
  content: string;
  citations?: Citation[];
  onVideoNavigate: (videoId: number, startTime: string) => void;
}

function formatInlineTime(time: string | undefined) {
  if (!time) return '';
  const main = time.split(',')[0];
  return main.replace(/^00:/, '').replace(/^0(\d:)/, '$1');
}

function formatTimeRange(startTime: string | undefined, endTime: string | undefined) {
  const start = formatInlineTime(startTime);
  const end = formatInlineTime(endTime);
  if (start && end) return `${start}-${end}`;
  return start || end;
}

export function MessageBody({ content, citations, onVideoNavigate }: MessageBodyProps) {
  const tagPattern = /\[(\d+)\]/g;
  const nodes: Array<
    | { type: 'text'; value: string }
    | { type: 'ref'; id: number }
  > = [];
  let lastIndex = 0;

  for (const match of content.matchAll(tagPattern)) {
    const id = Number(match[1]);
    const start = match.index ?? 0;

    if (start > lastIndex) {
      nodes.push({ type: 'text', value: content.slice(lastIndex, start) });
    }

    nodes.push({ type: 'ref', id });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < content.length) {
    nodes.push({ type: 'text', value: content.slice(lastIndex) });
  }

  const normalizedNodes = nodes.length > 0 ? nodes : [{ type: 'text' as const, value: content }];
  const citationMap = new Map((citations ?? []).map((citation) => [citation.id, citation]));

  return (
    <div className="text-solid-gray-700 leading-relaxed whitespace-pre-wrap">
      {normalizedNodes.map((node, i) => {
        if (node.type === 'text') {
          return <Fragment key={`text-${i}`}>{node.value}</Fragment>;
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
                onClick={() => onVideoNavigate(video.video_id, video.start_time)}
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
