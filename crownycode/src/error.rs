// src/error.rs — 자체 에러 타입 (anyhow 대체)
pub type Result<T> = std::result::Result<T, CrownyError>;

#[derive(Debug)]
pub enum CrownyError {
    Io(std::io::Error),
    Msg(String),
}

impl std::fmt::Display for CrownyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CrownyError::Io(e) => write!(f, "{}", e),
            CrownyError::Msg(s) => write!(f, "{}", s),
        }
    }
}

impl std::error::Error for CrownyError {}

impl From<std::io::Error> for CrownyError {
    fn from(e: std::io::Error) -> Self { CrownyError::Io(e) }
}

impl From<String> for CrownyError {
    fn from(s: String) -> Self { CrownyError::Msg(s) }
}

impl From<&str> for CrownyError {
    fn from(s: &str) -> Self { CrownyError::Msg(s.to_string()) }
}

// For serde_json errors (when claude feature is on)
#[cfg(feature = "claude")]
impl From<serde_json::Error> for CrownyError {
    fn from(e: serde_json::Error) -> Self { CrownyError::Msg(e.to_string()) }
}

#[cfg(feature = "claude")]
impl From<reqwest::Error> for CrownyError {
    fn from(e: reqwest::Error) -> Self { CrownyError::Msg(e.to_string()) }
}

/// Helper macro like anyhow::anyhow!
macro_rules! err {
    ($($arg:tt)*) => {
        $crate::error::CrownyError::Msg(format!($($arg)*))
    };
}
pub(crate) use err;

/// Helper macro like anyhow::bail!
macro_rules! bail {
    ($($arg:tt)*) => {
        return Err($crate::error::err!($($arg)*))
    };
}
pub(crate) use bail;
