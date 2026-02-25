import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient, type Tag, type Video } from '@/lib/api';

interface UseVideoEditingOptions {
  video: Video | null;
  videoId: number | null;
  createTag: (name: string) => Promise<unknown>;
}

interface UseVideoEditingReturn {
  isEditing: boolean;
  editedTitle: string;
  editedDescription: string;
  editedTagIds: number[];
  setEditedTitle: (title: string) => void;
  setEditedDescription: (description: string) => void;
  setEditedTagIds: React.Dispatch<React.SetStateAction<number[]>>;
  startEditing: () => void;
  cancelEditing: () => void;
  handleUpdateVideo: () => Promise<void>;
  handleCreateTag: () => Promise<void>;
}

export function useVideoEditing({ video, videoId, createTag }: UseVideoEditingOptions): UseVideoEditingReturn {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedTagIds, setEditedTagIds] = useState<number[]>([]);

  const startEditing = useCallback(() => {
    if (video) {
      setEditedTitle(video.title);
      setEditedDescription(video.description || '');
      setEditedTagIds(video.tags?.map(tag => tag.id) || []);
      setIsEditing(true);
    }
  }, [video]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    if (video) {
      setEditedTitle(video.title);
      setEditedDescription(video.description || '');
    }
  }, [video]);

  const handleUpdateVideo = useCallback(async () => {
    if (!videoId || !video) return;

    await apiClient.updateVideo(videoId, {
      title: editedTitle,
      description: editedDescription,
    });

    const currentTagIds = video.tags?.map(tag => tag.id) || [];
    const tagsToAdd = editedTagIds.filter((id: number) => !currentTagIds.includes(id));
    const tagsToRemove = currentTagIds.filter((id: number) => !editedTagIds.includes(id));

    if (tagsToAdd.length > 0) {
      await apiClient.addTagsToVideo(videoId, tagsToAdd);
    }

    if (tagsToRemove.length > 0) {
      await Promise.all(tagsToRemove.map((tagId: number) =>
        apiClient.removeTagFromVideo(videoId, tagId)
      ));
    }
  }, [videoId, video, editedTitle, editedDescription, editedTagIds]);

  const handleCreateTag = useCallback(async () => {
    const tagName = prompt(t('tags.create.prompt', 'Enter new tag name:'));
    if (tagName && tagName.trim()) {
      try {
        const newTag = (await createTag(tagName.trim())) as Tag;
        if (newTag) {
          setEditedTagIds(prev => [...prev, newTag.id]);
        }
      } catch (error) {
        console.error('Failed to create tag:', error);
        alert(t('tags.create.error', 'Failed to create tag'));
      }
    }
  }, [createTag, t]);

  return {
    isEditing,
    editedTitle,
    editedDescription,
    editedTagIds,
    setEditedTitle,
    setEditedDescription,
    setEditedTagIds,
    startEditing,
    cancelEditing,
    handleUpdateVideo,
    handleCreateTag,
  };
}
