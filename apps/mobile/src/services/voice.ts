import { PermissionsAndroid } from 'react-native';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
  type MediaStream,
} from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import { APIError, request } from './api';
export class VoiceSession {
  private peer: RTCPeerConnection | null = null;
  private audio: MediaStream | null = null;
  private stopped = false;
  private channel: ReturnType<RTCPeerConnection['createDataChannel']> | null =
    null;
  private live = false;
  async start(onState: (state: string) => void, sessionId?: string) {
    this.stopped = false;
    const permission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    if (permission !== PermissionsAndroid.RESULTS.GRANTED)
      throw new APIError('microphoneRequired');
    if (this.stopped) return;
    onState('calling');
    InCallManager.start({ media: 'audio' });
    this.audio = await mediaDevices.getUserMedia({ audio: true, video: false });
    if (this.stopped) {
      this.audio.getTracks().forEach(track => track.stop());
      this.audio = null;
      return;
    }
    this.peer = new RTCPeerConnection({});
    this.audio
      .getTracks()
      .forEach(track => this.peer?.addTrack(track, this.audio!));
    const channel = this.peer.createDataChannel('oai-events');
    // Only public transcript and function-call event types are eligible for future UI projection.
    this.channel = channel;
    this.peer.onconnectionstatechange = () => {
      const state = this.peer?.connectionState;
      if (state === 'connected') onState('inCall');
      else if (
        (state === 'failed' || state === 'disconnected') &&
        !this.stopped
      )
        onState('reconnect');
    };
    const offer = await this.peer.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });
    await this.peer.setLocalDescription(offer);
    const session = await request<{
      mode: 'live' | 'realtime' | 'realtime_brokered';
      value?: string;
      transport?: { sdp: string };
      id?: string;
    }>('/voice/session', 'POST', { sdp: offer.sdp, sessionId });
    this.live = session.mode === 'live';
    channel.onmessage = (message: { data?: string }) => {
      if (session.mode !== 'realtime' || !message.data) return;
      let event: {
        type: string;
        name?: string;
        call_id?: string;
        arguments?: string;
      };
      try {
        event = JSON.parse(message.data);
      } catch {
        return;
      }
      if (
        event.type === 'response.function_call_arguments.done' &&
        event.name === 'research'
      ) {
        void this.research(session.id!, event.call_id!, event.arguments || '{}')
          .then(result => {
            if (this.stopped) return;
            channel.send(
              JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id: event.call_id,
                  output: result,
                },
              }),
            );
            channel.send(JSON.stringify({ type: 'response.create' }));
          })
          .catch(() => onState('reconnect'));
      }
    };
    if (this.stopped) return;
    let answer: string;
    if (session.mode !== 'realtime') {
      if (!session.transport?.sdp) throw new APIError('voice_unavailable');
      answer = session.transport.sdp;
    } else {
      const r = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: 'Bearer ' + session.value,
          'Content-Type': 'application/sdp',
        },
      });
      if (!r.ok) throw new APIError('voice_unavailable');
      answer = await r.text();
    }
    if (this.stopped || !this.peer) return;
    await this.peer.setRemoteDescription(
      new RTCSessionDescription({ type: 'answer', sdp: answer }),
    );
  }
  private async research(voiceId: string, callId: string, args: string) {
    const { objective } = JSON.parse(args);
    const { runId } = await request<{ runId: string }>(
      '/voice/' + voiceId + '/research',
      'POST',
      { callId, objective },
    );
    for (let i = 0; i < 450 && !this.stopped; i++) {
      const run = await request<{ status: string; text: string | null }>(
        '/runs/' + runId,
      );
      if (run.status === 'completed') return run.text || '';
      if (['failed', 'cancelled'].includes(run.status))
        return 'Research unavailable.';
      await new Promise<void>(resolve => setTimeout(resolve, 2000));
    }
    return 'Research continues in the conversation.';
  }
  mute(muted: boolean) {
    this.audio?.getAudioTracks().forEach(track => {
      track.enabled = !muted;
    });
  }
  speaker(enabled: boolean) {
    InCallManager.setForceSpeakerphoneOn(enabled);
  }
  stop() {
    this.stopped = true;
    if (this.live && this.channel?.readyState === 'open')
      this.channel.send(JSON.stringify({ type: 'session.close' }));
    this.channel = null;
    this.audio?.getTracks().forEach(t => t.stop());
    this.audio = null;
    this.peer?.close();
    this.peer = null;
    InCallManager.stop();
  }
}
