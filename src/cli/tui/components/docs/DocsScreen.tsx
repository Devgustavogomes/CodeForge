import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { Modal } from "../common/Modal.js";
import { useNavigation } from "../../context/NavigationContext.js";
import { useTerminalDimensions } from "../../hooks/useTerminalDimensions.js";
import {
  AppContainer,
  createAppContainer,
} from "../../../../infrastructure/container.js";
import {
  CreateDocUseCase,
  CreateDocResult,
} from "../../../../application/use-cases/CreateDocUseCase.js";
import {
  UpdateDocUseCase,
  ManualDocUpdateResult,
} from "../../../../application/use-cases/UpdateDocUseCase.js";
import { DocsManifest, DocsManifestEntry } from "../../../../domain/doc.js";
import { PATHS } from "../../../../infrastructure/paths.js";

export interface DocItemInfo extends DocsManifestEntry {
  name: string;
  existsOnDisk: boolean;
  inManifest: boolean;
}

export interface DocsScreenProps {
  container?: AppContainer;
  initialDocs?: DocItemInfo[];
  isInteractive?: boolean;
  onCreateDoc?: (docName: string, specName: string) => Promise<void> | void;
  onUpdateDoc?: (docName: string, specName: string) => Promise<void> | void;
}

export const DocsScreen: React.FC<DocsScreenProps> = ({
  container: propContainer,
  initialDocs,
  isInteractive = true,
  onCreateDoc,
  onUpdateDoc,
}) => {
  let nav: ReturnType<typeof useNavigation> | undefined;
  try {
    nav = useNavigation();
  } catch {
    // Graceful fallback outside NavigationProvider
  }

  const setTextInputActive = nav?.setTextInputActive;
  const { breakpoint } = useTerminalDimensions();
  const container = useMemo(
    () => propContainer ?? createAppContainer(),
    [propContainer],
  );

  const [docs, setDocs] = useState<DocItemInfo[]>(() => initialDocs ?? []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocSpec, setNewDocSpec] = useState("");
  const [isSpecCustom, setIsSpecCustom] = useState(false);
  const [createField, setCreateField] = useState<"name" | "spec">("name");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Available specs for options
  const availableSpecs = useMemo(() => {
    try {
      return container.listSpecsUseCase.listNames();
    } catch {
      return [];
    }
  }, [container]);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Load documentation items from manifest and disk
  const loadDocs = useCallback(() => {
    try {
      const manifestRepo = container.docsManifestRepository;
      const manifest: DocsManifest = manifestRepo.load();
      const loaded: DocItemInfo[] = [];
      const seen = new Set<string>();

      // Manifest documents
      for (const [name, entry] of Object.entries(manifest.documents || {})) {
        seen.add(name);
        const exists = container.gw.exists(entry.path);
        loaded.push({
          name,
          path: entry.path,
          specs: entry.specs || [],
          scope: entry.scope || [],
          createdAt: entry.createdAt || "N/A",
          updatedAt: entry.updatedAt || "N/A",
          existsOnDisk: exists,
          inManifest: true,
        });
      }

      // Check files on disk in .codeforge/docs/
      if (container.gw.exists(PATHS.docsDir)) {
        const files = container.gw.listDir(PATHS.docsDir);
        for (const file of files) {
          if (file.endsWith(".md") && !file.includes(".prompt.")) {
            const name = file.replace(/\.md$/, "");
            if (!seen.has(name)) {
              loaded.push({
                name,
                path: `${PATHS.docsDir}/${file}`,
                specs: [],
                scope: [],
                createdAt: "N/A",
                updatedAt: "N/A",
                existsOnDisk: true,
                inManifest: false,
              });
            }
          }
        }
      }

      loaded.sort((a, b) => a.name.localeCompare(b.name));
      setDocs(loaded);
    } catch {
      setDocs([]);
    }
  }, [container]);

  useEffect(() => {
    if (!initialDocs) {
      loadDocs();
    }
  }, [initialDocs, loadDocs]);

  const selectedDoc = docs[selectedIndex] ?? null;

  // Handle doc creation
  const handleOpenCreateModal = useCallback(() => {
    setIsCreateModalOpen(true);
    setNewDocName("");
    const defaultSpec =
      nav?.activeSpec && availableSpecs.includes(nav.activeSpec)
        ? nav.activeSpec
        : availableSpecs.length > 0
          ? availableSpecs[0]
          : "";
    setNewDocSpec(defaultSpec);
    setIsSpecCustom(false);
    setCreateField("name");
    setCreateError(null);
    setTextInputActive?.(true);
  }, [nav?.activeSpec, availableSpecs, setTextInputActive]);

  const handleCloseCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
    setNewDocName("");
    setNewDocSpec("");
    setIsSpecCustom(false);
    setCreateError(null);
    setIsCreating(false);
    setTextInputActive?.(false);
  }, [setTextInputActive]);

  const handleCycleSpec = useCallback(
    (direction: 1 | -1 = 1) => {
      if (availableSpecs.length === 0) return;
      setIsSpecCustom(false);
      const currentIdx = availableSpecs.indexOf(newDocSpec);
      const nextIdx =
        currentIdx === -1
          ? 0
          : (currentIdx + direction + availableSpecs.length) %
            availableSpecs.length;
      setNewDocSpec(availableSpecs[nextIdx]);
      setCreateError(null);
    },
    [availableSpecs, newDocSpec],
  );

  const handleCreateSubmit = useCallback(async () => {
    const docNameTrimmed = newDocName.trim().replace(/\.md$/i, "");
    const specNameTrimmed = newDocSpec.trim().replace(/\.md$/i, "");

    if (!docNameTrimmed) {
      setCreateError("Documentation name is required.");
      setCreateField("name");
      return;
    }
    if (!specNameTrimmed) {
      setCreateError("Associated specification name is required.");
      setCreateField("spec");
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      if (onCreateDoc) {
        await onCreateDoc(docNameTrimmed, specNameTrimmed);
      } else {
        const useCase: CreateDocUseCase = container.createDocUseCase;
        const result: CreateDocResult = await useCase.execute(
          docNameTrimmed,
          specNameTrimmed,
        );

        if (result.kind === "not-initialized") {
          setCreateError(
            "Workspace not initialized (.codeforge/metadata.json not found).",
          );
          setIsCreating(false);
          return;
        }
        if (result.kind === "spec-not-found") {
          setCreateError(
            `Specification "${specNameTrimmed}" not found in .codeforge/specs/.`,
          );
          setIsCreating(false);
          return;
        }
        if (result.kind === "rules-not-found") {
          setCreateError(
            "Documentation rules file not found (.codeforge/rules/docs.md).",
          );
          setIsCreating(false);
          return;
        }
        if (result.kind === "already-exists") {
          setCreateError(`Documentation "${docNameTrimmed}" already exists.`);
          setIsCreating(false);
          return;
        }
      }

      handleCloseCreateModal();
      loadDocs();
      setFeedback({
        type: "success",
        message: `Documentation "${docNameTrimmed}" created successfully!`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCreateError(`Failed to create doc: ${msg}`);
      setIsCreating(false);
    }
  }, [
    newDocName,
    newDocSpec,
    onCreateDoc,
    container,
    handleCloseCreateModal,
    loadDocs,
  ]);

  // Handle doc update
  const handleUpdateDoc = useCallback(async () => {
    if (!selectedDoc) return;
    setIsUpdating(true);
    setFeedback({
      type: "info",
      message: `Updating documentation "${selectedDoc.name}"...`,
    });

    try {
      let targetSpec = "";
      if (selectedDoc.specs && selectedDoc.specs.length > 0) {
        targetSpec = selectedDoc.specs[0]
          .replace(/^.*[\\/]/, "")
          .replace(/\.md$/, "");
      } else {
        targetSpec = nav?.activeSpec || "";
      }

      if (!targetSpec) {
        // Fallback: try finding first spec in workspace
        const specs = container.listSpecsUseCase.listNames();
        targetSpec = specs[0] || "";
      }

      if (onUpdateDoc) {
        await onUpdateDoc(selectedDoc.name, targetSpec);
      } else {
        const updateUseCase: UpdateDocUseCase = container.updateDocUseCase;
        const manualResult: ManualDocUpdateResult = updateUseCase.getManualDoc(
          targetSpec,
          selectedDoc.name,
        );

        if (manualResult.kind !== "doc") {
          setFeedback({
            type: "error",
            message: `Update preparation failed: ${manualResult.kind}`,
          });
          setIsUpdating(false);
          return;
        }

        await updateUseCase.execute(targetSpec, manualResult.doc, true);
      }

      loadDocs();
      setFeedback({
        type: "success",
        message: `Documentation "${selectedDoc.name}" updated successfully!`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: `Doc update failed: ${msg}` });
    } finally {
      setIsUpdating(false);
    }
  }, [selectedDoc, nav?.activeSpec, container, onUpdateDoc, loadDocs]);

  // Keyboard navigation
  useInput(
    (input, key) => {
      if (!isInteractive) return;

      // Inside Create Modal
      if (isCreateModalOpen) {
        if (key.escape || input === "\u001B") {
          handleCloseCreateModal();
          return;
        }
        if (key.tab) {
          setCreateField((prev) => (prev === "name" ? "spec" : "name"));
          return;
        }
        if (key.return || input === "\r" || input === "\n") {
          if (
            createField === "name" &&
            newDocName.trim() &&
            !newDocSpec.trim()
          ) {
            setCreateField("spec");
            return;
          }
          void handleCreateSubmit();
          return;
        }

        // Cycle specs if focused on spec
        if (
          createField === "spec" &&
          availableSpecs.length > 0 &&
          !isSpecCustom
        ) {
          if (key.leftArrow || key.upArrow) {
            handleCycleSpec(-1);
            return;
          }
          if (key.rightArrow || key.downArrow || input === " ") {
            handleCycleSpec(1);
            return;
          }
        }

        if (key.upArrow) {
          setCreateField("name");
          return;
        }
        if (key.downArrow) {
          setCreateField("spec");
          return;
        }

        if (
          key.backspace ||
          key.delete ||
          input === "\x08" ||
          input === "\x7f"
        ) {
          if (createField === "name") {
            setNewDocName((prev) => prev.slice(0, -1));
          } else {
            setNewDocSpec((prev) => {
              const next = prev.slice(0, -1);
              if (!next) setIsSpecCustom(false);
              return next;
            });
          }
          setCreateError(null);
          return;
        }

        if (key.ctrl && input === "u") {
          if (createField === "name") setNewDocName("");
          else {
            setNewDocSpec("");
            setIsSpecCustom(false);
          }
          setCreateError(null);
          return;
        }

        if (!key.ctrl && !key.meta) {
          const printable = input
            .split("")
            .filter((ch) => {
              const code = ch.charCodeAt(0);
              return (code >= 32 && code !== 127) || code > 127;
            })
            .join("");

          if (printable.length > 0) {
            if (createField === "name") {
              setNewDocName((prev) => prev + printable);
            } else {
              if (
                printable !== " " ||
                isSpecCustom ||
                availableSpecs.length === 0
              ) {
                if (!isSpecCustom && availableSpecs.includes(newDocSpec)) {
                  setNewDocSpec(printable);
                  setIsSpecCustom(true);
                } else {
                  setNewDocSpec((prev) => prev + printable);
                }
              }
            }
            setCreateError(null);
          }
        }
        return;
      }

      if (nav?.isTextInputActive) return;

      // Navigate doc list
      if (key.upArrow || input === "k") {
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : Math.max(0, docs.length - 1),
        );
        setFeedback(null);
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedIndex((prev) => (prev < docs.length - 1 ? prev + 1 : 0));
        setFeedback(null);
        return;
      }

      // 'c' -> Create Doc Modal
      if (input === "c" || input === "C") {
        handleOpenCreateModal();
        return;
      }

      // 'u' -> Update Doc UseCase
      if (input === "u" || input === "U") {
        void handleUpdateDoc();
        return;
      }
    },
    { isActive: isInteractive },
  );

  const isSideBySide = breakpoint !== "minimal";

  const maxVisibleDocs = 6;
  const visibleDocs = useMemo(() => {
    if (docs.length <= maxVisibleDocs) return docs;
    const selectedIdx = Math.max(0, selectedIndex);
    let start = Math.max(0, selectedIdx - Math.floor(maxVisibleDocs / 2));
    if (start + maxVisibleDocs > docs.length) {
      start = Math.max(0, docs.length - maxVisibleDocs);
    }
    return docs.slice(start, start + maxVisibleDocs);
  }, [docs, maxVisibleDocs, selectedIndex]);

  if (isCreateModalOpen) {
    return (
      <Modal
        title="Create Documentation"
        isOpen={true}
        onClose={handleCloseCreateModal}
        borderColor="cyan"
        width="100%"
      >
        <Box flexDirection="column" width="100%">
          <Box justifyContent="space-between" width="100%" marginBottom={0}>
            <Box gap={1} flexShrink={1}>
              <Text bold color={createField === "name" ? "cyan" : "white"}>
                1. Document Name (slug):
              </Text>
              <Text color="cyan" bold>
                {"> "}
              </Text>
              {newDocName.length > 0 ? (
                <Text color="white" bold wrap="truncate-end">
                  {newDocName}
                  {createField === "name" ? "█" : ""}
                </Text>
              ) : (
                <Box gap={1}>
                  {createField === "name" && <Text color="cyan">█</Text>}
                  <Text dimColor wrap="truncate-end">
                    e.g. architecture, system-design, api-reference
                  </Text>
                </Box>
              )}
            </Box>
          </Box>

          <Box justifyContent="space-between" width="100%" marginBottom={0}>
            <Box gap={1} flexShrink={1}>
              <Text bold color={createField === "spec" ? "cyan" : "white"}>
                2. Associated Spec:
              </Text>
              {availableSpecs.length > 0 && !isSpecCustom ? (
                <Box gap={1}>
                  {availableSpecs.map((sp) => {
                    const isSelected = newDocSpec === sp;
                    return (
                      <Text
                        key={sp}
                        color={isSelected ? "cyan" : "gray"}
                        bold={isSelected}
                      >
                        {isSelected ? `● [${sp}]` : `○ ${sp}`}
                      </Text>
                    );
                  })}
                </Box>
              ) : (
                <Box gap={1}>
                  <Text color="cyan" bold>
                    {"> "}
                  </Text>
                  {newDocSpec.length > 0 ? (
                    <Text color="white" wrap="truncate-end">
                      {newDocSpec}
                      {createField === "spec" ? "█" : ""}
                    </Text>
                  ) : (
                    <Box gap={1}>
                      {createField === "spec" && <Text color="cyan">█</Text>}
                      <Text dimColor wrap="truncate-end">
                        e.g. tui, decouple-spec-source
                      </Text>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
            {createField === "spec" &&
              availableSpecs.length > 0 &&
              !isSpecCustom && <Text dimColor>[Space/←/→] Select spec</Text>}
          </Box>

          {createError && (
            <Box marginBottom={0}>
              <Text color="red" bold wrap="truncate-end">
                ✗ {createError}
              </Text>
            </Box>
          )}

          {isCreating && (
            <Box marginBottom={0}>
              <Text color="yellow">
                ⏳ Generating documentation with agent runner...
              </Text>
            </Box>
          )}

          <Box
            marginTop={1}
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
            justifyContent="space-between"
            width="100%"
          >
            <Text dimColor>[Tab] Switch field · [Enter] Generate Doc</Text>
            <Text bold color="red">
              [Esc] Cancel / Voltar
            </Text>
          </Box>
        </Box>
      </Modal>
    );
  }

  return (
    <Box flexDirection="column" width="100%" flexGrow={1}>
      {/* Main Container */}
      <Box flexDirection={isSideBySide ? "row" : "column"} width="100%" flexGrow={1}>
        {/* Left Column: Docs List */}
        <Box
          flexDirection="column"
          width={isSideBySide ? "45%" : "100%"}
          borderStyle="round"
          borderColor="cyan"
          paddingX={1}
        >
          <Box justifyContent="space-between" marginBottom={1}>
            <Text bold color="cyan">
              Docs ({docs.length})
            </Text>
            <Text dimColor>[c] Create · [u] Update</Text>
          </Box>

          {docs.length === 0 ? (
            <Box
              paddingY={2}
              justifyContent="center"
              flexDirection="column"
              alignItems="center"
            >
              <Text dimColor>
                No documentation files found in .codeforge/docs/
              </Text>
              <Text dimColor>
                Press 'c' to create a new documentation file.
              </Text>
            </Box>
          ) : (
            <Box flexDirection="column">
              {visibleDocs.map((doc) => {
                const isSelected = doc.name === selectedDoc?.name;
                return (
                  <Box
                    key={doc.name}
                    justifyContent="space-between"
                    width="100%"
                  >
                    <Box gap={1} flexShrink={1}>
                      <Text
                        color={isSelected ? "cyan" : undefined}
                        bold={isSelected}
                      >
                        {isSelected ? "❯" : " "}
                      </Text>
                      <Text
                        bold={isSelected}
                        color={isSelected ? "cyan" : "white"}
                        wrap="truncate-end"
                      >
                        {doc.name}.md
                      </Text>
                    </Box>
                    <Text color={doc.inManifest ? "green" : "gray"}>
                      {doc.inManifest ? "[TRACKED]" : "[UNTRACKED]"}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>

        {/* Right Column: Doc Inspection & Actions */}
        <Box
          flexDirection="column"
          width={isSideBySide ? "55%" : "100%"}
          borderStyle="round"
          borderColor="blue"
          paddingX={1}
        >
          <Box marginBottom={1}>
            <Text bold color="blue">
              Document Details:{" "}
              {selectedDoc ? `${selectedDoc.name}.md` : "None"}
            </Text>
          </Box>

          {feedback && (
            <Box
              marginY={1}
              paddingX={1}
              borderStyle="single"
              borderColor={
                feedback.type === "success"
                  ? "green"
                  : feedback.type === "error"
                    ? "red"
                    : "yellow"
              }
            >
              <Text
                color={
                  feedback.type === "success"
                    ? "green"
                    : feedback.type === "error"
                      ? "red"
                      : "yellow"
                }
                bold
              >
                {feedback.message}
              </Text>
            </Box>
          )}

          {isUpdating && (
            <Box marginY={1}>
              <Text color="yellow">
                ⏳ Running documentation update with AI agent...
              </Text>
            </Box>
          )}

          {selectedDoc ? (
            <Box flexDirection="column">
              <Box marginBottom={0}>
                <Text bold>Name: </Text>
                <Text color="white" wrap="truncate-end">
                  {selectedDoc.name}
                </Text>
              </Box>
              <Box marginBottom={0}>
                <Text bold>Path: </Text>
                <Text dimColor wrap="truncate-end">
                  {selectedDoc.path}
                </Text>
              </Box>
              <Box marginBottom={0} justifyContent="space-between">
                <Box gap={1} flexShrink={1}>
                  <Text bold>Status: </Text>
                  <Text color={selectedDoc.inManifest ? "green" : "yellow"}>
                    {selectedDoc.inManifest ? "Tracked" : "Untracked"}
                  </Text>
                </Box>
                {selectedDoc.createdAt !== "N/A" && (
                  <Box gap={1} flexShrink={0} paddingLeft={1}>
                    <Text bold>Created: </Text>
                    <Text dimColor wrap="truncate-end">
                      {selectedDoc.createdAt}
                    </Text>
                  </Box>
                )}
              </Box>

              <Box marginBottom={0}>
                <Text bold>Associated Specs: </Text>
                <Text dimColor wrap="truncate-end">
                  {selectedDoc.specs.length === 0
                    ? "None linked"
                    : selectedDoc.specs.join(", ")}
                </Text>
              </Box>

              <Box marginBottom={0}>
                <Text bold>Tracked Scope: </Text>
                <Text color="cyan" wrap="truncate-end">
                  {selectedDoc.scope.length === 0
                    ? "All codebase changes"
                    : selectedDoc.scope.join(", ")}
                </Text>
              </Box>

              <Box
                marginTop={1}
                borderStyle="single"
                borderColor="gray"
                paddingX={1}
                justifyContent="space-between"
              >
                <Text dimColor>
                  [u] Update from Codebase · [c] Create new Document
                </Text>
              </Box>
            </Box>
          ) : (
            <Box paddingY={2} justifyContent="center">
              <Text dimColor>
                Select a documentation file to view metadata and trigger
                updates.
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};
