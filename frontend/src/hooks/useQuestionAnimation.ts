import { useState, useRef, useEffect, useCallback } from 'react';

export type QuestionPhase = 'center' | 'shrinking' | 'top' | 'hidden';

interface UseQuestionAnimationReturn {
  questionPhase: QuestionPhase;
  startQuestionAnimation: (question: string) => void;
}

export function useQuestionAnimation(): UseQuestionAnimationReturn {
  const [questionPhase, setQuestionPhase] = useState<QuestionPhase>('hidden');
  const questionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (questionTimerRef.current) {
        clearTimeout(questionTimerRef.current);
      }
    };
  }, []);

  const startQuestionAnimation = useCallback((question: string) => {
    if (questionTimerRef.current) {
      clearTimeout(questionTimerRef.current);
    }

    if (!question) {
      setQuestionPhase('hidden');
      return;
    }

    // Phase 1: Show question centered
    setQuestionPhase('center');

    // Phase 2: After 2.5s, shrink to top
    questionTimerRef.current = setTimeout(() => {
      setQuestionPhase('shrinking');

      // Phase 3: After shrink animation completes (500ms), set to top
      questionTimerRef.current = setTimeout(() => {
        setQuestionPhase('top');
      }, 500);
    }, 2500);
  }, []);

  return { questionPhase, startQuestionAnimation };
}
