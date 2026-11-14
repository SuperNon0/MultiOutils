import type { ReactNode } from 'react';
import { Icon } from '../host/Icon';
import './file-tile.css';

export function FileTile({ path, isDir, framed = true, children }: {
  path: string; isDir: boolean; framed?: boolean; children?: ReactNode;
}): ReactNode {
  const ext = path.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase() ?? '';
  const kind = isDir ? 'folder' : /^(png|jpe?g|webp|gif|bmp|svg|heic)$/.test(ext) ? 'image'
    : /^(mp4|mkv|mov|avi|webm)$/.test(ext) ? 'video'
    : /^(zip|7z|rar|tar|gz)$/.test(ext) ? 'archive'
    : /^(xls|xlsx|csv|ods)$/.test(ext) ? 'sheet'
    : ext === 'pdf' ? 'pdf' : /^(exe|lnk|url|appref-ms)$/.test(ext) ? 'app' : 'document';
  const glyph = isDir ? 'folder' : kind === 'image' ? 'image' : kind === 'video' ? 'play'
    : kind === 'archive' ? 'layers' : kind === 'app' ? 'grid' : 'file';
  return <span className={`file-tile${framed ? '' : ' plain'}`} data-kind={kind}>
    {framed && isDir ? <Icon name="folder" /> : children ?? <Icon name={glyph} />}
  </span>;
}
