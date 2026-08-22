const SUPABASE_URL = "https://adedblsrjumckskxzsdj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkZWRibHNyanVtY2tza3h6c2RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNDA4NjEsImV4cCI6MjEwMjcxNjg2MX0._Captmo3KEc8Sv9y2oqAdH1uzZtmwI4gQ1tLvtxFLgs";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allPlays = [];

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
  renderPlays(data, 'popularPlays');
  renderPlays(data, 'latestPlays');
}

function renderPlays(plays, containerId) {
  const container = document.getElementById(containerId);

  if (!plays || plays.length === 0) {
    container.innerHTML = `<p class="placeholder-text">검색 결과가 없습니다.</p>`;
    return;
  }

  container.innerHTML = plays.map(play => `
    <div class="play-card" data-play-id="${play.id}" data-play-title="${play.title}">
      <img src="${play.poster_url || 'https://placehold.co/300x450/22252d/f5f5f5?text=No+Image'}" alt="${play.title}" />
      <div class="play-title">${play.title}</div>
      <div class="play-rating">⭐ ${play.avg_rating ? play.avg_rating.toFixed(1) : '0.0'} (${play.review_count || 0}명)</div>
    </div>
  `).join('');

  // 카드마다 클릭 이벤트 연결 (후기 작성 모달 열기)
  container.querySelectorAll('.play-card').forEach(card => {
    card.addEventListener('click', () => {
      openReviewModal(card.dataset.playId, card.dataset.playTitle);
    });
  });
}

function setupSearch() {
  const searchInput = document.getElementById('searchInput');

  searchInput.addEventListener('input', (e) => {
    const keyword = e.target.value.trim().toLowerCase();

    if (keyword === '') {
      renderPlays(allPlays, 'popularPlays');
      renderPlays(allPlays, 'latestPlays');
      document.querySelector('.hero').style.display = 'block';
      document.querySelector('#latestPlays').closest('.play-section').style.display = 'block';
      document.querySelector('#popularPlays').closest('.play-section').querySelector('.section-title').textContent = '🔥 인기 연극';
      return;
    }

    const filtered = allPlays.filter(play =>
      play.title.toLowerCase().includes(keyword)
    );

    document.querySelector('.hero').style.display = 'none';
    document.querySelector('#latestPlays').closest('.play-section').style.display = 'none';
    document.querySelector('#popularPlays').closest('.play-section').querySelector('.section-title').textContent = `🔍 "${e.target.value}" 검색 결과 (${filtered.length}건)`;

    renderPlays(filtered, 'popularPlays');
  });
}

// ===== 6. 로그인/회원가입 로직 =====
let isSignupMode = false;

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

      // 회원가입 성공 → 프로필(닉네임) 저장
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

// 현재 로그인 상태에 따라 헤더 UI 바꾸기
async function updateAuthUI() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  const loginBtn = document.getElementById('loginBtn');

  if (user) {
    loginBtn.textContent = '로그아웃';
    loginBtn.onclick = async (e) => {
      e.preventDefault();
      await supabaseClient.auth.signOut();
      updateAuthUI();
      alert('로그아웃 되었습니다.');
    };
  } else {
    loginBtn.textContent = '로그인';
    loginBtn.onclick = (e) => {
      e.preventDefault();
      document.getElementById('authModal').classList.add('active');
    };
  }
}

// ===== 7. 후기 작성 로직 =====
let currentPlayId = null;

