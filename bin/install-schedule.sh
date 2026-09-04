#!/usr/bin/env bash
# Installs a macOS LaunchAgent that runs the bot once a day.
# launchd (not cron) because it catches up on a missed run if the Mac was asleep.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.journalbot.daily"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE_BIN="$(command -v node)"
HOUR=$(node -p "require('$ROOT/config.json').schedule.hour")
MIN=$(node -p "require('$ROOT/config.json').schedule.minute")

mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/state"

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$ROOT/src/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(dirname "$NODE_BIN"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>$HOUR</integer>
    <key>Minute</key><integer>$MIN</integer>
  </dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$ROOT/state/launchd.out.log</string>
  <key>StandardErrorPath</key><string>$ROOT/state/launchd.err.log</string>
</dict>
</plist>
PLISTEOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

printf '\nScheduled: %02d:%02d daily.\n' "$HOUR" "$MIN"
echo "  plist:  $PLIST"
echo "  logs:   $ROOT/state/launchd.{out,err}.log"
echo "  test:   launchctl start $LABEL"
echo "  remove: launchctl unload $PLIST && rm $PLIST"
echo
echo "Note: launchd only fires while you are logged in. If the Mac is asleep at"
printf '%02d:%02d, the run happens on the next wake — before midnight, it still counts.\n' "$HOUR" "$MIN"
