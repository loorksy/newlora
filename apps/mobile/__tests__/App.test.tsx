import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import App from '../App';
import { LocaleContext, isolate, translate } from '../src/i18n';
import { RecommendationCard } from '../src/components/RecommendationCard';
import { ArtifactView } from '../src/components/ArtifactView';
import { Label, Row } from '../src/components/UI';
import { request, restore, subscribe } from '../src/services/api';
import { parseChartCommand } from '@newlora/contracts';
import type {
  EventEnvelope,
  Resource,
  Recommendation,
  Artifact,
} from '@newlora/contracts';
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
const req = jest.mocked(request);
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(restore).mockResolvedValue(true);
  req.mockImplementation(async path => {
    if (path === '/settings')
      return {
        preferences: {
          language: 'ar',
          main: null,
          subagent: null,
          voice: null,
        },
        credentials: {},
      } as never;
    if (path === '/conversations')
      return { id: 'session-1', data: { title: '' } } as never;
    if (path.endsWith('/messages')) return { runId: 'run-1' } as never;
    if (path === '/conversations/session-1')
      return { messages: [], resources: [] } as never;
    return [] as never;
  });
});

test('Arabic welcome has drawer navigation and no chart button', async () => {
  render(<App />);
  expect(await screen.findByText('رؤية أوضح للسوق.')).toBeTruthy();
  expect(screen.queryByText('فتح الرسم البياني')).toBeNull();
  fireEvent.press(screen.getByLabelText('فتح القائمة'));
  expect(await screen.findByText('التوصيات')).toBeTruthy();
  fireEvent.press(screen.getByText('المهام'));
  expect(
    await screen.findByText('اطلب من نيولورا متابعة سوق أو فرصة أو أخبار.'),
  ).toBeTruthy();
});

test('English welcome and localized navigation', async () => {
  req.mockImplementation(async path =>
    path === '/settings'
      ? ({ preferences: { language: 'en' }, credentials: {} } as never)
      : ([] as never),
  );
  render(<App />);
  expect(await screen.findByText('A clearer view of the market.')).toBeTruthy();
  expect(screen.queryByText('Open chart')).toBeNull();
  fireEvent.press(screen.getByLabelText('Open menu'));
  expect(screen.getByText('Token usage')).toBeTruthy();
});

test('Arabic composer renders streaming event envelopes', async () => {
  render(<App />);
  await screen.findByText('رؤية أوضح للسوق.');
  fireEvent.changeText(
    screen.getByLabelText('اسأل عن العملات أو الذهب أو فرصة تداول…'),
    'حلّل الذهب',
  );
  fireEvent.press(screen.getByLabelText('إرسال'));
  await waitFor(() =>
    expect(req).toHaveBeenCalledWith(
      '/conversations/session-1/messages',
      'POST',
      expect.objectContaining({ text: 'حلّل الذهب' }),
    ),
  );
  await waitFor(() => expect(subscribe).toHaveBeenCalled());
  expect(screen.getByLabelText('إيقاف')).toBeTruthy();
  const receive = jest.mocked(subscribe).mock.calls[0][1];
  const envelope = {
    id: 1,
    version: 1,
    sessionId: 'session-1',
    runId: 'run-1',
    timestamp: '2026-10-04T00:00:00Z',
  } as const;
  act(() =>
    receive({ ...envelope, event: 'chat.stream.started', payload: {} }),
  );
  act(() =>
    receive({
      ...envelope,
      event: 'chat.delta',
      payload: { text: 'بيانات الذهب ' },
    }),
  );
  act(() =>
    receive({
      ...envelope,
      id: 2,
      event: 'chat.delta',
      payload: { text: 'محدثة' },
    }),
  );
  expect(screen.getByText('بيانات الذهب محدثة')).toBeTruthy();
  act(() =>
    receive({
      ...envelope,
      id: 3,
      event: 'chart.context',
      payload: {
        instrument: 'XAU_USD',
        timeframe: 'M15',
        artifactId: 'chart-1',
      },
    }),
  );
  expect(screen.getByLabelText('فتح الرسم البياني')).toBeTruthy();
});

test.each(['ar', 'en'] as const)(
  'direction and mixed symbol isolation %s',
  lang => {
    render(
      <LocaleContext.Provider value={lang}>
        <Row testID="row">
          <Label testID="text">{isolate('XAU_USD · 2400.50')}</Label>
        </Row>
      </LocaleContext.Provider>,
    );
    expect(screen.getByTestId('row').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          flexDirection: lang === 'ar' ? 'row-reverse' : 'row',
        }),
      ]),
    );
    expect(screen.getByTestId('text').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          writingDirection: lang === 'ar' ? 'rtl' : 'ltr',
        }),
      ]),
    );
    expect(isolate('EUR_USD')).toBe('\u2066EUR_USD\u2069');
  },
);

test('recommendation omits absent prices and confidence', () => {
  const item = {
    id: 'r',
    data: {
      instrument: 'XAU_USD',
      summary: 'Observed',
      status: 'active',
      targets: [],
      timeframes: [],
    },
  } as unknown as Resource<Recommendation>;
  render(
    <LocaleContext.Provider value="en">
      <RecommendationCard item={item} onOpen={() => {}} />
    </LocaleContext.Provider>,
  );
  expect(screen.getByText('Observed')).toBeTruthy();
  expect(screen.queryByText('Entry')).toBeNull();
  expect(screen.queryByText('Confidence')).toBeNull();
});

