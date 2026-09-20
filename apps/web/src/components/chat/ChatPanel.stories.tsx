import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import i18n from '@/i18n/config';
import { Button } from '@/components/ui/button';
import { ChatPanel } from './ChatPanel';
import { authFixtures } from '../../../.storybook/fixtures/auth';
import { answer, citations, longAnswer } from '../../../.storybook/fixtures/chat';
import { englishCitations, englishQuestion, mixedHistory } from '../../../.storybook/fixtures/chatHistory';
import { answerEvents, courseId, courseHistory, englishHistory, firstTokens, otherCourseId, otherShareToken, otherStudySessionId, question, reviewedEvents, searchingEvents, searchQuery, shareToken, studySessionId } from '../../../.storybook/fixtures/chatPanel';
import { chatRequest, createChatPanelMock, csvRequest, evaluationRequest, feedbackRequest, historyError, historyRequest, type ChatPanelScenario } from '../../../.storybook/mocks/chatPanel';

let network: ReturnType<typeof createChatPanelMock>;
const label = (key: string) => i18n.t(`chat.${key}`);
const english = () => i18n.language.startsWith('en');

function PanelExample({ lifecycleControl, ...args }: ComponentProps<typeof ChatPanel> & { lifecycleControl: boolean }) {
  const [visible, setVisible] = useState(true);
  return <div data-testid="chat-panel-frame" style={{ maxWidth: 800 }}>
    {lifecycleControl && <Button variant="outline" className="mb-2" onClick={() => setVisible(value => !value)}>{visible ? 'Unmount panel' : 'Mount panel'}</Button>}
    {visible && <ChatPanel {...args} />}
  </div>;
}

const switchContextLabel = () => english() ? 'Switch course or link' : '講座・リンクを切り替える';
type ChatScope = Pick<ComponentProps<typeof ChatPanel>, 'courseId' | 'shareToken'>;
function ScopeSwitchExample({ target, ...args }: ComponentProps<typeof ChatPanel> & { target: ChatScope }) {
  const [switched, setSwitched] = useState(false);
  return <div style={{ maxWidth: 800 }}>
    <Button variant="outline" className="mb-2" onClick={() => setSwitched(value => !value)}>{switchContextLabel()}</Button>
    <ChatPanel {...args} {...(switched ? target : {})} />
  </div>;
}
const meta = {
  title: 'Chat/ChatPanel',
  component: ChatPanel,
  args: { courseId, onVideoPlay: fn(), className: 'h-[min(720px,calc(100dvh-32px))]' },
  render: (args, { parameters }) => <PanelExample {...args} lifecycleControl={parameters.lifecycleControl === true} />,
  parameters: { api: { auth: authFixtures.user }, docs: { story: { inline: false, height: '800px' } } },
  beforeEach({ parameters, msw }) {
    const mock = createChatPanelMock({
      events: answerEvents(english()), history: english() ? englishHistory : courseHistory,
      ...parameters.chat as ChatPanelScenario | undefined,
    });
    network = mock;
    msw.use(...mock.handlers);
    const keys = [
      `plog-study-session:course:${courseId}`, `plog-study-session:share:${shareToken}`,
      `plog-study-session:course:${otherCourseId}`, `plog-study-session:share:${otherShareToken}`,
    ];
    const saved = keys.map(key => sessionStorage.getItem(key));
    keys.forEach((key, index) => sessionStorage.setItem(key, index < 2 ? studySessionId : otherStudySessionId));
    return () => {
      mock.dispose();
      keys.forEach((key, index) => { if (saved[index] === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, saved[index]!); });
    };
  },
} satisfies Meta<typeof ChatPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
type Context = Parameters<NonNullable<Story['play']>>[0];
const input = ({ canvas }: Context) => canvas.getByRole('textbox', { name: label('placeholder') });
const chatButton = ({ canvas }: Context) => canvas.getByRole('button', { name: label('newConsultation') });
const historyButton = ({ canvas }: Context) => canvas.getByRole('button', { name: label('history') });
async function send(context: Context, text = english() ? englishQuestion : question) {
  await context.userEvent.type(input(context), text);
  await context.userEvent.click(context.canvas.getByRole('button', { name: i18n.t('common.actions.send') }));
  await waitFor(() => expect(chatRequest).toHaveBeenCalled());
}
async function complete(context: Context) {
  await send(context);
  // The real hook renders three characters per 24ms tick, including long answers.
  await context.canvas.findByRole('button', { name: label('feedbackGood') }, { timeout: 10000 });
  await waitFor(() => expect(input(context)).toBeEnabled());
}
async function openHistory(context: Context) {
  await context.userEvent.click(historyButton(context));
  await waitFor(() => expect(historyRequest).toHaveBeenCalled());
}
async function assertBusy(context: Context) {
  await expect(input(context)).toBeDisabled();
  for (const name of [label('modeQa'), label('modeStudy'), i18n.t('common.actions.send')]) await expect(context.canvas.getByRole('button', { name })).toBeDisabled();
}
const waiting = { events: [], keepOpen: true } satisfies ChatPanelScenario;

