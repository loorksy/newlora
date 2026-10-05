import { NativeModules } from 'react-native';
import { APIError, authHeaders, baseURL, request } from './api';
export type SelectedFile = {
  uri: string;
  name: string;
  type: string;
  size: number;
  id?: string;
  progress?: number;
};
export async function pickAttachment(): Promise<SelectedFile | null> {
  return NativeModules.NewloraAttachments.pick();
}
export async function uploadAttachment(
  session: string,
  file: SelectedFile,
  progress: (percent: number) => void,
): Promise<string> {
  await request('/settings'); // Refresh session before opening the bounded upload.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      'POST',
      baseURL() +
        '/conversations/' +
        encodeURIComponent(session) +
        '/attachments',
    );
    xhr.setRequestHeader('Authorization', authHeaders().Authorization);
    xhr.timeout = 45000;
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) progress(Math.round((e.loaded * 100) / e.total));
    };
    xhr.onerror = xhr.ontimeout = () =>
      reject(new APIError('attachment_upload_failed'));
    xhr.onload = () => {
      try {
        const value = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(value.id);
        else reject(new APIError(value.code || 'attachment_upload_failed'));
      } catch {
        reject(new APIError('attachment_upload_failed'));
      }
    };
    const form = new FormData();
    form.append('file', { uri: file.uri, type: file.type, name: 'upload' });
    xhr.send(form);
  });
}
