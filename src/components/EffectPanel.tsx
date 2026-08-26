import { EffectControls } from './EffectControls';
import { EffectParamControls } from './EffectParamControls';
import type { EffectControl } from '../effects/effectControl';

export function EffectPanel({ source }: { source: EffectControl }) {
  return (
    <div className="grid grid-cols-1 gap-4 bg-base-300 px-2 py-3 sm:px-4 lg:grid-cols-2">
      <div className="grid grid-cols-2 gap-3">
        <EffectControls source={source} />
        <EffectParamControls source={source} />
      </div>
      <div aria-hidden />
    </div>
  );
}
