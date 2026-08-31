// ===== 연극 상세 페이지 (구 reviewModal) =====
const params = new URLSearchParams(location.search);
const currentPlayId = params.get('playId');
const editReviewId = params.get('edit');

let editingReviewId = null;
let currentReviewSort = 'latest';
let currentCommentReviewId = null;
let currentPlay = null;

async function initReviewPage() {
  if (!currentPlayId) {
    alert('연극 정보를 찾을 수 없어요.');
    location.href = 'index.html';
    return;
  }

  const { data: play } = await supabaseClient
    .from('plays')
    .select('*')
    .eq('id', currentPlayId)
    .single();

  if (!play) {
    alert('연극 정보를 찾을 수 없어요.');
    location.href = 'index.html';
    return;
  }

  currentPlay = play;
  document.getElementById('reviewPlayTitle').textContent = play.title;

  let editData = null;
  if (editReviewId) {
    const { data: review } = await supabaseClient
      .from('reviews')
      .select('*')
      .eq('id', editReviewId)
      .single();

    if (review) {
      editingReviewId = review.id;
      editData = {
        rating: review.rating,
        watchedDate: review.watched_date,
        watchedTime: review.watched_time,
        seatInfo: review.seat_info,
        oneLine: review.one_line_review,
        detail: review.detail_review
      };
    }
  }

  document.getElementById('ratingInput').value = editData ? editData.rating : 3.5;
  document.getElementById('ratingValue').textContent = editData ? editData.rating : 3.5;
  document.getElementById('watchedDateInput').value = editData ? (editData.watchedDate || '') : '';
  document.getElementById('watchedTimeInput').value = editData ? (editData.watchedTime || '') : '';
  document.getElementById('seatInput').value = editData ? (editData.seatInfo || '') : '';
  document.getElementById('oneLineInput').value = editData ? editData.oneLine : '';
  document.getElementById('detailInput').value = editData ? editData.detail : '';
  document.getElementById('reviewSubmitBtn').textContent = editData ? '수정 완료' : '후기 등록하기';

  loadPlayInfo(currentPlay);
  loadPlayReviews(currentPlayId);
  await loadRoundOptions(currentPlayId, editData);

  const editPlayBtn = document.getElementById('adminEditPlayBtn');
  const isAdmin = await isCurrentUserAdmin();
  if (isAdmin) {
    editPlayBtn.href = `admin.html?playId=${encodeURIComponent(currentPlayId)}`;
    editPlayBtn.classList.remove('hidden');
  } else {
    editPlayBtn.classList.add('hidden');
  }
}

function setupReviewForm() {
  const ratingInput = document.getElementById('ratingInput');
  const ratingValue = document.getElementById('ratingValue');
  const submitBtn = document.getElementById('reviewSubmitBtn');
  const errorText = document.getElementById('reviewError');

  ratingInput.addEventListener('input', () => {
    ratingValue.textContent = ratingInput.value;
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
    const watchedTime = document.getElementById('watchedTimeInput').value.trim() || null;
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
          watched_time: watchedTime,
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
        watched_time: watchedTime,
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

    document.getElementById('oneLineInput').value = '';
    document.getElementById('detailInput').value = '';
    document.getElementById('reviewSubmitBtn').textContent = '후기 등록하기';

    loadPlayReviews(currentPlayId);
  });
}

