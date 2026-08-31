// ===== 모든 페이지에서 공통으로 쓰는 Supabase 클라이언트 / 로그인 UI =====
const SUPABASE_URL = "https://adedblsrjumckskxzsdj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkZWRibHNyanVtY2tza3h6c2RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNDA4NjEsImV4cCI6MjEwMjcxNjg2MX0._Captmo3KEc8Sv9y2oqAdH1uzZtmwI4gQ1tLvtxFLgs";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let isSignupMode = false;

// 로그인/회원가입 모달은 헤더가 있는 모든 페이지에 공통으로 삽입한다.
function injectAuthModal() {
  if (document.getElementById('authModal')) return;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal-overlay" id="authModal">
      <div class="modal-box">
        <button class="modal-close" id="closeModal">&times;</button>
        <h2 id="modalTitle">로그인</h2>

        <input type="text" id="authNickname" placeholder="닉네임 (2~12자)" class="hidden" maxlength="12" />
        <input type="email" id="authEmail" placeholder="이메일" />
        <input type="password" id="authPassword" placeholder="비밀번호 (6자 이상)" />

        <button class="modal-submit-btn" id="authSubmitBtn">로그인</button>

        <p class="modal-switch-text">
          계정이 없으신가요? <a href="#" id="switchToSignup">회원가입</a>
        </p>

        <p class="modal-error" id="authError"></p>
      </div>
    </div>
  `;
  document.body.appendChild(wrap.firstElementChild);
}

function setupAuthModal() {
  const modal = document.getElementById('authModal');
  const loginBtn = document.getElementById('loginBtn');
  const closeModal = document.getElementById('closeModal');
  const switchToSignup = document.getElementById('switchToSignup');
  const submitBtn = document.getElementById('authSubmitBtn');
  const modalTitle = document.getElementById('modalTitle');
  const errorText = document.getElementById('authError');
  const nicknameInput = document.getElementById('authNickname');

  if (!modal || !loginBtn) return;

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
  if (!loginBtn) return;

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

    if (adminBtn) adminBtn.classList.toggle('hidden', !(profile && profile.is_admin));
  } else {
    loginBtn.textContent = '로그인';
    loginBtn.onclick = (e) => {
      e.preventDefault();
      document.getElementById('authModal').classList.add('active');
    };
    if (adminBtn) adminBtn.classList.add('hidden');
  }
}

// 현재 로그인한 사용자가 관리자인지 확인
async function isCurrentUserAdmin() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  return !!(profile && profile.is_admin);
}

// 로그인이 필요한 페이지(마이페이지 등) 진입 시 사용
async function requireLogin(message) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    alert(message || '로그인 후 이용해주세요.');
    location.href = 'index.html';
    return null;
  }
  return user;
}

// ===== 팔로우 (배우/공연장 찜) =====
async function isFollowing(entityType, entityId) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return false;

  const { data } = await supabaseClient
    .from('follows')
    .select('id')
    .eq('user_id', user.id)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle();

  return !!data;
}

// 반환값: 실제로 팔로우 상태가 바뀌었으면 true, 취소(로그인 필요/오류)면 false
async function toggleFollow(entityType, entityId, btnEl) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    alert('로그인 후 이용해주세요.');
    document.getElementById('authModal').classList.add('active');
    return false;
  }

  const isFollowingNow = btnEl.classList.contains('following');

  if (isFollowingNow) {
    const { error } = await supabaseClient
      .from('follows')
      .delete()
      .eq('user_id', user.id)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId);

    if (error) {
      alert('팔로우 취소 중 오류가 발생했어요: ' + error.message);
      return false;
    }

    btnEl.classList.remove('following');
    btnEl.textContent = '☆ 팔로우';
  } else {
    const { error } = await supabaseClient
      .from('follows')
      .insert({ user_id: user.id, entity_type: entityType, entity_id: entityId });

    if (error) {
      alert('팔로우 중 오류가 발생했어요: ' + error.message);
      return false;
    }

    btnEl.classList.add('following');
    btnEl.textContent = '★ 팔로우 중';
  }

  return true;
}

// 해당 대상(배우/공연장 등)을 팔로우하고 있는 사람 수
async function getFollowerCount(entityType, entityId) {
  const { count, error } = await supabaseClient
    .from('follows')
    .select('id', { count: 'exact', head: true })
    .eq('entity_type', entityType)
    .eq('entity_id', entityId);

  if (error) {
    console.error('팔로워 수 조회 오류:', error);
    return 0;
  }
  return count || 0;
}

async function setupFollowButton(entityType, entityId) {
  const btn = document.getElementById('followBtn');
  if (!btn) return;

  const countEl = document.getElementById('followCount');

  const renderCount = async () => {
    if (!countEl) return;
    const count = await getFollowerCount(entityType, entityId);
    countEl.textContent = `팔로워 ${count}명`;
  };

  const [following] = await Promise.all([
    isFollowing(entityType, entityId),
    renderCount()
  ]);

  btn.classList.toggle('following', following);
  btn.textContent = following ? '★ 팔로우 중' : '☆ 팔로우';
  btn.classList.remove('hidden');
  if (countEl) countEl.classList.remove('hidden');

  btn.addEventListener('click', async () => {
    const changed = await toggleFollow(entityType, entityId, btn);
    if (changed) renderCount();
  });
}

// ===== 공유하기 버튼: 현재 페이지 링크를 클립보드에 복사 =====
function setupShareButton() {
  const btn = document.getElementById('shareBtn');
  if (!btn) return;

  btn.classList.remove('hidden');

  btn.addEventListener('click', async () => {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      alert('링크가 복사되었어요! 원하는 곳에 붙여넣어 공유해보세요.');
    } catch (e) {
      prompt('아래 링크를 복사해주세요.', url);
    }
  });
}

// 뒤로가기 링크: 같은 사이트 안에서 넘어온 경우 브라우저 히스토리로, 아니면 목록으로
function setupBackLink() {
  const backLink = document.getElementById('backLink');
  if (!backLink) return;

  backLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (document.referrer && document.referrer.indexOf(location.origin) === 0) {
      history.back();
    } else {
      location.href = 'index.html';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  injectAuthModal();
  setupAuthModal();
  updateAuthUI();
  setupBackLink();
  setupShareButton();
});
