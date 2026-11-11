export type FileReference={id:string;title:string;usage:'public'|'approved'|'draft'|'trash'|'history'}
export type InventoryFile={id:string;name:string;bytes:number|null;provider:'d1'|'drive';driveId:string|null;
  state:'public'|'private'|'retained'|'unlinked';deleteAfter:number|null;references:FileReference[];migrateUpload:string|null;assetId:string|null}
export type FileInventory={files:InventoryFile[];totalBytes:number;unknown:number;publicFiles:number}
