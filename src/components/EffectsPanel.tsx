import type { EffectControl } from '../effects/effectControl';
import { EffectControls } from './EffectControls';

export function EffectsPanel({ source }: { source: EffectControl }) {
  return (
    <section className="max-h-[50dvh] shrink-0 overflow-y-auto border-t border-base-300 bg-base-200 px-2 py-3 sm:px-4">
      <h3 className="mb-2 text-xs uppercase tracking-wide opacity-50">Effects</h3>
      <EffectControls source={source} />
    </section>
  );
}
