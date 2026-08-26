import type { Preview } from '@storybook/react-vite';
import '../src/styles.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: { test: 'todo' },
  },
  decorators: [
    (Story) => (
      <div data-theme="dark" className="bg-base-300 p-4 text-base-content">
        <Story />
      </div>
    ),
  ],
};

export default preview;
