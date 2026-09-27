import { advanceChatTextContext, appendChatPart, parseChatText, serializeChatParts, type ChatContentPart, type ChatTextNode } from '@videoq/trpc/chat';

export type MessageContentNode = ChatTextNode | { type: 'ref'; id: number };

export function parseMessageParts(parts: readonly ChatContentPart[]): MessageContentNode[] {
  const nodes: MessageContentNode[] = [];
  const combined: ChatContentPart[] = [];
  for (const part of parts) appendChatPart(combined, part);
  let context = { previous: '', linePrefix: '' };
  for (const part of combined) {
    if (part.type === 'citation') {
      nodes.push({ type: 'ref', id: part.sourceId });
    } else {
      for (const node of parseChatText(part.text, context)) {
        const last = nodes.at(-1);
        if (last?.type === 'text' && node.type === 'text') last.value += node.value;
        else nodes.push(node);
      }
    }
    context = advanceChatTextContext(context, serializeChatParts([part]));
  }
  return nodes;
}
