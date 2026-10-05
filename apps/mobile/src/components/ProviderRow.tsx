import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Provider } from '@newlora/contracts';
import OpenAI from '../vendor/lobe/OpenAI';
import Anthropic from '../vendor/lobe/Anthropic';
import ZAI from '../vendor/lobe/ZAI';
import { useLocale } from '../i18n';
import { forwardIcon } from '../icons/map';
import { radius, useColors } from '../theme';
import { Icon } from './Icon';
import { Label } from './UI';

export const providerNames: Record<Provider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  zai: 'Z.AI',
};

export function ProviderMark({ provider }: { provider: Provider }) {
  const colors = useColors();
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
  const colors = useColors();
  const name = providerNames[provider];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={[
        styles.row,
        {
          direction: rtl ? 'rtl' : 'ltr',
          borderColor: colors.border,
          backgroundColor: colors.settingsSurface,
        },
      ]}
    >
      <ProviderMark provider={provider} />
      <View style={{ flex: 1 }}>
        <Label>{name}</Label>
        <Label style={{ fontSize: 12, lineHeight: 16, color: colors.secondary }}>
          {status}
        </Label>
      </View>
      <Icon name={forwardIcon(rtl)} size={16} color={colors.secondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    borderRadius: radius.control,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
