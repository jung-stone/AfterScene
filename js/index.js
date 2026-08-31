// ===== 메인 페이지: 연극 목록 =====
let allPlays = [];
let currentGenre = '전체';
let currentPlaySort = 'popular';
const PAGE_SIZE = 8;
const visibleCounts = {};
const fullLists = {};

async function loadPlays() {
  let allData = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabaseClient
      .from('plays')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + batchSize - 1);

    if (error) {
      console.error('연극 목록을 불러오는 중 오류 발생:', error);
      break;
    }

    if (!data || data.length === 0) break;

    allData = allData.concat(data);

    if (data.length < batchSize) break; // 마지막 배치였다면 반복 종료

    from += batchSize;
  }

  allPlays = allData;
  applyGenreFilter();
}

function renderPlays(plays, containerId) {
  const container = document.getElementById(containerId);

  fullLists[containerId] = plays;
  if (!visibleCounts[containerId]) visibleCounts[containerId] = PAGE_SIZE;

  if (!plays || plays.length === 0) {
    container.innerHTML = `<p class="placeholder-text">해당하는 연극이 없습니다.</p>`;
    return;
  }

  const visibleCount = visibleCounts[containerId];
  const visiblePlays = plays.slice(0, visibleCount);

  let html = visiblePlays.map(play => {
    let period = '기간 미정';
    if (play.start_date && play.end_date) {
      period = `${play.start_date} ~ ${play.end_date}`;
    } else if (play.start_date) {
      period = `${play.start_date} ~`;
    }

    return `
      <div class="play-card" data-play-id="${play.id}">
        <img src="${play.poster_url || 'https://placehold.co/300x450/22252d/f5f5f5?text=No+Image'}" alt="${play.title}" />
        <div class="genre-badge">${play.genre || '기타'}</div>
        <div class="play-title">${play.title}</div>
        <div class="play-period">${period}</div>
        <div class="play-rating">⭐ ${play.avg_rating ? play.avg_rating.toFixed(1) : '0.0'} (${play.review_count || 0}명)</div>
      </div>
    `;
  }).join('');

  if (plays.length > visibleCount) {
    const remaining = plays.length - visibleCount;
    html += `
      <div class="load-more-wrap">
        <button class="load-more-btn" data-container="${containerId}">더보기 (${remaining}개 더)</button>
      </div>
    `;
  }

  container.innerHTML = html;

  container.querySelectorAll('.play-card').forEach(card => {
    card.addEventListener('click', () => {
      location.href = `review.html?playId=${encodeURIComponent(card.dataset.playId)}`;
    });
  });

  const moreBtn = container.querySelector('.load-more-btn');
  if (moreBtn) {
    moreBtn.addEventListener('click', () => {
      visibleCounts[containerId] += PAGE_SIZE;
      renderPlays(fullLists[containerId], containerId);
    });
  }
}

// ===== 검색 =====
let searchSuggestDebounce = null;

function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  const suggestBox = document.getElementById('searchSuggest');

  searchInput.addEventListener('input', (e) => {
    const rawKeyword = e.target.value.trim();
    const keyword = rawKeyword.toLowerCase();
    const ongoingSection = document.querySelector('#ongoingPlays').closest('.play-section');
    const upcomingSection = document.querySelector('#upcomingPlays').closest('.play-section');
    const endedSection = document.querySelector('#endedPlays').closest('.play-section');
    const ongoingTitleEl = ongoingSection.querySelector('.section-title');

    clearTimeout(searchSuggestDebounce);

    if (keyword === '') {
      document.querySelector('.hero').style.display = 'block';
      upcomingSection.style.display = 'block';
      endedSection.style.display = 'block';
      ongoingTitleEl.textContent = '🎭 공연중';
      applyGenreFilter();
      suggestBox.classList.add('hidden');
      suggestBox.innerHTML = '';
      return;
    }

    const filtered = allPlays.filter(play =>
      play.title.toLowerCase().includes(keyword)
    );

    document.querySelector('.hero').style.display = 'none';
    upcomingSection.style.display = 'none';
    endedSection.style.display = 'none';
    ongoingTitleEl.textContent = `🔍 "${rawKeyword}" 검색 결과 (${filtered.length}건)`;

    visibleCounts['ongoingPlays'] = filtered.length || PAGE_SIZE;
    renderPlays(filtered, 'ongoingPlays');

    searchSuggestDebounce = setTimeout(() => loadSearchSuggestions(rawKeyword), 250);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) {
      suggestBox.classList.add('hidden');
    }
  });

  searchInput.addEventListener('focus', () => {
    if (suggestBox.innerHTML.trim()) suggestBox.classList.remove('hidden');
  });
}

