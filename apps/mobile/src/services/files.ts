import { NativeModules } from 'react-native';
import { APIError, requestBlob } from './api';
export async function exportChart(id: string, save: boolean, title: string) {
  const blob = await requestBlob(
    '/artifacts/' + encodeURIComponent(id) + '/image',
  );
  if (blob.size > 15_000_000) throw new APIError('image_export_failed');
  const encoded = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new APIError('image_export_failed'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
  return NativeModules.NewloraChartFiles.exportImage(encoded, save, title);
}
