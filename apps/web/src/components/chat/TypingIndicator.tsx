import { useTranslation } from 'react-i18next';

/**
 * 最初のトークンが届くまでの待ち時間を吹き出し内で示す3点ドット。
 * ドットは装飾なので aria-hidden にし、状態は role="status" の中に置いた
 * 視覚的に隠したテキストで伝える（ライブリージョンは中身を読み上げるため、
 * aria-label では何も読み上げられない）。動きを止めている利用者には
 * ドットが静止するだけなので、そのテキストが唯一の手掛かりになる。
 */
export function TypingIndicator() {
  const { t } = useTranslation();

  return (
    <span role="status" className="flex items-center gap-1 py-1">
      <span className="sr-only">{t('chat.generating')}</span>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          aria-hidden="true"
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-solid-gray-420 motion-reduce:animate-none"
          // 負の遅延で各ドットをアニメーションの途中から始める。正の遅延だと
          // 表示直後に2つ目・3つ目が静止したままになる。
          style={{ animationDelay: `${index * -150}ms` }}
        />
      ))}
    </span>
  );
}
