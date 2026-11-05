# DevX Infrastructure OS — Design System

**Visual north star:** Command Center design reference  
`/cursor/stores/self/media/command-center-design-reference.jpg`  
(and mirrored under Project store `media/`).

Futuristic, ultra-premium infrastructure OS — not generic admin, not terminal cosplay, not gaming HUD spam, not SaaS gradient salad.

**Note:** Existing web Control CSS (`public/css/app.css`, `fx.css`, `v2.css`) uses different palettes (teal / purple aurora). The **iOS app** follows this document. Do not casually restyle the web dashboard in Infra PRs.

---

## 1. Color tokens

| Token | Hex | Role |
|-------|-----|------|
| `bg.primary` | `#030607` | Primary background (near-black) |
| `bg.secondary` | `#070D10` | Secondary background / rail |
| `bg.elevated` | `#0B1417` | Elevated surface |
| `neon.primary` | `#36FFB2` | Primary neon — active borders, CTAs, online, success |
| `neon.secondary` | `#00D9FF` | Secondary neon — links, secondary accents |
| `neon.tertiary` | `#8B6CFF` | Tertiary accent — sparse emphasis |
| `text.primary` | `#E8FFF6` | Primary text |
| `text.secondary` | `#9AB7AB` | Secondary text / metadata |
| `text.muted` | `#607E73` | Muted labels |
| `border.inactive` | `#174A39` | Inactive / hairline borders |
| `border.active` | `#36FFB2` | Active border |
| `state.warning` | `#FFC857` | Warning |
| `state.critical` | `#FF536B` | Critical / failed |
| `state.success` | `#36FFB2` | Success (alias neon.primary) |

### Glow discipline

Restrained outer glow on **active** controls, online nodes, and primary CTA only. Prefer `rgba(54, 255, 178, 0.25–0.45)` soft bloom — never heavy multi-layer neon stacks on every card.

### Surfaces

Thin architectural borders, hairline separators, open spacing. Avoid large solid cards, excess glassmorphism, decorative particle fields, and heavy drop shadows. Glass is acceptable only as subtle panel wash (`bg.elevated` at high opacity), not frosted widget soup.

---

## 2. Typography

| Role | Font | Notes |
|------|------|-------|
| UI / titles | **SF Pro** | Display + Text; tracking tight on large titles |
| Technical | **SF Mono** | IPs, hostnames, commands, logs, ports, paths, metrics |
| Metrics | SF Mono / tabular nums | Always `monospacedDigit` for live numbers |

No Inter / Roboto / default web stacks in the iOS app. No emoji as icons.

Hierarchy example (Command Center):

- Brand / product mark: hero-level signal in chrome  
- Title: “INFRASTRUCTURE COMMAND CENTER” (or product-appropriate short title)  
- One supporting sentence max in the first viewport  
- Metadata in secondary/muted mono

---

## 3. Iconography

- **SF Symbols** primary (thin stroke weight matching reference).
- Integration marks (Tailscale / Cloudflare / GoDaddy) as simple status pills with text + status dot — not loud brand walls.
- Topology device glyphs: OS-appropriate SF Symbols; offline nodes desaturated / dimmed.

---

## 4. Layout — iPhone (reference)

First viewport composition (hero budget):

1. Brand header (“Dev X …” / DevXInfra)  
2. Condensed segment or context (Network / Apps / Domains) as needed  
3. **One** dominant visual: Tailnet wireframe globe + orbiting **real** device nodes  
4. Compact stats (2×2) only if fed by real overview API — otherwise omit or show placeholders as “—” with explanation  
5. Recent activity list  
6. **Publish** neon FAB  
7. Bottom tab bar: Command Center · Network · (AI/center) · Activity · Settings — map product tabs carefully so primary five remain: Command Center, Network, Applications, Domains, Workspace

Do **not** overload the first viewport with schedules, address blocks, promo stickers, or floating badges on the globe.

### Device workspace

