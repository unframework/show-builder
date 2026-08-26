import type { Meta, StoryObj } from '@storybook/react-vite';
import { EffectPanel } from './EffectPanel';
import { mockEffectControl } from './mockEffectControl';

const meta = {
  title: 'EffectPanel',
  component: EffectPanel,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof EffectPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoiseRays: Story = {
  args: { source: mockEffectControl('noise-rays') },
};

export const Noise: Story = {
  args: { source: mockEffectControl('noise') },
};

export const NoKnobs: Story = {
  args: { source: mockEffectControl('zone') },
};

export const Mobile: Story = {
  args: { source: mockEffectControl('noise-rays') },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
