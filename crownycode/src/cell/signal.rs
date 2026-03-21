// crownycode/src/cell/signal.rs
// ═══════════════════════════════════════════════════════════════
// 신뢰 신호 — 셀 간 메시지 패싱 메커니즘
// ═══════════════════════════════════════════════════════════════
//
// 핵심 차이:
//   현재 구현: SQL UPDATE cells SET confidence = confidence - 0.1
//   새 구현: 셀이 이웃에게 '신호'를 보내고, 각 셀이 자율적으로
//            자기 상태를 갱신한다.
//
// 이것이 크라우니셀로직이 "관계형 DB 위의 그래프 흉내"가 아니라
// "셀이 곧 관계망"인 이유다.

use serde::{Deserialize, Serialize};
use super::CellId;

/// 신호 종류
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SignalKind {
    /// 신뢰 강화 (사용 확인, 테스트 통과 등)
    Reinforce,
    /// 반박 (버그 발견, 의도 충돌 등)
    Refute,
    /// 자연 감쇠 (시간 경과, 비활성)
    Decay,
}

impl SignalKind {
    /// 에너지에 적용할 계수
    ///
    /// Reinforce: +1.0 (에너지 증가)
    /// Refute:    -1.0 (에너지 감소)
    /// Decay:     -0.5 (완만한 감소)
    pub fn factor(&self) -> f32 {
        match self {
            SignalKind::Reinforce =>  1.0,
            SignalKind::Refute    => -1.0,
            SignalKind::Decay     => -0.5,
        }
    }
}

/// 신뢰 신호 — 셀 간 전달되는 메시지
///
/// 셀 A에 반박이 등록되면:
/// 1. A 자체의 energy/trit_state 갱신
/// 2. A의 edges를 따라 이웃 셀들에게 감쇠된 신호 전달
/// 3. 각 이웃이 자기 energy를 자율적으로 갱신
/// 4. 깊이(depth)까지 반복
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct TrustSignal {
    /// 신호 종류
    pub kind: SignalKind,
    /// 신호 강도 (0.0~1.0)
    pub strength: f32,
    /// 신호 원천 셀
    pub origin: CellId,
    /// 현재 전파 깊이 (0부터 시작, 증가)
    pub depth: u32,
}

impl TrustSignal {
    /// 새 신호 생성
    pub fn new(kind: SignalKind, strength: f32, origin: CellId) -> Self {
        Self {
            kind,
            strength: strength.clamp(0.0, 1.0),
            origin,
            depth: 0,
        }
    }

    /// 엣지를 따라 감쇠된 신호 생성
    ///
    /// 감쇠 규칙:
    /// - 깊이가 1 증가할 때마다 strength × 0.6
    /// - 엣지 weight가 -1이면 신호 종류가 반전됨
    ///   (Reinforce 신호가 Refutes 엣지를 타면 Refute가 됨)
    /// - 엣지 weight가 0이면 신호 차단 (strength = 0)
    pub fn attenuate(&self, edge_weight: i8) -> TrustSignal {
        let decay_factor = 0.6;

        let (new_kind, new_strength) = match edge_weight {
            1  => (self.kind, self.strength * decay_factor),
            0  => (self.kind, 0.0), // 중립 엣지: 신호 차단
            -1 => {
                // 반전: 강화→반박, 반박→강화
                let inverted = match self.kind {
                    SignalKind::Reinforce => SignalKind::Refute,
                    SignalKind::Refute    => SignalKind::Reinforce,
                    SignalKind::Decay     => SignalKind::Decay,
                };
                (inverted, self.strength * decay_factor)
            }
            _  => (self.kind, self.strength * decay_factor),
        };

        TrustSignal {
            kind: new_kind,
            strength: new_strength.clamp(0.0, 1.0),
            origin: self.origin,
            depth: self.depth + 1,
        }
    }

    /// 유효한 신호인지 (strength가 0보다 큰지)
    pub fn is_effective(&self) -> bool {
        self.strength > 0.01
    }
}

// ── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_signal_creation() {
        let sig = TrustSignal::new(SignalKind::Reinforce, 0.5, 42);
        assert_eq!(sig.kind, SignalKind::Reinforce);
        assert_eq!(sig.strength, 0.5);
        assert_eq!(sig.origin, 42);
        assert_eq!(sig.depth, 0);
    }

    #[test]
    fn test_signal_strength_clamp() {
        let sig = TrustSignal::new(SignalKind::Reinforce, 1.5, 0);
        assert_eq!(sig.strength, 1.0);
        let sig2 = TrustSignal::new(SignalKind::Refute, -0.5, 0);
        assert_eq!(sig2.strength, 0.0);
    }

    #[test]
    fn test_attenuate_positive_edge() {
        let sig = TrustSignal::new(SignalKind::Reinforce, 1.0, 0);
        let attenuated = sig.attenuate(1); // weight +1
        assert_eq!(attenuated.kind, SignalKind::Reinforce);
        assert!((attenuated.strength - 0.6).abs() < 0.01);
        assert_eq!(attenuated.depth, 1);
    }

    #[test]
    fn test_attenuate_neutral_edge_blocks() {
        let sig = TrustSignal::new(SignalKind::Reinforce, 1.0, 0);
        let attenuated = sig.attenuate(0); // weight 0 → 차단
        assert_eq!(attenuated.strength, 0.0);
        assert!(!attenuated.is_effective());
    }

    #[test]
    fn test_attenuate_negative_edge_inverts() {
        let sig = TrustSignal::new(SignalKind::Reinforce, 1.0, 0);
        let attenuated = sig.attenuate(-1); // weight -1 → 반전
        assert_eq!(attenuated.kind, SignalKind::Refute);
        assert!((attenuated.strength - 0.6).abs() < 0.01);
    }

    #[test]
    fn test_attenuate_refute_inverts_to_reinforce() {
        let sig = TrustSignal::new(SignalKind::Refute, 0.8, 0);
        let attenuated = sig.attenuate(-1);
        assert_eq!(attenuated.kind, SignalKind::Reinforce);
    }

    #[test]
    fn test_decay_not_inverted() {
        let sig = TrustSignal::new(SignalKind::Decay, 0.5, 0);
        let attenuated = sig.attenuate(-1);
        assert_eq!(attenuated.kind, SignalKind::Decay); // Decay는 반전 안 됨
    }

    #[test]
    fn test_double_attenuation() {
        let sig = TrustSignal::new(SignalKind::Reinforce, 1.0, 0);
        let a1 = sig.attenuate(1);
        let a2 = a1.attenuate(1);
        assert_eq!(a2.depth, 2);
        assert!((a2.strength - 0.36).abs() < 0.01); // 1.0 * 0.6 * 0.6
    }

    #[test]
    fn test_signal_kind_factors() {
        assert_eq!(SignalKind::Reinforce.factor(), 1.0);
        assert_eq!(SignalKind::Refute.factor(), -1.0);
        assert_eq!(SignalKind::Decay.factor(), -0.5);
    }

    #[test]
    fn test_is_effective() {
        let strong = TrustSignal::new(SignalKind::Reinforce, 0.5, 0);
        assert!(strong.is_effective());
        let weak = TrustSignal::new(SignalKind::Reinforce, 0.005, 0);
        assert!(!weak.is_effective());
    }
}
