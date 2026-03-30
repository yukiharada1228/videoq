import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { ChevronDown } from 'lucide-react';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { SeoHead } from '@/components/seo/SeoHead';

const CONTAINER = 'max-w-screen-md mx-auto px-6 lg:px-8';

type FaqItem = {
  question: string;
  answer: string;
};

type FaqCategory = {
  title: string;
  items: FaqItem[];
};

function AccordionItem({ question, answer }: FaqItem) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-stone-200 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex justify-between items-center py-4 text-left text-sm font-semibold text-[#191c19] hover:text-[#00652c] transition-colors"
        aria-expanded={open}
      >
        <span>{question}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-[#00652c] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <p className="pb-4 text-sm text-[#3f493f] leading-relaxed">{answer}</p>
      )}
    </div>
  );
}

function buildFaqSchema(categories: FaqCategory[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: categories.flatMap(({ items }) =>
      items.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: answer,
        },
      }))
    ),
  };
}

export default function FaqPage() {
  const { t } = useTranslation();

  const categories: FaqCategory[] = [
    {
      title: t('faq.categories.pricing.title'),
      items: [
        {
          question: t('faq.categories.pricing.items.free.question'),
          answer: t('faq.categories.pricing.items.free.answer'),
        },
        {
          question: t('faq.categories.pricing.items.paidPlan.question'),
          answer: t('faq.categories.pricing.items.paidPlan.answer'),
        },
      ],
    },
    {
      title: t('faq.categories.features.title'),
      items: [
        {
          question: t('faq.categories.features.items.formats.question'),
          answer: t('faq.categories.features.items.formats.answer'),
        },
        {
          question: t('faq.categories.features.items.accuracy.question'),
          answer: t('faq.categories.features.items.accuracy.answer'),
        },
        {
          question: t('faq.categories.features.items.japanese.question'),
          answer: t('faq.categories.features.items.japanese.answer'),
        },
        {
          question: t('faq.categories.features.items.duration.question'),
          answer: t('faq.categories.features.items.duration.answer'),
        },
      ],
    },
    {
      title: t('faq.categories.education.title'),
      items: [
        {
          question: t('faq.categories.education.items.school.question'),
          answer: t('faq.categories.education.items.school.answer'),
        },
        {
          question: t('faq.categories.education.items.sharing.question'),
          answer: t('faq.categories.education.items.sharing.answer'),
        },
        {
          question: t('faq.categories.education.items.integration.question'),
          answer: t('faq.categories.education.items.integration.answer'),
        },
      ],
    },
    {
      title: t('faq.categories.security.title'),
      items: [
        {
          question: t('faq.categories.security.items.privacy.question'),
          answer: t('faq.categories.security.items.privacy.answer'),
        },
        {
          question: t('faq.categories.security.items.storage.question'),
          answer: t('faq.categories.security.items.storage.answer'),
        },
      ],
    },
    {
      title: t('faq.categories.technical.title'),
      items: [
        {
          question: t('faq.categories.technical.items.api.question'),
          answer: t('faq.categories.technical.items.api.answer'),
        },
        {
          question: t('faq.categories.technical.items.llm.question'),
          answer: t('faq.categories.technical.items.llm.answer'),
        },
      ],
    },
  ];

  const faqSchema = buildFaqSchema(categories);

  return (
    <AppPageShell activePage="home" isPublic>
      <SeoHead
        title={t('seo.faq.title')}
        description={t('seo.faq.description')}
        path="/faq"
      />
      <Helmet>
        <script id="faq-schema-faq" type="application/ld+json">
          {JSON.stringify(faqSchema)}
        </script>
      </Helmet>

      <div className={`${CONTAINER} py-16 lg:py-24`}>
        <div className="text-center mb-12">
          <h1 className="text-3xl lg:text-4xl font-extrabold text-[#191c19] mb-4">
            {t('faq.pageTitle')}
          </h1>
          <p className="text-base text-[#3f493f]">{t('faq.subtitle')}</p>
        </div>

        <div className="space-y-10">
          {categories.map((category) => (
            <section key={category.title}>
              <h2 className="text-lg font-bold text-[#00652c] mb-4 pb-2 border-b-2 border-[#dcfce7]">
                {category.title}
              </h2>
              <div className="rounded-xl bg-white px-4"
                style={{ boxShadow: '0 4px 16px rgba(25,28,25,0.06)' }}
              >
                {category.items.map((item) => (
                  <AccordionItem key={item.question} {...item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </AppPageShell>
  );
}