// 배우/연출/공연장 등 인물·공연장 이름으로도 검색되게 하는 드롭다운
async function loadSearchSuggestions(keyword) {
  const suggestBox = document.getElementById('searchSuggest');

  const [{ data: people }, { data: venues }] = await Promise.all([
    supabaseClient.from('people').select('id, name').ilike('name', `%${keyword}%`).limit(5),
    supabaseClient.from('venues').select('id, name').ilike('name', `%${keyword}%`).limit(5)
  ]);

  const items = [
    ...(people || []).map(p => ({ type: '인물', name: p.name, href: `person.html?id=${encodeURIComponent(p.id)}` })),
    ...(venues || []).map(v => ({ type: '공연장', name: v.name, href: `venue.html?id=${encodeURIComponent(v.id)}` }))
  ];

  if (items.length === 0) {
    suggestBox.innerHTML = `<div class="search-suggest-empty">일치하는 배우·공연장이 없어요.</div>`;
  } else {
    suggestBox.innerHTML = items.map(item => `
      <div class="search-suggest-item" data-href="${item.href}">
        <span class="search-suggest-badge">${item.type}</span>
        <span class="search-suggest-name">${item.name}</span>
      </div>
    `).join('');

    suggestBox.querySelectorAll('.search-suggest-item').forEach(el => {
      el.addEventListener('click', () => {
        location.href = el.dataset.href;
      });
    });
  }

  suggestBox.classList.remove('hidden');
}

// ===== 정렬 =====
function sortPlays(list) {
  if (currentPlaySort === 'popular') {
    return [...list].sort((a, b) =>
      (b.review_count || 0) - (a.review_count || 0) ||
      (b.avg_rating || 0) - (a.avg_rating || 0)
    );
  }

  // 기본: 공연임박순 (시작일 빠른 순, 날짜 없는 항목은 맨 뒤)
  return [...list].sort((a, b) => {
    if (!a.start_date) return 1;
    if (!b.start_date) return -1;
    return a.start_date.localeCompare(b.start_date);
  });
}

function setupPlaySort() {
  document.getElementById('playSortSelect').addEventListener('change', (e) => {
    currentPlaySort = e.target.value;
    applyGenreFilter();
  });
}

function applyGenreFilter() {
  visibleCounts['ongoingPlays'] = PAGE_SIZE;
  visibleCounts['upcomingPlays'] = PAGE_SIZE;
  visibleCounts['endedPlays'] = PAGE_SIZE;

  categorizeAndRenderPlays(allPlays);
}

// 공연 기간을 기준으로 공연중/공연예정/공연종료로 자동 분류
function categorizeAndRenderPlays(plays) {
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD' 형식

  const ongoing = [];
  const upcoming = [];
  const ended = [];

  plays.forEach(play => {
    const start = play.start_date;
    const end = play.end_date;

    if (!start && !end) {
      ongoing.push(play); // 기간 정보가 없으면 일단 공연중으로 분류
    } else if (start && start > today) {
      upcoming.push(play);
    } else if (end && end < today) {
      ended.push(play);
    } else {
      ongoing.push(play);
    }
  });

  renderPlays(sortPlays(ongoing), 'ongoingPlays');
  renderPlays(sortPlays(upcoming), 'upcomingPlays');
  renderPlays(sortPlays(ended), 'endedPlays');
}

// ===== 최근 관극 기록 피드 =====
const FEED_SIZE = 6;

function toRelativeTime(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diffMs / (1000 * 60));

  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}주 전`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}개월 전`;

  return `${Math.floor(days / 365)}년 전`;
}

