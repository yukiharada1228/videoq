import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import i18n from '@/i18n/config';
import { Button } from '@/components/ui/button';
import { PlogPanel } from './PlogPanel';
import { authFixtures } from '../../../../.storybook/fixtures/auth';
import { concepts, edges, edgeTypes, emptyGraph, englishGraph, failedGraph, longGraph, longLabel, manyGraph, missingGraph, readyGraph, videoId } from '../../../../.storybook/fixtures/plog';
import { graphRequest, mutationRequests, plogHandler, type Action, type PlogScenario } from '../../../../.storybook/mocks/plog';

const confirmRequest = fn();
const label = (key: string) => i18n.t(`plog.${key}`);
function PanelExample({ lifecycleControl, ...args }: ComponentProps<typeof PlogPanel> & { lifecycleControl: boolean }) {
  const [visible, setVisible] = useState(true);
  return <div data-testid="plog-frame" style={{ maxWidth: 1000 }}>
    {lifecycleControl && <Button onClick={() => setVisible(value => !value)}>{visible ? 'Hide panel' : 'Show panel'}</Button>}
    <PlogPanel {...args} enabled={args.enabled && visible} />
  </div>;
}
const meta = {
  title: 'Video/PlogPanel', component: PlogPanel,
  args: { videoId, enabled: true },
  parameters: { api: { auth: authFixtures.user }, docs: { story: { inline: false, height: '900px' } } },
  render: (args, { parameters }) => <PanelExample key={args.videoId} {...args} lifecycleControl={parameters.lifecycleControl === true} />,
  beforeEach({ parameters, msw }) {
    msw.use(plogHandler({ data: i18n.language.startsWith('en') ? englishGraph : readyGraph, ...parameters.plog as PlogScenario | undefined }));
    const original = window.confirm;
    confirmRequest.mockReset().mockReturnValue(parameters.confirm !== false);
    window.confirm = confirmRequest;
    return () => { window.confirm = original; };
  },
} satisfies Meta<typeof PlogPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
type Context = Parameters<NonNullable<Story['play']>>[0];
const heading = (context: Context, kind: 'concept' | 'edge') => context.canvas.getByRole('heading', { name: label(`${kind}List`) });
const section = (context: Context, kind: 'concept' | 'edge') => within(heading(context, kind).parentElement!.parentElement!);
const form = (context: Context, kind: 'concept' | 'edge') => {
  const fieldset = heading(context, kind).parentElement!.parentElement!.querySelector('fieldset');
  if (!fieldset) throw new Error(`Missing ${kind} form`);
  return within(fieldset);
};
async function ready(context: Context) { await context.canvas.findByRole('heading', { name: label('conceptList') }); }
async function addConcept(context: Context, text = '追加した概念') {
  await ready(context); await context.userEvent.click(section(context, 'concept').getByRole('button', { name: label('addConcept') }));
  const fields = form(context, 'concept');
  await expect(fields.getByRole('textbox', { name: label('label') })).toHaveFocus();
  await context.userEvent.type(fields.getByRole('textbox', { name: label('label') }), text);
  return fields;
}
async function detail(context: Context, name = concepts[0].label) {
  await ready(context); await context.userEvent.click(section(context, 'concept').getByRole('button', { name }));
  const fields = form(context, 'concept');
  await expect(fields.getByRole('textbox', { name: label('label') })).toHaveFocus();
  return fields;
}
async function addEdge(context: Context) {
  await ready(context); await context.userEvent.click(section(context, 'edge').getByRole('button', { name: label('addEdge') }));
  const fields = form(context, 'edge');
  await expect(fields.getByRole('combobox', { name: label('source') })).toHaveFocus();
  await context.userEvent.type(fields.getByRole('textbox', { name: label('quote') }), '追加した関係の根拠');
  return fields;
}
async function editEdge(context: Context) {
  await ready(context); await context.userEvent.click(section(context, 'edge').getAllByRole('button', { name: label('edit') })[0]);
  const fields = form(context, 'edge');
  await expect(fields.getByRole('combobox', { name: label('source') })).toHaveFocus();
  return fields;
}
async function submit(context: Context, action: Action) {
  if (action === 'rebuild') { await ready(context); await context.userEvent.click(context.canvas.getByRole('button', { name: label('rebuild') })); }
  else if (action === 'createConcept') await context.userEvent.click((await addConcept(context)).getByRole('button', { name: label('save') }));
  else if (action === 'updateConcept' || action === 'updateLearningObject') await context.userEvent.click((await detail(context)).getByRole('button', { name: label('save') }));
  else if (action === 'deleteConcept') await context.userEvent.click((await detail(context)).getByRole('button', { name: label('delete') }));
  else if (action === 'mergeConcepts') {
    const fields = await detail(context);
    await context.userEvent.selectOptions(fields.getByRole('combobox', { name: label('mergeIntoThis') }), '2');
    await context.userEvent.click(fields.getByRole('button', { name: label('merge') }));
  } else if (action === 'createEdge') await context.userEvent.click((await addEdge(context)).getByRole('button', { name: label('save') }));
  else if (action === 'updateEdge') await context.userEvent.click((await editEdge(context)).getByRole('button', { name: label('save') }));
  else { await ready(context); await context.userEvent.click(section(context, 'edge').getAllByRole('button', { name: label('delete') })[0]); }
  await waitFor(() => expect(mutationRequests[action]).toHaveBeenCalledTimes(1));
}
function mutationStory(action: Action, outcome: 'pending' | 'error'): Story {
  return {
    parameters: { plog: { actions: { [action]: outcome } } satisfies PlogScenario },
    async play(context) {
      await submit(context, action);
      if (outcome === 'error') {
        const error = await context.canvas.findByRole('alert');
        await expect(error).toHaveTextContent(label(action === 'rebuild' ? 'failedTitle' : 'saveError'));
        await waitFor(() => expect(error).toHaveFocus());
        await expect(context.canvas.getByRole('button', { name: label('rebuild') })).toBeEnabled();
      } else if (action === 'rebuild') {
        await expect(context.canvas.getByRole('status')).toHaveTextContent(label('buildingTitle'));
      } else {
        await expect(context.canvas.getByRole('button', { name: label('rebuild') })).toBeDisabled();
        for (const kind of ['concept', 'edge'] as const) {
          const root = heading(context, kind).parentElement!.parentElement!;
          for (const control of root.querySelectorAll('input,textarea,select,button')) await expect(control).toBeDisabled();
        }
      }
    },
  };
}
async function noOverflow(context: Context) {
  const frame = context.canvas.getByTestId('plog-frame');
  await expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth);
}

