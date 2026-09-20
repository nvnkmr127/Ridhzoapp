# Theme & Design System (`THEME.md`)

## 1. Executive Summary & Design Philosophy

Ridhzo CRM employs a **dark-first, strictly monochrome design system** built upon a neutral grayscale (Hue 0, Saturation 0). Rather than relying on multi-colored UI chrome, the interface reads cleanly across shades of black, charcoal, and white.

### Core Tenets:
- **Monochrome Dark-First:** The base page surface is deep pitch-black (`#0a0a0a` / `hsl(0, 0%, 4%)`), with lifted card surfaces (`#121212` / `hsl(0, 0%, 7%)`) and high-contrast near-white ink (`hsl(0, 0%, 96%)`).
- **CRED-Style Primary Actions:** Primary action buttons are high-contrast white blocks filled with black text (`bg-primary text-primary-foreground`), drawing immediate, unambiguous visual focus without competing colored CTA buttons.
- **Color As a Deliberate Exception:** True hues (blues, emeralds, reds, ambers) are strictly quarantined from the structural UI and reserved exclusively for high-signal domain data—specifically lead status badges, pipeline velocity warnings, and external integration brand markers.
- **Monochrome Destructive Pattern:** Destructive actions retain a muted monochrome appearance (`hsl(0, 0%, 17%)`); destructive intent is communicated via clear iconography, explicit copy, and confirmation dialogs rather than alarming red button floods.
- **Native Dark Integration:** Form inputs, date pickers, native checkboxes, and scrollbars enforce browser-level dark schemes (`color-scheme: dark`, monochrome `accent-color`) to eliminate white flashbangs and OS-level blue accents.

---

## 2. File & Configuration Architecture

