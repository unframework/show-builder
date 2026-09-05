import type { Meta, StoryObj } from '@storybook/react-vite';
import { DEFAULT_LOOKS } from '../effects/demoEffects';
import { EffectPanel } from './EffectPanel';
import { mockEffectControl } from './mockEffectControl';

const look = (name: string) => DEFAULT_LOOKS.find((l) => l.name === name)?.layers ?? [];

const meta = {
  title: 'EffectPanel',
  component: EffectPanel,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof EffectPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoiseRays: Story = {
  args: { source: mockEffectControl(look('noise rays')) },
};

export const Noise: Story = {
  args: { source: mockEffectControl(look('noise blobs')) },
};

export const EmptyStack: Story = {
  args: { source: mockEffectControl([]) },
};

export const Mobile: Story = {
  args: { source: mockEffectControl(look('noise rays')) },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
