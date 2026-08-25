const SUPABASE_URL = "https://adedblsrjumckskxzsdj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkZWRibHNyanVtY2tza3h6c2RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNDA4NjEsImV4cCI6MjEwMjcxNjg2MX0._Captmo3KEc8Sv9y2oqAdH1uzZtmwI4gQ1tLvtxFLgs";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allPlays = [];
let currentPlayId = null;
let editingReviewId = null;
let editingPlayId = null;
let isSignupMode = false;
let currentGenre = '전체';
let currentReviewSort = 'latest';
let currentCommentReviewId = null;
let currentPlaySort = 'default';
const PAGE_SIZE = 8;
const visibleCounts = {};
const fullLists = {};

// ===== 연극 목록 =====
async function loadPlays() {
  const { data, error } = await supabaseClient
    .from('plays')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('연극 목록을 불러오는 중 오류 발생:', error);
    return;
  }

  allPlays = data;
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
      <div class="play-card" data-play-id="${play.id}" data-play-title="${play.title}">
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
      openReviewModal(card.dataset.playId, card.dataset.playTitle);
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

    visibleCounts['ongoingPlays'] = PAGE_SIZE;
    renderPlays(filtered, 'ongoingPlays');
  });
}

// ===== 장르 필터 =====
function setupGenreFilter() {
  const buttons = document.querySelectorAll('.genre-btn');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentGenre = btn.dataset.genre;
      applyGenreFilter();
    });
  });
}

function applyGenreFilter() {
  const filtered = currentGenre === '전체'
    ? allPlays
    : allPlays.filter(play => play.genre === currentGenre);

  visibleCounts['ongoingPlays'] = PAGE_SIZE;
  visibleCounts['upcomingPlays'] = PAGE_SIZE;
  visibleCounts['endedPlays'] = PAGE_SIZE;

  categorizeAndRenderPlays(filtered);
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

// ===== 로그인 / 회원가입 =====
function setupAuthModal() {
  const modal = document.getElementById('authModal');
  const loginBtn = document.getElementById('loginBtn');
  const closeModal = document.getElementById('closeModal');
  const switchToSignup = document.getElementById('switchToSignup');
  const submitBtn = document.getElementById('authSubmitBtn');
  const modalTitle = document.getElementById('modalTitle');
  const errorText = document.getElementById('authError');
  const nicknameInput = document.getElementById('authNickname');

  loginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    modal.classList.add('active');
  });

  closeModal.addEventListener('click', () => {
    modal.classList.remove('active');
    errorText.textContent = '';
  });

  function toggleMode() {
    isSignupMode = !isSignupMode;
    modalTitle.textContent = isSignupMode ? '회원가입' : '로그인';
    submitBtn.textContent = isSignupMode ? '가입하기' : '로그인';
    nicknameInput.classList.toggle('hidden', !isSignupMode);

    const switchTextEl = document.getElementById('switchToSignup').parentElement;
    switchTextEl.innerHTML = isSignupMode
      ? '이미 계정이 있으신가요? <a href="#" id="switchToSignup">로그인</a>'
      : '계정이 없으신가요? <a href="#" id="switchToSignup">회원가입</a>';
    document.getElementById('switchToSignup').addEventListener('click', (ev) => {
      ev.preventDefault();
      toggleMode();
    });
  }

  switchToSignup.addEventListener('click', (e) => {
    e.preventDefault();
    toggleMode();
  });

  submitBtn.addEventListener('click', async () => {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value.trim();
    const nickname = nicknameInput.value.trim();
    errorText.textContent = '';

    if (!email || !password) {
      errorText.textContent = '이메일과 비밀번호를 모두 입력해주세요.';
      return;
    }

    if (isSignupMode) {
      if (nickname.length < 2 || nickname.length > 12) {
        errorText.textContent = '닉네임은 2~12자로 입력해주세요.';
        return;
      }

      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) {
        errorText.textContent = error.message;
        return;
      }

      if (data.user) {
        const { error: profileError } = await supabaseClient.from('profiles').insert({
          id: data.user.id,
          nickname: nickname
        });
        if (profileError) {
          errorText.textContent = '닉네임 저장 중 오류: ' + profileError.message;
          return;
        }
      }

      alert('회원가입 완료! 바로 로그인해주세요.');
      modal.classList.remove('active');
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        errorText.textContent = error.message;
        return;
      }
      modal.classList.remove('active');
      updateAuthUI();
    }
  });
}

