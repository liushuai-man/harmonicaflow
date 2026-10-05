import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTitleAlign: 'center',
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: '#F5F6F8' },
        }}
      >
        <Stack.Screen name="index" options={{ title: '口琴跟吹助手' }} />
        <Stack.Screen name="practice/[id]" options={{ title: '跟吹' }} />
        <Stack.Screen name="settings" options={{ title: '设置' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
