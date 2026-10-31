import { render, screen } from '@testing-library/react'
import {
  StepNavigation,
  StepNavigationDescription,
  StepNavigationList,
  StepNavigationNumber,
  StepNavigationStateIndicator,
  StepNavigationStep,
  StepNavigationStepHeader,
  StepNavigationTitle,
} from '../step-navigation'

type State = 'reached' | 'completed' | 'editing' | 'error' | 'skipped'

function Steps({ states, size }: { states: (State | undefined)[]; size?: 'normal' | 'small' }) {
  return (
    <StepNavigation orientation="horizontal" size={size} data-testid="root">
      <StepNavigationList>
        {states.map((state, index) => (
          <StepNavigationStep
            key={index}
            state={state}
            first={index === 0}
            last={index === states.length - 1}
            aria-current={index === 0 ? 'step' : undefined}
          >
            <StepNavigationStepHeader>
              <StepNavigationNumber>
                {index + 1}
                <StepNavigationStateIndicator state={state} />
              </StepNavigationNumber>
              <StepNavigationTitle>Step {index + 1}</StepNavigationTitle>
            </StepNavigationStepHeader>
            <StepNavigationDescription>Description {index + 1}</StepNavigationDescription>
          </StepNavigationStep>
        ))}
      </StepNavigationList>
    </StepNavigation>
  )
}

describe('StepNavigation', () => {
  it('exposes orientation, size, state, and the current step', () => {
    render(<Steps states={['completed', undefined]} size="small" />)

    const root = screen.getByTestId('root')
    expect(root).toHaveAttribute('data-orientation', 'horizontal')
    expect(root).toHaveAttribute('data-size', 'small')
    expect(root.style.getPropertyValue('--step-number-size')).toBe('calc(32/16*1rem)')

    const [first, second] = screen.getAllByRole('listitem')
    expect(first).toHaveAttribute('data-state', 'completed')
    expect(first).toHaveAttribute('data-current', '')
    expect(second).not.toHaveAttribute('data-current')
  })

  it('announces each state with the upstream defaults', () => {
    render(<Steps states={['completed', 'editing', 'error', 'skipped', 'reached']} />)

    expect(screen.getAllByText('ステップ')).toHaveLength(5)
    expect(screen.getByText('完了')).toHaveClass('sr-only')
    expect(screen.getByText('編集中')).toBeInTheDocument()
    expect(screen.getByText('エラー')).toBeInTheDocument()
    expect(screen.getByText('スキップされました')).toHaveClass('sr-only')
  })

  it('accepts localized screen-reader labels', () => {
    render(
      <StepNavigation>
        <StepNavigationList>
          <StepNavigationStep state="completed" first last>
            <StepNavigationStepHeader srLabel="Step">
              <StepNavigationNumber>
                1
                <StepNavigationStateIndicator state="completed" completedLabel="Completed" />
              </StepNavigationNumber>
            </StepNavigationStepHeader>
          </StepNavigationStep>
        </StepNavigationList>
      </StepNavigation>,
    )

    expect(screen.getByText('Step')).toHaveClass('sr-only')
    expect(screen.getByText('Completed')).toHaveClass('sr-only')
  })

  it('makes an enabled header interactive and leaves a disabled one plain', () => {
    render(
      <StepNavigation>
        <StepNavigationList>
          <StepNavigationStep first>
            <StepNavigationStepHeader asChild>
              <a href="#one">One</a>
            </StepNavigationStepHeader>
          </StepNavigationStep>
          <StepNavigationStep last>
            <StepNavigationStepHeader asChild>
              <button type="button" disabled>Two</button>
            </StepNavigationStepHeader>
          </StepNavigationStep>
        </StepNavigationList>
      </StepNavigation>,
    )

    const link = screen.getByRole('link', { name: /^ステップ\s*One$/ })
    expect(link).toHaveAttribute('data-interactive', '')
    expect(screen.getByRole('button', { name: /^ステップ\s*Two$/ })).not.toHaveAttribute('data-interactive')
  })
})
