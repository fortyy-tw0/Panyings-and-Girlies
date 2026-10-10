import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '../theme/tokens';

type IconProps = { size?: number; color?: string };

export function CheckIcon({ size = 14, color = colors.onPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Welcome illustration: a cycle wave inside a dotted ring (PDF p. 7). Decorative. */
export function CycleWaveIllustration({ size = 160 }: { size?: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 160 160">
        <Circle
          cx={80}
          cy={80}
          r={74}
          stroke="#E0B54A"
          strokeWidth={3}
          strokeDasharray="1 9"
          strokeLinecap="round"
          fill="none"
        />
        <Circle cx={80} cy={80} r={54} fill={colors.card} />
        <Path
          d="M44 82c8-30 18-30 24-6s16 30 24 6 14-26 24-10"
          stroke={colors.primary}
          strokeWidth={4}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}
