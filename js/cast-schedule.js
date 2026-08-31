// ===== 회차별 캐스팅 일정 관리 페이지 (구 castScheduleModal) =====
const params = new URLSearchParams(location.search);
const playId = params.get('playId');

async function initCastSchedulePage() {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) {
    alert('관리자만 이용할 수 있어요.');
    location.href = 'index.html';
    return;
  }

  if (!playId) {
    alert('먼저 연극을 등록/저장한 뒤 "연극 정보 수정"에서 다시 열어서 이용해주세요.');
    location.href = 'admin.html';
    return;
  }

  const { data: credits } = await supabaseClient
    .from('play_credits')
    .select('person_id, people(id, name)')
    .eq('play_id', playId)
    .eq('role', '출연진');

  const actors = (credits || []).filter(c => c.people).map(c => c.people);
  const actorSelect = document.getElementById('scheduleActorSelect');

  if (actors.length === 0) {
    actorSelect.innerHTML = `<option value="">출연진이 등록되어 있지 않아요</option>`;
  } else {
    actorSelect.innerHTML = actors.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  }

  loadCastScheduleList(playId);
}

async function loadCastScheduleList(playId) {
  const listEl = document.getElementById('castScheduleList');
  listEl.innerHTML = `<p class="placeholder-text">불러오는 중...</p>`;

  const { data: schedules } = await supabaseClient
    .from('cast_schedule')
    .select('id, performance_date, performance_time, people(name)')
    .eq('play_id', playId)
    .order('performance_date', { ascending: true });

  if (!schedules || schedules.length === 0) {
    listEl.innerHTML = `<p class="placeholder-text">등록된 일정이 없어요.</p>`;
    return;
  }

  listEl.innerHTML = schedules.map(s => `
    <div class="schedule-item">
      <span>${s.performance_date} ${s.performance_time || ''} — ${s.people ? s.people.name : '삭제된 배우'}</span>
      <button class="schedule-delete-btn" data-id="${s.id}">삭제</button>
    </div>
  `).join('');

  listEl.querySelectorAll('.schedule-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await supabaseClient.from('cast_schedule').delete().eq('id', btn.dataset.id);
      loadCastScheduleList(playId);
    });
  });
}

function setupCastScheduleForm() {
  document.getElementById('scheduleAddBtn').addEventListener('click', async () => {
    const errorText = document.getElementById('castScheduleError');
    errorText.textContent = '';

    if (!playId) return;

    const date = document.getElementById('scheduleDateInput').value;
    const time = document.getElementById('scheduleTimeInput').value.trim() || null;
    const personId = document.getElementById('scheduleActorSelect').value;

    if (!date || !personId) {
      errorText.textContent = '날짜와 배우를 모두 선택해주세요.';
      return;
    }

    const { error } = await supabaseClient.from('cast_schedule').insert({
      play_id: playId,
      performance_date: date,
      performance_time: time,
      person_id: personId
    });

    if (error) {
      errorText.textContent = '추가 중 오류: ' + error.message;
      return;
    }

    document.getElementById('scheduleDateInput').value = '';
    document.getElementById('scheduleTimeInput').value = '';
    loadCastScheduleList(playId);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupCastScheduleForm();
  initCastSchedulePage();
});
