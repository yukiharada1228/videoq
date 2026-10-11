import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { appTrpcClient } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';
import { Label } from '@/components/ui/label';

export function UploadResumeSelector({ value, onChange, disabled }: {
  value?: number; onChange: (id?: number) => void; disabled: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['resumableUploads', user?.id],
    queryFn: () => appTrpcClient.videos.listResumableUploads.query(),
    enabled: Boolean(user) && !disabled,
    staleTime: 0,
  });
  return <div className="flex flex-col gap-2">
    <p className="text-sm text-solid-gray-700">{t('videos.upload.resume.hint')}</p>
    {!!data?.length && <>
      <Label htmlFor="resume-upload">{t('videos.upload.resume.label')}</Label>
      <select id="resume-upload" value={value ?? ''} disabled={disabled}
        className="rounded border border-solid-gray-420 bg-white p-2"
        onChange={event => onChange(event.target.value ? Number(event.target.value) : undefined)}>
        <option value="">{t('videos.upload.resume.newUpload')}</option>
        {data.map(video => <option key={video.id} value={video.id}>{video.title} (#{video.id})</option>)}
      </select>
    </>}
  </div>;
}