export const Loading: Story = { parameters: { plog: { load: 'pending' } satisfies PlogScenario }, async play({ canvas }) { await expect(canvas.getByText(label('loading'))).toBeVisible(); } };
export const LoadFailed: Story = { parameters: { plog: { load: 'error' } satisfies PlogScenario }, async play({ canvas }) { await expect(await canvas.findByRole('alert')).toHaveTextContent(label('loadError')); } };
export const Disabled: Story = { args: { enabled: false }, async play({ canvas }) { await expect(canvas.queryByRole('heading')).not.toBeInTheDocument(); await expect(graphRequest).not.toHaveBeenCalled(); } };
export const Missing: Story = { parameters: { plog: { data: missingGraph } satisfies PlogScenario }, async play({ canvas }) { await expect(await canvas.findByText(label('emptyTitle'))).toBeVisible(); } };
export const Pending: Story = { parameters: { plog: { data: { ...emptyGraph, build_status: 'pending' } } satisfies PlogScenario }, async play({ canvas }) { await expect(await canvas.findByRole('status')).toHaveTextContent(label('buildingTitle')); } };
export const Running: Story = { parameters: { plog: { data: { ...emptyGraph, build_status: 'running' } } satisfies PlogScenario }, async play({ canvas }) { await expect(await canvas.findByText(label('statusLabel.running'))).toBeVisible(); } };
export const Failed: Story = { parameters: { plog: { data: failedGraph } satisfies PlogScenario }, async play({ canvas }) { await expect(await canvas.findByRole('alert')).toHaveTextContent(failedGraph.error_message); } };
export const FailedWithoutDetails: Story = { parameters: { plog: { data: { ...failedGraph, error_message: '' } } satisfies PlogScenario }, async play({ canvas }) { await expect(await canvas.findByRole('alert')).toHaveTextContent(label('failedDescription')); } };
export const Ready: Story = { async play(context) { await ready(context); for (const type of edgeTypes) await expect(section(context, 'edge').getByText(label(`edgeType.${type}`))).toBeVisible(); } };
export const EmptyGraph: Story = { parameters: { plog: { data: emptyGraph } satisfies PlogScenario }, async play(context) { await ready(context); await expect(context.canvas.getByRole('status')).toHaveTextContent(label('noConceptsTitle')); await expect(section(context, 'edge').getByRole('button', { name: label('addEdge') })).toBeDisabled(); } };
export const ManyItems: Story = { parameters: { plog: { data: manyGraph } satisfies PlogScenario }, async play(context) { await ready(context); await expect(section(context, 'concept').getAllByRole('button', { name: label('expand') })).toHaveLength(24); await expect(section(context, 'edge').getAllByRole('button', { name: label('edit') })).toHaveLength(23); } };
export const BuildFromMissing: Story = { parameters: Missing.parameters, async play(context) {
  await context.userEvent.click(await context.canvas.findByRole('button', { name: label('build') }));
  await waitFor(() => expect(mutationRequests.rebuild).toHaveBeenCalledWith({ videoId }));
  await expect(context.canvas.getByRole('status')).toHaveTextContent(label('buildingTitle'));
  await expect(confirmRequest).not.toHaveBeenCalled();
} };
export const RebuildCancelled: Story = { parameters: { confirm: false }, async play(context) {
  await ready(context); await context.userEvent.click(context.canvas.getByRole('button', { name: label('rebuild') }));
  await expect(confirmRequest).toHaveBeenCalledWith(label('rebuildConfirm')); await expect(mutationRequests.rebuild).not.toHaveBeenCalled();
} };
export const RebuildPending = mutationStory('rebuild', 'pending');
export const RebuildFailed = mutationStory('rebuild', 'error');
export const RetryBuild: Story = { parameters: Failed.parameters, async play(context) {
  await context.userEvent.click(await context.canvas.findByRole('button', { name: label('retry') }));
  await waitFor(() => expect(mutationRequests.rebuild).toHaveBeenCalledWith({ videoId }));
  await expect(context.canvas.getByRole('status')).toHaveTextContent(label('buildingTitle'));
} };
export const BuildPolling: Story = { parameters: { plog: { progressBuild: true } satisfies PlogScenario }, async play(context) {
  await submit(context, 'rebuild');
  await waitFor(() => expect(context.canvas.getByText(label('statusLabel.running'))).toBeVisible(), { timeout: 4500 });
  await waitFor(() => expect(context.canvas.getByText(label('statusLabel.ready'))).toBeVisible(), { timeout: 4500 });
  await expect(graphRequest.mock.calls.length).toBeGreaterThanOrEqual(4);
} };
export const PollingStopsWhenHidden: Story = { parameters: { ...Pending.parameters, lifecycleControl: true }, async play(context) {
  await context.canvas.findByRole('status'); await context.userEvent.click(context.canvas.getByRole('button', { name: 'Hide panel' }));
  const calls = graphRequest.mock.calls.length;
  await new Promise(resolve => setTimeout(resolve, 3200)); await expect(graphRequest).toHaveBeenCalledTimes(calls);
} };

