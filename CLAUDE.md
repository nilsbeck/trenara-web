@agents.md

## Before committing

Run `bun run check && bun run lint && bun run test:coverage` and fix anything
they report — CI runs the same checks plus `bun run build && bun run check:bundle`. Use `bun run format`
rather than formatting by hand.
