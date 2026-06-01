import type { KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InlineSpinner } from '@/components/common/InlineSpinner';

interface ChatComposerProps {
  input: string;
  isLoading: boolean;
  onInputChange: (input: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSend: () => Promise<void>;
}

export function ChatComposer({
  input,
  isLoading,
  onInputChange,
  onKeyDown,
  onSend,
}: ChatComposerProps) {
  const { t } = useTranslation();

  return (
    <div className="p-4 bg-[#f2f4ef] border-t border-stone-100 shrink-0">
      <div className="relative">
        <input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isLoading}
          placeholder={t('chat.placeholder')}
          className="w-full bg-white rounded-2xl py-3 pl-4 pr-12 text-sm outline-none focus:ring-2 focus:ring-[#00652c]/30 shadow-inner"
        />
        <button
          onClick={() => void onSend()}
          disabled={isLoading || !input.trim()}
          className="absolute right-2 top-1.5 w-9 h-9 bg-[#00652c] text-white rounded-full flex items-center justify-center hover:bg-[#005323] transition-colors active:scale-95 disabled:opacity-40"
        >
          {isLoading ? <InlineSpinner className="w-4 h-4" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
