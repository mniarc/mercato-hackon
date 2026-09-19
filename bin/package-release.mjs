import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createInvocationLog, forwardFailureExit, signalExitCode } from './invocation-log.mjs'

const teamRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const usage = `Usage: node bin/package-release.mjs --image <image:tag> --image-file <absolute-path> --output <absolute-path>

Creates one uncompressed portable tar containing the prebuilt image archive and
the existing agency deployment runner. The output target must not exist.
`

const bundleFiles = [
  ['bin/agency.mjs', 'bin/agency.mjs', 0o644],
  ['bin/invocation-log.mjs', 'bin/invocation-log.mjs', 0o644],
  ['bin/agency.ps1', 'bin/agency.ps1', 0o644],
  ['bin/agency.sh', 'bin/agency.sh', 0o755],
  ['ai-company/docker/agency/compose.yml', 'ai-company/docker/agency/compose.yml', 0o644],
  ['ai-company/docker/agency/runtime.env.example', 'ai-company/docker/agency/runtime.env.example', 0o644],
  ['.demo-docs/server-setup/guide.md', '.demo-docs/server-setup/guide.md', 0o644],
  ['.demo-docs/server-setup/setup.mjs', '.demo-docs/server-setup/setup.mjs', 0o644],
  ['.demo-docs/server-setup/setup.ps1', '.demo-docs/server-setup/setup.ps1', 0o644],
  ['.demo-docs/server-setup/setup.sh', '.demo-docs/server-setup/setup.sh', 0o755],
]

export function parsePackageArgs(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) return { help: true }
  const options = {}
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const key = flag?.startsWith('--') ? flag.slice(2) : ''
    const value = argv[index + 1]
    if (!['image', 'image-file', 'output'].includes(key) || !value || value.startsWith('--') || Object.hasOwn(options, key)) {
      throw new Error(usage)
    }
    options[key] = value
  }
  for (const key of ['image', 'image-file', 'output']) {
    if (!options[key]?.trim()) throw new Error(`Explicit --${key} is required`)
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._/:@-]+$/.test(options.image)) throw new Error('--image must be an explicit Docker image reference')
  for (const key of ['image-file', 'output']) {
    if (!path.isAbsolute(options[key])) throw new Error(`--${key} must be an absolute path`)
  }
  if (path.extname(options.output).toLowerCase() !== '.tar') throw new Error('--output must name an uncompressed .tar file')
  return { help: false, image: options.image, imageFile: path.normalize(options['image-file']), output: path.normalize(options.output) }
}

function writeString(header, offset, length, value) {
  const bytes = Buffer.from(value, 'utf8')
  if (bytes.length > length) throw new Error(`Tar entry metadata is too long: ${value}`)
  bytes.copy(header, offset)
}

function writeOctal(header, offset, length, value) {
  const encoded = `${value.toString(8).padStart(length - 1, '0')}\0`
  if (encoded.length > length) throw new Error(`Tar entry value is too large: ${value}`)
  writeString(header, offset, length, encoded)
}

