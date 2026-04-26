const JA_TITLE = 'VideoQ | 動画にAIで質問、見たいシーンへ';
const JA_DESCRIPTION = 'AIに質問するだけで、見たいシーンに瞬時にジャンプ。動画をアップロードするだけでAIが自動文字起こし＆検索を可能にします。';

export const onRequest: PagesFunction = async (context) => {
  const response = await context.next();

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  return new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent(JA_TITLE);
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute('content', JA_DESCRIPTION);
      },
    })
    .on('meta[property="og:title"]', {
      element(el) {
        el.setAttribute('content', JA_TITLE);
      },
    })
    .on('meta[property="og:description"]', {
      element(el) {
        el.setAttribute('content', JA_DESCRIPTION);
      },
    })
    .on('meta[property="og:locale"]', {
      element(el) {
        el.setAttribute('content', 'ja_JP');
      },
    })
    .transform(response);
};
