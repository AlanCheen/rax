// Inspired by universal-router
import { useState, useEffect } from 'rax';
import pathToRegexp from 'path-to-regexp';

const cache = {};
function decodeParam(val) {
  try {
    return decodeURIComponent(val);
  } catch (err) {
    return val;
  }
}

function matchPath(route, pathname, parentParams) {
  const end = !route.routes; // When true the regexp will matched to the end of the string
  const routePath = route.path || '';

  const regexpCacheKey = `${routePath}|${end}`;
  const keysCacheKey = regexpCacheKey + '|';

  let regexp = cache[regexpCacheKey];
  let keys = cache[keysCacheKey] || [];

  if (!regexp) {
    regexp = pathToRegexp(routePath, keys, { end });
    cache[regexpCacheKey] = regexp;
    cache[keysCacheKey] = keys;
  }

  const result = regexp.exec(pathname);
  if (!result) {
    return null;
  }

  const path = result[0];
  const params = { ...parentParams };

  for (let i = 1; i < result.length; i++) {
    const key = keys[i - 1];
    const prop = key.name;
    const value = result[i];
    if (value !== undefined || !Object.prototype.hasOwnProperty.call(params, prop)) {
      if (key.repeat) {
        params[prop] = value ? value.split(key.delimiter).map(decodeParam) : [];
      } else {
        params[prop] = value ? decodeParam(value) : value;
      }
    }
  }

  return {
    path: !end && path.charAt(path.length - 1) === '/' ? path.substr(1) : path,
    params,
  };
}

function matchRoute(route, baseUrl, pathname, parentParams) {
  let matched;
  let childMatches;
  let childIndex = 0;

  return {
    next() {
      if (!matched) {
        matched = matchPath(route, pathname, parentParams);

        if (matched) {
          return {
            done: false,
            $: {
              route,
              baseUrl,
              path: matched.path,
              params: matched.params,
            },
          };
        }
      }

      if (matched && route.routes) {
        while (childIndex < route.routes.length) {
          if (!childMatches) {
            const childRoute = route.routes[childIndex];
            childRoute.parent = route;

            childMatches = matchRoute(
              childRoute,
              baseUrl + matched.path,
              pathname.substr(matched.path.length),
              matched.params,
            );
          }

          const childMatch = childMatches.next();
          if (!childMatch.done) {
            return {
              done: false,
              $: childMatch.$,
            };
          }

          childMatches = null;
          childIndex++;
        }
      }

      return { done: true };
    },
  };
}


const router = {
  handles: [],
  errorHandler() { },
  setHandle(handle) {
    return router.handles.push(handle);
  },
  clearHandle(handleId) {
    router.handles[handleId - 1] = null;
  },
  triggerHandles(component) {
    router.handles.map((handle) => {
      handle && handle(component);
    });
  },
  match(fullpath) {
    if (fullpath == null) return;

    router.fullpath = fullpath;

    const parent = router.root;
    const matched = matchRoute(
      parent,
      parent.path,
      fullpath
    );

    function next(parent) {
      const current = matched.next();

      if (current.done) {
        const error = new Error(`No match for ${fullpath}`);
        return router.errorHandler(error, { pathname: fullpath });
      }

      let component = current.$.route.component;
      if (typeof component === 'function') {
        component = component(current.$.params, { pathname: fullpath });
      }

      if (component instanceof Promise) {
        // Lazy loading component by import('./Foo')
        return component.then((component) => {
          component = component.__esModule ? component.default : component;
          // Check current fullpath avoid router has changed before lazy laoding complete
          if (fullpath === router.fullpath) {
            router.triggerHandles(component);
          }
        });
      } else if (component != null) {
        router.triggerHandles(component);
        return component;
      } else {
        return next(parent);
      }
    }

    return next(parent);
  }
};

export function route(config) {
  router.root = Array.isArray(config) ? { path: '', routes: config } : config;
}

export function useComponent(initPathname) {
  const [component, setComponent] = useState([]);

  useEffect(() => {
    const handleId = router.setHandle((component) => {
      setComponent(component);
    });

    router.match(initPathname);

    return () => {
      router.clearHandle(handleId);
    };
  }, []);

  return component;
}

export function push(fullpath) {
  router.match(fullpath);
}
