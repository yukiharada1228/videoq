'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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

  const loadGroups = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getVideoGroups();
      setGroups(data);
    } catch (err) {
      handleAsyncError(err, 'チャットグループの読み込みに失敗しました', setError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // 既にロード済みの場合は何もしない（複数回ロード防止）
    if (user?.id && loadedUserId !== user.id) {
      setLoadedUserId(user.id);
      loadGroups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleCreateGroup = async () => {
    try {
      if (!newGroupName.trim()) {
        setError('チャットグループ名を入力してください');
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
      handleAsyncError(err, 'チャットグループの作成に失敗しました', setError);
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
          <h1 className="text-3xl font-bold text-gray-900">チャットグループ</h1>
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger asChild>
              <Button>新規チャットグループを作成</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新規チャットグループを作成</DialogTitle>
                <DialogDescription>
                  チャットグループ名と説明を入力してください
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">チャットグループ名</Label>
                  <Input
                    id="name"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="チャットグループ名"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">説明</Label>
                  <Textarea
                    id="description"
                    value={newGroupDescription}
                    onChange={(e) => setNewGroupDescription(e.target.value)}
                    placeholder="説明（任意）"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                  キャンセル
                </Button>
                <Button onClick={handleCreateGroup}>作成</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {error && <MessageAlert message={error} type="error" />}

        {groups.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-gray-500">チャットグループがありません</p>
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
                  <CardDescription>{group.description || '説明なし'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    {group.video_count} 個の動画
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

