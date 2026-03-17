// artist.js v1.0 — 아티스트 페이지
(function() {
    'use strict';

    window.loadArtists = async function() {
        const list = document.getElementById('artist-list');
        if (!list) return;
        list.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--accent);">로딩 중...</p>';

        try {
            const snap = await db.collection('artists').orderBy('createdAt', 'desc').get();
            list.innerHTML = '';

            if (snap.empty) {
                list.innerHTML = `
                    <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--accent);">
                        <div style="font-size:3rem;margin-bottom:1rem;">🎵</div>
                        <p style="font-size:1rem;margin-bottom:0.5rem;">아직 등록된 아티스트가 없습니다</p>
                        <p style="font-size:0.8rem;">관리자가 아티스트를 등록하면 여기에 표시됩니다</p>
                    </div>`;
                return;
            }

            snap.forEach(doc => {
                const d = doc.data();
                const card = document.createElement('div');
                card.style.cssText = 'background:var(--bg-card,#3D2B1F);border:1px solid var(--border,#E8E0D8);border-radius:12px;overflow:hidden;cursor:pointer;transition:transform 0.2s;';
                card.onmouseenter = () => card.style.transform = 'translateY(-4px)';
                card.onmouseleave = () => card.style.transform = '';
                card.onclick = () => showArtistDetail(doc.id, d);
                card.innerHTML = `
                    <div style="height:160px;background:${d.coverColor || 'linear-gradient(135deg,#e91e63,#9c27b0)'};display:flex;align-items:center;justify-content:center;">
                        ${d.photoURL ? `<img src="${d.photoURL}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid white;">` : `<div style="font-size:3rem;">${d.emoji || '🎵'}</div>`}
                    </div>
                    <div style="padding:0.8rem;">
                        <strong style="display:block;font-size:0.95rem;margin-bottom:0.3rem;">${d.name || '이름 없음'}</strong>
                        <p style="font-size:0.75rem;color:var(--accent);margin-bottom:0.5rem;">${d.genre || ''} ${d.country ? '· ' + d.country : ''}</p>
                        <p style="font-size:0.7rem;color:var(--text-muted,#6B5744);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.bio || ''}</p>
                        ${d.supportCount ? `<p style="font-size:0.7rem;margin-top:0.4rem;"><i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${d.supportCount} 후원</p>` : ''}
                    </div>`;
                list.appendChild(card);
            });
        } catch (e) {
            console.error('[artist] Load error:', e);
            list.innerHTML = `<p style="grid-column:1/-1;text-align:center;padding:2rem;color:#e53935;">로드 실패: ${e.message}</p>`;
        }
    };

    window.showArtistDetail = function(id, data) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(61,43,31,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
        overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
        overlay.innerHTML = `
            <div style="background:var(--bg-card,#3D2B1F);border-radius:16px;max-width:500px;width:100%;max-height:85vh;overflow-y:auto;padding:1.5rem;">
                <div style="text-align:center;margin-bottom:1rem;">
                    ${data.photoURL ? `<img src="${data.photoURL}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;margin-bottom:0.8rem;">` : `<div style="font-size:4rem;margin-bottom:0.5rem;">${data.emoji || '🎵'}</div>`}
                    <h3>${data.name || '아티스트'}</h3>
                    <p style="font-size:0.85rem;color:var(--accent);">${data.genre || ''} ${data.country ? '· ' + data.country : ''}</p>
                </div>
                <p style="font-size:0.9rem;line-height:1.6;margin-bottom:1rem;">${data.bio || '소개가 없습니다.'}</p>
                ${data.links ? `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">${Object.entries(data.links).map(([k,v]) => `<a href="${v}" target="_blank" style="padding:0.3rem 0.8rem;background:var(--bg);border-radius:20px;font-size:0.8rem;text-decoration:none;">${k}</a>`).join('')}</div>` : ''}
                <button onclick="supportArtist('${id}')" class="btn-primary" style="width:100%;padding:0.8rem;"><i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 후원하기</button>
                <button onclick="this.closest('div[style*=fixed]').remove()" style="width:100%;padding:0.6rem;margin-top:0.5rem;background:none;border:1px solid var(--border);border-radius:8px;cursor:pointer;">닫기</button>
            </div>`;
        document.body.appendChild(overlay);
    };

    window.supportArtist = async function(artistId) {
        if (!currentUser) { showToast('로그인이 필요합니다', 'warning'); return; }
        showToast('후원 기능 준비 중입니다', 'info');
    };

})();
