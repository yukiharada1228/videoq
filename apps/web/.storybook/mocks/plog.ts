import { fn } from 'storybook/test';
import type { PlogGraph } from '@videoq/trpc';
import { concept, readyGraph } from '../fixtures/plog';
import { failure, pending, success, trpcHandler, trpcMutation, trpcQuery } from './network';

type Outcome = 'pending' | 'error' | 'retry';
export const mutationRequests = {
  rebuild: fn(), createConcept: fn(), updateConcept: fn(), updateLearningObject: fn(), deleteConcept: fn(), mergeConcepts: fn(), createEdge: fn(), updateEdge: fn(), deleteEdge: fn(),
};
export type Action = keyof typeof mutationRequests;
export interface PlogScenario {
  data?: PlogGraph;
  load?: 'pending' | 'error';
  actions?: Partial<Record<Action, Outcome>>;
  progressBuild?: boolean;
  refetchPending?: boolean;
}
export const graphRequest = fn();

export function plogHandler(scenario: PlogScenario = {}) {
  const data = structuredClone(scenario.data ?? readyGraph);
  const attempts: Partial<Record<Action, number>> = {};
  let changed = false;
  let building = false;
  let buildReads = 0;
  graphRequest.mockClear();
  Object.values(mutationRequests).forEach(mock => mock.mockClear());
  const begin = (action: Action, input: unknown) => {
    mutationRequests[action](input);
    attempts[action] = (attempts[action] ?? 0) + 1;
    const outcome = scenario.actions?.[action];
    if (outcome === 'pending') return pending();
    if (outcome === 'error' || (outcome === 'retry' && attempts[action] === 1)) return failure('Operation failed (fixture)');
    changed = true;
    return null;
  };
  const findConcept = (id: number) => {
    const item = data.concepts.find(item => item.id === id);
    if (!item) throw new Error(`Unknown fixture concept ${id}`);
    return item;
  };
  const refreshLabels = () => {
    data.edges = data.edges.map(edge => ({ ...edge, source_label: findConcept(edge.source_id).label, target_label: findConcept(edge.target_id).label }));
  };
  return trpcHandler([
    trpcQuery('plog.graph', input => {
      graphRequest(input);
      if (scenario.load === 'pending' || (changed && scenario.refetchPending)) return pending();
      if (scenario.load === 'error') return failure('Graph unavailable (fixture)');
      if (building && scenario.progressBuild) data.build_status = ['pending', 'running', 'ready'][Math.min(buildReads++, 2)];
      return success(data);
    }),
    trpcMutation('plog.rebuild', input => {
      const error = begin('rebuild', input); if (error) return error;
      building = true; buildReads = 0; data.build_status = 'pending'; data.error_message = '';
      return success({ video_id: input.videoId, status: 'queued', job_id: 100 });
    }),
    trpcMutation('plog.createConcept', input => {
      const error = begin('createConcept', input); if (error) return error;
      const item = concept(1 + Math.max(0, ...data.concepts.map(item => item.id)), input.label, { node_type: input.nodeType ?? 'object', intro_sec: input.introSec ?? 0, source_quote: input.sourceQuote ?? '', opening_question: '', hint_ladder: [], misconceptions: [], canonical_order: [], worked_examples: [], waypoints: [], hint_count: 0, waypoint_count: 0 });
      data.concepts.push(item); return success(item);
    }),
    trpcMutation('plog.updateConcept', input => {
      const error = begin('updateConcept', input); if (error) return error;
      const item = findConcept(input.conceptId);
      Object.assign(item, { label: input.label ?? item.label, node_type: input.nodeType ?? item.node_type, intro_sec: input.introSec ?? item.intro_sec, source_quote: input.sourceQuote ?? item.source_quote });
      refreshLabels(); return success(item);
    }),
    trpcMutation('plog.updateLearningObject', input => {
      const error = begin('updateLearningObject', input); if (error) return error;
      const item = findConcept(input.conceptId);
      Object.assign(item, { opening_question: input.openingQuestion ?? item.opening_question, hint_ladder: input.hintLadder ?? item.hint_ladder, misconceptions: input.misconceptions ?? item.misconceptions, canonical_order: input.canonicalOrder ?? item.canonical_order, worked_examples: input.workedExamples ?? item.worked_examples });
      item.hint_count = item.hint_ladder.length; return success(item);
    }),
    trpcMutation('plog.deleteConcept', input => {
      const error = begin('deleteConcept', input); if (error) return error;
      data.concepts = data.concepts.filter(item => item.id !== input.conceptId);
      data.edges = data.edges.filter(item => item.source_id !== input.conceptId && item.target_id !== input.conceptId);
      return success({ deleted: true as const, id: input.conceptId });
    }),
    trpcMutation('plog.mergeConcepts', input => {
      const error = begin('mergeConcepts', input); if (error) return error;
      const survivor = findConcept(input.survivorId);
      survivor.hint_ladder = [...new Set([...survivor.hint_ladder, ...findConcept(input.absorbId).hint_ladder])];
      survivor.hint_count = survivor.hint_ladder.length;
      data.concepts = data.concepts.filter(item => item.id !== input.absorbId);
      data.edges = data.edges.map(edge => ({ ...edge, source_id: edge.source_id === input.absorbId ? input.survivorId : edge.source_id, target_id: edge.target_id === input.absorbId ? input.survivorId : edge.target_id })).filter(edge => edge.source_id !== edge.target_id);
      refreshLabels(); return success(survivor);
    }),
    trpcMutation('plog.createEdge', input => {
      const error = begin('createEdge', input); if (error) return error;
      const edge = { id: 1 + Math.max(10, ...data.edges.map(item => item.id)), source_id: input.sourceId, source_label: findConcept(input.sourceId).label, target_id: input.targetId, target_label: findConcept(input.targetId).label, edge_type: input.edgeType, quote: input.quote ?? '' };
      data.edges.push(edge); return success(edge);
    }),
    trpcMutation('plog.updateEdge', input => {
      const error = begin('updateEdge', input); if (error) return error;
      const item = data.edges.find(item => item.id === input.edgeId)!;
      Object.assign(item, { source_id: input.sourceId ?? item.source_id, target_id: input.targetId ?? item.target_id, edge_type: input.edgeType ?? item.edge_type, quote: input.quote ?? item.quote });
      refreshLabels(); return success(data.edges.find(item => item.id === input.edgeId)!);
    }),
    trpcMutation('plog.deleteEdge', input => {
      const error = begin('deleteEdge', input); if (error) return error;
      data.edges = data.edges.filter(item => item.id !== input.edgeId); return success({ deleted: true as const, id: input.edgeId });
    }),
  ]);
}
