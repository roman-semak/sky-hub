import { describe, expect, it } from 'vitest';
import { apiOrigin, apiUrl, streamUrl } from './api-origin';

const doc = (content: string | null): Pick<Document, 'querySelector'> => ({
  querySelector: () => (content === null ? null : { content }),
});

describe('api origin', () => {
  it('reads and normalizes the meta tag', () => {
    expect(apiOrigin(doc('https://api.example.dev/some/path'))).toBe('https://api.example.dev');
    expect(apiOrigin(doc(' '))).toBe('');
    expect(apiOrigin(doc(null))).toBe('');
    expect(apiOrigin(doc('not a url'))).toBe('');
  });

  it('prefixes API paths only', () => {
    expect(apiUrl('/api/ac/4951ab', 'https://api.example.dev')).toBe(
      'https://api.example.dev/api/ac/4951ab',
    );
    expect(apiUrl('/api/ac/4951ab', '')).toBe('/api/ac/4951ab');
    expect(apiUrl('https://api.rainviewer.com/x', 'https://api.example.dev')).toBe(
      'https://api.rainviewer.com/x',
    );
  });

  it('derives the stream URL', () => {
    expect(streamUrl('', { protocol: 'https:', host: 'skytrace.pages.dev' })).toBe(
      'wss://skytrace.pages.dev/stream',
    );
    expect(streamUrl('', { protocol: 'http:', host: 'localhost:4200' })).toBe(
      'ws://localhost:4200/stream',
    );
    expect(streamUrl('https://api.example.dev', { protocol: 'https:', host: 'x' })).toBe(
      'wss://api.example.dev/stream',
    );
    expect(streamUrl('http://localhost:8080', { protocol: 'http:', host: 'x' })).toBe(
      'ws://localhost:8080/stream',
    );
  });
});
