#!/usr/bin/env bash
# Cài skill event-email-rsvp cho Claude Code / Codex / Antigravity.
#
#   ./install.sh                     cài cấp người dùng cho mọi agent có trên máy (~/.claude, ~/.codex|~/.agents, ~/.gemini)
#   ./install.sh --claude --codex    chỉ cài cho agent được chọn
#   ./install.sh --project ~/du-an   cài vào 1 dự án: <dự án>/.claude/skills + <dự án>/.agents/skills
#   ./install.sh --link              tạo symlink tới repo thay vì chép (git pull là skill tự cập nhật)
#   ./install.sh --uninstall         gỡ khỏi các vị trí trên
set -euo pipefail

SKILL=event-email-rsvp
REPO="$(cd "$(dirname "$0")" && pwd)"
SRC="$REPO/skills/$SKILL"
MODE=copy
PROJECT=''
UNINSTALL=0
WANT=()

usage() { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --claude|--codex|--antigravity) WANT+=("${1#--}") ;;
    --all) WANT=(claude codex antigravity) ;;
    --project) [ $# -ge 2 ] || usage 1; PROJECT="$2"; shift ;;
    --link) MODE=link ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help) usage 0 ;;
    *) echo "Không hiểu tham số: $1" >&2; usage 1 ;;
  esac
  shift
done

[ -f "$SRC/SKILL.md" ] || { echo "Không thấy $SRC/SKILL.md — chạy script từ thư mục repo." >&2; exit 1; }

has() { local x; for x in "${WANT[@]:-}"; do [ "$x" = "$1" ] && return 0; done; return 1; }

# Danh sách thư mục skills đích
DIRS=()
if [ -n "$PROJECT" ]; then
  [ -d "$PROJECT" ] || { echo "Không có thư mục dự án: $PROJECT" >&2; exit 1; }
  PROJECT="$(cd "$PROJECT" && pwd)"
  if [ ${#WANT[@]} -eq 0 ] || has claude; then DIRS+=("$PROJECT/.claude/skills"); fi
  # Codex và Antigravity cùng đọc <dự án>/.agents/skills
  if [ ${#WANT[@]} -eq 0 ] || has codex || has antigravity; then DIRS+=("$PROJECT/.agents/skills"); fi
else
  if has claude || { [ ${#WANT[@]} -eq 0 ] && [ -d "$HOME/.claude" ]; }; then DIRS+=("$HOME/.claude/skills"); fi
  if has codex || { [ ${#WANT[@]} -eq 0 ] && { [ -d "$HOME/.codex" ] || [ -d "$HOME/.agents" ]; }; }; then DIRS+=("$HOME/.agents/skills"); fi
  if has antigravity || { [ ${#WANT[@]} -eq 0 ] && [ -d "$HOME/.gemini" ]; }; then DIRS+=("$HOME/.gemini/config/skills"); fi
fi

if [ ${#DIRS[@]} -eq 0 ]; then
  echo "Không thấy Claude Code (~/.claude), Codex (~/.codex, ~/.agents) hay Antigravity (~/.gemini)." >&2
  echo "Chọn rõ: ./install.sh --claude | --codex | --antigravity, hoặc --project <thư mục dự án>." >&2
  exit 1
fi

# Chỉ ghi đè / xóa đúng skill này (symlink hoặc thư mục có SKILL.md name: event-email-rsvp)
is_ours() {
  [ -L "$1" ] && return 0
  [ -f "$1/SKILL.md" ] && grep -q "^name: $SKILL\$" "$1/SKILL.md"
}

for d in "${DIRS[@]}"; do
  dest="$d/$SKILL"
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    if ! is_ours "$dest"; then
      echo "Bỏ qua $dest: đã có thư mục khác cùng tên (không phải skill này)." >&2
      continue
    fi
    rm -rf "$dest"
    existed=1
  fi
  if [ "$UNINSTALL" -eq 1 ]; then
    [ "${existed:-0}" -eq 1 ] && echo "Đã gỡ: $dest"
    existed=0
    continue
  fi
  mkdir -p "$d"
  if [ "$MODE" = link ]; then
    ln -s "$SRC" "$dest"
  else
    cp -R "$SRC" "$dest"
    rm -rf "$dest/evals"   # bộ test của skill chỉ cần khi phát triển skill
  fi
  echo "Đã cài ($MODE): $dest"
done

[ "$UNINSTALL" -eq 1 ] || echo "Xong. Mở phiên agent mới để skill được nạp (Claude Code: /skills để kiểm tra)."
