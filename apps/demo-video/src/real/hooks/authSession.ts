import { demoUser } from '../data';

export function useAuthSession() {
  return { data: { user: demoUser }, isPending: false, error: null };
}
