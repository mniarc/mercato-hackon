import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDevEnvReloader, resolveDevEnvFilePaths, watchDevEnvFiles, watchDevRuntimeFiles } from '../dev-env-reload'
import { normalizeTestPath } from './path-helpers'

describe('dev env reload helpers', () => {
  let appDir: string

  beforeEach(() => {
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'om-dev-env-'))
  })

  afterEach(() => {
    fs.rmSync(appDir, { recursive: true, force: true })
  })

  it('resolves app env files in low-to-high dev precedence order', () => {
    expect(resolveDevEnvFilePaths('/tmp/app').map(normalizeTestPath)).toEqual([
      '/tmp/app/.env',
      '/tmp/app/.env.development',
      '/tmp/app/.env.local',
      '/tmp/app/.env.development.local',
    ])
  })

  it('reloads changed app env files without overriding shell-provided values', () => {
    fs.writeFileSync(path.join(appDir, '.env'), [
      'APP_URL=http://env.example',
      'DATABASE_URL=postgres://env-database',
      'REMOVED_LATER=present',
    ].join('\n'))
    fs.writeFileSync(path.join(appDir, '.env.local'), [
      'APP_URL=http://local.example',
      'SHELL_VALUE=env-file-value',
    ].join('\n'))

    const environment: NodeJS.ProcessEnv = {
      SHELL_VALUE: 'shell-value',
    }
    const reloader = createDevEnvReloader(appDir, environment, Object.entries(environment))

    reloader.reload()

    expect(environment.APP_URL).toBe('http://local.example')
    expect(environment.DATABASE_URL).toBe('postgres://env-database')
    expect(environment.SHELL_VALUE).toBe('shell-value')
    expect(environment.REMOVED_LATER).toBe('present')

    fs.writeFileSync(path.join(appDir, '.env'), [
      'APP_URL=http://env.example',
      'DATABASE_URL=postgres://changed-database',
    ].join('\n'))
    fs.rmSync(path.join(appDir, '.env.local'))

    reloader.reload()

    expect(environment.APP_URL).toBe('http://env.example')
    expect(environment.DATABASE_URL).toBe('postgres://changed-database')
    expect(environment.SHELL_VALUE).toBe('shell-value')
    expect(environment.REMOVED_LATER).toBeUndefined()
  })

  it('ignores access-only env notifications but reports content changes, creation and deletion', () => {
    const envFile = path.join(appDir, '.env')
    const localFile = path.join(appDir, '.env.local')
    fs.writeFileSync(envFile, 'FIXTURE_ONLY=initial\n')
    const listeners: Array<(eventType: string, fileName: string) => void> = []
    const watch = jest.spyOn(fs, 'watch').mockImplementation(((_directory: unknown, listener: (eventType: string, fileName: string) => void) => {
      listeners.push(listener)
      return { close: jest.fn() }
    }) as never)
    jest.useFakeTimers()
    const changed = jest.fn()
    const stop = watchDevEnvFiles(appDir, changed, { debounceMs: 10 })
    const notify = (fileName: string, eventType = 'change') => {
      listeners.forEach((listener) => listener(eventType, fileName))
      jest.advanceTimersByTime(10)
    }

    try {
      // Reproduce the notification produced by Windows after access metadata changes.
      fs.readFileSync(envFile)
      notify('.env')
      expect(changed).not.toHaveBeenCalled()

      fs.writeFileSync(envFile, 'FIXTURE_ONLY=changed\n')
      notify('.env')
      notify('.env')
      expect(changed.mock.calls).toEqual([[envFile]])

      fs.writeFileSync(localFile, 'FIXTURE_ONLY=local\n')
      notify('.env.local', 'rename')
      fs.unlinkSync(envFile)
      notify('.env', 'rename')
      expect(changed.mock.calls).toEqual([[envFile], [localFile], [envFile]])
    } finally {
      stop()
      watch.mockRestore()
      jest.useRealTimers()
    }
  })

  it('watches generated runtime files when explicitly requested', async () => {
    const generatedDir = path.join(appDir, '.mercato', 'generated')
    fs.mkdirSync(generatedDir, { recursive: true })
    const generatedFile = path.join(generatedDir, 'backend-routes.generated.ts')
    fs.writeFileSync(generatedFile, 'export const routes = []\n')

    let stop = () => {}
    let observed = false
    const seen = new Promise<string>((resolve) => {
      stop = watchDevRuntimeFiles(appDir, (filePath) => {
        observed = true
        resolve(filePath)
      }, { debounceMs: 10 })
    })

    let revision = 0
    const trigger = setInterval(() => {
      if (observed) return
      fs.writeFileSync(generatedFile, `export const routes = [${(revision += 1)}]\n`)
    }, 20)

    try {
      await expect(seen).resolves.toBe(generatedFile)
    } finally {
      clearInterval(trigger)
      stop()
    }
  })
})
