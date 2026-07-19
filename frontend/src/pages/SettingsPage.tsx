import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18nNavigate } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { apiClient, ApiError, type IntegrationApiKeyCreateResponse } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SupportText } from '@/components/ui/support-text';
import { Link as DaLink } from '@/components/ui/link';
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
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Trash2, X } from 'lucide-react';
import { ConnectedAppsSection } from '@/components/auth/ConnectedAppsSection';
import { ErrorMessage } from '@/components/auth/ErrorMessage';
import { MessageAlert } from '@/components/common/MessageAlert';

const SETTINGS_SECTION_CLASS =
  'border-t border-solid-gray-420 pt-8';
const SETTINGS_CALLOUT_CLASS =
  'border border-solid-gray-420 bg-solid-gray-50 p-4 text-std-16N-170 text-solid-gray-700';

type AccessLevel = 'all' | 'read_only';

export default function SettingsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useI18nNavigate();
  const queryClient = useQueryClient();

  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreateApiKeyDialogOpen, setIsCreateApiKeyDialogOpen] = useState(false);
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyAccessLevel, setApiKeyAccessLevel] = useState<AccessLevel>('all');
  const [generatedApiKey, setGeneratedApiKey] = useState<IntegrationApiKeyCreateResponse | null>(null);
  const [apiKeyDialogError, setApiKeyDialogError] = useState<string | null>(null);
  const [generatedDialogError, setGeneratedDialogError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [pendingRevokeKey, setPendingRevokeKey] = useState<{
    id: number;
    name: string;
    prefix: string;
  } | null>(null);
  const [isCopyAcknowledged, setIsCopyAcknowledged] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [searchApiKey, setSearchApiKey] = useState('');
  const [searchApiStatusMessage, setSearchApiStatusMessage] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);
  const [emailChangeEmail, setEmailChangeEmail] = useState('');
  const [emailChangeStatusMessage, setEmailChangeStatusMessage] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);

  const confirmationKeyword = useMemo(() => 'DELETE', []);
  const canConfirm = confirmText.trim().toUpperCase() === confirmationKeyword;

  const accessLevelOptions: {
    value: AccessLevel;
    title: string;
    description: string;
  }[] = [
    {
      value: 'all',
      title: t('settings.integrationApiKeys.permissions.allTitle'),
      description: t('settings.integrationApiKeys.permissions.allDescription'),
    },
    {
      value: 'read_only',
      title: t('settings.integrationApiKeys.permissions.readOnlyTitle'),
      description: t('settings.integrationApiKeys.permissions.readOnlyDescription'),
    },
  ];

  useEffect(() => {
    if (!isCopyAcknowledged) {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => {
      setIsCopyAcknowledged(false);
    }, 2000);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isCopyAcknowledged]);

  useEffect(() => {
    setEmailChangeEmail(user?.email ?? '');
  }, [user?.email]);

  const apiKeysQuery = useQuery({
    queryKey: queryKeys.auth.apiKeys,
    queryFn: async () => apiClient.getIntegrationApiKeys(),
  });

  const searchApiKeyStatusQuery = useQuery({
    queryKey: queryKeys.auth.searchApiKey,
    queryFn: async () => apiClient.getSearchApiKeyStatus(),
  });

  const createApiKeyMutation = useMutation({
    mutationFn: async () => apiClient.createIntegrationApiKey({
      name: apiKeyName.trim(),
      access_level: apiKeyAccessLevel,
    }),
    onSuccess: async (data) => {
      setApiKeyName('');
      setApiKeyAccessLevel('all');
      setIsCreateApiKeyDialogOpen(false);
      setGeneratedApiKey(data);
      setApiKeyDialogError(null);
      setGeneratedDialogError(null);
      setIsCopyAcknowledged(false);
      setStatusMessage(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.apiKeys });
    },
    onError: (error) => {
      setApiKeyDialogError(
        error instanceof Error
          ? error.message
          : t('settings.integrationApiKeys.errorCreating'),
      );
    },
  });

  const revokeApiKeyMutation = useMutation({
    mutationFn: async (id: number) => apiClient.revokeIntegrationApiKey(id),
    onSuccess: async () => {
      setStatusMessage({
        tone: 'success',
        text: t('settings.integrationApiKeys.successRevoked'),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.apiKeys });
    },
    onError: (error) => {
      setStatusMessage({
        tone: 'error',
        text: error instanceof Error
          ? error.message
          : t('settings.integrationApiKeys.errorRevoking'),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => apiClient.deleteAccount({ reason }),
    onSuccess: async () => {
      queryClient.clear();
      navigate('/login');
    },
    onError: (error) => {
      setDeleteError(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : t('settings.accountDeletion.error'),
      );
    },
  });

  const requestEmailChangeMutation = useMutation({
    mutationFn: async (email: string) => apiClient.requestEmailChange({ email }),
    onSuccess: () => {
      setEmailChangeStatusMessage({
        tone: 'success',
        text: t('settings.emailChange.success'),
      });
    },
    onError: (error) => {
      setEmailChangeStatusMessage({
        tone: 'error',
        text: error instanceof Error
          ? error.message
          : t('settings.emailChange.errorSubmitting'),
      });
    },
  });

  const saveSearchApiKeyMutation = useMutation({
    mutationFn: async () => apiClient.saveSearchApiKey(searchApiKey.trim()),
    onSuccess: async () => {
      setSearchApiKey('');
      setSearchApiStatusMessage({
        tone: 'success',
        text: t('settings.searchApiKey.successSaved'),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.searchApiKey });
    },
    onError: (error) => {
      setSearchApiStatusMessage({
        tone: 'error',
        text: error instanceof Error
          ? error.message
          : t('settings.searchApiKey.errorSaving'),
      });
    },
  });

  const deleteSearchApiKeyMutation = useMutation({
    mutationFn: async () => apiClient.deleteSearchApiKey(),
    onSuccess: async () => {
      setSearchApiStatusMessage({
        tone: 'success',
        text: t('settings.searchApiKey.successDeleted'),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.searchApiKey });
    },
    onError: (error) => {
      setSearchApiStatusMessage({
        tone: 'error',
        text: error instanceof Error
          ? error.message
          : t('settings.searchApiKey.errorDeleting'),
      });
    },
  });

  const createApiKeyDialog = useDialog({
    open: isCreateApiKeyDialogOpen,
    onOpenChange: (open) => {
      setIsCreateApiKeyDialogOpen(open);
      if (!open) {
        setApiKeyName('');
        setApiKeyAccessLevel('all');
        setApiKeyDialogError(null);
      }
    },
    onRequestClose: (event) => {
      if (createApiKeyMutation.isPending) event.preventDefault();
    },
  });

  const generatedApiKeyDialog = useDialog({
    open: generatedApiKey !== null,
    onOpenChange: (open) => {
      if (!open) {
        setGeneratedApiKey(null);
        setIsCopyAcknowledged(false);
        setGeneratedDialogError(null);
      }
    },
  });

  const revokeConfirmDialog = useDialog({
    open: pendingRevokeKey !== null,
    onOpenChange: (open) => {
      if (!open) setPendingRevokeKey(null);
    },
    onRequestClose: (event) => {
      if (revokeApiKeyMutation.isPending) event.preventDefault();
    },
  });

  const deleteAccountDialog = useDialog({
    open: isDialogOpen,
    onOpenChange: (open) => {
      setIsDialogOpen(open);
      if (!open) setConfirmText('');
    },
    onRequestClose: (event) => {
      if (deleteMutation.isPending) event.preventDefault();
    },
  });

  const handleCopyApiKey = async () => {
    if (!generatedApiKey) return;
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(generatedApiKey.api_key);
      setIsCopyAcknowledged(true);
      setGeneratedDialogError(null);
      return;
    }
    setGeneratedDialogError(t('settings.integrationApiKeys.errorCopying'));
  };

  const getAccessLevelBadge = (accessLevel: AccessLevel) => {
    if (accessLevel === 'read_only') {
      return (
        <ChipLabel variant="filled-1" color="blue" className="min-h-0 text-oln-14N-100">
          {t('settings.integrationApiKeys.permissions.readOnlyTitle')}
        </ChipLabel>
      );
    }
    return (
      <ChipLabel variant="filled-1" color="gray" className="min-h-0 text-oln-14N-100">
        {t('settings.integrationApiKeys.permissions.allTitle')}
      </ChipLabel>
    );
  };

  const getAccessLevelLabel = (accessLevel: AccessLevel) => {
    if (accessLevel === 'read_only') {
      return t('settings.integrationApiKeys.permissions.readOnlyTitle');
    }
    return t('settings.integrationApiKeys.permissions.allTitle');
  };

  return (
    <AppPageShell activePage="settings">
      <AppPageHeader
        title={t('settings.title')}
        description={t('settings.subtitle')}
      />

      <div className="flex flex-col gap-12">
          <section className={SETTINGS_SECTION_CLASS}>
            <div className="mb-5">
              <Heading size="18" hasChip className="mb-2">
                <HeadingTitle level="h2">{t('settings.emailChange.title')}</HeadingTitle>
              </Heading>
              <p className="text-std-16N-170 text-solid-gray-600">
                {t('settings.emailChange.description')}
              </p>
            </div>

            {emailChangeStatusMessage && (
              <div className="mb-5">
                <MessageAlert
                  type={emailChangeStatusMessage.tone}
                  message={emailChangeStatusMessage.text}
                />
              </div>
            )}

            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                const trimmedEmail = emailChangeEmail.trim();
                if (!trimmedEmail) {
                  setEmailChangeStatusMessage({
                    tone: 'error',
                    text: t('settings.emailChange.errorEmpty'),
                  });
                  return;
                }
                setEmailChangeStatusMessage(null);
                try {
                  await requestEmailChangeMutation.mutateAsync(trimmedEmail);
                } catch {
                  // onError renders the user-facing message.
                }
              }}
            >
              <div className={SETTINGS_CALLOUT_CLASS}>
                <div className="font-bold text-solid-gray-800 mb-1">
                  {t('settings.emailChange.currentEmailLabel')}
                </div>
                <p>{user?.email ?? t('common.notProvided')}</p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="email-change-email">
                  {t('settings.emailChange.newEmailLabel')}
                </Label>
                <Input
                  id="email-change-email"
                  type="email"
                  value={emailChangeEmail}
                  onChange={(event) => setEmailChangeEmail(event.target.value)}
                  placeholder={t('settings.emailChange.newEmailPlaceholder')}
                />
                <SupportText>{t('settings.emailChange.help')}</SupportText>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={requestEmailChangeMutation.isPending}>
                  {requestEmailChangeMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <InlineSpinner className="w-4 h-4" />
                      {t('settings.emailChange.submitting')}
                    </span>
                  ) : t('settings.emailChange.submit')}
                </Button>
              </div>
            </form>
          </section>

          <section className={SETTINGS_SECTION_CLASS}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <Heading size="18" hasChip className="mb-2">
                  <HeadingTitle level="h2">{t('settings.searchApiKey.title')}</HeadingTitle>
                </Heading>
                <p className="text-std-16N-170 text-solid-gray-600">
                  {t('settings.searchApiKey.description')}
                </p>
              </div>
              {searchApiKeyStatusQuery.data?.has_api_key && (
                <ChipLabel variant="filled-1" color="blue" className="min-h-0 text-oln-14N-100">
                  {t('settings.searchApiKey.configured')}
                </ChipLabel>
              )}
            </div>

            {searchApiStatusMessage && (
              <div className="mb-5">
                <MessageAlert
                  type={searchApiStatusMessage.tone}
                  message={searchApiStatusMessage.text}
                />
              </div>
            )}

            <div className="space-y-4">
              <div className={SETTINGS_CALLOUT_CLASS}>
                <div className="font-bold text-solid-gray-800 mb-1">
                  {t('settings.searchApiKey.usageTitle')}
                </div>
                <p>{t('settings.searchApiKey.usageDescription')}</p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="search-api-key">
                  {t('settings.searchApiKey.apiKeyLabel')}
                </Label>
                <Input
                  id="search-api-key"
                  value={searchApiKey}
                  onChange={(event) => setSearchApiKey(event.target.value)}
                  placeholder={t('settings.searchApiKey.apiKeyPlaceholder')}
                />
                <SupportText>
                  {searchApiKeyStatusQuery.data?.has_api_key
                    ? t('settings.searchApiKey.hasApiKeyMessage')
                    : t('settings.searchApiKey.noApiKeyMessage')}
                </SupportText>
                <SupportText>
                  {t('settings.searchApiKey.getApiKeyMessage')}{' '}
                  <DaLink
                    href="https://www.searchapi.io/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    SearchAPI
                  </DaLink>
                </SupportText>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={!searchApiKeyStatusQuery.data?.has_api_key || deleteSearchApiKeyMutation.isPending}
                  onClick={async () => {
                    setSearchApiStatusMessage(null);
                    await deleteSearchApiKeyMutation.mutateAsync();
                  }}
                >
                  {deleteSearchApiKeyMutation.isPending ? t('settings.searchApiKey.deleting') : t('settings.searchApiKey.delete')}
                </Button>
                <Button
                  disabled={saveSearchApiKeyMutation.isPending}
                  onClick={async () => {
                    const trimmedKey = searchApiKey.trim();
                    if (!trimmedKey) {
                      setSearchApiStatusMessage({
                        tone: 'error',
                        text: t('settings.searchApiKey.errorEmpty'),
                      });
                      return;
                    }
                    setSearchApiStatusMessage(null);
                    await saveSearchApiKeyMutation.mutateAsync();
                  }}
                >
                  {saveSearchApiKeyMutation.isPending ? t('settings.searchApiKey.saving') : t('settings.searchApiKey.save')}
                </Button>
              </div>
            </div>
          </section>

          {/* ── Integration API Keys ─────────────────────────────────── */}
          <section className={SETTINGS_SECTION_CLASS}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <Heading size="18" hasChip className="mb-2">
                  <HeadingTitle level="h2">{t('settings.integrationApiKeys.title')}</HeadingTitle>
                </Heading>
                <p className="text-std-16N-170 text-solid-gray-600">
                  {t('settings.integrationApiKeys.description')}
                </p>
              </div>
              <Button
                type="button"
                variant="solid"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setStatusMessage(null);
                  setApiKeyDialogError(null);
                  setApiKeyName('');
                  setApiKeyAccessLevel('all');
                  setIsCreateApiKeyDialogOpen(true);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('settings.integrationApiKeys.create')}
              </Button>
            </div>

            {statusMessage && (
              <div className="mb-5">
                <MessageAlert type={statusMessage.tone} message={statusMessage.text} />
              </div>
            )}

            {apiKeysQuery.isLoading && <LoadingSpinner />}
            {apiKeysQuery.isError && (
              <ErrorMessage message={t('settings.integrationApiKeys.errorLoading')} />
            )}
            {!apiKeysQuery.isLoading && !apiKeysQuery.isError && apiKeysQuery.data?.length === 0 && (
              <p className="border-t border-solid-gray-420 py-6 text-std-16N-170 text-solid-gray-600">
                {t('settings.integrationApiKeys.empty')}
              </p>
            )}

            {apiKeysQuery.data && apiKeysQuery.data.length > 0 && (
              <div className="overflow-x-auto border-t border-solid-gray-420">
                <Table className="min-w-[560px]">
                  <TableHeader>
                    <TableRow className="text-dns-14B-120 text-solid-gray-600">
                      <TableHead>{t('settings.integrationApiKeys.columns.name')}</TableHead>
                      <TableHead>{t('settings.integrationApiKeys.columns.secret')}</TableHead>
                      <TableHead>{t('settings.integrationApiKeys.columns.permissions')}</TableHead>
                      <TableHead>{t('settings.integrationApiKeys.columns.lastUsed')}</TableHead>
                      <TableHead className="text-center">
                        {t('settings.integrationApiKeys.columns.action')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiKeysQuery.data.map((apiKey) => (
                      <TableRow key={apiKey.id}>
                        <TableCell className="font-medium text-solid-gray-800">
                          {apiKey.name}
                        </TableCell>
                        <TableCell className="font-mono text-dns-14N-130 text-solid-gray-600">
                          {apiKey.prefix}...
                        </TableCell>
                        <TableCell>{getAccessLevelBadge(apiKey.access_level)}</TableCell>
                        <TableCell className="text-dns-14N-130 text-solid-gray-600">
                          {apiKey.last_used_at
                            ? new Date(apiKey.last_used_at).toLocaleDateString()
                            : t('settings.integrationApiKeys.neverUsed')}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            type="button"
                            variant="text"
                            size="xs"
                            disabled={revokeApiKeyMutation.isPending && revokingId === apiKey.id}
                            onClick={() => setPendingRevokeKey({ id: apiKey.id, name: apiKey.name, prefix: apiKey.prefix })}
                            className="min-w-0 text-error-1 hover:bg-red-50"
                            aria-label={t('settings.integrationApiKeys.revoke')}
                          >
                            {revokeApiKeyMutation.isPending && revokingId === apiKey.id
                              ? <InlineSpinner className="w-4 h-4" />
                              : <X className="w-4 h-4" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          {/* ── Connected Apps (OAuth tokens) ────────────────────────── */}
          <ConnectedAppsSection />

          {/* ── Danger Zone ─────────────────────────────────────────── */}
          <section className={`${SETTINGS_SECTION_CLASS} border-l-4 border-error-1 pl-4`}>
            <div className="mb-5">
              <Heading size="18" hasChip className="mb-2 text-error-1">
                <HeadingTitle level="h2">{t('settings.accountDeletion.title')}</HeadingTitle>
              </Heading>
              <p className="text-std-16N-170 text-solid-gray-600">
                {t('settings.accountDeletion.description')}
              </p>
            </div>

            <div className="flex flex-col gap-2 mb-6">
              <Label htmlFor="account-deletion-reason">
                {t('settings.accountDeletion.reasonLabel')}
              </Label>
              <Textarea
                id="account-deletion-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('settings.accountDeletion.reasonPlaceholder')}
                rows={4}
                className="resize-none"
              />
            </div>

            {deleteError && (
              <div className="mb-5">
                <ErrorMessage message={deleteError} />
              </div>
            )}

            <div className="flex justify-end">
              <Button
                variant="solid"
                className="bg-error-1 hover:bg-red-1000 active:bg-red-1200"
                onClick={() => setIsDialogOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t('settings.accountDeletion.cta')}
              </Button>
            </div>
          </section>
      </div>

      {/* ── Create API Key Dialog ──────────────────────────────────────── */}
      {isCreateApiKeyDialogOpen && (
        <Dialog {...createApiKeyDialog.dialogProps} width="min(42rem, 92vw)">
          <DialogContent>
            <DialogHeader>
              <DialogHeading {...createApiKeyDialog.headingProps}>
                {t('settings.integrationApiKeys.createDialogTitle')}
              </DialogHeading>
            </DialogHeader>

            <DialogBody>
              <p className="mb-4 text-std-16N-170 text-solid-gray-700">
                {t('settings.integrationApiKeys.createDialogDescription')}
              </p>

              <div className="space-y-6">
                {apiKeyDialogError && <ErrorMessage message={apiKeyDialogError} />}

                <div className="flex flex-col gap-2">
                  <Label htmlFor="api-key-name">
                    {t('settings.integrationApiKeys.nameLabel')}
                  </Label>
                  <Input
                    id="api-key-name"
                    value={apiKeyName}
                    onChange={(event) => setApiKeyName(event.target.value)}
                    placeholder={t('settings.integrationApiKeys.namePlaceholder')}
                  />
                  <SupportText>{t('settings.integrationApiKeys.nameHelp')}</SupportText>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-std-17B-170 text-solid-gray-800">
                      {t('settings.integrationApiKeys.permissionsLabel')}
                    </p>
                    <SupportText>{t('settings.integrationApiKeys.permissionsHelp')}</SupportText>
                  </div>
                  <div className="space-y-3">
                    {accessLevelOptions.map((option) => {
                      const isSelected = apiKeyAccessLevel === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`w-full rounded-8 border px-4 py-4 text-left transition-colors focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:outline-black focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300 ${
                            isSelected
                              ? 'border-key-900 bg-key-900 text-white'
                              : 'border-solid-gray-300 bg-white text-solid-gray-800 hover:border-solid-gray-420 hover:bg-solid-gray-50'
                          }`}
                          onClick={() => setApiKeyAccessLevel(option.value)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="text-std-16B-170">{option.title}</div>
                              <div className={`text-std-16N-170 ${isSelected ? 'text-white/80' : 'text-solid-gray-600'}`}>
                                {option.description}
                              </div>
                            </div>
                            <span className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                              isSelected
                                ? 'border-white bg-white text-key-900'
                                : 'border-solid-gray-420 text-transparent'
                            }`}>
                              •
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </DialogBody>

            <DialogActions>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsCreateApiKeyDialogOpen(false)}>
                  {t('settings.integrationApiKeys.cancel')}
                </Button>
                <Button
                  disabled={createApiKeyMutation.isPending}
                  onClick={async () => {
                    const trimmedName = apiKeyName.trim();
                    if (!trimmedName) {
                      setApiKeyDialogError(t('settings.integrationApiKeys.errorEmpty'));
                      return;
                    }
                    setApiKeyDialogError(null);
                    await createApiKeyMutation.mutateAsync();
                  }}
                >
                  {createApiKeyMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <InlineSpinner className="w-4 h-4" />
                      {t('settings.integrationApiKeys.creating')}
                    </span>
                  ) : t('settings.integrationApiKeys.createDialogCta')}
                </Button>
              </div>
            </DialogActions>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Generated API Key Dialog ───────────────────────────────────── */}
      {generatedApiKey && (
        <Dialog {...generatedApiKeyDialog.dialogProps} width="min(36rem, 92vw)">
          <DialogContent>
            <DialogHeader>
              <DialogHeading {...generatedApiKeyDialog.headingProps}>
                {t('settings.integrationApiKeys.generatedDialogTitle')}
              </DialogHeading>
            </DialogHeader>

            <DialogBody>
              <p className="mb-4 text-std-16N-170 text-solid-gray-700">
                {t('settings.integrationApiKeys.generatedDialogDescription')}
              </p>

              {generatedDialogError && (
                <div className="mb-4">
                  <ErrorMessage message={generatedDialogError} />
                </div>
              )}

              <div className="space-y-6">
                <div className="flex flex-col gap-2">
                  <p className="text-std-17B-170 text-solid-gray-800">
                    {t('settings.integrationApiKeys.secretKeyLabel')}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_112px] sm:items-center">
                    <div className="min-w-0 rounded-8 border border-solid-gray-300 bg-solid-gray-50 px-4 py-3 font-mono text-std-16N-170 text-solid-gray-800">
                      <span className="block truncate">{generatedApiKey.api_key}</span>
                    </div>
                    <Button
                      variant={isCopyAcknowledged ? 'solid' : 'outline'}
                      className="h-10 w-full"
                      onClick={handleCopyApiKey}
                    >
                      {isCopyAcknowledged ? t('settings.integrationApiKeys.copyDone') : t('settings.integrationApiKeys.copy')}
                    </Button>
                  </div>
                  <SupportText>{t('settings.integrationApiKeys.generatedTitle')}</SupportText>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-std-17B-170 text-solid-gray-800">
                    {t('settings.integrationApiKeys.permissionsLabel')}
                  </p>
                  <p className="text-std-16N-170 text-solid-gray-800">
                    {getAccessLevelLabel(generatedApiKey.access_level)}
                  </p>
                  <SupportText>
                    {generatedApiKey.access_level === 'read_only'
                      ? t('settings.integrationApiKeys.permissions.readOnlyDescription')
                      : t('settings.integrationApiKeys.permissions.allDescription')}
                  </SupportText>
                </div>
              </div>
            </DialogBody>

            <DialogActions>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setGeneratedApiKey(null);
                    setIsCopyAcknowledged(false);
                    setGeneratedDialogError(null);
                    setStatusMessage({ tone: 'success', text: t('settings.integrationApiKeys.successCreated') });
                  }}
                >
                  {t('settings.integrationApiKeys.generatedDoneCta')}
                </Button>
              </div>
            </DialogActions>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Revoke Confirm Dialog ──────────────────────────────────────── */}
      {pendingRevokeKey && (
        <Dialog {...revokeConfirmDialog.dialogProps} width="min(32rem, 92vw)">
          <DialogContent>
            <DialogHeader>
              <DialogHeading {...revokeConfirmDialog.headingProps}>
                {t('settings.integrationApiKeys.revokeConfirmTitle')}
              </DialogHeading>
            </DialogHeader>

            <DialogBody>
              <p className="mb-4 text-std-16N-170 text-solid-gray-700">
                {t('settings.integrationApiKeys.revokeConfirmDescription')}
              </p>

              <div className="space-y-4">
                <MessageAlert
                  type="warning"
                  message={t('settings.integrationApiKeys.revokeConfirmWarning')}
                />
                <div className="rounded-8 border border-solid-gray-200 bg-solid-gray-50 px-4 py-4">
                  <div className="text-std-16B-170 text-solid-gray-800">{pendingRevokeKey.name}</div>
                  <div className="mt-1 font-mono text-dns-14N-130 text-solid-gray-600">{pendingRevokeKey.prefix}...</div>
                </div>
              </div>
            </DialogBody>

            <DialogActions>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setPendingRevokeKey(null)}>
                  {t('settings.integrationApiKeys.cancel')}
                </Button>
                <Button
                  variant="solid"
                  className="bg-error-1 hover:bg-red-1000 active:bg-red-1200"
                  disabled={revokeApiKeyMutation.isPending}
                  onClick={async () => {
                    setStatusMessage(null);
                    setRevokingId(pendingRevokeKey.id);
                    try {
                      await revokeApiKeyMutation.mutateAsync(pendingRevokeKey.id);
                      setPendingRevokeKey(null);
                    } finally {
                      setRevokingId(null);
                    }
                  }}
                >
                  {revokeApiKeyMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <InlineSpinner className="w-4 h-4" color="red" />
                      {t('settings.integrationApiKeys.revoking')}
                    </span>
                  ) : t('settings.integrationApiKeys.revokeConfirmCta')}
                </Button>
              </div>
            </DialogActions>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Delete Account Dialog ──────────────────────────────────────── */}
      {isDialogOpen && (
        <Dialog {...deleteAccountDialog.dialogProps} width="min(32rem, 92vw)">
          <DialogContent>
            <DialogHeader>
              <DialogHeading {...deleteAccountDialog.headingProps}>
                {t('settings.accountDeletion.confirmTitle')}
              </DialogHeading>
            </DialogHeader>

            <DialogBody>
              <p className="mb-4 text-std-16N-170 text-solid-gray-700">
                {t('settings.accountDeletion.confirmDescription')}
              </p>

              <div className="space-y-4">
                <MessageAlert
                  type="warning"
                  message={t('settings.accountDeletion.confirmWarning')}
                />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="account-deletion-confirm">
                    {t('settings.accountDeletion.confirmLabel', { keyword: confirmationKeyword })}
                  </Label>
                  <Input
                    id="account-deletion-confirm"
                    value={confirmText}
                    onChange={(event) => setConfirmText(event.target.value)}
                    placeholder={confirmationKeyword}
                  />
                </div>
                {deleteError && <ErrorMessage message={deleteError} />}
              </div>
            </DialogBody>

            <DialogActions>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  {t('settings.accountDeletion.cancel')}
                </Button>
                <Button
                  variant="solid"
                  className="bg-error-1 hover:bg-red-1000 active:bg-red-1200"
                  disabled={!canConfirm || deleteMutation.isPending}
                  onClick={async () => { await deleteMutation.mutateAsync(); }}
                >
                  {deleteMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <InlineSpinner className="w-4 h-4" color="red" />
                      {t('settings.accountDeletion.deleting')}
                    </span>
                  ) : t('settings.accountDeletion.confirmCta')}
                </Button>
              </div>
            </DialogActions>
          </DialogContent>
        </Dialog>
      )}
    </AppPageShell>
  );
}