async function updateAuthUI() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  const loginBtn = document.getElementById('loginBtn');
  const adminBtn = document.getElementById('adminAddBtn');

  if (user) {
    loginBtn.textContent = '로그아웃';
    loginBtn.onclick = async (e) => {
      e.preventDefault();
      await supabaseClient.auth.signOut();
      updateAuthUI();
      alert('로그아웃 되었습니다.');
    };

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    adminBtn.classList.toggle('hidden', !(profile && profile.is_admin));
  } else {
    loginBtn.textContent = '로그인';
    loginBtn.onclick = (e) => {
      e.preventDefault();
      document.getElementById('authModal').classList.add('active');
    };
    adminBtn.classList.add('hidden');
  }
}

// ===== 후기 작성 (등록/수정 겸용) =====
function setupReviewModal() {
  const modal = document.getElementById('reviewModal');
  const closeBtn = document.getElementById('closeReviewModal');
  const ratingInput = document.getElementById('ratingInput');
  const ratingValue = document.getElementById('ratingValue');
  const submitBtn = document.getElementById('reviewSubmitBtn');
  const errorText = document.getElementById('reviewError');

  ratingInput.addEventListener('input', () => {
    ratingValue.textContent = ratingInput.value;
  });

  closeBtn.addEventListener('click', () => {
    modal.classList.remove('active');
    errorText.textContent = '';
  });

  document.getElementById('adminEditPlayBtn').addEventListener('click', async () => {
    const play = allPlays.find(p => p.id === currentPlayId);
    if (!play) return;

    editingPlayId = play.id;
    document.getElementById('adminTitle').value = play.title || '';
    document.getElementById('adminPoster').value = play.poster_url || '';
    document.getElementById('adminVenue').value = play.venue || '';
    document.getElementById('adminGenre').value = play.genre || '기타';
    document.getElementById('adminDescription').value = play.description || '';
    document.getElementById('adminStartDate').value = play.start_date || '';
    document.getElementById('adminEndDate').value = play.end_date || '';
    document.getElementById('adminSubmitBtn').textContent = '수정 완료';

    const { data: credits } = await supabaseClient
      .from('play_credits')
      .select('role, people(name)')
      .eq('play_id', play.id);

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

    document.getElementById('reviewModal').classList.remove('active');
    document.getElementById('adminModal').classList.add('active');
  });

  submitBtn.addEventListener('click', async () => {
    errorText.textContent = '';

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      errorText.textContent = '로그인 후 이용해주세요.';
      return;
    }

    const rating = parseFloat(ratingInput.value);
    const watchedDate = document.getElementById('watchedDateInput').value || null;
    const watchedCast = document.getElementById('watchedCastInput').value.trim() || null;
    const seatInfo = document.getElementById('seatInput').value.trim() || null;
    const oneLine = document.getElementById('oneLineInput').value.trim();
    const detail = document.getElementById('detailInput').value.trim();

    if (!oneLine) {
      errorText.textContent = '한 줄 평을 입력해주세요.';
      return;
    }

    if (editingReviewId) {
      const { error: updateError } = await supabaseClient
        .from('reviews')
        .update({
          rating,
          watched_date: watchedDate,
          watched_cast: watchedCast,
          seat_info: seatInfo,
          one_line_review: oneLine,
          detail_review: detail
        })
        .eq('id', editingReviewId);

      if (updateError) {
        errorText.textContent = '수정 중 오류가 발생했어요: ' + updateError.message;
        return;
      }

      alert('후기가 수정되었어요!');
      editingReviewId = null;
    } else {
      const { error: insertError } = await supabaseClient.from('reviews').insert({
        play_id: currentPlayId,
        user_id: user.id,
        rating: rating,
        watched_date: watchedDate,
        watched_cast: watchedCast,
        seat_info: seatInfo,
        one_line_review: oneLine,
        detail_review: detail
      });

      if (insertError) {
        errorText.textContent = '후기 등록 중 오류가 발생했어요: ' + insertError.message;
        return;
      }

      alert('후기가 등록되었어요! 감사합니다 🎭');
    }

    loadPlayReviews(currentPlayId);
    modal.classList.remove('active');
    document.getElementById('oneLineInput').value = '';
    document.getElementById('detailInput').value = '';
    document.getElementById('reviewSubmitBtn').textContent = '후기 등록하기';

    loadPlays();
  });
}