export const ConceptDetails: Story = { async play(context) {
  const fields = await detail(context);
  await expect(fields.getByRole('textbox', { name: label('sourceQuote') })).toHaveValue(concepts[0].source_quote);
  await expect(fields.getByRole('textbox', { name: label('hintLadder') })).toHaveValue(concepts[0].hint_ladder.join('\n'));
  await expect(fields.getByText('回転行列の導入 (60s)')).toBeVisible();
} };
export const AddConcept: Story = { async play(context) { const fields = await addConcept(context); await expect(fields.getByRole('button', { name: label('save') })).toBeEnabled(); } };
export const CreateConceptSucceeded: Story = { async play(context) {
  await submit(context, 'createConcept'); await expect(await section(context, 'concept').findByRole('button', { name: '追加した概念' })).toBeVisible();
  await waitFor(() => expect(heading(context, 'concept')).toHaveFocus());
  await expect(mutationRequests.createConcept).toHaveBeenCalledWith({ videoId, label: '追加した概念', nodeType: 'object', introSec: 0, sourceQuote: '' });
} };
export const CreateConceptPending = mutationStory('createConcept', 'pending');
export const CreateConceptFailed = mutationStory('createConcept', 'error');
export const UpdateConceptPending = mutationStory('updateConcept', 'pending');
export const UpdateConceptFailed = mutationStory('updateConcept', 'error');
export const LearningObjectPending = mutationStory('updateLearningObject', 'pending');
export const LearningObjectFailed = mutationStory('updateLearningObject', 'error');
export const SaveConceptAndLearningFields: Story = { async play(context) {
  const fields = await detail(context);
  await context.userEvent.clear(fields.getByRole('textbox', { name: label('label') })); await context.userEvent.type(fields.getByRole('textbox', { name: label('label') }), '更新した概念');
  await context.userEvent.selectOptions(fields.getByRole('combobox', { name: label('nodeTypeLabel') }), 'property');
  await context.userEvent.clear(fields.getByRole('spinbutton')); await context.userEvent.type(fields.getByRole('spinbutton'), '95');
  const values = { sourceQuote: '新しい引用', openingQuestion: '新しい問い', hintLadder: ' ヒント1\n\nヒント2 ', misconceptions: '誤概念A\n誤概念B', canonicalOrder: '手順1\n手順2', workedExamples: '例題A\n例題B' };
  for (const [key, value] of Object.entries(values)) { await context.userEvent.clear(fields.getByRole('textbox', { name: label(key) })); await context.userEvent.type(fields.getByRole('textbox', { name: label(key) }), value); }
  await context.userEvent.click(fields.getByRole('button', { name: label('save') }));
  await waitFor(() => expect(heading(context, 'concept')).toHaveFocus());
  await expect(mutationRequests.updateConcept).toHaveBeenCalledWith({ videoId, conceptId: 1, label: '更新した概念', nodeType: 'property', introSec: 95, sourceQuote: '新しい引用' });
  await expect(mutationRequests.updateLearningObject).toHaveBeenCalledWith({ videoId, conceptId: 1, openingQuestion: '新しい問い', hintLadder: ['ヒント1', 'ヒント2'], misconceptions: ['誤概念A', '誤概念B'], canonicalOrder: ['手順1', '手順2'], workedExamples: ['例題A', '例題B'] });
} };
export const LearningFailureThenRetry: Story = { parameters: { plog: { actions: { updateLearningObject: 'retry' } } satisfies PlogScenario }, async play(context) {
  await LearningObjectFailed.play!(context);
  await context.userEvent.click(form(context, 'concept').getByRole('button', { name: label('save') }));
  await waitFor(() => expect(heading(context, 'concept')).toHaveFocus());
  await expect(mutationRequests.updateLearningObject).toHaveBeenCalledTimes(2);
} };
export const SaveRefetchPending: Story = { parameters: { plog: { refetchPending: true } satisfies PlogScenario }, async play(context) {
  await submit(context, 'createConcept');
  await waitFor(() => expect(graphRequest).toHaveBeenCalledTimes(2));
  await expect(form(context, 'concept').getByRole('button', { name: label('cancel') })).toBeDisabled();
} };
export const DeleteConceptCancelled: Story = { parameters: { confirm: false }, async play(context) {
  await context.userEvent.click((await detail(context)).getByRole('button', { name: label('delete') }));
  await expect(confirmRequest).toHaveBeenCalledWith(label('deleteConceptConfirm')); await expect(mutationRequests.deleteConcept).not.toHaveBeenCalled();
} };
export const DeleteConceptSucceeded: Story = { async play(context) {
  await submit(context, 'deleteConcept');
  await waitFor(() => expect(section(context, 'concept').queryByRole('button', { name: concepts[0].label })).not.toBeInTheDocument());
  await waitFor(() => expect(heading(context, 'concept')).toHaveFocus());
  await expect(mutationRequests.deleteConcept).toHaveBeenCalledWith({ videoId, conceptId: 1 });
  await context.userEvent.click(section(context, 'edge').getByRole('button', { name: label('addEdge') }));
  await context.userEvent.click(form(context, 'edge').getByRole('button', { name: label('save') }));
  await waitFor(() => expect(mutationRequests.createEdge).toHaveBeenCalledWith({ videoId, sourceId: 2, targetId: 3, edgeType: 'prerequisite_of', quote: '' }));
} };
export const DeleteConceptPending = mutationStory('deleteConcept', 'pending');
export const DeleteConceptFailed = mutationStory('deleteConcept', 'error');
export const MergeConceptPending = mutationStory('mergeConcepts', 'pending');
export const MergeConceptFailed = mutationStory('mergeConcepts', 'error');
export const MergeConceptSucceeded: Story = { async play(context) {
  await submit(context, 'mergeConcepts');
  await waitFor(() => expect(heading(context, 'concept')).toHaveFocus());
  await expect(section(context, 'concept').queryByRole('button', { name: concepts[1].label })).not.toBeInTheDocument();
  await expect(confirmRequest).toHaveBeenCalledWith(label('mergeConceptConfirm'));
  await expect(mutationRequests.mergeConcepts).toHaveBeenCalledWith({ videoId, survivorId: 1, absorbId: 2 });
} };

