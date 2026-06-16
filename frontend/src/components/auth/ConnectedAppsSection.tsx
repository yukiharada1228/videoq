import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';

import { apiClient } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useState } from 'react';

type StatusMessage = { tone: 'success' | 'error'; text: string } | null;

export function ConnectedAppsSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [statusMessage, setStatusMessage] = useState<StatusMessage>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const tokensQuery = useQuery({
    queryKey: queryKeys.auth.oauthTokens,
    queryFn: async () => apiClient.getAuthorizedOAuthTokens(),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: number) => {
      setRevokingId(id);
      try {
        await apiClient.revokeAuthorizedOAuthToken(id);
      } finally {
        setRevokingId(null);
      }
    },
    onSuccess: async () => {
      setStatusMessage({ tone: 'success', text: t('settings.connectedApps.successRevoked') });
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.oauthTokens });
    },
    onError: () => {
      setStatusMessage({ tone: 'error', text: t('settings.connectedApps.errorRevoking') });
    },
  });

  return (
    <section className="bg-white rounded-xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] p-5">
      <div className="mb-5">
        <h2 className="text-base font-bold text-[#191c19] mb-1">
          {t('settings.connectedApps.title')}
        </h2>
        <p className="text-sm text-[#6f7a6e]">
          {t('settings.connectedApps.description')}
        </p>
      </div>

      {statusMessage && (
        <div
          className={`mb-5 p-3 rounded-xl text-sm border ${
            statusMessage.tone === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-600'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {tokensQuery.isLoading && <LoadingSpinner />}
      {tokensQuery.isError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
          {t('settings.connectedApps.errorLoading')}
        </div>
      )}
      {!tokensQuery.isLoading && !tokensQuery.isError && tokensQuery.data?.length === 0 && (
        <div className="p-6 rounded-xl bg-[#f2f4ef] text-sm text-[#6f7a6e] text-center">
          {t('settings.connectedApps.empty')}
        </div>
      )}

      {tokensQuery.data && tokensQuery.data.length > 0 && (
        <div className="overflow-x-auto bg-[#f2f4ef] rounded-xl">
          <table className="w-full text-left border-collapse min-w-[560px]">
            <thead>
              <tr className="text-[10px] uppercase font-bold tracking-widest text-[#3f493f]">
                <th className="px-5 py-4">{t('settings.connectedApps.columns.app')}</th>
                <th className="px-5 py-4">{t('settings.connectedApps.columns.scope')}</th>
                <th className="px-5 py-4">{t('settings.connectedApps.columns.issued')}</th>
                <th className="px-5 py-4">{t('settings.connectedApps.columns.expires')}</th>
                <th className="px-5 py-4 text-center">
                  {t('settings.connectedApps.columns.action')}
                </th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-white/50">
              {tokensQuery.data.map((token) => (
                <tr key={token.id} className="hover:bg-white/40 transition-colors">
                  <td className="px-5 py-4 font-medium text-[#191c19]">{token.client_name}</td>
                  <td className="px-5 py-4 font-mono text-xs text-[#6f7a6e]">{token.scope || '—'}</td>
                  <td className="px-5 py-4 text-xs text-[#6f7a6e]">
                    {new Date(token.issued_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-4 text-xs text-[#6f7a6e]">
                    {token.expires_at
                      ? new Date(token.expires_at).toLocaleString()
                      : t('settings.connectedApps.expiresNever')}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <button
                      disabled={revokeMutation.isPending && revokingId === token.id}
                      onClick={() => revokeMutation.mutate(token.id)}
                      aria-label={t('settings.connectedApps.revoke')}
                      className="text-red-500 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
                    >
                      {revokeMutation.isPending && revokingId === token.id ? (
                        <InlineSpinner className="w-4 h-4" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
