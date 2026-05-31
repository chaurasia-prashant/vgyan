import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* Light status bar for better visibility on dark headers */}
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false, // Custom headers are handled inside screens
          animation: 'fade_from_bottom',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="history" />
        <Stack.Screen name="stats" />
        <Stack.Screen name="quiz/select-exam" />
      </Stack>
    </SafeAreaProvider>
  );
}
