import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModCatalog, isAllowedDownloadHost } from '../src/provisioning/ModCatalog';
import type { ModSourceSummary } from '../src/core/drivers/IGameDriver';

const source: ModSourceSummary = {
  id: 'modrinth',
  name: 'Modrinth',
  type: 'modrinth',
  baseUrl: 'https://api.modrinth.com/v2',
  loaderCategories: { fabric: ['fabric'], paper: ['paper', 'spigot'] },
  installDir: { paper: 'plugins' },
  defaultInstallDir: 'mods'
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isAllowedDownloadHost', () => {
  it('only accepts https downloads from the catalog domain', () => {
    expect(isAllowedDownloadHost('https://cdn.modrinth.com/data/x/file.jar', source.baseUrl)).toBe(true);
    expect(isAllowedDownloadHost('http://cdn.modrinth.com/file.jar', source.baseUrl)).toBe(false);
    expect(isAllowedDownloadHost('https://evil.example.com/file.jar', source.baseUrl)).toBe(false);
    expect(isAllowedDownloadHost('https://modrinth.com.evil.io/file.jar', source.baseUrl)).toBe(false);
  });
});

describe('ModCatalog.search', () => {
  it('filters by the loader categories and game version declared for the instance', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total_hits: 1,
        offset: 0,
        hits: [{ project_id: 'AABBCC', slug: 'sodium', title: 'Sodium', description: 'fast', author: 'jelly', downloads: 5 }]
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await ModCatalog.search(source, { dir: '.', loader: 'fabric', gameVersion: '1.21.1' }, 'sodium');

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/v2/search');
    expect(JSON.parse(url.searchParams.get('facets') as string)).toEqual([['categories:fabric'], ['versions:1.21.1']]);
    expect(result.hits[0]).toMatchObject({ projectId: 'AABBCC', title: 'Sodium' });
  });

  it('surfaces upstream failures as UPSTREAM_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(ModCatalog.search(source, { dir: '.' }, 'x')).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });
});
