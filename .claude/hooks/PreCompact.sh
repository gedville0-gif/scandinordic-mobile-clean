#!/bin/bash
# .claude/hooks/PreCompact.sh
# Saves a summary before Claude Code compacts context

TIMESTAMP=$(date +"%Y%m%d_%H%M")
SUMMARY_FILE=".claude/session-log.md"

echo "" >> "$SUMMARY_FILE"
echo "## Session snapshot — $TIMESTAMP" >> "$SUMMARY_FILE"
echo "Context compacted. Check CLAUDE.md for project rules." >> "$SUMMARY_FILE"

echo "💾 Session state saved to .claude/session-log.md"
