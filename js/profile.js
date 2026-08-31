// ===== 공개 프로필 페이지 =====
const params = new URLSearchParams(location.search);
const profileUserId = params.get('id');

async function initProfilePage() {
  if (!profileUserId) {
    alert('사용자 정보를 찾을 수 없어요.');
    location.href = 'index.html';
    return;
  }

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('id, nickname')
    .eq('id', profileUserId)
    .maybeSingle();

  document.getElementById('profileNickname').textContent = profile ? profile.nickname : '익명';

  loadProfileStats(profileUserId);
  loadProfileReviews(profileUserId);
}

async function loadProfileReviews(userId) {
  const listContainer = document.getElementById('profileReviewList');
  const countEl = document.getElementById('profileReviewCount');

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
    listContainer.innerHTML = `<p class="placeholder-text">아직 작성한 후기가 없어요.</p>`;
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
      <div class="my-review-card" data-play-id="${review.play_id || ''}">
        <img class="my-review-poster" src="${posterUrl}" alt="${playTitle}" />
        <div class="my-review-content">
          <div class="my-review-date">${watchedDateText}</div>
          <div class="my-review-play-title">${playTitle}</div>
          <div class="my-review-rating">⭐ ${review.rating.toFixed(1)}</div>
          <div class="my-review-one-line">${review.one_line_review}</div>
        </div>
      </div>
    `;
  }).join('');

  listContainer.querySelectorAll('.my-review-card').forEach(card => {
    card.addEventListener('click', () => {
      if (!card.dataset.playId) return;
      location.href = `review.html?playId=${encodeURIComponent(card.dataset.playId)}`;
    });
  });
}

async function loadProfileStats(userId) {
  const box = document.getElementById('profileTasteStats');
  box.innerHTML = `<p class="placeholder-text">불러오는 중...</p>`;

  const { data: reviews, error } = await supabaseClient
    .from('reviews')
    .select('rating, play_id')
    .eq('user_id', userId);

  if (error || !reviews || reviews.length === 0) {
    box.innerHTML = `<p class="placeholder-text">아직 데이터가 없어요.</p>`;
    return;
  }

  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  const playIds = [...new Set(reviews.map(r => r.play_id))];

  const { data: plays } = await supabaseClient
    .from('plays')
    .select('id, venue, venue_id')
    .in('id', playIds);

  const venueByPlay = {};
  (plays || []).forEach(p => {
    venueByPlay[p.id] = { id: p.venue_id || null, name: p.venue || '장소 미정' };
  });

  const venueCount = {};
  reviews.forEach(r => {
    const venue = venueByPlay[r.play_id] || { id: null, name: '장소 미정' };
    const key = venue.id || 'unknown';
    if (!venueCount[key]) venueCount[key] = { id: venue.id, name: venue.name, count: 0 };
    venueCount[key].count += 1;
  });

  const { data: credits } = await supabaseClient
    .from('play_credits')
    .select('play_id, role, person_id, people(id, name)')
    .in('play_id', playIds)
    .in('role', ['출연진', '연출']);

  const creditsByPlay = {};
  (credits || []).forEach(c => {
    if (!c.people) return;
    if (!creditsByPlay[c.play_id]) creditsByPlay[c.play_id] = { '출연진': [], '연출': [] };
    creditsByPlay[c.play_id][c.role].push({ id: c.person_id, name: c.people.name });
  });

  const actorCount = {};
  const directorCount = {};

  reviews.forEach(r => {
    const info = creditsByPlay[r.play_id];
    if (!info) return;
    info['출연진'].forEach(person => {
      if (!actorCount[person.id]) actorCount[person.id] = { id: person.id, name: person.name, count: 0 };
      actorCount[person.id].count += 1;
    });
    info['연출'].forEach(person => {
      if (!directorCount[person.id]) directorCount[person.id] = { id: person.id, name: person.name, count: 0 };
      directorCount[person.id].count += 1;
    });
  });

  const toRankList = (countMap, limit = 3) => {
    return Object.values(countMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  };

  const renderRankGroup = (title, list, unit, navBase) => {
    if (list.length === 0) {
      return `<div class="taste-group">
        <div class="taste-group-title">${title}</div>
        <p class="placeholder-text">아직 데이터가 없어요.</p>
      </div>`;
    }
    return `<div class="taste-group">
      <div class="taste-group-title">${title}</div>
      ${list.map((item, i) => `
        <div class="taste-rank-item${item.id ? ' trending-rank-item' : ''}" ${item.id ? `data-nav="${navBase}${encodeURIComponent(item.id)}"` : ''}>
          <span class="taste-rank-num">${i + 1}</span>
          <span class="taste-rank-name">${item.name}</span>
          <span class="taste-rank-count">${item.count}${unit}</span>
        </div>
      `).join('')}
    </div>`;
  };

  let html = `
    <div class="taste-avg-rating">
      <div class="taste-avg-number">⭐ ${avgRating.toFixed(1)}</div>
      <div class="taste-avg-label">평균 별점</div>
    </div>
  `;

  html += renderRankGroup('🎭 자주 본 배우', toRankList(actorCount), '회', 'person.html?id=');
  html += renderRankGroup('🎬 자주 본 연출', toRankList(directorCount), '회', 'person.html?id=');
  html += renderRankGroup('📍 자주 간 극장', toRankList(venueCount), '회', 'venue.html?id=');

  box.innerHTML = html;

  box.querySelectorAll('.trending-rank-item').forEach(el => {
    el.addEventListener('click', () => {
      location.href = el.dataset.nav;
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initProfilePage();
});