| Layer / Purpose | File Path |
| :--- | :--- |
| **Global Design Tokens & CSS Variables** | [`src/app/globals.css`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/globals.css) |
| **Tailwind Configuration & Extensions** | [`tailwind.config.ts`](file:///Users/naveenadicharla/Documents/ridhzo/tailwind.config.ts) |
| **Shadcn UI Configuration** | [`components.json`](file:///Users/naveenadicharla/Documents/ridhzo/components.json) |
| **Root Layout & Fonts** | [`src/app/layout.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/layout.tsx) |
| **PWA Manifest & Theme Color** | [`src/app/manifest.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/manifest.ts) |
| **Chart Visualization Theme** | [`src/components/dashboard/Charts.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/dashboard/Charts.tsx) |
| **Core Button Primitive** | [`src/components/ui/button.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/ui/button.tsx) |
| **Core Badge Primitive** | [`src/components/ui/badge.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/ui/badge.tsx) |

---

## 3. Color Tokens & Palette

All color tokens in Ridhzo CRM are defined via CSS custom properties in `src/app/globals.css` and mapped to Tailwind utilities:

```css
:root {
  --background: 0 0% 4%;          /* #0a0a0a — canvas background */
  --foreground: 0 0% 96%;         /* near-white primary text */

  --card: 0 0% 7%;                /* #121212 — elevated container / card surface */
  --card-foreground: 0 0% 96%;

  --popover: 0 0% 8%;             /* #141414 — dropdown menus, dialogs, command palettes */
  --popover-foreground: 0 0% 96%;

  --primary: 0 0% 96%;            /* high-contrast white block */
  --primary-foreground: 0 0% 6%;  /* black text inside primary block */

  --secondary: 0 0% 13%;          /* #212121 — subtle control background */
  --secondary-foreground: 0 0% 96%;

  --muted: 0 0% 12%;              /* #1f1f1f — disabled or non-interactive surfaces */
  --muted-foreground: 0 0% 60%;   /* secondary / helper text */

  --accent: 0 0% 15%;             /* #262626 — hover states and selection fills */
  --accent-foreground: 0 0% 98%;

  --destructive: 0 0% 17%;        /* #2b2b2b — monochrome destructive button fill */
  --destructive-foreground: 0 0% 98%;

  --border: 0 0% 16%;             /* #292929 — structural borders and dividers */
  --input: 0 0% 16%;              /* input boundary borders */
  --ring: 0 0% 45%;               /* focus outline ring */

  --radius: 0.75rem;              /* 12px default corner radius */
}
```

### Visual Contrast Hierarchy

```
+-------------------------------------------------------------+
| Background: hsl(0 0% 4%) [#0a0a0a]                          |
|  +-------------------------------------------------------+  |
|  | Card: hsl(0 0% 7%) [#121212] | Border: hsl(0 0% 16%)  |  |
|  |                                                       |  |
|  | Heading: hsl(0 0% 96%)                                |  |
|  | Description: hsl(0 0% 60%) (muted-foreground)         |  |
|  |                                                       |  |
|  | [ Secondary Action ]        [ Primary Action ]        |  |
|  | bg: hsl(0 0% 13%)           bg: hsl(0 0% 96%)         |  |
|  | text: hsl(0 0% 96%)         text: hsl(0 0% 6%)        |  |
|  +-------------------------------------------------------+  |
+-------------------------------------------------------------+
```

---

## 4. Typography System

The application relies on Vercel's **Geist** font family loaded via `next/font/local` in [`src/app/layout.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/layout.tsx):

```typescript
const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
```

### Typographic Specifications:
- **Body & Headings (`font-sans`):** `var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif`.
- **Code & Keyboard Shortcuts (`font-mono`):** `var(--font-geist-mono), ui-monospace, monospace`.
- **Font Smoothing:** `-webkit-font-smoothing: antialiased`.
- **OpenType Feature Settings:** `cv02`, `cv03`, `cv04`, `cv11` enabled by default in `globals.css` for enhanced punctuation and tabular-friendly digit geometry.

---

## 5. Shape & Corner Radii

Ridhzo uses rounded geometries configured in [`tailwind.config.ts`](file:///Users/naveenadicharla/Documents/ridhzo/tailwind.config.ts):

| Token | CSS Calculation | Resolved Value | Standard Usage |
| :--- | :--- | :--- | :--- |
| `rounded-lg` | `var(--radius)` | `0.75rem` (12px) | Cards, Modals, Drawers, Large Action Buttons |
| `rounded-md` | `calc(var(--radius) - 2px)` | `0.625rem` (10px) | Standard Form Controls, Text Inputs, Small Buttons |
| `rounded-sm` | `calc(var(--radius) - 4px)` | `0.5rem` (8px) | Tooltips, Nested Badges, Dropdown Menu Items |
| `rounded-full` | `9999px` | `9999px` | Avatars, Pill Badges, Status Dots |

---

## 6. Component Styling Specifications

### 6.1 Buttons ([`src/components/ui/button.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/ui/button.tsx))
- **`default` (Primary):** `bg-primary text-primary-foreground hover:bg-primary/90` — Solid near-white block with black text.
- **`secondary`:** `bg-secondary text-secondary-foreground hover:bg-accent` — Subtle dark surface (`#212121`).
- **`outline`:** `border border-border bg-transparent hover:bg-accent hover:text-accent-foreground`.
- **`destructive`:** `bg-destructive text-destructive-foreground hover:bg-destructive/80` — Dark monochrome surface (`#2b2b2b`).
- **`ghost`:** `hover:bg-accent hover:text-accent-foreground`.
- **Interaction Micro-feedback:** Built-in active scaling (`active:scale-[0.98]`) for tactile physical button press response.

### 6.2 Form Inputs & Controls ([`src/app/globals.css`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/globals.css))
- **Native Checkboxes & Radios:** Styled via `accent-color: hsl(var(--foreground));` so they render crisp white when checked instead of browser-default blue.
- **Date / Time Inputs:** Explicitly forced to `color-scheme: dark` to ensure native calendar dropouts match the dark palette without flashing white.
- **Text Selection:** `::selection { background: hsl(var(--foreground)); color: hsl(var(--background)); }` (Inverted high contrast).
- **Scrollbars:** Thin 8px scrollbars with transparent track and `hsl(var(--border))` thumb.

### 6.3 Charts & Visualizations ([`src/components/dashboard/Charts.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/dashboard/Charts.tsx))
Every metric chart uses a unified monochrome palette:
- **Series Fill (`INK`):** `#e0e0e0` (clean off-white for bars and area strokes)
- **Area Fill Gradient:** `from: rgba(224,224,224, 0.25)` to `to: rgba(224,224,224, 0.0)`
- **Grid Lines (`GRID`):** `#242427` (subtle dark separation lines)
- **Axis Text (`AXIS`):** `#8a8a8f` (12px muted label text)
- **Tooltip Container:** Surface `#141414`, Border `1px solid #242427`, Radius `8px`, Text `#f5f5f5`

---

## 7. Status Color Taxonomy (The Color Exception Rule)

While the chrome and controls are monochrome, business status data utilizes standardized semantic hues to provide immediate cognitive recognition:

| Status Key | Status Label | Hex Color | Category | Meaning |
| :--- | :--- | :--- | :--- | :--- |
| `new` | **New** | `#3B82F6` | Open | Fresh incoming lead requiring first response |
| `active` | **Active** | `#10B981` | In Progress | Actively engaged in conversation / sales process |
| `won` | **Won** | `#059669` | Won | Successfully closed customer deal |
| `lost` | **Lost** | `#EF4444` | Lost | Closed lost opportunity (with mandatory loss reason) |
| `unqualified` | **Unqualified**| `#6B7280` | Unqualified | Lead does not meet qualification criteria |

These colors are applied as subtle indicators:
- 2.5px circular status dots (`<Dot color={color} />`)
- Status pill badges with 15% opacity backgrounds and solid text color
- Pipeline Kanban column header accent bars

---

## 8. Mobile & PWA App Presentation

Ridhzo is designed for native standalone execution on mobile devices:
- **Theme Color:** `#0a0a0a` configured across [`src/app/layout.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/layout.tsx) and [`src/app/manifest.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/manifest.ts).
- **iOS Status Bar:** Configured as `appleWebApp: { capable: true, statusBarStyle: "black-translucent" }` to allow full edge-to-edge dark immersion under the iOS notch and Dynamic Island.
- **Viewport:** `viewportFit: "cover"` with `initialScale: 1` preventing responsive scaling artifacts.
