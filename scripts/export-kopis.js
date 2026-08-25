require('dotenv').config();
const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const apiKey = process.env.KOPIS_API_KEY;
const parser = new XMLParser();

// ===== 여기서 검색 조건을 원하는 대로 바꿔서 쓰세요 =====
const KEYWORD = process.argv[2] || '';   // 터미널에서 검색어를 입력받음 (없으면 전체)
const START_DATE = '20260101';           // 검색 시작일 (YYYYMMDD)
const END_DATE = '20261231';             // 검색 종료일 (YYYYMMDD)
const MAX_PAGES = 200;                     // 몇 페이지까지 가져올지 (1페이지 = 최대 20건)
// =====================================================

async function fetchList(page) {
  const params = new URLSearchParams({
    service: apiKey,
    stdate: START_DATE,
    eddate: END_DATE,
    cpage: String(page),
    rows: '20',
    shcate: 'AAAA'
  });
  if (KEYWORD) params.append('shprfnm', KEYWORD);

  const url = `http://www.kopis.or.kr/openApi/restful/pblprfr?${params.toString()}`;
  const res = await fetch(url);
  const xml = await res.text();
  const json = parser.parse(xml);

  console.log(`  [디버그] ${page}페이지 원본 응답 일부:`, JSON.stringify(json).slice(0, 300));

  let list = json?.dbs?.db || [];
  if (!Array.isArray(list)) list = [list];
  return list;
}

async function fetchDetail(id) {
  const url = `http://www.kopis.or.kr/openApi/restful/pblprfr/${id}?service=${apiKey}`;
  const res = await fetch(url);
  const xml = await res.text();
  const json = parser.parse(xml);
  return json?.dbs?.db || null;
}

function csvEscape(value) {
  if (value === undefined || value === null) return '';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

async function main() {
  if (!apiKey) {
    console.error('❌ .env 파일에 KOPIS_API_KEY가 설정되어 있지 않아요.');
    return;
  }

  console.log(`🔍 검색어: "${KEYWORD || '(전체)'}" / 기간: ${START_DATE} ~ ${END_DATE}`);

  let allItems = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const list = await fetchList(page);
    if (list.length === 0) break;
    allItems = allItems.concat(list);
    console.log(`  ${page}페이지: ${list.length}건 수집`);
  }

  console.log(`총 ${allItems.length}건의 공연 목록을 찾았어요. 상세 정보를 가져오는 중...`);

  const rows = [];
  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    const detail = await fetchDetail(item.mt20id);
    await new Promise(resolve => setTimeout(resolve, 200)); // 서버 부담 방지용 대기
    if (!detail) continue;

    rows.push({
      제목: detail.prfnm || '',
      시작일: detail.prfpdfrom || '',
      종료일: detail.prfpdto || '',
      장소: detail.fcltynm || '',
      장르: detail.genrenm || '',
      출연진_원본: detail.prfcast || '',
      제작진_원본: detail.prfcrew || '',
      관람연령: detail.prfage || '',
      런타임: detail.prfruntime || '',
      기획제작사: detail.entrpsnm || '',
      상태: detail.prfstate || '',
      포스터URL: detail.poster || '',
      KOPIS_ID: item.mt20id || ''
    });

    console.log(`  (${i + 1}/${allItems.length}) ${detail.prfnm}`);
  }

  if (rows.length === 0) {
    console.log('가져올 데이터가 없어요.');
    return;
  }

  const headers = Object.keys(rows[0]);
  const csvLines = [headers.join(',')];
  rows.forEach(row => {
    csvLines.push(headers.map(h => csvEscape(row[h])).join(','));
  });

  // 한글이 엑셀에서 깨지지 않도록 BOM 추가
  const csvContent = '\uFEFF' + csvLines.join('\n');
  fs.writeFileSync('kopis-export.csv', csvContent, 'utf8');

  console.log(`\n✅ 완료! "kopis-export.csv" 파일이 생성됐어요. 엑셀로 열어보세요.`);
}

main();