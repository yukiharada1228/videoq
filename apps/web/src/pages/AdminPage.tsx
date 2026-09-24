import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useI18nNavigate } from '@/lib/i18n';
import type { AdminUser } from '@/lib/api';
import { ApiError, getApiError } from '@/lib/api-error';
import { appTrpcClient, trpc } from '@/lib/trpc';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { ErrorMessage } from '@/components/auth/ErrorMessage';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SupportText } from '@/components/ui/support-text';
import { Button } from '@/components/ui/button';
import { ChipLabel } from '@/components/ui/chip-label';
import { Heading, HeadingTitle } from '@/components/ui/heading';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogHeading,
  useDialog,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const SECTION_CLASS = 'border-t border-solid-gray-420 pt-8';
const PAGE_SIZE = 20;

function nullableNumberInput(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function requiredPositiveInt(value: string): number | undefined {
  const n = Number(value.trim());
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

function nonNegativeInt(value: string): number | undefined {
  const n = Number(value.trim());
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

function changedFields<K extends keyof AdminUser>(
  current: AdminUser,
  values: Pick<AdminUser, K>,
): Partial<Pick<AdminUser, K>> {
  const patch: Partial<Pick<AdminUser, K>> = {};
  for (const key of Object.keys(values) as K[]) {
    if (values[key] !== current[key]) patch[key] = values[key];
  }
  return patch;
}

export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const navigate = useI18nNavigate();
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(() => new Set());
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isReindexOpen, setIsReindexOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [maxUploadMb, setMaxUploadMb] = useState('');
  const [storageLimitGb, setStorageLimitGb] = useState('');
  const [processingLimitMinutes, setProcessingLimitMinutes] = useState('');
  const [aiAnswersLimit, setAiAnswersLimit] = useState('');
  const [usedStorageBytes, setUsedStorageBytes] = useState('');
  const [usedProcessingSeconds, setUsedProcessingSeconds] = useState('');
  const [usedAiAnswers, setUsedAiAnswers] = useState('');
  const [isOverQuota, setIsOverQuota] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [isStaff, setIsStaff] = useState(false);
  const [isSuperuserFlag, setIsSuperuserFlag] = useState(false);

  const isSuperuser = !!user?.is_superuser;

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!isSuperuser) navigate('/');
  }, [authLoading, user, isSuperuser, navigate]);

  const openEditUser = (row: AdminUser) => {
    setSelectedUser(row);
    setMaxUploadMb(String(row.max_video_upload_size_mb));
    setStorageLimitGb(row.storage_limit_gb == null ? '' : String(row.storage_limit_gb));
    setProcessingLimitMinutes(
      row.processing_limit_minutes == null ? '' : String(row.processing_limit_minutes),
    );
    setAiAnswersLimit(row.ai_answers_limit == null ? '' : String(row.ai_answers_limit));
    setUsedStorageBytes(String(row.used_storage_bytes));
    setUsedProcessingSeconds(String(row.used_processing_seconds));
    setUsedAiAnswers(String(row.used_ai_answers));
    setIsOverQuota(row.is_over_quota);
    setIsActive(row.is_active);
    setIsStaff(row.is_staff);
    setIsSuperuserFlag(row.is_superuser);
    setFormError(null);
    setIsEditOpen(true);
  };

  const usersQuery = useQuery(trpc.admin.listUsers.queryOptions({
    q: query || undefined,
    limit: PAGE_SIZE,
    offset,
  }, {
    enabled: isSuperuser,
  }));

  const saveMutation = useMutation({
    onMutate: () => setFormError(null),
    mutationFn: async () => {
      if (!selectedUser) throw new Error('No user selected');

      const maxMb = requiredPositiveInt(maxUploadMb);
      if (maxMb == null) throw new ApiError(t('admin.users.errors.invalidUploadMb'), 'VALIDATION');

      const storageGb = nullableNumberInput(storageLimitGb);
      if (storageGb === undefined) {
        throw new ApiError(t('admin.users.errors.invalidStorageGb'), 'VALIDATION');
      }
      const processingMinutes = nullableNumberInput(processingLimitMinutes);
      if (processingMinutes === undefined) {
        throw new ApiError(t('admin.users.errors.invalidProcessingMinutes'), 'VALIDATION');
      }
      const aiLimit = nullableNumberInput(aiAnswersLimit);
      if (aiLimit === undefined) {
        throw new ApiError(t('admin.users.errors.invalidAiLimit'), 'VALIDATION');
      }

      const usedStorage = nonNegativeInt(usedStorageBytes);
      const usedProcessing = nonNegativeInt(usedProcessingSeconds);
      const usedAi = nonNegativeInt(usedAiAnswers);
      if (usedStorage == null || usedProcessing == null || usedAi == null) {
        throw new ApiError(t('admin.users.errors.invalidUsage'), 'VALIDATION');
      }

      const quota = changedFields(selectedUser, {
        max_video_upload_size_mb: maxMb,
        storage_limit_gb: storageGb,
        processing_limit_minutes: processingMinutes,
        ai_answers_limit: aiLimit,
      });
      const usage = changedFields(selectedUser, {
        used_storage_bytes: usedStorage,
        used_processing_seconds: usedProcessing,
        used_ai_answers: usedAi,
        is_over_quota: isOverQuota,
      });
      const flags = changedFields(selectedUser, {
        is_active: isActive,
        is_staff: isStaff,
        is_superuser: isSuperuserFlag,
      });

      const id = selectedUser.id;
      const updates = [
        { patch: flags, save: () => appTrpcClient.admin.patchFlags.mutate({ id, ...flags }) },
        { patch: quota, save: () => appTrpcClient.admin.patchQuota.mutate({ id, ...quota }) },
        { patch: usage, save: () => appTrpcClient.admin.patchUsage.mutate({ id, ...usage }) },
      ].filter(({ patch }) => Object.keys(patch).length > 0);
      if (updates.length === 0) return;

      try {
        for (const { patch, save } of updates) {
          await save();
          // Remember acknowledged edits for retries without adopting unrelated
          // server changes (for example, usage accumulated while the form is open).
          setSelectedUser(current => current?.id === id ? { ...current, ...patch } : current);
        }
      } finally {
        await queryClient.invalidateQueries(trpc.admin.listUsers.pathFilter());
      }
    },
    onSuccess: () => {
      setStatusMessage({ type: 'success', text: t('admin.users.saveSuccess') });
      setIsEditOpen(false);
      setSelectedUser(null);
    },
    onError: (error) => {
      const message =
        getApiError(error)?.message ?? t('admin.users.saveError');
      setFormError(message);
    },
  });

  const reindexMutation = useMutation(trpc.admin.reindexAll.mutationOptions({
    onSuccess: (result) => {
      setStatusMessage({
        type: 'success',
        text: t('admin.reindex.success', { jobId: result.job_id }),
      });
      setIsReindexOpen(false);
    },
    onError: (error) => {
      const message =
        getApiError(error)?.message ?? t('admin.reindex.error');
      setStatusMessage({ type: 'error', text: message });
      setIsReindexOpen(false);
    },
  }));

  const deleteMutation = useMutation({
    mutationFn: (target: AdminUser) => appTrpcClient.admin.deleteUser.mutate({ id: target.id }),
    onSuccess: async (result, target) => {
      setStatusMessage({
        type: 'success',
        text: t('admin.users.deleteSuccess', {
          username: target.username,
          jobId: result.job_id,
        }),
      });
      setIsDeleteOpen(false);
      setUserToDelete(null);
      setPendingDeleteIds((prev) => new Set(prev).add(target.id));
      await queryClient.invalidateQueries(trpc.admin.listUsers.pathFilter());
    },
    onError: (error) => {
      const message =
        getApiError(error)?.message ?? t('admin.users.deleteError');
      setStatusMessage({ type: 'error', text: message });
      setIsDeleteOpen(false);
    },
  });

  const editDialog = useDialog({
    open: isEditOpen,
    onOpenChange: (open) => {
      setIsEditOpen(open);
      if (!open) {
        setSelectedUser(null);
        setFormError(null);
      }
    },
    onRequestClose: (event) => {
      if (saveMutation.isPending) event.preventDefault();
    },
  });

  const deleteDialog = useDialog({
    open: isDeleteOpen,
    onOpenChange: (open) => {
      setIsDeleteOpen(open);
      if (!open) {
        setUserToDelete(null);
      }
    },
    onRequestClose: (event) => {
      if (deleteMutation.isPending) event.preventDefault();
    },
  });

  const reindexDialog = useDialog({
    open: isReindexOpen,
    onOpenChange: setIsReindexOpen,
    onRequestClose: (event) => {
      if (reindexMutation.isPending) event.preventDefault();
    },
  });

  const visibleUsers = usersQuery.data?.data ?? [];
  const total = usersQuery.data?.meta.total ?? 0;
  const lastOffset = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1) * PAGE_SIZE;
  if (usersQuery.data && offset > lastOffset) setOffset(lastOffset);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;
  const pageLabel =
    total === 0
      ? t('admin.users.empty')
      : t('admin.users.pageRange', {
          from: offset + 1,
          to: Math.min(offset + PAGE_SIZE, total),
          total,
        });

  if (authLoading && !user) return <LoadingSpinner />;
  if (!user || !isSuperuser) return <LoadingSpinner />;

  return (
    <>
      <AppPageHeader
        title={t('admin.title')}
        description={t('admin.description')}
      />

      {statusMessage && (
        <div className="mb-6">
          <MessageAlert type={statusMessage.type} message={statusMessage.text} />
        </div>
      )}

      <section className={SECTION_CLASS}>
        <Heading size="18" hasChip className="mb-4">
          <HeadingTitle level="h2">{t('admin.users.title')}</HeadingTitle>
        </Heading>
        <SupportText className="mb-4">{t('admin.users.description')}</SupportText>

        <form
          className="mb-6 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setOffset(0);
            setQuery(searchInput.trim());
          }}
        >
          <div className="min-w-[16rem] flex-1">
            <Label htmlFor="admin-user-search">{t('admin.users.searchLabel')}</Label>
            <Input
              id="admin-user-search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <SupportText>{t('admin.users.searchPlaceholder')}</SupportText>
          </div>
          <Button type="submit" variant="outline">
            {t('admin.users.search')}
          </Button>
        </form>

        {usersQuery.isLoading ? (
          <InlineSpinner />
        ) : usersQuery.isError ? (
          <ErrorMessage message={t('admin.users.loadError')} />
        ) : (
          <>
            <div className="mb-3 text-std-16N-170 text-solid-gray-700">{pageLabel}</div>
            <div className="overflow-x-auto">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.users.columns.id')}</TableHead>
                    <TableHead>{t('admin.users.columns.username')}</TableHead>
                    <TableHead>{t('admin.users.columns.email')}</TableHead>
                    <TableHead>{t('admin.users.columns.flags')}</TableHead>
                    <TableHead>{t('admin.users.columns.quota')}</TableHead>
                    <TableHead>{t('admin.users.columns.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleUsers.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.id}</TableCell>
                      <TableCell>{row.username}</TableCell>
                      <TableCell>{row.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {row.is_superuser && (
                            <ChipLabel>{t('admin.users.flags.superuser')}</ChipLabel>
                          )}
                          {row.is_staff && <ChipLabel>{t('admin.users.flags.staff')}</ChipLabel>}
                          {!row.is_active && (
                            <ChipLabel color="red">{t('admin.users.flags.inactive')}</ChipLabel>
                          )}
                          {row.is_over_quota && (
                            <ChipLabel color="orange">{t('admin.users.flags.overQuota')}</ChipLabel>
                          )}
                          {pendingDeleteIds.has(row.id) && (
                            <ChipLabel>{t('admin.users.deletionPending')}</ChipLabel>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-std-14N-170 text-solid-gray-700">
                        {t('admin.users.quotaSummary', {
                          uploadMb: row.max_video_upload_size_mb,
                          storageGb:
                            row.storage_limit_gb == null
                              ? t('admin.users.unlimited')
                              : row.storage_limit_gb,
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="text"
                            disabled={pendingDeleteIds.has(row.id)}
                            onClick={() => openEditUser(row)}
                          >
                            {t('admin.users.edit')}
                          </Button>
                          <Button
                            type="button"
                            variant="text"
                            disabled={row.is_superuser || row.id === user.id || pendingDeleteIds.has(row.id)}
                            onClick={() => {
                              setUserToDelete(row);
                              setIsDeleteOpen(true);
                            }}
                          >
                            {t('admin.users.delete')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={!canPrev}
                onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
              >
                {t('admin.users.prev')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!canNext}
                onClick={() => setOffset((value) => value + PAGE_SIZE)}
              >
                {t('admin.users.next')}
              </Button>
            </div>
          </>
        )}
      </section>

      <section className={`${SECTION_CLASS} mt-10`}>
        <Heading size="18" hasChip className="mb-4">
          <HeadingTitle level="h2">{t('admin.reindex.title')}</HeadingTitle>
        </Heading>
        <SupportText className="mb-4">{t('admin.reindex.description')}</SupportText>
        <Button type="button" variant="outline" onClick={() => setIsReindexOpen(true)}>
          {t('admin.reindex.button')}
        </Button>
      </section>

      <Dialog {...editDialog.dialogProps} width="min(42rem, 92vw)">
        <DialogContent>
          <DialogHeader>
            <DialogHeading {...editDialog.headingProps}>
              {selectedUser
                ? t('admin.users.editTitle', { username: selectedUser.username })
                : t('admin.users.edit')}
            </DialogHeading>
          </DialogHeader>
          <DialogBody>
            {formError && (
              <div className="mb-4">
                <ErrorMessage message={formError} />
              </div>
            )}
            <fieldset disabled={saveMutation.isPending} className="min-w-0 space-y-4">
              <fieldset className="space-y-2">
                <legend className="mb-1 text-std-16B-170 text-solid-gray-800">
                  {t('admin.users.columns.flags')}
                </legend>
                <label className="flex items-center gap-2 text-std-16N-170 text-solid-gray-800">
                  <input
                    type="checkbox"
                    checked={isActive}
                    disabled={selectedUser?.id === user.id}
                    onChange={(event) => setIsActive(event.target.checked)}
                  />
                  {t('admin.users.fields.isActive')}
                </label>
                <label className="flex items-center gap-2 text-std-16N-170 text-solid-gray-800">
                  <input
                    type="checkbox"
                    checked={isStaff}
                    onChange={(event) => setIsStaff(event.target.checked)}
                  />
                  {t('admin.users.fields.isStaff')}
                </label>
                <label className="flex items-center gap-2 text-std-16N-170 text-solid-gray-800">
                  <input
                    type="checkbox"
                    checked={isSuperuserFlag}
                    disabled={selectedUser?.id === user.id}
                    onChange={(event) => setIsSuperuserFlag(event.target.checked)}
                  />
                  {t('admin.users.fields.isSuperuser')}
                </label>
                {selectedUser?.id === user.id && (
                  <SupportText>{t('admin.users.selfFlagsHint')}</SupportText>
                )}
              </fieldset>
              <div>
                <Label htmlFor="admin-max-upload">{t('admin.users.fields.maxUploadMb')}</Label>
                <Input
                  id="admin-max-upload"
                  value={maxUploadMb}
                  onChange={(event) => setMaxUploadMb(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="admin-storage-gb">{t('admin.users.fields.storageLimitGb')}</Label>
                <Input
                  id="admin-storage-gb"
                  value={storageLimitGb}
                  onChange={(event) => setStorageLimitGb(event.target.value)}
                />
                <SupportText>{t('admin.users.nullableHint')}</SupportText>
              </div>
              <div>
                <Label htmlFor="admin-processing-min">
                  {t('admin.users.fields.processingLimitMinutes')}
                </Label>
                <Input
                  id="admin-processing-min"
                  value={processingLimitMinutes}
                  onChange={(event) => setProcessingLimitMinutes(event.target.value)}
                />
                <SupportText>{t('admin.users.nullableHint')}</SupportText>
              </div>
              <div>
                <Label htmlFor="admin-ai-limit">{t('admin.users.fields.aiAnswersLimit')}</Label>
                <Input
                  id="admin-ai-limit"
                  value={aiAnswersLimit}
                  onChange={(event) => setAiAnswersLimit(event.target.value)}
                />
                <SupportText>{t('admin.users.nullableHint')}</SupportText>
              </div>
              <div>
                <Label htmlFor="admin-used-storage">{t('admin.users.fields.usedStorageBytes')}</Label>
                <Input
                  id="admin-used-storage"
                  value={usedStorageBytes}
                  onChange={(event) => setUsedStorageBytes(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="admin-used-processing">
                  {t('admin.users.fields.usedProcessingSeconds')}
                </Label>
                <Input
                  id="admin-used-processing"
                  value={usedProcessingSeconds}
                  onChange={(event) => setUsedProcessingSeconds(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="admin-used-ai">{t('admin.users.fields.usedAiAnswers')}</Label>
                <Input
                  id="admin-used-ai"
                  value={usedAiAnswers}
                  onChange={(event) => setUsedAiAnswers(event.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-std-16N-170 text-solid-gray-800">
                <input
                  type="checkbox"
                  checked={isOverQuota}
                  onChange={(event) => setIsOverQuota(event.target.checked)}
                />
                {t('admin.users.fields.isOverQuota')}
              </label>
            </fieldset>
          </DialogBody>
          <DialogActions>
            <Button
              type="button"
              variant="text"
              disabled={saveMutation.isPending}
              onClick={editDialog.closeButtonProps.onClick}
            >
              {t('admin.users.cancel')}
            </Button>
            <Button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? <InlineSpinner /> : t('admin.users.save')}
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>

      <Dialog {...deleteDialog.dialogProps} width="min(32rem, 92vw)">
        <DialogContent>
          <DialogHeader>
            <DialogHeading {...deleteDialog.headingProps}>
              {userToDelete
                ? t('admin.users.deleteTitle', { username: userToDelete.username })
                : t('admin.users.delete')}
            </DialogHeading>
          </DialogHeader>
          <DialogBody>
            <p className="text-std-16N-170 text-solid-gray-800">
              {t('admin.users.deleteBody')}
            </p>
          </DialogBody>
          <DialogActions>
            <Button
              type="button"
              variant="text"
              disabled={deleteMutation.isPending}
              onClick={deleteDialog.closeButtonProps.onClick}
            >
              {t('admin.users.cancel')}
            </Button>
            <Button
              type="button"
              disabled={deleteMutation.isPending}
              onClick={() => { if (userToDelete) deleteMutation.mutate(userToDelete); }}
            >
              {deleteMutation.isPending ? <InlineSpinner /> : t('admin.users.deleteConfirm')}
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>

      <Dialog {...reindexDialog.dialogProps} width="min(32rem, 92vw)">
        <DialogContent>
          <DialogHeader>
            <DialogHeading {...reindexDialog.headingProps}>
              {t('admin.reindex.confirmTitle')}
            </DialogHeading>
          </DialogHeader>
          <DialogBody>
            <p className="text-std-16N-170 text-solid-gray-800">
              {t('admin.reindex.confirmBody')}
            </p>
          </DialogBody>
          <DialogActions>
            <Button
              type="button"
              variant="text"
              onClick={reindexDialog.closeButtonProps.onClick}
            >
              {t('admin.users.cancel')}
            </Button>
            <Button
              type="button"
              disabled={reindexMutation.isPending}
              onClick={() => reindexMutation.mutate()}
            >
              {reindexMutation.isPending ? <InlineSpinner /> : t('admin.reindex.confirm')}
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </>
  );
}