async function loadRecentFeed() {
  const container = document.getElementById('recentFeedList');

  const { data: reviews, error } = await supabaseClient
    .from('reviews')
    .select('id, rating, one_line_review, created_at, user_id, play_id, plays(id, title, poster_url)')
    .order('created_at', { ascending: false })
    .limit(FEED_SIZE);

  if (error || !reviews || reviews.length === 0) {
    container.innerHTML = `<p class="placeholder-text">아직 등록된 관극 기록이 없어요. 첫 기록을 남겨보세요!</p>`;
    return;
  }

  const userIds = [...new Set(reviews.map(r => r.user_id))];
  const { data: profiles } = await supabaseClient
    .from('profiles')
    .select('id, nickname')
    .in('id', userIds);
  const nicknameMap = {};
  (profiles || []).forEach(p => { nicknameMap[p.id] = p.nickname; });

  container.innerHTML = reviews.filter(r => r.plays).map(r => {
    const nickname = nicknameMap[r.user_id] || '익명';
    const posterUrl = r.plays.poster_url || 'https://placehold.co/300x450/22252d/f5f5f5?text=No+Image';

    return `
      <div class="feed-card" data-play-id="${r.plays.id}">
        <img src="${posterUrl}" alt="${r.plays.title}" />
        <div class="feed-card-body">
          <div class="feed-card-top">
            <span class="feed-card-nickname profile-link" data-user-id="${r.user_id}">${nickname}</span>
            <span class="feed-card-time">${toRelativeTime(r.created_at)}</span>
          </div>
          <div class="feed-card-play-title">${r.plays.title}</div>
          <div class="feed-card-line">
            <span class="feed-card-rating">⭐ ${r.rating.toFixed(1)}</span>
            <span>${r.one_line_review}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.feed-card').forEach(card => {
    card.addEventListener('click', () => {
      location.href = `review.html?playId=${encodeURIComponent(card.dataset.playId)}`;
    });
  });

  container.querySelectorAll('.profile-link').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      location.href = `profile.html?id=${encodeURIComponent(el.dataset.userId)}`;
    });
  });
}

// ===== 이달의 화제 배우 · 공연장 =====
const TRENDING_REVIEW_LOOKBACK = 200; // 최근 후기 N건을 기준으로 집계
const TRENDING_RANK_SIZE = 5;

function renderTrendingList(containerId, rankMap, navBase) {
  const container = document.getElementById(containerId);
  const list = Object.values(rankMap)
    .sort((a, b) => b.count - a.count || b.avg - a.avg)
    .slice(0, TRENDING_RANK_SIZE);

  if (list.length === 0) {
    container.innerHTML = `<p class="placeholder-text">아직 데이터가 부족해요.</p>`;
    return;
  }

  container.innerHTML = list.map((item, i) => `
    <div class="taste-rank-item trending-rank-item" data-id="${item.id}">
      <span class="taste-rank-num">${i + 1}</span>
      <span class="taste-rank-name">${item.name}</span>
      <span class="taste-rank-count">⭐ ${item.avg.toFixed(1)} · ${item.count}건</span>
    </div>
  `).join('');

  container.querySelectorAll('.trending-rank-item').forEach(el => {
    el.addEventListener('click', () => {
      location.href = `${navBase}${encodeURIComponent(el.dataset.id)}`;
    });
  });
}

async function loadTrending() {
  const { data: reviews, error } = await supabaseClient
    .from('reviews')
    .select('rating, play_id, created_at')
    .order('created_at', { ascending: false })
    .limit(TRENDING_REVIEW_LOOKBACK);

  if (error || !reviews || reviews.length === 0) {
    renderTrendingList('trendingActors', {}, '');
    renderTrendingList('trendingVenues', {}, '');
    return;
  }

  const playIds = [...new Set(reviews.map(r => r.play_id))];

  const [{ data: plays }, { data: credits }] = await Promise.all([
    supabaseClient.from('plays').select('id, venue, venue_id').in('id', playIds),
    supabaseClient.from('play_credits').select('play_id, person_id, people(name)').eq('role', '출연진').in('play_id', playIds)
  ]);

  const venueByPlay = {};
  (plays || []).forEach(p => {
    if (p.venue_id) venueByPlay[p.id] = { id: p.venue_id, name: p.venue };
  });

  const castByPlay = {};
  (credits || []).forEach(c => {
    if (!c.people) return;
    if (!castByPlay[c.play_id]) castByPlay[c.play_id] = [];
    castByPlay[c.play_id].push({ id: c.person_id, name: c.people.name });
  });

  const actorRank = {};
  const venueRank = {};

  reviews.forEach(r => {
    const venue = venueByPlay[r.play_id];
    if (venue) {
      if (!venueRank[venue.id]) venueRank[venue.id] = { id: venue.id, name: venue.name, count: 0, sum: 0, avg: 0 };
      venueRank[venue.id].count += 1;
      venueRank[venue.id].sum += r.rating;
    }

    (castByPlay[r.play_id] || []).forEach(actor => {
      if (!actorRank[actor.id]) actorRank[actor.id] = { id: actor.id, name: actor.name, count: 0, sum: 0, avg: 0 };
      actorRank[actor.id].count += 1;
      actorRank[actor.id].sum += r.rating;
    });
  });

  Object.values(actorRank).forEach(a => { a.avg = a.sum / a.count; });
  Object.values(venueRank).forEach(v => { v.avg = v.sum / v.count; });

  renderTrendingList('trendingActors', actorRank, 'person.html?id=');
  renderTrendingList('trendingVenues', venueRank, 'venue.html?id=');
}

// ===== 캐러셀 화살표 =====
function setupCarouselArrows() {
  document.querySelectorAll('.carousel-arrow').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const scrollAmount = target.clientWidth * 0.8;
      const direction = btn.classList.contains('carousel-arrow-left') ? -1 : 1;
      target.scrollBy({ left: scrollAmount * direction, behavior: 'smooth' });
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadPlays();
  loadRecentFeed();
  loadTrending();
  setupSearch();
  setupPlaySort();
  setupCarouselArrows();
});
