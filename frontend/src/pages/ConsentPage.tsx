import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AuthPageIntro } from '@/components/layout/AuthPageIntro';
import { Button } from '@/components/ui/button';
import { AUTH_BASE_URL } from '@/lib/auth-client';

/**
 * OAuth consent page for Better Auth oauth-provider.
 * Approves/denies via query redirect back to the authorization server.
 */
export default function ConsentPage() {
  const { t } = useTranslation();
  const params = new URLSearchParams(window.location.search);
  const clientName = params.get('client_name') || params.get('client_id') || 'Application';

  const continueUrl = `${AUTH_BASE_URL}/api/auth/oauth2/consent`;

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
      <form method="POST" action={continueUrl} className="flex flex-col gap-3">
        {Array.from(params.entries()).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <Button type="submit" name="accept" value="true" variant="solid" size="lg">
          {t('auth.consent.accept', { defaultValue: 'Allow' })}
        </Button>
        <Button type="submit" name="accept" value="false" variant="outline" size="lg">
          {t('auth.consent.deny', { defaultValue: 'Deny' })}
        </Button>
      </form>
    </AuthLayout>
  );
}