export const Initial: Story = { async play(context) {
  await expect(input(context)).toHaveAccessibleDescription(label('qaGuidance'));
  await expect(context.canvas.getByText(label('assistantGreeting'))).toBeVisible();
  await expect(context.canvas.getByRole('button', { name: label('modeQa') })).toHaveAttribute('aria-pressed', 'true');
  await expect(chatButton(context)).toHaveAttribute('aria-pressed', 'true');
  await expect(context.canvas.getByRole('button', { name: i18n.t('common.actions.send') })).toBeDisabled();
  await expect(historyRequest).not.toHaveBeenCalled();
} };
export const NoCourse: Story = { args: { courseId: undefined }, async play(context) {
  await expect(context.canvas.queryByRole('button', { name: label('history') })).not.toBeInTheDocument();
  await expect(context.canvas.queryByRole('button', { name: label('modeStudy') })).not.toBeInTheDocument();
  await complete(context);
  await expect(chatRequest.mock.calls[0][0]).not.toHaveProperty('course_id');
} };
export const HistoryHidden: Story = { args: { showHistory: false }, async play({ canvas }) {
  await expect(canvas.queryByRole('button', { name: label('history') })).not.toBeInTheDocument();
  await expect(canvas.getByRole('button', { name: label('modeStudy') })).toBeVisible();
} };
export const StudyMode: Story = { async play(context) {
  await context.userEvent.click(context.canvas.getByRole('button', { name: label('modeStudy') }));
  await expect(context.canvas.queryByText(label('qaGuidance'))).not.toBeInTheDocument();
  await expect(context.canvas.getByText(label('studyGreeting'))).toBeVisible();
  await complete(context);
  await expect(chatRequest).toHaveBeenCalledWith(expect.objectContaining({ course_id: courseId, mode: 'study', study_session_id: studySessionId }));
} };
async function finishStudyResponse(context: Context, text: string, status: 'started' | 'continued' = 'continued') {
  await waitFor(() => expect(network.activeStreams).toBe(1));
  network.emit([{ type: 'content_chunk', text }, {
    type: 'done', chat_log_id: 101, feedback: null,
    study_session: { status, expires_at: Date.now() + 43_200_000 },
  }]);
  network.finish();
  await waitFor(() => expect(input(context)).toBeEnabled(), { timeout: 10000 });
  await expect(context.canvas.getByText(text)).toBeVisible();
  await expect(context.canvas.getByRole('status')).toHaveTextContent(label(`studySession.${status}`));
}
export const StudyHelpNotGraded: Story = { parameters: { chat: waiting }, async play(context) {
  await context.userEvent.click(context.canvas.getByRole('button', { name: label('modeStudy') }));
  await send(context, english() ? 'Give me a hint' : 'ヒントを教えて');
  await finishStudyResponse(context, english()
    ? 'Help request — not graded. Your concept progress and hint position are unchanged. Current hint: Look at the inputs.'
    : '質問・ヒントの要求として受け付けました（採点対象外）。概念の進捗とヒント位置は変えていません。現在のヒント: 入力に注目してください。');
} };
export const StudyPartialReason: Story = { parameters: { chat: waiting }, async play(context) {
  await context.userEvent.click(context.canvas.getByRole('button', { name: label('modeStudy') }));
  await send(context, english() ? 'It depends on the input' : '入力によって変わります');
  await finishStudyResponse(context, english()
    ? 'AI assessment: partly correct, but incomplete (partial). Reason: Describe the condition for the output to change.'
    : 'AIの判定: 一部正しいが不完全な解答（partial）。理由: 出力が変わる条件も説明してください。');
} };
export const StudyMissReason: Story = { parameters: { chat: waiting }, async play(context) {
  await context.userEvent.click(context.canvas.getByRole('button', { name: label('modeStudy') }));
  await send(context, english() ? 'It never changes' : '変化しません');
  await finishStudyResponse(context, english()
    ? 'AI assessment: this answer needs correction (miss). Reason: The output can change with the inputs.'
    : 'AIの判定: 修正が必要な解答（miss）。理由: 入力によって出力が変わる場合があります。');
} };
export const StudyGradingUnavailable: Story = { parameters: { chat: waiting }, async play(context) {
  await context.userEvent.click(context.canvas.getByRole('button', { name: label('modeStudy') }));
  await send(context, '0');
  await finishStudyResponse(context, english()
    ? 'I could not grade this reply. Your concept progress and hint position are unchanged. This was not marked incorrect. Please send your answer again to retry. If it was a question, ask explicitly for a hint or explanation.'
    : '今回は採点できませんでした。概念の進捗とヒント位置は変えておらず、不正解扱いにはしていません。同じ解答をもう一度送って再試行してください。質問の場合は、ヒントや説明の依頼だと明記してください。');
} };
export const StudyGradingRetry: Story = { parameters: { chat: waiting }, async play(context) {
  await StudyGradingUnavailable.play!(context);
  input(context).focus();
  await context.userEvent.type(input(context), '0');
  await context.userEvent.keyboard('{Tab}');
  await expect(context.canvas.getByRole('button', { name: i18n.t('common.actions.send') })).toHaveFocus();
  await context.userEvent.keyboard('{Enter}');
  await waitFor(() => expect(chatRequest).toHaveBeenCalledTimes(2));
  await expect(chatRequest.mock.calls[1][0]).toMatchObject({ mode: 'study', study_session_id: studySessionId });
  await finishStudyResponse(context, english()
    ? 'AI assessment: ready to move on (mastery). Reason: Your answer matches the question.'
    : 'AIの判定: 次に進める解答（mastery）。理由: 問いの条件に合っています。');
} };
export const StudyRetryThenRestart: Story = { parameters: { chat: waiting }, async play(context) {
  await StudyGradingRetry.play!(context);
  await expect(chatRequest.mock.calls[1][0].messages).toEqual([
    { role: 'user', content: '0' },
    expect.objectContaining({ role: 'assistant', content: expect.stringContaining(english() ? 'could not grade' : '採点できませんでした') }),
    { role: 'user', content: '0' },
  ]);
  const restart = context.canvas.getByRole('button', { name: label('studySession.restart') });
  await context.userEvent.click(restart);
  const dialog = within(context.canvas.getByRole('dialog'));
  await context.userEvent.click(dialog.getByRole('button', { name: label('studySession.restart') }));
  await waitFor(() => expect(context.canvas.queryByRole('dialog')).not.toBeInTheDocument());
  await expect(context.canvas.getByRole('status')).toHaveTextContent(label('studySession.restarted'));
  await expect(context.canvas.queryByRole('button', { name: label('feedbackGood') })).not.toBeInTheDocument();
  const question = english() ? 'Start with topic B' : '話題Bから始めたい';
  await send(context, question);
  await expect(chatRequest.mock.calls[2][0].study_session_id).not.toBe(studySessionId);
  await expect(chatRequest.mock.calls[2][0].messages).toEqual([{ role: 'user', content: question }]);
  await finishStudyResponse(context, english() ? 'What do you notice about topic B?' : '話題Bについて、何に気づきますか？', 'started');
  await context.userEvent.click(context.canvas.getByRole('button', { name: label('modeQa') }));
  await expect(context.canvas.queryByRole('status')).not.toBeInTheDocument();
  await expect(input(context)).toHaveAccessibleDescription(label('qaGuidance'));
} };
export const Conversation: Story = { async play(context) {
  await complete(context);
  await expect(chatRequest).toHaveBeenCalledWith({ course_id: courseId, mode: 'qa', messages: [{ role: 'user', content: english() ? englishQuestion : question }], share_slug: undefined });
} };
export const ModeReset: Story = { async play(context) {
  await complete(context);
  await context.userEvent.click(context.canvas.getByRole('button', { name: label('modeStudy') }));
  await expect(context.canvas.queryByRole('button', { name: label('feedbackGood') })).not.toBeInTheDocument();
  await expect(context.canvas.getByText(label('studyGreeting'))).toBeVisible();
  await context.userEvent.click(context.canvas.getByRole('button', { name: label('modeQa') }));
  await expect(context.canvas.getByText(label('assistantGreeting'))).toBeVisible();
  await expect(input(context)).toHaveAccessibleDescription(label('qaGuidance'));
} };
export const IndependentQuestions: Story = { async play(context) {
  await send(context, '内積とは？');
  await waitFor(() => expect(input(context)).toBeEnabled());
  await send(context, '具体例を教えて');
  await waitFor(() => expect(chatRequest).toHaveBeenCalledTimes(2));
  await expect(chatRequest.mock.calls[1][0].messages).toEqual([{ role: 'user', content: '具体例を教えて' }]);
  await expect(context.canvas.getByText('内積とは？')).toBeVisible();
  await expect(input(context)).toHaveAccessibleDescription(label('qaGuidance'));
  await waitFor(() => expect(input(context)).toBeEnabled());
} };
export const SharedLink: Story = { args: { shareToken }, parameters: { api: { auth: authFixtures.loggedOut } }, async play(context) {
  await complete(context);
  await expect(context.canvas.getByRole('heading', { level: 3 })).toHaveTextContent(label('title'));
  await expect(context.canvas.queryByRole('button', { name: label('history') })).not.toBeInTheDocument();
  await expect(chatRequest).toHaveBeenCalledWith(expect.objectContaining({ share_slug: shareToken }));
  await expect(historyRequest).not.toHaveBeenCalled();
  await context.userEvent.click(context.canvas.getByRole('button', { name: label('feedbackGood') }));
  await waitFor(() => expect(feedbackRequest).toHaveBeenCalledWith({ chatLogId: 101, feedback: 'good', shareSlug: shareToken }));
} };
export const SharedStudy: Story = { args: { shareToken }, parameters: { api: { auth: authFixtures.loggedOut } }, async play(context) {
  await StudyMode.play!(context);
  await expect(chatRequest).toHaveBeenCalledWith(expect.objectContaining({ share_slug: shareToken, study_session_id: studySessionId }));
} };
export const AwaitingResponse: Story = { parameters: { chat: waiting }, async play(context) {
  await send(context); await assertBusy(context);
  await expect(context.canvas.getByRole('status')).toHaveTextContent(label('progress.preparing'));
  await expect(context.canvas.queryByRole('button', { name: label('feedbackGood') })).not.toBeInTheDocument();
} };
export const Searching: Story = { parameters: { chat: { events: searchingEvents, keepOpen: true } satisfies ChatPanelScenario }, async play(context) {
  await send(context); await assertBusy(context);
  const details = await context.canvas.findByRole('button', { name: `${label('progress.checkingVideos')}。${label('progress.details')}` });
  details.focus(); await context.userEvent.keyboard('{Enter}');
  await expect(details).toHaveAttribute('aria-expanded', 'true');
  await expect(context.canvas.getByText(searchQuery)).toBeVisible();
} };
export const Reviewing: Story = { parameters: { chat: { events: reviewedEvents, keepOpen: true } satisfies ChatPanelScenario }, async play(context) {
  await send(context);
  await expect(await context.canvas.findByRole('status')).toHaveTextContent(label('progress.checkingVideos'));
} };
export const Streaming: Story = { parameters: { chat: { events: [...reviewedEvents, { type: 'content_chunk', text: firstTokens }], keepOpen: true } satisfies ChatPanelScenario }, async play(context) {
  await send(context);
  await expect(await context.canvas.findByText(firstTokens)).toBeVisible();
  await assertBusy(context);
} };
export const ProgressToComplete: Story = { parameters: { chat: waiting }, async play(context) {
  await AwaitingResponse.play!(context);
  network.emit(searchingEvents);
  await waitFor(() => expect(context.canvas.getByRole('status')).toHaveTextContent(label('progress.checkingVideos')));
  network.emit([{ type: 'content_chunk', text: firstTokens }]);
  await expect(await context.canvas.findByText(firstTokens)).toBeVisible();
  network.emit([{ type: 'content_chunk', text: answer.slice(firstTokens.length) }, { type: 'done', chat_log_id: 101, feedback: null, citations }]);
  network.finish();
  await context.canvas.findByRole('button', { name: label('feedbackGood') });
  await waitFor(() => expect(input(context)).toBeEnabled());
} };
export const CompleteWithOpenConnection: Story = { parameters: { chat: { keepOpen: true } satisfies ChatPanelScenario }, async play(context) { await complete(context); } };
export const EmptyResponse: Story = { parameters: { chat: { events: [] } satisfies ChatPanelScenario }, async play(context) {
  await send(context); await waitFor(() => expect(input(context)).toBeEnabled());
  await expect(context.canvas.queryByRole('status')).not.toBeInTheDocument();
} };
export const StreamError: Story = { parameters: { chat: { events: [{ type: 'error', code: 'LLM_PROVIDER_ERROR', message: '' }] } satisfies ChatPanelScenario }, async play(context) {
  await send(context); await expect(await context.canvas.findByText(label('error'))).toBeVisible();
  await expect(input(context)).toBeEnabled();
} };
export const OverQuota: Story = { parameters: { chat: { events: [{ type: 'error', code: 'OVER_QUOTA', message: '' }] } satisfies ChatPanelScenario }, async play(context) {
  await send(context); await expect(await context.canvas.findByText(label('errorOverQuota'))).toBeVisible();
} };
export const PlogNotReady: Story = { parameters: { chat: { events: [{ type: 'error', code: 'PLOG_NOT_READY', message: '' }] } satisfies ChatPanelScenario }, async play(context) {
  await send(context); await expect(await context.canvas.findByText(label('errorPlogNotReady'))).toBeVisible();
} };
export const NetworkFailure: Story = { parameters: { chat: { httpError: true } satisfies ChatPanelScenario }, async play(context) {
  await StreamError.play!(context);
} };
export const InterruptedResponse: Story = { parameters: { chat: { events: [...searchingEvents, { type: 'content_chunk', text: firstTokens }], keepOpen: true } satisfies ChatPanelScenario }, async play(context) {
  await send(context); await context.canvas.findByText(firstTokens);
  network.emit([{ type: 'error', code: 'STREAM_INTERRUPTED', message: '' }]);
  network.finish();
  await expect(await context.canvas.findByText(label('error'))).toBeVisible();
  await expect(context.canvas.getByRole('status')).toHaveTextContent(label('progress.interrupted'));
  await waitFor(() => expect(input(context)).toBeEnabled());
} };
export const RetryAfterInterruption: Story = { parameters: InterruptedResponse.parameters, async play(context) {
  await InterruptedResponse.play!(context);
  await send(context, 'もう一度お願いします');
  await waitFor(() => expect(chatRequest).toHaveBeenCalledTimes(2));
  network.emit([{ type: 'content_chunk', text: answer.slice(firstTokens.length) }, { type: 'done', chat_log_id: 101, feedback: null, citations }]); network.finish();
  await context.canvas.findByRole('button', { name: label('feedbackGood') });
  await waitFor(() => expect(input(context)).toBeEnabled());
} };
export const HistoryDuringResponse: Story = { parameters: { chat: waiting }, async play(context) {
  await AwaitingResponse.play!(context); await openHistory(context);
  await context.canvas.findByText(courseHistory[0].asked_by!.email);
  network.emit(answerEvents()); network.finish();
  await expect(historyButton(context)).toHaveAttribute('aria-pressed', 'true');
  await context.userEvent.click(chatButton(context));
  await context.canvas.findByRole('button', { name: label('feedbackGood') });
  await waitFor(() => expect(input(context)).toBeEnabled());
} };
export const HistoryLoading: Story = { parameters: { chat: { historyState: 'pending' } satisfies ChatPanelScenario }, async play(context) {
  await openHistory(context); await expect(context.canvas.getByRole('progressbar')).toBeVisible();
  await expect(context.canvas.queryByText(label('historyEmpty'))).not.toBeInTheDocument();
} };
export const HistoryEmpty: Story = { parameters: { chat: { history: [], evaluations: [] } satisfies ChatPanelScenario }, async play(context) {
  await openHistory(context); await expect(await context.canvas.findByText(label('historyEmpty'))).toBeVisible();
} };
export const HistoryLoaded: Story = { parameters: { chat: { history: mixedHistory.map(item => ({ ...item, course: courseId })), evaluations: mixedHistory.flatMap(item => item.evaluation ? [item.evaluation] : []) } satisfies ChatPanelScenario }, async play(context) {
  await openHistory(context);
  await expect(await context.canvas.findByText(label('evaluation.status.completed'))).toBeVisible();
  await expect(context.canvas.getByText('94%')).toBeVisible();
  await expect(historyRequest).toHaveBeenCalledWith({ courseId, limit: 100, offset: 0 });
  await expect(evaluationRequest).toHaveBeenCalledWith({ courseId, limit: 200, offset: 0 });
} };
export const HistoryFailed: Story = { parameters: { chat: { historyState: 'error' } satisfies ChatPanelScenario }, async play(context) {
  await openHistory(context); await expect(await context.canvas.findByRole('alert')).toHaveTextContent(historyError);
  await expect(context.canvas.queryByText(label('historyEmpty'))).not.toBeInTheDocument();
} };
export const FeedbackToggleAndHistory: Story = { async play(context) {
  await openHistory(context); await context.canvas.findByText('94%');
  await context.userEvent.click(chatButton(context)); await complete(context);
  const good = context.canvas.getByRole('button', { name: label('feedbackGood') });
  const bad = context.canvas.getByRole('button', { name: label('feedbackBad') });
  for (const [button, value] of [[good, 'good'], [good, null], [bad, 'bad']] as const) {
    await context.userEvent.click(button);
    await waitFor(() => expect(feedbackRequest).toHaveBeenLastCalledWith({ chatLogId: 101, feedback: value }));
    await waitFor(() => expect(button).toBeEnabled());
  }
  await expect(bad).toHaveAttribute('aria-pressed', 'true');
  await openHistory(context); await context.canvas.findByText('94%');
  await expect(context.canvasElement.querySelector('.lucide-thumbs-down')).toBeInTheDocument();
} };
export const FeedbackPending: Story = { parameters: { chat: { feedback: 'pending' } satisfies ChatPanelScenario }, async play(context) {
  await complete(context); await context.userEvent.click(context.canvas.getByRole('button', { name: label('feedbackGood') }));
  await waitFor(() => expect(context.canvas.getByRole('button', { name: label('feedbackGood') })).toBeDisabled());
  await expect(context.canvas.getByRole('button', { name: label('feedbackBad') })).toBeDisabled();
} };
export const FeedbackFailureThenRetry: Story = { parameters: { chat: { feedback: 'retry' } satisfies ChatPanelScenario }, async play(context) {
  await complete(context);
  const good = context.canvas.getByRole('button', { name: label('feedbackGood') });
  await context.userEvent.click(good);
  await waitFor(() => expect(feedbackRequest).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(good).toBeEnabled());
  await expect(good).toHaveAttribute('aria-pressed', 'false');
  await context.userEvent.click(good);
  await waitFor(() => expect(good).toHaveAttribute('aria-pressed', 'true'));
  await expect(feedbackRequest).toHaveBeenCalledTimes(2);
} };
export const KeyboardSendAndCitation: Story = { async play(context) {
  input(context).focus(); await context.userEvent.keyboard('キーボードから質問します{Enter}');
  const reference = english() ? englishCitations[0] : citations[0];
  const citation = await context.canvas.findByRole('button', { name: `${reference.title} ${reference.start_time}` });
  citation.focus(); await context.userEvent.keyboard('{Enter}');
  await expect(context.args.onVideoPlay).toHaveBeenCalledWith(reference.video_id, reference.start_time);
} };
export const KeyboardModesAndHistory: Story = { async play(context) {
  const qa = context.canvas.getByRole('button', { name: label('modeQa') });
  qa.focus(); await context.userEvent.tab(); await context.userEvent.keyboard(' ');
  await expect(context.canvas.getByText(label('studyGreeting'))).toBeVisible();
  historyButton(context).focus(); await context.userEvent.keyboard('{Enter}');
  await context.canvas.findByText('94%');
  await context.userEvent.tab({ shift: true }); await expect(chatButton(context)).toHaveFocus();
  await context.userEvent.keyboard('{Enter}');
  await expect(context.canvas.getByText(label('studyGreeting'))).toBeVisible();
} };
export const SuggestedQuestions: Story = { args: { suggestedQuestions: [question, '回転行列を使った練習問題を出してください。'] }, parameters: { chat: waiting }, async play(context) {
  await context.userEvent.click(context.canvas.getByRole('button', { name: question }));
  await expect(input(context)).toHaveValue(question);
  await context.userEvent.click(context.canvas.getByRole('button', { name: i18n.t('common.actions.send') }));
  await waitFor(() => expect(input(context)).toBeDisabled());
  await expect(context.canvas.getByRole('button', { name: question })).toBeDisabled();
} };
export const JapaneseMobile: Story = { globals: { viewport: { value: 'mobile', isRotated: false } }, async play(context) { await complete(context); } };
export const EnglishMobile: Story = { globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } }, async play(context) {
  await complete(context);
  const frame = context.canvas.getByTestId('chat-panel-frame');
  await expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth);
} };
export const LongAnswerMobile: Story = { globals: { viewport: { value: 'mobile', isRotated: false } }, parameters: { chat: { events: [{ type: 'content_chunk', text: longAnswer }, { type: 'done', chat_log_id: 101, feedback: null, citations }] } satisfies ChatPanelScenario }, async play(context) {
  await complete(context);
  const scroller = context.canvasElement.querySelector('.overflow-y-auto')!;
  await expect(scroller.scrollTop).toBeGreaterThan(0);
  await expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth);
  const composer = input(context).getBoundingClientRect();
  await expect(composer.bottom).toBeLessThanOrEqual(context.canvasElement.ownerDocument.documentElement.clientHeight);
} };
export const ExportCsv: Story = { async play(context) {
  await openHistory(context); const csv = await context.canvas.findByRole('button', { name: 'CSV' });
  await context.userEvent.click(csv); await waitFor(() => expect(csvRequest).toHaveBeenCalledWith({ courseId }));
  await waitFor(() => expect(csv).toBeEnabled());
} };
export const ExportingCsv: Story = { parameters: { chat: { csv: 'pending' } satisfies ChatPanelScenario }, async play(context) {
  await openHistory(context); const csv = await context.canvas.findByRole('button', { name: 'CSV' });
  await context.userEvent.click(csv); await waitFor(() => expect(csv).toBeDisabled());
} };
export const ExportFailed: Story = { parameters: { chat: { csv: 'error' } satisfies ChatPanelScenario }, async play(context) { await ExportCsv.play!(context); } };
export const UnmountDuringResponse: Story = { parameters: { lifecycleControl: true, chat: waiting }, async play(context) {
  await AwaitingResponse.play!(context);
  await context.userEvent.click(context.canvas.getByRole('button', { name: 'Unmount panel' }));
  await waitFor(() => expect(network.activeStreams).toBe(0));
  await context.userEvent.click(context.canvas.getByRole('button', { name: 'Mount panel' }));
  network.emit(answerEvents());
  await expect(context.canvas.getByText(label('assistantGreeting'))).toBeVisible();
  await expect(context.canvas.queryByRole('button', { name: label('feedbackGood') })).not.toBeInTheDocument();
  await expect(input(context)).toBeEnabled();
} };


