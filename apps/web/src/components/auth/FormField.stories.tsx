import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps } from 'react';
import { expect, fn } from 'storybook/test';
import { FormField } from './FormField';

function FieldExample(args: ComponentProps<typeof FormField>) {
  const [value, setValue] = useState(args.value);
  return (
    <FormField
      {...args}
      value={value}
      onChange={(event) => { args.onChange(event); setValue(event.target.value); }}
    />
  );
}

const meta = {
  title: 'Auth/FormField',
  component: FormField,
  args: {
    id: 'username',
    name: 'username',
    label: 'ユーザー名',
    type: 'text',
    value: '',
    required: true,
    autoComplete: 'username',
    onChange: fn(),
  },
  argTypes: { blockSize: { control: 'inline-radio', options: ['sm', 'md', 'lg'] } },
  render: (args) => <FieldExample key={args.value} {...args} />,
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
} satisfies Meta<typeof FormField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Required: Story = {};
export const Optional: Story = { args: { label: '表示名', required: false, isOptional: true } };
export const WithoutBadge: Story = { args: { showRequirementBadge: false } };
export const WithSupportText: Story = {
  args: { minLength: 3, supportText: '半角英数字で3文字以上入力してください。' },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('textbox')).toHaveAccessibleDescription(args.supportText);
  },
};
export const WithError: Story = {
  args: { ...WithSupportText.args, value: 'ab', error: 'ユーザー名は3文字以上で入力してください。' },
  play: async ({ canvas, args }) => {
    const input = canvas.getByRole('textbox');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAccessibleDescription(args.error);
    await expect(input).toHaveAttribute('aria-describedby', `${args.id}-error`);
  },
};
export const Disabled: Story = {
  args: { value: 'videoq_user', disabled: true },
  play: async ({ canvas, userEvent, args }) => {
    const input = canvas.getByRole('textbox');
    await expect(input).toBeDisabled();
    await userEvent.click(input);
    await userEvent.keyboard('changed');
    await expect(input).toHaveValue(args.value);
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};
export const Medium: Story = { args: { blockSize: 'md', value: 'videoq_user' } };
export const Small: Story = { args: { blockSize: 'sm', value: 'videoq_user' } };
export const LongLabel: Story = {
  args: {
    label: 'コースの参加者一覧や講義へのフィードバックに表示するユーザー名',
    supportText: 'ほかの参加者があなたを識別できる名前を入力してください。登録後に設定画面から変更できます。',
    isOptional: true,
    required: false,
  },
  globals: { viewport: { value: 'mobile', isRotated: false } },
};
export const KeyboardInput: Story = {
  play: async ({ canvas, userEvent, args }) => {
    // Clicking the label must focus its associated input.
    await userEvent.click(canvas.getByText(args.label, { exact: false, selector: 'label' }));
    const input = canvas.getByRole('textbox');
    await expect(input).toHaveFocus();
    await userEvent.keyboard('videoq_user');
    await expect(input).toHaveValue('videoq_user');
    await expect(args.onChange).toHaveBeenCalled();
  },
};
export const EnglishMobile: Story = {
  args: { label: 'Username', supportText: 'Enter at least 3 letters or numbers.', minLength: 3 },
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
