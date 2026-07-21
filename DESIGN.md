# Design System

## Direction

Quiet architectural control room: warm graphite interface surfaces frame a materially faithful brass-and-oak interior. The 3D apartment is always the visual anchor; controls behave like precise instruments rather than decorative cards.

## Color

- Canvas: `#0c0b0a`
- Elevated canvas: `#14120f`
- Panel: `rgba(21, 19, 16, 0.9)`
- Primary text: `#f1eee7`
- Secondary text: `#a29b8f`
- Hairline: `rgba(241, 238, 231, 0.12)`
- Accent / selection: `#d3b26a`
- Confirmed: `#83c7a3`
- Pending: `#d7b870`
- Error: `#e58c82`
- Offline: `#948e85`

Scene colors are source-derived and separate from UI semantics: dark Edinburgh oak, light veined stone, warm greige walls, black profiles and restrained bronze hardware.

## Typography

One neutral sans-serif stack: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Fixed product scale from 11 px metadata to 24 px headings; sentence case; tabular figures for areas and device values.

## Layout

- Desktop: 68 px top bar, 244 px room rail, full-bleed WebGL stage, context inspector up to 356 px.
- Tablet: compact room rail and bottom scene controls.
- Mobile: full stage, one compact mode row, collapsible scenario/camera deck, horizontal room rail and collapsible device sheet; never exceed viewport width.
- Minimum interactive target: 44×44 px.

## Components

- Top status line with project title, demo badge and connection state.
- Three-mode segmented control: Overview, Rooms, Devices.
- Room rail with area, confidence marker and one shared provenance legend.
- Device rows with explicit command state, physical value and shared provenance legend; light groups use a switch plus level slider.
- Scenario buttons for Day, Evening and Away.
- Debug tray for source overlay, bounds, collision markers and door arcs.

## Motion

State transitions use 160–220 ms ease-out. Camera focus and curtains interpolate only when reduced motion is not requested; reduced motion switches to immediate state changes. No decorative entrance sequence.

## Accessibility

WCAG 2.2 AA contrast, visible `:focus-visible` ring, semantic buttons, keyboard shortcuts with discoverable labels, live regions for command results and no color-only status communication.
