import type { Tag } from '@/lib/api';
import { TAG_CHIP_COLORS } from '@/lib/tagColors';

export const tags: Tag[] = [
  { id: 1, name: '線形代数', color: 'blue', created_at: '2026-09-01T00:00:00Z', video_count: 12 },
  { id: 2, name: '基礎', color: 'green', created_at: '2026-09-01T00:00:00Z', video_count: 4 },
  { id: 3, name: '復習', color: 'orange', created_at: '2026-09-01T00:00:00Z', video_count: 0 },
];

export const englishTags: Tag[] = tags.map((tag, index) => ({
  ...tag,
  name: ['Linear algebra', 'Fundamentals', 'Review'][index],
}));

export const paletteTags: Tag[] = TAG_CHIP_COLORS.map((color, index) => ({
  id: index + 10,
  name: color,
  color,
  created_at: '2026-09-01T00:00:00Z',
  video_count: index,
}));

export const longTag: Tag = {
  id: 50,
  name: '回転行列と座標変換を具体的な計算例で学ぶための復習用教材',
  color: 'purple',
  created_at: '2026-09-01T00:00:00Z',
  video_count: 1234,
};

export const manyTags: Tag[] = Array.from({ length: 40 }, (_, index) => ({
  id: index + 100,
  name: `第${index + 1}回の講義と演習`,
  color: TAG_CHIP_COLORS[index % TAG_CHIP_COLORS.length],
  created_at: '2026-09-01T00:00:00Z',
  video_count: index % 5,
}));
