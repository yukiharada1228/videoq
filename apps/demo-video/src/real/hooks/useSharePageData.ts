import { demoCourse } from '../data';
import { useLocale } from '../data';

export function useSharedCourseQuery(_shareToken: string) {
  return { data: demoCourse(useLocale()), error: null, isLoading: false };
}
