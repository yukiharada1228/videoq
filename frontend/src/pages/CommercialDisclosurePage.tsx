import { useTranslation } from 'react-i18next';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { operatorConfig } from '@/lib/operatorConfig';

export default function CommercialDisclosurePage() {
  const { t } = useTranslation();

  const rows = [
    { labelKey: 'legal.disclosure.rows.seller', value: operatorConfig.name },
    { labelKey: 'legal.disclosure.rows.address', value: operatorConfig.address },
    { labelKey: 'legal.disclosure.rows.phone', value: operatorConfig.phone },
    { labelKey: 'legal.disclosure.rows.email', value: operatorConfig.email },
    { labelKey: 'legal.disclosure.rows.representative', value: operatorConfig.representative },
    { labelKey: 'legal.disclosure.rows.price', value: t('legal.disclosure.rows.priceValue') },
    { labelKey: 'legal.disclosure.rows.additionalFees', value: t('legal.disclosure.rows.additionalFeesValue') },
    { labelKey: 'legal.disclosure.rows.paymentMethod', value: t('legal.disclosure.rows.paymentMethodValue') },
    { labelKey: 'legal.disclosure.rows.paymentTiming', value: t('legal.disclosure.rows.paymentTimingValue') },
    { labelKey: 'legal.disclosure.rows.delivery', value: t('legal.disclosure.rows.deliveryValue') },
    { labelKey: 'legal.disclosure.rows.returns', value: t('legal.disclosure.rows.returnsValue') },
    { labelKey: 'legal.disclosure.rows.environment', value: t('legal.disclosure.rows.environmentValue') },
  ];

  return (
    <AppPageShell isPublic>
      <AppPageHeader title={t('legal.disclosure.title')} />
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <table className="w-full">
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-stone-50'}>
                <th className="w-1/3 border-b border-stone-200 px-6 py-4 text-left text-sm font-semibold text-[#191c19] align-top">
                  {t(row.labelKey)}
                </th>
                <td className="border-b border-stone-200 px-6 py-4 text-sm text-[#3f493f]">
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppPageShell>
  );
}
