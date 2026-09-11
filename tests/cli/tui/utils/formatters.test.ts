import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  formatElapsedSeconds,
  formatElapsedMs,
  formatElapsedTime,
} from '../../../../src/cli/tui/utils/formatters.js';

describe('formatters', () => {
  describe('formatElapsedSeconds', () => {
    it('formata segundos inferiores a 60 como ${s}s', () => {
      expect(formatElapsedSeconds(0)).toBe('0s');
      expect(formatElapsedSeconds(1)).toBe('1s');
      expect(formatElapsedSeconds(45)).toBe('45s');
      expect(formatElapsedSeconds(59)).toBe('59s');
    });

    it('arredonda para baixo segundos fracionários', () => {
      expect(formatElapsedSeconds(45.8)).toBe('45s');
    });

    it('formata valores entre 1 minuto e 1 hora como ${m}m ${s}s', () => {
      expect(formatElapsedSeconds(60)).toBe('1m 0s');
      expect(formatElapsedSeconds(84)).toBe('1m 24s');
      expect(formatElapsedSeconds(3599)).toBe('59m 59s');
    });

    it('formata valores superiores a 1 hora como ${h}h ${m}m ${s}s', () => {
      expect(formatElapsedSeconds(3600)).toBe('1h 0m 0s');
      expect(formatElapsedSeconds(3665)).toBe('1h 1m 5s');
      expect(formatElapsedSeconds(7325)).toBe('2h 2m 5s');
    });

    it('trata valores negativos, NaN e indefinidos retornando 0s', () => {
      expect(formatElapsedSeconds(-5)).toBe('0s');
      expect(formatElapsedSeconds(NaN)).toBe('0s');
      expect(formatElapsedSeconds(Infinity)).toBe('0s');
    });

    it('fornece alias formatElapsedTime compatível com formatElapsedSeconds', () => {
      expect(formatElapsedTime(84)).toBe(formatElapsedSeconds(84));
    });
  });

  describe('formatElapsedMs', () => {
    it('formata milissegundos menores que 1000 como ${ms}ms', () => {
      expect(formatElapsedMs(0)).toBe('0ms');
      expect(formatElapsedMs(150)).toBe('150ms');
      expect(formatElapsedMs(999)).toBe('999ms');
    });

    it('arredonda milissegundos fracionários para baixo', () => {
      expect(formatElapsedMs(450.7)).toBe('450ms');
    });

    it('delega para formato de segundos quando ms >= 1000', () => {
      expect(formatElapsedMs(1000)).toBe('1s');
      expect(formatElapsedMs(1500)).toBe('1s');
      expect(formatElapsedMs(65000)).toBe('1m 5s');
      expect(formatElapsedMs(3665000)).toBe('1h 1m 5s');
    });

    it('trata valores negativos e inválidos retornando 0ms', () => {
      expect(formatElapsedMs(-10)).toBe('0ms');
      expect(formatElapsedMs(NaN)).toBe('0ms');
    });
  });

  describe('formatDuration', () => {
    it('calcula duração em milissegundos entre timestamps ISO quando menor que 1s', () => {
      const start = '2026-09-01T10:00:00.000Z';
      const end = '2026-09-01T10:00:00.450Z';
      expect(formatDuration(start, end)).toBe('450ms');
    });

    it('calcula duração em segundos entre timestamps ISO', () => {
      const start = '2026-09-01T10:00:00.000Z';
      const end = '2026-09-01T10:00:15.000Z';
      expect(formatDuration(start, end)).toBe('15s');
    });

    it('calcula duração em minutos e segundos entre timestamps ISO', () => {
      const start = '2026-09-01T10:00:00.000Z';
      const end = '2026-09-01T10:02:30.000Z';
      expect(formatDuration(start, end)).toBe('2m 30s');
    });

    it('calcula duração em horas, minutos e segundos entre timestamps ISO', () => {
      const start = '2026-09-01T10:00:00.000Z';
      const end = '2026-09-01T11:05:10.000Z';
      expect(formatDuration(start, end)).toBe('1h 5m 10s');
    });

    it('aceita instâncias de Date e números de época (epoch ms)', () => {
      const start = new Date(1000);
      const end = new Date(6000);
      expect(formatDuration(start, end)).toBe('5s');
      expect(formatDuration(1000, 6000)).toBe('5s');
    });

    it('retorna "-" quando datas são indefinidas, nulas ou vazias', () => {
      expect(formatDuration(undefined, '2026-09-01T10:00:00.000Z')).toBe('-');
      expect(formatDuration('2026-09-01T10:00:00.000Z', undefined)).toBe('-');
      expect(formatDuration(undefined, undefined)).toBe('-');
      expect(formatDuration(null, null)).toBe('-');
      expect(formatDuration('', '')).toBe('-');
    });

    it('retorna "-" quando timestamps são strings de formato inválido', () => {
      expect(formatDuration('invalid-date', '2026-09-01T10:00:00.000Z')).toBe('-');
      expect(formatDuration('2026-09-01T10:00:00.000Z', 'not-a-date')).toBe('-');
    });

    it('retorna "-" quando completedAt é anterior a startedAt', () => {
      const start = '2026-09-01T10:05:00.000Z';
      const end = '2026-09-01T10:00:00.000Z';
      expect(formatDuration(start, end)).toBe('-');
    });

    it('retorna 0ms quando startedAt e completedAt são iguais', () => {
      const timestamp = '2026-09-01T10:00:00.000Z';
      expect(formatDuration(timestamp, timestamp)).toBe('0ms');
    });
  });
});
