import { useEffect } from 'react';

interface DocumentMetaOptions {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  twitterCard?: 'summary' | 'summary_large_image';
}

const DEFAULT_TITLE = 'VideoQ - 質問して見たいシーンへジャンプ';
const DEFAULT_DESCRIPTION =
  'VideoQは、動画を自動で文字起こしし、AIチャットで見たい箇所に瞬時にアクセスできるWebプラットフォームです。教育機関、企業研修、コンテンツ制作など幅広い用途でご利用いただけます。';

export function useDocumentMeta(options: DocumentMetaOptions = {}) {
  const {
    title = DEFAULT_TITLE,
    description = DEFAULT_DESCRIPTION,
    ogTitle,
    ogDescription,
    ogImage,
    ogUrl,
    twitterCard = 'summary_large_image',
  } = options;

  useEffect(() => {
    // Set document title
    document.title = title;

    // Set or update meta tags
    const setMetaTag = (name: string, content: string, isProperty = false) => {
      const attribute = isProperty ? 'property' : 'name';
      let element = document.querySelector(
        `meta[${attribute}="${name}"]`
      ) as HTMLMetaElement;

      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, name);
        document.head.appendChild(element);
      }

      element.content = content;
    };

    // Basic meta tags
    setMetaTag('description', description);

    // Open Graph tags
    setMetaTag('og:title', ogTitle || title, true);
    setMetaTag('og:description', ogDescription || description, true);
    setMetaTag('og:type', 'website', true);

    if (ogImage) {
      setMetaTag('og:image', ogImage, true);
    }

    if (ogUrl) {
      setMetaTag('og:url', ogUrl, true);
    }

    // Twitter Card tags
    setMetaTag('twitter:card', twitterCard);
    setMetaTag('twitter:title', ogTitle || title);
    setMetaTag('twitter:description', ogDescription || description);

    if (ogImage) {
      setMetaTag('twitter:image', ogImage);
    }
  }, [
    title,
    description,
    ogTitle,
    ogDescription,
    ogImage,
    ogUrl,
    twitterCard,
  ]);
}
