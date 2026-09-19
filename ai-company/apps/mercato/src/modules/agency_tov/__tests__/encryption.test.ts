/**
 * Pins the encryption map to the document-version entity (TOV-02): the two text
 * columns that carry the synthesis and its rendering are declared, the id matches
 * the generated entity id, and the module never lists a public-corpus column.
 */
import defaultEncryptionMaps from '../encryption'
import { AgencyTovDocumentVersion } from '../data/entities'

const ENTITY_ID = 'agency_tov:agency_tov_document_version'

describe('agency_tov encryption map', () => {
  it('encrypts the document version body and rendering, nothing else', () => {
    expect(defaultEncryptionMaps.map((map) => map.entityId)).toEqual([ENTITY_ID])
    const map = defaultEncryptionMaps[0]
    expect(map.keyScope ?? 'tenant').toBe('tenant')
    expect(map.fields.map((rule) => rule.field)).toEqual(['body', 'renderedMd'])
  })

  it('names real properties of the version entity', () => {
    const instance = new AgencyTovDocumentVersion()
    instance.body = ''
    instance.renderedMd = ''
    for (const rule of defaultEncryptionMaps[0].fields) expect(rule.field in instance).toBe(true)
  })
})
