import { useFilm } from '../film';

export function useChatHistory(_options: { courseId?: number; shareToken?: string; enabled?: boolean }) {
  const { history } = useFilm();
  return { history, historyLoading: false, historyError: null, exportHistoryCsv: () => {}, isExportingHistoryCsv: false };
}
