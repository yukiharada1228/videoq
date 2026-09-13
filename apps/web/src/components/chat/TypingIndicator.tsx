import { useTranslation } from 'react-i18next';

// Tailwind の animate-bounce は要素高さの25%しか動かさないため、6pxのドットでは
// 1.5px程度しか動かず静止して見える。progress-indicator と同じく、必要な距離を
// 絶対値で持つキーフレームを自前で用意する。
const typingIndicatorKeyframes = `
@keyframes videoq-typing-dot {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.45; }
  30% { transform: translateY(-4px); opacity: 1; }
}
`;

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
    <>
      {/* ライブリージョンの外に置く。中に入れると読み上げ内容にCSSが混ざる。 */}
      <style dangerouslySetInnerHTML={{ __html: typingIndicatorKeyframes }} />
      <span role="status" className="flex items-center gap-1 py-1">
        <span className="sr-only">{t('chat.generating')}</span>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-solid-gray-600 [animation:videoq-typing-dot_1.2s_ease-in-out_infinite] motion-reduce:![animation:none]"
            // 負の遅延で各ドットをアニメーションの途中から始める。正の遅延だと
            // 表示直後に2つ目・3つ目が静止したままになる。
            style={{ animationDelay: `${index * -200}ms` }}
          />
        ))}
      </span>
    </>
  );
}
