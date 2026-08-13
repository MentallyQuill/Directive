export function bindSingleOpenDisclosure({
  records = [],
  initialOpenKey = null,
  onOpen = null
} = {}) {
  const entries = records.filter((record) => (
    record?.key && record?.trigger && record?.panel
  ));
  const keys = new Set(entries.map((record) => record.key));
  let openKey = keys.has(initialOpenKey) ? initialOpenKey : null;

  const apply = () => {
    for (const record of entries) {
      const expanded = record.key === openKey;
      record.trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      if (record.panel.id) record.trigger.setAttribute('aria-controls', record.panel.id);
      record.panel.hidden = !expanded;
    }
  };

  const setOpenKey = (key) => {
    const nextKey = keys.has(key) ? key : null;
    const changed = nextKey !== openKey;
    openKey = nextKey;
    apply();
    if (changed && openKey) onOpen?.(openKey);
    return openKey;
  };

  for (const record of entries) {
    record.trigger.addEventListener('click', () => {
      setOpenKey(record.key === openKey ? null : record.key);
    });
  }
  apply();

  return {
    getOpenKey: () => openKey,
    setOpenKey
  };
}
