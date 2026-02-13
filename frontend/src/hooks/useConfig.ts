import { useEffect, useState } from 'react';
import { apiClient, type AppConfig } from '@/lib/api';

const defaultConfig: AppConfig = {
  billing_enabled: true,
  signup_enabled: true,
};

let cachedConfig: AppConfig | null = null;
let configPromise: Promise<AppConfig> | null = null;

function fetchConfig(): Promise<AppConfig> {
  if (!configPromise) {
    configPromise = apiClient
      .getConfig()
      .then((config) => {
        cachedConfig = config;
        return config;
      })
      .catch(() => defaultConfig);
  }
  return configPromise;
}

export function useConfig() {
  const [config, setConfig] = useState<AppConfig>(cachedConfig ?? defaultConfig);
  const [loading, setLoading] = useState(!cachedConfig);

  useEffect(() => {
    if (cachedConfig) return;
    fetchConfig()
      .then(setConfig)
      .finally(() => setLoading(false));
  }, []);

  return { config, loading };
}
