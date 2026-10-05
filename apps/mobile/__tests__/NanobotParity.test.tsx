import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { LocaleContext } from '../src/i18n';
import { Composer } from '../src/components/Composer';
import { ChatBubble } from '../src/components/ChatBubble';
import { ThemeProvider } from '../src/theme';
import { darkPalette, lightPalette, radius } from '../src/theme/tokens';

function wrap(node: React.ReactElement) {
  return (
    <ThemeProvider>
      <LocaleContext.Provider value="en">{node}</LocaleContext.Provider>
    </ThemeProvider>
  );
}

test('light and dark palettes match the pinned Nanobot tokens', () => {
  expect(lightPalette.bg).toBe('#FFFFFF');
  expect(lightPalette.text).toBe('#1E1E20');
  expect(lightPalette.sidebar).toBe('#F7F7F6');
  expect(lightPalette.sidebarSelected).toBe('#E4E4E4');
  expect(lightPalette.primary).toBe('#27272A');
  expect(lightPalette.usage).toBe('#EF8C2E');
  expect(darkPalette.bg).toBe('#303030');
  expect(darkPalette.surface).toBe('#383838');
  expect(darkPalette.primary).toBe('#FAFAFA');
  expect(radius.panel).toBe(22);
  expect(radius.prominent).toBe(28);
  expect(radius.floating).toBe(18);
  expect(radius.control).toBe(12);
});

test('composer uses the Nanobot panel radius and an arrow send control', () => {
  render(
    wrap(
      <Composer
        text=""
        onChangeText={() => {}}
        files={[]}
        busy={false}
        running={false}
        onRemove={() => {}}
        onPickFile={() => {}}
        onPickImage={() => {}}
        onMic={() => {}}
        onSend={() => {}}
        onStop={() => {}}
      />,
    ),
  );
  expect(screen.getByTestId('composer-thread').props.style).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ borderRadius: 22, backgroundColor: '#F5F5F5' }),
    ]),
  );
  expect(screen.getByTestId('icon-arrowUp', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.queryByText('+')).toBeNull();
});

test('hero composer uses the prominent radius', () => {
  render(
    wrap(
      <Composer
        hero
        text=""
        onChangeText={() => {}}
        files={[]}
        busy={false}
        running={false}
        onRemove={() => {}}
        onPickFile={() => {}}
        onPickImage={() => {}}
        onMic={() => {}}
        onSend={() => {}}
        onStop={() => {}}
      />,
    ),
  );
  expect(screen.getByTestId('composer-hero').props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ borderRadius: 28 })]),
  );
});

test('user messages use the floating radius and assistant text is full width', () => {
  render(
    wrap(
      <>
        <ChatBubble message={{ clientId: 'u', role: 'user', text: 'Hello' }} />
        <ChatBubble message={{ clientId: 'a', role: 'assistant', text: 'Reply' }} />
      </>,
    ),
  );
  expect(screen.getByTestId('bubble-user').props.style).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ borderRadius: 18 }),
      expect.objectContaining({ backgroundColor: '#F5F5F5' }),
    ]),
  );
  expect(screen.getByTestId('bubble-assistant').props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ width: '100%' })]),
  );
});