function createTarHeader({ name, size = 0, mode, modifiedAt, type = '0' }) {
  const header = Buffer.alloc(512)
  writeString(header, 0, 100, name)
  writeOctal(header, 100, 8, mode)
  writeOctal(header, 108, 8, 0)
  writeOctal(header, 116, 8, 0)
  writeOctal(header, 124, 12, size)
  writeOctal(header, 136, 12, modifiedAt)
  writeString(header, 148, 8, '        ')
  writeString(header, 156, 1, type)
  writeString(header, 257, 6, 'ustar\0')
  writeString(header, 263, 2, '00')
  writeString(header, 265, 32, 'root')
  writeString(header, 297, 32, 'root')
  const checksum = header.reduce((total, byte) => total + byte, 0)
  writeString(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `)
  return header
}

async function writeAll(handle, buffer) {
  let offset = 0
  while (offset < buffer.length) {
    const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset)
    if (!bytesWritten) throw new Error('Unable to write release archive')
    offset += bytesWritten
  }
}

async function addBuffer(handle, name, content, mode, modifiedAt) {
  await writeAll(handle, createTarHeader({ name, size: content.length, mode, modifiedAt }))
  await writeAll(handle, content)
  const padding = (512 - (content.length % 512)) % 512
  if (padding) await writeAll(handle, Buffer.alloc(padding))
}

async function addFile(handle, name, source, mode, modifiedAt, signal) {
  const sourceStat = await fs.lstat(source)
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error(`Release input must be a regular file: ${source}`)
  await writeAll(handle, createTarHeader({ name, size: sourceStat.size, mode, modifiedAt }))
  let copied = 0
  for await (const chunk of createReadStream(source, { signal })) {
    copied += chunk.length
    await writeAll(handle, chunk)
  }
  if (copied !== sourceStat.size) throw new Error(`Release input changed while packaging: ${source}`)
  const padding = (512 - (sourceStat.size % 512)) % 512
  if (padding) await writeAll(handle, Buffer.alloc(padding))
}

function quickstart({ image, imageName }) {
  return `Agency server quickstart
========================

Requirements: Docker Engine, the Docker Compose v2 plugin, and Node.js 24 for
bin/agency.sh or bin/agency.ps1. This bundle imports a prebuilt image; do not run
the build command on the server.

Human setup guide and optional PowerShell/Bash helpers:
.demo-docs/server-setup/guide.md (supports explicit --release-dir).
One installation per Docker daemon: the Compose project is always agency-server.

1. Extract this outer tar and change into its single agency-release-* directory.
2. Load the image archive:

   sh bin/agency.sh import --file "$(pwd)/image/${imageName}"

   Windows PowerShell 5.1 equivalent:
   $imageArchive = (Resolve-Path ".\\image\\${imageName}").Path
   & .\\bin\\agency.ps1 import --file $imageArchive

3. Create the private runtime file outside this directory:

   # Use a private directory owned by the operator (ask an admin to provision it).
   install -d -m 0700 /etc/agency
   sh .demo-docs/server-setup/setup.sh prepare --release-dir "$(pwd)" --env-file /etc/agency/runtime.env --image ${image}

   Edit /etc/agency/runtime.env. Keep AGENCY_IMAGE=${image}; set the HTTPS
   origin, three independent account passwords, and an independent database password,
   JWT, auth, and retained encryption secrets. Configure real email before
   opening self-service registration. Provider keys do not approve agent spend.

4. Initialize an empty server once, then start it:

   sh bin/agency.sh preflight --env-file /etc/agency/runtime.env --for init
   sh bin/agency.sh up --env-file /etc/agency/runtime.env --service postgres
   sh bin/agency.sh init --env-file /etc/agency/runtime.env --organization "Our Agency"
   sh bin/agency.sh up --env-file /etc/agency/runtime.env

Remove OM_INIT_* values from the private runtime file after initialization. Put
the loopback HTTP port behind an HTTPS reverse proxy. For updates, follow the
repository deployment guide: back up data, import the new image, migrate in a
maintenance window, then deploy. Never use down -v.
`
}

async function assertRegularFile(source) {
  const stat = await fs.lstat(source)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Release input must be a regular file: ${source}`)
}

function releaseName(image) {
  const tag = image.includes(':') ? image.slice(image.lastIndexOf(':') + 1) : image
  return `agency-release-${tag.replace(/[^A-Za-z0-9._-]+/g, '-')}`
}

function archiveTimestamp() {
  if (process.env.SOURCE_DATE_EPOCH === undefined) return Math.floor(Date.now() / 1000)
  const value = Number(process.env.SOURCE_DATE_EPOCH)
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('SOURCE_DATE_EPOCH must be a non-negative integer')
  return value
}