async function openReviewModal(playId, playTitle, editData = null) {
  currentPlayId = playId;
  editingReviewId = editData ? editData.reviewId : null;

  document.getElementById('reviewPlayTitle').textContent = playTitle;
  document.getElementById('ratingInput').value = editData ? editData.rating : 3.5;
  document.getElementById('ratingValue').textContent = editData ? editData.rating : 3.5;
  document.getElementById('watchedDateInput').value = editData ? (editData.watchedDate || '') : '';
  document.getElementById('watchedCastInput').value = editData ? (editData.watchedCast || '') : '';
  document.getElementById('seatInput').value = editData ? (editData.seatInfo || '') : '';
  document.getElementById('oneLineInput').value = editData ? editData.oneLine : '';
  document.getElementById('detailInput').value = editData ? editData.detail : '';
  document.getElementById('reviewError').textContent = '';
  document.getElementById('reviewSubmitBtn').textContent = editData ? '수정 완료' : '후기 등록하기';
  document.getElementById('reviewModal').classList.add('active');

  loadPlayInfo(playId);
  loadPlayReviews(playId);

  const editPlayBtn = document.getElementById('adminEditPlayBtn');
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (user) {
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    editPlayBtn.classList.toggle('hidden', !(profile && profile.is_admin));
  } else {
    editPlayBtn.classList.add('hidden');
  }
}

// ===== 공연 정보(크레딧) 표시 =====
async function loadPlayInfo(playId) {
  const box = document.getElementById('playInfoBox');
  box.innerHTML = `<p class="placeholder-text">불러오는 중...</p>`;

  const play = allPlays.find(p => p.id === playId);

  const { data: credits } = await supabaseClient
    .from('play_credits')
    .select('role, people(id, name)')
    .eq('play_id', playId);

  const roleOrder = ['작', '연출', '각색', '출연진', '기획', '제작', '주최', '주관'];
  const grouped = {};
  (credits || []).forEach(c => {
    if (!c.people) return;
    if (!grouped[c.role]) grouped[c.role] = [];
    grouped[c.role].push(c.people);
  });

  let html = '';

  if (play) {
    const period = (play.start_date && play.end_date)
      ? `${play.start_date} ~ ${play.end_date}`
      : '';

    if (play.venue_id) {
      html += `<div class="play-info-row">📍 <button class="venue-link-btn" data-venue-id="${play.venue_id}">${play.venue}</button></div>`;
    } else {
      html += `<div class="play-info-row">📍 ${play.venue || '장소 미정'}</div>`;
    }

    if (period) html += `<div class="play-info-row">🗓 ${period}</div>`;
    if (play.description) html += `<div class="play-info-desc">${play.description}</div>`;
  }

  roleOrder.forEach(role => {
    if (grouped[role] && grouped[role].length > 0) {
      html += `<div class="credit-role-group">
        <span class="credit-role-label">${role}</span>
        ${grouped[role].map(p => `<button class="credit-tag" data-person-id="${p.id}">${p.name}</button>`).join('')}
      </div>`;
    }
  });

  box.innerHTML = html || `<p class="placeholder-text">등록된 정보가 없어요.</p>`;

  box.querySelectorAll('.credit-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      openPersonModal(btn.dataset.personId);
    });
  });

  const venueBtn = box.querySelector('.venue-link-btn');
  if (venueBtn) {
    venueBtn.addEventListener('click', () => {
      openVenueModal(venueBtn.dataset.venueId);
    });
  }
}

