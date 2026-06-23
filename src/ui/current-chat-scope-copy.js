export function activePackageForView(view) {
  return view?.currentChatActivePackage || view?.activePackage || null;
}

export function currentChatEmptyMessage(view, fallback = 'Choose a Directive campaign chat to show live campaign state.') {
  const status = view?.currentChat?.status || '';
  switch (status) {
    case 'missing-capability':
      return 'This host cannot tell Directive which chat is selected, so live campaign panels and Save Game stay locked.';
    case 'none-selected':
      return 'Choose the campaign chat for this save to show live mission state. You can open it from Campaign Records.';
    case 'non-directive':
      return 'The selected host chat is not linked to this Directive save. Open the save\'s campaign chat from Campaign Records.';
    case 'different-save':
      return 'The selected campaign chat belongs to a different save branch. Load that branch, or open this save\'s campaign chat from Campaign Records.';
    case 'different-campaign':
      return 'The selected campaign chat belongs to a different Directive campaign. Open this save\'s campaign chat from Campaign Records.';
    case 'missing-save':
      return 'The selected campaign chat points to a missing Directive save. Open Campaign Records to repair it.';
    case 'metadata-conflict':
      return 'This campaign chat has conflicting Directive save data. Rebind or repair it from Campaign Records.';
    default:
      return fallback;
  }
}
