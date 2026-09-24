import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Modal } from '../common/Modal.js';
import { theme } from '../../theme.js';
import { AiReviewConfig, resolveAiReviewConfig } from '../../../../config/types.js';
import { useNavigation } from '../../context/NavigationContext.js';

interface Props {
  initial?: AiReviewConfig;
  agents: string[];
  onSave: (review: Required<AiReviewConfig>) => void;
  onClose: () => void;
}

export const ConfigureAiReviewModal: React.FC<Props> = ({ initial, agents, onSave, onClose }) => {
  const { setTextInputActive } = useNavigation();
  useEffect(() => {
    setTextInputActive(true);
    return () => setTextInputActive(false);
  }, [setTextInputActive]);
  const [review, setReview] = useState(() => resolveAiReviewConfig(initial));
  const [field, setField] = useState(0);
  const [rounds, setRounds] = useState(String(review.maxRounds));
  const [roundsTouched, setRoundsTouched] = useState(false);
  const [error, setError] = useState('');
  const choices = agents.length ? agents : ['default'];

  useInput((input, key) => {
    if (key.escape) { onClose(); return; }
    if (key.upArrow || input === '\t' && key.shift) { setField((value) => (value + 2) % 3); return; }
    if (key.downArrow || input === '\t') { setField((value) => (value + 1) % 3); return; }
    if (field === 0 && (input === ' ' || key.leftArrow || key.rightArrow)) {
      setReview((value) => ({ ...value, enabled: !value.enabled })); return;
    }
    if (field === 1 && (key.leftArrow || key.rightArrow || input === ' ')) {
      const index = choices.indexOf(review.agent);
      const direction = key.leftArrow ? -1 : 1;
      setReview((value) => ({ ...value, agent: choices[(index + direction + choices.length) % choices.length] }));
      return;
    }
    if (field === 2) {
      if (key.backspace || key.delete) { setRoundsTouched(true); setRounds((value) => value.slice(0, -1)); return; }
      if (/^[0-9]$/.test(input)) { setRounds((value) => roundsTouched ? value + input : input); setRoundsTouched(true); return; }
    }
    if (key.return) {
      const maxRounds = Number(rounds);
      if (!Number.isSafeInteger(maxRounds) || maxRounds < 1) {
        setError('Maximum review rounds must be a positive integer.'); return;
      }
      onSave({ ...review, maxRounds });
      onClose();
    }
  });

  return <Modal title="AI Review configuration" isOpen width="100%" borderColor={theme.colors.primary}>
    <Box flexDirection="column">
      <Text color={field === 0 ? theme.colors.primary : theme.colors.text}>Enabled: {review.enabled ? 'Yes' : 'No'}</Text>
      <Text color={field === 1 ? theme.colors.primary : theme.colors.text}>Agent: {review.agent}</Text>
      <Text color={field === 2 ? theme.colors.primary : theme.colors.text}>Maximum rounds: {rounds}{field === 2 ? '█' : ''}</Text>
      {error && <Text color={theme.colors.error}>{error}</Text>}
      <Text dimColor>↑/↓ select · Space/←/→ change · Enter save · Esc cancel</Text>
    </Box>
  </Modal>;
};