// ===== 인물 상세 모달 =====
async function openPersonModal(personId) {
  document.getElementById('reviewModal').classList.remove('active');
  document.getElementById('venueModal').classList.remove('active');
  document.getElementById('personModal').classList.add('active');
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

  if (!person) return;

  document.getElementById('personName').textContent = person.name;
  document.getElementById('personBio').textContent = person.bio || '아직 소개가 없어요.';

  const { data: credits } = await supabaseClient
    .from('play_credits')
    .select('role, plays(id, title, poster_url)')
    .eq('person_id', personId);

  const listEl = document.getElementById('personPlayList');
  const playIds = [...new Set((credits || []).filter(c => c.plays).map(c => c.plays.id))];

  if (playIds.length > 0) {
    const { data: reviews } = await supabaseClient
      .from('reviews')
      .select('rating')
      .in('play_id', playIds);

    if (reviews && reviews.length > 0) {
      const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
      document.getElementById('personAvgRating').textContent = `⭐ ${avg.toFixed(1)} (관람객 평균)`;
    }
  }

  if (!credits || credits.length === 0) {
    listEl.innerHTML = `<p class="placeholder-text">참여한 작품 정보가 없어요.</p>`;
  } else {
    listEl.innerHTML = credits.filter(c => c.plays).map(c => `
      <div class="person-play-card" data-play-id="${c.plays.id}" data-play-title="${c.plays.title}">
        <img src="${c.plays.poster_url || 'https://placehold.co/300x450/22252d/f5f5f5?text=No+Image'}" alt="${c.plays.title}" />
        <div>
          <div class="person-play-title">${c.plays.title}</div>
          <div class="person-play-role">${c.role}</div>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.person-play-card').forEach(card => {
      card.addEventListener('click', () => {
        document.getElementById('personModal').classList.remove('active');
        openReviewModal(card.dataset.playId, card.dataset.playTitle);
      });
    });
  }

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (user) {
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profile && profile.is_admin) {
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
}

function setupPersonModal() {
  document.getElementById('closePersonModal').addEventListener('click', () => {
    document.getElementById('personModal').classList.remove('active');
  });
}

// ===== 후기 목록 (좋아요 + 관리자 삭제 포함) =====
async function loadPlayReviews(playId) {
  const listContainer = document.getElementById('existingReviewsList');
  listContainer.innerHTML = `<p class="placeholder-text">불러오는 중...</p>`;

  const { data: reviews, error } = await supabaseClient
    .from('reviews')
    .select('*')
    .eq('play_id', playId)
    .order('created_at', { ascending: false });

  if (error) {
    listContainer.innerHTML = `<p class="placeholder-text">후기를 불러오지 못했어요.</p>`;
    return;
  }

  if (reviews.length === 0) {
    listContainer.innerHTML = `<p class="placeholder-text">아직 후기가 없어요. 첫 후기를 남겨보세요!</p>`;
    return;
  }

  const userIds = [...new Set(reviews.map(r => r.user_id))];
  const { data: profiles } = await supabaseClient
    .from('profiles')
    .select('id, nickname')
    .in('id', userIds);
  const nicknameMap = {};
  (profiles || []).forEach(p => { nicknameMap[p.id] = p.nickname; });

  const reviewIds = reviews.map(r => r.id);

  const { data: likes } = await supabaseClient
    .from('review_likes')
    .select('review_id, user_id')
    .in('review_id', reviewIds);

  const likeCountMap = {};
  const myLikedSet = new Set();
  const { data: { user: currentUser } } = await supabaseClient.auth.getUser();

  (likes || []).forEach(like => {
    likeCountMap[like.review_id] = (likeCountMap[like.review_id] || 0) + 1;
    if (currentUser && like.user_id === currentUser.id) {
      myLikedSet.add(like.review_id);
    }
  });

  const { data: comments } = await supabaseClient
    .from('review_comments')
    .select('review_id')
    .in('review_id', reviewIds);

  const commentCountMap = {};
  (comments || []).forEach(c => {
    commentCountMap[c.review_id] = (commentCountMap[c.review_id] || 0) + 1;
  });

  let isCurrentUserAdmin = false;
  if (currentUser) {
    const { data: myProfile } = await supabaseClient
      .from('profiles')
      .select('is_admin')
      .eq('id', currentUser.id)
      .single();
    isCurrentUserAdmin = !!(myProfile && myProfile.is_admin);
  }

  const groups = {};
  reviews.forEach(r => {
    if (!groups[r.user_id]) groups[r.user_id] = [];
    groups[r.user_id].push(r);
  });

  const groupArray = Object.entries(groups).map(([uid, list]) => {
    const sortedVisits = [...list].sort((a, b) => {
      const ad = a.watched_date || a.created_at;
      const bd = b.watched_date || b.created_at;
      return ad < bd ? -1 : ad > bd ? 1 : 0;
    });
    const totalLikes = list.reduce((s, r) => s + (likeCountMap[r.id] || 0), 0);
    const latestCreated = list.reduce((max, r) => (r.created_at > max ? r.created_at : max), list[0].created_at);
    const avgRating = list.reduce((s, r) => s + r.rating, 0) / list.length;

    const representative = sortedVisits.find(v => v.is_representative) || sortedVisits[sortedVisits.length - 1];

    return { userId: uid, visits: sortedVisits, count: list.length, totalLikes, latestCreated, avgRating, representative };
  });

  if (currentReviewSort === 'likes') {
    groupArray.sort((a, b) => b.totalLikes - a.totalLikes);
  } else {
    groupArray.sort((a, b) => (b.latestCreated > a.latestCreated ? 1 : -1));
  }

  function renderVisitRow(review, roundLabel, diffTagHtml, group) {
    const nickname = nicknameMap[review.user_id] || '익명';
    const date = review.watched_date || new Date(review.created_at).toLocaleDateString('ko-KR');
    const likeCount = likeCountMap[review.id] || 0;
    const commentCount = commentCountMap[review.id] || 0;
    const isLiked = myLikedSet.has(review.id);
    const isOwner = currentUser && group && currentUser.id === group.userId;
    const isRep = group && group.representative.id === review.id;

    let repControl = '';
    if (isOwner && group.count > 1) {
      repControl = isRep
        ? `<span class="representative-tag">★ 대표 후기</span>`
        : `<button class="set-representative-btn" data-review-id="${review.id}" data-user-id="${group.userId}" data-play-id="${playId}">대표 후기로 설정</button>`;
    }

    return `
      <div class="existing-review-card review-visit-item" data-review-id="${review.id}">
        <div class="review-top">
          <span class="review-rating">${roundLabel ? `<span class="review-visit-round">${roundLabel}</span>` : ''}⭐ ${review.rating.toFixed(1)}${roundLabel ? '' : ' · ' + nickname}</span>
          <span class="review-date">${date}</span>
        </div>
        ${diffTagHtml || ''}
        ${review.seat_info ? `<div class="seat-tag">💺 ${review.seat_info}</div>` : ''}
        <div class="review-one-line">${review.one_line_review}</div>
        ${review.detail_review ? `<div class="review-detail">${review.detail_review}</div>` : ''}
        <div class="review-card-actions">
          <button class="like-btn ${isLiked ? 'liked' : ''}" data-review-id="${review.id}">
            👍 <span class="like-count">${likeCount}</span>
          </button>
          <span class="comment-count-tag">💬 ${commentCount}</span>
          ${isCurrentUserAdmin ? `<button class="admin-delete-btn" data-review-id="${review.id}">관리자 삭제</button>` : ''}
        </div>
        ${repControl}
      </div>
    `;
  }

  let html = '';

  groupArray.forEach(group => {
    const nickname = nicknameMap[group.userId] || '익명';

    if (group.count === 1) {
      html += renderVisitRow(group.visits[0], null, null, group);
      return;
    }

    let badge = '🔁 재관람';
    if (group.count >= 7) badge = '🎡 회전문의 신';
    else if (group.count >= 4) badge = '🎯 단골';

    const rep = group.representative;
    const repDate = rep.watched_date || new Date(rep.created_at).toLocaleDateString('ko-KR');
    const repIsRepTag = group.visits.some(v => v.is_representative)
      ? `<span class="diff-tag">★ 지정된 대표 후기</span>`
      : `<span class="diff-tag">🕐 최신 관람 후기</span>`;

    const previewHtml = `
      <div class="review-group-preview">
        <div class="review-top">
          <span class="review-rating">⭐ ${rep.rating.toFixed(1)} · ${nickname}</span>
          <span class="review-date">${repDate}</span>
        </div>
        ${repIsRepTag}
        <div class="review-one-line">${rep.one_line_review}</div>
      </div>
    `;

    let visitsHtml = '';
    let prevCast = null;

    group.visits.forEach((review, idx) => {
      const round = `${idx + 1}회차`;
      let diffTagHtml = '';
      const castList = (review.watched_cast || '').split(',').map(s => s.trim()).filter(Boolean);

      if (idx === 0) {
        diffTagHtml = `<div class="diff-tag">🆕 첫 관람</div>`;
      } else if (castList.length > 0 && prevCast) {
        const changed = castList.filter(c => !prevCast.includes(c));
        if (changed.length > 0) {
          diffTagHtml = `<div class="diff-tag">🔄 캐스팅 변경: ${changed.join(', ')}</div>`;
        }
      }

      if (castList.length > 0) prevCast = castList;
      visitsHtml += renderVisitRow(review, round, diffTagHtml, group);
    });

    html += `
      <div class="review-group" data-group-id="${group.userId}">
        <div class="review-group-header">
          <div>
            <span class="review-group-title">${nickname}</span>
            <span class="review-group-badge">${badge}</span>
          </div>
          <div class="review-group-summary">
            ${group.count}회 관람 · 평균 ⭐ ${group.avgRating.toFixed(1)}
            <span class="review-group-toggle">▾</span>
          </div>
        </div>
        ${previewHtml}
        <div class="review-group-body">
          ${visitsHtml}
        </div>
      </div>
    `;
  });

  listContainer.innerHTML = html;

  listContainer.querySelectorAll('.review-group-header, .review-group-preview').forEach(el => {
    el.addEventListener('click', () => {
      el.closest('.review-group').classList.toggle('expanded');
    });
  });

  listContainer.querySelectorAll('.existing-review-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.set-representative-btn')) return;
      openCommentModal(card.dataset.reviewId);
    });
  });

  listContainer.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLike(btn);
    });
  });

  listContainer.querySelectorAll('.set-representative-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await setRepresentativeReview(btn.dataset.reviewId, btn.dataset.userId, btn.dataset.playId);
    });
  });

  listContainer.querySelectorAll('.admin-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('관리자 권한으로 이 후기를 삭제하시겠어요?')) return;

      const { error } = await supabaseClient
        .from('reviews')
        .delete()
        .eq('id', btn.dataset.reviewId);

      if (error) {
        alert('삭제 중 오류가 발생했어요: ' + error.message);
        return;
      }

      alert('후기가 삭제되었어요.');
      loadPlayReviews(playId);
      loadPlays();
    });
  });
}

async function setRepresentativeReview(reviewId, userId, playId) {
  await supabaseClient
    .from('reviews')
    .update({ is_representative: false })
    .eq('user_id', userId)
    .eq('play_id', playId);

  const { error } = await supabaseClient
    .from('reviews')
    .update({ is_representative: true })
    .eq('id', reviewId);

  if (error) {
    alert('대표 후기 설정 중 오류가 발생했어요: ' + error.message);
    return;
  }

  loadPlayReviews(playId);
}

async function toggleLike(btn) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    alert('로그인 후 이용해주세요.');
    return;
  }

  const reviewId = btn.dataset.reviewId;
  const isLiked = btn.classList.contains('liked');
  const countEl = btn.querySelector('.like-count');

  if (isLiked) {
    await supabaseClient
      .from('review_likes')
      .delete()
      .eq('review_id', reviewId)
      .eq('user_id', user.id);

    btn.classList.remove('liked');
    countEl.textContent = parseInt(countEl.textContent) - 1;
  } else {
    const { error } = await supabaseClient
      .from('review_likes')
      .insert({ review_id: reviewId, user_id: user.id });

    if (error) {
      console.error(error);
      return;
    }

    btn.classList.add('liked');
    countEl.textContent = parseInt(countEl.textContent) + 1;
  }
}

// ===== 마이페이지 =====
function setupMyPage() {
  const myPageBtn = document.getElementById('myPageBtn');
  const modal = document.getElementById('myPageModal');
  const closeBtn = document.getElementById('closeMyPageModal');

  myPageBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      alert('로그인 후 이용해주세요.');
      document.getElementById('authModal').classList.add('active');
      return;
    }

    document.getElementById('myPageEmail').textContent = user.email;
    modal.classList.add('active');
    loadMyStats(user.id);
    loadMyReviews(user.id);
  });

  closeBtn.addEventListener('click', () => {
    modal.classList.remove('active');
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
            <button class="edit-btn"
              data-review-id="${review.id}"
              data-play-id="${review.play_id}"
              data-rating="${review.rating}"
              data-watched-date="${review.watched_date || ''}"
              data-watched-cast="${review.watched_cast || ''}"
              data-seat-info="${review.seat_info || ''}"
              data-one-line="${review.one_line_review}"
              data-detail="${review.detail_review || ''}"
              data-play-title="${playTitle}">수정</button>
            <button class="delete-btn" data-review-id="${review.id}">삭제</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  listContainer.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openReviewModal(btn.dataset.playId, btn.dataset.playTitle, {
        reviewId: btn.dataset.reviewId,
        rating: btn.dataset.rating,
        watchedDate: btn.dataset.watchedDate,
        watchedCast: btn.dataset.watchedCast,
        seatInfo: btn.dataset.seatInfo,
        oneLine: btn.dataset.oneLine,
        detail: btn.dataset.detail
      });
      document.getElementById('myPageModal').classList.remove('active');
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
      loadPlays();
    });
  });
}

// ===== 마이페이지 - 나의 관람 취향 통계 =====
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

// ===== 관리자: 연극 등록/수정 + 크레딧 저장 =====
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

// ===== 극장 상세 모달 =====
async function openVenueModal(venueId) {
  document.getElementById('reviewModal').classList.remove('active');
  document.getElementById('personModal').classList.remove('active');
  document.getElementById('venueModal').classList.add('active');
  document.getElementById('venueName').textContent = '불러오는 중...';
  document.getElementById('venueAvgRating').textContent = '';
  document.getElementById('venueBio').textContent = '';
  document.getElementById('venuePlayList').innerHTML = '';
  document.getElementById('venueBioEditBox').classList.add('hidden');

  const { data: venue } = await supabaseClient
    .from('venues')
    .select('*')
    .eq('id', venueId)
    .single();

  if (!venue) return;

  document.getElementById('venueName').textContent = venue.name;
  document.getElementById('venueBio').textContent = venue.description || '아직 소개가 없어요.';

  const { data: plays } = await supabaseClient
    .from('plays')
    .select('id, title, poster_url')
    .eq('venue_id', venueId);

  const listEl = document.getElementById('venuePlayList');
  const playIds = (plays || []).map(p => p.id);

  if (playIds.length > 0) {
    const { data: reviews } = await supabaseClient
      .from('reviews')
      .select('rating')
      .in('play_id', playIds);

    if (reviews && reviews.length > 0) {
      const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
      document.getElementById('venueAvgRating').textContent = `⭐ ${avg.toFixed(1)} (관람객 평균)`;
    }
  }

  if (!plays || plays.length === 0) {
    listEl.innerHTML = `<p class="placeholder-text">등록된 공연 정보가 없어요.</p>`;
  } else {
    listEl.innerHTML = plays.map(p => `
      <div class="person-play-card" data-play-id="${p.id}" data-play-title="${p.title}">
        <img src="${p.poster_url || 'https://placehold.co/300x450/22252d/f5f5f5?text=No+Image'}" alt="${p.title}" />
        <div>
          <div class="person-play-title">${p.title}</div>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.person-play-card').forEach(card => {
      card.addEventListener('click', () => {
        document.getElementById('venueModal').classList.remove('active');
        openReviewModal(card.dataset.playId, card.dataset.playTitle);
      });
    });
  }

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (user) {
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profile && profile.is_admin) {
      document.getElementById('venueBioEditBox').classList.remove('hidden');
      document.getElementById('venueBioInput').value = venue.description || '';
      document.getElementById('venueBioSaveBtn').onclick = async () => {
        const newDesc = document.getElementById('venueBioInput').value.trim();
        await supabaseClient.from('venues').update({ description: newDesc }).eq('id', venueId);
        document.getElementById('venueBio').textContent = newDesc || '아직 소개가 없어요.';
        alert('소개가 저장되었어요.');
      };
    }
  }
}

