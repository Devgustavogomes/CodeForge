import React, { useState, useEffect, memo, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { useNavigation } from "../../../context/NavigationContext.js";
import { useExecution } from "../../../context/ExecutionContext.js";
import { useContainer } from "../../../hooks/useContainer.js";
import { PATHS } from "../../../../../infrastructure/paths.js";
import { theme } from "../../../theme.js";
import { getSpecTaskCount } from "../../../context/ExecutionContext/taskLoader.js";

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

export const SpecPicker: React.FC<SpecPickerProps> = memo(
  ({ isInteractive = true, onSelectSpec, initialSpecs }) => {
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
          if (input === "c") nav.openModal("create_spec");
          if (input === "p") nav.openModal("pull_spec");
          return;
        }

        if (key.upArrow || input === "k") {
          setSelectedIndex((prev) =>
            prev <= 0 ? currentSpecs.length - 1 : prev - 1,
          );
          return;
        }

        if (key.downArrow || input === "j") {
          setSelectedIndex((prev) =>
            prev >= currentSpecs.length - 1 ? 0 : prev + 1,
          );
          return;
        }

        if (key.return || input === "\r" || input === "\n") {
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

        if (input === "c") {
          nav.openModal("create_spec");
        }
        if (input === "p") {
          nav.openModal("pull_spec");
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
          const files = container.gw
            .listDir(tasksDir)
            .filter((f) => f.endsWith(".json"))
            .sort();
          const titles: string[] = [];
          for (const file of files.slice(0, 5)) {
            try {
              const raw = container.gw.readFile(`${tasksDir}/${file}`);
              const parsed = JSON.parse(raw);
              titles.push(
                parsed.title || parsed.id || file.replace(".json", ""),
              );
            } catch {
              titles.push(file.replace(".json", ""));
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
          borderColor={theme.colors.borderSubtle}
          paddingX={2}
          paddingY={0}
          width="100%"
          flexGrow={1}
          alignItems="center"
          justifyContent="center"
        >
          <Text bold color={theme.colors.primary}>
            ⚒ CodeForge
          </Text>
          <Text color={theme.colors.muted}>No specifications found</Text>
          <Box gap={2}>
            <Text bold color={theme.colors.primary}>
              [c] Create
            </Text>
            <Text color={theme.colors.borderSubtle}>
              {theme.symbols.divider}
            </Text>
            <Text bold color={theme.colors.primary}>
              [p] Pull
            </Text>
          </Box>
        </Box>
      );
    }

    const cleanSelectedTitle = selectedSpec?.title
      .replace(/^Spec:\s*/i, "")
      .trim();

    return (
      <Box
        flexDirection="column"
        width="100%"
        flexGrow={1}
        paddingX={1}
        paddingY={0}
      >
        {/* Main Split: 42% Left (Spec List), 58% Right (Spec Preview) */}
        <Box flexDirection="row" width="100%" flexGrow={1}>
          {/* Left Column: List of Specifications */}
          <Box flexDirection="column" width="42%" paddingRight={1}>
            <Box justifyContent="space-between" width="100%" marginBottom={1}>
              <Text bold color={theme.colors.primary}>
                Select a Specification ({specs.length})
              </Text>
              <Text color={theme.colors.muted}>[↑/↓] Move</Text>
            </Box>

            <Box flexDirection="column" gap={0}>
              {specs.map((s, idx) => {
                const isSelected = idx === selectedIndex;

                return (
                  <Box key={s.name} justifyContent="space-between" width="100%">
                    <Box gap={1} flexShrink={1}>
                      <Text
                        bold
                        color={
                          isSelected ? theme.colors.primary : theme.colors.muted
                        }
                      >
                        {isSelected ? theme.symbols.pointer : " "}
                      </Text>
                      <Text
                        bold={isSelected}
                        color={
                          isSelected ? theme.colors.primary : theme.colors.text
                        }
                        wrap="truncate-end"
                      >
                        {s.name}
                      </Text>
                    </Box>

                    <Box flexShrink={0} paddingLeft={1}>
                      <Text color={theme.colors.muted}>
                        {s.taskCount} task{s.taskCount === 1 ? "" : "s"}
                      </Text>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>

          {/* Vertical Divider */}
          <Box flexDirection="column" paddingX={1}>
            <Text color={theme.colors.borderSubtle}>
              {theme.symbols.divider}
            </Text>
          </Box>

          {/* Right Column: Specification Preview */}
          <Box flexDirection="column" width="56%" flexGrow={1} paddingLeft={1}>
            <Box marginBottom={1}>
              <Text bold color={theme.colors.primary}>
                Specification Preview
              </Text>
            </Box>

            {selectedSpec ? (
              <Box flexDirection="column" gap={1}>
                <Box gap={1}>
                  <Text bold color={theme.colors.text}>
                    {selectedSpec.name}
                  </Text>
                  {cleanSelectedTitle &&
                    cleanSelectedTitle !== selectedSpec.name && (
                      <Text color={theme.colors.muted}>
                        — {cleanSelectedTitle}
                      </Text>
                    )}
                </Box>

                <Box gap={2}>
                  <Text color={theme.colors.muted}>
                    Status:{" "}
                    <Text color={theme.colors.primary}>
                      {selectedSpec.status.toUpperCase()}
                    </Text>
                  </Text>
                  <Text color={theme.colors.borderSubtle}>
                    {theme.symbols.divider}
                  </Text>
                  <Text color={theme.colors.muted}>
                    Tasks:{" "}
                    <Text bold color={theme.colors.text}>
                      {selectedSpec.taskCount}
                    </Text>
                  </Text>
                </Box>

                {previewDetails.taskTitles.length > 0 && (
                  <Box flexDirection="column" marginTop={0}>
                    <Text color={theme.colors.muted}>Planned tasks:</Text>
                    {previewDetails.taskTitles.map((title, i) => (
                      <Box key={i} gap={1} paddingLeft={1}>
                        <Text color={theme.colors.accent}>
                          {theme.symbols.bullet}
                        </Text>
                        <Text color={theme.colors.muted} wrap="truncate-end">
                          {title}
                        </Text>
                      </Box>
                    ))}
                    {selectedSpec.taskCount >
                      previewDetails.taskTitles.length && (
                      <Box paddingLeft={1}>
                        <Text color={theme.colors.muted}>
                          ...and{" "}
                          {selectedSpec.taskCount -
                            previewDetails.taskTitles.length}{" "}
                          more
                        </Text>
                      </Box>
                    )}
                  </Box>
                )}

                {selectedSpec.taskCount === 0 && (
                  <Box paddingY={1}>
                    <Text color={theme.colors.muted}>
                      No task files generated yet. Starting run will initialize
                      tasks.
                    </Text>
                  </Box>
                )}
              </Box>
            ) : (
              <Text color={theme.colors.muted}>No specification selected.</Text>
            )}
          </Box>
        </Box>

        {/* Bottom Actions Bar */}
        <Box gap={1} marginTop={1} paddingTop={0}>
          <Text bold color={theme.colors.primary}>
            [Enter] Start Run
          </Text>
          <Text color={theme.colors.borderSubtle}>{theme.symbols.divider}</Text>
          <Text bold color={theme.colors.primary}>
            [c] New Spec
          </Text>
          <Text color={theme.colors.borderSubtle}>{theme.symbols.divider}</Text>
          <Text bold color={theme.colors.primary}>
            [p] Pull Spec
          </Text>
          <Text color={theme.colors.borderSubtle}>{theme.symbols.divider}</Text>
          <Text bold color={theme.colors.primary}>
            [2] Specs Tab
          </Text>
        </Box>
      </Box>
    );
  },
);

SpecPicker.displayName = "SpecPicker";
export default SpecPicker;
