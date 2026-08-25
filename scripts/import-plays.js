require('dotenv').config();
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ .env에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY를 설정해주세요.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const excelFileName = process.argv[2] || 'plays-import.xlsx';
const excelPath = path.join(process.cwd(), excelFileName);

if (!fs.existsSync(excelPath)) {
  console.error(`❌ 파일을 찾을 수 없어요: ${excelPath}`);
  process.exit(1);
}

async function findOrCreateVenueId(name) {
  const trimmed = (name || '').toString().trim();
  if (!trimmed) return null;

  const { data: existing } = await supabase
    .from('venues')
    .select('id')
    .eq('name', trimmed)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('venues')
    .insert({ name: trimmed })
    .select()
    .single();

  if (error) {
    console.error('  ⚠️ 극장 생성 오류:', error.message);
    return null;
  }
  return created.id;
}

async function findOrCreatePersonId(name) {
  const trimmed = (name || '').toString().trim();
  if (!trimmed) return null;

  const { data: existing } = await supabase
    .from('people')
    .select('id')
    .eq('name', trimmed)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('people')
    .insert({ name: trimmed })
    .select()
    .single();

  if (error) {
    console.error('  ⚠️ 인물 생성 오류:', error.message);
    return null;
  }
  return created.id;
}

async function saveCredits(playId, row) {
  const roleFields = {
    '작': row['작'],
    '연출': row['연출'],
    '각색': row['각색'],
    '출연진': row['출연진'],
    '기획': row['기획'],
    '제작': row['제작'],
    '주최': row['주최'],
    '주관': row['주관']
  };

  await supabase.from('play_credits').delete().eq('play_id', playId);

  for (const role in roleFields) {
    const raw = (roleFields[role] || '').toString().trim();
    if (!raw) continue;
    const names = raw.split(',').map(n => n.trim()).filter(n => n);

    for (const name of names) {
      const personId = await findOrCreatePersonId(name);
      if (!personId) continue;
      await supabase.from('play_credits').insert({
        play_id: playId,
        person_id: personId,
        role: role
      });
    }
  }
}

function formatExcelDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;

  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    const mm = String(date.m).padStart(2, '0');
    const dd = String(date.d).padStart(2, '0');
    return `${date.y}-${mm}-${dd}`;
  }

  return null;
}

async function main() {
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  console.log(`📄 총 ${rows.length}개의 연극 데이터를 읽었어요. (시트: ${sheetName})\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const title = (row['제목'] || '').toString().trim();

    if (!title) {
      console.log(`  (${i + 1}) ⚠️ 제목이 없어서 건너뜁니다.`);
      continue;
    }

    console.log(`(${i + 1}/${rows.length}) "${title}" 처리 중...`);

    const venueName = (row['장소'] || '').toString().trim();
    const venueId = venueName ? await findOrCreateVenueId(venueName) : null;

    const playData = {
      title,
      genre: (row['장르'] || '기타').toString().trim(),
      poster_url: (row['포스터URL'] || '').toString().trim() || null,
      venue: venueName || null,
      venue_id: venueId,
      description: (row['설명'] || '').toString().trim() || null,
      start_date: formatExcelDate(row['시작일']),
      end_date: formatExcelDate(row['종료일'])
    };

    const { data: sameTitlePlays } = await supabase
      .from('plays')
      .select('id, start_date, end_date')
      .eq('title', title);

    const existingPlay = (sameTitlePlays || []).find(p =>
      p.start_date === playData.start_date && p.end_date === playData.end_date
    );

    let playId;

    if (existingPlay) {
      const { error } = await supabase.from('plays').update(playData).eq('id', existingPlay.id);
      if (error) {
        console.log(`  ❌ 수정 실패: ${error.message}`);
        failCount++;
        continue;
      }
      playId = existingPlay.id;
      console.log(`  ✏️ 기존 연극 정보 수정 완료`);
    } else {
      const { data: newPlay, error } = await supabase.from('plays').insert(playData).select().single();
      if (error) {
        console.log(`  ❌ 등록 실패: ${error.message}`);
        failCount++;
        continue;
      }
      playId = newPlay.id;
      console.log(`  ✅ 새 연극 등록 완료`);
    }

    await saveCredits(playId, row);
    successCount++;
  }

  console.log(`\n🎉 완료! 성공 ${successCount}건 / 실패 ${failCount}건`);
}

main();