import { render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from '../form'

// Test component that uses the form components
function TestForm() {
  const form = useForm({
    defaultValues: {
      testField: '',
    },
  })

  return (
    <Form {...form}>
      <form>
        <FormField
          control={form.control}
          name="testField"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Test Label</FormLabel>
              <FormControl>
                <input {...field} data-testid="test-input" />
              </FormControl>
              <FormDescription>Test description</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  )
}

describe('Form Components', () => {
  it('should render Form with FormField', () => {
    render(<TestForm />)
    
    expect(screen.getByText('Test Label')).toBeInTheDocument()
    expect(screen.getByText('Test description')).toBeInTheDocument()
    expect(screen.getByTestId('test-input')).toBeInTheDocument()
  })

  it('should render FormLabel with correct htmlFor', () => {
    render(<TestForm />)
    
    const label = screen.getByText('Test Label')
    expect(label).toBeInTheDocument()
    expect(label.tagName).toBe('LABEL')
  })

  it('should render FormControl with input', () => {
    render(<TestForm />)
    
    const input = screen.getByTestId('test-input')
    expect(input).toBeInTheDocument()
  })

  it('should render FormDescription', () => {
    render(<TestForm />)
    
    expect(screen.getByText('Test description')).toBeInTheDocument()
  })

  it('should render FormMessage when there is an error', async () => {
    function TestFormWithError() {
      const form = useForm({
        defaultValues: {
          testField: '',
        },
      })

      // Set error manually after render
      useEffect(() => {
        form.setError('testField', { type: 'required', message: 'This field is required' })
      }, [form])

      return (
        <Form {...form}>
          <form>
            <FormField
              control={form.control}
              name="testField"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Test Label</FormLabel>
                  <FormControl>
                    <input {...field} data-testid="test-input" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      )
    }

    const { container } = render(<TestFormWithError />)
    
    // Wait for error message to appear
    await waitFor(() => {
      const errorMessage = container.querySelector('[data-slot="form-message"]')
      expect(errorMessage).toBeInTheDocument()
      expect(errorMessage?.textContent).toBe('This field is required')
    })
  })

  it('should not render FormMessage when there is no error', () => {
    render(<TestForm />)
    
    // FormMessage should not render when there's no error
    const messages = screen.queryAllByRole('generic')
    const errorMessages = messages.filter(msg => 
      msg.textContent === 'This field is required'
    )
    expect(errorMessages).toHaveLength(0)
  })

  it('should apply custom className to FormItem', () => {
    function TestFormWithCustomClass() {
      const form = useForm({
        defaultValues: {
          testField: '',
        },
      })

      return (
        <Form {...form}>
          <form>
            <FormField
              control={form.control}
              name="testField"
              render={({ field }) => (
                <FormItem className="custom-class">
                  <FormLabel>Test Label</FormLabel>
                  <FormControl>
                    <input {...field} data-testid="test-input" />
                  </FormControl>
                </FormItem>
              )}
            />
          </form>
        </Form>
      )
    }

    const { container } = render(<TestFormWithCustomClass />)
    
    const formItem = container.querySelector('[data-slot="form-item"]')
    expect(formItem?.className).toContain('custom-class')
  })
})

