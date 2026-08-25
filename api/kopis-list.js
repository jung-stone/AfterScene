const { XMLParser } = require('fast-xml-parser');

module.exports = async function handler(req, res) {
  try {
    const apiKey = process.env.KOPIS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'KOPIS_API_KEY가 설정되지 않았어요.' });
    }

    const keyword = req.query.keyword || '';
    const page = req.query.page || '1';

    // 검색 기간: 오늘 기준 1년 전 ~ 1년 후
    const today = new Date();
    const past = new Date(today);
    past.setFullYear(past.getFullYear() - 1);
    const future = new Date(today);
    future.setFullYear(future.getFullYear() + 1);

    const formatDate = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
    const stdate = formatDate(past);
    const eddate = formatDate(future);

    const params = new URLSearchParams({
      service: apiKey,
      stdate,
      eddate,
      cpage: page,
      rows: '20'
    });

    if (keyword) params.append('shprfnm', keyword);

    const kopisUrl = `http://www.kopis.or.kr/openApi/restful/pblprfr?${params.toString()}`;

    const response = await fetch(kopisUrl);
    const xmlText = await response.text();

    const parser = new XMLParser();
    const jsonData = parser.parse(xmlText);

    let list = jsonData?.dbs?.db || [];
    if (!Array.isArray(list)) list = [list]; // 결과가 1개면 배열이 아니라 객체로 오기 때문에 보정

    res.status(200).json({ list });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '공연 목록을 불러오는 중 오류가 발생했어요.' });
  }
};