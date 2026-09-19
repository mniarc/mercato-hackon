import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:os'

export const loggedAgencyCommands = new Set(['build', 'verify-image', 'export', 'import'])

export function redactLogText(value) {
  return String(value)
    .replace(/((?:password|secret|token|api[_-]?key|authorization)[\w-]*\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[redacted]')
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, '$1[redacted]@')
}

export function redactCommandArgs(args) {
  let hideNext = false
  return args.map(value => {
    if (hideNext) { hideNext = false; return '[redacted]' }
    if (/^--?[\w-]*(?:password|secret|token|api[_-]?key)(?:$|=)/i.test(value)) {
      if (!value.includes('=')) { hideNext = true; return value }
      return `${value.slice(0, value.indexOf('=') + 1)}[redacted]`
    }
    return redactLogText(value)
  })
}

export function createInvocationLog(root, command, args = [], { warn = console.error } = {}) {
  const directory = path.join(root, '.build-artifacts', '.cache-logs')
  fs.mkdirSync(directory, { recursive: true })
  const startedAt = new Date().toISOString()
  const file = path.join(directory, `${startedAt.replace(/[:.]/g, '-')}-${command.replace(/[^a-z0-9-]/gi, '-')}-${process.pid}-${randomUUID().slice(0, 8)}.log`)
  const descriptor = fs.openSync(file, 'wx', 0o600)
  let closed = false, failed = false
  const write = text => {
    if (closed || failed) return
    try {
      const buffer = Buffer.from(text)
      let offset = 0
      while (offset < buffer.length) {
        const written = fs.writeSync(descriptor, buffer, offset, buffer.length - offset)
        if (!written) throw new Error('Log write made no progress')
        offset += written
      }
    } catch {
      failed = true
      warn(`Log write failed; command continues, retained log may be incomplete: ${file}`)
    }
  }
  const event = (name, data = {}) => write(`${new Date().toISOString()} [event] ${JSON.stringify({ event: name, ...data })}\n`)
  event('start', { command, args: redactCommandArgs(args), pid: process.pid, startedAt })
  return {
    path: file,
    event,
    line(stream, text) { write(`${new Date().toISOString()} [${stream}] ${redactLogText(text)}\n`) },
    close({ exitCode = 0, signal = null } = {}) {
      if (closed) return
      event('end', { command, exitCode, signal, endedAt: new Date().toISOString(), durationMs: Date.now() - Date.parse(startedAt) })
      closed = true
      fs.closeSync(descriptor)
    },
  }
}

export function signalExitCode(signal) { return 128 + (constants.signals[signal] ?? 1) }

export function forwardFailureExit(error) {
  process.exitCode = error?.signal ? signalExitCode(error.signal) : error?.exitCode ?? 1
  if (error?.signal && process.platform !== 'win32') process.kill(process.pid, error.signal)
}
