import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQueryClient } from '@tanstack/react-query';
import type { PlogGraph } from '@videoq/trpc';
import { trpc } from '@/lib/trpc';
import { PlogPanel } from '../PlogPanel';
import { readyGraph } from '../../../../../.storybook/fixtures/plog';

const emptyGraph: PlogGraph = {
  video_id: 42,
  build_status: 'ready',
  input_tokens: 0,
  output_tokens: 0,
  error_message: '',
  summary_node_count: 0,
  concepts: [],
  edges: [],
};

it('shows a completed empty graph as informational and allows manual additions', async () => {
  globalThis.__setTrpcHandler('plog.graph', () => emptyGraph);
  render(<PlogPanel videoId={42} />);

  expect(await screen.findByText('plog.statusLabel.empty')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('plog.noConceptsTitle');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText('plog.statusLabel.ready')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'plog.addConcept' })).toBeEnabled();
});

it('allows an explicit rebuild after an empty analysis', async () => {
  let rebuilding = false;
  const rebuild = vi.fn(() => {
    rebuilding = true;
    return { status: 'queued' };
  });
  globalThis.__setTrpcHandler('plog.graph', () => ({
    ...emptyGraph, build_status: rebuilding ? 'pending' : 'ready',
  }));
  globalThis.__setTrpcHandler('plog.rebuild', rebuild);
  render(<PlogPanel videoId={42} />);

  fireEvent.click(await screen.findByRole('button', { name: 'plog.rebuild' }));

  await waitFor(() => expect(rebuild).toHaveBeenCalledWith({ videoId: 42 }));
  expect(await screen.findByText('plog.buildingTitle')).toBeInTheDocument();
  expect(screen.queryByText('plog.noConceptsTitle')).not.toBeInTheDocument();
});

it.each(['pending', 'failed'])('does not label a %s build as empty', async (status) => {
  globalThis.__setTrpcHandler('plog.graph', () => ({
    ...emptyGraph, build_status: status, error_message: status === 'failed' ? 'API unavailable' : '',
  }));
  render(<PlogPanel videoId={42} />);

  expect(await screen.findByText(`plog.statusLabel.${status}`)).toBeInTheDocument();
  expect(screen.queryByText('plog.noConceptsTitle')).not.toBeInTheDocument();
  if (status === 'failed') {
    expect(screen.getByRole('alert')).toHaveTextContent('API unavailable');
  }
});

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('restores the graph and focuses the error after a rebuild request fails', async () => {
  globalThis.__setTrpcHandler('plog.graph', () => readyGraph);
  globalThis.__setTrpcHandler('plog.rebuild', () => { throw new Error('Queue unavailable'); });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<PlogPanel videoId={42} />);
  fireEvent.click(await screen.findByRole('button', { name: 'plog.rebuild' }));
  const error = await screen.findByRole('alert');
  expect(error).toHaveTextContent('plog.failedTitle');
  await waitFor(() => expect(error).toHaveFocus());
  expect(screen.getByRole('button', { name: readyGraph.concepts[0].label })).toBeVisible();
  expect(screen.getByRole('button', { name: 'plog.rebuild' })).toBeEnabled();
});

it('keeps a new-concept form and rebuild disabled until the updated graph arrives', async () => {
  let resolveGraph!: (graph: PlogGraph) => void;
  let changed = false;
  globalThis.__setTrpcHandler('plog.graph', () => changed ? new Promise<PlogGraph>(resolve => { resolveGraph = resolve; }) : readyGraph);
  globalThis.__setTrpcHandler('plog.createConcept', () => { changed = true; return { ...readyGraph.concepts[0], id: 4, label: 'new' }; });
  render(<PlogPanel videoId={42} />);
  fireEvent.click(await screen.findByRole('button', { name: 'plog.addConcept' }));
  const input = screen.getByRole('textbox', { name: 'plog.label' });
  fireEvent.change(input, { target: { value: 'new' } });
  fireEvent.click(screen.getByRole('button', { name: 'plog.save' }));
  await waitFor(() => expect(resolveGraph).toBeDefined());
  expect(input).toBeDisabled();
  expect(screen.getByRole('button', { name: 'plog.cancel' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'plog.rebuild' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'plog.cancel' }));
  expect(input).toBeInTheDocument();
  await act(async () => resolveGraph({ ...readyGraph, concepts: [...readyGraph.concepts, { ...readyGraph.concepts[0], id: 4, label: 'new' }] }));
  await waitFor(() => expect(input).not.toBeInTheDocument());
  expect(screen.getByRole('heading', { name: 'plog.conceptList' })).toHaveFocus();
});

