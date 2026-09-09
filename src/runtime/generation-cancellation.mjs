export function generationAbortedError() {
  return Object.assign(new Error('Generation canceled.'), { name: 'AbortError', code: 'DIRECTIVE_GENERATION_ABORTED' });
}

export function assertGenerationActive(signal) {
  if (signal?.aborted) throw generationAbortedError();
}

// One runtime owns every model request, including optional/background work.
export function createGenerationCancellation(generation) {
  let controller = new AbortController();
  async function run(method, args, requestIndex, optionsIndex) {
    const session = controller.signal;
    const request = args[requestIndex] || {};
    const options = optionsIndex === null ? {} : args[optionsIndex] || {};
    const signal = AbortSignal.any([session, options.signal, request.signal].filter(Boolean));
    assertGenerationActive(signal);
    args[requestIndex] = { ...request, signal };
    if (optionsIndex !== null) args[optionsIndex] = { ...options, signal };
    let onAbort;
    const canceled = new Promise((_, reject) => {
      onAbort = () => reject(generationAbortedError());
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const result = await Promise.race([generation[method](...args), canceled]);
      assertGenerationActive(signal);
      return result;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }
  return {
    generation: {
      ...generation,
      generate: (...args) => run('generate', args, 1, 2),
      ...(generation.generateNarration ? { generateNarration: (...args) => run('generateNarration', args, 0, null) } : {}),
    },
    stop() { controller.abort(); },
    resume() { if (controller.signal.aborted) controller = new AbortController(); },
    get signal() { return controller.signal; },
    get stopped() { return controller.signal.aborted; },
  };
}
