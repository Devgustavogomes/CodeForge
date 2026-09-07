import React from 'react';
import { Box, Text } from 'ink';
import { TabId, TABS, useNavigation } from '../../context/NavigationContext.js';

export interface TabBarProps {
  activeTab?: TabId;
  onTabChange?: (tab: TabId) => void;
  borderColor?: string;
  borderStyle?: 'round' | 'single' | 'none';
}

/**
 * TabBar component rendering the 5 primary tabs of CodeForge TUI:
 * [1] Run, [2] Specs, [3] Tasks, [4] Docs, [5] Config
 * Displays an active highlight badge and rounded borders.
 */
export const TabBar: React.FC<TabBarProps> = ({
  activeTab: propActiveTab,
  onTabChange: propOnTabChange,
  borderColor = 'gray',
  borderStyle = 'round',
}) => {
  let navActiveTab: TabId = 'run';
  let navSetActiveTab: ((tab: TabId) => void) | null = null;

  try {
    const nav = useNavigation();
    navActiveTab = nav.activeTab;
    navSetActiveTab = nav.setActiveTab;
  } catch {
    // Outside NavigationProvider
  }

  const currentTab = propActiveTab ?? navActiveTab;
  const _handleTabChange = propOnTabChange ?? navSetActiveTab;
  const isNoneBorder = borderStyle === 'none';

  return (
    <Box
      borderStyle={isNoneBorder ? undefined : borderStyle}
      borderColor={isNoneBorder ? undefined : borderColor}
      paddingX={isNoneBorder ? 0 : 1}
      gap={1}
      width="100%"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === currentTab;
        return (
          <Box key={tab.id}>
            {isActive ? (
              <Text bold color="black" backgroundColor="cyan">
                {` [${tab.numberKey}] ${tab.label} `}
              </Text>
            ) : (
              <Text dimColor color="gray">
                {` [${tab.numberKey}] ${tab.label} `}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
};