test('selection artifact sends structured interaction to backend', async () => {
  const item = {
    id: 'a',
    data: {
      type: 'select_item',
      title: 'Choose',
      data: { options: [{ id: 'EUR_USD', label: 'Euro' }] },
    },
  } as unknown as Resource<Artifact>;
  render(
    <ArtifactView item={item} onChart={() => {}} onInteraction={() => {}} />,
  );
  fireEvent.press(screen.getByText('Euro'));
  await waitFor(() =>
    expect(req).toHaveBeenCalledWith('/artifacts/a/select', 'POST', {
      itemId: 'EUR_USD',
      clientId: 'test-client-id',
    }),
  );
});

test('chart bridge rejects unknown commands', () => {
  expect(() =>
    parseChartCommand({ id: 'x', command: 'executeShell' }),
  ).toThrow();
  expect(parseChartCommand({ id: 'x', command: 'captureChart' }).command).toBe(
    'captureChart',
  );
});

test('settings starts with no keys or invented model choices', async () => {
  render(<App />);
  await screen.findByText('رؤية أوضح للسوق.');
  fireEvent.press(screen.getByLabelText('فتح القائمة'));
  fireEvent.press(screen.getByText('الإعدادات'));
  await waitFor(() =>
    expect(screen.getAllByText('لم يتم الإعداد')).toHaveLength(4),
  );
  expect(screen.queryByText('gpt-4o')).toBeNull();
});

import { Attachments } from '../src/components/Attachments';
import { pickAttachment, uploadAttachment } from '../src/services/attachments';
jest.mock('../src/services/attachments', () => ({
  pickAttachment: jest.fn(),
  uploadAttachment: jest.fn(),
}));

test.each(['ar', 'en'] as const)(
  'attachment preview, progress and removal in %s',
  lang => {
    const remove = jest.fn();
    render(
      <LocaleContext.Provider value={lang}>
        <Attachments
          files={[
            {
              uri: 'content://user/chart',
              name: 'XAU_USD.png',
              type: 'image/png',
              size: 40,
              progress: 50,
            },
          ]}
          remove={remove}
          disabled={false}
        />
      </LocaleContext.Provider>,
    );
    expect(
      screen.getByLabelText(translate(lang, 'attachmentPreview')),
    ).toBeTruthy();
    expect(
      screen.getByText(translate(lang, 'uploading') + ' 50%'),
    ).toBeTruthy();
    fireEvent.press(screen.getByLabelText(translate(lang, 'removeAttachment')));
    expect(remove).toHaveBeenCalledWith(0);
  },
);

test('composer sends uploaded attachment IDs and a real queued state', async () => {
  jest
    .mocked(pickAttachment)
    .mockResolvedValue({
      uri: 'content://chart',
      name: 'chart.png',
      type: 'image/png',
      size: 50,
    });
  jest.mocked(uploadAttachment).mockResolvedValue('attachment-1');
  render(<App />);
  await screen.findByText('رؤية أوضح للسوق.');
  fireEvent.press(screen.getByLabelText('إرفاق'));
  await screen.findByText(isolate('chart.png'));
  fireEvent.press(screen.getByLabelText('إرسال'));
  await waitFor(() =>
    expect(req).toHaveBeenCalledWith(
      '/conversations/session-1/messages',
      'POST',
      expect.objectContaining({ attachmentIds: ['attachment-1'] }),
    ),
  );
  expect(await screen.findByText('في الانتظار')).toBeTruthy();
  expect(screen.getByText(translate('ar', 'mayLeave'))).toBeTruthy();
});

test('failed upload stays selected with a clear retry message', async () => {
  jest
    .mocked(pickAttachment)
    .mockResolvedValue({
      uri: 'content://report',
      name: 'report.pdf',
      type: 'application/pdf',
      size: 50,
    });
  jest
    .mocked(uploadAttachment)
    .mockRejectedValue({ code: 'attachment_upload_failed' });
  render(<App />);
  await screen.findByText('رؤية أوضح للسوق.');
  fireEvent.press(screen.getByLabelText('إرفاق'));
  await screen.findByText(isolate('report.pdf'));
  fireEvent.press(screen.getByLabelText('إرسال'));
  expect(
    await screen.findByText(translate('ar', 'attachment_upload_failed')),
  ).toBeTruthy();
  expect(screen.getByText(isolate('report.pdf'))).toBeTruthy();
  expect(req.mock.calls.some(c => c[0].endsWith('/messages'))).toBe(false);
});

test('tool failures render safe failure activity, without arguments', async () => {
  render(<App />);
  await screen.findByText('رؤية أوضح للسوق.');
  fireEvent.changeText(
    screen.getByLabelText(translate('ar', 'composer')),
    'gold',
  );
  fireEvent.press(screen.getByLabelText('إرسال'));
  await waitFor(() => expect(subscribe).toHaveBeenCalled());
  act(() =>
    jest
      .mocked(subscribe)
      .mock.calls[0][1]({
        id: 1,
        event: 'agent.activity',
        version: 1,
        sessionId: 'session-1',
        runId: 'run-1',
        timestamp: '2026-10-04T00:00:00Z',
        payload: {
          type: 'tool_failed',
          tool: 'market_price',
          code: 'tool_temporarily_unavailable',
        },
      }),
  );
  expect(screen.getByText(translate('ar', 'tool_failed'))).toBeTruthy();
  expect(screen.queryByText('tool_temporarily_unavailable')).toBeNull();
});
