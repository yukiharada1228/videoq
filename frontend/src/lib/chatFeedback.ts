export type ChatFeedbackValue = 'good' | 'bad' | null;

interface FeedbackMessage {
  chatLogId?: number;
  feedback?: ChatFeedbackValue;
}

export function getNextChatFeedback(
  currentFeedback: ChatFeedbackValue | undefined,
  selectedFeedback: Exclude<ChatFeedbackValue, null>,
): ChatFeedbackValue {
  return currentFeedback === selectedFeedback ? null : selectedFeedback;
}

export function applyChatFeedback<T extends FeedbackMessage>(
  messages: T[],
  chatLogId: number,
  feedback: ChatFeedbackValue,
): T[] {
  return messages.map((message) =>
    message.chatLogId === chatLogId
      ? { ...message, feedback }
      : message,
  );
}
