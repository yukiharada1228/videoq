import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Input, type InputBlockSize } from '@/components/ui/input';
import { RequirementBadge } from '@/components/ui/requirement-badge';
import { SupportText } from '@/components/ui/support-text';
import { ErrorText } from '@/components/ui/error-text';

interface FormFieldProps {
  id: string;
  name: string;
  label: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  minLength?: number;
  error?: string | null;
  supportText?: string;
  isOptional?: boolean;
  showRequirementBadge?: boolean;
  blockSize?: InputBlockSize;
  disabled?: boolean;
  className?: string;
  autoComplete?: string;
}

export function FormField({
  id,
  name,
  label,
  type,
  placeholder,
  value,
  onChange,
  required = false,
  minLength,
  error,
  supportText,
  isOptional = false,
  showRequirementBadge,
  blockSize = 'lg',
  disabled,
  className,
  autoComplete,
}: FormFieldProps) {
  const { t } = useTranslation();
  const shouldShowBadge = showRequirementBadge ?? (required || isOptional);
  const errorId = error ? `${id}-error` : undefined;
  const supportId = supportText ? `${id}-support` : undefined;
  const describedBy = [errorId, supportId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className ? `flex flex-col gap-2 ${className}` : 'flex flex-col gap-2'}>
      <Label htmlFor={id} size="md">
        {label}
        {shouldShowBadge && (
          <RequirementBadge isOptional={isOptional || !required}>
            {isOptional || !required
              ? t('common.labels.optional')
              : t('common.labels.required')}
          </RequirementBadge>
        )}
      </Label>
      <Input
        id={id}
        name={name}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        blockSize={blockSize}
        isError={Boolean(error)}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-describedby={describedBy}
      />
      {supportText && !error && <SupportText id={supportId}>{supportText}</SupportText>}
      {error && <ErrorText id={errorId}>{error}</ErrorText>}
    </div>
  );
}
