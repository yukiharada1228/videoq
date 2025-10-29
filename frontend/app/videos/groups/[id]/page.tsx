'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { apiClient, VideoGroup, VideoList, VideoInGroup } from '@/lib/api';
import { PageLayout } from '@/components/layout/PageLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import Link from 'next/link';
import { getStatusBadgeClassName, getStatusLabel } from '@/lib/utils/video';
import { convertVideoInGroupToSelectedVideo, createVideoIdSet, SelectedVideo } from '@/lib/utils/videoConversion';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { handleAsyncError } from '@/lib/utils/errorHandling';
import { useAsyncState } from '@/hooks/useAsyncState';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ソータブルな動画アイテムコンポーネント
interface SortableVideoItemProps {
  video: VideoInGroup;
  isSelected: boolean;
  onSelect: (videoId: number) => void;
  onRemove: (videoId: number) => void;
}

function SortableVideoItem({ video, isSelected, onSelect, onRemove }: SortableVideoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: video.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(video.id)}
      className={`p-3 border rounded cursor-pointer hover:bg-gray-50 cursor-grab active:cursor-grabbing ${
        isSelected ? 'bg-blue-50 border-blue-300' : ''
      } ${isDragging ? 'shadow-lg' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-gray-900 truncate">{video.title}</h3>
          <p className="text-xs text-gray-600 line-clamp-1">{video.description || '説明なし'}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={getStatusBadgeClassName(video.status, 'sm')}>
              {getStatusLabel(video.status)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(video.id);
            }}
          >
            削除
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function VideoGroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const groupId = params?.id ? parseInt(params.id as string) : null;
  const { user } = useAuth();

  // DRY原則: useAsyncStateを使用して状態管理を統一
  const { data: group, isLoading, error, execute: loadGroup, setData: setGroup } = useAsyncState<VideoGroup>({
    initialData: null,
  });

  const { data: availableVideos, isLoading: isLoadingVideos, execute: loadAvailableVideos } = useAsyncState<VideoList[]>({
    initialData: [],
  });

  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedVideos, setSelectedVideos] = useState<number[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingStartTimeRef = useRef<number | null>(null);

  // 編集モードの状態管理
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');

  // ドラッグアンドドロップのセンサー設定
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px移動したらドラッグ開始（クリック誤発火防止）
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const loadGroupData = useCallback(async () => {
    if (!groupId) return;
    await loadGroup(() => apiClient.getVideoGroup(groupId));
  }, [groupId, loadGroup]);

  const loadAvailableVideosData = useCallback(async () => {
    if (!group?.videos) return;
    
    await loadAvailableVideos(async () => {
      const videos = await apiClient.getVideos();
      // すでにグループに追加されている動画を除外
      const currentVideoIds = group.videos?.map(v => v.id) || [];
      // 共通のSet作成関数を使用（DRY原則・N+1問題対策）
      const currentVideoIdSet = createVideoIdSet(currentVideoIds);
      return videos.filter(v => !currentVideoIdSet.has(v.id));
    });
  }, [group?.videos, loadAvailableVideos]);

  useEffect(() => {
    if (groupId) {
      loadGroupData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    if (isAddModalOpen && group) {
      loadAvailableVideosData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAddModalOpen]);

  const handleAddVideos = async () => {
    if (selectedVideos.length === 0) {
      return;
    }

    try {
      setIsAdding(true);
      
      // 選択された動画を一括追加（N+1問題の解決）
      const result = await apiClient.addVideosToGroup(groupId!, selectedVideos);
      
      // グループを再読み込み
      await loadGroupData();
      setIsAddModalOpen(false);
      setSelectedVideos([]);
      
      // 結果を表示
      if (result.skipped_count > 0) {
        alert(`${result.added_count}個の動画を追加しました（${result.skipped_count}個は既に追加済みでした）`);
      }
    } catch (err) {
      handleAsyncError(err, '動画の追加に失敗しました', () => {});
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
      await loadGroupData();
      // 削除した動画が選択されていた場合、選択を解除
      if (selectedVideo?.id === videoId) {
        setSelectedVideo(null);
      }
    } catch (err) {
      handleAsyncError(err, '動画の削除に失敗しました', () => {});
    }
  };

  const handleGenerateShareLink = async () => {
    if (!group) return;

    try {
      setIsGeneratingLink(true);
      const result = await apiClient.createShareLink(group.id);
      const shareUrl = `${window.location.origin}/share/${result.share_token}`;
      setShareLink(shareUrl);
      await loadGroupData(); // グループを再読み込みしてshare_tokenを更新
    } catch (err) {
      handleAsyncError(err, '共有リンクの生成に失敗しました', () => {});
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleDeleteShareLink = async () => {
    if (!group || !confirm('共有リンクを無効化しますか？')) return;

    try {
      await apiClient.deleteShareLink(group.id);
      setShareLink(null);
      await loadGroupData(); // グループを再読み込み
    } catch (err) {
      handleAsyncError(err, '共有リンクの削除に失敗しました', () => {});
    }
  };

  const handleCopyShareLink = async () => {
    if (!shareLink) return;

    try {
      // モダンな Clipboard API を試す
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareLink);
      } else {
        // フォールバック: 古いブラウザや非HTTPSの場合
        const textArea = document.createElement('textarea');
        textArea.value = shareLink;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        textArea.remove();

        if (!successful) {
          throw new Error('Copy command failed');
        }
      }

      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('コピーに失敗しました。手動でコピーしてください。');
    }
  };

  // グループが読み込まれたら、共有リンクをセット
  useEffect(() => {
    if (group?.share_token) {
      const shareUrl = `${window.location.origin}/share/${group.share_token}`;
      setShareLink(shareUrl);
    } else {
      setShareLink(null);
    }
    setIsCopied(false); // 共有リンクが変わったらコピー状態をリセット
  }, [group?.share_token]);

  // グループデータが読み込まれたら編集用の状態を初期化
  useEffect(() => {
    if (group) {
      setEditedName(group.name);
      setEditedDescription(group.description || '');
    }
  }, [group]);

  const handleVideoSelect = (videoId: number) => {
    // グループ情報から直接動画データを取得（N+1問題の解決）
    // 既にprefetch_relatedで取得済みのデータを使用
    const video = group?.videos?.find(v => v.id === videoId);
    if (video) {
      // 共通の変換関数を使用（DRY原則・N+1問題対策）
      setSelectedVideo(convertVideoInGroupToSelectedVideo(video));
    }
  };

  // チャットから動画を選択して指定時間から再生する関数
  const handleVideoPlayFromTime = (videoId: number, startTime: string) => {
    // 時間文字列を秒に変換（形式: HH:MM:SS,mmm または MM:SS）
    const timeToSeconds = (timeStr: string): number => {
      // カンマがあればミリ秒部分を削除
      const timeWithoutMs = timeStr.split(',')[0];
      const parts = timeWithoutMs.split(':');

      if (parts.length === 3) {
        // HH:MM:SS 形式
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        const seconds = parseInt(parts[2], 10);
        return hours * 3600 + minutes * 60 + seconds;
      } else if (parts.length === 2) {
        // MM:SS 形式
        const minutes = parseInt(parts[0], 10);
        const seconds = parseInt(parts[1], 10);
        return minutes * 60 + seconds;
      }
      return 0;
    };

    const seconds = timeToSeconds(startTime);

    // 同じ動画が既に選択されている場合は即座に時間を設定
    if (selectedVideo?.id === videoId && videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play();
    } else {
      // 別の動画を選択する場合は開始時間を保存
      pendingStartTimeRef.current = seconds;
      handleVideoSelect(videoId);
    }
  };

  // 動画が読み込まれて再生可能になったら指定時間から再生
  const handleVideoCanPlay = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (pendingStartTimeRef.current !== null) {
      const videoElement = event.currentTarget;
      videoElement.currentTime = pendingStartTimeRef.current;
      videoElement.play();
      pendingStartTimeRef.current = null;
    }
  };

  // ドラッグエンドハンドラー
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    if (!group?.videos) {
      return;
    }

    const oldIndex = group.videos.findIndex((video) => video.id === active.id);
    const newIndex = group.videos.findIndex((video) => video.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // ローカル状態を即座に更新（楽観的更新）
    const newVideos = arrayMove(group.videos, oldIndex, newIndex);
    setGroup({ ...group, videos: newVideos });

    try {
      // サーバーに順序を送信
      const videoIds = newVideos.map(video => video.id);
      await apiClient.reorderVideosInGroup(groupId!, videoIds);
    } catch (err) {
      // エラーが発生した場合は元に戻す
      handleAsyncError(err, '動画の順序更新に失敗しました', () => {});
      await loadGroupData();
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
      handleAsyncError(err, 'グループの削除に失敗しました', () => {});
    } finally {
      setIsDeleting(false);
    }
  };

  const { isLoading: isUpdating, error: updateError, mutate: handleUpdate } = useAsyncState({
    onSuccess: () => {
      setIsEditing(false);
      loadGroupData(); // グループ情報を再読み込み
    },
  });

  // 編集をキャンセル
  const handleCancelEdit = () => {
    setIsEditing(false);
    if (group) {
      setEditedName(group.name);
      setEditedDescription(group.description || '');
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
            <div className="flex-1">
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600 block mb-1">
                      グループ名
                    </label>
                    <Input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="w-full max-w-md"
                      disabled={isUpdating}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600 block mb-1">
                      説明
                    </label>
                    <Textarea
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      className="w-full max-w-md min-h-[100px]"
                      disabled={isUpdating}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleUpdate(async () => {
                        if (!groupId) return;
                        await apiClient.updateVideoGroup(groupId, {
                          name: editedName,
                          description: editedDescription,
                        });
                      })}
                      disabled={isUpdating || !editedName.trim()}
                    >
                      {isUpdating ? (
                        <span className="flex items-center">
                          <InlineSpinner className="mr-2" />
                          保存中...
                        </span>
                      ) : (
                        '保存'
                      )}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={handleCancelEdit}
                      disabled={isUpdating}
                    >
                      キャンセル
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-3xl font-bold text-gray-900">{group.name}</h1>
                  <p className="text-gray-500 mt-1">
                    {group.description || '説明なし'}
                  </p>
                </>
              )}
            </div>
            <div className="flex gap-2">
              {!isEditing && (
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditing(true)}
                >
                  編集
                </Button>
              )}
              {!isEditing && (
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
                    ) : availableVideos && availableVideos.length === 0 ? (
                      <p className="text-center text-gray-500 py-4">追加可能な動画がありません</p>
                    ) : (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {availableVideos?.map((video) => (
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
              )}
              <Link href="/videos/groups">
                <Button variant="outline">一覧に戻る</Button>
              </Link>
              {!isEditing && (
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
              )}
            </div>
          </div>

          {(error || updateError) && <MessageAlert type="error" message={error || updateError || ''} />}

          {/* 共有リンクセクション */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">グループを共有</h3>
            {shareLink ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-600">
                  このグループは共有リンクで公開されています。
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={shareLink}
                    readOnly
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs"
                  />
                  <Button
                    onClick={handleCopyShareLink}
                    variant={isCopied ? "default" : "outline"}
                    size="sm"
                    disabled={isCopied}
                  >
                    {isCopied ? '✓ コピー済み' : 'コピー'}
                  </Button>
                  <Button onClick={handleDeleteShareLink} variant="destructive" size="sm">
                    無効化
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-600">
                  共有リンクを生成すると、ログインなしで閲覧できるようになります。
                </p>
                <Button
                  onClick={handleGenerateShareLink}
                  disabled={isGeneratingLink}
                  size="sm"
                >
                  {isGeneratingLink ? (
                    <span className="flex items-center">
                      <InlineSpinner className="mr-2" />
                      生成中...
                    </span>
                  ) : (
                    '共有リンクを生成'
                  )}
                </Button>
              </div>
            )}
          </div>

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
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={group.videos.map(video => video.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {group.videos.map((video) => (
                        <SortableVideoItem
                          key={video.id}
                          video={video}
                          isSelected={selectedVideo?.id === video.id}
                          onSelect={handleVideoSelect}
                          onRemove={handleRemoveVideo}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
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
                      ref={videoRef}
                      key={selectedVideo.id}
                      controls
                      className="w-full max-h-[500px] rounded"
                      src={selectedVideo.file}
                      onCanPlay={handleVideoCanPlay}
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
            <ChatPanel 
              hasApiKey={!!user?.encrypted_openai_api_key} 
              groupId={groupId ?? undefined}
              onVideoPlay={handleVideoPlayFromTime}
            />
          </div>
        </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

