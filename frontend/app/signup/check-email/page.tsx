'use client';

import Link from 'next/link';
import { PageLayout } from '@/components/layout/PageLayout';
import { MessageAlert } from '@/components/common/MessageAlert';

export default function SignupCheckEmailPage() {
  return (
    <PageLayout centered>
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">メールをご確認ください</h1>
          <p className="text-sm text-gray-600">
            ご登録いただいたメールアドレス宛に確認メールを送信しました。受信トレイまたは迷惑メールフォルダーをご確認のうえ、記載のリンクをクリックして登録を完了してください。
          </p>
        </div>
        <MessageAlert
          type="success"
          message="確認リンクの有効期限が切れる前にメールを開いてください。"
        />
        <div className="text-center text-sm text-gray-600">
          メールが届かない場合は、しばらく待ってから再度お試しください。それでも届かない場合はサポートまでご連絡ください。
        </div>
        <div className="text-center text-sm">
          <Link href="/login" className="text-blue-600 hover:underline">
            ログイン画面に戻る
          </Link>
        </div>
      </div>
    </PageLayout>
  );
}

