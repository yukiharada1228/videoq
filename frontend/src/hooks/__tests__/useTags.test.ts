import { renderHook, act, waitFor } from '@testing-library/react'
import { useTags } from '../useTags'
import { apiClient } from '@/lib/api'

// Mock apiClient
vi.mock('@/lib/api', () => ({
    apiClient: {
        getTags: vi.fn(),
        createTag: vi.fn(),
        updateTag: vi.fn(),
        deleteTag: vi.fn(),
    },
}))

describe('useTags', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should initialize with empty tags array', async () => {
        ; (apiClient.getTags as any).mockResolvedValue([])
        const { result } = renderHook(() => useTags())

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        expect(result.current.tags).toEqual([])
        expect(result.current.error).toBeNull()
    })

    it('should load tags on mount', async () => {
        const mockTags = [
            { id: 1, name: 'Tag 1', color: '#ff0000', created_at: '2023-01-01' },
            { id: 2, name: 'Tag 2', color: '#00ff00', created_at: '2023-01-02' },
        ]
            ; (apiClient.getTags as any).mockResolvedValue(mockTags)

        const { result } = renderHook(() => useTags())

        await waitFor(() => {
            expect(result.current.tags).toEqual(mockTags)
            expect(result.current.isLoading).toBe(false)
        })
    })

    it('should create a tag', async () => {
        const mockTag = { id: 3, name: 'New Tag', color: '#0000ff', created_at: '2023-01-03' }
            ; (apiClient.createTag as any).mockResolvedValue(mockTag)
            ; (apiClient.getTags as any).mockResolvedValue([])

        const { result } = renderHook(() => useTags())

        await act(async () => {
            await result.current.createTag('New Tag', '#0000ff')
        })

        expect(apiClient.createTag).toHaveBeenCalledWith({ name: 'New Tag', color: '#0000ff' })
        expect(result.current.tags).toContainEqual(mockTag)
    })

    it('should update a tag', async () => {
        const initialTags = [{ id: 1, name: 'Old Tag', color: '#ff0000', created_at: '2023-01-01' }]
        const updatedTag = { id: 1, name: 'Updated Tag', color: '#ffff00', created_at: '2023-01-01' }
            ; (apiClient.getTags as any).mockResolvedValue(initialTags)
            ; (apiClient.updateTag as any).mockResolvedValue(updatedTag)

        const { result } = renderHook(() => useTags())

        await waitFor(() => {
            expect(result.current.tags).toEqual(initialTags)
        })

        await act(async () => {
            await result.current.updateTag(1, 'Updated Tag', '#ffff00')
        })

        expect(apiClient.updateTag).toHaveBeenCalledWith(1, { name: 'Updated Tag', color: '#ffff00' })
        expect(result.current.tags).toEqual([updatedTag])
    })

    it('should delete a tag', async () => {
        const initialTags = [
            { id: 1, name: 'Tag 1', color: '#ff0000', created_at: '2023-01-01' },
            { id: 2, name: 'Tag 2', color: '#00ff00', created_at: '2023-01-02' },
        ]
            ; (apiClient.getTags as any).mockResolvedValue(initialTags)
            ; (apiClient.deleteTag as any).mockResolvedValue(undefined)

        const { result } = renderHook(() => useTags())

        await waitFor(() => {
            expect(result.current.tags).toEqual(initialTags)
        })

        await act(async () => {
            await result.current.deleteTag(1)
        })

        expect(apiClient.deleteTag).toHaveBeenCalledWith(1)
        expect(result.current.tags).toEqual([initialTags[1]])
    })

    it('should handle loading errors', async () => {
        const error = new Error('Failed to load')
            ; (apiClient.getTags as any).mockRejectedValue(error)

        const { result } = renderHook(() => useTags())

        await waitFor(() => {
            expect(result.current.error).toBe('Failed to load')
        })
    })
})
