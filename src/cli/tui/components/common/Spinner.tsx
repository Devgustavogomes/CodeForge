import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

export interface SpinnerProps {
  color?: string;
  interval?: number;
  label?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  color = 'cyan',
  interval = 80,
  label,
}) => {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, interval);

    return () => clearInterval(timer);
  }, [interval]);

  return (
    <Text color={color}>
      {SPINNER_FRAMES[frameIndex]}
      {label ? ` ${label}` : ''}
    </Text>
  );
};

export default Spinner;
