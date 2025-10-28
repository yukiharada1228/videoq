'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { apiClient, VideoGroup, VideoList, Video, VideoInGroup } from '@/lib/api';
import { PageLayout } from '@/components/layout/PageLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { formatDate } from '@/lib/utils/video';
import Link from 'next/link';
import { getStatusBadgeClassName, getStatusLabel } from '@/lib/utils/video';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { handleAsyncError } from '@/lib/utils/errorHandling';

export default function VideoGroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const groupId = params?.id ? parseInt(params.id as string) : null;
  const { user } = useAuth();

  const [group, setGroup] = useState<VideoGroup | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [availableVideos, setAvailableVideos] = useState<VideoList[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [selectedVideos, setSelectedVideos] = useState<number[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  type SelectedVideo = {
    id: number;
    title: string;
    description: string;
    file: string;
    status: string;
  };
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null);

  const loadGroup = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getVideoGroup(groupId!);
      setGroup(data);
    } catch (err) {
      handleAsyncError(err, 'グループの読み込みに失敗しました', setError);
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  const loadAvailableVideos = useCallback(async () => {
    if (!group?.videos) return;
    
    try {
      setIsLoadingVideos(true);
      const videos = await apiClient.getVideos();
      // すでにグループに追加されている動画を除外
      const currentVideoIds = group.videos.map(v => v.id);
      // Setを使用してO(1)ルックアップを実現（N+1問題対策）
      const currentVideoIdSet = new Set(currentVideoIds);
      const available = videos.filter(v => !currentVideoIdSet.has(v.id));
      setAvailableVideos(available);
    } catch (err) {
      handleAsyncError(err, '動画の読み込みに失敗しました', setError);
    } finally {
      setIsLoadingVideos(false);
    }
  }, [group?.videos]);

  useEffect(() => {
    if (groupId) {
      loadGroup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    if (isAddModalOpen && group) {
      loadAvailableVideos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAddModalOpen]);

  const handleAddVideos = async () => {
    if (selectedVideos.length === 0) {
      setError('動画を選択してください');
      return;
    }

    try {
      setIsAdding(true);
      setError(null);
      
      // 選択された動画を一括追加（N+1問題の解決）
      const result = await apiClient.addVideosToGroup(groupId!, selectedVideos);
      
      // グループを再読み込み
      await loadGroup();
      setIsAddModalOpen(false);
      setSelectedVideos([]);
      
      // 結果を表示
      if (result.skipped_count > 0) {
        alert(`${result.added_count}個の動画を追加しました（${result.skipped_count}個は既に追加済みでした）`);
      }
    } catch (err) {
      handleAsyncError(err, '動画の追加に失敗しました', setError);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveVideo = async (videoId: number) => {
    if (!confirm('この動画をグループから削除しますか？')) {
      return;
    }

    try {
      await apiClient.removeVideoFromGroup(groupId!, videoId);
      await loadGroup();
      // 削除した動画が選択されていた場合、選択を解除
      if (selectedVideo?.id === videoId) {
        setSelectedVideo(null);
      }
    } catch (err) {
      handleAsyncError(err, '動画の削除に失敗しました', setError);
    }
  };

  const handleVideoSelect = (videoId: number) => {
    // グループ情報から直接動画データを取得（N+1問題の解決）
    const video = group?.videos?.find(v => v.id === videoId);
    if (video) {
      setSelectedVideo(video);
    }
  };

  const handleDelete = async () => {
    if (!confirm('このグループを削除しますか？')) {
      return;
    }

    try {
      setIsDeleting(true);
      await apiClient.deleteVideoGroup(groupId!);
      router.push('/videos/groups');
    } catch (err) {
      handleAsyncError(err, 'グループの削除に失敗しました', setError);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <PageLayout>
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner fullScreen={false} />
        </div>
      </PageLayout>
    );
  }

  if (error && !group) {
    return (
      <PageLayout>
        <div className="space-y-4">
          <MessageAlert type="error" message={error} />
          <Link href="/videos/groups">
            <Button variant="outline">一覧に戻る</Button>
          </Link>
        </div>
      </PageLayout>
    );
  }

  if (!group) {
    return (
      <PageLayout>
        <div className="text-center text-gray-500">グループが見つかりません</div>
      </PageLayout>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header />
      <div className="flex-1 container mx-auto px-4 py-4">
        <div className="space-y-4 h-full flex flex-col">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{group.name}</h1>
              <p className="text-gray-500 mt-1">
                {group.description || '説明なし'}
              </p>
            </div>
            <div className="flex gap-2">
              <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogTrigger asChild>
                  <Button>動画を追加</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>動画を追加</DialogTitle>
                    <DialogDescription>
                      グループに追加する動画を選択してください
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {isLoadingVideos ? (
                      <LoadingSpinner />
                    ) : availableVideos.length === 0 ? (
                      <p className="text-center text-gray-500 py-4">追加可能な動画がありません</p>
                    ) : (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {availableVideos.map((video) => (
                          <div key={video.id} className="flex items-center space-x-2 p-3 border rounded hover:bg-gray-50">
                            <Checkbox
                              id={`video-${video.id}`}
                              checked={selectedVideos.includes(video.id)}
                              onCheckedChange={(checked: boolean | 'indeterminate') => {
                                if (checked === true) {
                                  setSelectedVideos([...selectedVideos, video.id]);
                                } else if (checked === false) {
                                  setSelectedVideos(selectedVideos.filter(id => id !== video.id));
                                }
                              }}
                            />
                            <label htmlFor={`video-${video.id}`} className="flex-1 cursor-pointer">
                              <div className="font-medium text-gray-900">{video.title}</div>
                              <div className="text-sm text-gray-600">{video.description || '説明なし'}</div>
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
                      キャンセル
                    </Button>
                    <Button onClick={handleAddVideos} disabled={isAdding || selectedVideos.length === 0}>
                      {isAdding ? (
                        <span className="flex items-center">
                          <InlineSpinner className="mr-2" />
                          追加中...
                        </span>
                      ) : (
                        '追加'
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Link href="/videos/groups">
                <Button variant="outline">一覧に戻る</Button>
              </Link>
              <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? (
                  <span className="flex items-center">
                    <InlineSpinner className="mr-2" color="red" />
                    削除中...
                  </span>
                ) : (
                  '削除'
                )}
              </Button>
            </div>
          </div>

          {error && <MessageAlert type="error" message={error} />}

          {/* 3カラムレイアウト */}
          <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
          {/* 左側：動画一覧 */}
          <div className="col-span-3 overflow-y-auto">
            <Card className="h-full">
              <CardHeader>
                <CardTitle>動画一覧</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {group.videos && group.videos.length > 0 ? (
                  group.videos.map((video) => (
                    <div
                      key={video.id}
                      onClick={() => handleVideoSelect(video.id)}
                      className={`p-3 border rounded cursor-pointer hover:bg-gray-50 ${
                        selectedVideo?.id === video.id ? 'bg-blue-50 border-blue-300' : ''
                      }`}
                    >
                      <h3 className="font-semibold text-sm text-gray-900 truncate">{video.title}</h3>
                      <p className="text-xs text-gray-600 line-clamp-1">{video.description || '説明なし'}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={getStatusBadgeClassName(video.status, 'sm')}>
                          {getStatusLabel(video.status)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveVideo(video.id);
                          }}
                        >
                          削除
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-gray-500 py-4 text-sm">動画がありません</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 中央：動画プレイヤー */}
          <div className="col-span-6">
            <Card className="h-full flex flex-col">
              <CardHeader>
                <CardTitle>
                  {selectedVideo ? selectedVideo.title : '動画を選択してください'}
                </CardTitle>
                {selectedVideo && (
                  <p className="text-sm text-gray-600 mt-1">{selectedVideo.description || '説明なし'}</p>
                )}
              </CardHeader>
              <CardContent className="flex-1 flex items-center justify-center">
                {selectedVideo ? (
                  selectedVideo.file ? (
                    <video
                      key={selectedVideo.id}
                      controls
                      className="w-full max-h-[500px] rounded"
                      src={selectedVideo.file}
                    >
                      お使いのブラウザは動画タグをサポートしていません。
                    </video>
                  ) : (
                    <p className="text-gray-500">動画ファイルがありません</p>
                  )
                ) : (
                  <p className="text-gray-500 text-center">
                    左側のリストから動画を選択してください
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 右側：チャット */}
          <div className="col-span-3">
            <ChatPanel hasApiKey={!!user?.encrypted_openai_api_key} />
          </div>
        </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

