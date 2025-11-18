import {
  validateForm,
  formValidators,
  initializeFormData,
  resetFormData,
  updateFormData,
  getFormDataChanges,
} from '../formUtils'

// Mock i18n
jest.mock('@/i18n/config', () => ({
  initI18n: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options) {
        return `${key} ${JSON.stringify(options)}`
      }
      return key
    },
  }),
}))

describe('formUtils', () => {
  describe('validateForm', () => {
    it('should validate form with valid data', () => {
      const data = { name: 'John', email: 'john@example.com' }
      const rules = {
        name: formValidators.required,
        email: formValidators.email,
      }
      const result = validateForm(data, rules)
      expect(result.isValid).toBe(true)
      expect(Object.keys(result.errors)).toHaveLength(0)
    })

    it('should validate form with invalid data', () => {
      const data = { name: '', email: 'invalid' }
      const rules = {
        name: formValidators.required,
        email: formValidators.email,
      }
      const result = validateForm(data, rules)
      expect(result.isValid).toBe(false)
      expect(result.errors.name).toBeDefined()
      expect(result.errors.email).toBeDefined()
    })
  })

  describe('formValidators', () => {
    describe('required', () => {
      it('should validate required field', () => {
        expect(formValidators.required('value')).toBeNull()
        expect(formValidators.required('')).toBe('validation.required')
        expect(formValidators.required(null)).toBe('validation.required')
        expect(formValidators.required(undefined)).toBe('validation.required')
      })
    })

    describe('email', () => {
      it('should validate email format', () => {
        expect(formValidators.email('test@example.com')).toBeNull()
        expect(formValidators.email('invalid')).toBe('validation.email')
        expect(formValidators.email('')).toBeNull()
      })
    })

    describe('minLength', () => {
      it('should validate minimum length', () => {
        const validator = formValidators.minLength(5)
        expect(validator('hello')).toBeNull()
        expect(validator('hi')).toBe('validation.minLength {"min":5}')
        expect(validator('')).toBeNull()
      })
    })

    describe('maxLength', () => {
      it('should validate maximum length', () => {
        const validator = formValidators.maxLength(5)
        expect(validator('hello')).toBeNull()
        expect(validator('too long')).toBe('validation.maxLength {"max":5}')
        expect(validator('')).toBeNull()
      })
    })

    describe('fileSize', () => {
      it('should validate file size', () => {
        const validator = formValidators.fileSize(1) // 1MB
        const smallFile = new File(['x'], 'test.txt', { type: 'text/plain' })
        Object.defineProperty(smallFile, 'size', { value: 500 * 1024 }) // 500KB

        const largeFile = new File(['x'], 'test.txt', { type: 'text/plain' })
        Object.defineProperty(largeFile, 'size', { value: 2 * 1024 * 1024 }) // 2MB

        expect(validator(smallFile)).toBeNull()
        expect(validator(largeFile)).toBe('validation.fileSize {"max":1}')
        expect(validator(null)).toBeNull()
      })
    })

    describe('fileType', () => {
      it('should validate file type', () => {
        const validator = formValidators.fileType(['image/jpeg', 'image/png'])
        const validFile = new File(['x'], 'test.jpg', { type: 'image/jpeg' })
        const invalidFile = new File(['x'], 'test.txt', { type: 'text/plain' })

        expect(validator(validFile)).toBeNull()
        expect(validator(invalidFile)).toBeDefined()
        expect(validator(null)).toBeNull()
      })
    })
  })

  describe('initializeFormData', () => {
    it('should initialize form data', () => {
      const initial = { name: 'John', email: 'john@example.com' }
      const result = initializeFormData(initial)
      expect(result).toEqual(initial)
      expect(result).not.toBe(initial)
    })
  })

  describe('resetFormData', () => {
    it('should reset form data', () => {
      const initial = { name: 'John', email: 'john@example.com' }
      const result = resetFormData(initial)
      expect(result).toEqual(initial)
      expect(result).not.toBe(initial)
    })
  })

  describe('updateFormData', () => {
    it('should update form data', () => {
      const current = { name: 'John', email: 'john@example.com' }
      const updates = { name: 'Jane' }
      const result = updateFormData(current, updates)
      expect(result.name).toBe('Jane')
      expect(result.email).toBe('john@example.com')
    })
  })

  describe('getFormDataChanges', () => {
    it('should get form data changes', () => {
      const original = { name: 'John', email: 'john@example.com' }
      const current = { name: 'Jane', email: 'john@example.com' }
      const changes = getFormDataChanges(original, current)
      expect(changes).toEqual({ name: 'Jane' })
    })

    it('should return empty object if no changes', () => {
      const original = { name: 'John', email: 'john@example.com' }
      const current = { name: 'John', email: 'john@example.com' }
      const changes = getFormDataChanges(original, current)
      expect(Object.keys(changes)).toHaveLength(0)
    })
  })
})

