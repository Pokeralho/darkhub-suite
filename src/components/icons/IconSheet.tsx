import * as Icons from './index';

// Dev-only review sheet for the Frost icon set (route #dev-icons, never linked in production).
export default function IconSheet() {
  const entries = Object.entries(Icons).filter(([, v]) => typeof v === 'function') as [string, React.ComponentType<Icons.IconProps>][];
  const unique = entries.filter(([name, C], i) => entries.findIndex(([, D]) => D === C) === i || name === 'DarkHubMark');
  return (
    <div className="dh-page space-y-6">
      <header>
        <h1 className="text-lg font-semibold text-zinc-100">Frost icons</h1>
        <p className="text-xs text-zinc-500">{unique.length} glifos únicos · {entries.length} nomes exportados</p>
      </header>
      {[24, 16].map((size) => (
        <section key={size} className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-px rounded-lg overflow-hidden border border-zinc-800 bg-zinc-800">
          {unique.map(([name, C]) => (
            <div key={`${size}-${name}`} className="bg-zinc-950 flex flex-col items-center justify-center gap-2 py-4 text-zinc-200 hover:text-blue-300">
              <C size={size} />
              <span className="text-[10px] font-mono text-zinc-500 truncate max-w-full px-1">{name}</span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
