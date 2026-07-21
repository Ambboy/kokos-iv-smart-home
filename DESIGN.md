# Design System

## Direction

Quiet architectural control room: cool graphite interface surfaces frame a warm, materially faithful interior. The 3D apartment is always the visual anchor; controls behave like precise instruments rather than decorative cards.

## Color

- Canvas: `#0b0f0f`
- Elevated canvas: `#111716`
- Panel: `rgba(18, 25, 24, 0.86)`
- Primary text: `#eef2ee`
- Secondary text: `#98a39f`
- Hairline: `rgba(238, 242, 238, 0.12)`
- Accent / selection: `#9dc3b3`
- Confirmed: `#83c7a3`
- Pending: `#d7b870`
- Error: `#e58c82`
- Offline: `#707a77`

Scene colors are source-derived and separate from UI semantics: dark Edinburgh oak, light veined stone, warm greige walls, black profiles and restrained bronze hardware.

## Typography

One neutral sans-serif stack: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Fixed product scale from 11 px metadata to 24 px headings; sentence case; tabular figures for areas and device values.

## Layout

- Desktop: 68 px top bar, 244 px room rail, full-bleed WebGL stage, context inspector up to 356 px.
- Tablet: compact room rail and bottom scene controls.
- Mobile: full stage with two bottom sheets; never exceed viewport width.
- Minimum interactive target: 44×44 px.

## Components

- Top status line with project title, demo badge and connection state.
- Three-mode segmented control: Overview, Rooms, Devices.
- Room rail with area and confidence marker.
- Device rows with explicit command state and physical value.
- Scenario buttons for Day, Evening and Away.
- Debug tray for source overlay, bounds, collision markers and door arcs.

## Motion

State transitions use 160–220 ms ease-out. Camera focus and curtains interpolate only when reduced motion is not requested; reduced motion switches to immediate state changes. No decorative entrance sequence.

## Accessibility

WCAG 2.2 AA contrast, visible `:focus-visible` ring, semantic buttons, keyboard shortcuts with discoverable labels, live regions for command results and no color-only status communication.
