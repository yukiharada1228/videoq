export const LANDING_PUBLIC_SAMPLES = [
  {
    key: 'linearAlgebra',
    slug: 'yobinori-linearalgebra',
  },
  {
    key: 'deepLearning',
    slug: 'aicia-deeplearning',
  },
] as const;

export type LandingPublicSampleKey = (typeof LANDING_PUBLIC_SAMPLES)[number]['key'];

export function landingSamplePath(slug: string) {
  return `/share/${slug}`;
}
