'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { PageLayout } from '@/components/layout/PageLayout';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { apiClient } from '@/lib/api';

type VerificationState = 'loading' | 'success' | 'error';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uid = searchParams.get('uid');
  const token = searchParams.get('token');
  const isInvalidLink = !uid || !token;
  const [state, setState] = useState<VerificationState>(() =>
    isInvalidLink ? 'error' : 'loading'
  );
  const [message, setMessage] = useState(() =>
    isInvalidLink ? '無効な認証リンクです。' : 'メール認証を確認しています...'
  );

  useEffect(() => {
    if (isInvalidLink) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const verify = async () => {
      try {
        const response = await apiClient.verifyEmail({ uid: uid!, token: token! });
        setState('success');
        setMessage(response.detail ?? 'メール認証が完了しました。ログインしてください。');
        timer = setTimeout(() => {
          router.replace('/login');
        }, 2000);
      } catch (error: unknown) {
        setState('error');
        if (error instanceof Error) {
          setMessage(error.message);
        } else {
          setMessage('メール認証に失敗しました。リンクの有効期限が切れている可能性があります。');
        }
      }
    };

    void verify();

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [isInvalidLink, uid, token, router]);

  const renderContent = () => {
    if (state === 'loading') {
      return (
        <div className="flex items-center justify-center space-x-3">
          <InlineSpinner />
          <span className="text-sm text-gray-600">{message}</span>
        </div>
      );
    }

    const type = state === 'success' ? 'success' : 'error';

    return (
      <div className="space-y-4">
        <MessageAlert message={message} type={type} />
        {state === 'success' ? (
          <p className="text-center text-sm text-gray-600">
            まもなくログイン画面に移動します。移動しない場合は{' '}
            <Link href="/login" className="text-blue-600 hover:underline">
              こちら
            </Link>
            をクリックしてください。
          </p>
        ) : (
          <div className="space-y-2 text-sm text-gray-600">
            <p>リンクが無効の場合は、再度新規登録を行うかサポートまでお問い合わせください。</p>
            <p>
              ログイン画面に戻る場合は{' '}
              <Link href="/login" className="text-blue-600 hover:underline">
                こちら
              </Link>
              をクリックしてください。
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <PageLayout centered>
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">メール認証</h1>
          <p className="text-sm text-gray-600">
            登録されたメールアドレスを確認し、アカウントの有効化を進めています。
          </p>
        </div>
        {renderContent()}
      </div>
    </PageLayout>
  );
}

function VerifyEmailFallback() {
  return (
    <PageLayout centered>
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">メール認証</h1>
          <div className="flex items-center justify-center space-x-3">
            <InlineSpinner />
            <span className="text-sm text-gray-600">メール認証を確認しています...</span>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailFallback />}>
      <VerifyEmailContent />
    </Suspense>
  );
}

