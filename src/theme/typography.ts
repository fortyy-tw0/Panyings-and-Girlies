import { StyleSheet } from 'react-native';

import { colors } from './tokens';

/**
 * Plus Jakarta Sans is bundled through @expo-google-fonts (no network at runtime).
 * Android does not synthesize weights for custom fonts, so each weight is its own family.
 */
export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

export const textStyles = StyleSheet.create({
  brand: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, color: colors.primary },
  heading: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 35, color: colors.text },
  section: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, color: colors.text },
  question: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 27, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.text },
  bodySecondary: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.textSecondary },
  label: { fontFamily: fonts.semiBold, fontSize: 16, lineHeight: 22, color: colors.text },
  meta: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  metaStrong: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.text },
  link: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.primary },
  button: { fontFamily: fonts.semiBold, fontSize: 16, lineHeight: 22 },
});