export async function packageRelease({ image, imageFile, output, root = teamRoot, onProgress = () => {}, signal }) {
  signal?.throwIfAborted()
  onProgress({ stage: 'validate-inputs', status: 'start' })
  await assertRegularFile(imageFile)
  const outputParent = path.dirname(output)
  const parentStat = await fs.lstat(outputParent)
  if (!parentStat.isDirectory()) throw new Error(`Release output parent is not a directory: ${outputParent}`)
  try {
    await fs.lstat(output)
    throw new Error(`Release output already exists: ${output}`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  const sources = bundleFiles.map(([source, entry, mode]) => ({ source: path.join(root, source), entry, mode }))
  for (const item of sources) await assertRegularFile(item.source)
  onProgress({ stage: 'validate-inputs', status: 'end' })
  const rootName = releaseName(image)
  const imageName = path.basename(imageFile)
  const modifiedAt = archiveTimestamp()
  const temporary = path.join(outputParent, `.${path.basename(output)}.${process.pid}-${randomUUID()}.tmp`)
  let handle
  try {
    handle = await fs.open(temporary, 'wx', 0o600)
    onProgress({ stage: 'deployment-files', status: 'start' })
    for (const directory of ['', 'bin', 'image', 'ai-company', 'ai-company/docker', 'ai-company/docker/agency', '.demo-docs', '.demo-docs/server-setup']) {
      const name = `${rootName}${directory ? `/${directory}` : ''}/`
      await writeAll(handle, createTarHeader({ name, mode: 0o755, modifiedAt, type: '5' }))
    }
    for (const item of sources) await addFile(handle, `${rootName}/${item.entry}`, item.source, item.mode, modifiedAt, signal)
    onProgress({ stage: 'deployment-files', status: 'end' })
    onProgress({ stage: 'image-archive', status: 'start' })
    await addFile(handle, `${rootName}/image/${imageName}`, imageFile, 0o644, modifiedAt, signal)
    onProgress({ stage: 'image-archive', status: 'end' })
    onProgress({ stage: 'seal-release', status: 'start' })
    await addBuffer(handle, `${rootName}/QUICKSTART.txt`, Buffer.from(quickstart({ image, imageName }), 'utf8'), 0o644, modifiedAt)
    await writeAll(handle, Buffer.alloc(1024))
    await handle.sync()
    await handle.chmod(0o644)
    await handle.close()
    handle = undefined
    await fs.link(temporary, output)
    await fs.unlink(temporary)
    onProgress({ stage: 'seal-release', status: 'end' })
    return { output, rootName, image, imageFile, bytes: (await fs.stat(output)).size }
  } catch (error) {
    await handle?.close().catch(() => undefined)
    await fs.unlink(temporary).catch(() => undefined)
    throw error
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  let log, interrupted
  const controller = new AbortController()
  const onInterrupt = () => { interrupted = 'SIGINT'; controller.abort() }
  const onTerminate = () => { interrupted = 'SIGTERM'; controller.abort() }
  try {
    const options = parsePackageArgs(process.argv.slice(2))
    if (options.help) console.log(usage)
    else {
      log = createInvocationLog(teamRoot, 'package', process.argv.slice(2))
      console.error(`Command log: ${log.path}`)
      process.on('SIGINT', onInterrupt)
      process.on('SIGTERM', onTerminate)
      const result = await packageRelease({ ...options, signal: controller.signal, onProgress: stage => {
        log.event('stage', stage)
        const line = `Packaging: ${stage.stage} ${stage.status}`
        console.log(line)
        log.line('stdout', line)
      } })
      const summary = JSON.stringify(result, null, 2)
      console.log(summary)
      log.line('stdout', summary)
      log.close()
    }
  } catch (error) {
    const message = error instanceof Error && error.code === 'ENOENT' ? 'Release input or output directory not found' : error instanceof Error ? error.message : 'Release packaging failed'
    console.error(message)
    log?.line('stderr', message)
    log?.close({ exitCode: interrupted ? signalExitCode(interrupted) : 1, signal: interrupted ?? null })
    if (log) console.error(`Retained command log: ${log.path}`)
    process.off('SIGINT', onInterrupt)
    process.off('SIGTERM', onTerminate)
    forwardFailureExit(interrupted ? { signal: interrupted } : error)
  } finally {
    process.off('SIGINT', onInterrupt)
    process.off('SIGTERM', onTerminate)
  }
}
