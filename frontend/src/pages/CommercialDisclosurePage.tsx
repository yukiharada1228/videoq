import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/layout/PageLayout';

export default function CommercialDisclosurePage() {
  const { t } = useTranslation();

  const rows = [
    { label: '販売事業者名', value: '原田 優輝（個人事業主）' },
    { label: '所在地', value: '請求があった場合に遅滞なく開示いたします。' },
    { label: '電話番号', value: '請求があった場合に遅滞なく開示いたします。' },
    { label: 'メールアドレス', value: 'yukiharada1228@gmail.com' },
    { label: '運営統括責任者', value: '原田 優輝' },
    { label: '販売価格', value: '各プランページに表示された価格（税込）' },
    { label: '販売価格以外の必要料金', value: 'インターネット接続料金、通信料金はお客様のご負担となります。' },
    { label: '支払方法', value: 'クレジットカード（Stripe経由）' },
    { label: '支払時期', value: 'サブスクリプション登録時に初回決済。以降、毎月自動更新時に決済。' },
    { label: 'サービス提供時期', value: '決済完了後、直ちにご利用いただけます。' },
    { label: '返品・キャンセルについて', value: 'デジタルサービスの性質上、購入後の返品・返金はお受けしておりません。サブスクリプションはいつでもキャンセル可能で、キャンセル後は現在の請求期間の終了まで引き続きご利用いただけます。' },
    { label: '動作環境', value: 'モダンブラウザ（Chrome, Firefox, Safari, Edge の最新版）' },
  ];

  return (
    <PageLayout>
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-2xl font-bold text-gray-900">
          {t('legal.disclosure.title')}
        </h1>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full">
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <th className="w-1/3 border-b border-gray-200 px-6 py-4 text-left text-sm font-semibold text-gray-900 align-top">
                    {row.label}
                  </th>
                  <td className="border-b border-gray-200 px-6 py-4 text-sm text-gray-700">
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageLayout>
  );
}
