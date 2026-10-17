# Transparent to-do controls

The shared PH Core editor keeps the native BlockNote checkbox and its checked,
disabled, change and keyboard semantics. BlockNote 0.55.0 has no separate checkbox
fill/tick paint option, so Core scopes a presentation-only CSS layer to its
checkListItem inputs. Both states have transparent fill; checked adds only a
small grey tick. The existing muted done text and strikethrough are unchanged.
Keyboard focus stays visible; forced-colors restores the native appearance.

No document conversion, production task writes or data migration is required.
