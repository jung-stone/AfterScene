// ===== 연극 등록/수정 페이지 (구 adminModal) =====
const params = new URLSearchParams(location.search);
const editingPlayId = params.get('playId'); // 없으면 신규 등록 모드

async function initAdminPage() {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) {
    alert('관리자만 이용할 수 있어요.');
    location.href = 'index.html';
    return;
  }

  const submitBtn = document.getElementById('adminSubmitBtn');
  const deleteBtn = document.getElementById('adminDeletePlayBtn');
  const castScheduleLink = document.getElementById('openCastScheduleBtn');

  if (!editingPlayId) {
    // 신규 등록 모드: 빈 폼
    document.getElementById('adminFormTitle').textContent = '새 연극 등록';
    submitBtn.textContent = '등록하기';
    deleteBtn.classList.add('hidden');
    castScheduleLink.classList.add('hidden');
    return;
  }

  // 수정 모드: 기존 연극 정보 불러오기
  const { data: play } = await supabaseClient
    .from('plays')
    .select('*')
    .eq('id', editingPlayId)
    .single();

  if (!play) {
    alert('연극 정보를 찾을 수 없어요.');
    location.href = 'index.html';
    return;
  }

  document.getElementById('adminFormTitle').textContent = '연극 정보 수정';
  document.getElementById('adminTitle').value = play.title || '';
  document.getElementById('adminPoster').value = play.poster_url || '';
  document.getElementById('adminVenue').value = play.venue || '';
  document.getElementById('adminGenre').value = play.genre || '기타';
  document.getElementById('adminDescription').value = play.description || '';
  document.getElementById('adminStartDate').value = play.start_date || '';
  document.getElementById('adminEndDate').value = play.end_date || '';
  submitBtn.textContent = '수정 완료';
  deleteBtn.classList.remove('hidden');
  castScheduleLink.href = `cast-schedule.html?playId=${encodeURIComponent(editingPlayId)}`;
  castScheduleLink.classList.remove('hidden');
  document.getElementById('castScheduleSectionTitle').classList.remove('hidden');

  const { data: credits } = await supabaseClient
    .from('play_credits')
    .select('role, people(name)')
    .eq('play_id', editingPlayId);

  const grouped = {};
  (credits || []).forEach(c => {
    if (!c.people) return;
    if (!grouped[c.role]) grouped[c.role] = [];
    grouped[c.role].push(c.people.name);
  });

  document.getElementById('adminWriter').value = (grouped['작'] || []).join(', ');
  document.getElementById('adminDirector').value = (grouped['연출'] || []).join(', ');
  document.getElementById('adminAdaptation').value = (grouped['각색'] || []).join(', ');
  document.getElementById('adminCast').value = (grouped['출연진'] || []).join(', ');
  document.getElementById('adminPlan').value = (grouped['기획'] || []).join(', ');
  document.getElementById('adminProduction').value = (grouped['제작'] || []).join(', ');
  document.getElementById('adminHost').value = (grouped['주최'] || []).join(', ');
  document.getElementById('adminSupervisor').value = (grouped['주관'] || []).join(', ');
}

async function findOrCreatePersonId(name) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const { data: existing } = await supabaseClient
    .from('people')
    .select('id')
    .eq('name', trimmed)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabaseClient
    .from('people')
    .insert({ name: trimmed })
    .select()
    .single();

  if (error) {
    console.error('인물 생성 오류:', error);
    return null;
  }
  return created.id;
}

async function findOrCreateVenueId(name) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const { data: existing } = await supabaseClient
    .from('venues')
    .select('id')
    .eq('name', trimmed)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabaseClient
    .from('venues')
    .insert({ name: trimmed })
    .select()
    .single();

  if (error) {
    console.error('극장 생성 오류:', error);
    return null;
  }
  return created.id;
}

async function saveCredits(playId) {
  const roleFields = {
    '작': 'adminWriter',
    '연출': 'adminDirector',
    '각색': 'adminAdaptation',
    '출연진': 'adminCast',
    '기획': 'adminPlan',
    '제작': 'adminProduction',
    '주최': 'adminHost',
    '주관': 'adminSupervisor'
  };

  await supabaseClient.from('play_credits').delete().eq('play_id', playId);

  for (const role in roleFields) {
    const raw = document.getElementById(roleFields[role]).value.trim();
    if (!raw) continue;
    const names = raw.split(',').map(n => n.trim()).filter(n => n);

    for (const name of names) {
      const personId = await findOrCreatePersonId(name);
      if (!personId) continue;
      await supabaseClient.from('play_credits').insert({
        play_id: playId,
        person_id: personId,
        role: role
      });
    }
  }
}

function setupAdminForm() {
  const submitBtn = document.getElementById('adminSubmitBtn');
  const errorText = document.getElementById('adminError');
  const deleteBtn = document.getElementById('adminDeletePlayBtn');

  submitBtn.addEventListener('click', async () => {
    errorText.textContent = '';

    const title = document.getElementById('adminTitle').value.trim();
    const poster = document.getElementById('adminPoster').value.trim();
    const venue = document.getElementById('adminVenue').value.trim();
    const genre = document.getElementById('adminGenre').value;
    const description = document.getElementById('adminDescription').value.trim();
    const startDate = document.getElementById('adminStartDate').value;
    const endDate = document.getElementById('adminEndDate').value;

    if (!title) {
      errorText.textContent = '연극 제목은 필수예요.';
      return;
    }

    const venueId = venue ? await findOrCreateVenueId(venue) : null;

    const playData = {
      title,
      genre,
      poster_url: poster || null,
      venue: venue || null,
      venue_id: venueId,
      description: description || null,
      start_date: startDate || null,
      end_date: endDate || null
    };

    let error;
    let targetPlayId = editingPlayId;

    if (editingPlayId) {
      ({ error } = await supabaseClient.from('plays').update(playData).eq('id', editingPlayId));
    } else {
      const { data: newPlay, error: insertError } = await supabaseClient
        .from('plays')
        .insert(playData)
        .select()
        .single();
      error = insertError;
      if (newPlay) targetPlayId = newPlay.id;
    }

    if (error) {
      errorText.textContent = (editingPlayId ? '수정' : '등록') + ' 중 오류: ' + error.message;
      return;
    }

    if (targetPlayId) {
      await saveCredits(targetPlayId);
    }

    alert(editingPlayId ? '연극 정보가 수정되었어요!' : '연극이 등록되었어요!');
    location.href = `review.html?playId=${encodeURIComponent(targetPlayId)}`;
  });

  deleteBtn.addEventListener('click', async () => {
    if (!editingPlayId) return;

    const titleInput = document.getElementById('adminTitle').value.trim();
    const playTitle = titleInput || '이 연극';

    const confirmText = prompt(`정말 "${playTitle}"을(를) 삭제하시겠어요?\n연결된 후기, 댓글, 좋아요, 캐스팅 정보도 모두 함께 삭제되며 되돌릴 수 없어요.\n\n삭제하시려면 아래에 "삭제"라고 입력해주세요.`);

    if (confirmText !== '삭제') {
      if (confirmText !== null) {
        alert('입력이 일치하지 않아 삭제가 취소되었어요.');
      }
      return;
    }

    const { error } = await supabaseClient.from('plays').delete().eq('id', editingPlayId);

    if (error) {
      errorText.textContent = '삭제 중 오류: ' + error.message;
      return;
    }

    alert('연극이 삭제되었어요.');
    location.href = 'index.html';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupAdminForm();
  initAdminPage();
});
