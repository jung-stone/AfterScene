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
function setupSearch() {
  const searchInput = document.getElementById('searchInput');

  searchInput.addEventListener('input', (e) => {
    const keyword = e.target.value.trim().toLowerCase();
    const ongoingSection = document.querySelector('#ongoingPlays').closest('.play-section');
    const upcomingSection = document.querySelector('#upcomingPlays').closest('.play-section');
    const endedSection = document.querySelector('#endedPlays').closest('.play-section');
    const ongoingTitleEl = ongoingSection.querySelector('.section-title');

    if (keyword === '') {
      document.querySelector('.hero').style.display = 'block';
      upcomingSection.style.display = 'block';
      endedSection.style.display = 'block';
      ongoingTitleEl.textContent = '🎭 공연중';
      applyGenreFilter();
      return;
    }

    const filtered = allPlays.filter(play =>
      play.title.toLowerCase().includes(keyword)
    );

    document.querySelector('.hero').style.display = 'none';
    upcomingSection.style.display = 'none';
    endedSection.style.display = 'none';
    ongoingTitleEl.textContent = `🔍 "${e.target.value}" 검색 결과 (${filtered.length}건)`;

    visibleCounts['ongoingPlays'] = filtered.length || PAGE_SIZE;
    renderPlays(filtered, 'ongoingPlays');
  });
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
  setupSearch();
  setupPlaySort();
  setupCarouselArrows();
});
