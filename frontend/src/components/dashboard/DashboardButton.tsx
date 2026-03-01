import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useChatAnalytics } from '@/hooks/useChatAnalytics';
import { AnalyticsDashboard } from './AnalyticsDashboard';

interface DashboardButtonProps {
  groupId: number;
  size?: 'sm' | 'default';
}

export function DashboardButton({ groupId, size = 'default' }: DashboardButtonProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const { data, isLoading } = useChatAnalytics(groupId, isOpen);

  return (
    <>
      <Button
        variant="outline"
        size={size}
        onClick={() => setIsOpen(true)}
        className="gap-2"
      >
        <BarChart3 className="h-4 w-4" />
        {t('dashboard.button')}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[95vw] lg:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('dashboard.title')}</DialogTitle>
          </DialogHeader>
          <AnalyticsDashboard data={data} isLoading={isLoading} />
        </DialogContent>
      </Dialog>
    </>
  );
}
