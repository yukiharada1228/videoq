import type { ChatAnalytics, EvaluationSummary } from '../../src/lib/api';

export const evaluationSummary: EvaluationSummary = {
  course_id: 1,
  evaluated_count: 24,
  avg_faithfulness: 0.94,
  avg_answer_relevancy: 0.875,
  avg_context_precision: 0.72,
};

export const emptyEvaluation: EvaluationSummary = {
  ...evaluationSummary,
  evaluated_count: 0,
  avg_faithfulness: null,
  avg_answer_relevancy: null,
  avg_context_precision: null,
};

export const timeSeries: ChatAnalytics['time_series'] = [
  { date: '2026-09-01', count: 4 },
  { date: '2026-09-02', count: 7 },
  { date: '2026-09-03', count: 0 },
  { date: '2026-09-04', count: 12 },
  { date: '2026-09-05', count: 3 },
  { date: '2026-09-06', count: 8 },
  { date: '2026-09-07', count: 6 },
];

export const manyDays: ChatAnalytics['time_series'] = Array.from({ length: 90 }, (_, index) => ({
  date: new Date(Date.UTC(2026, 5, 1 + index)).toISOString().slice(0, 10),
  count: (index * 7) % 23,
}));

export const feedback: ChatAnalytics['feedback'] = { good: 24, bad: 6, none: 10 };

export const analytics: ChatAnalytics = {
  summary: {
    total_questions: 40,
    date_range: { first: '2026-09-01T03:00:00.000Z', last: '2026-09-07T09:00:00.000Z' },
  },
  time_series: timeSeries,
  feedback,
};

export const emptyAnalytics: ChatAnalytics = {
  summary: { total_questions: 0, date_range: { first: null, last: null } },
  time_series: [],
  feedback: { good: 0, bad: 0, none: 0 },
};
