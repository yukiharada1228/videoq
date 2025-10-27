import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  error: string;
  loading: boolean;
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
  loading,
  submitButtonText,
  loadingButtonText,
  onChange,
  onSubmit,
  footer,
}: AuthFormProps) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <ErrorMessage message={error} />
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
        </CardContent>
        <CardFooter className="flex flex-col space-y-4 pt-6">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? loadingButtonText : submitButtonText}
          </Button>
          {footer && (
            <AuthFormFooter
              questionText={footer.questionText}
              linkText={footer.linkText}
              href={footer.href}
            />
          )}
        </CardFooter>
      </form>
    </Card>
  );
}