it('preserves learning fields after a partial save fails and sends them on retry', async () => {
  const graph = structuredClone(readyGraph);
  const read = vi.fn(() => graph);
  globalThis.__setTrpcHandler('plog.graph', read);
  const update = vi.fn(() => {
    graph.concepts[0].label = 'Renamed concept';
    return graph.concepts[0];
  });
  const learning = vi.fn().mockRejectedValueOnce(new Error('Learning object failed')).mockResolvedValue(readyGraph.concepts[0]);
  globalThis.__setTrpcHandler('plog.updateConcept', update);
  globalThis.__setTrpcHandler('plog.updateLearningObject', learning);
  render(<PlogPanel videoId={42} />);
  fireEvent.click(await screen.findByRole('button', { name: readyGraph.concepts[0].label }));
  fireEvent.change(screen.getByRole('textbox', { name: 'plog.label' }), { target: { value: 'Renamed concept' } });
  const hints = screen.getByRole('textbox', { name: 'plog.hintLadder' });
  fireEvent.change(hints, { target: { value: ' first\n\nsecond ' } });
  fireEvent.click(screen.getByRole('button', { name: 'plog.save' }));
  await screen.findByRole('alert');
  expect(hints).toHaveValue(' first\n\nsecond ');
  expect(screen.getByRole('button', { name: 'plog.save' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'plog.save' }));
  await waitFor(() => expect(hints).not.toBeInTheDocument());
  expect(update).toHaveBeenCalledTimes(1);
  expect(learning).toHaveBeenCalledTimes(2);
  expect(learning).toHaveBeenLastCalledWith({ videoId: 42, conceptId: 1, hintLadder: ['first', 'second'] });
  expect(read).toHaveBeenCalledTimes(3);
});

it('closes an unchanged concept without writing or reloading the graph', async () => {
  const read = vi.fn(() => readyGraph);
  const update = vi.fn(() => readyGraph.concepts[0]);
  const learning = vi.fn(() => readyGraph.concepts[0]);
  globalThis.__setTrpcHandler('plog.graph', read);
  globalThis.__setTrpcHandler('plog.updateConcept', update);
  globalThis.__setTrpcHandler('plog.updateLearningObject', learning);
  render(<PlogPanel videoId={42} />);
  fireEvent.click(await screen.findByRole('button', { name: readyGraph.concepts[0].label }));
  fireEvent.change(screen.getByRole('textbox', { name: 'plog.label' }), { target: { value: ` ${readyGraph.concepts[0].label} ` } });
  fireEvent.change(screen.getByRole('textbox', { name: 'plog.hintLadder' }), { target: { value: ` ${readyGraph.concepts[0].hint_ladder.join('\n\n')} ` } });
  fireEvent.click(screen.getByRole('button', { name: 'plog.save' }));
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'plog.label' })).not.toBeInTheDocument());
  expect(screen.getByRole('heading', { name: 'plog.conceptList' })).toHaveFocus();
  expect(update).not.toHaveBeenCalled();
  expect(learning).not.toHaveBeenCalled();
  expect(read).toHaveBeenCalledTimes(1);
});

