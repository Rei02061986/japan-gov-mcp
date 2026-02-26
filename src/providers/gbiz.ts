/**
 * gBizINFO REST API Provider
 * 経済産業省 - 法人インフォメーション
 * https://info.gbiz.go.jp/
 *
 * 法人の基本情報、届出認定、補助金、特許、調達、財務、表彰、職場情報
 */

import { fetchJson, buildUrl } from '../utils/http.js';

const BASE_URL = 'https://info.gbiz.go.jp/hojin/v1';

export interface GbizConfig {
  token: string;
}

function gbizHeaders(config: GbizConfig) {
  return { 'Accept': 'application/json', 'X-hojinInfo-api-token': config.token };
}

/** 法人基本情報検索 */
export async function searchCorporation(config: GbizConfig, params: {
  name?: string;
  corporateNumber?: string;
  prefectureCode?: string;
  cityCode?: string;
  page?: number;
}) {
  if (params.corporateNumber) {
    return fetchJson(`${BASE_URL}/hojin/${params.corporateNumber}`, {
      headers: gbizHeaders(config), source: 'gBizINFO/hojin',
    });
  }
  const url = buildUrl(`${BASE_URL}/hojin`, {
    name: params.name,
    prefecture: params.prefectureCode,
    city: params.cityCode,
    page: params.page || 1,
  });
  return fetchJson(url, { headers: gbizHeaders(config), source: 'gBizINFO/search' });
}

/** 届出・認定情報 */
export async function getCertification(config: GbizConfig, corporateNumber: string) {
  return fetchJson(`${BASE_URL}/hojin/${corporateNumber}/certification`, {
    headers: gbizHeaders(config), source: 'gBizINFO/certification',
  });
}

/** 補助金情報 */
export async function getSubsidy(config: GbizConfig, corporateNumber: string) {
  return fetchJson(`${BASE_URL}/hojin/${corporateNumber}/subsidy`, {
    headers: gbizHeaders(config), source: 'gBizINFO/subsidy',
  });
}

/** 特許情報 */
export async function getPatent(config: GbizConfig, corporateNumber: string) {
  return fetchJson(`${BASE_URL}/hojin/${corporateNumber}/patent`, {
    headers: gbizHeaders(config), source: 'gBizINFO/patent',
  });
}

/** 調達情報 */
export async function getProcurement(config: GbizConfig, corporateNumber: string) {
  return fetchJson(`${BASE_URL}/hojin/${corporateNumber}/procurement`, {
    headers: gbizHeaders(config), source: 'gBizINFO/procurement',
  });
}

/** 財務情報 */
export async function getFinance(config: GbizConfig, corporateNumber: string) {
  return fetchJson(`${BASE_URL}/hojin/${corporateNumber}/finance`, {
    headers: gbizHeaders(config), source: 'gBizINFO/finance',
  });
}

/** 表彰情報 */
export async function getCommendation(config: GbizConfig, corporateNumber: string) {
  return fetchJson(`${BASE_URL}/hojin/${corporateNumber}/commendation`, {
    headers: gbizHeaders(config), source: 'gBizINFO/commendation',
  });
}

/** 職場情報 */
export async function getWorkplace(config: GbizConfig, corporateNumber: string) {
  return fetchJson(`${BASE_URL}/hojin/${corporateNumber}/workplace`, {
    headers: gbizHeaders(config), source: 'gBizINFO/workplace',
  });
}
