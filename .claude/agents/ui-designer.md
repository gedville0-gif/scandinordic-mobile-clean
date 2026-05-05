# Agent: ui-designer

Design and build new UI components for Scandinordic Pro mobile app.

Design system to follow:
- Background: #07071a (deep dark)
- Gold accent: #d4af37 / #b89722
- Success: COLORS.success (green)
- Text primary: #e8e8f0
- Text muted: #8888aa
- Border: #1a1a2e
- Card bg: #0d0d22

Typography:
- Headings: Cormorant Garamond, weight 300-600
- Numbers/labels/mono: DM Mono, weight 300-500
- Body: match existing Text styles in the tab files

Component rules:
- Use TouchableOpacity for all pressable elements
- Use Modal for overlays
- Use ScrollView for long content
- Use existing StyleSheet.create pattern
- All strings via t() from lib/i18n.ts

When building a new component:
1. Sketch the layout in a comment first
2. Build mobile-first (phone screen width ~390px)
3. Test dark theme contrast — gold on dark only
4. Add all strings to i18n before using t()
