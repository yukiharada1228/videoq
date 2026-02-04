import { describe, it, expect } from 'vitest'
import {
  convertVideoInGroupToSelectedVideo,
  convertVideoListToSelectedVideo,
  createVideoIdSet,
  extractVideoIds,
} from '../videoConversion'
import type { VideoInGroup, VideoList } from '@/lib/api'

describe('convertVideoInGroupToSelectedVideo', () => {
  it('should convert VideoInGroup to SelectedVideo', () => {
    const videoInGroup: VideoInGroup = {
      id: 1,
      title: 'Test Video',
      description: 'Test Description',
      file: 'video.mp4',
      status: 'completed',
      order: 0,
    }

    const result = convertVideoInGroupToSelectedVideo(videoInGroup)

    expect(result).toEqual({
      id: 1,
      title: 'Test Video',
      description: 'Test Description',
      file: 'video.mp4',
      status: 'completed',
    })
  })

  it('should handle null file', () => {
    const videoInGroup: VideoInGroup = {
      id: 2,
      title: 'No File Video',
      description: '',
      file: null,
      status: 'pending',
      order: 1,
    }

    const result = convertVideoInGroupToSelectedVideo(videoInGroup)

    expect(result.file).toBeNull()
  })

  it('should handle empty description', () => {
    const videoInGroup: VideoInGroup = {
      id: 3,
      title: 'Video',
      description: '',
      file: 'video.mp4',
      status: 'processing',
      order: 2,
    }

    const result = convertVideoInGroupToSelectedVideo(videoInGroup)

    expect(result.description).toBe('')
  })
})

describe('convertVideoListToSelectedVideo', () => {
  it('should convert VideoList to SelectedVideo', () => {
    const videoList: VideoList = {
      id: 1,
      title: 'List Video',
      description: 'List Description',
      file: 'list-video.mp4',
      status: 'completed',
      uploaded_at: '2024-01-01T00:00:00Z',
    }

    const result = convertVideoListToSelectedVideo(videoList)

    expect(result).toEqual({
      id: 1,
      title: 'List Video',
      description: 'List Description',
      file: 'list-video.mp4',
      status: 'completed',
    })
  })

  it('should not include uploaded_at in result', () => {
    const videoList: VideoList = {
      id: 2,
      title: 'Video',
      description: 'Desc',
      file: 'video.mp4',
      status: 'completed',
      uploaded_at: '2024-01-01T00:00:00Z',
    }

    const result = convertVideoListToSelectedVideo(videoList)

    expect(result).not.toHaveProperty('uploaded_at')
  })
})

describe('createVideoIdSet', () => {
  it('should create Set from array of video IDs', () => {
    const ids = [1, 2, 3, 4, 5]

    const result = createVideoIdSet(ids)

    expect(result).toBeInstanceOf(Set)
    expect(result.size).toBe(5)
    expect(result.has(1)).toBe(true)
    expect(result.has(3)).toBe(true)
    expect(result.has(5)).toBe(true)
  })

  it('should create empty Set from empty array', () => {
    const ids: number[] = []

    const result = createVideoIdSet(ids)

    expect(result.size).toBe(0)
  })

  it('should deduplicate IDs', () => {
    const ids = [1, 2, 2, 3, 3, 3]

    const result = createVideoIdSet(ids)

    expect(result.size).toBe(3)
  })

  it('should allow checking membership efficiently', () => {
    const ids = [10, 20, 30]
    const idSet = createVideoIdSet(ids)

    expect(idSet.has(10)).toBe(true)
    expect(idSet.has(20)).toBe(true)
    expect(idSet.has(40)).toBe(false)
  })
})

describe('extractVideoIds', () => {
  it('should extract IDs from VideoInGroup array', () => {
    const videos: VideoInGroup[] = [
      { id: 1, title: 'V1', description: '', file: null, status: 'completed', order: 0 },
      { id: 2, title: 'V2', description: '', file: null, status: 'completed', order: 1 },
      { id: 3, title: 'V3', description: '', file: null, status: 'completed', order: 2 },
    ]

    const result = extractVideoIds(videos)

    expect(result).toEqual([1, 2, 3])
  })

  it('should extract IDs from VideoList array', () => {
    const videos: VideoList[] = [
      { id: 10, title: 'V1', description: '', file: null, status: 'completed', uploaded_at: '' },
      { id: 20, title: 'V2', description: '', file: null, status: 'completed', uploaded_at: '' },
    ]

    const result = extractVideoIds(videos)

    expect(result).toEqual([10, 20])
  })

  it('should return empty array for empty input', () => {
    const videos: VideoInGroup[] = []

    const result = extractVideoIds(videos)

    expect(result).toEqual([])
  })

  it('should preserve order of IDs', () => {
    const videos: VideoInGroup[] = [
      { id: 5, title: 'V5', description: '', file: null, status: 'completed', order: 0 },
      { id: 1, title: 'V1', description: '', file: null, status: 'completed', order: 1 },
      { id: 3, title: 'V3', description: '', file: null, status: 'completed', order: 2 },
    ]

    const result = extractVideoIds(videos)

    expect(result).toEqual([5, 1, 3])
  })
})
