import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { apiClient } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { ErrorMessage } from '@/components/auth/ErrorMessage';
import { Button } from '@/components/ui/button';
import { Heading, HeadingTitle } from '@/components/ui/heading';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader, DialogHeading, useDialog } from '@/components/ui/dialog';

type StatusMessage = { tone: 'success' | 'error'; text: string } | null;

export function ConnectedAppsSection({ headingLevel = 'h2' }: { headingLevel?: 'h2' | 'h3' }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [statusMessage, setStatusMessage] = useState<StatusMessage>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<{ id: string; name: string } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  const tokensQuery = useQuery({
    queryKey: queryKeys.auth.oauthTokens,
    queryFn: async () => apiClient.getAuthorizedOAuthTokens(),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiClient.revokeAuthorizedOAuthToken(id),
    onMutate: (id: string) => {
      setRevokingId(id);
      setStatusMessage(null);
    },
    onSuccess: async () => {
      setStatusMessage({ tone: 'success', text: t('settings.connectedApps.successRevoked') });
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.oauthTokens });
    },
    onError: () => {
      setStatusMessage({ tone: 'error', text: t('settings.connectedApps.errorRevoking') });
    },
    onSettled: () => {
      setRevokingId(null);
      setPendingRevoke(null);
    },
  });

  const closeConfirmation = () => {
    setPendingRevoke(null);
  };
  const confirmation = useDialog({
    open: pendingRevoke !== null,
    onOpenChange: (open) => { if (!open) closeConfirmation(); },
    onRequestClose: (event) => { if (revokeMutation.isPending) event.preventDefault(); },
  });

  const wasConfirming = useRef(false);
  useEffect(() => {
    if (!pendingRevoke && wasConfirming.current && !statusMessage) triggerRef.current?.focus();
    wasConfirming.current = pendingRevoke !== null;
  }, [pendingRevoke, statusMessage]);

  useEffect(() => {
    if (statusMessage && !revokeMutation.isPending) statusRef.current?.focus();
  }, [statusMessage, revokeMutation.isPending]);

  return (
    <section aria-labelledby="connected-apps-heading">
      <div className="mb-4">
        <Heading size="18" className="mb-2">
          <HeadingTitle id="connected-apps-heading" level={headingLevel}>{t('settings.connectedApps.title')}</HeadingTitle>
        </Heading>
        <p className="text-std-16N-170 text-solid-gray-600">
          {t('settings.connectedApps.description')}
        </p>
      </div>

      {statusMessage && (
        <div ref={statusRef} tabIndex={-1} className="mb-5 focus-visible:outline-4 focus-visible:outline-black focus-visible:outline-offset-2">
          <MessageAlert type={statusMessage.tone} message={statusMessage.text} />
        </div>
      )}

      {tokensQuery.isLoading && <LoadingSpinner />}
      {tokensQuery.isError && (
        <ErrorMessage message={t('settings.connectedApps.errorLoading')} />
      )}
      {!tokensQuery.isLoading && !tokensQuery.isError && tokensQuery.data?.length === 0 && (
        <div className="p-4 rounded-8 bg-solid-gray-50 text-std-16N-170 text-solid-gray-600">
          {t('settings.connectedApps.empty')}
        </div>
      )}

      {tokensQuery.data && tokensQuery.data.length > 0 && (
        <ul aria-label={t('settings.connectedApps.title')} className="divide-y divide-solid-gray-200 rounded-8 border border-solid-gray-200">
          {tokensQuery.data.map((token) => (
            <li key={token.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 break-words text-std-16B-170 [overflow-wrap:anywhere]">{token.client_name}</p>
                <Button
                  type="button"
                  variant="text"
                  size="sm"
                  disabled={revokeMutation.isPending}
                  aria-busy={revokeMutation.isPending && revokingId === token.id}
                  onClick={(event) => {
                    triggerRef.current = event.currentTarget;
                    setStatusMessage(null);
                    setPendingRevoke({ id: token.id, name: token.client_name });
                  }}
                  aria-label={`${t('settings.connectedApps.revoke')}: ${token.client_name}`}
                  className="shrink-0 text-error-1 hover:bg-red-50"
                >
                  {revokeMutation.isPending && revokingId === token.id && <InlineSpinner className="mr-1 h-4 w-4" />}
                  {t('settings.connectedApps.revoke')}
                </Button>
              </div>
              <details className="mt-2 text-solid-gray-600">
                <summary className="w-fit cursor-pointer rounded-4 text-std-16N-170 underline underline-offset-4 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-black">
                  {t('settings.connectedApps.details')}
                </summary>
                <dl className="mt-3 grid gap-3 text-dns-14N-130 sm:grid-cols-2">
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="font-bold">{t('settings.connectedApps.columns.scope')}</dt>
                    <dd className="mt-1 break-words font-mono [overflow-wrap:anywhere]">{token.scope || '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-bold">{t('settings.connectedApps.columns.issued')}</dt>
                    <dd className="mt-1">{new Date(token.issued_at).toLocaleString(i18n.language)}</dd>
                  </div>
                  <div>
                    <dt className="font-bold">{t('settings.connectedApps.columns.expires')}</dt>
                    <dd className="mt-1">{token.expires_at ? new Date(token.expires_at).toLocaleString(i18n.language) : t('settings.connectedApps.expiresNever')}</dd>
                  </div>
                </dl>
              </details>
            </li>
          ))}
        </ul>
      )}
      {pendingRevoke && (
        <Dialog {...confirmation.dialogProps} width="min(32rem, 92vw)" aria-describedby="disconnect-description">
          <DialogContent>
            <DialogHeader>
              <DialogHeading {...confirmation.headingProps}>{t('settings.connectedApps.confirmTitle')}</DialogHeading>
            </DialogHeader>
            <DialogBody>
              <p className="mb-3 break-words text-std-16B-170">{pendingRevoke.name}</p>
              <p id="disconnect-description" className="text-std-16N-170 text-solid-gray-700">{t('settings.connectedApps.confirmDescription')}</p>
            </DialogBody>
            <DialogActions>
              <div className="flex flex-wrap justify-end gap-3">
                <Button variant="outline" disabled={revokeMutation.isPending} onClick={closeConfirmation}>{t('settings.cancel')}</Button>
                <Button
                  className="bg-error-1 hover:bg-red-1000 active:bg-red-1200"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(pendingRevoke.id)}
                >
                  {revokeMutation.isPending && <InlineSpinner className="mr-1 h-4 w-4" />}
                  {t(revokeMutation.isPending ? 'settings.connectedApps.revoking' : 'settings.connectedApps.revoke')}
                </Button>
              </div>
            </DialogActions>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
