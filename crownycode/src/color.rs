// src/color.rs
// 자체 ANSI 터미널 색상 (colored crate 대체)

pub trait Colorize {
    fn bold(&self) -> String;
    fn dimmed(&self) -> String;
    fn red(&self) -> String;
    fn green(&self) -> String;
    fn yellow(&self) -> String;
    fn bright_cyan(&self) -> String;
    fn bright_yellow(&self) -> String;
    fn bright_green(&self) -> String;
}

impl<T: ?Sized + std::fmt::Display> Colorize for T {
    fn bold(&self) -> String { format!("\x1b[1m{}\x1b[0m", self) }
    fn dimmed(&self) -> String { format!("\x1b[2m{}\x1b[0m", self) }
    fn red(&self) -> String { format!("\x1b[31m{}\x1b[0m", self) }
    fn green(&self) -> String { format!("\x1b[32m{}\x1b[0m", self) }
    fn yellow(&self) -> String { format!("\x1b[33m{}\x1b[0m", self) }
    fn bright_cyan(&self) -> String { format!("\x1b[96m{}\x1b[0m", self) }
    fn bright_yellow(&self) -> String { format!("\x1b[93m{}\x1b[0m", self) }
    fn bright_green(&self) -> String { format!("\x1b[92m{}\x1b[0m", self) }
}
