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

// 사용법: node scripts/import-cast-schedule-wide.js 파일명.xlsx "연극제목" 시작일 종료일
const excelFileName = process.argv[2];
const playTitle = process.argv[3];
const startDate = process.argv[4];
const endDate = process.argv[5];

if (!excelFileName || !playTitle || !startDate || !endDate) {
  console.error('❌ 사용법: node scripts/import-cast-schedule-wide.js 파일명.xlsx "연극제목" 시작일 종료일');
  console.error('   예시: node scripts/import-cast-schedule-wide.js 갈매기_캐스팅일정.xlsx "갈매기" 2026-08-09 2026-08-31');
  process.exit(1);
}

const excelPath = path.join(process.cwd(), excelFileName);
if (!fs.existsSync(excelPath)) {
  console.error(`❌ 파일을 찾을 수 없어요: ${excelPath}`);
  process.exit(1);
}

const META_COLUMNS = ['공연날짜', '요일', '공연시간', '비고'];

function formatCellDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  return null;
}

function formatCellTime(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') {
    const totalMinutes = Math.round(value * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return null;
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

async function ensureCredit(playId, personId, characterName) {
  const { data: existing } = await supabase
    .from('play_credits')
    .select('id')
    .eq('play_id', playId)
    .eq('person_id', personId)
    .eq('role', '출연진')
    .eq('character_name', characterName)
    .maybeSingle();

  if (existing) return;

  const { error } = await supabase.from('play_credits').insert({
    play_id: playId,
    person_id: personId,
    role: '출연진',
    character_name: characterName
  });

  if (error) {
    console.error(`  ⚠️ 크레딧 등록 오류 (${characterName} - ${personId}):`, error.message);
  }
}

async function ensureSchedule(playId, date, time, personId) {
  const { data: existing } = await supabase
    .from('cast_schedule')
    .select('id')
    .eq('play_id', playId)
    .eq('performance_date', date)
    .eq('performance_time', time)
    .eq('person_id', personId)
    .maybeSingle();

  if (existing) return;

  const { error } = await supabase.from('cast_schedule').insert({
    play_id: playId,
    performance_date: date,
    performance_time: time,
    person_id: personId
  });

  if (error) {
    console.error(`  ⚠️ 일정 등록 오류 (${date} ${time || ''} - ${personId}):`, error.message);
  }
}

async function main() {
  // 1. 연극 찾기 (제목 + 기간으로 정확히 매칭)
  const { data: matched } = await supabase
    .from('plays')
    .select('id, title, start_date, end_date')
    .eq('title', playTitle);

  const play = (matched || []).find(p => p.start_date === startDate && p.end_date === endDate);

  if (!play) {
    console.error(`❌ "${playTitle}" (${startDate} ~ ${endDate})와 일치하는 연극을 찾을 수 없어요.`);
    console.error('   먼저 해당 연극이 정확한 제목/기간으로 등록되어 있는지 확인해주세요.');
    return;
  }

  console.log(`🎭 대상 연극: ${play.title} (${play.start_date} ~ ${play.end_date})\n`);

  // 2. 엑셀 읽기
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

  if (rows.length === 0) {
    console.log('데이터가 없어요.');
    return;
  }

  const roleColumns = Object.keys(rows[0]).filter(k => !META_COLUMNS.includes(k));
  console.log(`📋 배역 목록: ${roleColumns.join(', ')}\n`);

  // 3. 배역별 등장 배우 수집 + 회차별 캐스팅 정보 수집
  const actorsByRole = {}; // role -> Set(actorName)
  const scheduleEntries = []; // { date, time, role, actorName }

  for (const row of rows) {
    const date = formatCellDate(row['공연날짜']);
    const time = formatCellTime(row['공연시간']);
    const note = (row['비고'] || '').toString();

    if (!date || note.includes('공연없음') || !time) {
      continue; // 공연 없는 날은 건너뜀
    }

    for (const role of roleColumns) {
      const actorName = (row[role] || '').toString().trim();
      if (!actorName) continue;

      if (!actorsByRole[role]) actorsByRole[role] = new Set();
      actorsByRole[role].add(actorName);

      scheduleEntries.push({ date, time, role, actorName });
    }
  }

  // 4. 배역-배우 크레딧 등록 (person 생성/조회 + play_credits 연결)
  // 기존에 등록되어 있던 "출연진" 크레딧은 모두 지우고, 캐스팅표 내용으로 새로 채워요
  await supabase.from('play_credits').delete().eq('play_id', play.id).eq('role', '출연진');
  console.log('🗑 기존 출연진 정보를 지우고 캐스팅표 내용으로 새로 채워요.\n');

  const personIdCache = {}; // actorName -> personId

  for (const role of roleColumns) {
    const actors = [...(actorsByRole[role] || [])];
    console.log(`👤 [${role}] ${actors.join(', ') || '(등장 없음)'}`);

    for (const actorName of actors) {
      if (!personIdCache[actorName]) {
        personIdCache[actorName] = await findOrCreatePersonId(actorName);
      }
      const personId = personIdCache[actorName];
      if (!personId) continue;

      await ensureCredit(play.id, personId, role);
    }
  }

  console.log('\n🗓 회차별 캐스팅 일정 등록 중...');

  // 5. 회차별 일정 등록 (배역에 배우가 2명 이상일 때만 의미 있지만, 전부 등록해도 무방)
  let scheduleCount = 0;
  for (const entry of scheduleEntries) {
    const personId = personIdCache[entry.actorName];
    if (!personId) continue;
    await ensureSchedule(play.id, entry.date, entry.time, personId);
    scheduleCount++;
  }

  console.log(`\n🎉 완료! 배역 ${roleColumns.length}개, 일정 ${scheduleCount}건 처리했어요.`);
}

main();

