import { demoUser } from '../data';

export function useAuth() {
  return { user: demoUser, isLoading: false };
}
