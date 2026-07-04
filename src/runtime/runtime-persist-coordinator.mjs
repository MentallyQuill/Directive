function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function requireFunction(value, label) {
  if (typeof value !== 'function') throw new Error(`${label} must be a function.`);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function resolveWaiters(waiters = [], result) {
  for (const waiter of waiters) waiter.resolve(cloneJson(result));
}

function rejectWaiters(waiters = [], error) {
  for (const waiter of waiters) waiter.reject(error);
}

export function createRuntimePersistCoordinator({
  persistNow,
  mergePendingRequest
} = {}) {
  requireFunction(persistNow, 'persistNow');
  requireFunction(mergePendingRequest, 'mergePendingRequest');

  let queue = Promise.resolve();
  let inFlight = false;
  let pendingRequest = null;
  let pendingWaiters = [];

function pendingOptionsFor(request = null) {
  return {
    chatId: request?.state?.campaignChatBinding?.chatId || null,
    fallbackHostId: request?.fallbackHostId || null,
    fallbackSaveId: request?.state?.campaignChatBinding?.saveId || request?.fallbackSaveId || null,
    forceSaveIndexUpdate: request?.forceSaveIndexUpdate === true
  };
}

  async function drain(initialRequest, firstDeferred) {
    let request = initialRequest;
    let currentWaiters = null;
    let first = true;
    try {
      while (request) {
        const result = await persistNow(request.state, request.summary, {
          forceSaveIndexUpdate: request.forceSaveIndexUpdate === true
        });
        if (first) firstDeferred.resolve(cloneJson(result));
        else resolveWaiters(currentWaiters, result);

        request = pendingRequest;
        currentWaiters = pendingWaiters;
        pendingRequest = null;
        pendingWaiters = [];
        first = false;
      }
    } catch (error) {
      if (first) firstDeferred.reject(error);
      else rejectWaiters(currentWaiters, error);
      rejectWaiters(pendingWaiters, error);
      pendingRequest = null;
      pendingWaiters = [];
      throw error;
    } finally {
      inFlight = false;
    }
  }

  function persist(state, summary = 'Directive campaign state updated.', options = {}) {
    const request = {
      state: cloneJson(state),
      summary,
      fallbackHostId: options.fallbackHostId || null,
      fallbackSaveId: options.fallbackSaveId || null,
      forceSaveIndexUpdate: options.forceSaveIndexUpdate === true
    };
    if (inFlight || pendingRequest) {
      const priorForceSaveIndexUpdate = pendingRequest?.forceSaveIndexUpdate === true;
      pendingRequest = mergePendingRequest(pendingRequest, request, pendingOptionsFor(request));
      pendingRequest.forceSaveIndexUpdate = priorForceSaveIndexUpdate || request.forceSaveIndexUpdate === true;
      return new Promise((resolve, reject) => {
        pendingWaiters.push({ resolve, reject });
      });
    }

    inFlight = true;
    const firstDeferred = deferred();
    const worker = queue.then(
      () => drain(request, firstDeferred),
      () => drain(request, firstDeferred)
    );
    queue = worker.catch(() => null);
    return firstDeferred.promise;
  }

  async function settle() {
    await queue;
  }

  return {
    persist,
    settle
  };
}
