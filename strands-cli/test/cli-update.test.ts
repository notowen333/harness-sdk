import { describe, expect, it, vi } from 'vitest'

import { updateCli, type UpdateRunner } from '../src/cli/update.js'
import { availableCliUpdate } from '../src/tui/update-check.js'

function memoryOutput(): { stream: Pick<NodeJS.WriteStream, 'write'>; text: () => string } {
  let value = ''
  return {
    stream: {
      write(chunk: string | Uint8Array) {
        value += chunk.toString()
        return true
      },
    },
    text: () => value,
  }
}

function runner(latest = '"1.2.0"\n', exitCode = 0): UpdateRunner {
  return {
    capture: vi.fn(async () => latest),
    inherit: vi.fn(async () => exitCode),
  }
}

describe('updateCli', () => {
  it('does not update a development checkout', async () => {
    const commands = runner()
    const errors = memoryOutput()

    expect(await updateCli({ currentVersion: '0.0.1-development', runner: commands, errorOutput: errors.stream })).toBe(
      1
    )
    expect(commands.capture).not.toHaveBeenCalled()
    expect(errors.text()).toContain('development checkout')
  })

  it('reports an already-current global installation', async () => {
    const commands = runner()
    const output = memoryOutput()

    expect(await updateCli({ currentVersion: '1.2.0', runner: commands, output: output.stream })).toBe(0)
    expect(commands.capture).toHaveBeenCalledWith('npm', ['view', '@strands-agents/cli@latest', 'version', '--json'])
    expect(commands.inherit).not.toHaveBeenCalled()
    expect(output.text()).toBe('Strands CLI 1.2.0 is already up to date.\n')
  })

  it('installs the latest global package', async () => {
    const commands = runner()
    const output = memoryOutput()

    expect(await updateCli({ currentVersion: '1.1.0', runner: commands, output: output.stream })).toBe(0)
    expect(commands.inherit).toHaveBeenCalledWith('npm', ['install', '--global', '@strands-agents/cli@latest'])
    expect(output.text()).toContain('Updating Strands CLI from 1.1.0 to 1.2.0')
    expect(output.text()).toContain('Updated Strands CLI to 1.2.0')
  })

  it('uses npm.cmd on Windows and preserves an install failure', async () => {
    const commands = runner('"1.2.0"', 7)
    const output = memoryOutput()
    const errors = memoryOutput()

    expect(
      await updateCli({
        currentVersion: '1.1.0',
        runner: commands,
        output: output.stream,
        errorOutput: errors.stream,
        platform: 'win32',
      })
    ).toBe(7)
    expect(commands.capture).toHaveBeenCalledWith('npm.cmd', expect.any(Array))
    expect(commands.inherit).toHaveBeenCalledWith('npm.cmd', expect.any(Array))
    expect(errors.text()).toContain('exit code 7')
  })

  it('reports invalid npm registry output', async () => {
    const errors = memoryOutput()

    expect(
      await updateCli({
        currentVersion: '1.1.0',
        runner: runner('{}'),
        errorOutput: errors.stream,
      })
    ).toBe(1)
    expect(errors.text()).toContain('npm returned an invalid package version')
  })
})

describe('availableCliUpdate', () => {
  const registry = (body: unknown, status = 200): typeof globalThis.fetch =>
    vi.fn(async () => new globalThis.Response(JSON.stringify(body), { status })) as unknown as typeof globalThis.fetch

  it('reports a newer published version', async () => {
    const fetch = registry({ version: '1.2.0' })

    expect(await availableCliUpdate({ currentVersion: '1.1.0', fetch })).toBe('1.2.0')
    expect(fetch).toHaveBeenCalledWith('https://registry.npmjs.org/@strands-agents/cli/latest', expect.any(Object))
  })

  it('stays quiet when current, offline, or running from a development checkout', async () => {
    const offline = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof globalThis.fetch
    const current = registry({ version: '1.2.0' })

    expect(await availableCliUpdate({ currentVersion: '1.2.0', fetch: current })).toBeUndefined()
    expect(await availableCliUpdate({ currentVersion: '1.1.0', fetch: registry({}, 404) })).toBeUndefined()
    expect(await availableCliUpdate({ currentVersion: '1.1.0', fetch: offline })).toBeUndefined()
    expect(await availableCliUpdate({ currentVersion: '0.0.1-development', fetch: current })).toBeUndefined()
    expect(current).toHaveBeenCalledTimes(1)
  })
})