// 그 연극에 등록된 캐스팅 일정을 회차 버튼으로 보여주기
async function loadRoundOptions(playId, editData) {
  const roundBox = document.getElementById('roundSelectBox');
  const manualBox = document.getElementById('manualDateTimeBox');

  const { data: schedules } = await supabaseClient
    .from('cast_schedule')
    .select('performance_date, performance_time, people(name)')
    .eq('play_id', playId)
    .order('performance_date', { ascending: true });

  if (!schedules || schedules.length === 0) {
    // 등록된 일정이 없으면 회차 버튼 없이 직접 입력
    roundBox.classList.add('hidden');
    roundBox.innerHTML = '';
    manualBox.style.display = 'block';
    return;
  }

  // 날짜+시간별로 캐스팅을 묶어서 보여주기
  const groups = {};
  schedules.forEach(s => {
    const key = `${s.performance_date}_${s.performance_time || ''}`;
    if (!groups[key]) groups[key] = { date: s.performance_date, time: s.performance_time, names: [] };
    if (s.people) groups[key].names.push(s.people.name);
  });

  const sortedGroups = Object.values(groups).sort((a, b) => {
    const ak = `${a.date}_${a.time || ''}`;
    const bk = `${b.date}_${b.time || ''}`;
    return ak.localeCompare(bk);
  });

  const currentKey = editData ? `${editData.watchedDate || ''}_${editData.watchedTime || ''}` : null;

  roundBox.classList.remove('hidden');
  roundBox.innerHTML = sortedGroups.map(g => {
    const key = `${g.date}_${g.time || ''}`;
    const isSelected = key === currentKey;
    return `
      <button type="button" class="round-option-btn ${isSelected ? 'selected' : ''}" data-date="${g.date}" data-time="${g.time || ''}">
        <span class="round-option-date">${g.date} ${g.time || ''}</span>
        <span class="round-option-cast">${g.names.join(', ')}</span>
      </button>
    `;
  }).join('');

  // 직접 입력 칸도 선택 가능하게 맨 아래 추가
  roundBox.innerHTML += `
    <button type="button" class="round-option-btn" data-date="" data-time="" id="manualRoundBtn">
      직접 입력 (일정에 없는 날짜예요)
    </button>
  `;

  const hasSelectedRound = sortedGroups.some(g => `${g.date}_${g.time || ''}` === currentKey);
  manualBox.style.display = hasSelectedRound || !editData ? 'none' : 'block';
  if (!editData) manualBox.style.display = 'none';

  roundBox.querySelectorAll('.round-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      roundBox.querySelectorAll('.round-option-btn').forEach(b => b.classList.remove('selected'));

      if (btn.id === 'manualRoundBtn') {
        manualBox.style.display = 'block';
        document.getElementById('watchedDateInput').value = '';
        document.getElementById('watchedTimeInput').value = '';
        btn.classList.add('selected');
        return;
      }

      btn.classList.add('selected');
      manualBox.style.display = 'none';
      document.getElementById('watchedDateInput').value = btn.dataset.date;
      document.getElementById('watchedTimeInput').value = btn.dataset.time;
    });
  });
}