function setupReviewModal() {
  const modal = document.getElementById('reviewModal');
  const closeBtn = document.getElementById('closeReviewModal');
  const ratingInput = document.getElementById('ratingInput');
  const ratingValue = document.getElementById('ratingValue');
  const submitBtn = document.getElementById('reviewSubmitBtn');
  const errorText = document.getElementById('reviewError');

  // 슬라이더 움직일 때 숫자 실시간 반영
  ratingInput.addEventListener('input', () => {
    ratingValue.textContent = ratingInput.value;
  });

  closeBtn.addEventListener('click', () => {
    modal.classList.remove('active');
    errorText.textContent = '';
  });

  submitBtn.addEventListener('click', async () => {
    errorText.textContent = '';

    // 1. 로그인 확인
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      errorText.textContent = '로그인 후 이용해주세요.';
      return;
    }

    const rating = parseFloat(ratingInput.value);
    const oneLine = document.getElementById('oneLineInput').value.trim();
    const detail = document.getElementById('detailInput').value.trim();

    if (!oneLine) {
      errorText.textContent = '한 줄 평을 입력해주세요.';
      return;
    }

    // 2. 후기 저장
    const { error: insertError } = await supabaseClient.from('reviews').insert({
      play_id: currentPlayId,
      user_id: user.id,
      rating: rating,
      one_line_review: oneLine,
      detail_review: detail
    });

    if (insertError) {
      errorText.textContent = '후기 등록 중 오류가 발생했어요: ' + insertError.message;
      return;
    }

    alert('후기가 등록되었어요! 감사합니다 🎭');
    loadplayreviews(currentPlayId);
    modal.classList.remove('active');
    document.getElementById('oneLineInput').value = '';
    document.getElementById('detailInput').value = '';

    loadPlays(); // 목록 새로고침 (별점/후기수 반영)
  });
}

function openReviewModal(playId, playTitle) {
  currentPlayId = playId;
  document.getElementById('reviewPlayTitle').textContent = playTitle;
  document.getElementById('ratingInput').value = 3.5;
  document.getElementById('ratingValue').textContent = 3.5;
  document.getElementById('oneLineInput').value = '';
  document.getElementById('detailInput').value = '';
  document.getElementById('reviewError').textContent = '';
  document.getElementById('reviewModal').classList.add('active');

  loadPlayReviews(playId);
}

// 특정 연극의 기존 후기 목록 불러오기
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

  // 후기 작성자들의 닉네임 가져오기
  const userIds = [...new Set(reviews.map(r => r.user_id))];
  const { data: profiles } = await supabaseClient
    .from('profiles')
    .select('id, nickname')
    .in('id', userIds);

  const nicknameMap = {};
  (profiles || []).forEach(p => { nicknameMap[p.id] = p.nickname; });

  listContainer.innerHTML = reviews.map(review => {
    const date = new Date(review.created_at).toLocaleDateString('ko-KR');
    const nickname = nicknameMap[review.user_id] || '익명';
    return `
      <div class="existing-review-card">
        <div class="review-top">
          <span class="review-rating">⭐ ${review.rating.toFixed(1)} · ${nickname}</span>
          <span class="review-date">${date}</span>
        </div>
        <div class="review-one-line">${review.one_line_review}</div>
        ${review.detail_review ? `<div class="review-detail">${review.detail_review}</div>` : ''}
      </div>
    `;
  }).join('');
}

// ===== 8. 마이페이지 로직 =====
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
    loadMyReviews(user.id);
  });

  closeBtn.addEventListener('click', () => {
    modal.classList.remove('active');
  });
}

async function loadMyReviews(userId) {
  const listContainer = document.getElementById('myReviewList');
  const countEl = document.getElementById('myReviewCount');

  // 내 후기 + 연극 제목을 함께 가져오기 (plays 테이블과 join)
  const { data: reviews, error } = await supabaseClient
    .from('reviews')
    .select('*, plays(title, poster_url)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

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
    const date = new Date(review.created_at).toLocaleDateString('ko-KR');
    return `
      <div class="my-review-card">
        <div class="review-play-title">${playTitle}</div>
        <div class="review-rating">⭐ ${review.rating.toFixed(1)}</div>
        <div class="review-one-line">"${review.one_line_review}"</div>
        <div class="review-date">${date}</div>
      </div>
    `;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  loadPlays();
  setupSearch();
  setupAuthModal();
  updateAuthUI();
  setupReviewModal();
  setupMyPage();
});