it.each(['concept', 'learning', 'both'] as const)('writes only changed %s fields and refreshes once', async (change) => {
  const read = vi.fn(() => readyGraph);
  const update = vi.fn(() => readyGraph.concepts[0]);
  const learning = vi.fn(() => readyGraph.concepts[0]);
  globalThis.__setTrpcHandler('plog.graph', read);
  globalThis.__setTrpcHandler('plog.updateConcept', update);
  globalThis.__setTrpcHandler('plog.updateLearningObject', learning);
  render(<PlogPanel videoId={42} />);
  fireEvent.click(await screen.findByRole('button', { name: readyGraph.concepts[0].label }));
  if (change !== 'learning') fireEvent.change(screen.getByRole('textbox', { name: 'plog.label' }), { target: { value: 'Renamed concept' } });
  if (change !== 'concept') fireEvent.change(screen.getByRole('textbox', { name: 'plog.hintLadder' }), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'plog.save' }));
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'plog.label' })).not.toBeInTheDocument());
  if (change === 'learning') expect(update).not.toHaveBeenCalled();
  else expect(update).toHaveBeenCalledExactlyOnceWith({ videoId: 42, conceptId: 1, label: 'Renamed concept' });
  if (change === 'concept') expect(learning).not.toHaveBeenCalled();
  else expect(learning).toHaveBeenCalledExactlyOnceWith({ videoId: 42, conceptId: 1, hintLadder: [] });
  expect(read).toHaveBeenCalledTimes(2);
});

it.each([false, true])('sends only changed edge fields (changed: %s)', async (changed) => {
  const graph = { ...readyGraph, edges: [readyGraph.edges[5]] };
  const read = vi.fn(() => graph);
  const update = vi.fn(() => graph.edges[0]);
  globalThis.__setTrpcHandler('plog.graph', read);
  globalThis.__setTrpcHandler('plog.updateEdge', update);
  render(<PlogPanel videoId={42} />);
  fireEvent.click(await screen.findByRole('button', { name: 'plog.edit' }));
  if (changed) fireEvent.change(screen.getByRole('textbox', { name: 'plog.quote' }), { target: { value: 'New evidence' } });
  fireEvent.click(screen.getByRole('button', { name: 'plog.save' }));
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'plog.quote' })).not.toBeInTheDocument());
  expect(screen.getByRole('heading', { name: 'plog.edgeList' })).toHaveFocus();
  if (changed) expect(update).toHaveBeenCalledExactlyOnceWith({ videoId: 42, edgeId: graph.edges[0].id, quote: 'New evidence' });
  else {
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText('plog.edgeProvenance.generated')).toBeInTheDocument();
  }
  expect(read).toHaveBeenCalledTimes(changed ? 2 : 1);
});

it('keeps the graph locked across both saves and their single refresh', async () => {
  let finishConcept!: (value: PlogGraph['concepts'][number]) => void;
  let finishLearning!: (value: PlogGraph['concepts'][number]) => void;
  let finishRead!: (value: PlogGraph) => void;
  const read = vi.fn().mockResolvedValueOnce(readyGraph).mockImplementation(() => new Promise(resolve => { finishRead = resolve; }));
  const update = vi.fn(() => new Promise(resolve => { finishConcept = resolve; }));
  const learning = vi.fn(() => new Promise(resolve => { finishLearning = resolve; }));
  globalThis.__setTrpcHandler('plog.graph', read);
  globalThis.__setTrpcHandler('plog.updateConcept', update);
  globalThis.__setTrpcHandler('plog.updateLearningObject', learning);
  render(<PlogPanel videoId={42} />);
  fireEvent.click(await screen.findByRole('button', { name: readyGraph.concepts[0].label }));
  const label = screen.getByRole('textbox', { name: 'plog.label' });
  fireEvent.change(label, { target: { value: 'Renamed concept' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'plog.hintLadder' }), { target: { value: 'new hint' } });
  fireEvent.click(screen.getByRole('button', { name: 'plog.save' }));
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  expect(label).toBeDisabled();
  expect(learning).not.toHaveBeenCalled();
  await act(async () => finishConcept(readyGraph.concepts[0]));
  await waitFor(() => expect(learning).toHaveBeenCalledTimes(1));
  expect(read).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'plog.rebuild' })).toBeDisabled();
  await act(async () => finishLearning(readyGraph.concepts[0]));
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  expect(label).toBeDisabled();
  expect(screen.getByRole('button', { name: 'plog.cancel' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'plog.rebuild' })).toBeDisabled();
  await act(async () => finishRead(readyGraph));
  await waitFor(() => expect(label).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'plog.rebuild' })).toBeEnabled();
});

