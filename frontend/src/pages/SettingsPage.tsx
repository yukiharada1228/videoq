import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18nNavigate } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api';
import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function SettingsPage() {
  useAuth();
  const { t } = useTranslation();
  const navigate = useI18nNavigate();
  const queryClient = useQueryClient();

  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const confirmationKeyword = useMemo(() => 'DELETE', []);
  const canConfirm = confirmText.trim().toUpperCase() === confirmationKeyword;

  const deleteMutation = useMutation({
    mutationFn: async () => apiClient.deleteAccount({ reason }),
    onSuccess: async () => {
      queryClient.clear();
      navigate('/login');
    },
  });

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
            {t('settings.title')}
          </h1>
        </div>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t('settings.accountDeletion.title')}</CardTitle>
            <CardDescription>{t('settings.accountDeletion.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {t('settings.accountDeletion.warningLine1')}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900">
                {t('settings.accountDeletion.reasonLabel')}
              </label>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t('settings.accountDeletion.reasonPlaceholder')}
                className="min-h-[120px] bg-white"
              />
            </div>
            {deleteMutation.isError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {t('settings.accountDeletion.error')}
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-end border-t">
            <Button
              variant="destructive"
              onClick={() => setIsDialogOpen(true)}
            >
              {t('settings.accountDeletion.cta')}
            </Button>
          </CardFooter>
        </Card>
      </div>
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setConfirmText('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('settings.accountDeletion.confirmTitle')}</DialogTitle>
            <DialogDescription>{t('settings.accountDeletion.confirmDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {t('settings.accountDeletion.confirmWarning')}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900">
                {t('settings.accountDeletion.confirmLabel', { keyword: confirmationKeyword })}
              </label>
              <Input
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={confirmationKeyword}
              />
            </div>
            {deleteMutation.isError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {t('settings.accountDeletion.error')}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
            >
              {t('settings.accountDeletion.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={!canConfirm || deleteMutation.isPending}
              onClick={async () => {
                await deleteMutation.mutateAsync();
              }}
            >
              {deleteMutation.isPending
                ? t('settings.accountDeletion.deleting')
                : t('settings.accountDeletion.confirmCta')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
