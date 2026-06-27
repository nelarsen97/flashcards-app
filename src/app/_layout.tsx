import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { PatrickHand_400Regular, useFonts } from '@expo-google-fonts/patrick-hand';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { colors } from '@/theme';

// Hold the splash screen until the school fonts are ready, so no surface ever
// flashes in a fallback font before swapping to the handwritten/rounded faces.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PatrickHand_400Regular,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          // Each screen draws its own in-screen header over the chalkboard (see
          // <Screen>), so the board texture covers the whole screen.
          headerShown: false,
          contentStyle: { backgroundColor: colors.chalkboard },
        }}
      />
    </GestureHandlerRootView>
  );
}
