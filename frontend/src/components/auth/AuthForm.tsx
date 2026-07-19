import { Button } from '@/components/ui/button';
import { Heading, HeadingTitle } from '@/components/ui/heading';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { FormField } from './FormField';
import { ErrorMessage } from './ErrorMessage';
import { AuthFormFooter } from './AuthFormFooter';

interface FormFieldConfig {
  id: string;
  name: string;
  label: string;
  type: string;
  placeholder: string;
  minLength?: number;
}

interface AuthFormProps {
  title: string;
  description: string;
  fields: FormFieldConfig[];
  formData: Record<string, string>;
  error: string | null;
  isLoading: boolean;
  submitButtonText: string;
  loadingButtonText: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  footer?: {
    questionText: string;
    linkText: string;
    href: string;
  };
}

export function AuthForm({
  title,
  description,
  fields,
  formData,
  error,
  isLoading,
  submitButtonText,
  loadingButtonText,
  onChange,
  onSubmit,
  footer,
}: AuthFormProps) {
  return (
    <div className="w-full max-w-md space-y-6">
      <div className="space-y-2">
        <Heading size="28">
          <HeadingTitle level="h1">{title}</HeadingTitle>
        </Heading>
        <p className="text-std-16N-170 text-solid-gray-700">{description}</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-6">
        <ErrorMessage message={error} />
        <div className="space-y-4">
          {fields.map((field) => (
            <FormField
              key={field.id}
              id={field.id}
              name={field.name}
              label={field.label}
              type={field.type}
              placeholder={field.placeholder}
              value={formData[field.name] || ''}
              onChange={onChange}
              required
              minLength={field.minLength}
            />
          ))}
        </div>
        <div className="flex flex-col space-y-4">
          <Button type="submit" variant="solid" size="lg" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <span className="flex items-center justify-center">
                <InlineSpinner className="mr-2" />
                {loadingButtonText}
              </span>
            ) : (
              submitButtonText
            )}
          </Button>
          {footer && (
            <AuthFormFooter
              questionText={footer.questionText}
              linkText={footer.linkText}
              href={footer.href}
            />
          )}
        </div>
      </form>
    </div>
  );
}
