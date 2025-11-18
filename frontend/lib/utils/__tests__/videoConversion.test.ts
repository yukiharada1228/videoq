import {
  convertVideoInGroupToSelectedVideo,
  convertVideoListToSelectedVideo,
  createVideoIdSet,
  extractVideoIds,
} from '../videoConversion'

describe('videoConversion', () => {
  describe('convertVideoInGroupToSelectedVideo', () => {
    it('should convert VideoInGroup to SelectedVideo', () => {
      const video = {
        id: 1,
        title: 'Test Video',
        description: 'Description',
        file: 'file.mp4',
        uploaded_at: '2024-01-15',
        status: 'completed' as const,
        order: 1,
      }

      const result = convertVideoInGroupToSelectedVideo(video)

      expect(result).toEqual({
        id: 1,
        title: 'Test Video',
        description: 'Description',
        file: 'file.mp4',
        status: 'completed',
      })
    })
  })

  describe('convertVideoListToSelectedVideo', () => {
    it('should convert VideoList to SelectedVideo', () => {
      const video = {
        id: 1,
        title: 'Test Video',
        description: 'Description',
        file: 'file.mp4',
        uploaded_at: '2024-01-15',
        status: 'completed' as const,
      }

      const result = convertVideoListToSelectedVideo(video)

      expect(result).toEqual({
        id: 1,
        title: 'Test Video',
        description: 'Description',
        file: 'file.mp4',
        status: 'completed',
      })
    })
  })

  describe('createVideoIdSet', () => {
    it('should create Set from video IDs', () => {
      const set = createVideoIdSet([1, 2, 3])
      expect(set).toBeInstanceOf(Set)
      expect(set.has(1)).toBe(true)
      expect(set.has(2)).toBe(true)
      expect(set.has(3)).toBe(true)
    })
  })

  describe('extractVideoIds', () => {
    it('should extract IDs from VideoInGroup array', () => {
      const videos = [
        { id: 1, title: 'Video 1', description: '', file: '', uploaded_at: '', status: 'completed' as const, order: 1 },
        { id: 2, title: 'Video 2', description: '', file: '', uploaded_at: '', status: 'completed' as const, order: 2 },
      ]

      const ids = extractVideoIds(videos)
      expect(ids).toEqual([1, 2])
    })

    it('should extract IDs from VideoList array', () => {
      const videos = [
        { id: 1, title: 'Video 1', description: '', file: '', uploaded_at: '', status: 'completed' as const },
        { id: 2, title: 'Video 2', description: '', file: '', uploaded_at: '', status: 'completed' as const },
      ]

      const ids = extractVideoIds(videos)
      expect(ids).toEqual([1, 2])
    })
  })
})

