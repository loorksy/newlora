import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import App from '../App';
import { LocaleContext, isolate } from '../src/i18n';
import { ChatBubble } from '../src/components/ChatBubble';
import { Icon } from '../src/components/Icon';
import { ProviderRow } from '../src/components/ProviderRow';
import { TaskCard } from '../src/components/TaskCard';
import { request, restore, subscribe } from '../src/services/api';
import type { Task } from '@newlora/contracts';

jest.mock('../src/services/api', () => ({
  restore: jest.fn(),
  request: jest.fn(),
  subscribe: jest.fn(() => () => {}),
  baseURL: () => 'https://test.example',
  authHeaders: () => ({}),
  id: () => 'test-client-id',
  login: jest.fn(),
  logout: jest.fn(),
}));
jest.mock('../src/services/attachments', () => ({
  pickAttachment: jest.fn(),
  pickImage: jest.fn(),
  uploadAttachment: jest.fn(),
}));

const req = jest.mocked(request);

function settings(language: 'ar' | 'en') {
  return {
    preferences: { language, main: null, subagent: null, voice: null },
    credentials: {},
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(restore).mockResolvedValue(true);
  req.mockImplementation(async path => {
    if (path === '/settings') return settings('en') as never;
    return [] as never;
  });
});

test('home chips only prefill prompts and recent activity can be empty', async () => {
  render(<App />);
  expect(await screen.findByText('A clearer view of the market.')).toBeTruthy();
  expect(screen.getByText('Recent conversations will appear here.')).toBeTruthy();
  expect(screen.queryByText('H1')).toBeNull();
  expect(screen.queryByText('Open chart')).toBeNull();
  expect(
    screen.getAllByTestId('icon-brand', { includeHiddenElements: true }).length,
  ).toBeGreaterThan(0);
  expect(
    screen.getByTestId('icon-menu', { includeHiddenElements: true }),
  ).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Analyze XAU/USD'));
  expect(
    screen.getByLabelText('Ask about Forex, gold, or a setup…').props.value,
  ).toContain('XAU/USD');
  expect(req.mock.calls.some(call => String(call[0]).endsWith('/messages'))).toBe(
    false,
  );
});

test('drawer opens from the start edge and reaches empty sections', async () => {
  render(<App />);
  await screen.findByText('A clearer view of the market.');
  fireEvent.press(screen.getByLabelText('Open menu'));
  const drawer = await screen.findByTestId('drawer-panel');
  expect(drawer.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ direction: 'ltr' })]),
  );
  fireEvent.press(screen.getByText('Recommendations'));
  expect(
    await screen.findByText('Recommendations you request will appear here.'),
  ).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Open menu'));
  fireEvent.press(screen.getByText('Token usage'));
  expect(
    await screen.findByText('Usage appears after your first provider call.'),
  ).toBeTruthy();
  expect(screen.queryByText('$0.0000')).toBeNull();
  expect(screen.queryByText('Input tokens')).toBeNull();
});

test('Arabic drawer is RTL and the back icon points to the start edge', async () => {
  req.mockImplementation(async path =>
    path === '/settings' ? (settings('ar') as never) : ([] as never),
  );
  render(<App />);
  await screen.findByText('رؤية أوضح للسوق.');
  fireEvent.press(screen.getByLabelText('فتح القائمة'));
  expect(screen.getByTestId('drawer-panel').props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ direction: 'rtl' })]),
  );
  fireEvent.press(screen.getByText('الإعدادات'));
  expect(await screen.findByText('OpenAI')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('OpenAI'));
  expect(
    await screen.findByTestId('icon-arrowRight', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(screen.queryByText('gpt-4o')).toBeNull();
});

