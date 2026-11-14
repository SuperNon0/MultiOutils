/** Payload shared by zone windows; native files still work from Explorer. */
export const ZONE_DRAG_TYPE = 'application/x-multioutils-paths';

export function draggedPaths(data: Pick<DataTransfer, 'getData'>, nativePaths: () => string[]): string[] {
  try {
    const value: unknown = JSON.parse(data.getData(ZONE_DRAG_TYPE) || 'null');
    if (Array.isArray(value) && value.every((p) => typeof p === 'string')) return value;
  } catch {
    // External drops do not carry our payload.
  }
  return nativePaths();
}

export function acceptsZoneDrag(types: readonly string[]): boolean {
  return types.includes(ZONE_DRAG_TYPE) || types.includes('Files');
}
