import { render, screen, fireEvent } from '@testing-library/react'
import { TagManagementModal } from '../TagManagementModal'
import { useTags } from '@/hooks/useTags'

// Mock useTags
vi.mock('@/hooks/useTags', () => ({
    useTags: vi.fn(),
}))

// Mock useTranslation
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, defaultValue?: string) => defaultValue || key,
    }),
}))

// Mock Dialog components (since they might need Radix context which can be complex to test, or just rely on them working)
// Actually Radix primitives usually work in tests if we use standard queries. 
// But if issues arise, we can generic mock. For now, try without mocking Dialog.
// Wait, Dialog from shadcn/ui uses Radix, which usually requires a Portal. 
// If it fails, checking `render` output will tell.
// Safe bet: Mock the dialog if not testing accessibility specifically. 
// But let's try to test real interaction first as it gives better confidence.
// However, Radix Dialog renders into a portal, so `screen.getBy...` should find it.
// Issue: JS-DOM might not support Pointer events fully for Radix.
// Let's rely on `render` and `screen` and see.

describe('TagManagementModal', () => {
    const mockDeleteTag = vi.fn()
    const mockTags = [
        { id: 1, name: 'Tag 1', color: '#ff0000', created_at: '2023-01-01' },
        { id: 2, name: 'Tag 2', color: '#00ff00', created_at: '2023-01-02' },
    ]

    beforeEach(() => {
        vi.clearAllMocks()
            ; (useTags as any).mockReturnValue({
                tags: mockTags,
                deleteTag: mockDeleteTag,
            })
    })

    it('should render nothing when not open', () => {
        render(<TagManagementModal isOpen={false} onClose={vi.fn()} />)
        expect(screen.queryByText('Tag Management')).not.toBeInTheDocument()
    })

    it('should render tags list when open', () => {
        render(<TagManagementModal isOpen={true} onClose={vi.fn()} />)

        expect(screen.getByText('Tag Management')).toBeInTheDocument()
        expect(screen.getByText('Tag 1')).toBeInTheDocument()
        expect(screen.getByText('Tag 2')).toBeInTheDocument()
    })

    it('should show no tags message when tags list is empty', () => {
        ; (useTags as any).mockReturnValue({
            tags: [],
            deleteTag: mockDeleteTag,
        })

        render(<TagManagementModal isOpen={true} onClose={vi.fn()} />)

        expect(screen.getByText('No tags available')).toBeInTheDocument()
    })

    it('should show delete confirmation when trash icon is clicked', () => {
        render(<TagManagementModal isOpen={true} onClose={vi.fn()} />)

        const deleteButton = screen.getByTestId('delete-tag-1')
        fireEvent.click(deleteButton)

        expect(screen.getByText('Confirm?')).toBeInTheDocument()
        expect(screen.getByTestId('confirm-delete-1')).toBeInTheDocument()
        expect(screen.getByTestId('cancel-delete-1')).toBeInTheDocument()
    })

    it('should delete tag when confirmed', async () => {
        render(<TagManagementModal isOpen={true} onClose={vi.fn()} />)

        fireEvent.click(screen.getByTestId('delete-tag-1'))
        fireEvent.click(screen.getByTestId('confirm-delete-1'))

        expect(mockDeleteTag).toHaveBeenCalledWith(1)
    })

    it('should cancel delete when cancel is clicked', () => {
        render(<TagManagementModal isOpen={true} onClose={vi.fn()} />)

        fireEvent.click(screen.getByTestId('delete-tag-1'))
        fireEvent.click(screen.getByTestId('cancel-delete-1'))

        expect(screen.queryByText('Confirm?')).not.toBeInTheDocument()
        expect(mockDeleteTag).not.toHaveBeenCalled()
    })
})
