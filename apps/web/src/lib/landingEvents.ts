// Shared with the collector. No free-text, URLs, identifiers, or ad query strings.
export const LANDING_EVENTS = [
  'landing_view', 'demo_open', 'demo_engaged', 'demo_complete', 'demo_question', 'demo_source', 'sample_download',
  'signup_click', 'signup_view', 'email_signup_created', 'email_verified', 'first_answer',
] as const;
export const LANDING_AUDIENCES = ['general', 'school', 'training', 'student'] as const;
export const LANDING_PLACEMENTS = ['none', 'hero', 'free', 'footer', 'mobile', 'header'] as const;
export type LandingEvent = (typeof LANDING_EVENTS)[number];
export type LandingAudience = (typeof LANDING_AUDIENCES)[number];
export type LandingPlacement = (typeof LANDING_PLACEMENTS)[number];
export type LandingEventPayload = {
  event: LandingEvent;
  audience: LandingAudience;
  locale: 'ja' | 'en';
  placement: LandingPlacement;
};

export function isLandingEventPayload(value: unknown): value is LandingEventPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return Object.keys(data).length === 4
    && LANDING_EVENTS.some(event => event === data.event)
    && LANDING_AUDIENCES.some(audience => audience === data.audience)
    && LANDING_PLACEMENTS.some(placement => placement === data.placement)
    && (data.locale === 'ja' || data.locale === 'en');
}
