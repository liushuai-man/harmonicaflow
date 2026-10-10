import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PrefsProvider } from '../store/prefs';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PrefsProvider>
        <ThemeProvider>
          <ThemedStack />
        </ThemeProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}

/** 导航容器需要读取主题色，因此单独抽成组件（useTheme 必须在 Provider 内） */
function ThemedStack() {
  const { scheme, colors } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerTitleAlign: 'center',
          headerTitleStyle: { fontSize: 17, fontWeight: '700' },
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: '口琴跟吹助手' }} />
        <Stack.Screen name="practice/[id]" options={{ title: '跟吹' }} />
        <Stack.Screen name="settings" options={{ title: '设置' }} />
        <Stack.Screen name="learn/index" options={{ title: '入门练习' }} />
        <Stack.Screen name="learn/[id]" options={{ title: '基础练习' }} />
      </Stack>
    </>
  );
}
