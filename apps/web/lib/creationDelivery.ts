import type { MasterVersion } from './api';

export function exactApproval(version: MasterVersion) {
  return !!(version.approval && !version.approval.invalidatedAt && version.approval.checksum === version.checksum);
}

/** Le serveur sélectionne le binaire avec « version », pas « v ». */
export function masterMediaUrl(projectId: string, version: number) {
  return '/api/projects/' + encodeURIComponent(projectId) + '/master?version=' + version;
}
