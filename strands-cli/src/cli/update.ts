import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

import { readCliVersion } from '../tui/package-version.js'
import { CLI_PACKAGE } from '../tui/update-check.js'

const execFileAsync = promisify(execFile)
// Node refuses to spawn a Windows `.cmd` file without a shell; the arguments are fixed, so none are user-controlled.
const USE_SHELL = process.platform === 'win32'

export interface UpdateRunner {
  capture(command: string, args: string[]): Promise<string>
  inherit(command: string, args: string[]): Promise<number>
}

export interface UpdateOptions {
  currentVersion?: string
  runner?: UpdateRunner
  output?: Pick<NodeJS.WriteStream, 'write'>
  errorOutput?: Pick<NodeJS.WriteStream, 'write'>
  platform?: NodeJS.Platform
}

/** Update the globally installed CLI through npm. */
export async function updateCli(options: UpdateOptions = {}): Promise<number> {
  const currentVersion = options.currentVersion ?? readCliVersion()
  const output = options.output ?? process.stdout
  const errorOutput = options.errorOutput ?? process.stderr
  const command = (options.platform ?? process.platform) === 'win32' ? 'npm.cmd' : 'npm'
  const runner = options.runner ?? nodeUpdateRunner

  if (currentVersion.includes('development')) {
    errorOutput.write(
      'error: `strands update` is unavailable from a development checkout. Pull the latest source and run `npm run setup` instead.\n'
    )
    return 1
  }

  try {
    const latestVersion = publishedVersion(
      await runner.capture(command, ['view', `${CLI_PACKAGE}@latest`, 'version', '--json'])
    )
    if (currentVersion === latestVersion) {
      output.write(`Strands CLI ${currentVersion} is already up to date.\n`)
      return 0
    }

    output.write(`Updating Strands CLI from ${currentVersion} to ${latestVersion}...\n`)
    const exitCode = await runner.inherit(command, ['install', '--global', `${CLI_PACKAGE}@latest`])
    if (exitCode !== 0) {
      errorOutput.write(
        `error: Update failed with exit code ${exitCode}. Retry with \`npm install --global ${CLI_PACKAGE}@latest\`.\n`
      )
      return exitCode
    }
    output.write(`Updated Strands CLI to ${latestVersion}. Run \`strands\` again to use it.\n`)
    return 0
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    errorOutput.write(`error: Unable to update the Strands CLI: ${detail}\n`)
    return 1
  }
}

const nodeUpdateRunner: UpdateRunner = {
  async capture(command, args) {
    const { stdout } = await execFileAsync(command, args, { encoding: 'utf8', shell: USE_SHELL })
    return stdout
  },
  async inherit(command, args) {
    return new Promise<number>((resolve, reject) => {
      const child = spawn(command, args, { stdio: 'inherit', shell: USE_SHELL })
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        if (signal) {
          reject(new Error(`npm was terminated by ${signal}`))
        } else {
          resolve(code ?? 1)
        }
      })
    })
  },
}

function publishedVersion(output: string): string {
  const parsed = JSON.parse(output) as unknown
  if (typeof parsed !== 'string' || !parsed.trim()) {
    throw new Error('npm returned an invalid package version')
  }
  return parsed.trim()
}
