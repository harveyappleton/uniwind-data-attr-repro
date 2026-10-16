# Uniwind: `data-[…]` styles are never cached on native

Uniwind caches the styles it resolves for each class string. A string that contains a `data-[…]` variant is never cached, so it's parsed again every time the component renders, even when nothing has changed.

This app shows the problem, and shows a fix that caches those strings while still applying `data-[…]` styles correctly.

<img src="screenshot.png" width="300" alt="The repro app showing the comparison table" />

## Run it

Expo SDK 58, React Native 0.88, Uniwind 1.12.2, Tailwind 4.3.3. It runs in Expo Go.

```bash
npm install
npx expo start --no-dev --minify
```

Open it in Expo Go on iOS or Android.

1. Tap **Run comparison**. It re-renders 400 squares 30 times with unchanged props, for each of the three rows in the table.
2. Use the two toggles under it to check the fix still applies `data-[…]` styles. Every other square turns dark when `data-selected` is on, and goes back when it's off, with the fix on or off.

## What it shows

The three rows use the same class string. The second and third add one `data-[selected=true]:` variant.

| Class string | ms per render | Re-parses per render |
| --- | --- | --- |
| Plain classes | 9.6 | 0 |
| + `data-[…]` class, Uniwind 1.12.2 | 14.5 | 400 |
| + `data-[…]` class, with the fix | 9.9 | 0 |

These numbers are from an iPhone 17 simulator on an Apple Silicon Mac. "Re-parses" counts how many times Uniwind had to resolve a class string because its cache missed. 400 out of 400 squares means nothing was cached. The time difference is much bigger on low-end Android devices.

UI kits rely on `data-[…]` for state styling. Gluestack v5's button alone has 42 of these classes. That puts almost every button and input on this uncached path.

## Why it happens

In `src/core/native/store.ts`, `getStyles` builds the cache key from the class string, the press, focus and disabled state, and the theme. `data-[…]` variants match against component props, which aren't in that key. So the store skips caching any result that involves a data attribute:

```ts
// Don't cache styles that depend on data attributes
if (!result.hasDataAttributes) {
    cache.set(cacheKey, result)
```

`hasDataAttributes` is set as soon as one `data-[…]` class appears, so a single one turns off caching for the whole string.

## The fix

The `data-*` attribute names a class string can depend on are fixed for that string. So the cache key only needs the values of those few props, not all of them:

1. The first time a string is resolved, record which `data-*` attributes its styles reference.
2. Add the value of each of those props to the cache key.
3. Cache the result as normal.

`uniwind-fix.diff` is this change as a patch to Uniwind's `src/core/native/store.ts`. `uniwindDataCacheFix.ts` applies the same logic at runtime, so this app can switch between stock and fixed behaviour. It reaches into Uniwind's internals to do that, so Metro prints two "not listed in exports" warnings at startup. Those are expected.
