# GrabPic UI Audit — Pre-Redesign

**Commit:** `f0ca64dfe06668b44bcd0cd0ab889d10f5b83802`
**Date:** 2026-11-28

## Visual Inconsistencies

| Issue | File | Detail |
|---|---|---|
| Hardcoded colors everywhere | `page.tsx`, `organizer/page.tsx`, `attendee/page.tsx` | `#E1E0CC`, `#DEDBC8`, `rgba(225,224,204,*)` scattered as inline `style={}` — no semantic tokens |
| Black body background | `layout.tsx:19` | `bg-black` hardcoded on `<body>` |
| Mismatched color palette | `tailwind.config.ts` vs inline styles | Tailwind defines `primary: '#DEDBC8'`, but most colors are inline `style` props |
| Feature icons from higgs.ai | `page.tsx:275-295` | Three `images.higgs.ai` URLs — external AI-generated artwork |
| Unverified external videos | `page.tsx:10-13` | CloudFront hero + feature video — provenance unverified |
| Dark gradient cards | `page.tsx:235,305,443,467` | Repeated `from-[#101010] to-[#1a1a1a]` dark panels |
| Excessive `rounded-2xl` | Throughout | Nearly every container uses `rounded-2xl` or `rounded-[2rem]` |

## Inaccessible Controls

| Issue | File | Detail |
|---|---|---|
| Mobile nav button missing label | `page.tsx:123-129` | No `aria-label` on hamburger button |
| Nav hover relies on inline JS | `page.tsx:111-114` | `onMouseEnter/Leave` style changes — no keyboard focus style |
| Consent checkbox default styling | `attendee/page.tsx:233` | Native `accent-primary` — tiny hit target |
| Camera button disabled without explanation | `attendee/page.tsx:211` | Disabled when `!consent` but no visible message explaining why |
| Form labels not linked via `htmlFor` | `organizer/page.tsx:129-175` | `<label>` elements don't use `htmlFor`/`id` pairs |
| Copy button lacks feedback | `organizer/page.tsx:208-217` | Only icon change, no accessible announcement |
| Match percentage shown | `attendee/page.tsx:319` | `Math.round(photo.similarity * 100)% match` — raw cosine similarity exposed as "match" percentage |

## Dead Links and Nonfunctional UI

| Issue | File | Detail |
|---|---|---|
| Footer `href="#"` links | `page.tsx:514,529,549` | Pricing, FAQ, hello@grabpic.app, Twitter, GitHub, Privacy Policy, Terms, Cookie Policy — all `href="#"` |
| Feature card "Learn more" buttons | `page.tsx:395-401` | `<button>` elements that navigate nowhere |
| Nav `#contact` anchor | `page.tsx:22` | Points to footer which has no meaningful contact info |
| "Start creating" CTA | `page.tsx:409` | Goes to `/organizer` but labeled misleadingly |

## Interaction Issues

| Issue | File | Detail |
|---|---|---|
| AnimatedLetter hook violation | `AnimatedLetter.tsx:25` | `useTransform` called inside `.map()` loop — violates Rules of Hooks |
| R2 upload response unchecked | `organizer/page.tsx:57-65` | `fetch(uploadUrl, {PUT})` result `.ok` never checked |
| Status polling never cleaned up | `organizer/page.tsx:77-87` | `setInterval` created inside async function, never cleared on unmount |
| Camera stream not stopped on unmount | `attendee/page.tsx:54-66` | `MediaStream` tracks only stopped on capture, not on component unmount |
| Scroll behavior side effect | `page.tsx:79-84` | Directly mutates `document.documentElement.style.scrollBehavior` |

## Unused/Misleading Content

| Issue | File | Detail |
|---|---|---|
| "Studio-grade workflows for visionary creators" | `page.tsx:311` | Marketing copy doesn't describe the actual product |
| "Built for pure vision. Powered by art." | `page.tsx:313` | Meaningless tagline |
| "Your creative canvas." | `page.tsx:346` | Feature video caption unrelated to photo distribution |
| "Face detection via MTCNN on GPU" | `page.tsx:288` | Current deployment uses CPU (OCI) — misleading |
| "Vector similarity search at the edge" | `page.tsx:299` | Search happens via Convex, not at the edge |

## Component Duplication

| Pattern | Files | Detail |
|---|---|---|
| Inline `style={{ color: '#E1E0CC' }}` | 30+ instances across 3 pages | Should be CSS variables |
| `CTAButton` defined in `page.tsx` | `page.tsx:25-46` | Not reusable across routes |
| `FadeUp` defined in `page.tsx` | `page.tsx:48-68` | Not reusable across routes |
| Button pattern repeated | All pages | Same `rounded-full px-5 py-2.5` pattern duplicated 10+ times |
| Error display pattern | `organizer/page.tsx:120-124`, `attendee/page.tsx:140-144` | Identical red error box, not shared |

## Missing States

| State | Location | Detail |
|---|---|---|
| Loading page | None | No loading.tsx for any route |
| Empty match results | `attendee/page.tsx` | No empty state when `totalMatches === 0` |
| Upload validation | `organizer/page.tsx` | No file type/size validation before upload |
| Lightbox | `attendee/page.tsx` | Photos open in new tab — no in-app viewing |

## Typography

- Uses `Almarai` as the global font (via `globals.css`)
- `Instrument Serif` defined in Tailwind but only used in error/404 pages
- No display/heading serif on the landing page
- No type scale system — sizes scattered via Tailwind classes
