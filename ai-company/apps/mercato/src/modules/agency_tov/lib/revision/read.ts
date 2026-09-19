import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyTovDocument, AgencyTovDocumentVersion, AgencyTovPost, AgencyTovResearchRun, AgencyTovSource } from '../../data/entities'
import { tovOutputLanguages, tovProfileVoiceSchema } from '../../data/validators'
import { groupByProfile, profileMetaFor } from '../corpus'
import { readTovDocumentVersion } from '../documentVersion/read'
import { postRowToTovPost, type StoredCorpus, type TovScope } from '../store'
import type { TovRevisionRequest } from './contracts'

const profilePinsSchema = z.object({ revision: z.object({ profileVersionIds: z.array(z.uuid()).min(1) }) })

export async function readRevisionEvidence(em: EntityManager, scope: TovScope, request: TovRevisionRequest) {
  const previous = await readTovDocumentVersion(em, scope, request.previous)
  if (!previous || previous.documentId !== request.previous.documentId || previous.version !== request.previous.version) return null
  const run = await findOneWithDecryption(em, AgencyTovResearchRun, { ...scope, id: previous.researchRunId, status: 'done' }, undefined, scope)
  if (!run) return null
  const postIds = z.array(z.uuid()).min(1).safeParse(run.postIds)
  const language = z.enum(tovOutputLanguages).safeParse(run.outputLanguage)
  if (!postIds.success || !language.success) return null
  const rows = await findWithDecryption(em, AgencyTovPost, { ...scope, id: { $in: postIds.data } }, undefined, scope)
  const byId = new Map(rows.map((row) => [row.id, row]))
  if (byId.size !== postIds.data.length) return null
  const sources = await findWithDecryption(em, AgencyTovSource, { ...scope, id: { $in: [...new Set(rows.map((row) => row.sourceId))] }, deletedAt: null }, undefined, scope)
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  const ordered = postIds.data.map((id) => byId.get(id)!)
  if (ordered.some((row) => !sourceById.has(row.sourceId))) return null
  const posts = ordered.map((row) => postRowToTovPost(row, sourceById.get(row.sourceId)!))
  const corpus: StoredCorpus = { posts, sources, rowIds: postIds.data, rowOf(postId) {
    const index = posts.findIndex((post) => post.id === postId)
    return index < 0 ? null : { id: ordered[index].id, url: posts[index].url, profileUrl: posts[index].profileUrl }
  } }
  const pinned = profilePinsSchema.safeParse(run.stats)
  const versions = await findWithDecryption(em, AgencyTovDocumentVersion, {
    ...scope, ...(pinned.success ? { id: { $in: pinned.data.revision.profileVersionIds } } : { researchRunId: run.id }),
  }, undefined, scope)
  const documents = await findWithDecryption(em, AgencyTovDocument, {
    ...scope, id: { $in: versions.map((version) => version.documentId) }, kind: 'TOV-PROFILE', brand: run.brand, deletedAt: null,
  }, undefined, scope)
  const groups = groupByProfile(posts)
  const profiles = []
  const profileVersionIds: string[] = []
  for (const [profileUrl, profilePosts] of groups) {
    const document = documents.find((candidate) => candidate.profileUrl === profileUrl)
    const matching = versions.filter((version) => version.documentId === document?.id)
    if (matching.length !== 1) return null
    let raw: unknown
    try { raw = JSON.parse(matching[0].body) } catch { return null }
    const voice = tovProfileVoiceSchema.safeParse(raw)
    if (!voice.success) return null
    profileVersionIds.push(matching[0].id)
    profiles.push({ profile: profileMetaFor(profileUrl, profilePosts), voice: voice.data })
  }
  return { previous, corpus, profiles, profileVersionIds, outputLanguage: language.data }
}
