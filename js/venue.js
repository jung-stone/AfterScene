// ===== 극장 상세 페이지 (구 venueModal) =====
const params = new URLSearchParams(location.search);
const venueId = params.get('id');

async function initVenuePage() {
  if (!venueId) {
    alert('극장 정보를 찾을 수 없어요.');
    location.href = 'index.html';
    return;
  }

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

  if (!venue) {
    document.getElementById('venueName').textContent = '극장을 찾을 수 없어요.';
    return;
  }

  document.getElementById('venueName').textContent = venue.name;
  document.getElementById('venueBio').textContent = venue.description || '아직 소개가 없어요.';
  setupFollowButton('venue', venueId);

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
      <div class="person-play-card" data-play-id="${p.id}">
        <img src="${p.poster_url || 'https://placehold.co/300x450/22252d/f5f5f5?text=No+Image'}" alt="${p.title}" />
        <div>
          <div class="person-play-title">${p.title}</div>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.person-play-card').forEach(card => {
      card.addEventListener('click', () => {
        location.href = `review.html?playId=${encodeURIComponent(card.dataset.playId)}`;
      });
    });
  }

  const isAdmin = await isCurrentUserAdmin();
  if (isAdmin) {
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

document.addEventListener('DOMContentLoaded', () => {
  initVenuePage();
});
