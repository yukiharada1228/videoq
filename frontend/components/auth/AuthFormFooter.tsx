import Link from 'next/link';

interface AuthFormFooterProps {
  questionText: string;
  linkText: string;
  href: string;
}

export function AuthFormFooter({ questionText, linkText, href }: AuthFormFooterProps) {
  return (
    <div className="text-center text-sm text-gray-600">
      {questionText}{' '}
      <Link href={href} className="text-blue-600 hover:underline">
        {linkText}
      </Link>
    </div>
  );
}

