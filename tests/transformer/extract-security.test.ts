/**
 * @file Tests for extract-security.ts
 */

import { describe, it, expect } from 'vitest';
import { extractSecurityMatchers } from '../../src/transformer/extract-security.js';

function makeSpec(securitySchemes: Record<string, unknown>, globalSecurity?: unknown[]) {
  return {
    components: { securitySchemes },
    ...(globalSecurity !== undefined ? { security: globalSecurity } : {}),
  };
}

describe('extractSecurityMatchers', () => {
  describe('bearer auth (http/bearer)', () => {
    it('generates Authorization header matcher with bearer pattern', () => {
      const spec = makeSpec(
        { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
        [{ bearerAuth: [] }],
      );
      const operation = {};

      const matchers = extractSecurityMatchers(spec, operation);
      expect(matchers).toHaveLength(1);
      expect(matchers[0]!.in).toBe('header');
      expect(matchers[0]!.name).toBe('Authorization');
      expect(matchers[0]!.pattern).toContain('Bearer');
    });
  });

  describe('basic auth (http/basic)', () => {
    it('generates Authorization header matcher with Basic pattern', () => {
      const spec = makeSpec({ basicAuth: { type: 'http', scheme: 'basic' } });
      const operation = { security: [{ basicAuth: [] }] };

      const matchers = extractSecurityMatchers(spec, operation);
      expect(matchers).toHaveLength(1);
      expect(matchers[0]!.in).toBe('header');
      expect(matchers[0]!.name).toBe('Authorization');
      expect(matchers[0]!.pattern).toBe('Basic .+');
    });
  });

  describe('API key in header', () => {
    it('generates named header matcher', () => {
      const spec = makeSpec({ apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' } });
      const operation = { security: [{ apiKey: [] }] };

      const matchers = extractSecurityMatchers(spec, operation);
      expect(matchers).toHaveLength(1);
      expect(matchers[0]!.in).toBe('header');
      expect(matchers[0]!.name).toBe('X-API-Key');
      expect(matchers[0]!.pattern).toBe('.+');
    });
  });

  describe('API key in query', () => {
    it('generates query parameter matcher', () => {
      const spec = makeSpec({ apiKey: { type: 'apiKey', in: 'query', name: 'api_key' } });
      const operation = { security: [{ apiKey: [] }] };

      const matchers = extractSecurityMatchers(spec, operation);
      expect(matchers).toHaveLength(1);
      expect(matchers[0]!.in).toBe('query');
      expect(matchers[0]!.name).toBe('api_key');
      expect(matchers[0]!.pattern).toBe('.+');
    });
  });

  describe('OAuth2', () => {
    it('generates Authorization header matcher', () => {
      const spec = makeSpec({
        oauth: { type: 'oauth2', flows: { implicit: { authorizationUrl: 'https://x.com', scopes: {} } } },
      });
      const operation = { security: [{ oauth: ['read'] }] };

      const matchers = extractSecurityMatchers(spec, operation);
      expect(matchers).toHaveLength(1);
      expect(matchers[0]!.in).toBe('header');
      expect(matchers[0]!.name).toBe('Authorization');
    });
  });

  describe('OpenID Connect', () => {
    it('generates Authorization header matcher', () => {
      const spec = makeSpec({
        oidc: { type: 'openIdConnect', openIdConnectUrl: 'https://x.com/.well-known/openid' },
      });
      const operation = { security: [{ oidc: [] }] };

      const matchers = extractSecurityMatchers(spec, operation);
      expect(matchers).toHaveLength(1);
      expect(matchers[0]!.in).toBe('header');
      expect(matchers[0]!.name).toBe('Authorization');
    });
  });

  describe('mutualTLS', () => {
    it('returns no matchers (transport-layer, not matchable)', () => {
      const spec = makeSpec({ mtls: { type: 'mutualTLS' } });
      const operation = { security: [{ mtls: [] }] };

      const matchers = extractSecurityMatchers(spec, operation);
      expect(matchers).toHaveLength(0);
    });
  });

  describe('API key in cookie', () => {
    it('returns no matchers (cookies not supported)', () => {
      const spec = makeSpec({ cookie: { type: 'apiKey', in: 'cookie', name: 'session' } });
      const operation = { security: [{ cookie: [] }] };

      const matchers = extractSecurityMatchers(spec, operation);
      expect(matchers).toHaveLength(0);
    });
  });

  describe('security resolution', () => {
    it('uses global security when operation has none', () => {
      const spec = makeSpec(
        { bearerAuth: { type: 'http', scheme: 'bearer' } },
        [{ bearerAuth: [] }],
      );
      const operation = {}; // no operation-level security

      const matchers = extractSecurityMatchers(spec, operation);
      expect(matchers).toHaveLength(1);
      expect(matchers[0]!.name).toBe('Authorization');
    });

    it('operation security overrides global', () => {
      const spec = makeSpec(
        {
          bearerAuth: { type: 'http', scheme: 'bearer' },
          apiKey: { type: 'apiKey', in: 'header', name: 'X-Key' },
        },
        [{ bearerAuth: [] }], // global
      );
      const operation = { security: [{ apiKey: [] }] }; // operation overrides

      const matchers = extractSecurityMatchers(spec, operation);
      expect(matchers).toHaveLength(1);
      expect(matchers[0]!.name).toBe('X-Key');
    });

    it('operation security: [] means no auth', () => {
      const spec = makeSpec(
        { bearerAuth: { type: 'http', scheme: 'bearer' } },
        [{ bearerAuth: [] }],
      );
      const operation = { security: [] }; // explicitly no auth

      const matchers = extractSecurityMatchers(spec, operation);
      expect(matchers).toHaveLength(0);
    });

    it('returns empty when no securitySchemes defined', () => {
      const spec = { security: [{ bearerAuth: [] }] }; // no components
      const operation = {};

      const matchers = extractSecurityMatchers(spec, operation);
      expect(matchers).toHaveLength(0);
    });

    it('returns empty when scheme name not found in securitySchemes', () => {
      const spec = makeSpec(
        { otherScheme: { type: 'http', scheme: 'bearer' } },
        [{ nonExistent: [] }],
      );
      const operation = {};

      const matchers = extractSecurityMatchers(spec, operation);
      expect(matchers).toHaveLength(0);
    });

    it('deduplicates matchers with same header name', () => {
      const spec = makeSpec({
        bearer1: { type: 'http', scheme: 'bearer' },
        bearer2: { type: 'http', scheme: 'bearer' },
      });
      // Both reference Authorization header
      const operation = { security: [{ bearer1: [], bearer2: [] }] };

      const matchers = extractSecurityMatchers(spec, operation);
      // Should only have one Authorization matcher
      expect(matchers).toHaveLength(1);
      expect(matchers[0]!.name).toBe('Authorization');
    });
  });
});
