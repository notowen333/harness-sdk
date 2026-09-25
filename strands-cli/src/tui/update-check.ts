import { readCliVersion } from './package-version.js'

export const CLI_PACKAGE = '@strands-agents/cli'

const REGISTRY_LATEST_URL = `https://registry.npmjs.org/${CLI_PACKAGE}/latest`

export interface UpdateCheckOptions {
  currentVersion?: string
  fetch?: typeof globalThis.fetch
}

/** Resolves the latest published CLI version when it differs from this one, or undefined when unknown. */
export async function availableCliUpdate(options: UpdateCheckOptions = {}): Promise<string | undefined> {
  const currentVersion = options.currentVersion ?? readCliVersion()
  if (currentVersion.includes('development')) {
    return undefined
  }
  try {
    const response = await (options.fetch ?? globalThis.fetch)(REGISTRY_LATEST_URL, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(3_000),
    })
    if (!response.ok) {
      return undefined
    }
    const { version } = (await response.json()) as { version?: unknown }
    return typeof version === 'string' && version !== currentVersion ? version : undefined
  } catch {
    // Setup stays usable offline; the notice only appears when the registry answers.
    return undefined
  }
}
