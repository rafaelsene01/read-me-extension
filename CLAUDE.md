# ReadMe

## UI

- Every UI component must come from shadcn/ui (`components/ui/`). Need a new one? Add it with `npx shadcn@latest add <name>` (or the shadcn MCP) — never hand-roll buttons, selects, sliders, tabs, alerts, etc.
- Style with Tailwind v4 utility classes and the shadcn theme tokens in `entrypoints/sidepanel/style.css` (`bg-background`, `text-muted-foreground`, ...). No inline `style={{}}` and no hardcoded colors.
- Import through the `@/` alias: `import { Button } from '@/components/ui/button'`.
- Dark mode follows the system (`prefers-color-scheme`); no theme toggle.
