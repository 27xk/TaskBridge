// Owns session generations and in-flight work. Identity and effects remain injected.
export function createSessionCoordinator({ getIdentity }) {
  let generation = 0;
  const flights = new Map();
  function capture() { return { generation, ...getIdentity() }; }
  function isCurrent(context) {
    const current = getIdentity();
    return Boolean(context) && context.generation === generation &&
      context.apiBaseUrl === current.apiBaseUrl && context.deviceId === current.deviceId &&
      (context.userId === null || context.userId === current.userId);
  }
  return {
    get generation() { return generation; },
    capture,
    isCurrent,
    invalidate() { generation += 1; flights.clear(); },
    run(kind, context, action) {
      if (!isCurrent(context)) return Promise.resolve(false);
      const previous = flights.get(kind);
      if (previous && isCurrent(previous.context)) return previous.request;
      const flight = { context, request: null };
      // Starting in a microtask registers the flight before a reentrant caller can join it.
      flight.request = Promise.resolve().then(() => isCurrent(context) ? action() : false).finally(() => {
        if (flights.get(kind) === flight) flights.delete(kind);
      });
      flights.set(kind, flight);
      return flight.request;
    },
  };
}

export function createSyncHealthReporter({ canReport, getKey, readHealth, send, now = () => Date.now(), intervalMs = 60000 }) {
  let previousKey = null;
  let lastAttempt = -Infinity;
  return {
    async report(context) {
      if (!canReport(context)) return false;
      const key = getKey(context);
      if (key === previousKey && now() - lastAttempt < intervalMs) return false;
      previousKey = key;
      lastAttempt = now();
      try {
        const health = await readHealth(context);
        if (!health || !canReport(context)) return false;
        await send(health, context);
        return true;
      } catch { return false; }
    },
  };
}
