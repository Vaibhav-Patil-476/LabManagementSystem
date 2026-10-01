import { Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';

interface PdfDownloadPlugin {
  savePdf(options: { fileName: string; data: string }): Promise<{
    success: boolean;
    uri: string;
    fileName: string;
    location: string;
  }>;
}

// Plugin ekdach register vhava, mhanun fakta ethech
const PdfDownload = registerPlugin<PdfDownloadPlugin>('PdfDownload');

@Injectable({ providedIn: 'root' })
export class PdfDownloadService {

  /** APK madhe: phone Downloads madhe save + "Download complete" notification.
   *  Web var: navin tab madhe ughdto. */
  async download(url: string, fileName: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const response = await fetch(url);
      const blob = await response.blob();
      const base64Pdf = await this.blobToBase64(blob);

      const result = await PdfDownload.savePdf({ fileName, data: base64Pdf });
      if (!result || result.success !== true) {
        throw new Error('Unable to download PDF');
      }
    } else {
      window.open(url, '_blank');
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(blob);
    });
  }
}