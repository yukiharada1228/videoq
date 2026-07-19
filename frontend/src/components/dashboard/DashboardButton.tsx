import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogHeading,
  DialogScrollArea,
  useDialog,
} from '@/components/ui/dialog';
import { useChatAnalytics } from '@/hooks/useChatAnalytics';
import { useChatKeywords } from '@/hooks/useChatKeywords';
import { useEvaluationSummary } from '@/hooks/useEvaluationSummary';
import { AnalyticsDashboard } from './AnalyticsDashboard';

interface DashboardButtonProps {
  groupId: number;
  size?: 'sm' | 'md';
}

export function DashboardButton({ groupId, size = 'md' }: DashboardButtonProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const { data, isLoading } = useChatAnalytics(groupId, isOpen);
  const {
    data: evaluationSummary,
    isLoading: isEvaluationLoading,
  } = useEvaluationSummary(groupId, isOpen);
  const {
    data: keywordsData,
    isLoading: isKeywordsLoading,
  } = useChatKeywords(groupId, isOpen);

  const dialog = useDialog({
    open: isOpen,
    onOpenChange: setIsOpen,
  });

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

      {isOpen && (
        <Dialog {...dialog.dialogProps} scroll="inner" width="min(64rem, 95vw)">
          <DialogContent>
            <DialogHeader>
              <DialogHeading {...dialog.headingProps}>
                {t('dashboard.title')}
              </DialogHeading>
              <DialogClose {...dialog.closeButtonProps} />
            </DialogHeader>
            <DialogScrollArea>
              <DialogBody>
                <AnalyticsDashboard
                  data={data}
                  evaluationSummary={evaluationSummary}
                  isLoading={isLoading}
                  isEvaluationLoading={isEvaluationLoading}
                  keywordsData={keywordsData}
                  isKeywordsLoading={isKeywordsLoading}
                />
              </DialogBody>
            </DialogScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