Sectioned chrome with hairline tabs; terminal is full-bleed utilitarian (no decorative delay).

### iPad

Adaptive split: topology + detail; preserve workspace (don’t kill SSH on rotation).

---

## 5. Layout — Command Center patterns (shared language)

From the reference (adapted to iOS, not a desktop clone):

- Integration status pills: Connected / Disconnected with neon or muted border  
- Network visualization modes: topology · list · activity · health  
- Activity feed: timestamp + message + status dot  
- Publish flow: Select App → Domain → Configure → Publish (stages from API)  
- AI console: structured checklist results, quick actions, compose field — no fake successes  

---

## 6. Components (v1 kit)

| Component | Spec |
|-----------|------|
| `StatusDot` | online=neon, offline=muted, warn=warning, bad=critical |
| `IntegrationPill` | label + state; thin border |
| `MetricTile` | value (mono tabular) + label; no heavy card chrome |
| `NeonButton` / `PublishFAB` | fill or border neon; restrained glow |
| `Hairline` | 1px `border.inactive` |
| `SearchField` | command palette entry; mono hint |
| `DeviceNode` | orbit node; offline dimmed |
| `TopologyGlobe` | wireframe; data-driven nodes only |
| `ActivityRow` | feed row |
| `SectionHeader` | mono eyebrow optional, restrained |
| `TerminalView` | immediate; SF Mono; accessory toolbar |
| `EmptyState` | explain missing integration/agent — never fake rows |

Cards: default **no cards**. Use card chrome only when it clarifies an interactive container.

---

## 7. Motion system

Centralize tokens:

| Token | Guidance |
|-------|----------|
| `motion.fast` | ~120–180ms — UI feedback |
| `motion.medium` | ~240–320ms — section transitions |
| `motion.spring` | low bounce — workspace reveal |
| `motion.stagger` | 30–50ms — list entrances |
| `motion.borderTrace` | active control outline draw |

Rules:

- Coordinated page transitions; device → workspace reveal.  
- Live telemetry animates from **genuine** value changes only.  
- Terminal: **no** animation delay on I/O.  
- Publish stages animate only on real stage updates.  
- Respect **Reduce Motion** and **Low Power Mode** (disable decorative orbit/glow pulses).  
- Target 60 FPS; avoid layout thrash in topology.

---

## 8. Swift token sketch

```swift
public enum DXColor {
  public static let bgPrimary    = Color(hex: 0x030607)
  public static let bgSecondary  = Color(hex: 0x070D10)
  public static let bgElevated   = Color(hex: 0x0B1417)
  public static let neonPrimary  = Color(hex: 0x36FFB2)
  public static let neonSecondary = Color(hex: 0x00D9FF)
  public static let neonTertiary = Color(hex: 0x8B6CFF)
  public static let textPrimary  = Color(hex: 0xE8FFF6)
  public static let textSecondary = Color(hex: 0x9AB7AB)
  public static let textMuted    = Color(hex: 0x607E73)
  public static let borderInactive = Color(hex: 0x174A39)
  public static let warning      = Color(hex: 0xFFC857)
  public static let critical     = Color(hex: 0xFF536B)
}
```

Implement `Color(hex:)` and semantic `ShapeStyle` aliases in `DevXDesignSystem`.

---

## 9. Accessibility

- Dynamic Type support for UI chrome; terminal may cap scale with pan/zoom.  
- Contrast: primary text on `#030607` meets large-text thresholds; validate neon-on-black for non-text affordances with labels.  
- VoiceOver labels on topology nodes and tab bar.  
- Never convey state by color alone — include text/icons.

---

## 10. Anti-patterns (reject)

- Purple-on-white / purple-indigo gradient themes (web `fx.css` look) in the iOS shell  
- Warm cream + terracotta “AI default” landing aesthetics  
- Dense broadsheet / newspaper layouts  
- Emoji icon rows, pill clusters, fake stats  
- Detached stickers on hero media  
- Placeholder buttons that do nothing
