// ===== 마이페이지 (구 myPageModal) =====
let myUserId = null;

async function initMyPage() {
  const user = await requireLogin('로그인 후 이용해주세요.');
  if (!user) return;

  myUserId = user.id;
  document.getElementById('myPageEmail').textContent = user.email;
  loadMyStats(user.id);
  loadMyFollows(user.id);
  loadMyReviews(user.id);
}

// ===== 팔로우한 배우 · 공연장 (+ 최신 소식) =====
function playStatusLabel(play) {
  const today = new Date().toISOString().slice(0, 10);
  if (!play.start_date && !play.end_date) return '';
  if (play.start_date && play.start_date > today) return '🔜 공연예정';
  if (play.end_date && play.end_date < today) return '🔚 공연종료';
  return '🎭 공연중';
}

function pickLatestPlay(plays) {
  if (!plays || plays.length === 0) return null;
  return [...plays].sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))[0];
}

async function loadMyFollows(userId) {
  const container = document.getElementById('myFollowList');
  container.innerHTML = `<p class="placeholder-text">불러오는 중...</p>`;

  const { data: follows, error } = await supabaseClient
    .from('follows')
    .select('entity_type, entity_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<p class="placeholder-text">팔로우 목록을 불러오지 못했어요.</p>`;
    return;
  }

  if (!follows || follows.length === 0) {
    container.innerHTML = `<p class="placeholder-text">아직 팔로우한 배우·공연장이 없어요. 마음에 드는 배우나 공연장 페이지에서 팔로우해보세요!</p>`;
    return;
  }

  const personIds = follows.filter(f => f.entity_type === 'person').map(f => f.entity_id);
  const venueIds = follows.filter(f => f.entity_type === 'venue').map(f => f.entity_id);

  const [{ data: people }, { data: venues }] = await Promise.all([
    personIds.length
      ? supabaseClient.from('people').select('id, name').in('id', personIds)
      : Promise.resolve({ data: [] }),
    venueIds.length
      ? supabaseClient.from('venues').select('id, name').in('id', venueIds)
      : Promise.resolve({ data: [] })
  ]);

  const nameByPersonId = {};
  (people || []).forEach(p => { nameByPersonId[p.id] = p.name; });
  const nameByVenueId = {};
  (venues || []).forEach(v => { nameByVenueId[v.id] = v.name; });

  const creditsByPerson = {};
  if (personIds.length) {
    const { data: credits } = await supabaseClient
      .from('play_credits')
      .select('person_id, plays(id, title, start_date, end_date)')
      .eq('role', '출연진')
      .in('person_id', personIds);

    (credits || []).forEach(c => {
      if (!c.plays) return;
      if (!creditsByPerson[c.person_id]) creditsByPerson[c.person_id] = [];
      creditsByPerson[c.person_id].push(c.plays);
    });
  }

  const playsByVenue = {};
  if (venueIds.length) {
    const { data: venuePlays } = await supabaseClient
      .from('plays')
      .select('id, title, start_date, end_date, venue_id')
      .in('venue_id', venueIds);

    (venuePlays || []).forEach(p => {
      if (!playsByVenue[p.venue_id]) playsByVenue[p.venue_id] = [];
      playsByVenue[p.venue_id].push(p);
    });
  }

  container.innerHTML = follows.map(f => {
    const isPerson = f.entity_type === 'person';
    const name = isPerson ? nameByPersonId[f.entity_id] : nameByVenueId[f.entity_id];
    if (!name) return '';

    const latest = isPerson ? pickLatestPlay(creditsByPerson[f.entity_id]) : pickLatestPlay(playsByVenue[f.entity_id]);
    const newsHtml = latest
      ? `<span class="follow-news">${playStatusLabel(latest)} · ${latest.title}</span>`
      : `<span class="follow-news follow-news-empty">최근 소식이 없어요</span>`;

    return `
      <div class="follow-item" data-type="${f.entity_type}" data-id="${f.entity_id}">
        <span class="follow-type-badge">${isPerson ? '배우' : '공연장'}</span>
        <span class="follow-name">${name}</span>
        ${newsHtml}
      </div>
    `;
  }).join('');

  container.querySelectorAll('.follow-item').forEach(el => {
    el.addEventListener('click', () => {
      const page = el.dataset.type === 'person' ? 'person.html' : 'venue.html';
      location.href = `${page}?id=${encodeURIComponent(el.dataset.id)}`;
    });
  });
}