test('English settings lists the three providers and no invented models', async () => {
  render(<App />);
  await screen.findByText('A clearer view of the market.');
  fireEvent.press(screen.getByLabelText('Open menu'));
  fireEvent.press(screen.getByText('Settings'));
  expect(await screen.findByText('OpenAI')).toBeTruthy();
  expect(screen.getByText('Anthropic')).toBeTruthy();
  expect(screen.getByText('Z.AI')).toBeTruthy();
  expect(screen.getAllByText('Not configured')).toHaveLength(4);
  fireEvent.press(screen.getByLabelText('OpenAI'));
  expect(
    await screen.findByTestId('icon-arrowLeft', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(screen.getByLabelText('API key')).toBeTruthy();
  expect(screen.queryByText('gpt-4o')).toBeNull();
  expect(screen.queryByText('claude')).toBeNull();
});

test('provider rows render vector marks for OpenAI, Anthropic, and Z.AI', () => {
  const onPress = jest.fn();
  render(
    <LocaleContext.Provider value="en">
      <ProviderRow provider="openai" status="Not configured" onPress={onPress} />
      <ProviderRow provider="anthropic" status="Not configured" onPress={onPress} />
      <ProviderRow provider="zai" status="Not configured" onPress={onPress} />
    </LocaleContext.Provider>,
  );
  expect(screen.getByText('OpenAI')).toBeTruthy();
  expect(screen.getByText('Anthropic')).toBeTruthy();
  expect(screen.getByText('Z.AI')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Z.AI'));
  expect(onPress).toHaveBeenCalled();
});

test('tasks show server continuity, schedule, and pause', async () => {
  req.mockImplementation(async path => {
    if (path === '/settings') return settings('en') as never;
    if (path === '/tasks')
      return [
        {
          id: 'task-1',
          sessionId: 'session-9',
          status: 'active',
          config: {
            objective: 'Watch gold',
            instrument: 'XAU_USD',
            schedule: 'interval',
            interval_seconds: 300,
            notification: 'normal',
          },
          nextCheck: '2026-10-02T00:00:00.000Z',
        },
      ] as never;
    return [] as never;
  });
  render(<App />);
  await screen.findByText('A clearer view of the market.');
  fireEvent.press(screen.getByLabelText('Open menu'));
  fireEvent.press(screen.getByText('Tasks'));
  expect(
    await screen.findByText('Tasks continue on the server when the app is closed.'),
  ).toBeTruthy();
  expect(screen.getByText('Watch gold')).toBeTruthy();
  expect(screen.getByText(isolate('XAU_USD'))).toBeTruthy();
  expect(screen.getByText(/Every 300 seconds/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Pause'));
  await waitFor(() =>
    expect(req).toHaveBeenCalledWith('/tasks/task-1/pause', 'POST'),
  );
});

test('task card omits an unknown schedule', () => {
  const task = {
    id: 'task-2',
    sessionId: 'session-2',
    status: 'paused',
    config: { objective: 'Quiet watch', notification: 'silent' },
  } as Task;
  render(
    <LocaleContext.Provider value="en">
      <TaskCard
        task={task}
        language="en"
        onPause={jest.fn()}
        onCancel={jest.fn()}
        onOpen={jest.fn()}
      />
    </LocaleContext.Provider>,
  );
  expect(screen.getByText('Quiet watch')).toBeTruthy();
  expect(screen.getByText('Paused')).toBeTruthy();
  expect(screen.queryByText('Schedule')).toBeNull();
  expect(screen.getByLabelText('Resume')).toBeTruthy();
});

test('usage shows known totals and an em dash when cost is unknown', async () => {
  req.mockImplementation(async path => {
    if (path === '/settings') return settings('en') as never;
    if (String(path).startsWith('/usage'))
      return {
        tokens: 120,
        cost: null,
        calls: 2,
        breakdowns: {
          provider: { openai: 120 },
          model: { 'gpt-real': 120 },
        },
      } as never;
    return [] as never;
  });
  render(<App />);
  await screen.findByText('A clearer view of the market.');
  fireEvent.press(screen.getByLabelText('Open menu'));
  fireEvent.press(screen.getByText('Token usage'));
  expect(await screen.findByText('—')).toBeTruthy();
  expect(screen.getByText('Pricing not verified')).toBeTruthy();
  expect(screen.getByText(isolate('gpt-real'))).toBeTruthy();
  expect(screen.getByText(isolate('openai'))).toBeTruthy();
  expect(screen.queryByText('Input tokens')).toBeNull();
  expect(screen.queryByText('Latency')).toBeNull();
  expect(screen.queryByText(/\$\d/)).toBeNull();
});

test('chat activity uses an icon only for an event that occurred', async () => {
  req.mockImplementation(async path => {
    if (path === '/settings') return settings('en') as never;
    if (path === '/conversations') return { id: 'session-1', data: { title: '' } } as never;
    if (String(path).endsWith('/messages')) return { runId: 'run-1' } as never;
    if (path === '/conversations/session-1')
      return { messages: [], resources: [] } as never;
    return [] as never;
  });
  render(<App />);
  await screen.findByLabelText('Ask about Forex, gold, or a setup…');
  fireEvent.changeText(
    screen.getByLabelText('Ask about Forex, gold, or a setup…'),
    'Look at gold',
  );
  fireEvent.press(screen.getByLabelText('Send'));
  await waitFor(() => expect(subscribe).toHaveBeenCalled());
  const receive = jest.mocked(subscribe).mock.calls[0][1];
  act(() => {
    receive({
      id: 4,
      version: 1,
      sessionId: 'session-1',
      runId: 'run-1',
      timestamp: '2026-10-04T00:00:00Z',
      event: 'agent.activity',
      payload: { type: 'tool_started', tool: 'market_price', instrument: 'XAU_USD' },
    });
  });
  expect(await screen.findByText(/Fetching OANDA data/)).toBeTruthy();
  expect(
    screen.getAllByTestId('icon-activity', { includeHiddenElements: true }).length,
  ).toBeGreaterThan(0);
  expect(screen.queryByText('tool_started')).toBeNull();
});

test('user and assistant bubbles sit on opposite sides', () => {
  render(
    <LocaleContext.Provider value="ar">
      <ChatBubble
        message={{ clientId: 'u', role: 'user', text: 'حلّل XAU_USD', timestamp: '2026-10-04T00:00:00Z' }}
      />
      <ChatBubble
        message={{ clientId: 'a', role: 'assistant', text: 'الرسم جاهز' }}
      />
    </LocaleContext.Provider>,
  );
  expect(screen.getByTestId('bubble-user').props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ alignSelf: 'flex-end' })]),
  );
  expect(screen.getByTestId('bubble-assistant').props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ alignSelf: 'flex-start' })]),
  );
  expect(screen.getByText('حلّل XAU_USD')).toBeTruthy();
});

test('icon buttons expose labels and the registry renders vectors', () => {
  render(
    <LocaleContext.Provider value="en">
      <Icon name="brand" />
      <Icon name="send" />
      <Icon name="mic" />
    </LocaleContext.Provider>,
  );
  expect(
    screen.getByTestId('icon-brand', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(
    screen.getByTestId('icon-send', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(
    screen.getByTestId('icon-mic', { includeHiddenElements: true }),
  ).toBeTruthy();
});
