/**
 * E2E Scenario 9: 市区町村コード解決
 *
 * area-mapping.json の 1,700+ 市区町村データの正確性を検証。
 * 全て純粋関数のためAPIキー不要。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { areaBridge } from '../../build/providers/resolve.js';
import { assertApiResponse } from './helpers/e2e-utils.ts';

describe('E2E Scenario 9: 市区町村コード解決', () => {

  // ── 9-1: cityCode(5桁)で直接解決 ──

  it('cityCode 13101 → 千代田区（東京都）', () => {
    const r = areaBridge({ cityCode: '13101' });
    assertApiResponse(r);
    assert.equal(r.data.prefCode, '13');
    assert.equal(r.data.cityCode, '13101');
    assert.equal(r.data.cityName, '千代田区');
    assert.equal(r.data.cityType, 'special_ward');
    assert.equal(r.data.prefName, '東京都');
  });

  it('cityCode 01100 → 札幌市（北海道）', () => {
    const r = areaBridge({ cityCode: '01100' });
    assertApiResponse(r);
    assert.equal(r.data.prefCode, '01');
    assert.equal(r.data.cityName, '札幌市');
    assert.equal(r.data.cityType, 'designated_city');
  });

  it('cityCode 14100 → 横浜市（神奈川県）', () => {
    const r = areaBridge({ cityCode: '14100' });
    assertApiResponse(r);
    assert.equal(r.data.prefCode, '14');
    assert.equal(r.data.cityName, '横浜市');
    assert.equal(r.data.cityType, 'designated_city');
  });

  it('cityCode 6桁(チェックディジット付き) → 5桁に正規化', () => {
    const r = areaBridge({ cityCode: '131016' });  // 6-digit → 13101
    assertApiResponse(r);
    assert.equal(r.data.cityCode, '13101');
    assert.equal(r.data.cityName, '千代田区');
  });

  it('cityCode 不存在 → エラー', () => {
    const r = areaBridge({ cityCode: '99999' });
    assert.equal(r.success, false);
  });

  // ── 9-2: 政令指定都市の区(ward) ──

  it('cityCode 01101 → 中央区（札幌市）parentCity付き', () => {
    const r = areaBridge({ cityCode: '01101' });
    assertApiResponse(r);
    assert.equal(r.data.cityName, '中央区');
    assert.equal(r.data.cityType, 'ward');
    assert.equal(r.data.parentCity, '01100');
    assert.equal(r.data.prefName, '北海道');
  });

  it('cityCode 14101 → 鶴見区（横浜市）parentCity付き', () => {
    const r = areaBridge({ cityCode: '14101' });
    assertApiResponse(r);
    assert.equal(r.data.cityName, '鶴見区');
    assert.equal(r.data.parentCity, '14100');
  });

  // ── 9-3: 名前による市区町村解決 ──

  it('name "八王子市" → 13201', () => {
    const r = areaBridge({ name: '八王子市' });
    assertApiResponse(r);
    assert.equal(r.data.cityCode, '13201');
    assert.equal(r.data.cityType, 'core_city');
  });

  it('name "横浜市" → 14100', () => {
    const r = areaBridge({ name: '横浜市' });
    assertApiResponse(r);
    assert.equal(r.data.cityCode, '14100');
    assert.equal(r.data.cityType, 'designated_city');
  });

  it('name "千代田区" → 13101（ユニーク名は直接解決）', () => {
    const r = areaBridge({ name: '千代田区' });
    assertApiResponse(r);
    assert.equal(r.data.cityCode, '13101');
    assert.equal(r.data.cityType, 'special_ward');
  });

  // ── 9-4: 重複名の disambiguation ──

  it('name "中央区" → 都道府県レベルにフォールバック（重複のため市区町村不解決）', () => {
    // 中央区は東京/札幌/さいたま/千葉/相模原/新潟/大阪/神戸/福岡 など多数
    // 直接 "中央区" では市区町村解決不能 → prefCodeも解決不能 → error
    const r = areaBridge({ name: '中央区' });
    // 中央区は nameIndex にない（重複のため） → prefCode解決もできない → error
    assert.equal(r.success, false);
  });

  it('name "東京都中央区" → 13102（都道府県プレフィックス付き）', () => {
    const r = areaBridge({ name: '東京都中央区' });
    assertApiResponse(r);
    assert.equal(r.data.cityCode, '13102');
  });

  it('name "札幌市中央区" → 01101（市プレフィックス付き）', () => {
    const r = areaBridge({ name: '札幌市中央区' });
    assertApiResponse(r);
    assert.equal(r.data.cityCode, '01101');
  });

  it('name "東京都府中市" → 13206', () => {
    const r = areaBridge({ name: '東京都府中市' });
    assertApiResponse(r);
    assert.equal(r.data.cityCode, '13206');
  });

  it('name "広島県府中市" → 34208', () => {
    const r = areaBridge({ name: '広島県府中市' });
    assertApiResponse(r);
    assert.equal(r.data.cityCode, '34208');
  });

  // ── 9-5: 都道府県解決は引き続き動作 ──

  it('name "東京都" → 都道府県レベル解決（cityCodeなし）', () => {
    const r = areaBridge({ name: '東京都' });
    assertApiResponse(r);
    assert.equal(r.data.prefCode, '13');
    assert.equal(r.data.name, '東京都');
    // 都道府県レベルではcityCodeは返らない
    assert.equal(r.data.cityCode, undefined);
  });

  it('prefCode "13" → 都道府県レベル解決', () => {
    const r = areaBridge({ prefCode: '13' });
    assertApiResponse(r);
    assert.equal(r.data.name, '東京都');
  });

  it('lat/lon → 都道府県レベル解決', () => {
    const r = areaBridge({ lat: 35.68, lon: 139.69 });
    assertApiResponse(r);
    assert.equal(r.data.prefCode, '13');
  });

  // ── 9-6: 市区町村タイプの網羅 ──

  it('designated_city: 名古屋市', () => {
    const r = areaBridge({ name: '名古屋市' });
    assertApiResponse(r);
    assert.equal(r.data.cityType, 'designated_city');
  });

  it('core_city: 金沢市', () => {
    const r = areaBridge({ name: '金沢市' });
    assertApiResponse(r);
    assert.equal(r.data.cityType, 'core_city');
  });

  it('town: 吉岡町(群馬県)', () => {
    const r = areaBridge({ cityCode: '10345' });
    assertApiResponse(r);
    assert.equal(r.data.cityName, '吉岡町');
    assert.equal(r.data.cityType, 'town');
  });

  // ── 9-7: 全47都道府県にcities存在 ──

  it('全47都道府県にcitiesデータあり', () => {
    for (let i = 1; i <= 47; i++) {
      const prefCode = String(i).padStart(2, '0');
      const r = areaBridge({ prefCode });
      assertApiResponse(r);
      assert.equal(r.data.prefCode, prefCode);
    }
  });

  // ── 9-8: 主要20政令指定都市の存在確認 ──

  const DESIGNATED_CITIES = [
    { name: '札幌市', prefCode: '01' },
    { name: '仙台市', prefCode: '04' },
    { name: 'さいたま市', prefCode: '11' },
    { name: '千葉市', prefCode: '12' },
    { name: '横浜市', prefCode: '14' },
    { name: '川崎市', prefCode: '14' },
    { name: '相模原市', prefCode: '14' },
    { name: '新潟市', prefCode: '15' },
    { name: '静岡市', prefCode: '22' },
    { name: '浜松市', prefCode: '22' },
    { name: '名古屋市', prefCode: '23' },
    { name: '京都市', prefCode: '26' },
    { name: '大阪市', prefCode: '27' },
    { name: '堺市', prefCode: '27' },
    { name: '神戸市', prefCode: '28' },
    { name: '岡山市', prefCode: '33' },
    { name: '広島市', prefCode: '34' },
    { name: '北九州市', prefCode: '40' },
    { name: '福岡市', prefCode: '40' },
    { name: '熊本市', prefCode: '43' },
  ];

  for (const { name, prefCode } of DESIGNATED_CITIES) {
    it(`政令指定都市: ${name} → designated_city (${prefCode})`, () => {
      const r = areaBridge({ name });
      assertApiResponse(r);
      assert.equal(r.data.cityType, 'designated_city', `${name} should be designated_city`);
      assert.equal(r.data.prefCode, prefCode, `${name} should be in pref ${prefCode}`);
    });
  }

  // ── 9-9: 東京23特別区 ──

  // 港区 is excluded: duplicate name (exists in Tokyo, Osaka, Nagoya)
  // 北区, 中央区 also excluded (duplicate)
  const SPECIAL_WARDS = [
    '千代田区', '新宿区', '文京区', '台東区', '墨田区',
    '江東区', '品川区', '目黒区', '大田区', '世田谷区', '渋谷区', '中野区',
    '杉並区', '豊島区', '荒川区', '板橋区', '練馬区', '足立区',
    '葛飾区', '江戸川区',
  ];

  for (const ward of SPECIAL_WARDS) {
    it(`東京特別区: ${ward} → special_ward`, () => {
      const r = areaBridge({ name: ward });
      assertApiResponse(r);
      assert.equal(r.data.cityType, 'special_ward', `${ward} should be special_ward`);
      assert.equal(r.data.prefCode, '13');
    });
  }

  // ── 9-10: カウント集計 ──

  it('市区町村の総数が1,700以上', async () => {
    const { createRequire } = await import('node:module');
    const req = createRequire(import.meta.url);
    const mapping = req('../../build/data/area-mapping.json');
    const count = Object.keys(mapping.cityIndex).length;
    assert.ok(count >= 1700, `Expected >= 1700 cities, got ${count}`);
  });
});
