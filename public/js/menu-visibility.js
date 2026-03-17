// menu-visibility.js v1.0 — 권한별 메뉴/페이지 가시성 관리
// data-min-level="N" 속성으로 최소 권한 레벨 설정
// data-feature="name" 속성으로 개별 기능 토글 (Firestore admin_config/features)
//
// 레벨 체계:
//   -1: 비로그인
//    0: 일반 유저 (가입 완료)
//    1: 스태프
//    2: 매니저
//    3: 디렉터
//    4: 부관리자
//    5: 관리자
//    6: 수퍼관리자
//
// 사용법:
//   <a data-min-level="0" ...>지갑</a>     ← 로그인 유저 이상
//   <a data-min-level="3" ...>트레이딩</a> ← 디렉터 이상
//   <section data-min-level="5" ...>관리</section> ← 관리자 이상
//   <div data-feature="beauty">뷰티</div>  ← features.beauty == true일 때만

(function() {
    'use strict';

    // Default feature flags (can be overridden from Firestore)
    const DEFAULT_FEATURES = {
        // 안정 (일반 유저에게 노출)
        home: true,
        wallet: true,
        social: true,
        messenger: true,
        settings: true,
        
        // 베타 (기본 숨김, 관리자가 활성화)
        trading: false,
        ai_assistant: false,
        beauty: false,
        brain: false,
        movement: false,
        care: false,
        reels: false,
        art: false,
        books: false,
        mall: false,
        energy: false,
        business: false,
        artist: false,
    };

    let featureFlags = { ...DEFAULT_FEATURES };

    // Load feature flags from Firestore
    async function loadFeatureFlags() {
        try {
            if (typeof db === 'undefined') return;
            const doc = await db.collection('admin_config').doc('features').get();
            if (doc.exists) {
                const data = doc.data();
                // Merge: Firestore values override defaults
                Object.keys(data).forEach(key => {
                    if (typeof data[key] === 'boolean') {
                        featureFlags[key] = data[key];
                    }
                });
            }
        } catch (e) {
            console.warn('[menu-vis] Feature flags load error:', e.message);
        }
    }

    // Apply visibility to all elements with data-min-level or data-feature
    function applyVisibility(userLevel) {
        if (typeof userLevel === 'undefined') {
            userLevel = (typeof currentUserLevel !== 'undefined') ? currentUserLevel : -1;
        }

        // data-min-level elements
        document.querySelectorAll('[data-min-level]').forEach(el => {
            const minLevel = parseInt(el.getAttribute('data-min-level'));
            if (userLevel >= minLevel) {
                el.style.removeProperty('display');
                el.classList.remove('hidden-by-level');
            } else {
                el.style.display = 'none';
                el.classList.add('hidden-by-level');
            }
        });

        // data-feature elements
        document.querySelectorAll('[data-feature]').forEach(el => {
            const feature = el.getAttribute('data-feature');
            // Super admins (6+) see everything regardless of feature flags
            if (userLevel >= 6 || featureFlags[feature]) {
                el.style.removeProperty('display');
                el.classList.remove('hidden-by-feature');
            } else {
                el.style.display = 'none';
                el.classList.add('hidden-by-feature');
            }
        });

        console.log(`[menu-vis] Applied: level=${userLevel}, features=${Object.keys(featureFlags).filter(k => featureFlags[k]).length} active`);
    }

    // Initialize: load flags then apply
    async function init() {
        await loadFeatureFlags();
        
        // Apply immediately with current level
        const level = (typeof currentUserLevel !== 'undefined') ? currentUserLevel : -1;
        applyVisibility(level);
    }

    // Re-apply when auth state changes (called from config.js after loadUserLevel)
    window.applyMenuVisibility = function(level) {
        applyVisibility(level);
    };

    // Expose for admin panel
    window.getFeatureFlags = () => ({ ...featureFlags });
    window.setFeatureFlag = async function(feature, enabled) {
        featureFlags[feature] = enabled;
        try {
            await db.collection('admin_config').doc('features').set(
                { [feature]: enabled },
                { merge: true }
            );
            applyVisibility();
            if (typeof showToast === 'function') {
                showToast(`${feature}: ${enabled ? '✅ 활성화' : '❌ 비활성화'}`, 'success');
            }
        } catch (e) {
            if (typeof showToast === 'function') showToast('저장 실패: ' + e.message, 'error');
        }
    };

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
