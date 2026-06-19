function providerUnavailable(message) {
  const error = new Error(message);
  error.code = 'DIRECTIVE_PROVIDER_UNAVAILABLE';
  return error;
}

function normalizeText(value) {
  if (typeof value === 'string') return value;
  if (typeof value?.text === 'string') return value.text;
  if (typeof value?.content === 'string') return value.content;
  if (typeof value?.message === 'string') return value.message;
  if (typeof value?.choices?.[0]?.message?.content === 'string') return value.choices[0].message.content;
  if (typeof value?.choices?.[0]?.text === 'string') return value.choices[0].text;
  return '';
}

export function createSillyTavernNarrationProvider({
  contextFactory = () => globalThis.SillyTavern?.getContext?.()
} = {}) {
  return {
    id: 'sillytavern-current-provider',
    async generateNarration(request) {
      const context = contextFactory();
      if (!context) {
        throw providerUnavailable('SillyTavern context is not available for narration.');
      }

      let response;
      if (typeof context.generateRaw === 'function') {
        response = await context.generateRaw(request.prompt);
      } else if (typeof context.generate === 'function') {
        response = await context.generate(request.prompt);
      } else if (typeof context.generateText === 'function') {
        response = await context.generateText(request);
      } else {
        throw providerUnavailable('SillyTavern context does not expose a supported generation method.');
      }

      return {
        providerId: this.id,
        text: normalizeText(response),
        raw: response
      };
    }
  };
}
