import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'

/**
 * At-rest encryption for the documents this lane writes (TOV-02).
 *
 * A document version holds the synthesis (`body`, the zod-typed JSON string) and
 * its rendering (`rendered_md`): the client's voice description, verbatim quotes
 * and — once a paid case binds its own material — confidential client content.
 * Both are opaque text the platform never filters, sorts or exports, so nothing
 * on the read path needs a plaintext column. Every reader (`lib/documentVersion`,
 * `lib/revision`, `lib/store`, `agency_operations` client artifacts) already goes
 * through `find*WithDecryption`; the tenant-encryption subscriber encrypts on flush.
 *
 * `citations` stay plaintext on purpose: each one resolves a quote to a public
 * post row (ids, url, the verbatim public sentence), and the column is jsonb —
 * the decrypt path returns entity fields as strings, never re-parsed, so a
 * ciphertext jsonb would come back as text. The corpus itself
 * (`agency_tov_posts`) is public material and stays readable.
 *
 * Maps are materialised per tenant at tenant creation; an existing tenant needs
 * `yarn mercato entities seed-encryption --tenant <id>` once. Versions written
 * before that stay plaintext (the decrypt path passes non-ciphertext through) —
 * they are immutable, so re-run the research to get an encrypted version.
 */
export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  {
    entityId: 'agency_tov:agency_tov_document_version',
    fields: [{ field: 'body' }, { field: 'renderedMd' }],
  },
]

export default defaultEncryptionMaps
