import { useId } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChipLabel } from '@/components/ui/chip-label';
import { ErrorText } from '@/components/ui/error-text';
import { Heading, HeadingTitle } from '@/components/ui/heading';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from '@/components/ui/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const copy = {
  ja: {
    title: 'VideoQのカラーテーマ', intro: 'LPと共通コンポーネントで、同じ色のトークンを使います。',
    buttons: 'ボタンとリンク', primary: '無料で始める', secondary: '講座を確認', text: '詳しく見る', disabled: '処理中', link: '料金プランを見る',
    form: 'フォームと選択状態', name: '講座名', placeholder: '例：線形代数の基礎', type: '教材の種類', lectures: '講義動画', training: '研修動画', description: '講座の説明',
    errorLabel: '入力エラーの例', error: '講座名を入力してください。', checkbox: '新しい教材の通知を受け取る',
    states: '状態を伝える色', info: '選択中', success: '完了', warning: '確認が必要', failure: 'エラー',
  },
  en: {
    title: 'The VideoQ color theme', intro: 'The landing page and shared components use the same color tokens.',
    buttons: 'Buttons and links', primary: 'Start free', secondary: 'View course', text: 'Learn more', disabled: 'Processing', link: 'Explore pricing',
    form: 'Forms and selection', name: 'Course name', placeholder: 'e.g. Linear algebra basics', type: 'Material type', lectures: 'Lecture video', training: 'Training video', description: 'Course description',
    errorLabel: 'An input error', error: 'Enter a course name.', checkbox: 'Notify me about new materials',
    states: 'Colors with meaning', info: 'Selected', success: 'Completed', warning: 'Needs attention', failure: 'Error',
  },
};

function ThemePreview() {
  const { i18n } = useTranslation();
  const c = copy[i18n.language === 'en' ? 'en' : 'ja'];
  const id = useId();
  return (
    <main className="min-h-screen bg-background p-6 text-solid-gray-800 sm:p-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <header>
          <Heading size="28"><HeadingTitle level="h1">{c.title}</HeadingTitle></Heading>
          <p className="mt-3 text-std-16N-170 text-solid-gray-600">{c.intro}</p>
        </header>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Brand', 'bg-brand', '#3159DC'],
            ['Ink', 'bg-ink', '#182C3B'],
            ['Page', 'bg-page', '#FBFCFA'],
            ['Sage', 'bg-sage', '#EEF2EB'],
            ['Accent', 'bg-lime-accent', '#C5EE90'],
            ['Inverse', 'bg-inverse', '#1B333F'],
          ].map(([name, color, hex]) => (
            <div key={name} className="overflow-hidden rounded-8 border border-border bg-white">
              <div className={`h-16 ${color}`} aria-hidden="true" />
              <dt className="px-3 pt-3 text-sm font-bold">{name}</dt>
              <dd className="px-3 pb-3 pt-1 font-mono text-xs text-solid-gray-600">{hex}</dd>
            </div>
          ))}
        </dl>
        <section className="rounded-12 border border-border bg-white p-5 sm:p-7">
          <Heading size="20" hasChip><HeadingTitle level="h2">{c.buttons}</HeadingTitle></Heading>
          <div className="my-5 flex flex-wrap items-center gap-4">
            <Button>{c.primary}</Button>
            <Button variant="outline">{c.secondary}</Button>
            <Button variant="text">{c.text}</Button>
            <Button disabled>{c.disabled}</Button>
          </div>
          <Link href="#theme-form">{c.link}</Link>
        </section>
        <section id="theme-form" className="rounded-12 border border-border bg-white p-5 sm:p-7">
          <Heading size="20" hasChip><HeadingTitle level="h2">{c.form}</HeadingTitle></Heading>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${id}-name`}>{c.name}</Label>
              <Input id={`${id}-name`} className="w-full" aria-describedby={`${id}-name-hint`} />
              <p id={`${id}-name-hint`} className="text-sm text-solid-gray-600">{c.placeholder}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-type`}>{c.type}</Label>
              <Select defaultValue="lectures">
                <SelectTrigger id={`${id}-type`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lectures">{c.lectures}</SelectItem>
                  <SelectItem value="training">{c.training}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-description`}>{c.description}</Label>
              <Textarea id={`${id}-description`} rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-invalid`}>{c.errorLabel}</Label>
              <Input id={`${id}-invalid`} className="w-full" aria-invalid="true" aria-describedby={`${id}-error`} />
              <ErrorText id={`${id}-error`}>{c.error}</ErrorText>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-3">
            <Checkbox id={`${id}-notify`} defaultChecked />
            <Label htmlFor={`${id}-notify`} size="sm">{c.checkbox}</Label>
          </div>
        </section>
        <section className="rounded-12 bg-sage p-5 sm:p-7">
          <Heading size="20"><HeadingTitle level="h2">{c.states}</HeadingTitle></Heading>
          <div className="mt-5 flex flex-wrap gap-3">
            <ChipLabel color="blue" variant="filled-2">{c.info}</ChipLabel>
            <ChipLabel color="green" variant="filled-1">{c.success}</ChipLabel>
            <ChipLabel color="yellow" variant="filled-1">{c.warning}</ChipLabel>
            <ChipLabel color="red" variant="filled-1">{c.failure}</ChipLabel>
          </div>
        </section>
      </div>
    </main>
  );
}

const meta = {
  title: 'Design system/VideoQ theme',
  component: ThemePreview,
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
  async play({ canvasElement }) {
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
} satisfies Meta<typeof ThemePreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
export const Mobile: Story = { globals: { viewport: { value: 'mobile', isRotated: false } } };
export const EnglishMobile: Story = { globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } } };
export const KeyboardFocus: Story = {
  async play({ canvas, userEvent }) {
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: /無料で始める|Start free/ })).toHaveFocus();
  },
};
export const FormControls: Story = {
  async play({ canvas, userEvent }) {
    const name = canvas.getByRole('textbox', { name: /講座名|Course name/ });
    await userEvent.type(name, 'Linear algebra');
    await expect(name).toHaveValue('Linear algebra');
    const checkbox = canvas.getByRole('checkbox');
    await expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    await expect(checkbox).not.toBeChecked();
    await userEvent.click(canvas.getByRole('combobox'));
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(canvas.getByRole('combobox')).toHaveTextContent(/研修動画|Training video/);
  },
};
