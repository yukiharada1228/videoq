import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient, type PlogConcept, type PlogEdge, type PlogGraph } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ChipLabel } from '@/components/ui/chip-label';
import { Heading, HeadingTitle } from '@/components/ui/heading';
import { Input } from '@/components/ui/input';
import {
  NotificationBanner,
  NotificationBannerBody,
} from '@/components/ui/notification-banner';
import { Textarea } from '@/components/ui/textarea';
import { InlineSpinner } from '@/components/common/InlineSpinner';

interface PlogPanelProps {
  videoId: number;
  enabled?: boolean;
}

type PlogUiStatus = 'missing' | 'pending' | 'running' | 'ready' | 'failed';

const NODE_TYPES = ['object', 'property', 'limitation'] as const;
const EDGE_TYPES = [
  'prerequisite_of',
  'builds_on',
  'analogy_for',
  'example_of',
  'contrasts_with',
] as const;

function normalizeStatus(raw?: string): PlogUiStatus {
  switch (raw) {
    case 'ready':
      return 'ready';
    case 'pending':
      return 'pending';
    case 'running':
      return 'running';
    case 'failed':
      return 'failed';
    default:
      return 'missing';
  }
}

function statusChipColor(
  status: PlogUiStatus,
): 'gray' | 'blue' | 'green' | 'yellow' | 'red' {
  switch (status) {
    case 'ready':
      return 'green';
    case 'pending':
    case 'running':
      return 'blue';
    case 'failed':
      return 'red';
    default:
      return 'gray';
  }
}

