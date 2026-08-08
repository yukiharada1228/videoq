import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AuthPageIntro } from '@/components/layout/AuthPageIntro';
import { FormField } from '@/components/auth/FormField';
import { Button } from '@/components/ui/button';
import { ErrorMessage } from '@/components/auth/ErrorMessage';
import { AUTH_BASE_URL } from '@/lib/auth-client';

/** Device authorization user-code entry (RFC 8628) via Better Auth endpoints. */
export default function DevicePage() {
  const { t } = useTranslation();
  const [userCode, setUserCode] = useState(
    () => new URLSearchParams(window.location.search).get('user_code') ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onApprove(accept: boolean) {
    setLoading(true);
    setError(null);
    try {
      const path = accept ? '/api/auth/device/approve' : '/api/auth/device/deny';
      const res = await fetch(`${AUTH_BASE_URL}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userCode: userCode.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message || body?.message || 'Device authorization failed');
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Device authorization failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <AuthPageIntro
        badge="Device"
        title={t('auth.device.title', { defaultValue: 'Device login' })}
      />
      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
      )}
      {done ? (
        <p className="text-dns-16N-100">
          {t('auth.device.done', { defaultValue: 'You can return to your device.' })}
        </p>
      ) : (
        <div className="space-y-5">
          <FormField
            id="user_code"
            name="user_code"
            label={t('auth.device.codeLabel', { defaultValue: 'Device code' })}
            type="text"
            value={userCode}
            onChange={(e) => setUserCode(e.target.value)}
            required
          />
          <div className="flex gap-3">
            <Button
              type="button"
              variant="solid"
              size="lg"
              disabled={loading || !userCode.trim()}
              onClick={() => void onApprove(true)}
            >
              {t('auth.device.approve', { defaultValue: 'Approve' })}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={loading || !userCode.trim()}
              onClick={() => void onApprove(false)}
            >
              {t('auth.device.deny', { defaultValue: 'Deny' })}
            </Button>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
