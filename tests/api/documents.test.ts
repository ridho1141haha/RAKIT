/**
 * Documents: persistence, autosave PATCH semantics, cross-workspace guards,
 * activity-feed noise control.
 */
import { describe, it, expect } from 'bun:test'
import { api, createProject, userWithWorkspace } from './helpers'

async function createDoc(user: Awaited<ReturnType<typeof userWithWorkspace>>['user'], workspaceId: string) {
  const res = await api(user, 'POST', `/api/workspaces/${workspaceId}/documents`, {
    title: 'Dokumen Uji',
    content: 'isi awal',
  })
  expect(res.status).toBe(201)
  return res.body.document as { id: string; title: string; content: string; projectId: string | null }
}

describe('documents', () => {
  it('persists autosave PATCH content and returns it after re-fetch', async () => {
    const { user, workspaceId } = await userWithWorkspace('Dok Pemilik')
    const doc = await createDoc(user, workspaceId)

    const patch = await api(user, 'PATCH', `/api/documents/${doc.id}`, {
      title: doc.title,
      content: '# Diperbarui\n\nkonten baru yang harus tersimpan.',
    })
    expect(patch.status).toBe(200)

    const list = await api(user, 'GET', `/api/workspaces/${workspaceId}/documents`)
    const saved = list.body.documents.find((d: { id: string }) => d.id === doc.id)
    expect(saved.content).toBe('# Diperbarui\n\nkonten baru yang harus tersimpan.')
  })

  it('survives rapid sequential saves (last write wins, nothing lost)', async () => {
    const { user, workspaceId } = await userWithWorkspace('Dok Cepat')
    const doc = await createDoc(user, workspaceId)

    // autosave contract: saves for one document are serialized by the client
    // (per-document queue). Simulate a rapid burst of sequential saves.
    for (let i = 0; i < 6; i++) {
      const r = await api(user, 'PATCH', `/api/documents/${doc.id}`, {
        title: doc.title,
        content: `rev ${i}`,
      })
      expect(r.status).toBe(200)
    }

    const list = await api(user, 'GET', `/api/workspaces/${workspaceId}/documents`)
    const saved = list.body.documents.find((d: { id: string }) => d.id === doc.id)
    expect(saved.content).toBe('rev 5')
  })

  it('parallel saves never corrupt the document (final content is one of the writes)', async () => {
    const { user, workspaceId } = await userWithWorkspace('Dok Paralel')
    const doc = await createDoc(user, workspaceId)

    // even under out-of-order concurrent writes the document must end up with
    // ONE of the submitted contents — never a mix or a loss of the resource
    const writes = ['paralel-a', 'paralel-b', 'paralel-c', 'paralel-d']
    const results = await Promise.all(
      writes.map((c) =>
        api(user, 'PATCH', `/api/documents/${doc.id}`, { title: doc.title, content: c }),
      ),
    )
    for (const r of results) expect(r.status).toBe(200)

    const list = await api(user, 'GET', `/api/workspaces/${workspaceId}/documents`)
    const saved = list.body.documents.find((d: { id: string }) => d.id === doc.id)
    expect(writes).toContain(saved.content)
  })

  it('rejects linking a document to a project in ANOTHER workspace (400)', async () => {
    const ownerA = await userWithWorkspace('Dok A')
    const ownerB = await userWithWorkspace('Dok B')
    const doc = await createDoc(ownerA.user, ownerA.workspaceId)
    const foreignProject = await createProject(ownerB.user, ownerB.workspaceId, 'Proyek Asing')

    const res = await api(ownerA.user, 'PATCH', `/api/documents/${doc.id}`, {
      projectId: foreignProject,
    })
    expect(res.status).toBe(400)
  })

  it('hides documents from users outside the workspace (404)', async () => {
    const owner = await userWithWorkspace('Dok Rahasia')
    const outsider = await registerUserSafe()
    const doc = await createDoc(owner.user, owner.workspaceId)

    const res = await api(outsider, 'GET', `/api/documents/${doc.id}`)
    expect(res.status).toBe(404)
  })

  it('content-only autosave does NOT flood the activity feed; title change does log', async () => {
    const { user, workspaceId } = await userWithWorkspace('Dok Aktivitas')
    const doc = await createDoc(user, workspaceId)

    const countEvents = async () => {
      const res = await api(user, 'GET', `/api/workspaces/${workspaceId}/activity`)
      return (res.body.events as unknown[]).length
    }
    const before = await countEvents()

    // three content-only saves (typical autosave traffic)
    for (const rev of ['a', 'b', 'c']) {
      const r = await api(user, 'PATCH', `/api/documents/${doc.id}`, {
        title: doc.title,
        content: `konten ${rev}`,
      })
      expect(r.status).toBe(200)
    }
    const afterContent = await countEvents()
    expect(afterContent).toBe(before) // no activity spam from content saves

    // a TITLE change is meaningful → exactly one new event
    await api(user, 'PATCH', `/api/documents/${doc.id}`, { title: 'Judul Baru Bermakna' })
    const afterTitle = await countEvents()
    expect(afterTitle).toBe(before + 1)
  })

  it('rejects malformed document payloads with 422', async () => {
    const { user, workspaceId } = await userWithWorkspace('Dok Validasi')
    const doc = await createDoc(user, workspaceId)
    const res = await api(user, 'PATCH', `/api/documents/${doc.id}`, { title: 'x' }) // below min length
    expect(res.status).toBe(422)
  })
})

let seq = 0
async function registerUserSafe() {
  seq += 1
  return (await userWithWorkspace(`Dok Luar ${seq}`)).user
}
