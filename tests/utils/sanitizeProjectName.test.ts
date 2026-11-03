import { describe, it, expect } from 'vitest';
import {
  sanitizeProjectName,
  isValidProjectName,
} from '../../src/utils/sanitizeProjectName.js';

describe('sanitizeProjectName', () => {
  describe('basic normalization', () => {
    it('converts uppercase to lowercase by default', () => {
      expect(sanitizeProjectName('CodeForge')).toBe('codeforge');
      expect(sanitizeProjectName('MY_PROJECT')).toBe('my_project');
    });

    it('replaces spaces with hyphens', () => {
      expect(sanitizeProjectName('my awesome project')).toBe('my-awesome-project');
      expect(sanitizeProjectName('  spaced   project  ')).toBe('spaced-project');
    });

    it('handles mixed case and separators', () => {
      expect(sanitizeProjectName('CodeForge-Engine_v2')).toBe('codeforge-engine_v2');
    });

    it('leaves already sanitized names unchanged', () => {
      expect(sanitizeProjectName('codeforge-cli')).toBe('codeforge-cli');
    });
  });

  describe('diacritics and accents', () => {
    it('removes accents and latin diacritics', () => {
      expect(sanitizeProjectName('Projeto Automação')).toBe('projeto-automacao');
      expect(sanitizeProjectName('Ações Rápidas')).toBe('acoes-rapidas');
      expect(sanitizeProjectName('Café com Código')).toBe('cafe-com-codigo');
      expect(sanitizeProjectName('São Paulo Tech')).toBe('sao-paulo-tech');
      expect(sanitizeProjectName('Über Alles')).toBe('uber-alles');
    });
  });

  describe('special characters and path traversal', () => {
    it('removes punctuation and special symbols', () => {
      expect(sanitizeProjectName('project @ # $ % ^ & * ( ) !')).toBe('project');
      expect(sanitizeProjectName('project (v2.0) [final]')).toBe('project-v2-0-final');
    });

    it('sanitizes directory paths and path traversal patterns', () => {
      expect(sanitizeProjectName('../../secret/project')).toBe('secret-project');
      expect(sanitizeProjectName('foo/bar\\baz')).toBe('foo-bar-baz');
    });

    it('strips leading and trailing hyphens, dots, and underscores', () => {
      expect(sanitizeProjectName('---my-project---')).toBe('my-project');
      expect(sanitizeProjectName('...my.project...')).toBe('my-project');
      expect(sanitizeProjectName('___my_project___')).toBe('my_project');
      expect(sanitizeProjectName(' -.- my-project -.- ')).toBe('my-project');
    });

    it('collapses multiple consecutive hyphens', () => {
      expect(sanitizeProjectName('my---cool---project')).toBe('my-cool-project');
    });
  });

  describe('options', () => {
    it('respects toLowerCase: false option', () => {
      expect(sanitizeProjectName('My Project', { toLowerCase: false })).toBe('My-Project');
      expect(sanitizeProjectName('CodeForgeEngine', { toLowerCase: false })).toBe('CodeForgeEngine');
    });

    it('applies maxLength and strips any trailing separator left by truncation', () => {
      expect(sanitizeProjectName('super-long-project-name', { maxLength: 10 })).toBe('super-long');
      // Truncation at character 6 leaves 'super-', which should be trimmed to 'super'
      expect(sanitizeProjectName('super-long-project-name', { maxLength: 6 })).toBe('super');
    });

    it('returns fallback string when sanitized result is empty', () => {
      expect(sanitizeProjectName('', { fallback: 'unnamed-project' })).toBe('unnamed-project');
      expect(sanitizeProjectName('   ', { fallback: 'my-app' })).toBe('my-app');
      expect(sanitizeProjectName('!@#$%^&*()', { fallback: 'default-project' })).toBe('default-project');
    });

    it('supports custom separator', () => {
      expect(sanitizeProjectName('my custom project', { separator: '_' })).toBe('my_custom_project');
    });
  });

  describe('edge cases', () => {
    it('returns empty string by default for empty or invalid inputs', () => {
      expect(sanitizeProjectName('')).toBe('');
      expect(sanitizeProjectName('    ')).toBe('');
      expect(sanitizeProjectName('!@#$%^&*')).toBe('');
      // Non-string safety
      expect(sanitizeProjectName(null as unknown as string)).toBe('');
      expect(sanitizeProjectName(undefined as unknown as string)).toBe('');
    });

    it('handles single character names', () => {
      expect(sanitizeProjectName('a')).toBe('a');
      expect(sanitizeProjectName('1')).toBe('1');
      expect(sanitizeProjectName('Z')).toBe('z');
    });
  });
});

describe('isValidProjectName', () => {
  it('returns true for valid project names', () => {
    expect(isValidProjectName('codeforge')).toBe(true);
    expect(isValidProjectName('codeforge-engine')).toBe(true);
    expect(isValidProjectName('project_123')).toBe(true);
    expect(isValidProjectName('a')).toBe(true);
    expect(isValidProjectName('1')).toBe(true);
    expect(isValidProjectName('app-v2_final')).toBe(true);
  });

  it('returns false for invalid project names', () => {
    expect(isValidProjectName('')).toBe(false);
    expect(isValidProjectName('My Project')).toBe(false); // contains spaces and uppercase
    expect(isValidProjectName('CodeForge')).toBe(false); // contains uppercase
    expect(isValidProjectName('-starts-with-hyphen')).toBe(false);
    expect(isValidProjectName('ends-with-hyphen-')).toBe(false);
    expect(isValidProjectName('_starts-with-underscore')).toBe(false);
    expect(isValidProjectName('has/slash')).toBe(false);
    expect(isValidProjectName('has.dot')).toBe(false);
    expect(isValidProjectName('a'.repeat(215))).toBe(false); // exceeds 214 chars
    expect(isValidProjectName(null as unknown as string)).toBe(false);
  });
});
