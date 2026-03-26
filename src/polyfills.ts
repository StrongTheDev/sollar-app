if (typeof window !== 'undefined') {
  try {
    const target = window;
    let desc = Object.getOwnPropertyDescriptor(target, 'fetch');
    if (!desc) {
      // @ts-ignore
      target = Object.getPrototypeOf(window);
      desc = Object.getOwnPropertyDescriptor(target, 'fetch');
    }
    if (desc && desc.configurable && !desc.writable && !desc.set) {
      const originalFetch = window.fetch;
      Object.defineProperty(window, 'fetch', {
        value: originalFetch,
        writable: true,
        configurable: true,
        enumerable: true
      });
    }
  } catch (e) {
    console.error('Polyfill error:', e);
  }
}
export {};
