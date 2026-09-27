import { CitationTextParser, chatSourceSchema, serializeChatParts, type InvalidCitationReason } from "@videoq/trpc/chat";
import type { Citation } from "@videoq/trpc";
import type { RagCitation } from "./rag";

export const withCitationIds = (citations: readonly RagCitation[]): Citation[] =>
  citations.map((citation, index) => ({ ...citation, id: index + 1 }));

/** A new registry for every answer; sources come only from the scoped retriever. */
export class ChatCitationRegistry {
  private readonly sources = new Map<number, Citation>();
  private readonly rejected: Record<InvalidCitationReason, number> = { invalid_id: 0, unknown_id: 0 };
  private reported = false;
  readonly parser = new CitationTextParser(
    (id) => this.sources.has(id),
    (reason) => { this.rejected[reason]++; },
  );

  register(citations: readonly RagCitation[]): Citation[] {
    const added: Citation[] = [];
    for (const source of withCitationIds(citations)) {
      if (!chatSourceSchema.safeParse(source).success) throw new Error("Invalid retrieved citation");
      const known = this.sources.get(source.id);
      if (known) {
        if (JSON.stringify(known) !== JSON.stringify(source)) throw new Error("Citation source changed within an answer");
        continue;
      }
      this.sources.set(source.id, source);
      added.push(source);
    }
    return added;
  }

  reportRejected() {
    if (this.reported) return;
    this.reported = true;
    if (this.rejected.invalid_id + this.rejected.unknown_id === 0) return;
    // Never log model text, transcript text, source IDs or private video metadata.
    console.warn(JSON.stringify({ event: "chat_citations_rejected", ...this.rejected }));
  }
}

export function validateChatCitations(content: string, citations: readonly RagCitation[]): string {
  const registry = new ChatCitationRegistry();
  registry.register(citations);
  const result = serializeChatParts([...registry.parser.push(content), ...registry.parser.finish()]);
  registry.reportRejected();
  return result;
}
