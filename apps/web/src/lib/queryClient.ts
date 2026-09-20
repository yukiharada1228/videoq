import { QueryClient } from '@tanstack/react-query';

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export let appQueryClient = createAppQueryClient();

export function replaceAppQueryClient(): QueryClient {
  appQueryClient = createAppQueryClient();
  return appQueryClient;
}
