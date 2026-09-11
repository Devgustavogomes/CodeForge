import React, { useState, useEffect, memo, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useNavigation } from '../../../context/NavigationContext.js';
import { useExecution } from '../../../context/ExecutionContext.js';
import { useContainer } from '../../../hooks/useContainer.js';
import { PATHS } from '../../../../../infrastructure/paths.js';
import { theme } from '../../../theme.js';
import { getSpecTaskCount } from '../../../context/ExecutionContext/taskLoader.js';

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

interface SpecPreviewDetails {
  description?: string;
  taskTitles: string[];
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
    const list = container.listSpecsUseCase.execute();
    return list.map((s) => ({
      name: s.name,
      title: s.title,
      status: s.status,
      taskCount: getSpecTaskCount(container.gw, s.name),
    }));
  });
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (initialSpecs) return;
    const list = container.listSpecsUseCase.execute();
    const enriched = list.map((s) => ({
      name: s.name,
      title: s.title,
      status: s.status,
      taskCount: getSpecTaskCount(container.gw, s.name),
    }));
    setSpecs(enriched);
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

  const selectedSpec = specs[selectedIndex];

  // Load preview data for the selected spec
  const previewDetails: SpecPreviewDetails = useMemo(() => {
    if (!selectedSpec) return { taskTitles: [] };
    const result: SpecPreviewDetails = { taskTitles: [] };
    try {
      const tasksDir = `${PATHS.tasksDir}/${selectedSpec.name}`;
      if (container.gw.exists(tasksDir)) {
        const files = container.gw.listDir(tasksDir).filter((f) => f.endsWith('.json')).sort();
        const titles: string[] = [];
        for (const file of files.slice(0, 5)) {
          try {
            const raw = container.gw.readFile(`${tasksDir}/${file}`);
            const parsed = JSON.parse(raw);
            titles.push(parsed.title || parsed.id || file.replace('.json', ''));
          } catch {
            titles.push(file.replace('.json', ''));
          }
        }
        result.taskTitles = titles;
      }
    } catch {
      // ignore
    }
    return result;
  }, [container, selectedSpec]);

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
        <Box gap={1} marginBottom={1}>
          <Text bold color="cyan">
            🚀 Welcome to CodeForge
          </Text>
        </Box>
        <Box marginBottom={1}>
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

  const cleanSelectedTitle = selectedSpec?.title.replace(/^Spec:\s*/i, '').trim();

  return (
    <Box flexDirection="column" width="100%" flexGrow={1} paddingX={1} paddingY={0}>
      {/* Main Split: 42% Left (Spec List), 58% Right (Spec Preview) */}
      <Box flexDirection="row" width="100%" flexGrow={1}>
        {/* Left Column: List of Specifications */}
        <Box flexDirection="column" width="42%" paddingRight={1}>
          <Box justifyContent="space-between" width="100%" marginBottom={1}>
            <Text bold color="cyan">
              Select a Specification ({specs.length})
            </Text>
            <Text dimColor>[↑/↓] Move</Text>
          </Box>

          <Box flexDirection="column" gap={0}>
            {specs.map((s, idx) => {
              const isSelected = idx === selectedIndex;

              return (
                <Box key={s.name} justifyContent="space-between" width="100%">
                  <Box gap={1} flexShrink={1}>
                    <Text bold color={isSelected ? 'cyan' : 'gray'}>
                      {isSelected ? theme.symbols.pointer : ' '}
                    </Text>
                    <Text
                      bold={isSelected}
                      color={isSelected ? 'cyan' : 'white'}
                      wrap="truncate-end"
                    >
                      {s.name}
                    </Text>
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
        </Box>

        {/* Vertical Divider */}
        <Box flexDirection="column" paddingX={1}>
          <Text color="gray">{theme.symbols.divider}</Text>
        </Box>

        {/* Right Column: Specification Preview */}
        <Box flexDirection="column" width="56%" flexGrow={1} paddingLeft={1}>
          <Box marginBottom={1}>
            <Text bold color="gray">
              Specification Preview
            </Text>
          </Box>

          {selectedSpec ? (
            <Box flexDirection="column" gap={1}>
              <Box gap={1}>
                <Text bold color="white">
                  {selectedSpec.name}
                </Text>
                {cleanSelectedTitle && cleanSelectedTitle !== selectedSpec.name && (
                  <Text dimColor>— {cleanSelectedTitle}</Text>
                )}
              </Box>

              <Box gap={2}>
                <Text dimColor>
                  Status: <Text color="cyan">{selectedSpec.status.toUpperCase()}</Text>
                </Text>
                <Text color="gray">│</Text>
                <Text dimColor>
                  Tasks: <Text bold color="white">{selectedSpec.taskCount}</Text>
                </Text>
              </Box>

              {previewDetails.taskTitles.length > 0 && (
                <Box flexDirection="column" marginTop={0}>
                  <Text dimColor>Planned tasks:</Text>
                  {previewDetails.taskTitles.map((title, i) => (
                    <Box key={i} gap={1} paddingLeft={1}>
                      <Text color="cyan">{theme.symbols.bullet}</Text>
                      <Text dimColor wrap="truncate-end">{title}</Text>
                    </Box>
                  ))}
                  {selectedSpec.taskCount > previewDetails.taskTitles.length && (
                    <Box paddingLeft={1}>
                      <Text dimColor>
                        ...and {selectedSpec.taskCount - previewDetails.taskTitles.length} more
                      </Text>
                    </Box>
                  )}
                </Box>
              )}

              {selectedSpec.taskCount === 0 && (
                <Box paddingY={1}>
                  <Text dimColor>
                    No task files generated yet. Starting run will initialize tasks.
                  </Text>
                </Box>
              )}
            </Box>
          ) : (
            <Text dimColor>No specification selected.</Text>
          )}
        </Box>
      </Box>

      {/* Bottom Actions Bar */}
      <Box gap={1} marginTop={1} paddingTop={0}>
        <Text bold color="cyan">
          [Enter] Start Run
        </Text>
        <Text color="gray">│</Text>
        <Text dimColor>[c] New Spec</Text>
        <Text color="gray">│</Text>
        <Text dimColor>[p] Pull Spec</Text>
        <Text color="gray">│</Text>
        <Text dimColor>[2] Specs Tab</Text>
      </Box>
    </Box>
  );
});

SpecPicker.displayName = 'SpecPicker';
export default SpecPicker;
