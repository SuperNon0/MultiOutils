import type { ReactNode } from 'react';
import './desktop.css';

/** Pastille affichée un instant au changement de page (route #/zone-pages/<infos>). */
export function ZonePages({ param }: { param: string }): ReactNode {
  let info = { index: 0, count: 1, name: '' };
  try {
    info = { ...info, ...(JSON.parse(decodeURIComponent(param)) as typeof info) };
  } catch {
    // paramètre illisible : pastille vide
  }
  return (
    <div className="zpg" role="status">
      <span>{info.name}</span>
      <span className="zpg-dots">
        {Array.from({ length: info.count }, (_, i) => (
          <i key={i} className={i === info.index ? 'on' : ''} />
        ))}
      </span>
    </div>
  );
}