function linesToList(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function listToLines(items: string[] | undefined): string {
  return (items ?? []).join('\n');
}

export function PlogPanel({ videoId, enabled = true }: PlogPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['plog', videoId],
    queryFn: () => apiClient.getPlogGraph(videoId),
    enabled: enabled && Number.isFinite(videoId),
    refetchInterval: (query) => {
      const status = query.state.data?.build_status;
      return status === 'pending' || status === 'running' ? 3000 : false;
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['plog', videoId] });
  };

  const rebuildMutation = useMutation({
    mutationFn: () => apiClient.rebuildPlog(videoId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['plog', videoId] });
      const previous = queryClient.getQueryData<PlogGraph>(['plog', videoId]);
      queryClient.setQueryData<PlogGraph>(['plog', videoId], (old) => ({
        video_id: videoId,
        build_status: 'pending',
        input_tokens: old?.input_tokens ?? 0,
        output_tokens: old?.output_tokens ?? 0,
        error_message: '',
        summary_node_count: old?.summary_node_count ?? 0,
        concepts: old?.concepts ?? [],
        edges: old?.edges ?? [],
      }));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['plog', videoId], context.previous);
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData<PlogGraph>(['plog', videoId], (old) => ({
        video_id: videoId,
        build_status: result.status === 'queued' ? 'pending' : result.status,
        input_tokens: old?.input_tokens ?? 0,
        output_tokens: old?.output_tokens ?? 0,
        error_message: '',
        summary_node_count: old?.summary_node_count ?? 0,
        concepts: old?.concepts ?? [],
        edges: old?.edges ?? [],
      }));
    },
    onSettled: invalidate,
  });

  const createConceptMutation = useMutation({
    mutationFn: (body: { label: string; node_type: string; intro_sec: number; source_quote: string }) =>
      apiClient.createPlogConcept(videoId, body),
    onSuccess: invalidate,
  });

  const updateConceptMutation = useMutation({
    mutationFn: ({
      conceptId,
      body,
    }: {
      conceptId: number;
      body: Partial<{ label: string; node_type: string; intro_sec: number; source_quote: string }>;
    }) => apiClient.updatePlogConcept(videoId, conceptId, body),
    onSuccess: invalidate,
  });

  const updateLoMutation = useMutation({
    mutationFn: ({
      conceptId,
      body,
    }: {
      conceptId: number;
      body: Partial<{
        opening_question: string;
        hint_ladder: string[];
        misconceptions: string[];
        canonical_order: string[];
        worked_examples: string[];
      }>;
    }) => apiClient.updatePlogLearningObject(videoId, conceptId, body),
    onSuccess: invalidate,
  });

  const deleteConceptMutation = useMutation({
    mutationFn: (conceptId: number) => apiClient.deletePlogConcept(videoId, conceptId),
    onSuccess: invalidate,
  });

  const mergeConceptMutation = useMutation({
    mutationFn: ({ survivorId, absorbId }: { survivorId: number; absorbId: number }) =>
      apiClient.mergePlogConcepts(videoId, survivorId, absorbId),
    onSuccess: invalidate,
  });

  const createEdgeMutation = useMutation({
    mutationFn: (body: {
      source_id: number;
      target_id: number;
      edge_type: string;
      quote: string;
    }) => apiClient.createPlogEdge(videoId, body),
    onSuccess: invalidate,
  });

  const updateEdgeMutation = useMutation({
    mutationFn: ({
      edgeId,
      body,
    }: {
      edgeId: number;
      body: Partial<{ edge_type: string; quote: string; source_id: number; target_id: number }>;
    }) => apiClient.updatePlogEdge(videoId, edgeId, body),
    onSuccess: invalidate,
  });

  const deleteEdgeMutation = useMutation({
    mutationFn: (edgeId: number) => apiClient.deletePlogEdge(videoId, edgeId),
    onSuccess: invalidate,
  });

  if (!enabled) {
    return null;
  }

  const status = normalizeStatus(data?.build_status);
  const isBusy =
    rebuildMutation.isPending || status === 'pending' || status === 'running';
  const primaryActionLabel =
    status === 'ready' || status === 'failed' ? t('plog.rebuild') : t('plog.build');

  const requestRebuild = () => {
    const hasGraph =
      status === 'ready' && (data?.concepts.length ?? 0) + (data?.edges.length ?? 0) > 0;
    if (hasGraph && !window.confirm(t('plog.rebuildConfirm'))) {
      return;
    }
    rebuildMutation.mutate();
  };

  const mutating =
    createConceptMutation.isPending ||
    updateConceptMutation.isPending ||
    updateLoMutation.isPending ||
    deleteConceptMutation.isPending ||
    mergeConceptMutation.isPending ||
    createEdgeMutation.isPending ||
    updateEdgeMutation.isPending ||
    deleteEdgeMutation.isPending;

  return (
    <section className="mt-2 border border-solid-gray-420 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-solid-gray-200 px-4 py-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Heading size="18" className="min-w-0">
              <HeadingTitle level="h2">{t('plog.title')}</HeadingTitle>
            </Heading>
            {!isLoading && (
              <ChipLabel
                variant="filled-1"
                color={statusChipColor(status)}
                className="min-h-0 text-oln-14N-100"
              >
                {t(`plog.statusLabel.${status}`)}
              </ChipLabel>
            )}
            {isBusy && isFetching && <InlineSpinner className="text-solid-gray-560" />}
          </div>
          <p className="text-dns-14N-120 text-solid-gray-560">{t('plog.subtitle')}</p>
        </div>

        {(status === 'ready' || status === 'failed') && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={requestRebuild}
              disabled={rebuildMutation.isPending}
            >
              {rebuildMutation.isPending ? <InlineSpinner /> : primaryActionLabel}
            </Button>
          </div>
        )}
      </div>

      <div className="px-4 py-4">
        {isLoading && (
          <p className="text-dns-14N-120 text-solid-gray-560">{t('plog.loading')}</p>
        )}

        {error && (
          <NotificationBanner
            bannerStyle="standard"
            type="error"
            title={t('plog.loadError')}
            role="alert"
          >
            <NotificationBannerBody />
          </NotificationBanner>
        )}

        {!isLoading && !error && data && (
          <PlogBody
            data={data}
            status={status}
            isBusy={isBusy || mutating}
            primaryActionLabel={primaryActionLabel}
            onBuild={requestRebuild}
            rebuildPending={rebuildMutation.isPending}
            onCreateConcept={(body) => createConceptMutation.mutateAsync(body)}
            onUpdateConcept={(conceptId, body) =>
              updateConceptMutation.mutateAsync({ conceptId, body })
            }
            onUpdateLearningObject={(conceptId, body) =>
              updateLoMutation.mutateAsync({ conceptId, body })
            }
            onDeleteConcept={(conceptId) => deleteConceptMutation.mutateAsync(conceptId)}
            onMergeConcept={(survivorId, absorbId) =>
              mergeConceptMutation.mutateAsync({ survivorId, absorbId })
            }
            onCreateEdge={(body) => createEdgeMutation.mutateAsync(body)}
            onUpdateEdge={(edgeId, body) => updateEdgeMutation.mutateAsync({ edgeId, body })}
            onDeleteEdge={(edgeId) => deleteEdgeMutation.mutateAsync(edgeId)}
          />
        )}
      </div>
    </section>
  );
}

