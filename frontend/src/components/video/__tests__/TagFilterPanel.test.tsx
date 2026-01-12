import { render, screen, fireEvent } from '@testing-library/react'
import { TagFilterPanel } from '../TagFilterPanel'

// Mock icons
vi.mock('lucide-react', () => ({
    Tag: () => <div data-testid="tag-icon" />,
    X: () => <div data-testid="x-icon" />,
    Settings2: () => <div data-testid="settings-icon" />,
}))

// Mock useTranslation
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: string | { count?: number }) => {
            if (typeof options === 'string') return options
            if (typeof options === 'object' && options.count !== undefined) return `${key} (${options.count})`
            return key
        },
    }),
}))

describe('TagFilterPanel', () => {
    const mockTags = [
        { id: 1, name: 'Tag 1', color: '#ff0000', created_at: '2023-01-01' },
        { id: 2, name: 'Tag 2', color: '#00ff00', created_at: '2023-01-02' },
    ]
    const mockOnToggle = vi.fn()
    const mockOnClear = vi.fn()
    const mockOnManageTags = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should render tags', () => {
        render(
            <TagFilterPanel
                tags={mockTags}
                selectedTagIds={[]}
                onToggle={mockOnToggle}
                onClear={mockOnClear}
            />
        )

        expect(screen.getByText('Tag 1')).toBeInTheDocument()
        expect(screen.getByText('Tag 2')).toBeInTheDocument()
        expect(screen.getByText('Filter by Tags')).toBeInTheDocument()
    })

    it('should handle tag selection', () => {
        render(
            <TagFilterPanel
                tags={mockTags}
                selectedTagIds={[]}
                onToggle={mockOnToggle}
                onClear={mockOnClear}
            />
        )

        fireEvent.click(screen.getByText('Tag 1'))
        expect(mockOnToggle).toHaveBeenCalledWith(1)
    })

    it('should show clear button when tags are selected', () => {
        render(
            <TagFilterPanel
                tags={mockTags}
                selectedTagIds={[1]}
                onToggle={mockOnToggle}
                onClear={mockOnClear}
            />
        )

        const clearButton = screen.getByRole('button', { name: /clear/i })
        expect(clearButton).toBeInTheDocument()

        fireEvent.click(clearButton)
        expect(mockOnClear).toHaveBeenCalled()
    })

    it('should not show clear button when no tags selected', () => {
        render(
            <TagFilterPanel
                tags={mockTags}
                selectedTagIds={[]}
                onToggle={mockOnToggle}
                onClear={mockOnClear}
            />
        )

        expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument()
    })

    it('should render manage tags button when onManageTags is provided', () => {
        render(
            <TagFilterPanel
                tags={mockTags}
                selectedTagIds={[]}
                onToggle={mockOnToggle}
                onClear={mockOnClear}
                onManageTags={mockOnManageTags}
            />
        )

        const manageButton = screen.getByTestId('settings-icon').closest('button')
        expect(manageButton).toBeInTheDocument()

        if (manageButton) {
            fireEvent.click(manageButton)
            expect(mockOnManageTags).toHaveBeenCalled()
        }
    })
})
