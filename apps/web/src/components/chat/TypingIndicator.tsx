import { useTranslation } from 'react-i18next';

/**
 * 最初のトークンが届くまでの待ち時間を吹き出し内で示す3点ドット。
 * 動きを止めている利用者にはドットが静止するだけなので、状態は
 * role="status" のラベルで伝える。
 */
export function TypingIndicator() {
  const { t } = useTranslation();

  return (
    <span
      role="status"
      aria-label={t('chat.generating')}
      className="flex items-center gap-1 py-1"
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          aria-hidden="true"
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-solid-gray-420 motion-reduce:animate-none"
          style={{ animationDelay: `${index * 150}ms` }}
        />
      ))}
    </span>
  );
}
