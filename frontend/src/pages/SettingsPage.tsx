import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18nNavigate } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { apiClient, type IntegrationApiKeyCreateResponse } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type AccessLevel = 'all' | 'read_only';

export default function SettingsPage() {
  useAuth();
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

  const apiKeysQuery = useQuery({
    queryKey: queryKeys.auth.apiKeys,
    queryFn: async () => apiClient.getIntegrationApiKeys(),
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
  });

  const handleCopyApiKey = async () => {
    if (!generatedApiKey) {
      return;
    }

    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(generatedApiKey.api_key);
      setIsCopyAcknowledged(true);
      setGeneratedDialogError(null);
      return;
    }

    setGeneratedDialogError(t('settings.integrationApiKeys.errorCopying'));
  };

  const getAccessLevelBadgeClasses = (accessLevel: AccessLevel) => {
    if (accessLevel === 'read_only') {
      return 'border border-emerald-200 bg-emerald-50 text-emerald-700';
    }
    return 'border border-blue-200 bg-blue-50 text-blue-700';
  };

  const getAccessLevelLabel = (accessLevel: AccessLevel) => {
    if (accessLevel === 'read_only') {
      return t('settings.integrationApiKeys.permissions.readOnlyTitle');
    }
    return t('settings.integrationApiKeys.permissions.allTitle');
  };

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900 lg:text-3xl">
            {t('settings.title')}
          </h1>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="border-b">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <CardTitle>{t('settings.integrationApiKeys.title')}</CardTitle>
                <CardDescription>{t('settings.integrationApiKeys.description')}</CardDescription>
              </div>
              <Button
                onClick={() => {
                  setStatusMessage(null);
                  setApiKeyDialogError(null);
                  setApiKeyName('');
                  setApiKeyAccessLevel('all');
                  setIsCreateApiKeyDialogOpen(true);
                }}
              >
                {t('settings.integrationApiKeys.create')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 bg-slate-50/60">
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-slate-900">
                    {t('settings.integrationApiKeys.panelTitle')}
                  </div>
                  <p className="text-sm leading-6 text-slate-600">
                    {t('settings.integrationApiKeys.panelDescription')}
                  </p>
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  {t('settings.integrationApiKeys.panelBadge')}
                </div>
              </div>
            </div>

            {statusMessage && (
              <div
                className={
                  statusMessage.tone === 'success'
                    ? 'rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700'
                    : 'rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'
                }
              >
                {statusMessage.text}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-slate-900">
                  {t('settings.integrationApiKeys.activeListTitle')}
                </div>
                {apiKeysQuery.data && apiKeysQuery.data.length > 0 && (
                  <div className="text-xs text-slate-500">
                    {t('settings.integrationApiKeys.activeListCount', { count: apiKeysQuery.data.length })}
                  </div>
                )}
              </div>

              {apiKeysQuery.isLoading && (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
                  {t('settings.integrationApiKeys.loading')}
                </div>
              )}
              {apiKeysQuery.isError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                  {t('settings.integrationApiKeys.errorLoading')}
                </div>
              )}
              {!apiKeysQuery.isLoading && !apiKeysQuery.isError && apiKeysQuery.data?.length === 0 && (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
                  {t('settings.integrationApiKeys.empty')}
                </div>
              )}

              {apiKeysQuery.data && apiKeysQuery.data.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
                    <div>{t('settings.integrationApiKeys.columns.name')}</div>
                    <div>{t('settings.integrationApiKeys.columns.secret')}</div>
                    <div>{t('settings.integrationApiKeys.columns.permissions')}</div>
                    <div>{t('settings.integrationApiKeys.columns.lastUsed')}</div>
                    <div>{t('settings.integrationApiKeys.columns.action')}</div>
                  </div>

                  {apiKeysQuery.data.map((apiKey, index) => (
                    <div
                      key={apiKey.id}
                      className={`grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center ${index === 0 ? '' : 'border-t border-slate-200'}`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-slate-900">{apiKey.name}</div>
                          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </div>
                        <div className="text-xs text-slate-500">
                          {t('settings.integrationApiKeys.createdAt', {
                            date: new Date(apiKey.created_at).toLocaleString(),
                          })}
                        </div>
                      </div>

                      <div className="space-y-1 lg:space-y-0">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 lg:hidden">
                          {t('settings.integrationApiKeys.columns.secret')}
                        </div>
                        <div className="font-mono text-xs text-slate-600">{apiKey.prefix}...</div>
                      </div>

                      <div className="space-y-1 lg:space-y-0">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 lg:hidden">
                          {t('settings.integrationApiKeys.columns.permissions')}
                        </div>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getAccessLevelBadgeClasses(apiKey.access_level)}`}>
                          {getAccessLevelLabel(apiKey.access_level)}
                        </span>
                      </div>

                      <div className="space-y-1 lg:space-y-0">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 lg:hidden">
                          {t('settings.integrationApiKeys.columns.lastUsed')}
                        </div>
                        <div className="text-xs text-slate-500">
                          {apiKey.last_used_at
                            ? t('settings.integrationApiKeys.lastUsedAt', {
                              date: new Date(apiKey.last_used_at).toLocaleString(),
                            })
                            : t('settings.integrationApiKeys.neverUsed')}
                        </div>
                      </div>

                      <div className="flex items-center justify-start lg:justify-end">
                        <Button
                          variant="ghost"
                          className="h-8 px-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                          disabled={revokeApiKeyMutation.isPending && revokingId === apiKey.id}
                          onClick={() => {
                            setPendingRevokeKey({
                              id: apiKey.id,
                              name: apiKey.name,
                              prefix: apiKey.prefix,
                            });
                          }}
                        >
                          {revokeApiKeyMutation.isPending && revokingId === apiKey.id
                            ? t('settings.integrationApiKeys.revoking')
                            : t('settings.integrationApiKeys.revoke')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t('settings.accountDeletion.title')}</CardTitle>
            <CardDescription>{t('settings.accountDeletion.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {t('settings.accountDeletion.warningLine1')}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900">
                {t('settings.accountDeletion.reasonLabel')}
              </label>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t('settings.accountDeletion.reasonPlaceholder')}
                className="min-h-[120px] bg-white"
              />
            </div>
            {deleteMutation.isError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {t('settings.accountDeletion.error')}
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-end border-t">
            <Button
              variant="destructive"
              onClick={() => setIsDialogOpen(true)}
            >
              {t('settings.accountDeletion.cta')}
            </Button>
          </CardFooter>
        </Card>
      </div>

      <Dialog
        open={isCreateApiKeyDialogOpen}
        onOpenChange={(open) => {
          setIsCreateApiKeyDialogOpen(open);
          if (!open) {
            setApiKeyName('');
            setApiKeyAccessLevel('all');
            setApiKeyDialogError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('settings.integrationApiKeys.createDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('settings.integrationApiKeys.createDialogDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {apiKeyDialogError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {apiKeyDialogError}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">
                {t('settings.integrationApiKeys.nameLabel')}
              </label>
              <Input
                value={apiKeyName}
                onChange={(event) => setApiKeyName(event.target.value)}
                placeholder={t('settings.integrationApiKeys.namePlaceholder')}
              />
              <p className="text-xs text-slate-500">
                {t('settings.integrationApiKeys.nameHelp')}
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-slate-900">
                  {t('settings.integrationApiKeys.permissionsLabel')}
                </div>
                <p className="text-xs text-slate-500">
                  {t('settings.integrationApiKeys.permissionsHelp')}
                </p>
              </div>

              <div className="space-y-3">
                {accessLevelOptions.map((option) => {
                  const isSelected = apiKeyAccessLevel === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`w-full rounded-xl border px-4 py-4 text-left transition-colors ${isSelected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50'}`}
                      onClick={() => setApiKeyAccessLevel(option.value)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold">{option.title}</div>
                          <div className={`text-sm ${isSelected ? 'text-slate-200' : 'text-slate-500'}`}>
                            {option.description}
                          </div>
                        </div>
                        <span
                          className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${isSelected ? 'border-white bg-white text-slate-900' : 'border-slate-300 text-transparent'}`}
                        >
                          •
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsCreateApiKeyDialogOpen(false)}
            >
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
              {createApiKeyMutation.isPending
                ? t('settings.integrationApiKeys.creating')
                : t('settings.integrationApiKeys.createDialogCta')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={generatedApiKey !== null}
        onOpenChange={(open) => {
          if (!open) {
            setGeneratedApiKey(null);
            setIsCopyAcknowledged(false);
            setGeneratedDialogError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('settings.integrationApiKeys.generatedDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('settings.integrationApiKeys.generatedDialogDescription')}
            </DialogDescription>
          </DialogHeader>

          {generatedApiKey && (
            <div className="space-y-5">
              {generatedDialogError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {generatedDialogError}
                </div>
              )}

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {t('settings.integrationApiKeys.generatedTitle')}
              </div>

              <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('settings.integrationApiKeys.nameLabel')}
                  </div>
                  <div className="text-sm font-medium text-slate-900">{generatedApiKey.name}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('settings.integrationApiKeys.permissionsLabel')}
                  </div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getAccessLevelBadgeClasses(generatedApiKey.access_level)}`}>
                    {getAccessLevelLabel(generatedApiKey.access_level)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('settings.integrationApiKeys.secretKeyLabel')}
                </div>
                <div className="break-all rounded-xl border border-slate-200 bg-slate-950 px-4 py-4 font-mono text-xs leading-6 text-slate-100">
                  {generatedApiKey.api_key}
                </div>
                <p className="text-xs text-slate-500">
                  {t('settings.integrationApiKeys.secretKeyHelp')}
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant={isCopyAcknowledged ? 'default' : 'outline'}
              onClick={handleCopyApiKey}
            >
              {isCopyAcknowledged
                ? t('settings.integrationApiKeys.copyDone')
                : t('settings.integrationApiKeys.copy')}
            </Button>
            <Button
              onClick={() => {
                setGeneratedApiKey(null);
                setIsCopyAcknowledged(false);
                setGeneratedDialogError(null);
                setStatusMessage({
                  tone: 'success',
                  text: t('settings.integrationApiKeys.successCreated'),
                });
              }}
            >
              {t('settings.integrationApiKeys.generatedDoneCta')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingRevokeKey !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRevokeKey(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('settings.integrationApiKeys.revokeConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('settings.integrationApiKeys.revokeConfirmDescription')}
            </DialogDescription>
          </DialogHeader>

          {pendingRevokeKey && (
            <div className="space-y-4">
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {t('settings.integrationApiKeys.revokeConfirmWarning')}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-sm font-semibold text-slate-900">
                  {pendingRevokeKey.name}
                </div>
                <div className="mt-1 font-mono text-xs text-slate-600">
                  {pendingRevokeKey.prefix}...
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setPendingRevokeKey(null)}
            >
              {t('settings.integrationApiKeys.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={!pendingRevokeKey || revokeApiKeyMutation.isPending}
              onClick={async () => {
                if (!pendingRevokeKey) {
                  return;
                }
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
              {revokeApiKeyMutation.isPending
                ? t('settings.integrationApiKeys.revoking')
                : t('settings.integrationApiKeys.revokeConfirmCta')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setConfirmText('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('settings.accountDeletion.confirmTitle')}</DialogTitle>
            <DialogDescription>{t('settings.accountDeletion.confirmDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {t('settings.accountDeletion.confirmWarning')}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900">
                {t('settings.accountDeletion.confirmLabel', { keyword: confirmationKeyword })}
              </label>
              <Input
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={confirmationKeyword}
              />
            </div>
            {deleteMutation.isError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {t('settings.accountDeletion.error')}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
            >
              {t('settings.accountDeletion.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={!canConfirm || deleteMutation.isPending}
              onClick={async () => {
                await deleteMutation.mutateAsync();
              }}
            >
              {deleteMutation.isPending
                ? t('settings.accountDeletion.deleting')
                : t('settings.accountDeletion.confirmCta')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
