import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { TextInput } from '../../../../../src/cli/tui/components/common/TextInput.js';

describe('TextInput Component', () => {
  it('renderiza o cursor em bloco █ quando focado', () => {
    const { lastFrame } = render(
      <TextInput value="hello" isFocused={true} />
    );
    expect(lastFrame()).toContain('hello█');
  });

  it('não renderiza o cursor █ quando não está focado', () => {
    const { lastFrame } = render(
      <TextInput value="hello" isFocused={false} />
    );
    expect(lastFrame()).toContain('hello');
    expect(lastFrame()).not.toContain('█');
  });

  it('exibe o placeholder esmaecido quando o valor está vazio e não está focado', () => {
    const { lastFrame } = render(
      <TextInput value="" placeholder="Digite o nome..." isFocused={false} />
    );
    expect(lastFrame()).toContain('Digite o nome...');
    expect(lastFrame()).not.toContain('█');
  });

  it('exibe o cursor █ junto ao placeholder quando o valor está vazio e focado', () => {
    const { lastFrame } = render(
      <TextInput value="" placeholder="Digite o nome..." isFocused={true} />
    );
    expect(lastFrame()).toContain('█');
    expect(lastFrame()).toContain('Digite o nome...');
  });

  it('oculta o placeholder quando há texto digitado', () => {
    const { lastFrame } = render(
      <TextInput
        value="meu-spec"
        placeholder="Digite o nome..."
        isFocused={true}
      />
    );
    expect(lastFrame()).toContain('meu-spec█');
    expect(lastFrame()).not.toContain('Digite o nome...');
  });

  it('exibe o contador de caracteres quando showCharCount é verdadeiro', () => {
    const { lastFrame } = render(
      <TextInput value="auth" showCharCount={true} />
    );
    expect(lastFrame()).toContain('4 chars');
  });

  it('não exibe o contador de caracteres quando showCharCount é falso ou omitido', () => {
    const { lastFrame } = render(
      <TextInput value="auth" showCharCount={false} />
    );
    expect(lastFrame()).not.toContain('chars');
  });

  it('renderiza cursor █ com cor personalizada sem quebrar', () => {
    const { lastFrame } = render(
      <TextInput value="custom" isFocused={true} cursorColor="green" />
    );
    expect(lastFrame()).toContain('custom█');
  });

  it('aceita propriedade de largura customizada', () => {
    const { lastFrame } = render(
      <TextInput value="largura" width={40} />
    );
    expect(lastFrame()).toContain('largura');
  });
});
