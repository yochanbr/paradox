# Objective

Create a premium, responsive mobile app UI prototype inspired by the functionality of the provided screenshot (calendar, upcoming tasks, social/quote feed) but with a completely new visual identity to avoid copyright infringement.

## User Review Required

> [!IMPORTANT]
> Please review the chosen design direction before I start coding:
> **Design Theme:** "Aura Glass" - A premium, dark-mode glassmorphism theme using deep indigo and violet tones, frosted glass effects for cards, and vibrant gradient accents for primary actions.
> **Typography:** Modern, clean sans-serif (e.g., Google Fonts 'Outfit').
> **Layout:** App-like layout (centered in the browser with a max-width of 414px to simulate a mobile screen), featuring a sticky top calendar, a scrollable feed, and a floating bottom navigation bar.

Do you approve of this design direction, or would you prefer a different aesthetic (e.g., a clean Light Mode with pastel colors)?

## Proposed Changes

We will build the prototype using Vanilla HTML, CSS, and JS to ensure maximum flexibility and rapid development without unnecessary overhead.

### Component Implementation

#### [NEW] index.html
- The main structure including:
  - Top app bar (Profile and Notifications).
  - Horizontal Date/Calendar slider.
  - "Next Milestone" card (replacing the generic "Upcoming Task" design).
  - A scrollable feed of reflection/quote cards.
  - Floating bottom navigation with modern, distinct icons.

#### [NEW] style.css
- Custom styling:
  - Mobile mock layout wrapper.
  - CSS variables for the color palette (Deep Indigo, Violet, Soft White, Frost transparent backgrounds).
  - Flexbox and Grid layouts.
  - Micro-animations (hover effects, active states, soft pulses on notifications).
  - Glassmorphism utilities (`backdrop-filter: blur(10px)`).

#### [NEW] script.js
- Basic interactivity:
  - Highlighting the selected calendar day.
  - Toggling 'Like' button states visually.
  - Switching active states on the bottom navigation.

## Open Questions

- What specific color palette do you prefer? (I have suggested Deep Indigo & Violet, but I can use any colors).
- Should I use Placeholder images entirely, or do you want me to generate a specific aesthetic image for the quote card using the image generation tool?

## Verification Plan

### Manual Verification
- Render the `index.html` in the browser view.
- Verify all layout constraints fit within a standard mobile viewport size.
- Ensure animations and glassmorphic styles render beautifully.
- Verify that it looks substantially different from the original image (dark mode flat design vs our new glassmorphic deep theme).
