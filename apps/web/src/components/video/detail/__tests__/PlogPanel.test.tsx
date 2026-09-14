import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlogGraph } from '@videoq/trpc';
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
  globalThis.__setTrpcHandler('plog.graph', () => readyGraph);
  const update = vi.fn(() => readyGraph.concepts[0]);
  const learning = vi.fn().mockRejectedValueOnce(new Error('Learning object failed')).mockResolvedValue(readyGraph.concepts[0]);
  globalThis.__setTrpcHandler('plog.updateConcept', update);
  globalThis.__setTrpcHandler('plog.updateLearningObject', learning);
  render(<PlogPanel videoId={42} />);
  fireEvent.click(await screen.findByRole('button', { name: readyGraph.concepts[0].label }));
  const hints = screen.getByRole('textbox', { name: 'plog.hintLadder' });
  fireEvent.change(hints, { target: { value: ' first\n\nsecond ' } });
  fireEvent.click(screen.getByRole('button', { name: 'plog.save' }));
  await screen.findByRole('alert');
  expect(hints).toHaveValue(' first\n\nsecond ');
  expect(screen.getByRole('button', { name: 'plog.save' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'plog.save' }));
  await waitFor(() => expect(hints).not.toBeInTheDocument());
  expect(update).toHaveBeenCalledTimes(2);
  expect(learning).toHaveBeenCalledTimes(2);
  expect(learning).toHaveBeenLastCalledWith(expect.objectContaining({ videoId: 42, conceptId: 1, hintLadder: ['first', 'second'] }));
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
