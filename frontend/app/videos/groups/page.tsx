'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/layout/PageLayout';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { apiClient, VideoGroupList } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { handleAsyncError } from '@/lib/utils/errorHandling';

export default function VideoGroupsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [groups, setGroups] = useState<VideoGroupList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [loadedUserId, setLoadedUserId] = useState<number | null>(null);
  const { t } = useTranslation();

  const loadGroups = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getVideoGroups();
      setGroups(data);
    } catch (err) {
      handleAsyncError(err, t('videos.groups.loadError'), setError);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (user?.id && loadedUserId !== user.id) {
      setLoadedUserId(user.id);
      void loadGroups();
    }
  }, [user?.id, loadedUserId, loadGroups]);

  const handleCreateGroup = async () => {
    try {
      if (!newGroupName.trim()) {
        setError(t('videos.groups.validation.nameRequired'));
        return;
      }
      setError(null);
      await apiClient.createVideoGroup({
        name: newGroupName,
        description: newGroupDescription,
      });
      setNewGroupName('');
      setNewGroupDescription('');
      setIsCreateModalOpen(false);
      
      // 再読み込み
      setLoadedUserId(null);
      await loadGroups();
    } catch (err) {
      handleAsyncError(err, t('videos.groups.createError'), setError);
    }
  };

  const handleGroupClick = (groupId: number) => {
    router.push(`/videos/groups/${groupId}`);
  };

  if (isLoading) {
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
                <Button onClick={handleCreateGroup}>{t('common.actions.create')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {error && <MessageAlert message={error} type="error" />}

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

