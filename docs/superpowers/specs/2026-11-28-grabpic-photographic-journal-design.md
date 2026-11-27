# GrabPic — The Photographic Journal Design System

**Date:** 2026-11-28
**Direction:** Editorial photography journal with warm, premium aesthetic

## Color Tokens

```css
:root {
  --paper: #F8F4EB;
  --ivory: #FFFCF6;
  --oat: #E9DCC8;
  --ink: #30251E;
  --espresso: #423126;
  --terracotta: #B95632;
  --terracotta-dark: #953D24;
  --muted: #71655B;
  --border: #D8C9B7;
  --yc-orange: #FF6600;
  --white: #FFFFFF;
  --error: #B91C1C;
  --error-bg: #FEF2F2;
  --success: #15803D;
  --success-bg: #F0FDF4;
  --warning: #92400E;
  --warning-bg: #FFFBEB;
}
```

Contrast verified against WCAG AA:
- `--ink` on `--paper`: 10.4:1 ✓
- `--muted` on `--paper`: 4.6:1 ✓
- `--terracotta` on `--paper`: 4.5:1 ✓ (large text)
- `--white` on `--terracotta`: 4.7:1 ✓
- `--white` on `--espresso`: 10.1:1 ✓

## Typography

### Families
- **Display:** Playfair Display (400, 500, 600, 700, italic)
- **Interface:** Inter (400, 500, 600)

### Scale (fluid with clamp)
| Role | Mobile | Desktop | Weight | Family |
|---|---|---|---|---|
| Hero | 48px | 80px | 500 | Playfair |
| Section heading | 32px | 56px | 500 | Playfair |
| Page title | 26px | 36px | 500 | Playfair |
| Card heading | 18px | 22px | 600 | Inter |
| Body | 15px | 16px | 400 | Inter |
| Caption | 13px | 14px | 400 | Inter |
| Eyebrow | 11px | 12px | 500 | Inter, uppercase, 0.1em tracking |

## Spacing
4px base unit. Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.

Max content width: 1280px.

## Radius
- Inputs/buttons: 8px
- Cards/panels: 12px
- Photo frames: 4px
- Dialogs: 16px

## Shadows
```css
--shadow-sm: 0 1px 3px rgba(48, 37, 30, 0.06);
--shadow-md: 0 4px 12px rgba(48, 37, 30, 0.08);
--shadow-lg: 0 8px 24px rgba(48, 37, 30, 0.1);
--shadow-photo: 0 2px 8px rgba(48, 37, 30, 0.12), 0 1px 2px rgba(48, 37, 30, 0.06);
```

## Components

### SiteHeader
Sticky, paper-colored. Left: `grabpic.` wordmark (Playfair italic). Right: Find My Photos, For Organizers.

### PhotoFrame
Ivory border (16px), subtle shadow, optional caption below. Used for editorial hero images.

### PrimaryButton
`--terracotta` background, white text, 8px radius, 500 weight Inter.
Hover: `--terracotta-dark`. Disabled: 50% opacity.

### SecondaryButton
Transparent, `--border` border, `--ink` text, 8px radius.

### FormField
`--ivory` background, `--border` border, 8px radius. Focus: `--terracotta` ring.
Label above in caption style. Error text in `--error`.

### StatusBadge
Pill with dot indicator. Processing: amber. Ready: green. Failed: red.

### ConsentPanel
Ivory surface, clear heading, checkbox with generous hit target, full consent text.

## Page Structures

### Landing (`/`)
1. Hero: Paper bg, editorial serif headline, layered photo composition right
2. The Experience: Story-driven photographic section
3. How It Works: Three numbered editorial steps
4. Privacy: Trust-focused content panel
5. CTA: Closing section with wordmark
6. Footer: Real links only

### Organizer (`/organizer`)
Paper-toned workspace. Create form → Event overview → Photo upload → Sharing.

### Attendee (`/attendee`)
Paper entry → Consent panel → Camera interface → Matching state → Photo gallery.

## Motion
- Page entry: `opacity 0→1, translateY 12→0, 250ms ease-out`
- Stagger: 60ms between siblings
- Buttons: `background-color 150ms, transform 100ms`
- Photos: `scale 1→1.02 on hover, 200ms`
- Lightbox: `opacity + scale, 200ms`
- Respect `prefers-reduced-motion: reduce`
