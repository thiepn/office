// No live client is issued or configured in O4.1. The Account team must approve
// the exact cross-origin public client and server policy before activation.
import {ownerId} from './sync-contract.js';
import {openAccountWorkspace} from './account-store.js';
export function accountWorkspaceController(session){
 let generation=0,workspace=null;
 function close(){generation++;workspace?.close();workspace=null;}
 async function connect(){close();const epoch=generation;const identity=await session.verify();if(identity.status!=='signed-in'||epoch!==generation)return null;const owner=ownerId(identity.id);const next=await openAccountWorkspace(identity);
  if(epoch!==generation||session.identity().status!=='signed-in'||ownerId(session.identity().id)!==owner){next.close();return null;}workspace=next;return next;
 }
 const unsubscribe=session.subscribe(identity=>{if(identity.status!=='signed-in'||workspace&&workspace.owner!==identity.id.toLowerCase())close();});
 return Object.freeze({connect,disconnect:close,dispose(){close();unsubscribe();}});
}
