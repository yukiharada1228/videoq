'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageAlert } from '@/components/common/MessageAlert';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { Button } from '@/components/ui/button';

interface VideoUploadFormFieldsProps {
  title: string;
  description: string;
  isUploading: boolean;
  error: string | null;
  success: boolean;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showCancelButton?: boolean;
  onCancel?: () => void;
  cancelButtonClassName?: string;
}

export function VideoUploadFormFields({
  title,
  description,
  isUploading,
  error,
  success,
  setTitle,
  setDescription,
  handleFileChange,
  showCancelButton = false,
  onCancel,
  cancelButtonClassName,
}: VideoUploadFormFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="file">ファイル</Label>
        <Input
          id="file"
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          disabled={isUploading}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">タイトル *</Label>
        <Input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="動画のタイトルを入力"
          disabled={isUploading}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">説明</Label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="動画の説明（任意）"
          disabled={isUploading}
          className="w-full min-h-[100px] px-3 py-2 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && <MessageAlert type="error" message={error} />}
      {success && <MessageAlert type="success" message="アップロード成功！" />}

      {showCancelButton ? (
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isUploading} className={cancelButtonClassName}>
            キャンセル
          </Button>
          <Button type="submit" disabled={isUploading} className="flex-1">
            {isUploading ? (
              <span className="flex items-center justify-center">
                <InlineSpinner className="mr-2" />
                アップロード中...
              </span>
            ) : (
              'アップロード'
            )}
          </Button>
        </div>
      ) : (
        <Button type="submit" disabled={isUploading} className="w-full">
          {isUploading ? (
            <span className="flex items-center">
              <InlineSpinner className="mr-2" />
              アップロード中...
            </span>
          ) : (
            'アップロード'
          )}
        </Button>
      )}
    </>
  );
}

