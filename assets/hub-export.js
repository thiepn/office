import {createPortableBackup} from './portable-backup.js';
import {ownerId} from './sync-contract.js';
// Integration contract for the Hub origin. Caller must supply the already-open
// OfficeDeviceStore for the explicit selected scope and current verified identity.
// This module never opens IndexedDB or reads another origin.
export async function exportSelectedHubScope(deviceStore,scope,identity,confirmation){
 if(!deviceStore||deviceStore.scope!==scope||typeof deviceStore.list!=='function'||confirmation!==scope)throw Error('Confirm the exact selected Hub scope.');
 if(scope!=='guest'){
  if(identity?.status!=='signed-in'||scope!=='user:'+ownerId(identity.id))throw Error('Verify the selected Hub account before export.');
 }
 return createPortableBackup('hub',scope,await deviceStore.list());
}
