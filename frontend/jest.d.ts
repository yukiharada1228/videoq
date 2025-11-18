/// <reference types="jest" />
/// <reference types="@testing-library/jest-dom" />

// Extend Jest matchers with jest-dom
declare namespace jest {
  interface Matchers<R> {
    toBeInTheDocument(): R
    toHaveTextContent(text: string | RegExp): R
    toBeDisabled(): R
    toHaveAttribute(attr: string, value?: string): R
    toHaveClass(...classNames: string[]): R
  }
}

