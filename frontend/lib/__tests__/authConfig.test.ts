import { AUTH_FIELDS, FormFieldConfig } from '../authConfig'

describe('authConfig', () => {
  describe('AUTH_FIELDS', () => {
    it('should have EMAIL field with correct configuration', () => {
      expect(AUTH_FIELDS.EMAIL).toEqual({
        id: 'email',
        name: 'email',
        type: 'email',
        labelKey: 'auth.fields.email.label',
        placeholderKey: 'auth.fields.email.placeholder',
      })
    })

    it('should have USERNAME field with correct configuration', () => {
      expect(AUTH_FIELDS.USERNAME).toEqual({
        id: 'username',
        name: 'username',
        type: 'text',
        labelKey: 'auth.fields.username.label',
        placeholderKey: 'auth.fields.username.placeholder',
      })
    })

    it('should have PASSWORD field with correct configuration', () => {
      expect(AUTH_FIELDS.PASSWORD).toEqual({
        id: 'password',
        name: 'password',
        type: 'password',
        labelKey: 'auth.fields.password.label',
        placeholderKey: 'auth.fields.password.placeholder',
      })
    })

    it('should have PASSWORD_WITH_MIN_LENGTH field with minLength', () => {
      expect(AUTH_FIELDS.PASSWORD_WITH_MIN_LENGTH).toEqual({
        id: 'password',
        name: 'password',
        type: 'password',
        labelKey: 'auth.fields.password.label',
        placeholderKey: 'auth.fields.password.placeholder',
        minLength: 8,
      })
    })

    it('should have CONFIRM_PASSWORD field with minLength', () => {
      expect(AUTH_FIELDS.CONFIRM_PASSWORD).toEqual({
        id: 'confirmPassword',
        name: 'confirmPassword',
        type: 'password',
        labelKey: 'auth.fields.passwordConfirmation.label',
        placeholderKey: 'auth.fields.passwordConfirmation.placeholder',
        minLength: 8,
      })
    })

    it('should have all fields as FormFieldConfig type', () => {
      const fields: FormFieldConfig[] = [
        AUTH_FIELDS.EMAIL,
        AUTH_FIELDS.USERNAME,
        AUTH_FIELDS.PASSWORD,
        AUTH_FIELDS.PASSWORD_WITH_MIN_LENGTH,
        AUTH_FIELDS.CONFIRM_PASSWORD,
      ]

      fields.forEach(field => {
        expect(field).toHaveProperty('id')
        expect(field).toHaveProperty('name')
        expect(field).toHaveProperty('type')
        expect(field).toHaveProperty('labelKey')
        expect(field).toHaveProperty('placeholderKey')
      })
    })
  })
})

