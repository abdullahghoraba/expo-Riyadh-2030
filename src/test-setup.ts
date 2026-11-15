// jsdom lacks a few browser APIs that @arcgis/core touches at module load time.
const g = globalThis as Record<string, unknown>;

if (!g['ResizeObserver']) {
  g['ResizeObserver'] = class {
    observe(): void { /* jsdom stub */ }
    unobserve(): void { /* jsdom stub */ }
    disconnect(): void { /* jsdom stub */ }
  };
}

if (!g['IntersectionObserver']) {
  g['IntersectionObserver'] = class {
    observe(): void { /* jsdom stub */ }
    unobserve(): void { /* jsdom stub */ }
    disconnect(): void { /* jsdom stub */ }
    takeRecords(): unknown[] { return []; }
  };
}

if (typeof HTMLImageElement !== 'undefined' && !HTMLImageElement.prototype.decode) {
  HTMLImageElement.prototype.decode = () => Promise.resolve();
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => undefined, removeListener: () => undefined,
    addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false
  }) as MediaQueryList;
}