it('retains edited fields when both saving and the recovery read fail', async () => {
  const read = vi.fn().mockResolvedValueOnce(readyGraph).mockRejectedValueOnce(new Error('Read failed')).mockResolvedValue(readyGraph);
  const update = vi.fn().mockRejectedValueOnce(new Error('Save failed')).mockResolvedValue(readyGraph.concepts[0]);
  const learning = vi.fn(() => readyGraph.concepts[0]);
  globalThis.__setTrpcHandler('plog.graph', read);
  globalThis.__setTrpcHandler('plog.updateConcept', update);
  globalThis.__setTrpcHandler('plog.updateLearningObject', learning);
  render(<PlogPanel videoId={42} />);
  fireEvent.click(await screen.findByRole('button', { name: readyGraph.concepts[0].label }));
  fireEvent.change(screen.getByRole('textbox', { name: 'plog.label' }), { target: { value: 'Keep this label' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'plog.hintLadder' }), { target: { value: 'Keep this hint' } });
  fireEvent.click(screen.getByRole('button', { name: 'plog.save' }));
  expect(await screen.findByText('plog.saveError')).toHaveFocus();
  expect(screen.getByText('plog.loadError')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'plog.label' })).toHaveValue('Keep this label');
  expect(screen.getByRole('textbox', { name: 'plog.hintLadder' })).toHaveValue('Keep this hint');
  expect(learning).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'plog.save' }));
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'plog.label' })).not.toBeInTheDocument());
  expect(update).toHaveBeenCalledTimes(2);
  expect(learning).toHaveBeenCalledExactlyOnceWith({ videoId: 42, conceptId: 1, hintLadder: ['Keep this hint'] });
  expect(read).toHaveBeenCalledTimes(3);
});

it('preserves untouched concept and learning fields when the graph changes during editing', async () => {
  let graph = structuredClone(readyGraph);
  globalThis.__setTrpcHandler('plog.graph', () => graph);
  const update = vi.fn(() => graph.concepts[0]);
  const learning = vi.fn(() => graph.concepts[0]);
  globalThis.__setTrpcHandler('plog.updateConcept', update);
  globalThis.__setTrpcHandler('plog.updateLearningObject', learning);
  const { result } = renderHook(() => useQueryClient());
  render(<PlogPanel videoId={42} />);
  fireEvent.click(await screen.findByRole('button', { name: readyGraph.concepts[0].label }));
  fireEvent.change(screen.getByRole('textbox', { name: 'plog.label' }), { target: { value: 'My label' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'plog.hintLadder' }), { target: { value: 'My hint' } });
  graph = { ...graph, concepts: graph.concepts.map(item => item.id === 1
    ? { ...item, source_quote: 'Updated quote', opening_question: 'Updated question' } : item) };
  await act(async () => { result.current.setQueryData(trpc.plog.graph.queryKey({ videoId: 42 }), graph); });
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'plog.sourceQuote' })).toHaveValue('Updated quote'));
  expect(screen.getByRole('textbox', { name: 'plog.openingQuestion' })).toHaveValue('Updated question');
  expect(screen.getByRole('textbox', { name: 'plog.label' })).toHaveValue('My label');
  fireEvent.click(screen.getByRole('button', { name: 'plog.save' }));
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'plog.label' })).not.toBeInTheDocument());
  expect(update).toHaveBeenCalledExactlyOnceWith({ videoId: 42, conceptId: 1, label: 'My label' });
  expect(learning).toHaveBeenCalledExactlyOnceWith({ videoId: 42, conceptId: 1, hintLadder: ['My hint'] });
});

