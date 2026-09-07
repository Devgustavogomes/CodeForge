import React, { useState, useEffect, memo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useNavigation } from '../../../context/NavigationContext.js';
import { useExecution } from '../../../context/ExecutionContext.js';
import { useContainer } from '../../../hooks/useContainer.js';
import { PATHS } from '../../../../../infrastructure/paths.js';

export interface SpecPickerItem {
  name: string;
  title: string;
  status: string;
  taskCount: number;
}

export interface SpecPickerProps {
  isInteractive?: boolean;
  onSelectSpec?: (specName: string) => void;
  initialSpecs?: SpecPickerItem[];
}

export const SpecPicker: React.FC<SpecPickerProps> = memo(({
  isInteractive = true,
  onSelectSpec,
  initialSpecs,
}) => {
  const nav = useNavigation();
  const exec = useExecution();
  const container = useContainer();

  const [specs, setSpecs] = useState<SpecPickerItem[]>(() => {
    if (initialSpecs) return initialSpecs;
    try {
      const list = container.listSpecsUseCase.execute();
      return list.map((s) => {
        const tasksDir = `${PATHS.tasksDir}/${s.name}`;
        let count = 0;
        if (container.gw.exists(tasksDir)) {
          count = container.gw
            .listDir(tasksDir)
            .filter((f) => f.endsWith('.json')).length;
        }
        return {
          name: s.name,
          title: s.title,
          status: s.status,
          taskCount: count,
        };
      });
    } catch {
      return [];
    }
  });
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (initialSpecs) return;
    try {
      const list = container.listSpecsUseCase.execute();
      const enriched = list.map((s) => {
        const tasksDir = `${PATHS.tasksDir}/${s.name}`;
        let count = 0;
        if (container.gw.exists(tasksDir)) {
          count = container.gw
            .listDir(tasksDir)
            .filter((f) => f.endsWith('.json')).length;
        }
        return {
          name: s.name,
          title: s.title,
          status: s.status,
          taskCount: count,
        };
      });
      setSpecs(enriched);
    } catch {
      // ignore error loading specs
    }
  }, [container, initialSpecs]);

  const specsRef = React.useRef(specs);
  specsRef.current = specs;
  const selectedIndexRef = React.useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  const onSelectSpecRef = React.useRef(onSelectSpec);
  onSelectSpecRef.current = onSelectSpec;

  useInput(
    (input, key) => {
      const currentSpecs = specsRef.current;
      const currentIndex = selectedIndexRef.current;

      if (currentSpecs.length === 0) {
        if (input === 'c') nav.openModal('create_spec');
        if (input === 'p') nav.openModal('pull_spec');
        return;
      }

      if (key.upArrow || input === 'k') {
        setSelectedIndex((prev) => (prev <= 0 ? currentSpecs.length - 1 : prev - 1));
        return;
      }

      if (key.downArrow || input === 'j') {
        setSelectedIndex((prev) => (prev >= currentSpecs.length - 1 ? 0 : prev + 1));
        return;
      }

      if (key.return || input === '\r' || input === '\n') {
        const chosen = currentSpecs[currentIndex];
        if (chosen) {
          if (onSelectSpecRef.current) {
            onSelectSpecRef.current(chosen.name);
          }
          exec.setActiveSpec(chosen.name);
          void exec.startRun(chosen.name);
        }
        return;
      }

      if (input === 'c') {
        nav.openModal('create_spec');
      }
      if (input === 'p') {
        nav.openModal('pull_spec');
      }
    },
    { isActive: isInteractive && !nav.isTextInputActive && !nav.modal },
  );

  if (specs.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={2}
        paddingY={1}
        width="100%"
        flexGrow={1}
      >
        <Text bold color="cyan">
          🚀 Welcome to CodeForge
        </Text>
        <Box marginY={1}>
          <Text dimColor>No specifications found in .codeforge/specs/</Text>
        </Box>
        <Box gap={2} marginTop={1}>
          <Text bold color="cyan">
            [c] Create new spec
          </Text>
          <Text color="gray">│</Text>
          <Text dimColor>[p] Pull spec from remote</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={0}
      width="100%"
      flexGrow={1}
    >
      <Box justifyContent="space-between" width="100%" marginBottom={1}>
        <Text bold color="cyan">
          ● Select a Specification
        </Text>
        <Text dimColor>[↑/↓] Move [Enter] Select</Text>
      </Box>

      <Box flexDirection="column" marginY={0}>
        {specs.map((s, idx) => {
          const isSelected = idx === selectedIndex;
          const cleanTitle = s.title.replace(/^Spec:\s*/i, '').trim();

          return (
            <Box key={s.name} justifyContent="space-between" width="100%">
              <Box gap={1} flexShrink={1}>
                <Text bold color={isSelected ? 'cyan' : undefined}>
                  {isSelected ? '❯' : ' '}
                </Text>
                <Box width={22}>
                  <Text
                    bold={isSelected}
                    color={isSelected ? 'cyan' : 'white'}
                    wrap="truncate-end"
                  >
                    {s.name}
                  </Text>
                </Box>
                {cleanTitle && cleanTitle !== s.name ? (
                  <Text dimColor wrap="truncate-end">
                    ({cleanTitle})
                  </Text>
                ) : null}
              </Box>

              <Box flexShrink={0} paddingLeft={1}>
                <Text dimColor>
                  {s.taskCount} task{s.taskCount === 1 ? '' : 's'}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box gap={1} marginTop={1}>
        <Text bold color="cyan">
          [Enter] Start Run
        </Text>
        <Text color="gray">│</Text>
        <Text dimColor>[c] New Spec</Text>
        <Text color="gray">│</Text>
        <Text dimColor>[2] Specs Tab</Text>
      </Box>
    </Box>
  );
});

SpecPicker.displayName = 'SpecPicker';
export default SpecPicker;