async function loadMyReviews(userId) {
  const listContainer = document.getElementById('myReviewList');
  const countEl = document.getElementById('myReviewCount');

  const { data: reviews, error } = await supabaseClient
    .from('reviews')
    .select('*, plays(title, poster_url)')
    .eq('user_id', userId)
    .order('watched_date', { ascending: false, nullsFirst: false });

  if (error) {
    listContainer.innerHTML = `<p class="placeholder-text">후기를 불러오지 못했어요.</p>`;
    return;
  }

  countEl.textContent = reviews.length;

  if (reviews.length === 0) {
    listContainer.innerHTML = `<p class="placeholder-text">아직 작성한 후기가 없어요. 마음에 든 연극에 후기를 남겨보세요!</p>`;
    return;
  }

  listContainer.innerHTML = reviews.map(review => {
    const playTitle = review.plays ? review.plays.title : '삭제된 연극';
    const posterUrl = review.plays && review.plays.poster_url
      ? review.plays.poster_url
      : 'https://placehold.co/300x450/22252d/f5f5f5?text=No+Image';
    const watchedDateText = review.watched_date
      ? `🎭 ${review.watched_date} 관람`
      : new Date(review.created_at).toLocaleDateString('ko-KR') + ' 작성';

    return `
      <div class="my-review-card" data-review-id="${review.id}">
        <img class="my-review-poster" src="${posterUrl}" alt="${playTitle}" />
        <div class="my-review-content">
          <div class="my-review-date">${watchedDateText}</div>
          <div class="my-review-play-title">${playTitle}</div>
          <div class="my-review-rating">⭐ ${review.rating.toFixed(1)}</div>
          <div class="my-review-one-line">${review.one_line_review}</div>
          <div class="my-review-actions">
            <button class="edit-btn" data-review-id="${review.id}" data-play-id="${review.play_id}">수정</button>
            <button class="delete-btn" data-review-id="${review.id}">삭제</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  listContainer.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      location.href = `review.html?playId=${encodeURIComponent(btn.dataset.playId)}&edit=${encodeURIComponent(btn.dataset.reviewId)}`;
    });
  });

  listContainer.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('정말 이 후기를 삭제하시겠어요?')) return;

      const { error } = await supabaseClient
        .from('reviews')
        .delete()
        .eq('id', btn.dataset.reviewId);

      if (error) {
        alert('삭제 중 오류가 발생했어요: ' + error.message);
        return;
      }

      alert('후기가 삭제되었어요.');
      loadMyReviews(userId);
    });
  });
}

// ===== 나의 관람 취향 통계 =====
async function loadMyStats(userId) {
  const box = document.getElementById('tasteStats');
  box.innerHTML = `<p class="placeholder-text">불러오는 중...</p>`;

  const { data: reviews, error } = await supabaseClient
    .from('reviews')
    .select('rating, play_id')
    .eq('user_id', userId);

  if (error || !reviews || reviews.length === 0) {
    box.innerHTML = `<p class="placeholder-text">아직 데이터가 없어요. 후기를 남겨보세요!</p>`;
    return;
  }

  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  const playIds = [...new Set(reviews.map(r => r.play_id))];

  const { data: plays } = await supabaseClient
    .from('plays')
    .select('id, venue')
    .in('id', playIds);

  const venueByPlay = {};
  (plays || []).forEach(p => { venueByPlay[p.id] = p.venue || '장소 미정'; });

  const venueCount = {};
  reviews.forEach(r => {
    const venue = venueByPlay[r.play_id] || '장소 미정';
    venueCount[venue] = (venueCount[venue] || 0) + 1;
  });

  const { data: credits } = await supabaseClient
    .from('play_credits')
    .select('play_id, role, people(name)')
    .in('play_id', playIds)
    .in('role', ['출연진', '연출']);

  const creditsByPlay = {};
  (credits || []).forEach(c => {
    if (!c.people) return;
    if (!creditsByPlay[c.play_id]) creditsByPlay[c.play_id] = { '출연진': [], '연출': [] };
    creditsByPlay[c.play_id][c.role].push(c.people.name);
  });

  const actorCount = {};
  const directorCount = {};

  reviews.forEach(r => {
    const info = creditsByPlay[r.play_id];
    if (!info) return;
    info['출연진'].forEach(name => { actorCount[name] = (actorCount[name] || 0) + 1; });
    info['연출'].forEach(name => { directorCount[name] = (directorCount[name] || 0) + 1; });
  });

  const toRankList = (countMap, limit = 3) => {
    return Object.entries(countMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  };

  const renderRankGroup = (title, list, unit) => {
    if (list.length === 0) {
      return `<div class="taste-group">
        <div class="taste-group-title">${title}</div>
        <p class="placeholder-text">아직 데이터가 없어요.</p>
      </div>`;
    }
    return `<div class="taste-group">
      <div class="taste-group-title">${title}</div>
      ${list.map((item, i) => `
        <div class="taste-rank-item">
          <span class="taste-rank-num">${i + 1}</span>
          <span class="taste-rank-name">${item[0]}</span>
          <span class="taste-rank-count">${item[1]}${unit}</span>
        </div>
      `).join('')}
    </div>`;
  };

  let html = `
    <div class="taste-avg-rating">
      <div class="taste-avg-number">⭐ ${avgRating.toFixed(1)}</div>
      <div class="taste-avg-label">나의 평균 별점</div>
    </div>
  `;

  html += renderRankGroup('🎭 자주 본 배우', toRankList(actorCount), '회');
  html += renderRankGroup('🎬 자주 본 연출', toRankList(directorCount), '회');
  html += renderRankGroup('📍 자주 간 극장', toRankList(venueCount), '회');

  box.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
  initMyPage();
});
