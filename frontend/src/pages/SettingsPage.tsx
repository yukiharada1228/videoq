import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18nNavigate } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { apiClient, type IntegrationApiKeyCreateResponse } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, X, CreditCard } from 'lucide-react';

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
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
          {t('settings.integrationApiKeys.permissions.readOnlyTitle')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#d3ffd5] text-[#006d30]">
        {t('settings.integrationApiKeys.permissions.allTitle')}
      </span>
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

      <div className="flex flex-col gap-5">
          {/* ── Billing & Plans ──────────────────────────────────────── */}
          <section className="bg-white rounded-xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] p-5">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="w-4 h-4 text-[#00652c]" />
                  <h2 className="text-base font-bold text-[#191c19]">
                    {t('billing.settingsLink.title')}
                  </h2>
                </div>
                <p className="text-sm text-[#6f7a6e]">
                  {t('billing.settingsLink.description')}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/billing')}
                className="shrink-0"
              >
                {t('billing.settingsLink.button')}
              </Button>
            </div>
          </section>

          {/* ── Integration API Keys ─────────────────────────────────── */}
          <section className="bg-white rounded-xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] p-5">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-[#191c19] mb-1">
                  {t('settings.integrationApiKeys.title')}
                </h2>
                <p className="text-sm text-[#6f7a6e]">
                  {t('settings.integrationApiKeys.description')}
                </p>
              </div>
              <button
                onClick={() => {
                  setStatusMessage(null);
                  setApiKeyDialogError(null);
                  setApiKeyName('');
                  setApiKeyAccessLevel('all');
                  setIsCreateApiKeyDialogOpen(true);
                }}
                className="shrink-0 flex items-center gap-2 bg-[#00652c] hover:bg-[#004b1f] text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                {t('settings.integrationApiKeys.create')}
              </button>
            </div>

            {statusMessage && (
              <div className={`mb-5 p-3 rounded-xl text-sm border ${statusMessage.tone === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
                {statusMessage.text}
              </div>
            )}

            {apiKeysQuery.isLoading && <LoadingSpinner />}
            {apiKeysQuery.isError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
                {t('settings.integrationApiKeys.errorLoading')}
              </div>
            )}
            {!apiKeysQuery.isLoading && !apiKeysQuery.isError && apiKeysQuery.data?.length === 0 && (
              <div className="p-6 rounded-xl bg-[#f2f4ef] text-sm text-[#6f7a6e] text-center">
                {t('settings.integrationApiKeys.empty')}
              </div>
            )}

            {apiKeysQuery.data && apiKeysQuery.data.length > 0 && (
              <div className="overflow-x-auto bg-[#f2f4ef] rounded-xl">
                <table className="w-full text-left border-collapse min-w-[560px]">
                  <thead>
                    <tr className="text-[10px] uppercase font-bold tracking-widest text-[#3f493f]">
                      <th className="px-5 py-4">{t('settings.integrationApiKeys.columns.name')}</th>
                      <th className="px-5 py-4">{t('settings.integrationApiKeys.columns.secret')}</th>
                      <th className="px-5 py-4">{t('settings.integrationApiKeys.columns.permissions')}</th>
                      <th className="px-5 py-4">{t('settings.integrationApiKeys.columns.lastUsed')}</th>
                      <th className="px-5 py-4 text-center">{t('settings.integrationApiKeys.columns.action')}</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-white/50">
                    {apiKeysQuery.data.map((apiKey) => (
                      <tr key={apiKey.id} className="hover:bg-white/40 transition-colors">
                        <td className="px-5 py-4 font-medium text-[#191c19]">{apiKey.name}</td>
                        <td className="px-5 py-4 font-mono text-xs text-[#6f7a6e]">{apiKey.prefix}...</td>
                        <td className="px-5 py-4">{getAccessLevelBadge(apiKey.access_level)}</td>
                        <td className="px-5 py-4 text-xs text-[#6f7a6e]">
                          {apiKey.last_used_at
                            ? new Date(apiKey.last_used_at).toLocaleDateString()
                            : t('settings.integrationApiKeys.neverUsed')}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <button
                            disabled={revokeApiKeyMutation.isPending && revokingId === apiKey.id}
                            onClick={() => setPendingRevokeKey({ id: apiKey.id, name: apiKey.name, prefix: apiKey.prefix })}
                            className="text-red-500 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
                          >
                            {revokeApiKeyMutation.isPending && revokingId === apiKey.id
                              ? <InlineSpinner className="w-4 h-4" />
                              : <X className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Danger Zone ─────────────────────────────────────────── */}
          <section className="bg-white rounded-xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] p-5 border-l-4 border-red-400">
            <div className="mb-5">
              <h2 className="text-base font-bold text-red-700 mb-1">
                {t('settings.accountDeletion.title')}
              </h2>
              <p className="text-sm text-[#6f7a6e]">
                {t('settings.accountDeletion.description')}
              </p>
            </div>

            <div className="space-y-1.5 mb-6">
              <label className="text-xs font-bold text-[#3f493f] px-1">
                {t('settings.accountDeletion.reasonLabel')}
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('settings.accountDeletion.reasonPlaceholder')}
                rows={4}
                className="w-full bg-[#f2f4ef] border-transparent border rounded-xl px-4 py-3 text-sm text-[#191c19] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:bg-white transition-all resize-none"
              />
            </div>

            {deleteMutation.isError && (
              <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
                {t('settings.accountDeletion.error')}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setIsDialogOpen(true)}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-all active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                {t('settings.accountDeletion.cta')}
              </button>
            </div>
          </section>
      </div>

      {/* ── Create API Key Dialog ──────────────────────────────────────── */}
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
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
                {apiKeyDialogError}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-[#191c19]">
                {t('settings.integrationApiKeys.nameLabel')}
              </label>
              <Input
                value={apiKeyName}
                onChange={(event) => setApiKeyName(event.target.value)}
                placeholder={t('settings.integrationApiKeys.namePlaceholder')}
              />
              <p className="text-xs text-[#6f7a6e]">
                {t('settings.integrationApiKeys.nameHelp')}
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-[#191c19]">
                  {t('settings.integrationApiKeys.permissionsLabel')}
                </div>
                <p className="text-xs text-[#6f7a6e]">
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
                      className={`w-full rounded-xl border px-4 py-4 text-left transition-colors ${
                        isSelected
                          ? 'border-[#00652c] bg-[#00652c] text-white'
                          : 'border-[#e1e3de] bg-white text-[#191c19] hover:border-[#c9cec7] hover:bg-[#f8faf5]'
                      }`}
                      onClick={() => setApiKeyAccessLevel(option.value)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold">{option.title}</div>
                          <div className={`text-sm ${isSelected ? 'text-white/80' : 'text-[#6f7a6e]'}`}>
                            {option.description}
                          </div>
                        </div>
                        <span className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                          isSelected
                            ? 'border-white bg-white text-[#00652c]'
                            : 'border-[#c9cec7] text-transparent'
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

          <DialogFooter className="gap-2">
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Generated API Key Dialog ───────────────────────────────────── */}
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
        <DialogContent className="sm:max-w-xl" showCloseButton={false}>
          {generatedApiKey && (
            <div className="space-y-6">
              <DialogHeader className="space-y-3">
                <DialogTitle>{t('settings.integrationApiKeys.generatedDialogTitle')}</DialogTitle>
                <DialogDescription className="leading-6 sm:text-left">
                  {t('settings.integrationApiKeys.generatedDialogDescription')}
                </DialogDescription>
              </DialogHeader>

              {generatedDialogError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
                  {generatedDialogError}
                </div>
              )}

              <div className="space-y-2">
                <div className="text-sm font-medium text-[#191c19]">
                  {t('settings.integrationApiKeys.secretKeyLabel')}
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_112px] sm:items-center">
                  <div className="min-w-0 rounded-xl border border-[#e1e3de] bg-[#f2f4ef] px-4 py-3 font-mono text-sm text-[#191c19]">
                    <span className="block truncate">{generatedApiKey.api_key}</span>
                  </div>
                  <Button
                    variant={isCopyAcknowledged ? 'default' : 'secondary'}
                    className={isCopyAcknowledged ? 'h-10 w-full' : 'h-10 w-full border border-[#d7dbd4] bg-white text-[#191c19] hover:bg-[#f8faf5]'}
                    onClick={handleCopyApiKey}
                  >
                    {isCopyAcknowledged ? t('settings.integrationApiKeys.copyDone') : t('settings.integrationApiKeys.copy')}
                  </Button>
                </div>
                <p className="text-sm text-[#6f7a6e]">
                  {t('settings.integrationApiKeys.generatedTitle')}
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-[#191c19]">
                  {t('settings.integrationApiKeys.permissionsLabel')}
                </div>
                <div className="text-sm text-[#191c19]">
                  {getAccessLevelLabel(generatedApiKey.access_level)}
                </div>
                <div className="text-sm text-[#6f7a6e]">
                  {generatedApiKey.access_level === 'read_only'
                    ? t('settings.integrationApiKeys.permissions.readOnlyDescription')
                    : t('settings.integrationApiKeys.permissions.allDescription')}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setGeneratedApiKey(null);
                setIsCopyAcknowledged(false);
                setGeneratedDialogError(null);
                setStatusMessage({ tone: 'success', text: t('settings.integrationApiKeys.successCreated') });
              }}
            >
              {t('settings.integrationApiKeys.generatedDoneCta')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Revoke Confirm Dialog ──────────────────────────────────────── */}
      <Dialog
        open={pendingRevokeKey !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRevokeKey(null);
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
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
                {t('settings.integrationApiKeys.revokeConfirmWarning')}
              </div>
              <div className="rounded-xl border border-[#e1e3de] bg-[#f8faf5] px-4 py-4">
                <div className="text-sm font-semibold text-[#191c19]">{pendingRevokeKey.name}</div>
                <div className="mt-1 font-mono text-xs text-[#6f7a6e]">{pendingRevokeKey.prefix}...</div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendingRevokeKey(null)}>
              {t('settings.integrationApiKeys.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={!pendingRevokeKey || revokeApiKeyMutation.isPending}
              onClick={async () => {
                if (!pendingRevokeKey) return;
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Account Dialog ──────────────────────────────────────── */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setConfirmText('');
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('settings.accountDeletion.confirmTitle')}</DialogTitle>
            <DialogDescription>{t('settings.accountDeletion.confirmDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
              {t('settings.accountDeletion.confirmWarning')}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#191c19]">
                {t('settings.accountDeletion.confirmLabel', { keyword: confirmationKeyword })}
              </label>
              <Input
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={confirmationKeyword}
              />
            </div>
            {deleteMutation.isError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
                {t('settings.accountDeletion.error')}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {t('settings.accountDeletion.cancel')}
            </Button>
            <Button
              variant="destructive"
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppPageShell>
  );
}
