# FaMiLis — Figma token / variable structure (Login)

## Scope
- **Figma file**: `FaMiLis` (`RawnZtUqvEywfh5NCJ2yKQ`)
- **Focused node**: **Admin Login Page** (`62:103`) on canvas `0:1` (Components)
- **Goal**: document how the **Brand → Alias → Mapped** collections connect **for the login area**

## What the file exposes for Login today
### Variables in use (Brand/Alias/Mapped wiring)
I queried variable usage for the login node and its key children via Figma variables extraction (node-scoped):
- `get_variable_defs(fileKey=RawnZtUqvEywfh5NCJ2yKQ, nodeId=62:103)` → **`{}`**
- `get_variable_defs(..., nodeId=62:104)` (top nav group) → **`{}`**
- `get_variable_defs(..., nodeId=68:75)` (email input rect) → **`{}`**
- `get_variable_defs(..., nodeId=68:79)` (login button rect) → **`{}`**

**Conclusion:** the Login design, as currently authored, appears to be using **literal property values** (raw colors, radii, borders, font styles) rather than Figma Variables. Because of that, there is **no observable connection point** between **Brand / Alias / Mapped** collections *within the login node itself*.

If your file contains Brand/Alias/Mapped collections, they’re not referenced by this login frame yet (or the references are outside the inspected nodes).

## Observed “token candidates” (literal values used in Login)
These are the values that would typically be driven by variables.

### Color
- **Page background**: `#f6f7fb`
- **Primary brand red used across surfaces** (top nav + login card header + CTA): `red` (named color in the node export; likely a hex in the file)
- **Surface**: `#ffffff`
- **Border**: `#bfbfbf`
- **Text (muted)**: `rgba(0,0,0,0.5)`
- **Placeholder / subtle text**: `#bdb4b4`
- **Text**: `#000000`, `#ffffff`

### Radius
- **Card radius**: `70px` (top and bottom corners on `68:64` + `68:65`)
- **Input radius**: `10px` (`68:75`, `68:77`)
- **CTA radius**: `50px` (`68:79`)

### Typography (as used in this node)
- **Top nav + hero title**: `Montserrat` (Bold / SemiBold)
- **Field labels**: `Roboto Medium` (`20px`)
- **Placeholder**: `Albert Sans Regular` (`16px`)

### Component-ish pieces (good candidates for mapped tokens)
- **Top navigation bar** (`62:104`…): brand surface + on-brand text color
- **Login card header** (`68:64`): primary brand surface + on-brand text
- **Inputs** (`68:75`, `68:77`): surface, border, radius, placeholder, label
- **Primary button** (`68:79` + `68:80`): primary surface, radius, on-primary text/icon
- **Link** (`68:86`): “brand link” color (export shows `red`)

## Recommended variable-collection structure (Brand → Alias → Mapped)
Since Login is currently literal-value based, here’s the **recommended** structure to implement the connection you described, using the values above as the initial seed.

### 1) Brand collection (raw, immutable values)
Purpose: store actual hex/rgb values and base scales.

Example keys:
- `brand.color.red.500`
- `brand.color.neutral.0`
- `brand.color.neutral.900`
- `brand.color.neutral.500a` (for alpha variants like `rgba(0,0,0,0.5)`)
- `brand.radius.10`
- `brand.radius.50`
- `brand.radius.70`
- `brand.type.family.montserrat`
- `brand.type.family.roboto`
- `brand.type.family.albertSans`

### 2) Alias collection (themeable “semantic” meaning)
Purpose: point semantic names to Brand values; this is where light/dark theming usually pivots.

Example keys (aliases pointing to Brand):
- `alias.color.bg.canvas` → `brand.color.neutral.???` (currently `#f6f7fb`)
- `alias.color.fg.default` → `brand.color.neutral.900` (currently `#000`)
- `alias.color.fg.muted` → `brand.color.neutral.500a` (currently `rgba(0,0,0,0.5)`)
- `alias.color.surface.default` → `brand.color.neutral.0` (currently `#fff`)
- `alias.color.border.default` → `brand.color.neutral.???` (currently `#bfbfbf`)
- `alias.color.action.primary` → `brand.color.red.500`
- `alias.color.action.primaryFg` → `brand.color.neutral.0`
- `alias.radius.input` → `brand.radius.10`
- `alias.radius.button` → `brand.radius.50`
- `alias.radius.card` → `brand.radius.70`

### 3) Mapped collection (component/property-level tokens)
Purpose: map semantic aliases to **specific UI parts** so design + code can stay aligned.

Example keys (mapped to Alias):
- `mapped.login.page.bg` → `alias.color.bg.canvas`
- `mapped.login.nav.bg` → `alias.color.action.primary`
- `mapped.login.nav.fg` → `alias.color.action.primaryFg`
- `mapped.login.card.header.bg` → `alias.color.action.primary`
- `mapped.login.card.header.fg` → `alias.color.action.primaryFg`
- `mapped.login.input.bg` → `alias.color.surface.default`
- `mapped.login.input.border` → `alias.color.border.default`
- `mapped.login.input.radius` → `alias.radius.input`
- `mapped.login.button.bg` → `alias.color.action.primary`
- `mapped.login.button.fg` → `alias.color.action.primaryFg`
- `mapped.login.button.radius` → `alias.radius.button`
- `mapped.login.link.fg` → `alias.color.action.primary`

## Practical “connection points” to implement in Figma (Login)
To make the Brand/Alias/Mapped relationship *observable* in this login screen, the minimal changes in Figma are:
- Apply **mapped** color variables to fills/strokes:
  - `62:105` (nav background), `68:64` (card header), `68:79` (button), `68:86` (register link), input borders (`68:75`, `68:77`), page bg.
- Apply **mapped** radius variables to corner radius:
  - card (`68:64`, `68:65`), inputs (`68:75`, `68:77`), button (`68:79`).
- Optionally apply **mapped** typography variables (if you’re managing font via variables/tokens).

Once those are applied, re-running variable extraction on node `62:103` should return a non-empty map, and we can produce a definitive “this mapped token resolves to this alias which resolves to this brand value” table.

