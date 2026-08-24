/**
 * @file Tests for server base path extraction
 */

import { describe, it, expect } from 'vitest';
import { extractServerBasePath } from '../../src/transformer/extract-server-path.ts';
import type { ServerPathResult } from '../../src/transformer/extract-server-path.ts';

describe('extractServerBasePath', () => {
  describe('no servers / empty specs', () => {
    it('returns empty basePath when spec has no servers array', () => {
      const result = extractServerBasePath({ paths: {} });
      expect(result.basePath).toBe('');
      expect(result.hasVariables).toBe(false);
      expect(result.strategy).toBe('exact');
    });

    it('returns empty basePath when servers array is empty', () => {
      const result = extractServerBasePath({ servers: [], paths: {} });
      expect(result.basePath).toBe('');
    });

    it('returns empty basePath when server URL is missing', () => {
      const result = extractServerBasePath({ servers: [{}], paths: {} });
      expect(result.basePath).toBe('');
    });

    it('returns empty basePath when server URL is not a string', () => {
      const result = extractServerBasePath({ servers: [{ url: 123 }], paths: {} });
      expect(result.basePath).toBe('');
    });
  });

  describe('root-only server URLs', () => {
    it('returns empty basePath for host-only URL', () => {
      const result = extractServerBasePath({
        servers: [{ url: 'https://api.example.com' }],
      });
      expect(result.basePath).toBe('');
    });

    it('returns empty basePath for host with trailing slash', () => {
      const result = extractServerBasePath({
        servers: [{ url: 'https://api.example.com/' }],
      });
      expect(result.basePath).toBe('');
    });
  });

  describe('static server paths (no variables)', () => {
    it('extracts simple base path', () => {
      const result = extractServerBasePath({
        servers: [{ url: 'https://api.example.com/v1' }],
      });
      expect(result.basePath).toBe('/v1');
      expect(result.hasVariables).toBe(false);
      expect(result.variableNames).toEqual([]);
      expect(result.strategy).toBe('exact');
    });

    it('extracts multi-segment base path', () => {
      const result = extractServerBasePath({
        servers: [{ url: 'https://cloudapi-sit.ssi.govt.nz/msd/obligationmanagement/obligations/v1' }],
      });
      expect(result.basePath).toBe('/msd/obligationmanagement/obligations/v1');
    });

    it('strips trailing slash from base path', () => {
      const result = extractServerBasePath({
        servers: [{ url: 'https://api.example.com/api/v2/' }],
      });
      expect(result.basePath).toBe('/api/v2');
    });

    it('handles relative server URL', () => {
      const result = extractServerBasePath({
        servers: [{ url: '/api/v1' }],
      });
      expect(result.basePath).toBe('/api/v1');
    });
  });

  describe('server paths with variables (default: strip)', () => {
    it('strips single leading variable segment', () => {
      const result = extractServerBasePath({
        servers: [{
          url: 'https://host/{subenv}/msd/obligations/v1',
          variables: { subenv: { default: 'sit' } },
        }],
      });
      expect(result.basePath).toBe('/msd/obligations/v1');
      expect(result.hasVariables).toBe(true);
      expect(result.variableNames).toEqual(['subenv']);
      expect(result.strategy).toBe('exact');
    });

    it('strips multiple variable segments', () => {
      const result = extractServerBasePath({
        servers: [{
          url: 'https://host/{region}/{env}/api/v1',
          variables: {
            region: { default: 'ap-southeast-2' },
            env: { default: 'sit' },
          },
        }],
      });
      expect(result.basePath).toBe('/api/v1');
      expect(result.variableNames).toEqual(['region', 'env']);
    });

    it('strips trailing variable segment', () => {
      const result = extractServerBasePath({
        servers: [{
          url: 'https://host/api/{version}',
          variables: { version: { default: 'v1' } },
        }],
      });
      expect(result.basePath).toBe('/api');
    });

    it('returns empty basePath when entire path is variables', () => {
      const result = extractServerBasePath({
        servers: [{
          url: 'https://host/{tenant}/{env}',
        }],
      });
      expect(result.basePath).toBe('');
    });
  });

  describe('server paths with variables (includeVariables: true)', () => {
    it('replaces variable with [^/]+ regex', () => {
      const result = extractServerBasePath(
        {
          servers: [{
            url: 'https://host/{subenv}/msd/obligations/v1',
            variables: { subenv: { default: 'sit' } },
          }],
        },
        { includeVariables: true },
      );
      expect(result.basePath).toBe('/[^/]+/msd/obligations/v1');
      expect(result.hasVariables).toBe(true);
      expect(result.variableNames).toEqual(['subenv']);
      expect(result.strategy).toBe('regex');
    });

    it('replaces multiple variables with regex', () => {
      const result = extractServerBasePath(
        {
          servers: [{
            url: 'https://host/{region}/{env}/api/v1',
          }],
        },
        { includeVariables: true },
      );
      expect(result.basePath).toBe('/[^/]+/[^/]+/api/v1');
      expect(result.strategy).toBe('regex');
    });
  });

  describe('serverIndex option', () => {
    it('defaults to servers[0]', () => {
      const result = extractServerBasePath({
        servers: [
          { url: 'https://sit.example.com/api/v1' },
          { url: 'https://uat.example.com/api/v2' },
        ],
      });
      expect(result.basePath).toBe('/api/v1');
    });

    it('uses specified server index', () => {
      const result = extractServerBasePath(
        {
          servers: [
            { url: 'https://sit.example.com/api/v1' },
            { url: 'https://uat.example.com/api/v2' },
          ],
        },
        { serverIndex: 1 },
      );
      expect(result.basePath).toBe('/api/v2');
    });

    it('returns empty basePath for out-of-range index', () => {
      const result = extractServerBasePath(
        {
          servers: [{ url: 'https://api.example.com/v1' }],
        },
        { serverIndex: 5 },
      );
      expect(result.basePath).toBe('');
    });
  });

  describe('edge cases', () => {
    it('handles URL with port number', () => {
      const result = extractServerBasePath({
        servers: [{ url: 'https://api.example.com:8443/api/v1' }],
      });
      expect(result.basePath).toBe('/api/v1');
    });

    it('handles URL with only a path (no host)', () => {
      const result = extractServerBasePath({
        servers: [{ url: '/msd/obligations/v1' }],
      });
      expect(result.basePath).toBe('/msd/obligations/v1');
    });

    it('handles mixed static+variable segment (keeps static part)', () => {
      const result = extractServerBasePath({
        servers: [{
          url: 'https://host/api/v{version}/users',
        }],
      });
      // Mixed segment: "v{version}" → "v" after stripping
      expect(result.basePath).toBe('/api/v/users');
      expect(result.hasVariables).toBe(true);
    });
  });
});
