import { preconnectApi } from './preconnect';

describe('preconnectApi', () => {
  const links = (): string[] =>
    [...document.head.querySelectorAll('link[rel="preconnect"]')].map(
      (l) => (l as HTMLLinkElement).href,
    );

  afterEach(() => {
    for (const l of document.head.querySelectorAll('link[rel="preconnect"]')) l.remove();
  });

  it('adds a crossorigin link for a foreign API origin', () => {
    expect(preconnectApi('https://api.example.dev')).toEqual(['https://api.example.dev']);
    const link = document.head.querySelector<HTMLLinkElement>('link[rel="preconnect"]');
    expect(link?.href).toBe('https://api.example.dev/');
    // An empty crossorigin attribute is the anonymous (CORS) mode.
    expect(link?.getAttribute('crossorigin')).toBe('');
  });

  it('does nothing for same-origin or unconfigured API', () => {
    expect(preconnectApi('')).toEqual([]);
    expect(preconnectApi(document.location.origin)).toEqual([]);
    expect(links()).toEqual([]);
  });

  it('never adds the same origin twice', () => {
    preconnectApi('https://api.example.dev');
    expect(preconnectApi('https://api.example.dev')).toEqual([]);
    expect(links()).toHaveLength(1);
  });
});