export const AddEdge: Story = { async play(context) { await addEdge(context); } };
export const EditEdge: Story = { async play(context) { const fields = await editEdge(context); await expect(fields.getByRole('textbox', { name: label('quote') })).toHaveValue(edges[0].quote); } };
export const CreateEdgeSucceeded: Story = { async play(context) {
  await submit(context, 'createEdge'); await waitFor(() => expect(heading(context, 'edge')).toHaveFocus());
  await expect(mutationRequests.createEdge).toHaveBeenCalledWith({ videoId, sourceId: 1, targetId: 2, edgeType: 'prerequisite_of', quote: '追加した関係の根拠' });
} };
export const CreateEdgePending = mutationStory('createEdge', 'pending');
export const CreateEdgeFailed = mutationStory('createEdge', 'error');
export const UpdateEdgePending = mutationStory('updateEdge', 'pending');
export const UpdateEdgeFailed = mutationStory('updateEdge', 'error');
export const UpdateEdgeSucceeded: Story = { async play(context) {
  const fields = await editEdge(context);
  await context.userEvent.selectOptions(fields.getByRole('combobox', { name: label('source') }), '3');
  await context.userEvent.selectOptions(fields.getByRole('combobox', { name: label('edgeTypeLabel') }), 'contrasts_with');
  await context.userEvent.clear(fields.getByRole('textbox', { name: label('quote') })); await context.userEvent.type(fields.getByRole('textbox', { name: label('quote') }), '更新した根拠');
  await context.userEvent.click(fields.getByRole('button', { name: label('save') }));
  await waitFor(() => expect(heading(context, 'edge')).toHaveFocus());
  await expect(mutationRequests.updateEdge).toHaveBeenCalledWith({ videoId, edgeId: 11, sourceId: 3, targetId: 2, edgeType: 'contrasts_with', quote: '更新した根拠' });
} };
export const DeleteEdgePending = mutationStory('deleteEdge', 'pending');
export const DeleteEdgeFailed = mutationStory('deleteEdge', 'error');
export const DeleteEdgeSucceeded: Story = { async play(context) {
  await submit(context, 'deleteEdge'); await waitFor(() => expect(heading(context, 'edge')).toHaveFocus());
  await expect(confirmRequest).toHaveBeenCalledWith(label('deleteEdgeConfirm'));
  await expect(section(context, 'edge').getAllByRole('button', { name: label('delete') })).toHaveLength(4);
} };
export const KeyboardConcept: Story = { async play(context) {
  const fields = await addConcept(context, 'キーボード入力');
  await context.userEvent.tab(); await expect(fields.getByRole('combobox')).toHaveFocus();
  await context.userEvent.tab(); await expect(fields.getByRole('spinbutton')).toHaveFocus();
  await context.userEvent.tab(); await expect(fields.getByRole('button', { name: label('save') })).toHaveFocus();
  await context.userEvent.keyboard('{Enter}'); await waitFor(() => expect(heading(context, 'concept')).toHaveFocus());
} };
export const KeyboardEdgeCancel: Story = { async play(context) {
  const fields = await editEdge(context);
  await context.userEvent.tab(); await expect(fields.getByRole('combobox', { name: label('target') })).toHaveFocus();
  await context.userEvent.tab(); await context.userEvent.tab(); await context.userEvent.tab(); await context.userEvent.tab();
  await expect(fields.getByRole('button', { name: label('cancel') })).toHaveFocus();
  await context.userEvent.keyboard(' '); await expect(heading(context, 'edge')).toHaveFocus();
} };
export const LongConceptMobile: Story = { globals: { viewport: { value: 'mobile', isRotated: false } }, parameters: { plog: { data: longGraph } satisfies PlogScenario }, async play(context) { await detail(context, longLabel); await noOverflow(context); } };
export const LongEdgeMobile: Story = { globals: { viewport: { value: 'mobile', isRotated: false } }, parameters: LongConceptMobile.parameters, async play(context) { await addEdge(context); await noOverflow(context); } };
export const EnglishMobile: Story = { globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } }, async play(context) { await detail(context, englishGraph.concepts[0].label); await noOverflow(context); } };
