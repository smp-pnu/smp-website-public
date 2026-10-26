import { cloudMode, serverMode } from "./mode"
import * as local from "./local-storage"
import * as remote from "./server-storage"
import * as cloud from "./cloud-storage"
import { applyCommand, type DraftCommand, type Draft, type Assets } from "./model"
const server = cloudMode ? cloud : remote
const store = serverMode ? server : local
export const listDrafts = () => store.listDrafts()
export const readAssets = (id: string) => store.readAssets(id)
export const readCover = (id: string) => serverMode ? remote.readCover(id) : local.readAssets(id).then(assets => assets?.cover)
export const insertDraft = (draft: Draft, assets: Assets, signal?: AbortSignal, progress?: (step: string) => void) => cloudMode
  ? cloud.insertDraft(draft, assets, signal, progress)
  : serverMode ? remote.insertDraft(draft, assets, signal) : local.insertDraft(draft, assets)
export const mutateDraft = (id: string, revision: number, command: DraftCommand) => serverMode
  ? remote.mutateDraft(id, revision, command)
  : local.mutateDraft(id, revision, current => applyCommand(current, command, new Date().toISOString()))