function PlogBody({
  data,
  status,
  isBusy,
  primaryActionLabel,
  onBuild,
  rebuildPending,
  onCreateConcept,
  onUpdateConcept,
  onUpdateLearningObject,
  onDeleteConcept,
  onMergeConcept,
  onCreateEdge,
  onUpdateEdge,
  onDeleteEdge,
}: {
  data: PlogGraph;
  status: PlogUiStatus;
  isBusy: boolean;
  primaryActionLabel: string;
  onBuild: () => void;
  rebuildPending: boolean;
  onCreateConcept: (body: {
    label: string;
    node_type: string;
    intro_sec: number;
    source_quote: string;
  }) => Promise<unknown>;
  onUpdateConcept: (
    conceptId: number,
    body: Partial<{ label: string; node_type: string; intro_sec: number; source_quote: string }>,
  ) => Promise<unknown>;
  onUpdateLearningObject: (
    conceptId: number,
    body: Partial<{
      opening_question: string;
      hint_ladder: string[];
      misconceptions: string[];
      canonical_order: string[];
      worked_examples: string[];
    }>,
  ) => Promise<unknown>;
  onDeleteConcept: (conceptId: number) => Promise<unknown>;
  onMergeConcept: (survivorId: number, absorbId: number) => Promise<unknown>;
  onCreateEdge: (body: {
    source_id: number;
    target_id: number;
    edge_type: string;
    quote: string;
  }) => Promise<unknown>;
  onUpdateEdge: (
    edgeId: number,
    body: Partial<{ edge_type: string; quote: string; source_id: number; target_id: number }>,
  ) => Promise<unknown>;
  onDeleteEdge: (edgeId: number) => Promise<unknown>;
}) {
  const { t } = useTranslation();

  if (status === 'missing') {
    return (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2 max-w-2xl">
          <p className="text-dns-16B-120 text-solid-gray-800">{t('plog.emptyTitle')}</p>
          <p className="text-dns-14N-120 text-solid-gray-560">{t('plog.emptyDescription')}</p>
        </div>
        <Button
          type="button"
          variant="solid"
          size="sm"
          className="shrink-0"
          onClick={onBuild}
          disabled={rebuildPending}
        >
          {rebuildPending ? <InlineSpinner /> : primaryActionLabel}
        </Button>
      </div>
    );
  }

  if (status === 'pending' || status === 'running') {
    return (
      <NotificationBanner
        bannerStyle="standard"
        type="info1"
        title={t('plog.buildingTitle')}
        role="status"
      >
        <NotificationBannerBody>{t('plog.buildingDescription')}</NotificationBannerBody>
      </NotificationBanner>
    );
  }

  if (status === 'failed') {
    return (
      <div className="space-y-4">
        <NotificationBanner
          bannerStyle="standard"
          type="error"
          title={t('plog.failedTitle')}
          role="alert"
        >
          <NotificationBannerBody>
            {data.error_message || t('plog.failedDescription')}
          </NotificationBannerBody>
        </NotificationBanner>
        <Button
          type="button"
          variant="solid"
          size="sm"
          onClick={onBuild}
          disabled={rebuildPending || isBusy}
        >
          {rebuildPending ? <InlineSpinner /> : t('plog.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-dns-14N-120 text-solid-gray-700">
        <div className="flex gap-2">
          <dt className="text-solid-gray-560">{t('plog.metricConcepts')}</dt>
          <dd className="font-medium">{data.concepts.length}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-solid-gray-560">{t('plog.metricEdges')}</dt>
          <dd className="font-medium">{data.edges.length}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-solid-gray-560">{t('plog.metricSummaries')}</dt>
          <dd className="font-medium">{data.summary_node_count}</dd>
        </div>
      </dl>

      <ConceptEditor
        concepts={data.concepts}
        disabled={isBusy}
        onCreate={onCreateConcept}
        onUpdate={onUpdateConcept}
        onUpdateLearningObject={onUpdateLearningObject}
        onDelete={onDeleteConcept}
        onMerge={onMergeConcept}
      />

      <EdgeEditor
        concepts={data.concepts}
        edges={data.edges}
        disabled={isBusy}
        onCreate={onCreateEdge}
        onUpdate={onUpdateEdge}
        onDelete={onDeleteEdge}
      />
    </div>
  );
}

function ConceptEditor({
  concepts,
  disabled,
  onCreate,
  onUpdate,
  onUpdateLearningObject,
  onDelete,
  onMerge,
}: {
  concepts: PlogConcept[];
  disabled: boolean;
  onCreate: (body: {
    label: string;
    node_type: string;
    intro_sec: number;
    source_quote: string;
  }) => Promise<unknown>;
  onUpdate: (
    conceptId: number,
    body: Partial<{ label: string; node_type: string; intro_sec: number; source_quote: string }>,
  ) => Promise<unknown>;
  onUpdateLearningObject: (
    conceptId: number,
    body: Partial<{
      opening_question: string;
      hint_ladder: string[];
      misconceptions: string[];
      canonical_order: string[];
      worked_examples: string[];
    }>,
  ) => Promise<unknown>;
  onDelete: (conceptId: number) => Promise<unknown>;
  onMerge: (survivorId: number, absorbId: number) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<string>('object');
  const [newIntro, setNewIntro] = useState('0');

  const submitNew = async () => {
    setError('');
    try {
      await onCreate({
        label: newLabel.trim(),
        node_type: newType,
        intro_sec: Number(newIntro) || 0,
        source_quote: '',
      });
      setNewLabel('');
      setNewType('object');
      setNewIntro('0');
      setAdding(false);
    } catch {
      setError(t('plog.saveError'));
    }
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-dns-16B-120 text-solid-gray-800">{t('plog.conceptList')}</h3>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => setAdding((v) => !v)}
        >
          {t('plog.addConcept')}
        </Button>
      </div>

      {error && <p className="mb-2 text-dns-14N-120 text-error-1">{error}</p>}

      {adding && (
        <div className="mb-3 space-y-2 border border-solid-gray-200 p-3">
          <label className="block space-y-1 text-dns-14N-120">
            <span>{t('plog.label')}</span>
            <Input blockSize="sm" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="space-y-1 text-dns-14N-120">
              <span className="block">{t('plog.nodeTypeLabel')}</span>
              <select
                className="h-10 rounded-8 border border-solid-gray-600 bg-white px-3"
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
              >
                {NODE_TYPES.map((nt) => (
                  <option key={nt} value={nt}>
                    {t(`plog.nodeType.${nt}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-dns-14N-120">
              <span className="block">{t('plog.introSec')}</span>
              <Input
                blockSize="sm"
                type="number"
                value={newIntro}
                onChange={(e) => setNewIntro(e.target.value)}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void submitNew()} disabled={disabled || !newLabel.trim()}>
              {t('plog.save')}
            </Button>
            <Button type="button" size="sm" variant="text" onClick={() => setAdding(false)}>
              {t('plog.cancel')}
            </Button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-solid-gray-100 border-y border-solid-gray-100">
        {concepts.map((c) => (
          <li key={c.id} className="py-2">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-dns-14N-120">
              <button
                type="button"
                className="font-medium text-solid-gray-800 underline-offset-2 hover:underline"
                onClick={() => setExpandedId((id) => (id === c.id ? null : c.id))}
              >
                {c.label}
              </button>
              <span className="text-solid-gray-560">
                {t(`plog.nodeType.${c.node_type}`, { defaultValue: c.node_type })}
                {' · '}
                {t('plog.introAt', { seconds: Math.round(c.intro_sec) })}
                {c.hint_count > 0
                  ? ` · ${t('plog.hintCount', { count: c.hint_count })}`
                  : ` · ${t('plog.noHints')}`}
              </span>
              <Button
                type="button"
                size="xs"
                variant="text"
                className="ml-auto"
                onClick={() => setExpandedId((id) => (id === c.id ? null : c.id))}
              >
                {expandedId === c.id ? t('plog.collapse') : t('plog.expand')}
              </Button>
            </div>
            {expandedId === c.id && (
              <ConceptDetailForm
                concept={c}
                concepts={concepts}
                disabled={disabled}
                onUpdate={onUpdate}
                onUpdateLearningObject={onUpdateLearningObject}
                onDelete={onDelete}
                onMerge={onMerge}
                onClose={() => setExpandedId(null)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConceptDetailForm({
  concept,
  concepts,
  disabled,
  onUpdate,
  onUpdateLearningObject,
  onDelete,
  onMerge,
  onClose,
}: {
  concept: PlogConcept;
  concepts: PlogConcept[];
  disabled: boolean;
  onUpdate: (
    conceptId: number,
    body: Partial<{ label: string; node_type: string; intro_sec: number; source_quote: string }>,
  ) => Promise<unknown>;
  onUpdateLearningObject: (
    conceptId: number,
    body: Partial<{
      opening_question: string;
      hint_ladder: string[];
      misconceptions: string[];
      canonical_order: string[];
      worked_examples: string[];
    }>,
  ) => Promise<unknown>;
  onDelete: (conceptId: number) => Promise<unknown>;
  onMerge: (survivorId: number, absorbId: number) => Promise<unknown>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(concept.label);
  const [nodeType, setNodeType] = useState(concept.node_type);
  const [introSec, setIntroSec] = useState(String(concept.intro_sec));
  const [sourceQuote, setSourceQuote] = useState(concept.source_quote || '');
  const [opening, setOpening] = useState(concept.opening_question || '');
  const [hints, setHints] = useState(listToLines(concept.hint_ladder));
  const [misconceptions, setMisconceptions] = useState(listToLines(concept.misconceptions));
  const [canonical, setCanonical] = useState(listToLines(concept.canonical_order));
  const [examples, setExamples] = useState(listToLines(concept.worked_examples));
  const [absorbId, setAbsorbId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onUpdate(concept.id, {
        label: label.trim(),
        node_type: nodeType,
        intro_sec: Number(introSec) || 0,
        source_quote: sourceQuote,
      });
      await onUpdateLearningObject(concept.id, {
        opening_question: opening,
        hint_ladder: linesToList(hints),
        misconceptions: linesToList(misconceptions),
        canonical_order: linesToList(canonical),
        worked_examples: linesToList(examples),
      });
      onClose();
    } catch {
      setError(t('plog.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t('plog.deleteConceptConfirm'))) return;
    setSaving(true);
    setError('');
    try {
      await onDelete(concept.id);
      onClose();
    } catch {
      setError(t('plog.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const merge = async () => {
    const id = Number(absorbId);
    if (!id || id === concept.id) return;
    if (!window.confirm(t('plog.mergeConceptConfirm'))) return;
    setSaving(true);
    setError('');
    try {
      await onMerge(concept.id, id);
      onClose();
    } catch {
      setError(t('plog.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 border border-solid-gray-200 bg-solid-gray-50 p-3">
      {error && <p className="text-dns-14N-120 text-error-1">{error}</p>}
      <label className="block space-y-1 text-dns-14N-120">
        <span>{t('plog.label')}</span>
        <Input blockSize="sm" value={label} onChange={(e) => setLabel(e.target.value)} disabled={disabled || saving} />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1 text-dns-14N-120">
          <span className="block">{t('plog.nodeTypeLabel')}</span>
          <select
            className="h-10 rounded-8 border border-solid-gray-600 bg-white px-3"
            value={nodeType}
            disabled={disabled || saving}
            onChange={(e) => setNodeType(e.target.value)}
          >
            {NODE_TYPES.map((nt) => (
              <option key={nt} value={nt}>
                {t(`plog.nodeType.${nt}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-dns-14N-120">
          <span className="block">{t('plog.introSec')}</span>
          <Input
            blockSize="sm"
            type="number"
            value={introSec}
            disabled={disabled || saving}
            onChange={(e) => setIntroSec(e.target.value)}
          />
        </label>
      </div>
      <label className="block space-y-1 text-dns-14N-120">
        <span>{t('plog.sourceQuote')}</span>
        <Textarea value={sourceQuote} onChange={(e) => setSourceQuote(e.target.value)} disabled={disabled || saving} rows={2} />
      </label>
      <label className="block space-y-1 text-dns-14N-120">
        <span>{t('plog.openingQuestion')}</span>
        <Textarea value={opening} onChange={(e) => setOpening(e.target.value)} disabled={disabled || saving} rows={2} />
      </label>
      <label className="block space-y-1 text-dns-14N-120">
        <span>{t('plog.hintLadder')}</span>
        <Textarea value={hints} onChange={(e) => setHints(e.target.value)} disabled={disabled || saving} rows={3} />
      </label>
      <label className="block space-y-1 text-dns-14N-120">
        <span>{t('plog.misconceptions')}</span>
        <Textarea
          value={misconceptions}
          onChange={(e) => setMisconceptions(e.target.value)}
          disabled={disabled || saving}
          rows={2}
        />
      </label>
      <label className="block space-y-1 text-dns-14N-120">
        <span>{t('plog.canonicalOrder')}</span>
        <Textarea value={canonical} onChange={(e) => setCanonical(e.target.value)} disabled={disabled || saving} rows={2} />
      </label>
      <label className="block space-y-1 text-dns-14N-120">
        <span>{t('plog.workedExamples')}</span>
        <Textarea value={examples} onChange={(e) => setExamples(e.target.value)} disabled={disabled || saving} rows={2} />
      </label>
      {(concept.waypoints?.length ?? 0) > 0 && (
        <div className="text-dns-14N-120 text-solid-gray-700">
          <p className="mb-1 font-medium">{t('plog.waypoints')}</p>
          <ul className="list-disc space-y-1 pl-5">
            {concept.waypoints.map((wp, i) => (
              <li key={i}>
                {wp.label || '—'}
                {typeof wp.start_sec === 'number' && ` (${Math.round(wp.start_sec)}s)`}
              </li>
            ))}
          </ul>
        </div>
      )}
      <label className="block space-y-1 text-dns-14N-120">
        <span>{t('plog.mergeIntoThis')}</span>
        <select
          className="h-10 w-full rounded-8 border border-solid-gray-600 bg-white px-3"
          value={absorbId}
          onChange={(e) => setAbsorbId(e.target.value)}
          disabled={disabled || saving}
        >
          <option value="">{t('plog.mergeSelect')}</option>
          {concepts
            .filter((c) => c.id !== concept.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void save()} disabled={disabled || saving || !label.trim()}>
          {saving ? <InlineSpinner /> : t('plog.save')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void merge()}
          disabled={disabled || saving || !absorbId}
        >
          {t('plog.merge')}
        </Button>
        <Button type="button" size="sm" variant="text" onClick={onClose} disabled={saving}>
          {t('plog.cancel')}
        </Button>
        <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => void remove()} disabled={disabled || saving}>
          {t('plog.delete')}
        </Button>
      </div>
    </div>
  );
}

function EdgeEditor({
  concepts,
  edges,
  disabled,
  onCreate,
  onUpdate,
  onDelete,
}: {
  concepts: PlogConcept[];
  edges: PlogEdge[];
  disabled: boolean;
  onCreate: (body: {
    source_id: number;
    target_id: number;
    edge_type: string;
    quote: string;
  }) => Promise<unknown>;
  onUpdate: (
    edgeId: number,
    body: Partial<{ edge_type: string; quote: string; source_id: number; target_id: number }>,
  ) => Promise<unknown>;
  onDelete: (edgeId: number) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [sourceId, setSourceId] = useState<number>(concepts[0]?.id ?? 0);
  const [targetId, setTargetId] = useState<number>(concepts[1]?.id ?? concepts[0]?.id ?? 0);
  const [edgeType, setEdgeType] = useState<string>('prerequisite_of');
  const [quote, setQuote] = useState('');

  const submitNew = async () => {
    setError('');
    try {
      await onCreate({
        source_id: sourceId,
        target_id: targetId,
        edge_type: edgeType,
        quote,
      });
      setAdding(false);
      setQuote('');
    } catch {
      setError(t('plog.saveError'));
    }
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-dns-16B-120 text-solid-gray-800">{t('plog.edgeList')}</h3>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={disabled || concepts.length < 2}
          onClick={() => setAdding((v) => !v)}
        >
          {t('plog.addEdge')}
        </Button>
      </div>
      <p className="mb-2 text-dns-14N-120 text-solid-gray-560">{t('plog.edgeHelp')}</p>
      {error && <p className="mb-2 text-dns-14N-120 text-error-1">{error}</p>}

      {adding && (
        <div className="mb-3 space-y-2 border border-solid-gray-200 p-3">
          <div className="flex flex-wrap gap-3">
            <label className="space-y-1 text-dns-14N-120">
              <span className="block">{t('plog.source')}</span>
              <select
                className="h-10 rounded-8 border border-solid-gray-600 bg-white px-3"
                value={sourceId}
                onChange={(e) => setSourceId(Number(e.target.value))}
              >
                {concepts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-dns-14N-120">
              <span className="block">{t('plog.target')}</span>
              <select
                className="h-10 rounded-8 border border-solid-gray-600 bg-white px-3"
                value={targetId}
                onChange={(e) => setTargetId(Number(e.target.value))}
              >
                {concepts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-dns-14N-120">
              <span className="block">{t('plog.edgeTypeLabel')}</span>
              <select
                className="h-10 rounded-8 border border-solid-gray-600 bg-white px-3"
                value={edgeType}
                onChange={(e) => setEdgeType(e.target.value)}
              >
                {EDGE_TYPES.map((et) => (
                  <option key={et} value={et}>
                    {t(`plog.edgeType.${et}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-dns-14N-120">
            <span>{t('plog.quote')}</span>
            <Textarea value={quote} onChange={(e) => setQuote(e.target.value)} rows={2} />
          </label>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void submitNew()} disabled={disabled}>
              {t('plog.save')}
            </Button>
            <Button type="button" size="sm" variant="text" onClick={() => setAdding(false)}>
              {t('plog.cancel')}
            </Button>
          </div>
        </div>
      )}

      <ul className="space-y-0 divide-y divide-solid-gray-100 border-y border-solid-gray-100">
        {edges.map((edge) => (
          <li key={edge.id} className="py-2.5 text-dns-14N-120">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-solid-gray-800">
                {edge.source_label}
                <span className="mx-1.5 text-solid-gray-420">→</span>
                {edge.target_label}
              </span>
              <ChipLabel variant="outlined" color="gray" className="min-h-0 text-oln-14N-100">
                {t(`plog.edgeType.${edge.edge_type}`, { defaultValue: edge.edge_type })}
              </ChipLabel>
              <span className="ml-auto flex flex-wrap gap-1">
                <Button
                  type="button"
                  size="xs"
                  variant="text"
                  disabled={disabled}
                  onClick={() => setEditingId((id) => (id === edge.id ? null : edge.id))}
                >
                  {t('plog.edit')}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="text"
                  disabled={disabled}
                  onClick={() => {
                    if (!window.confirm(t('plog.deleteEdgeConfirm'))) return;
                    void onDelete(edge.id).catch(() => setError(t('plog.saveError')));
                  }}
                >
                  {t('plog.delete')}
                </Button>
              </span>
            </div>
            {edge.quote && (
              <p className="mt-1 text-solid-gray-560">
                {t('plog.quote')}: {edge.quote}
              </p>
            )}
            {editingId === edge.id && (
              <EdgeEditForm
                edge={edge}
                concepts={concepts}
                disabled={disabled}
                onSave={async (body) => {
                  try {
                    await onUpdate(edge.id, body);
                    setEditingId(null);
                  } catch {
                    setError(t('plog.saveError'));
                  }
                }}
                onCancel={() => setEditingId(null)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EdgeEditForm({
  edge,
  concepts,
  disabled,
  onSave,
  onCancel,
}: {
  edge: PlogEdge;
  concepts: PlogConcept[];
  disabled: boolean;
  onSave: (body: {
    source_id: number;
    target_id: number;
    edge_type: string;
    quote: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [sourceId, setSourceId] = useState(edge.source_id);
  const [targetId, setTargetId] = useState(edge.target_id);
  const [edgeType, setEdgeType] = useState(edge.edge_type);
  const [quote, setQuote] = useState(edge.quote || '');

  return (
    <div className="mt-2 space-y-2 border border-solid-gray-200 bg-solid-gray-50 p-3">
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1 text-dns-14N-120">
          <span className="block">{t('plog.source')}</span>
          <select
            className="h-10 rounded-8 border border-solid-gray-600 bg-white px-3"
            value={sourceId}
            disabled={disabled}
            onChange={(e) => setSourceId(Number(e.target.value))}
          >
            {concepts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-dns-14N-120">
          <span className="block">{t('plog.target')}</span>
          <select
            className="h-10 rounded-8 border border-solid-gray-600 bg-white px-3"
            value={targetId}
            disabled={disabled}
            onChange={(e) => setTargetId(Number(e.target.value))}
          >
            {concepts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-dns-14N-120">
          <span className="block">{t('plog.edgeTypeLabel')}</span>
          <select
            className="h-10 rounded-8 border border-solid-gray-600 bg-white px-3"
            value={edgeType}
            disabled={disabled}
            onChange={(e) => setEdgeType(e.target.value)}
          >
            {EDGE_TYPES.map((et) => (
              <option key={et} value={et}>
                {t(`plog.edgeType.${et}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-dns-14N-120">
        <span>{t('plog.quote')}</span>
        <Textarea value={quote} onChange={(e) => setQuote(e.target.value)} disabled={disabled} rows={2} />
      </label>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          onClick={() =>
            void onSave({
              source_id: sourceId,
              target_id: targetId,
              edge_type: edgeType,
              quote,
            })
          }
        >
          {t('plog.save')}
        </Button>
        <Button type="button" size="sm" variant="text" onClick={onCancel}>
          {t('plog.cancel')}
        </Button>
      </div>
    </div>
  );
}