function setupVenueModal() {
  document.getElementById('closeVenueModal').addEventListener('click', () => {
    document.getElementById('venueModal').classList.remove('active');
  });
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

function setupAdminModal() {
  const modal = document.getElementById('adminModal');
  const openBtn = document.getElementById('adminAddBtn');
  const closeBtn = document.getElementById('closeAdminModal');
  const submitBtn = document.getElementById('adminSubmitBtn');
  const errorText = document.getElementById('adminError');

  openBtn.addEventListener('click', (e) => {
    e.preventDefault();
    editingPlayId = null;
    submitBtn.textContent = '등록하기';
    document.getElementById('adminTitle').value = '';
    document.getElementById('adminPoster').value = '';
    document.getElementById('adminVenue').value = '';
    document.getElementById('adminGenre').value = '연극';
    document.getElementById('adminDescription').value = '';
    document.getElementById('adminStartDate').value = '';
    document.getElementById('adminEndDate').value = '';
    document.getElementById('adminWriter').value = '';
    document.getElementById('adminDirector').value = '';
    document.getElementById('adminAdaptation').value = '';
    document.getElementById('adminCast').value = '';
    document.getElementById('adminPlan').value = '';
    document.getElementById('adminProduction').value = '';
    document.getElementById('adminHost').value = '';
    document.getElementById('adminSupervisor').value = '';
    modal.classList.add('active');
  });

  closeBtn.addEventListener('click', () => {
    modal.classList.remove('active');
    errorText.textContent = '';
  });

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
    modal.classList.remove('active');
    editingPlayId = null;
    submitBtn.textContent = '등록하기';

    loadPlays();
  });
}

