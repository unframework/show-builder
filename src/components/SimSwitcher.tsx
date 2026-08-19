const SIMS = [
  { href: 'rose-window-sim.html', label: '🕸 ROSE WINDOW' },
  { href: 'cathedral.html', label: '🏰 3D LAYOUT' },
  { href: 'arches-sim.html', label: '🏛 ARCHES' },
];

const CURRENT = 'cathedral.html';

export function SimSwitcher() {
  return (
    <select
      className="sim-switcher"
      defaultValue={CURRENT}
      onChange={(e) => {
        window.location.href = e.target.value;
      }}
    >
      {SIMS.map((s) => (
        <option key={s.href} value={s.href}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
