# Contributing

Thanks for looking. This is a hackathon submission, so the bar for a change is "it makes the
game better for the person playing it or the person reviewing it".

## Getting set up

```sh
npm install
npm run dev        # http://localhost:5173
```

No keys, no wallet, no services. The game runs standalone when no casino host is present.

## Before you open a pull request

```sh
npm run check-types
npm test           # 72 tests
npm run bench      # the paytable block and the four render thresholds
npm run gates      # the nine mechanical ui.md gates
```

CI runs all of these plus the SDK spike. `npm run bench` Block B and `npm run gates` need a
browser: `npx playwright install chromium`.

## Commit messages

**Conventional Commits — this is load-bearing, not style.** `semantic-release` reads these to
decide the next version, write `CHANGELOG.md` and publish the GitHub Release. A commit typed
wrong ships the wrong version number.

```
feat(render): ...     minor bump
fix(bridge): ...      patch bump
perf(render): ...     patch bump
refactor(game): ...   patch bump
docs: ...             no release
test: ...             no release
chore: ...            no release
ci: ...               no release
```

A `BREAKING CHANGE:` footer forces a major.

**Never put a `#`-prefixed hex colour in a commit message.** This codebase documents a
four-ink ramp constantly, and conventional-changelog turns every `#FFA51E` into a link to an
issue that does not exist. Write it as `0xFFA51E`, or put it in a code span in the body.

## The two rules that are not negotiable

1. **Nothing that decides money may use `Math.random`.** Demo entropy is
   `crypto.getRandomValues`; wagered outcomes come from the contract. `npm run shipcheck`
   fails the build otherwise.
2. **Payouts format from the exact rational, never through a float.** `8-5 THREE DOWN` is
   exactly `3201/200 = 16.005`, whose IEEE-754 double sits just below it, so `toFixed(2)`
   renders `16.00` and the screen contradicts the paytable. Use `formatFraction`.

## Style

The renderer is the design system: four inks, four duty levels, one 5×7 bitmap typeface, and
integer pitch at every viewport. Hierarchy is carried by brightness, never by size. If a
change adds a gradient, a border radius or a box shadow, `npm run gates` G3 will say so.