// ===== 후기 정렬 =====
function setupReviewSort() {
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentReviewSort = btn.dataset.sort;
      if (currentPlayId) loadPlayReviews(currentPlayId);
    });
  });
}

// ===== 후기 댓글 =====
async function openCommentModal(reviewId) {
  currentCommentReviewId = reviewId;
  document.getElementById('commentModal').classList.add('active');
  document.getElementById('commentReviewDetail').innerHTML = `<p class="placeholder-text">불러오는 중...</p>`;
  document.getElementById('commentList').innerHTML = '';
  document.getElementById('commentError').textContent = '';

  const { data: review } = await supabaseClient
    .from('reviews')
    .select('*')
    .eq('id', reviewId)
    .single();

  if (!review) return;

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('nickname')
    .eq('id', review.user_id)
    .maybeSingle();

  const nickname = profile ? profile.nickname : '익명';
  const date = new Date(review.created_at).toLocaleDateString('ko-KR');

  document.getElementById('commentReviewDetail').innerHTML = `
    <div class="review-top">
      <span class="review-rating">⭐ ${review.rating.toFixed(1)} · ${nickname}</span>
      <span class="review-date">${date}</span>
    </div>
    <div class="review-one-line">${review.one_line_review}</div>
    ${review.detail_review ? `<div class="review-detail">${review.detail_review}</div>` : ''}
  `;

  loadComments(reviewId);
}