// ===== 공연 정보(크레딧) 표시 =====
async function loadPlayInfo(play) {
  const box = document.getElementById('playInfoBox');
  box.innerHTML = `<p class="placeholder-text">불러오는 중...</p>`;

  const { data: credits } = await supabaseClient
    .from('play_credits')
    .select('role, character_name, people(id, name)')
    .eq('play_id', play.id);

  const roleOrder = ['원작', '작', '연출', '각색', '출연진', '기획', '제작', '주최', '주관'];
  const grouped = {};
  (credits || []).forEach(c => {
    if (!c.people) return;
    if (!grouped[c.role]) grouped[c.role] = [];
    grouped[c.role].push(c.people);
  });

  let html = '';

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
      location.href = `person.html?id=${encodeURIComponent(btn.dataset.personId)}`;
    });
  });

  const venueBtn = box.querySelector('.venue-link-btn');
  if (venueBtn) {
    venueBtn.addEventListener('click', () => {
      location.href = `venue.html?id=${encodeURIComponent(venueBtn.dataset.venueId)}`;
    });
  }

  const { data: scheduleCheck } = await supabaseClient
    .from('cast_schedule')
    .select('id')
    .eq('play_id', play.id)
    .limit(1);

  const viewBtn = document.getElementById('viewCastScheduleBtn');
  viewBtn.classList.toggle('hidden', !scheduleCheck || scheduleCheck.length === 0);
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

  function profileLink(userId, nickname) {
    return `<span class="profile-link" data-user-id="${userId}">${nickname}</span>`;
  }

  function renderVisitRow(review, roundLabel, diffTagHtml, group) {
    const nickname = nicknameMap[review.user_id] || '익명';
    const nicknameLink = profileLink(review.user_id, nickname);
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
          <span class="review-rating">${roundLabel ? `<span class="review-visit-round">${roundLabel}</span>` : ''}⭐ ${review.rating.toFixed(1)}${roundLabel ? '' : ' · ' + nicknameLink}</span>
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
          <span class="review-rating">⭐ ${rep.rating.toFixed(1)} · ${profileLink(group.userId, nickname)}</span>
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
            <span class="review-group-title">${profileLink(group.userId, nickname)}</span>
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

  listContainer.querySelectorAll('.profile-link').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      location.href = `profile.html?id=${encodeURIComponent(el.dataset.userId)}`;
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
          <span class="comment-nickname profile-link" data-user-id="${c.user_id}">${nickname}</span>
          <span class="comment-date">${date}</span>
        </div>
        <div class="comment-content">${c.content}</div>
        ${canDelete ? `<button class="comment-delete-btn" data-comment-id="${c.id}">삭제</button>` : ''}
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.profile-link').forEach(el => {
    el.addEventListener('click', () => {
      location.href = `profile.html?id=${encodeURIComponent(el.dataset.userId)}`;
    });
  });

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

// ===== 캐스팅 일정 조회 (공개) =====
async function openViewCastScheduleModal(playId) {
  document.getElementById('viewCastScheduleModal').classList.add('active');
  const listEl = document.getElementById('viewCastScheduleList');
  listEl.innerHTML = `<p class="placeholder-text">불러오는 중...</p>`;

  const { data: schedules } = await supabaseClient
    .from('cast_schedule')
    .select('performance_date, performance_time, people(name), person_id')
    .eq('play_id', playId)
    .order('performance_date', { ascending: true });

  if (!schedules || schedules.length === 0) {
    listEl.innerHTML = `<p class="placeholder-text">등록된 캐스팅 일정이 없어요.</p>`;
    return;
  }

  const { data: credits } = await supabaseClient
    .from('play_credits')
    .select('person_id, character_name')
    .eq('play_id', playId)
    .eq('role', '출연진');

  const characterByPerson = {};
  (credits || []).forEach(c => {
    if (c.character_name) characterByPerson[c.person_id] = c.character_name;
  });

  const groups = {};
  schedules.forEach(s => {
    const key = `${s.performance_date}_${s.performance_time || ''}`;
    if (!groups[key]) groups[key] = { date: s.performance_date, time: s.performance_time, entries: [] };
    groups[key].entries.push({
      actorName: s.people ? s.people.name : '알 수 없음',
      character: characterByPerson[s.person_id] || null
    });
  });

  const sortedGroups = Object.values(groups).sort((a, b) => {
    const ak = `${a.date}_${a.time || ''}`;
    const bk = `${b.date}_${b.time || ''}`;
    return ak.localeCompare(bk);
  });

  listEl.innerHTML = sortedGroups.map(g => `
    <div class="view-schedule-group">
      <div class="view-schedule-date">${g.date} ${g.time || ''}</div>
      ${g.entries.map(e => `
        <div class="view-schedule-role-row">
          ${e.character ? `<span class="view-schedule-role-name">${e.character}</span>` : ''}
          <span>${e.actorName}</span>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function setupViewCastScheduleModal() {
  document.getElementById('viewCastScheduleBtn').addEventListener('click', () => {
    openViewCastScheduleModal(currentPlayId);
  });

  document.getElementById('closeViewCastScheduleModal').addEventListener('click', () => {
    document.getElementById('viewCastScheduleModal').classList.remove('active');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupReviewForm();
  setupReviewSort();
  setupCommentModal();
  setupViewCastScheduleModal();
  initReviewPage();
});
