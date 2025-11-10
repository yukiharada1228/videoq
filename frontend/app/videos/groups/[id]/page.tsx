'use client';

import React from 'react';
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
import { getStatusBadgeClassName, getStatusLabel, timeStringToSeconds } from '@/lib/utils/video';
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

const ORDERING_OPTIONS = [
  'uploaded_at_desc',
  'uploaded_at_asc',
  'title_asc',
  'title_desc',
] as const;

type OrderingOption = (typeof ORDERING_OPTIONS)[number];

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
  const [videoSearch, setVideoSearch] = useState('');
  const [videoSearchInput, setVideoSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [ordering, setOrdering] = useState<OrderingOption>('uploaded_at_desc');
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

  // モバイル用タブ状態
  const [mobileTab, setMobileTab] = useState<'videos' | 'player' | 'chat'>('player');

  const handleOrderingChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as OrderingOption;
    if (ORDERING_OPTIONS.includes(value)) {
      setOrdering(value);
    }
  }, []);
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
      const videos = await apiClient.getVideos({
        q: videoSearch.trim() || undefined,
        status: statusFilter || undefined,
        ordering,
      });
      // すでにチャットグループに追加されている動画を除外
      const currentVideoIds = group.videos?.map(v => v.id) || [];
      // 共通のSet作成関数を使用
      const currentVideoIdSet = createVideoIdSet(currentVideoIds);
      return videos.filter(v => !currentVideoIdSet.has(v.id));
    });
  }, [group?.videos, loadAvailableVideos, videoSearch, statusFilter, ordering]);

  useEffect(() => {
    if (groupId) {
      loadGroupData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // 検索入力のデバウンス
  useEffect(() => {
    const handler = setTimeout(() => setVideoSearch(videoSearchInput), 300);
    return () => clearTimeout(handler);
  }, [videoSearchInput]);

  useEffect(() => {
    if (isAddModalOpen && group) {
      loadAvailableVideosData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAddModalOpen, videoSearch, statusFilter, ordering]);

  const handleAddVideos = async () => {
    if (selectedVideos.length === 0) {
      return;
    }

    try {
      setIsAdding(true);
      
      // 選択された動画を一括追加（N+1問題の解決）
      const result = await apiClient.addVideosToGroup(groupId!, selectedVideos);
      
      // チャットグループを再読み込み
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
    if (!confirm('この動画をチャットグループから削除しますか？')) {
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
      await loadGroupData(); // チャットグループを再読み込みしてshare_tokenを更新
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
      await loadGroupData(); // チャットグループを再読み込み
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

  // チャットグループが読み込まれたら、共有リンクをセット
  useEffect(() => {
    if (group?.share_token) {
      const shareUrl = `${window.location.origin}/share/${group.share_token}`;
      setShareLink(shareUrl);
    } else {
      setShareLink(null);
    }
    setIsCopied(false); // 共有リンクが変わったらコピー状態をリセット
  }, [group?.share_token]);

  // チャットグループデータが読み込まれたら編集用の状態を初期化
  useEffect(() => {
    if (group) {
      setEditedName(group.name);
      setEditedDescription(group.description || '');
    }
  }, [group]);

  const handleVideoSelect = (videoId: number) => {
    // チャットグループ情報から直接動画データを取得（N+1問題の解決）
    // 既にprefetch_relatedで取得済みのデータを使用
    const video = group?.videos?.find(v => v.id === videoId);
    if (video) {
      // 共通の変換関数を使用
      setSelectedVideo(convertVideoInGroupToSelectedVideo(video));
    }
  };

  // グループの動画が読み込まれたら先頭の動画を自動選択
  useEffect(() => {
    const videos = group?.videos;

    if (!videos || videos.length === 0) {
      if (selectedVideo) {
        setSelectedVideo(null);
      }
      return;
    }

    const exists = selectedVideo
      ? videos.some((video) => video.id === selectedVideo.id)
      : false;

    if (!exists) {
      const firstVideo = convertVideoInGroupToSelectedVideo(videos[0]);
      setSelectedVideo(firstVideo);
    }
  }, [group?.videos, selectedVideo]);

  // チャットから動画を選択して指定時間から再生する関数
  const handleVideoPlayFromTime = (videoId: number, startTime: string) => {
    // 共通ユーティリティで時間文字列を秒に変換（DRY対応）
    const seconds = timeStringToSeconds(startTime);

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
    if (!confirm('このチャットグループを削除しますか？')) {
      return;
    }

    try {
      setIsDeleting(true);
      await apiClient.deleteVideoGroup(groupId!);
      router.push('/videos/groups');
    } catch (err) {
      handleAsyncError(err, 'チャットグループの削除に失敗しました', () => {});
    } finally {
      setIsDeleting(false);
    }
  };

  const { isLoading: isUpdating, error: updateError, mutate: handleUpdate } = useAsyncState({
    onSuccess: () => {
      setIsEditing(false);
      loadGroupData(); // チャットグループ情報を再読み込み
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
      <PageLayout fullWidth>
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner fullScreen={false} />
        </div>
      </PageLayout>
    );
  }

  if (error && !group) {
    return (
      <PageLayout fullWidth>
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
      <PageLayout fullWidth>
        <div className="text-center text-gray-500">チャットグループが見つかりません</div>
      </PageLayout>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header />
      <div className="flex-1 w-full px-6 py-6">
        <div className="space-y-4 h-full flex flex-col">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex-1">
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600 block mb-1">
                      チャットグループ名
                    </label>
                    <Input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="w-full"
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
                      className="w-full min-h-[100px]"
                      disabled={isUpdating}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                  <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">{group.name}</h1>
                  <p className="text-sm lg:text-base text-gray-500 mt-1">
                    {group.description || '説明なし'}
                  </p>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!isEditing && (
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  size="sm"
                  className="lg:size-default"
                >
                  編集
                </Button>
              )}
              {!isEditing && (
                <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="lg:size-default">動画を追加</Button>
                  </DialogTrigger>
                <DialogContent className="max-w-[95vw] lg:max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>動画を追加</DialogTitle>
                    <DialogDescription>
                      チャットグループに追加する動画を選択してください
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        placeholder="タイトル/説明を検索"
                        value={videoSearchInput}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVideoSearchInput(e.target.value)}
                        className="w-full md:w-1/2"
                      />
                      <select
                        value={statusFilter}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-2 text-sm bg-white"
                      >
                        <option value="">すべてのステータス</option>
                        <option value="completed">完了</option>
                        <option value="processing">処理中</option>
                        <option value="pending">待機中</option>
                        <option value="error">エラー</option>
                      </select>
                      <select
                        value={ordering}
                        onChange={handleOrderingChange}
                        className="border border-gray-300 rounded px-2 py-2 text-sm bg-white"
                      >
                        <option value="uploaded_at_desc">新しい順</option>
                        <option value="uploaded_at_asc">古い順</option>
                        <option value="title_asc">タイトル昇順</option>
                        <option value="title_desc">タイトル降順</option>
                      </select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedVideos(availableVideos?.map(v => v.id) ?? [])}
                        disabled={!availableVideos?.length}
                      >
                        全選択
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedVideos([])}
                        disabled={selectedVideos.length === 0}
                      >
                        選択解除
                      </Button>
                    </div>

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
                <Button variant="outline" size="sm" className="lg:size-default">一覧に戻る</Button>
              </Link>
              {!isEditing && (
                <Button variant="destructive" onClick={handleDelete} disabled={isDeleting} size="sm" className="lg:size-default">
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
            <h3 className="text-sm font-semibold text-gray-900 mb-2">チャットグループを共有</h3>
            {shareLink ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-600">
                  このチャットグループは共有リンクで公開されています。
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

          {/* モバイル用タブナビゲーション */}
          <div className="lg:hidden flex border-b border-gray-200 bg-white rounded-t-lg">
            <button
              onClick={() => setMobileTab('videos')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'videos'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              動画一覧
            </button>
            <button
              onClick={() => setMobileTab('player')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'player'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              プレイヤー
            </button>
            <button
              onClick={() => setMobileTab('chat')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'chat'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              チャット
            </button>
          </div>

          {/* レスポンシブレイアウト: モバイルはタブ切り替え、PCは3カラム */}
          <div className="flex flex-col lg:grid flex-1 min-h-0 gap-4 lg:gap-6 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
          {/* 左側：動画一覧 */}
          <div className={`flex-col min-h-0 ${mobileTab === 'videos' ? 'flex' : 'hidden lg:flex'}`}>
            <Card className="h-[500px] lg:h-[600px] flex flex-col">
              <CardHeader>
                <CardTitle>動画一覧</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto space-y-2">
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
                            onSelect={(videoId) => {
                              handleVideoSelect(videoId);
                              // モバイルで動画を選択したらプレイヤータブに切り替え
                              if (window.innerWidth < 1024) {
                                setMobileTab('player');
                              }
                            }}
                            onRemove={handleRemoveVideo}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <p className="text-center text-gray-500 py-4 text-sm">動画がありません</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 中央：動画プレイヤー */}
          <div className={`flex-col min-h-0 ${mobileTab === 'player' ? 'flex' : 'hidden lg:flex'}`}>
            <Card className="h-[500px] lg:h-[600px] flex flex-col">
              <CardHeader>
                <CardTitle className="text-base lg:text-lg">
                  {selectedVideo ? selectedVideo.title : '動画を選択してください'}
                </CardTitle>
                {selectedVideo && (
                  <p className="text-xs lg:text-sm text-gray-600 mt-1">{selectedVideo.description || '説明なし'}</p>
                )}
              </CardHeader>
              <CardContent className="flex-1 flex items-center justify-center overflow-hidden">
                {selectedVideo ? (
                  selectedVideo.file ? (
                    <video
                      ref={videoRef}
                      key={selectedVideo.id}
                      controls
                      className="w-full h-full max-h-[400px] lg:max-h-[500px] rounded object-contain"
                      src={selectedVideo.file}
                      onCanPlay={handleVideoCanPlay}
                    >
                      お使いのブラウザは動画タグをサポートしていません。
                    </video>
                  ) : (
                    <p className="text-gray-500 text-sm">動画ファイルがありません</p>
                  )
                ) : (
                  <p className="text-gray-500 text-center text-sm">
                    動画一覧から動画を選択してください
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 右側：チャット */}
          <div className={`flex-col min-h-0 ${mobileTab === 'chat' ? 'flex' : 'hidden lg:flex'}`}>
            <ChatPanel
              hasApiKey={!!user?.encrypted_openai_api_key}
              groupId={groupId ?? undefined}
              onVideoPlay={handleVideoPlayFromTime}
              className="h-[500px] lg:h-[600px]"
            />
          </div>
        </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

