import { readCliVersion } from './package-version.js'
import { captureNpm } from './npm.js'

export const CLI_PACKAGE = '@strands-agents/cli'

export interface UpdateCheckOptions {
  currentVersion?: string
  resolveLatest?: () => Promise<string>
}

/** Resolves the latest published CLI version when it is newer than this one, or undefined when unknown. */
export async function availableCliUpdate(options: UpdateCheckOptions = {}): Promise<string | undefined> {
  const currentVersion = options.currentVersion ?? readCliVersion()
  if (currentVersion.includes('development')) {
    return undefined
  }
  try {
    const latestVersion = await (options.resolveLatest ?? resolveLatestCliVersion)()
    return compareVersions(latestVersion, currentVersion) === 1 ? latestVersion : undefined
  } catch {
    // Setup stays usable offline; the notice only appears when npm resolves the configured registry.
    return undefined
  }
}

export async function resolveLatestCliVersion(): Promise<string> {
  return publishedVersion(await captureNpm(['view', `${CLI_PACKAGE}@latest`, 'version', '--json'], { timeout: 3_000 }))
}

export function publishedVersion(output: string): string {
  const parsed = JSON.parse(output) as unknown
  if (typeof parsed !== 'string' || !parsed.trim()) {
    throw new Error('npm returned an invalid package version')
  }
  return parsed.trim()
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) === 1
}

export function compareVersions(candidate: string, current: string): -1 | 0 | 1 | undefined {
  const candidateParts = parseVersion(candidate)
  const currentParts = parseVersion(current)
  if (!candidateParts || !currentParts) {
    return undefined
  }
  for (let index = 0; index < 3; index++) {
    if (candidateParts.release[index] !== currentParts.release[index]) {
      return candidateParts.release[index]! > currentParts.release[index]! ? 1 : -1
    }
  }
  return comparePrerelease(candidateParts.prerelease, currentParts.prerelease)
}

interface ParsedVersion {
  release: [bigint, bigint, bigint]
  prerelease: string[]
}

function parseVersion(version: string): ParsedVersion | undefined {
  const match =
    /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(
      version
    )
  if (!match) {
    return undefined
  }
  return {
    release: [BigInt(match[1]!), BigInt(match[2]!), BigInt(match[3]!)],
    prerelease: match[4]?.split('.') ?? [],
  }
}

function comparePrerelease(candidate: string[], current: string[]): -1 | 0 | 1 {
  if (candidate.length === 0) {
    return current.length === 0 ? 0 : 1
  }
  if (current.length === 0) {
    return -1
  }
  for (let index = 0; index < Math.max(candidate.length, current.length); index++) {
    const candidatePart = candidate[index]
    const currentPart = current[index]
    if (candidatePart === undefined || currentPart === undefined) {
      return candidatePart !== undefined ? 1 : -1
    }
    if (candidatePart === currentPart) {
      continue
    }
    const candidateNumber = numericIdentifier(candidatePart)
    const currentNumber = numericIdentifier(currentPart)
    if (candidateNumber !== undefined && currentNumber !== undefined) {
      return candidateNumber === currentNumber ? 0 : candidateNumber > currentNumber ? 1 : -1
    }
    if (candidateNumber !== undefined || currentNumber !== undefined) {
      return candidateNumber !== undefined ? -1 : 1
    }
    return candidatePart > currentPart ? 1 : -1
  }
  return 0
}

function numericIdentifier(identifier: string): bigint | undefined {
  return /^(?:0|[1-9]\d*)$/u.test(identifier) ? BigInt(identifier) : undefined
}
