'use client';

import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLayout } from '@/components/layout/PageLayout';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export default function Settings() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  if (loading || !user) {
    return <LoadingSpinner />;
  }

  return (
    <PageLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.title')}</CardTitle>
            <CardDescription>{t('settings.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm text-blue-800">
                  {t('settings.info')}
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{t('settings.usageLimits.title')}</h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                  <li>{t('settings.usageLimits.videos')}</li>
                  <li>{t('settings.usageLimits.whisper')}</li>
                  <li>{t('settings.usageLimits.chat')}</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}

