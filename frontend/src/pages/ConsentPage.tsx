import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AuthPageIntro } from '@/components/layout/AuthPageIntro';
import { ErrorMessage } from '@/components/auth/ErrorMessage';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

/**
 * OAuth consent page for Better Auth oauth-provider.
 * Completes authorization via authClient.oauth2.consent (JSON + oauth_query).
 */
export default function ConsentPage() {
  const { t } = useTranslation();
  const params = new URLSearchParams(window.location.search);
  const clientName = params.get('client_name') || params.get('client_id') || 'Application';
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function decide(accept: boolean) {
    setLoading(true);
    setError(null);
    try {
      const { data, error: consentError } = await authClient.oauth2.consent({ accept });
      if (consentError) {
        throw new Error(consentError.message || 'Consent failed');
      }
      const redirectUrl =
        data && typeof data === 'object' && 'url' in data && typeof data.url === 'string'
          ? data.url
          : null;
      if (redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }
      throw new Error('Consent completed without redirect');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Consent failed');
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <AuthPageIntro
        badge="OAuth"
        title={t('auth.consent.title', { defaultValue: 'Authorize application' })}
      />
      <p className="mb-6 text-dns-16N-100 text-solid-gray-620">
        {t('auth.consent.body', {
          defaultValue: '{{name}} is requesting access to your VideoQ account.',
          name: clientName,
        })}
      </p>
      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
      )}
      <div className="flex flex-col gap-3">
        <Button
          type="button"
          variant="solid"
          size="lg"
          disabled={loading}
          onClick={() => void decide(true)}
        >
          {t('auth.consent.accept', { defaultValue: 'Allow' })}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={loading}
          onClick={() => void decide(false)}
        >
          {t('auth.consent.deny', { defaultValue: 'Deny' })}
        </Button>
      </div>
    </AuthLayout>
  );
}
