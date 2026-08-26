import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CathedralEngine } from '../engine/CathedralEngine';
import { Toolbar } from './Toolbar';

const mockEngine = {
  setZoneVisible: () => {},
  setFiguresVisible: () => {},
} as unknown as CathedralEngine;

const meta = {
  title: 'Toolbar',
  component: Toolbar,
  parameters: { layout: 'fullscreen' },
  args: {
    engine: mockEngine,
    isLive: true,
    connected: true,
    flushStats: () => 1,
    onToggleNav: () => {},
  },
} satisfies Meta<typeof Toolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
