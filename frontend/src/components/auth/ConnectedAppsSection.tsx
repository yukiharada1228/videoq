import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';

import { apiClient } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { ErrorMessage } from '@/components/auth/ErrorMessage';
import { Button } from '@/components/ui/button';
import { Heading, HeadingTitle } from '@/components/ui/heading';

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
    <section className="border-t border-solid-gray-420 pt-8">
      <div className="mb-5">
        <Heading size="18" hasChip className="mb-2">
          <HeadingTitle level="h2">{t('settings.connectedApps.title')}</HeadingTitle>
        </Heading>
        <p className="text-std-16N-170 text-solid-gray-600">
          {t('settings.connectedApps.description')}
        </p>
      </div>

      {statusMessage && (
        <div className="mb-5">
          <MessageAlert type={statusMessage.tone} message={statusMessage.text} />
        </div>
      )}

      {tokensQuery.isLoading && <LoadingSpinner />}
      {tokensQuery.isError && (
        <ErrorMessage message={t('settings.connectedApps.errorLoading')} />
      )}
      {!tokensQuery.isLoading && !tokensQuery.isError && tokensQuery.data?.length === 0 && (
        <div className="p-6 rounded-8 bg-solid-gray-50 border border-solid-gray-200 text-std-16N-170 text-solid-gray-600 text-center">
          {t('settings.connectedApps.empty')}
        </div>
      )}

      {tokensQuery.data && tokensQuery.data.length > 0 && (
        <div className="overflow-x-auto bg-solid-gray-50 border border-solid-gray-200 rounded-8">
          <table className="w-full text-left border-collapse min-w-[560px]">
            <thead>
              <tr className="text-dns-14B-120 uppercase tracking-widest text-solid-gray-600">
                <th className="px-5 py-4">{t('settings.connectedApps.columns.app')}</th>
                <th className="px-5 py-4">{t('settings.connectedApps.columns.scope')}</th>
                <th className="px-5 py-4">{t('settings.connectedApps.columns.issued')}</th>
                <th className="px-5 py-4">{t('settings.connectedApps.columns.expires')}</th>
                <th className="px-5 py-4 text-center">
                  {t('settings.connectedApps.columns.action')}
                </th>
              </tr>
            </thead>
            <tbody className="text-std-16N-170 divide-y divide-solid-gray-200">
              {tokensQuery.data.map((token) => (
                <tr key={token.id} className="hover:bg-white transition-colors">
                  <td className="px-5 py-4 font-medium text-solid-gray-800">{token.client_name}</td>
                  <td className="px-5 py-4 font-mono text-dns-14N-130 text-solid-gray-600">{token.scope || '—'}</td>
                  <td className="px-5 py-4 text-dns-14N-130 text-solid-gray-600">
                    {new Date(token.issued_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-4 text-dns-14N-130 text-solid-gray-600">
                    {token.expires_at
                      ? new Date(token.expires_at).toLocaleString()
                      : t('settings.connectedApps.expiresNever')}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <Button
                      type="button"
                      variant="text"
                      size="xs"
                      disabled={revokeMutation.isPending && revokingId === token.id}
                      onClick={() => revokeMutation.mutate(token.id)}
                      aria-label={t('settings.connectedApps.revoke')}
                      className="min-w-0 text-error-1 hover:bg-red-50"
                    >
                      {revokeMutation.isPending && revokingId === token.id ? (
                        <InlineSpinner className="w-4 h-4" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                    </Button>
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
