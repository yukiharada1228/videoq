import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { ErrorMessage } from '@/components/auth/ErrorMessage';

type GoogleSignInButtonProps = {
  callbackURL?: string;
  labelKey?: string;
};

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.3-1.9 3l3.1 2.4c1.8-1.7 2.9-4.2 2.9-7.2 0-.7-.1-1.4-.2-2H12z"
      />
      <path
        fill="#34A853"
        d="M6.6 14.3l-.9.7-2.7 2.1C4.7 20.3 8.1 22.2 12 22.2c2.7 0 5-.9 6.7-2.4l-3.1-2.4c-.9.6-2 1-3.6 1-2.8 0-5.1-1.9-5.9-4.4z"
      />
      <path
        fill="#4A90E2"
        d="M3 7.1C2.4 8.3 2 9.6 2 11s.4 2.7 1 3.9l3.6-2.8C6.3 11.4 6.2 10.7 6.2 10c0-.7.1-1.4.4-2.1L3 7.1z"
      />
      <path
        fill="#FBBC05"
        d="M12 5.8c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 2.7 14.7 1.8 12 1.8 8.1 1.8 4.7 3.7 3 7.1l3.6 2.8C7 7.4 9.2 5.8 12 5.8z"
      />
    </svg>
  );
}

export function GoogleSignInButton({
  callbackURL = '/',
  labelKey = 'auth.login.continueWithGoogle',
}: GoogleSignInButtonProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      await apiClient.loginWithGoogle(callbackURL);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('auth.login.googleFailed'));
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <ErrorMessage message={error} />}
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        disabled={loading}
        onClick={() => void onClick()}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <InlineSpinner className="w-4 h-4" />
            {t('auth.login.googleRedirecting')}
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <GoogleMark className="h-5 w-5" />
            {t(labelKey)}
          </span>
        )}
      </Button>
    </div>
  );
}
