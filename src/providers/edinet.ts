/**
 * EDINET API Provider
 * 金融庁 - 有価証券報告書等の開示情報
 * https://disclosure2.edinet-fsa.go.jp/
 *
 * API Version: 2
 */

import { fetchJson, buildUrl } from '../utils/http.js';

const BASE_URL = 'https://api.edinet-fsa.go.jp/api/v2';

export interface EdinetConfig {
  apiKey: string;
}

/** 書類一覧取得 - 指定日の開示書類一覧 */
export async function getDocumentList(config: EdinetConfig, params: {
  date: string;         // YYYY-MM-DD
  type?: number;        // 1:メタデータのみ 2:書類一覧+メタデータ
}) {
  const url = buildUrl(`${BASE_URL}/documents.json`, {
    date: params.date,
    type: params.type || 2,
    'Subscription-Key': config.apiKey,
  });
  return fetchJson(url, { source: 'EDINET/documents' });
}

/** 書類取得 - docIDで個別書類のメタデータ取得 */
export async function getDocument(config: EdinetConfig, params: {
  docId: string;
  type?: number;        // 1:提出本文 2:PDF 3:代替書面 4:英文 5:CSV
}) {
  const url = buildUrl(`${BASE_URL}/documents/${params.docId}`, {
    type: params.type || 1,
    'Subscription-Key': config.apiKey,
  });
  return fetchJson(url, { source: 'EDINET/document' });
}
