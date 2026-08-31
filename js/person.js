// ===== 인물 상세 페이지 (구 personModal) =====
const params = new URLSearchParams(location.search);
const personId = params.get('id');

async function initPersonPage() {
  if (!personId) {
    alert('인물 정보를 찾을 수 없어요.');
    location.href = 'index.html';
    return;
  }

  document.getElementById('personName').textContent = '불러오는 중...';
  document.getElementById('personAvgRating').textContent = '';
  document.getElementById('personBio').textContent = '';
  document.getElementById('personPlayList').innerHTML = '';
  document.getElementById('personBioEditBox').classList.add('hidden');

  const { data: person } = await supabaseClient
    .from('people')
    .select('*')
    .eq('id', personId)
    .single();

  if (!person) {
    document.getElementById('personName').textContent = '인물을 찾을 수 없어요.';
    return;
  }

  document.getElementById('personName').textContent = person.name;
  document.getElementById('personBio').textContent = person.bio || '아직 소개가 없어요.';
  setupFollowButton('person', personId);

  const { data: credits } = await supabaseClient
    .from('play_credits')
    .select('role, plays(id, title, poster_url)')
    .eq('person_id', personId);

  const listEl = document.getElementById('personPlayList');
  const playIds = [...new Set((credits || []).filter(c => c.plays).map(c => c.plays.id))];

  if (playIds.length > 0) {
    const { data: myCastCredits } = await supabaseClient
      .from('play_credits')
      .select('play_id, character_name')
      .eq('person_id', personId)
      .eq('role', '출연진')
      .in('play_id', playIds);

    const { data: allCastCredits } = await supabaseClient
      .from('play_credits')
      .select('play_id, person_id, character_name')
      .in('play_id', playIds)
      .eq('role', '출연진');

    const roleGroups = {};
    (allCastCredits || []).forEach(c => {
      const key = c.character_name || 'UNSPECIFIED';
      if (!roleGroups[c.play_id]) roleGroups[c.play_id] = {};
      if (!roleGroups[c.play_id][key]) roleGroups[c.play_id][key] = new Set();
      roleGroups[c.play_id][key].add(c.person_id);
    });

    function isMultiCastForPerson(playId) {
      const myCredit = (myCastCredits || []).find(c => c.play_id === playId);
      const key = myCredit ? (myCredit.character_name || 'UNSPECIFIED') : 'UNSPECIFIED';
      const group = roleGroups[playId] && roleGroups[playId][key];
      return group && group.size > 1;
    }

    const { data: reviews } = await supabaseClient
      .from('reviews')
      .select('rating, play_id, watched_date, watched_time')
      .in('play_id', playIds);

    const { data: allSchedules } = await supabaseClient
      .from('cast_schedule')
      .select('play_id, performance_date, performance_time, person_id')
      .in('play_id', playIds);

    const allScheduleKeys = new Set(
      (allSchedules || []).map(s => `${s.play_id}_${s.performance_date}_${s.performance_time || ''}`)
    );
    const myScheduleKeys = new Set(
      (allSchedules || [])
        .filter(s => s.person_id === personId)
        .map(s => `${s.play_id}_${s.performance_date}_${s.performance_time || ''}`)
    );

    const relevantRatings = (reviews || [])
      .filter(r => {
        const isSingleCast = !isMultiCastForPerson(r.play_id);
        if (isSingleCast) return true;

        const key = `${r.play_id}_${r.watched_date || ''}_${r.watched_time || ''}`;
        const hasScheduleForThatDate = allScheduleKeys.has(key);

        if (hasScheduleForThatDate) {
          return myScheduleKeys.has(key);
        } else {
          return true;
        }
      })
      .map(r => r.rating);

    if (relevantRatings.length > 0) {
      const avg = relevantRatings.reduce((s, r) => s + r, 0) / relevantRatings.length;
      document.getElementById('personAvgRating').textContent = `⭐ ${avg.toFixed(1)} (관람객 평균, ${relevantRatings.length}건)`;
    } else {
      document.getElementById('personAvgRating').textContent = '';
    }
  }

  if (!credits || credits.length === 0) {
    listEl.innerHTML = `<p class="placeholder-text">참여한 작품 정보가 없어요.</p>`;
  } else {
    listEl.innerHTML = credits.filter(c => c.plays).map(c => `
      <div class="person-play-card" data-play-id="${c.plays.id}">
        <img src="${c.plays.poster_url || 'https://placehold.co/300x450/22252d/f5f5f5?text=No+Image'}" alt="${c.plays.title}" />
        <div>
          <div class="person-play-title">${c.plays.title}</div>
          <div class="person-play-role">${c.role}</div>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.person-play-card').forEach(card => {
      card.addEventListener('click', () => {
        location.href = `review.html?playId=${encodeURIComponent(card.dataset.playId)}`;
      });
    });
  }

  await loadCoCastList(personId, credits);

  const isAdmin = await isCurrentUserAdmin();
  if (isAdmin) {
    document.getElementById('personBioEditBox').classList.remove('hidden');
    document.getElementById('personBioInput').value = person.bio || '';
    document.getElementById('personBioSaveBtn').onclick = async () => {
      const newBio = document.getElementById('personBioInput').value.trim();
      await supabaseClient.from('people').update({ bio: newBio }).eq('id', personId);
      document.getElementById('personBio').textContent = newBio || '아직 소개가 없어요.';
      alert('소개가 저장되었어요.');
    };
  }
}

// ===== 공동출연: 같은 연극에 함께 출연한 배우들 =====
async function loadCoCastList(personId, credits) {
  const section = document.getElementById('personCoCastSection');
  const box = document.getElementById('personCoCast');

  const castPlayIds = (credits || [])
    .filter(c => c.role === '출연진' && c.plays)
    .map(c => c.plays.id);

  if (castPlayIds.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  box.innerHTML = `<p class="placeholder-text">불러오는 중...</p>`;

  const { data: coCastCredits } = await supabaseClient
    .from('play_credits')
    .select('person_id, people(id, name)')
    .eq('role', '출연진')
    .in('play_id', castPlayIds);

  const coCount = {};
  (coCastCredits || []).forEach(c => {
    if (!c.people || c.person_id === personId) return;
    if (!coCount[c.person_id]) coCount[c.person_id] = { id: c.person_id, name: c.people.name, count: 0 };
    coCount[c.person_id].count += 1;
  });

  const coList = Object.values(coCount).sort((a, b) => b.count - a.count).slice(0, 5);

  if (coList.length === 0) {
    box.innerHTML = `<p class="placeholder-text">아직 함께 출연한 배우 데이터가 없어요.</p>`;
    return;
  }

  box.innerHTML = coList.map((c, i) => `
    <div class="taste-rank-item trending-rank-item" data-nav="person.html?id=${encodeURIComponent(c.id)}">
      <span class="taste-rank-num">${i + 1}</span>
      <span class="taste-rank-name">${c.name}</span>
      <span class="taste-rank-count">${c.count}작품</span>
    </div>
  `).join('');

  box.querySelectorAll('.trending-rank-item').forEach(el => {
    el.addEventListener('click', () => {
      location.href = el.dataset.nav;
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initPersonPage();
});
