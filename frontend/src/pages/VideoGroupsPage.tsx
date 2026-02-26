import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useI18nNavigate } from '@/lib/i18n';
import { PageLayout } from '@/components/layout/PageLayout';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useVideoGroups } from '@/hooks/useVideoGroups';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { handleAsyncError } from '@/lib/utils/errorHandling';
import { queryKeys } from '@/lib/queryKeys';
 
export default function VideoGroupsPage() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useI18nNavigate();
  const { groups, isLoading, error: loadError } = useVideoGroups(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const { t } = useTranslation();

  const createGroupMutation = useMutation({
    mutationFn: async () => {
      return await apiClient.createVideoGroup({
        name: newGroupName,
        description: newGroupDescription,
      });
    },
    onSuccess: async () => {
      setNewGroupName('');
      setNewGroupDescription('');
      setIsCreateModalOpen(false);
      if (user?.id != null) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.videoGroups.all(user.id) });
      }
    },
  });
 
  const handleCreateGroup = async () => {
    try {
      if (!newGroupName.trim()) {
        setError(t('validation.required'));
        return;
      }
      setError(null);
      await createGroupMutation.mutateAsync();
    } catch (err) {
      handleAsyncError(err, t('videos.groups.createError'), (msg) => setError(msg));
    }
  };
 
  const handleGroupClick = (groupId: number) => {
    navigate(`/videos/groups/${groupId}`);
  };
 
  if (authLoading || isLoading) {
    return (
      <PageLayout fullWidth>
        <LoadingSpinner />
      </PageLayout>
    );
  }
 
  return (
    <PageLayout fullWidth>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">{t('videos.groups.title')}</h1>
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger asChild>
              <Button>{t('videos.groups.create')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('videos.groups.createTitle')}</DialogTitle>
                <DialogDescription>
                  {t('videos.groups.createDescription')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('videos.groups.nameLabel')}</Label>
                  <Input
                    id="name"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder={t('videos.groups.namePlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">{t('videos.groups.descriptionLabel')}</Label>
                  <Textarea
                    id="description"
                    value={newGroupDescription}
                    onChange={(e) => setNewGroupDescription(e.target.value)}
                    placeholder={t('videos.groups.descriptionPlaceholder')}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                  {t('common.actions.cancel')}
                </Button>
                <Button onClick={handleCreateGroup} disabled={createGroupMutation.isPending}>
                  {t('common.actions.create')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
 
        {(error || loadError) && <MessageAlert message={error || loadError || ''} type="error" />}
 
        {groups.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-gray-500">{t('videos.groups.empty')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups.map((group) => (
              <Card
                key={group.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => handleGroupClick(group.id)}
              >
                <CardHeader>
                  <CardTitle>{group.name}</CardTitle>
                  <CardDescription>{group.description || t('common.messages.noDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    {t('videos.groups.videoCount', { count: group.video_count })}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
