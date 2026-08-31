// ===== 마이페이지 (구 myPageModal) =====
let myUserId = null;

async function initMyPage() {
  const user = await requireLogin('로그인 후 이용해주세요.');
  if (!user) return;

  myUserId = user.id;
  document.getElementById('myPageEmail').textContent = user.email;
  loadMyStats(user.id);
  loadMyReviews(user.id);
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
