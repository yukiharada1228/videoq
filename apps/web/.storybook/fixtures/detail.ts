import type { Video, VideoCourse, VideoInCourse, VideoList } from '@/lib/api';
import { parseSrtTranscript } from '@/lib/transcript/srt';
import { tags } from './tags';

export const transcript = '1\n00:00:00,000 --> 00:00:05,000\n回転行列を紹介します。\n\n2\n00:00:05,000 --> 00:00:12,000\n座標とベクトルの長さを比較しましょう。\n\n3\n00:00:12,000 --> 00:00:20,000\n演習問題で理解を確認します。';
export const segments = parseSrtTranscript(transcript);
export const detailVideo: Video = {
  id: 7, title: '線形代数：回転行列', description: '具体例と演習で座標変換を学びます。',
  uploaded_at: '2026-09-01T09:00:00Z', status: 'completed', source_type: 'uploaded', file: null, transcript, tags,
};
export const courseVideos: VideoInCourse[] = [
  { ...detailVideo, order: 0 },
  { ...detailVideo, id: 8, title: 'ベクトルの長さ', order: 1, status: 'processing' },
  { ...detailVideo, id: 9, title: '座標変換の演習', order: 2, status: 'error' },
];
export const course: VideoCourse = {
  id: 42, name: '線形代数入門', description: '固定データの講座', display_order: 0,
  created_at: '2026-09-01T09:00:00Z', video_count: 1, access_role: 'owner', videos: [courseVideos[0]],
};
export const libraryVideos: VideoList[] = [detailVideo,
  { ...detailVideo, id: 11, title: '回転行列の基礎', tags: [tags[0]] },
  { ...detailVideo, id: 12, title: '座標変換の演習', status: 'processing', tags: [tags[1]] },
  { ...detailVideo, id: 13, title: 'ベクトルの復習', tags: [tags[0], tags[2]] },
];
export const longText = 'RotationMatrixAndCoordinateTransformation'.repeat(10);
export const englishVideo: Video = { ...detailVideo, title: 'Rotation matrices', description: 'Learn coordinate transformations through examples.', transcript: '1\n00:00:00,000 --> 00:00:05,000\nIntroducing rotation matrices.\n\n2\n00:00:05,000 --> 00:00:12,000\nCompare vector lengths.' };
export const shareLink = 'https://videoq.example/shared/linear-algebra';
