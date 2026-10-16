/**
 * The proposed fix, applied at runtime so the app can compare it with stock Uniwind.
 * `uniwind-fix.diff` is the same change written as a patch to Uniwind's store.
 *
 * Stock `getStyles` never caches a class string that contains a `data-[…]` variant,
 * because the cache key ignores component props. The fix adds the values of just the
 * `data-*` props that string can depend on to the key, so the result can be cached.
 */

type Style = { dataAttributes: Record<string, string> | null };
type StylesResult = { dependencies: Array<number> };
type Store = {
  cache: Record<string, Map<string, StylesResult>>;
  stylesheet: Record<string, Array<Style>>;
  runtime: { currentThemeName: string };
  getStyles: (...args: Array<any>) => StylesResult;
  resolveStyles: (...args: Array<any>) => StylesResult;
};

// Uniwind's internals aren't public API, so these deep imports are untyped.
const store: Store = require('uniwind/src/core/native/store').UniwindStore;
const listener = require('uniwind/src/core/listener').UniwindListener;

const stockGetStyles = store.getStyles;
const stockResolveStyles = store.resolveStyles;

/** Number of times Uniwind parsed a class string because the cache missed. */
export const resolveCounter = { count: 0 };

store.resolveStyles = function (...args) {
  resolveCounter.count++;
  return stockResolveStyles.apply(this, args);
};

// The data-* attribute names a class string can depend on. They depend only on the string.
const dataAttributeNames = new Map<string, Array<string>>();

function getDataAttributeNames(className: string) {
  let names = dataAttributeNames.get(className);

  if (!names) {
    const found = new Set<string>();

    for (const token of className.split(/\s+/)) {
      for (const style of store.stylesheet[token] ?? []) {
        if (style.dataAttributes) {
          Object.keys(style.dataAttributes).forEach((name) => found.add(name));
        }
      }
    }

    names = Array.from(found).sort();
    dataAttributeNames.set(className, names);
  }

  return names;
}

function fixedGetStyles(
  className: string | undefined,
  componentProps: Record<string, unknown> | undefined,
  state: { isDisabled?: boolean; isFocused?: boolean; isPressed?: boolean } | undefined,
  uniwindContext: any,
) {
  const names = className ? getDataAttributeNames(className) : [];

  // No data-[] variants: stock behaviour, which already caches.
  if (!className || names.length === 0) {
    return stockGetStyles.call(store, className, componentProps, state, uniwindContext);
  }

  const cache = store.cache[uniwindContext.scopedTheme ?? store.runtime.currentThemeName];

  if (!cache) {
    return stockGetStyles.call(store, className, componentProps, state, uniwindContext);
  }

  // Same key as stock, plus the value of each data-* prop the string can depend on.
  // validateDataAttributes treats true and 'true' alike, so String() keeps them on one entry.
  const cacheKey = `${className}${state?.isDisabled ?? false}${state?.isFocused ?? false}${state?.isPressed ?? false}${uniwindContext.scopedTheme !== null}${uniwindContext.rtl ?? ''}${uniwindContext.variables?.__uniwindVariablesCacheKey ?? ''}${names.map((name) => `\u0000${String(componentProps?.[name])}`).join('')}`;

  const cached = cache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const result = store.resolveStyles(className, componentProps, state, uniwindContext);

  cache.set(cacheKey, result);
  listener.subscribe(() => cache.delete(cacheKey), result.dependencies, { once: true });

  return result;
}

export function setFixEnabled(enabled: boolean) {
  store.getStyles = enabled ? fixedGetStyles : stockGetStyles;
}
