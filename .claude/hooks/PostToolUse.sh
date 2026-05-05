#!/bin/bash
# .claude/hooks/PostToolUse.sh
# Fires after every file edit — catches TS errors early

TOOL="$1"

if [[ "$TOOL" == "str_replace_editor" || "$TOOL" == "create_file" ]]; then
  echo ""
  echo "🔍 Running TypeScript check..."
  cd "C:/Users/Omistaja/Desktop/scandinordic-mobile-clean" 2>/dev/null || \
  cd "$(pwd)"

  ERRORS=$(npx tsc --noEmit 2>&1 | grep -v "transactions.tsx" | grep -v "expo-file-system/legacy" | grep -v "googleVision" | grep "error TS" | head -5)

  if [ -n "$ERRORS" ]; then
    echo "❌ New TypeScript errors detected:"
    echo "$ERRORS"
    echo "→ Fix these before proceeding."
  else
    echo "✅ No new TypeScript errors."
  fi
fi