async function loadComments(reviewId) {
  const listEl = document.getElementById('commentList');
  listEl.innerHTML = `<p class="placeholder-text">불러오는 중...</p>`;

  const { data: comments, error } = await supabaseClient
    .from('review_comments')
    .select('*')
    .eq('review_id', reviewId)
    .order('created_at', { ascending: true });

  if (error) {
    listEl.innerHTML = `<p class="placeholder-text">댓글을 불러오지 못했어요.</p>`;
    return;
  }

  if (comments.length === 0) {
    listEl.innerHTML = `<p class="placeholder-text">아직 댓글이 없어요. 첫 댓글을 남겨보세요!</p>`;
    return;
  }

  const userIds = [...new Set(comments.map(c => c.user_id))];
  const { data: profiles } = await supabaseClient
    .from('profiles')
    .select('id, nickname')
    .in('id', userIds);
  const nicknameMap = {};
  (profiles || []).forEach(p => { nicknameMap[p.id] = p.nickname; });

  const { data: { user: currentUser } } = await supabaseClient.auth.getUser();

  listEl.innerHTML = comments.map(c => {
    const nickname = nicknameMap[c.user_id] || '익명';
    const date = new Date(c.created_at).toLocaleDateString('ko-KR');
    const canDelete = currentUser && currentUser.id === c.user_id;
    return `
      <div class="comment-item">
        <div class="comment-top">
          <span class="comment-nickname">${nickname}</span>
          <span class="comment-date">${date}</span>
        </div>
        <div class="comment-content">${c.content}</div>
        ${canDelete ? `<button class="comment-delete-btn" data-comment-id="${c.id}">삭제</button>` : ''}
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.comment-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('댓글을 삭제하시겠어요?')) return;
      await supabaseClient.from('review_comments').delete().eq('id', btn.dataset.commentId);
      loadComments(reviewId);
    });
  });
}

function setupCommentModal() {
  document.getElementById('closeCommentModal').addEventListener('click', () => {
    document.getElementById('commentModal').classList.remove('active');
  });

  document.getElementById('commentSubmitBtn').addEventListener('click', async () => {
    const errorText = document.getElementById('commentError');
    errorText.textContent = '';
    const input = document.getElementById('commentInput');
    const content = input.value.trim();

    if (!content) return;

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      errorText.textContent = '로그인 후 이용해주세요.';
      return;
    }

    const { error } = await supabaseClient.from('review_comments').insert({
      review_id: currentCommentReviewId,
      user_id: user.id,
      content
    });

    if (error) {
      errorText.textContent = '댓글 등록 중 오류: ' + error.message;
      return;
    }

    input.value = '';
    loadComments(currentCommentReviewId);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadPlays();
  setupSearch();
  setupGenreFilter();
  setupPlaySort();
  setupCarouselArrows();
  setupAuthModal();
  updateAuthUI();
  setupReviewModal();
  setupMyPage();
  setupAdminModal();
  setupPersonModal();
  setupVenueModal();
  setupReviewSort();
  setupCommentModal();
});