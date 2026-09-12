import React from 'react';
import { Box, Text } from 'ink';
import { TabId, TABS, useNavigation } from '../../context/NavigationContext.js';
import { theme } from '../../theme.js';

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
export function areTabBarPropsEqual(prev: TabBarProps, next: TabBarProps): boolean {
  return (
    prev.activeTab === next.activeTab &&
    prev.onTabChange === next.onTabChange &&
    prev.borderColor === next.borderColor &&
    prev.borderStyle === next.borderStyle
  );
}

export const TabBar: React.FC<TabBarProps> = React.memo(({
  activeTab: propActiveTab,
  onTabChange: propOnTabChange,
  borderColor = theme.colors.borderSubtle,
  borderStyle = 'round',
}) => {
  const nav = useNavigation();
  const currentTab = propActiveTab ?? nav.activeTab;
  const _handleTabChange = propOnTabChange ?? nav.setActiveTab;
  const isNoneBorder = borderStyle === 'none';

  return (
    <Box
      borderStyle={isNoneBorder ? undefined : borderStyle}
      borderColor={isNoneBorder ? undefined : borderColor}
      paddingX={isNoneBorder ? 0 : 1}
      gap={1}
      width="100%"
      minHeight={isNoneBorder ? 2 : undefined}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === currentTab;
        return (
          <Box key={tab.id} flexDirection="column">
            <Text bold={isActive} color={isActive ? theme.colors.primary : theme.colors.muted}>
              {` [${tab.numberKey}] ${tab.label} `}
            </Text>
            {isActive && (
              <Text color={theme.colors.primary}>
                {'─'.repeat(tab.label.length + tab.numberKey.length + 5)}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}, areTabBarPropsEqual);

TabBar.displayName = 'TabBar';