export const StudyRestart: Story = { async play(context) {
  await StudyMode.play!(context);
  const restart = context.canvas.getByRole('button', { name: label('studySession.restart') });
  await context.userEvent.type(input(context), '未送信の回答');
  await context.userEvent.click(restart);
  let dialog = within(context.canvas.getByRole('dialog'));
  await expect(dialog.getByText(label('studySession.restartConfirm'))).toBeVisible();
  await context.userEvent.click(dialog.getByRole('button', { name: i18n.t('common.actions.cancel') }));
  await expect(input(context)).toHaveValue('未送信の回答');
  await expect(context.canvas.getByRole('button', { name: label('feedbackGood') })).toBeVisible();
  await expect(sessionStorage.getItem(`plog-study-session:course:${courseId}`)).toBe(studySessionId);
  restart.focus();
  await context.userEvent.keyboard('{Enter}');
  dialog = within(context.canvas.getByRole('dialog'));
  await context.userEvent.click(dialog.getByRole('button', { name: label('studySession.restart') }));
  await waitFor(() => expect(context.canvas.queryByRole('dialog')).not.toBeInTheDocument());
  await expect(context.canvas.getByRole('status')).toHaveTextContent(label('studySession.restarted'));
  await expect(input(context)).toHaveValue('');
  await expect(context.canvas.queryByRole('button', { name: label('feedbackGood') })).not.toBeInTheDocument();
  await waitFor(() => expect(restart).toHaveFocus());
  await expect(chatRequest).toHaveBeenCalledTimes(1);
  await send(context, '新しい学習');
  const request = chatRequest.mock.calls[1][0];
  await expect(request.study_session_id).not.toBe(studySessionId);
  await expect(request.messages).toEqual([{ role: 'user', content: '新しい学習' }]);
  await expect(sessionStorage.getItem(`plog-study-session:share:${shareToken}`)).toBe(studySessionId);
} };
export const StudyRestartEnglishMobile: Story = { ...StudyRestart, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } } };
export const StudySaving: Story = { parameters: { chat: waiting }, async play(context) {
  await context.userEvent.click(context.canvas.getByRole('button', { name: label('modeStudy') }));
  await send(context);
  await expect(context.canvas.getByRole('button', { name: label('studySession.restart') })).toBeDisabled();
  await expect(context.canvas.getByRole('button', { name: label('modeQa') })).toBeDisabled();
} };
async function switchScopeDuringStudy(context: Context, target: ChatScope) {
  await StudySaving.play!(context);
  const original = chatRequest.mock.calls[0][0];
  const switchButton = context.canvas.getByRole('button', { name: switchContextLabel() });
  switchButton.focus();
  await context.userEvent.keyboard('{Enter}');
  await waitFor(() => expect(network.activeStreams).toBe(0));
  await expect(input(context)).toBeEnabled();
  await expect(context.canvas.getByRole('button', { name: label('modeQa') })).toHaveAttribute('aria-pressed', 'true');
  await expect(context.canvas.queryByText(english() ? englishQuestion : question)).not.toBeInTheDocument();
  await expect(input(context)).toHaveAccessibleDescription(label('qaGuidance'));
  await context.userEvent.click(context.canvas.getByRole('button', { name: label('modeStudy') }));
  await expect(context.canvas.getByRole('status')).toHaveTextContent(label('studySession.unconfirmed'));
  const newQuestion = english() ? 'Start this course' : 'この講座の学習を始めたい';
  await send(context, newQuestion);
  await waitFor(() => expect(chatRequest).toHaveBeenCalledTimes(2));
  await expect(chatRequest.mock.calls[1][0]).toMatchObject({
    course_id: target.courseId, share_slug: target.shareToken,
    study_session_id: otherStudySessionId,
    messages: [{ role: 'user', content: newQuestion }],
  });
  await finishStudyResponse(context, english() ? 'New course question' : '切り替え先の講座の問い', 'started');
  await context.userEvent.type(input(context), english() ? 'Unsent draft' : '送信前の下書き');
  await context.userEvent.click(switchButton);
  await expect(input(context)).toHaveValue('');
  await expect(context.canvas.queryByRole('button', { name: label('feedbackGood') })).not.toBeInTheDocument();
  await context.userEvent.click(context.canvas.getByRole('button', { name: label('modeStudy') }));
  await send(context, english() ? 'Resume this course' : '元の講座を続けたい');
  await waitFor(() => expect(chatRequest).toHaveBeenCalledTimes(3));
  await expect(chatRequest.mock.calls[2][0]).toMatchObject({
    course_id: original.course_id, share_slug: original.share_slug, study_session_id: studySessionId,
  });
  await expect(chatRequest.mock.calls[2][0].messages).toHaveLength(1);
  await finishStudyResponse(context, english() ? 'Resuming this course' : '元の講座の学習を再開します');
}
export const CourseSwitchDuringStudy: Story = {
  parameters: { chat: waiting },
  render: args => <ScopeSwitchExample {...args} target={{ courseId: otherCourseId }} />,
  play: context => switchScopeDuringStudy(context, { courseId: otherCourseId }),
};
export const ShareSwitchDuringStudy: Story = {
  args: { shareToken },
  parameters: { chat: waiting, api: { auth: authFixtures.loggedOut } },
  render: args => <ScopeSwitchExample {...args} target={{ courseId, shareToken: otherShareToken }} />,
  play: context => switchScopeDuringStudy(context, { courseId, shareToken: otherShareToken }),
};
export const StudyContinued: Story = { parameters: { chat: {
  events: [{ type: 'content_chunk', text: 'Study question' }, { type: 'done', chat_log_id: 101, feedback: null, study_session: { status: 'continued', expires_at: Date.now() + 43_200_000 } }],
} satisfies ChatPanelScenario }, async play(context) {
  await StudyMode.play!(context);
  await expect(context.canvas.getByText(label('studySession.continued'))).toBeVisible();
  await context.userEvent.click(context.canvas.getByRole('button', { name: label('modeQa') }));
  await context.userEvent.click(context.canvas.getByRole('button', { name: label('modeStudy') }));
  await expect(context.canvas.getByText(label('studySession.continued'))).toBeVisible();
  await send(context, '次の解答');
  await expect(chatRequest.mock.calls[1][0].study_session_id).toBe(studySessionId);
} };
