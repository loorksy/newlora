import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Provider } from '@newlora/contracts';
import OpenAI from '../vendor/lobe/OpenAI';
import Anthropic from '../vendor/lobe/Anthropic';
import ZAI from '../vendor/lobe/ZAI';
import { useLocale } from '../i18n';
import { forwardIcon } from '../icons/map';
import { colors, radius, space } from '../theme';
import { Icon } from './Icon';
import { Label, styles as ui } from './UI';

export const providerNames: Record<Provider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  zai: 'Z.AI',
};

export function ProviderMark({ provider }: { provider: Provider }) {
  const color = colors.text;
  if (provider === 'openai') return <OpenAI size={22} color={color} />;
  if (provider === 'anthropic') return <Anthropic size={22} color={color} />;
  return <ZAI size={22} color={color} />;
}

export function ProviderRow({
  provider,
  status,
  onPress,
}: {
  provider: Provider;
  status: string;
  onPress: () => void;
}) {
  const { rtl } = useLocale();
  const name = providerNames[provider];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={styles.row}
    >
      <ProviderMark provider={provider} />
      <View style={{ flex: 1 }}>
        <Label>{name}</Label>
        <Label style={ui.muted}>{status}</Label>
      </View>
      <Icon name={forwardIcon(rtl)} color={colors.secondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
});
