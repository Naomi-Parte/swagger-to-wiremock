/**
 * @file Extension reader for x-wiremock-* custom OpenAPI extensions
 * @description Reads x-wiremock-delay, x-wiremock-priority, and x-wiremock-scenario
 *              from operation objects and returns structured extension data
 */

/**
 * Delay configuration from x-wiremock-delay
 */
export interface WireMockDelayExtension {
  type: 'fixed' | 'uniform' | 'lognormal';
  milliseconds?: number;
  /** For uniform distribution */
  lower?: number;
  upper?: number;
  /** For lognormal distribution */
  median?: number;
  sigma?: number;
}

/**
 * Scenario configuration from x-wiremock-scenario
 */
export interface WireMockScenarioExtension {
  name: string;
  requiredState?: string;
  newState?: string;
}

/**
 * All supported x-wiremock-* extensions for an operation
 */
export interface WireMockExtensions {
  delay?: WireMockDelayExtension;
  priority?: number;
  scenario?: WireMockScenarioExtension;
}

/**
 * Extract x-wiremock-* extensions from an OpenAPI operation object.
 * @param operation - OpenAPI operation object (e.g., the "get" value under a path)
 * @returns Parsed extensions, or undefined if no x-wiremock-* fields are present
 */
export function extractWireMockExtensions(
  operation: Record<string, unknown>,
): WireMockExtensions | undefined {
  const extensions: WireMockExtensions = {};
  let hasExtensions = false;

  // x-wiremock-delay
  const delay = operation['x-wiremock-delay'] as Record<string, unknown> | undefined;
  if (delay && typeof delay === 'object') {
    const delayExt: WireMockDelayExtension = {
      type: (delay.type as WireMockDelayExtension['type']) ?? 'fixed',
    };

    if (delay.milliseconds !== undefined) {
      delayExt.milliseconds = Number(delay.milliseconds);
    }
    if (delay.lower !== undefined) {
      delayExt.lower = Number(delay.lower);
    }
    if (delay.upper !== undefined) {
      delayExt.upper = Number(delay.upper);
    }
    if (delay.median !== undefined) {
      delayExt.median = Number(delay.median);
    }
    if (delay.sigma !== undefined) {
      delayExt.sigma = Number(delay.sigma);
    }

    extensions.delay = delayExt;
    hasExtensions = true;
  }

  // x-wiremock-priority
  const priority = operation['x-wiremock-priority'];
  if (priority !== undefined) {
    extensions.priority = Number(priority);
    hasExtensions = true;
  }

  // x-wiremock-scenario
  const scenario = operation['x-wiremock-scenario'] as Record<string, unknown> | undefined;
  if (scenario && typeof scenario === 'object') {
    const scenarioExt: WireMockScenarioExtension = {
      name: String(scenario.name ?? ''),
    };

    if (scenario.requiredState !== undefined) {
      scenarioExt.requiredState = String(scenario.requiredState);
    }
    if (scenario.newState !== undefined) {
      scenarioExt.newState = String(scenario.newState);
    }

    extensions.scenario = scenarioExt;
    hasExtensions = true;
  }

  return hasExtensions ? extensions : undefined;
}
