'use client';

import { useState, useEffect } from 'react';
import { apiClient, type LLMSettings as LLMSettingsType } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageAlert } from '@/components/common/MessageAlert';
import { useTranslation } from 'react-i18next';

interface LLMSettingsProps {
  initialSettings: LLMSettingsType;
  onSettingsChange: () => void;
}

export function LLMSettings({ initialSettings, onSettingsChange }: LLMSettingsProps) {
  const { t } = useTranslation();
  const [model, setModel] = useState(initialSettings.preferred_llm_model);
  const [temperature, setTemperature] = useState(initialSettings.preferred_llm_temperature);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch available models on mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await apiClient.getAvailableModels();
        setAvailableModels(response.models);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('settings.llm.errorLoadingModels'));
      } finally {
        setModelsLoading(false);
      }
    };
    void fetchModels();
  }, [t]);

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await apiClient.updateLLMSettings({
        preferred_llm_model: model,
        preferred_llm_temperature: temperature,
      });
      setSuccess(t('settings.llm.successSaved'));
      onSettingsChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.llm.errorSaving'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.llm.title')}</CardTitle>
        <CardDescription>{t('settings.llm.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <MessageAlert type="error" message={error} />}
        {success && <MessageAlert type="success" message={success} />}

        {/* Model Selection */}
        <div className="space-y-2">
          <Label htmlFor="model">{t('settings.llm.modelLabel')}</Label>
          <select
            id="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={loading || modelsLoading}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {availableModels.length > 0 ? (
              availableModels.map((modelId) => (
                <option key={modelId} value={modelId}>
                  {modelId}
                </option>
              ))
            ) : (
              <option value={model}>{model}</option>
            )}
          </select>
          <p className="text-sm text-muted-foreground">
            {t('settings.llm.modelDescription')}
          </p>
        </div>

        {/* Temperature Slider */}
        <div className="space-y-2">
          <Label htmlFor="temperature">
            {t('settings.llm.temperatureLabel')}: {temperature.toFixed(1)}
          </Label>
          <input
            id="temperature"
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            disabled={loading}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
          />
          <p className="text-sm text-muted-foreground">
            {t('settings.llm.temperatureDescription')}
          </p>
        </div>

        <Button onClick={handleSave} disabled={loading || modelsLoading}>
          {loading ? t('settings.llm.saving') : t('settings.llm.save')}
        </Button>
      </CardContent>
    </Card>
  );
}
