const { XMLParser } = require('fast-xml-parser');

module.exports = async function handler(req, res) {
  try {
    const apiKey = process.env.KOPIS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'KOPIS_API_KEY가 설정되지 않았어요.' });
    }

    const id = req.query.id;
    if (!id) {
      return res.status(400).json({ error: '공연 ID(mt20id)가 필요해요.' });
    }

    const kopisUrl = `http://www.kopis.or.kr/openApi/restful/pblprfr/${id}?service=${apiKey}`;

    const response = await fetch(kopisUrl);
    const xmlText = await response.text();

    const parser = new XMLParser();
    const jsonData = parser.parse(xmlText);

    const detail = jsonData?.dbs?.db || null;

    if (!detail) {
      return res.status(404).json({ error: '해당 공연 정보를 찾을 수 없어요.' });
    }

    res.status(200).json({ detail });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '공연 상세 정보를 불러오는 중 오류가 발생했어요.' });
  }
};