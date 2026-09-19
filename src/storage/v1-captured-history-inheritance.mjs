import { assertV1HistoryInheritance } from './v1-segmented-save-contracts.mjs';
import { canonicalJson, sha256Json } from './v1-state-delta-codec.mjs';

export function inheritanceAssert(condition, message) {
  if (!condition) throw Object.assign(new Error(message), { code: 'DIRECTIVE_V1_HISTORY_INHERITANCE_REJECTED' });
}

// Reject lossy JSON coercions before the first asynchronous boundary.
export function detachInheritanceJson(value, depth = 0, allowMaps = false) {
  inheritanceAssert(depth <= 128, 'Inheritance input exceeds nesting bounds.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { inheritanceAssert(Number.isFinite(value), 'Nonfinite inheritance input.'); return value; }
  if (allowMaps && value instanceof Map) {
    inheritanceAssert(Object.getPrototypeOf(value) === Map.prototype && Reflect.ownKeys(value).length === 0, 'Invalid runtime asset map.');
    return new Map([...Map.prototype.entries.call(value)].map(([key,item]) => [detachInheritanceJson(key,depth+1,true),detachInheritanceJson(item,depth+1,true)]));
  }
  inheritanceAssert(value && typeof value === 'object' && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null), 'Inheritance input must be JSON data.');
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  inheritanceAssert(keys.every(key => typeof key === 'string' && Object.hasOwn(descriptors[key], 'value')
    && (descriptors[key].enumerable || (Array.isArray(value) && key === 'length'))), 'Inheritance input has accessors or hidden keys.');
  if (Array.isArray(value)) {
    inheritanceAssert(keys.length === value.length + 1 && Array.from({length:value.length},(_,index)=>Object.hasOwn(descriptors,String(index))).every(Boolean), 'Inheritance input has sparse or decorated arrays.');
    return Array.from({length:value.length},(_,index)=>detachInheritanceJson(descriptors[index].value,depth+1,allowMaps));
  }
  return Object.fromEntries(keys.map(key => [key, detachInheritanceJson(descriptors[key].value, depth + 1, allowMaps)]));
}

export async function verifyV1HistoryInheritance(adapter, save, inheritance, runtimeAssets, sourceSnapshot) {
  assertV1HistoryInheritance(inheritance);
  const { loadV1CapturedHistoryArchive } = await import('./v1-captured-history-archive.mjs');
  const { loadV1CampaignStateAtTranscriptCut } = await import('./v1-storage-repository.mjs');
  const archived = await loadV1CapturedHistoryArchive(adapter, inheritance.archive);
  const selected = await loadV1CampaignStateAtTranscriptCut(archived.adapter, inheritance.source.saveId, {
    expectedManifest: archived.expectedManifest, transcript: archived.transcript, retainedRowCount: inheritance.cut.rowCount,
  });
  const expectedSource = {
    saveId: selected.origin.saveId, manifestHash: selected.provenance.manifestHash,
    recordIndex: selected.capture.selected.index, operationId: selected.capture.selected.operationId,
    revision: selected.revision, stateHash: selected.stateHash,
    vectorHash: selected.capture.selected.vectorHash, rowCount: selected.capture.selected.rowCount,
  };
  inheritanceAssert(canonicalJson(expectedSource) === canonicalJson(inheritance.source)
    && canonicalJson(selected.capture.cut) === canonicalJson(inheritance.cut), 'Inheritance source or cut differs from the verified archive.');
  inheritanceAssert(save.campaignId === selected.origin.campaignId && save.packageId === selected.origin.packageId
    && save.packageVersion === selected.origin.packageVersion, 'Inheritance campaign or package differs.');
  const target = inheritance.target;
  inheritanceAssert(target.saveId === save.id && target.slotType === save.slotType
    && target.baselineRevision === save.state.stateCustody.revision
    && target.baselineStateHash === await sha256Json(save.state)
    && target.bindingHash === await sha256Json(save.state.campaignChatBinding), 'Inheritance target baseline differs.');
  let derived = selected.state;
  if (save.slotType === 'active') {
    inheritanceAssert(runtimeAssets && typeof runtimeAssets === 'object', 'Active inheritance requires runtime assets.');
    const { computeBranchHistoryPackageFingerprintV1 } = await import('../runtime/branch-history-package-fingerprint.mjs');
    inheritanceAssert(await computeBranchHistoryPackageFingerprintV1(runtimeAssets) === selected.packageFingerprint, 'Runtime assets differ from the archived authority package.');
    const { rebindV1CampaignStateCustody } = await import('../runtime/v1-branch-reconstruction.mjs');
    derived = rebindV1CampaignStateCustody({ campaignState: selected.state, targetSaveId: save.id,
      targetChatBinding: save.state.campaignChatBinding, runtimeAssets }).campaignState;
  } else {
    inheritanceAssert(save.parentSaveId === selected.origin.branchId, 'Checkpoint parent differs from selected custody.');
    if (canonicalJson(derived) !== canonicalJson(save.state) && Object.hasOwn(save.state.campaignChatBinding, 'transcriptAttestation')) {
      const { projectBranchHistoryTranscriptV1 } = await import('../runtime/v1-branch-history-transcript.mjs');
      const { createNativeBranchTranscriptAttestation } = await import('../runtime/native-branch-lineage.mjs');
      const projected = await projectBranchHistoryTranscriptV1(sourceSnapshot);
      inheritanceAssert(projected.status === 'projected' && canonicalJson(projected.transcript) === canonicalJson(archived.transcript),
        'Checkpoint attestation requires the exact complete archived source snapshot.');
      // The observation belongs to the archived head; the selected historical
      // state may have older display metadata. Custody itself must be identical.
      const head = await loadV1CampaignStateAtTranscriptCut(archived.adapter, inheritance.source.saveId, {
        expectedManifest: archived.expectedManifest, transcript: archived.transcript, retainedRowCount: archived.transcript.rowCount,
      });
      const headBinding = head.state.campaignChatBinding, selectedBinding = selected.state.campaignChatBinding;
      inheritanceAssert(['hostId','entityType','entityId','chatId','saveId','campaignId'].every(key => selectedBinding[key] === headBinding[key])
        && canonicalJson(sourceSnapshot.directiveBinding) === canonicalJson(headBinding)
        && sourceSnapshot.hostId === headBinding.hostId
        && canonicalJson(sourceSnapshot.nativeIdentity) === canonicalJson({ entityType: headBinding.entityType, entityId: headBinding.entityId, chatId: headBinding.chatId }),
      'Checkpoint snapshot binding differs from archived source custody.');
      derived = structuredClone(selected.state);
      derived.campaignChatBinding.transcriptAttestation = createNativeBranchTranscriptAttestation(sourceSnapshot.rows.slice(0, inheritance.cut.rowCount));
      // This establishes equality with supplied captured data, not native branch authority.
    }
  }
  inheritanceAssert(canonicalJson(derived) === canonicalJson(save.state), 'Target is not the exact derived state or verified checkpoint attestation.');
  return selected;
}
