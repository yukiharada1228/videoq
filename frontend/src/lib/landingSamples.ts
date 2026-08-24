export const LANDING_DEMO_VIDEO_ID = 1;
export const LANDING_DEMO_DURATION_SECONDS = 60;

export const LANDING_DEMO_QUESTION_KEYS = ['hard', 'jump', 'own'] as const;

export type LandingDemoQuestionKey = (typeof LANDING_DEMO_QUESTION_KEYS)[number];

export const LANDING_DEMO_SCENES = [
  { key: 'hard', startSeconds: 0, startTime: '00:00:00', endTime: '00:00:20' },
  { key: 'jump', startSeconds: 20, startTime: '00:00:20', endTime: '00:00:40' },
  { key: 'own', startSeconds: 40, startTime: '00:00:40', endTime: '00:01:00' },
] as const;

export type LandingDemoScene = (typeof LANDING_DEMO_SCENES)[number];

function normalizeQuestion(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function landingDemoSceneAt(seconds: number): LandingDemoScene {
  const clamped = Math.min(Math.max(seconds, 0), LANDING_DEMO_DURATION_SECONDS);
  for (let index = LANDING_DEMO_SCENES.length - 1; index >= 0; index -= 1) {
    const scene = LANDING_DEMO_SCENES[index];
    if (clamped >= scene.startSeconds) return scene;
  }
  return LANDING_DEMO_SCENES[0];
}

export function matchLandingDemoQuestion(
  question: string,
  labels: Readonly<Record<LandingDemoQuestionKey, string>>,
): LandingDemoQuestionKey | null {
  const normalized = normalizeQuestion(question);
  if (!normalized) return null;
  for (const key of LANDING_DEMO_QUESTION_KEYS) {
    if (normalizeQuestion(labels[key]) === normalized) return key;
  }
  return null;
}

export function formatPlayerClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}
