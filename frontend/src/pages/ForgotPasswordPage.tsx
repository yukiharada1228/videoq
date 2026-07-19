import { useState } from 'react';
import { Link } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Send } from 'lucide-react';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { useRequestPasswordResetMutation } from '@/hooks/usePasswordRecovery';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AuthPageIntro } from '@/components/layout/AuthPageIntro';
import { FormField } from '@/components/auth/FormField';
import { ErrorMessage } from '@/components/auth/ErrorMessage';
import { MessageAlert } from '@/components/common/MessageAlert';
import { AuthFormFooter } from '@/components/auth/AuthFormFooter';
import { Button } from '@/components/ui/button';
import { UtilityLink } from '@/components/ui/utility-link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  const requestResetMutation = useRequestPasswordResetMutation();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess(false);
    setError(null);

    try {
      await requestResetMutation.mutateAsync(email);
      setSuccess(true);
    } catch {
      setError(
        requestResetMutation.error instanceof Error
          ? requestResetMutation.error.message
          : requestResetMutation.error
            ? String(requestResetMutation.error)
            : null,
      );
    }
  };

  return (
    <AuthLayout>
      <UtilityLink asChild className="mb-12 inline-flex items-center">
        <Link href="/login">
          <ArrowLeft className="mr-2 w-4 h-4" />
          {t('auth.forgotPassword.backToLogin')}
        </Link>
      </UtilityLink>

      <div className="space-y-6">
        <AuthPageIntro
          badge={t('auth.forgotPassword.badge')}
          title={t('auth.forgotPassword.title')}
          description={t('auth.forgotPassword.description')}
        />

        {success && <MessageAlert type="success" message={t('auth.forgotPassword.success')} />}
        {error && <ErrorMessage message={error} />}

        <form onSubmit={handleSubmit} className="space-y-5">
          <FormField
            id="email"
            name="email"
            label={t('auth.fields.email.label')}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.fields.email.placeholder')}
            autoComplete="email"
          />

          <Button
            type="submit"
            variant="solid"
            size="lg"
            className="w-full"
            disabled={requestResetMutation.isPending}
          >
            {requestResetMutation.isPending ? (
              <>
                <InlineSpinner className="w-4 h-4" />
                {t('auth.forgotPassword.submitting')}
              </>
            ) : (
              <>
                {t('auth.forgotPassword.submit')}
                <Send className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </form>

        <div className="pt-8">
          <AuthFormFooter
            questionText={t('auth.forgotPassword.noAccount')}
            linkText={t('auth.forgotPassword.signUp')}
            href="/signup"
          />
        </div>
      </div>

    </AuthLayout>
  );
}
