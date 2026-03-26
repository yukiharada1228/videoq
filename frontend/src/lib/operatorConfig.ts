/**
 * Operator / business information read from build-time env vars.
 * Set via VITE_OPERATOR_* in .env or docker-compose build args.
 */
export const operatorConfig = {
  name: import.meta.env.VITE_OPERATOR_NAME || '',
  representative: import.meta.env.VITE_OPERATOR_REPRESENTATIVE || '',
  email: import.meta.env.VITE_OPERATOR_EMAIL || '',
  address: import.meta.env.VITE_OPERATOR_ADDRESS || '',
  phone: import.meta.env.VITE_OPERATOR_PHONE || '',
} as const;