it('preserves changed edge endpoints when only its quote is edited', async () => {
  let graph = { ...readyGraph, edges: [readyGraph.edges[0]] };
  globalThis.__setTrpcHandler('plog.graph', () => graph);
  const update = vi.fn(() => graph.edges[0]);
  globalThis.__setTrpcHandler('plog.updateEdge', update);
  const { result } = renderHook(() => useQueryClient());
  render(<PlogPanel videoId={42} />);
  fireEvent.click(await screen.findByRole('button', { name: 'plog.edit' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'plog.quote' }), { target: { value: 'My quote' } });
  graph = { ...graph, edges: [{ ...graph.edges[0], source_id: 3, source_label: graph.concepts[2].label }] };
  await act(async () => { result.current.setQueryData(trpc.plog.graph.queryKey({ videoId: 42 }), graph); });
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'plog.source' })).toHaveValue('3'));
  fireEvent.click(screen.getByRole('button', { name: 'plog.save' }));
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'plog.quote' })).not.toBeInTheDocument());
  expect(update).toHaveBeenCalledExactlyOnceWith({ videoId: 42, edgeId: graph.edges[0].id, quote: 'My quote' });
});

it('selects current endpoints after a concept has been removed', async () => {
  let graph = structuredClone(readyGraph);
  globalThis.__setTrpcHandler('plog.graph', () => graph);
  globalThis.__setTrpcHandler('plog.deleteConcept', () => {
    graph = { ...graph, concepts: graph.concepts.slice(1), edges: [] };
    return { deleted: true, id: 1 };
  });
  const createEdge = vi.fn(() => readyGraph.edges[0]);
  globalThis.__setTrpcHandler('plog.createEdge', createEdge);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<PlogPanel videoId={42} />);
  fireEvent.click(await screen.findByRole('button', { name: graph.concepts[0].label }));
  const fields = screen.getByRole('textbox', { name: 'plog.label' }).closest('fieldset')!;
  fireEvent.click(within(fields).getByRole('button', { name: 'plog.delete' }));
  await waitFor(() => expect(fields).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'plog.addEdge' }));
  expect(screen.getByRole('combobox', { name: 'plog.source' })).toHaveValue('2');
  expect(screen.getByRole('combobox', { name: 'plog.target' })).toHaveValue('3');
  fireEvent.click(screen.getByRole('button', { name: 'plog.save' }));
  await waitFor(() => expect(createEdge).toHaveBeenCalledWith({ videoId: 42, sourceId: 2, targetId: 3, edgeType: 'prerequisite_of', quote: '' }));
});

async function startPolling() {
  vi.useFakeTimers();
  const graph = { ...readyGraph, build_status: 'running' };
  const fetchGraph = vi.fn(() => graph);
  globalThis.__setTrpcHandler('plog.graph', fetchGraph);
  const view = render(<PlogPanel videoId={42} />);
  await act(() => vi.advanceTimersByTimeAsync(50));
  await act(() => vi.advanceTimersByTimeAsync(50));
  expect(fetchGraph).toHaveBeenCalledTimes(1);
  return { ...view, graph, fetchGraph };
}
it.each(['ready', 'failed'])('stops polling after a build becomes %s', async (status) => {
  const { graph, fetchGraph } = await startPolling();
  graph.build_status = status;
  await act(() => vi.advanceTimersByTimeAsync(3000));
  await act(() => vi.advanceTimersByTimeAsync(50));
  expect(screen.getByText(`plog.statusLabel.${status}`)).toBeInTheDocument();
  expect(fetchGraph).toHaveBeenCalledTimes(2);
  await act(() => vi.advanceTimersByTimeAsync(9000));
  expect(fetchGraph).toHaveBeenCalledTimes(2);
});
it.each(['hidden', 'unmounted'])('stops polling when the panel is %s', async (state) => {
  const { rerender, unmount, fetchGraph } = await startPolling();
  if (state === 'hidden') rerender(<PlogPanel videoId={42} enabled={false} />);
  else unmount();
  await act(() => vi.advanceTimersByTimeAsync(9000));
  expect(fetchGraph).toHaveBeenCalledTimes(1);
});
