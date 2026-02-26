/**
 * 国会会議録検索 API Provider
 * 国立国会図書館
 * https://kokkai.ndl.go.jp/api.html
 * APIキー不要
 */

import { fetchJson, buildUrl, createError, CacheTTL } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

const BASE_URL = 'https://kokkai.ndl.go.jp/api';

/** 国会会議録 発言検索（本文あり） */
export async function searchKokkaiSpeeches(params: {
  any?: string;
  speaker?: string;
  nameOfHouse?: string;
  nameOfMeeting?: string;
  from?: string;
  until?: string;
  maximumRecords?: number;
  startRecord?: number;
  recordPacking?: string;
}): Promise<ApiResponse> {
  const url = buildUrl(`${BASE_URL}/speech`, {
    any: params.any,
    speaker: params.speaker,
    nameOfHouse: params.nameOfHouse,
    nameOfMeeting: params.nameOfMeeting,
    from: params.from,
    until: params.until,
    maximumRecords: params.maximumRecords || 20,
    startRecord: params.startRecord || 1,
    recordPacking: params.recordPacking || 'json',
  });
  return fetchJson(url, {
    source: '国会会議録/speech',
    cacheTtl: CacheTTL.SEARCH,
  });
}

/** 国会会議録 会議一覧検索（本文なし） */
export async function searchKokkaiMeetings(params: {
  any?: string;
  speaker?: string;
  nameOfHouse?: string;
  nameOfMeeting?: string;
  from?: string;
  until?: string;
  maximumRecords?: number;
  startRecord?: number;
  recordPacking?: string;
}): Promise<ApiResponse> {
  const url = buildUrl(`${BASE_URL}/meeting_list`, {
    any: params.any,
    speaker: params.speaker,
    nameOfHouse: params.nameOfHouse,
    nameOfMeeting: params.nameOfMeeting,
    from: params.from,
    until: params.until,
    maximumRecords: params.maximumRecords || 20,
    startRecord: params.startRecord || 1,
    recordPacking: params.recordPacking || 'json',
  });
  return fetchJson(url, {
    source: '国会会議録/meeting_list',
    cacheTtl: CacheTTL.SEARCH,
  });
}
