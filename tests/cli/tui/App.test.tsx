import React from 'react';
import { describe, it, expect } from 'vitest';
import { App } from '../../../src/cli/tui/App.js';
import { renderWithProviders, createMockContainer, flushAsync } from './helpers/renderWithProviders.js';

describe('App - Smoke Tests do Layout e Navegação Global', () => {
  it('renderiza o layout inicial com cabeçalho e abas', () => {
    const container = createMockContainer();
    const { lastFrame } = renderWithProviders(
      <App container={container} initialTab="run" />,
      { container },
    );
    const output = lastFrame() ?? '';

    expect(output).toContain('CodeForge');
    expect(output).toContain('[1] Run');
    expect(output).toContain('[2] Specs');
    expect(output).toContain('[3] Tasks');
    expect(output).toContain('[4] Docs');
    expect(output).toContain('[5] Config');
  });

  it('alterna abas quando as teclas numéricas 1-5 são acionadas', async () => {
    const container = createMockContainer();
    const { lastFrame, stdin } = renderWithProviders(
      <App container={container} initialTab="run" />,
      { container },
    );

    // Pressionar '2' -> Aba Specs
    stdin.write('2');
    await flushAsync();
    expect(lastFrame()).toContain('Specifications');

    // Pressionar '3' -> Aba Tasks
    stdin.write('3');
    await flushAsync();
    expect(lastFrame()).toContain('Tasks');

    // Pressionar '4' -> Aba Docs
    stdin.write('4');
    await flushAsync();
    expect(lastFrame()).toContain('Docs');

    // Pressionar '5' -> Aba Config
    stdin.write('5');
    await flushAsync();
    expect(lastFrame()).toContain('CodeForge Configuration Editor');

    // Pressionar '1' -> Retorna para Aba Run
    stdin.write('1');
    await flushAsync();
    expect(lastFrame()).toContain('[1] Run');
  });
});
