/**
 * 気象・防災 API Provider Tests
 * 気象庁防災情報 + J-SHIS + AMeDAS
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getForecast,
  getForecastOverview,
  getForecastWeekly,
  getTyphoonInfo,
  getEarthquakeList,
  getTsunamiList,
  getAmedasStations,
  getAmedasData,
  getSeismicHazard,
} from '../build/providers/weather.js';
import { cache, rateLimiters } from '../build/utils/http.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  cache.clear();
  rateLimiters.clear();
});

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('気象・防災API', () => {
  // ── 天気予報 ──
  describe('気象庁天気予報', () => {
    it('getForecast should fetch forecast by areaCode', async () => {
      globalThis.fetch = async (input) => {
        const url = String(input);
        assert.match(url, /jma\.go\.jp\/bosai\/forecast\/data\/forecast\/130000\.json/);
        return mockJsonResponse([{ publishingOffice: '気象庁', timeSeries: [] }]);
      };

      const result = await getForecast({ areaCode: '130000' });
      assert.equal(result.success, true);
      assert.ok(result.data);
    });

    it('getForecast should fail when areaCode is empty', async () => {
      const result = await getForecast({ areaCode: '  ' });
      assert.equal(result.success, false);
      assert.match(result.error || '', /areaCode is required/);
    });

    it('getForecastOverview should fetch overview by areaCode', async () => {
      globalThis.fetch = async (input) => {
        const url = String(input);
        assert.match(url, /overview_forecast\/130000\.json/);
        return mockJsonResponse({ publishingOffice: '気象庁', text: '晴れ' });
      };

      const result = await getForecastOverview({ areaCode: '130000' });
      assert.equal(result.success, true);
    });

    it('getForecastOverview should fail when areaCode is empty', async () => {
      const result = await getForecastOverview({ areaCode: '' });
      assert.equal(result.success, false);
      assert.match(result.error || '', /areaCode is required/);
    });

    it('getForecastWeekly should fetch weekly forecast', async () => {
      globalThis.fetch = async (input) => {
        const url = String(input);
        assert.match(url, /forecast\/data\/forecast\/130000\.json/);
        return mockJsonResponse([{ publishingOffice: '気象庁' }]);
      };

      const result = await getForecastWeekly({ areaCode: '130000' });
      assert.equal(result.success, true);
    });

    it('getForecastWeekly should fail when areaCode is empty', async () => {
      const result = await getForecastWeekly({ areaCode: '   ' });
      assert.equal(result.success, false);
      assert.match(result.error || '', /areaCode is required/);
    });
  });

  // ── 台風情報 ──
  describe('台風情報', () => {
    it('getTyphoonInfo should fetch typhoon data', async () => {
      globalThis.fetch = async (input) => {
        const url = String(input);
        assert.match(url, /typhoon\/data\/targetTyphoon\.json/);
        return mockJsonResponse([{ name: 'TYPHOON_1', number: 1 }]);
      };

      const result = await getTyphoonInfo();
      assert.equal(result.success, true);
    });

    it('getTyphoonInfo should handle 404 (no typhoons) gracefully', async () => {
      globalThis.fetch = async () => new Response('Not Found', { status: 404 });

      const result = await getTyphoonInfo();
      assert.equal(result.success, true);
      const data = result.data as { message?: string; typhoons?: unknown[] };
      assert.match(data.message || '', /台風情報はありません/);
      assert.deepEqual(data.typhoons, []);
    });
  });

  // ── 地震・津波 ──
  describe('地震・津波情報', () => {
    it('getEarthquakeList should fetch earthquake list', async () => {
      globalThis.fetch = async (input) => {
        const url = String(input);
        assert.match(url, /quake\/data\/list\.json/);
        return mockJsonResponse([{ mag: 5.0, place: '東京都' }]);
      };

      const result = await getEarthquakeList();
      assert.equal(result.success, true);
    });

    it('getTsunamiList should fetch tsunami warning list', async () => {
      globalThis.fetch = async (input) => {
        const url = String(input);
        assert.match(url, /tsunami\/data\/list\.json/);
        return mockJsonResponse([]);
      };

      const result = await getTsunamiList();
      assert.equal(result.success, true);
    });
  });

  // ── AMeDAS ──
  describe('AMeDAS', () => {
    it('getAmedasStations should fetch station list', async () => {
      globalThis.fetch = async (input) => {
        const url = String(input);
        assert.match(url, /amedas\/const\/amedastable\.json/);
        return mockJsonResponse({ '44132': { kjName: '東京', lat: [35, 41.5] } });
      };

      const result = await getAmedasStations();
      assert.equal(result.success, true);
    });

    it('getAmedasData should fetch observation data by pointId', async () => {
      globalThis.fetch = async (input) => {
        const url = String(input);
        assert.match(url, /amedas\/data\/point\/44132\//);
        return mockJsonResponse({ '20260226120000': { temp: [5.2, 0] } });
      };

      const result = await getAmedasData({ pointId: '44132' });
      assert.equal(result.success, true);
    });

    it('getAmedasData should fail when pointId is empty', async () => {
      const result = await getAmedasData({ pointId: '' });
      assert.equal(result.success, false);
      assert.match(result.error || '', /pointId is required/);
    });

    it('getAmedasData should format date parameter correctly', async () => {
      globalThis.fetch = async (input) => {
        const url = String(input);
        assert.match(url, /44132\/20240101_12\.json/);
        return mockJsonResponse({});
      };

      const result = await getAmedasData({ pointId: '44132', date: '2024010112' });
      assert.equal(result.success, true);
    });
  });

  // ── J-SHIS ──
  describe('J-SHIS (地震ハザード)', () => {
    it('getSeismicHazard should fetch hazard data with position=lon,lat', async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.match(url.hostname, /j-shis\.bosai\.go\.jp/);
        assert.equal(url.searchParams.get('position'), '139.6917,35.6895');
        assert.equal(url.searchParams.get('epsg'), '4326');
        return mockJsonResponse({ type: 'FeatureCollection', features: [] });
      };

      const result = await getSeismicHazard({ lat: 35.6895, lon: 139.6917 });
      assert.equal(result.success, true);
    });

    it('getSeismicHazard should fail when lat/lon are undefined', async () => {
      const result = await getSeismicHazard({ lat: undefined as unknown as number, lon: undefined as unknown as number });
      assert.equal(result.success, false);
      assert.match(result.error || '', /lat and lon are required/);
    });
  });
});
