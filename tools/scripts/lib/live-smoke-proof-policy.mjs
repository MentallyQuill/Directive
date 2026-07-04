function proofStatus(value) {
  return String(value || '').trim() || 'missing';
}

function proofFailure(id, label, status, proof = null) {
  return {
    id,
    status,
    summary: `${label} must be pass for strict live proof; got ${status}.`,
    source: proof?.source || null,
    timingSource: proof?.timingSource || null,
    completionSource: proof?.completionSource || null,
    checkedTurnCount: proof?.checkedTurnCount ?? null,
    skippedTurnCount: proof?.skippedTurnCount ?? null,
    completedHostContinueCount: proof?.completedHostContinueCount ?? null,
    requiredCompletionCount: proof?.requiredCompletionCount ?? null,
    requiredCompletionPassCount: proof?.requiredCompletionPassCount ?? null,
    reason: proof?.reason || proof?.unavailableReason || null
  };
}

export function liveSmokeStrictProofFailures({
  strict = false,
  generationTimingStatus = null,
  generationTimingProof = null,
  hostNativeCompletionStatus = null,
  hostNativeCompletionProof = null
} = {}) {
  if (strict !== true) return [];
  const failures = [];
  const timingStatus = proofStatus(generationTimingStatus || generationTimingProof?.status);
  if (timingStatus !== 'pass') {
    failures.push(proofFailure(
      'generation-timing-proof',
      'Generation timing proof',
      timingStatus,
      generationTimingProof
    ));
  }
  const completionStatus = proofStatus(hostNativeCompletionStatus || hostNativeCompletionProof?.status);
  if (completionStatus !== 'pass') {
    failures.push(proofFailure(
      'host-native-completion-proof',
      'Host-native completion proof',
      completionStatus,
      hostNativeCompletionProof
    ));
  }
  return failures;
}
