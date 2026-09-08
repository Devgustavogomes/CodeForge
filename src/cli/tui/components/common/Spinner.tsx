import React, { useState, useEffect, memo } from 'react';
import { Text } from 'ink';

export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

export interface SpinnerProps {
  color?: string;
  interval?: number;
  label?: string;
}

interface TickerState {
  timer: NodeJS.Timeout | null;
  frameIndex: number;
  subscribers: Set<(frame: number) => void>;
}

/**
 * Gerenciador de ticker centralizado compartilhado para animação de spinners.
 * Mantém um único timer setInterval ativo apenas enquanto houver pelo menos um
 * componente inscrito (reference counting).
 */
export class SharedSpinnerTicker {
  private tickers = new Map<number, TickerState>();

  /**
   * Inscreve um callback para receber atualizações de frame para um dado intervalo.
   * Inicia o timer único do intervalo se este for o primeiro assinante.
   * Retorna uma função de cancelamento da inscrição.
   */
  public subscribe(listener: (frame: number) => void, interval = 80): () => void {
    let ticker = this.tickers.get(interval);
    if (!ticker) {
      ticker = {
        timer: null,
        frameIndex: 0,
        subscribers: new Set(),
      };
      this.tickers.set(interval, ticker);
    }

    ticker.subscribers.add(listener);

    if (ticker.timer === null) {
      ticker.timer = setInterval(() => {
        ticker.frameIndex = (ticker.frameIndex + 1) % SPINNER_FRAMES.length;
        for (const sub of ticker.subscribers) {
          try {
            sub(ticker.frameIndex);
          } catch {
            // Ignora erros de callbacks de assinantes para não interromper o ticker
          }
        }
      }, interval);
    }

    return () => {
      this.unsubscribe(listener, interval);
    };
  }

  /**
   * Remove a inscrição de um listener.
   * Quando a contagem de inscritos atinge zero, cancela o timer via clearInterval
   * e remove a entrada do mapa.
   */
  public unsubscribe(listener: (frame: number) => void, interval = 80): void {
    const ticker = this.tickers.get(interval);
    if (!ticker) return;

    ticker.subscribers.delete(listener);

    if (ticker.subscribers.size === 0) {
      if (ticker.timer !== null) {
        clearInterval(ticker.timer);
        ticker.timer = null;
      }
      this.tickers.delete(interval);
    }
  }

  /**
   * Retorna o índice do frame atual para o intervalo especificado.
   */
  public getFrame(interval = 80): number {
    return this.tickers.get(interval)?.frameIndex ?? 0;
  }

  /**
   * Retorna a quantidade de inscritos.
   * Se o intervalo for fornecido, retorna a quantidade para esse intervalo.
   * Caso contrário, retorna o total de inscritos em todos os intervalos.
   */
  public getSubscriberCount(interval?: number): number {
    if (interval !== undefined) {
      return this.tickers.get(interval)?.subscribers.size ?? 0;
    }
    let total = 0;
    for (const ticker of this.tickers.values()) {
      total += ticker.subscribers.size;
    }
    return total;
  }

  /**
   * Retorna a quantidade de timers ativos (0 ou 1 por intervalo ativo).
   */
  public getActiveTimerCount(): number {
    let count = 0;
    for (const ticker of this.tickers.values()) {
      if (ticker.timer !== null) count++;
    }
    return count;
  }

  /**
   * Verifica se há um timer ativo para o intervalo especificado ou globalmente.
   */
  public hasActiveTimer(interval?: number): boolean {
    if (interval !== undefined) {
      return (this.tickers.get(interval)?.timer ?? null) !== null;
    }
    return this.getActiveTimerCount() > 0;
  }

  /**
   * Reseta e cancela todos os timers ativos, limpando todos os assinantes.
   * Exportado para isolamento de testes unitários.
   */
  public reset(): void {
    for (const ticker of this.tickers.values()) {
      if (ticker.timer !== null) {
        clearInterval(ticker.timer);
        ticker.timer = null;
      }
      ticker.subscribers.clear();
      ticker.frameIndex = 0;
    }
    this.tickers.clear();
  }
}

export const sharedSpinnerTicker = new SharedSpinnerTicker();

/**
 * Helper para reset do ticker compartilhado e limpeza de timers ativos.
 */
export function resetSharedSpinnerTicker(): void {
  sharedSpinnerTicker.reset();
}

/**
 * Helper para obter contagem de inscritos no ticker compartilhado.
 */
export function getSharedSpinnerSubscriberCount(interval?: number): number {
  return sharedSpinnerTicker.getSubscriberCount(interval);
}

/**
 * Helper para obter contagem de timers ativos no ticker compartilhado.
 */
export function getSharedSpinnerActiveTimerCount(): number {
  return sharedSpinnerTicker.getActiveTimerCount();
}

/**
 * Hook para assinar as mudanças de frame do ticker compartilhado.
 */
export function useSharedSpinnerFrame(interval = 80): number {
  const [frameIndex, setFrameIndex] = useState(() => sharedSpinnerTicker.getFrame(interval));

  useEffect(() => {
    setFrameIndex(sharedSpinnerTicker.getFrame(interval));

    const unsubscribe = sharedSpinnerTicker.subscribe((nextFrame) => {
      setFrameIndex(nextFrame);
    }, interval);

    return unsubscribe;
  }, [interval]);

  return frameIndex;
}

export const Spinner: React.FC<SpinnerProps> = memo(({
  color = 'cyan',
  interval = 80,
  label,
}) => {
  const frameIndex = useSharedSpinnerFrame(interval);

  return (
    <Text color={color}>
      {SPINNER_FRAMES[frameIndex]}
      {label ? ` ${label}` : ''}
    </Text>
  );
});

Spinner.displayName = 'Spinner';

export default Spinner;

