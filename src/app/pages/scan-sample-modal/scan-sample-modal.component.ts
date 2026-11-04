import { Component, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, IonInput } from '@ionic/angular';
import { ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  qrCodeOutline, closeOutline, searchOutline, checkmarkCircleOutline,
  refreshOutline, closeCircleOutline, scanOutline, cameraOutline,
} from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { SampleAccessionService } from '../../core/services/sampleaccession.service';
import { ToastService } from '../../core/services/toast';

@Component({
  selector: 'app-scan-sample-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './scan-sample-modal.component.html',
  styleUrls: ['./scan-sample-modal.component.scss'],
})
export class ScanSampleModalComponent implements AfterViewInit {
  @ViewChild('barcodeInput') barcodeInput!: IonInput;

  barcode = '';
  loading = false;
  receiving = false;
  restoring = false;
  sample: any = null;

  constructor(
    private sampleService: SampleAccessionService,
    private modalCtrl: ModalController,
    private toastService: ToastService
  ) {
    addIcons({
      qrCodeOutline, closeOutline, searchOutline, checkmarkCircleOutline,
      refreshOutline, closeCircleOutline, scanOutline, cameraOutline,
    });
  }

  ngAfterViewInit() {
    setTimeout(() => this.barcodeInput?.setFocus(), 350);
  }

  get isReceived(): boolean {
    return this.sample?.status === 'RECEIVED';
  }

  get patientLine(): string {
    const p = this.sample?.patient;
    if (!p) return '';
    return `${p.title || ''}. ${p.customerName} (${(p.gender || '').toUpperCase()}/${p.age} ${(p.ageType || '').charAt(0).toUpperCase()})`;
  }

  async startScan() {
    if (!Capacitor.isNativePlatform()) {
      this.toastService.warning('Warning', 'Camera scan works only in the mobile app');
      return;
    }
    try {
      const { camera } = await BarcodeScanner.requestPermissions();
      if (camera !== 'granted' && camera !== 'limited') {
        this.toastService.error('Error', 'Camera permission is required');
        return;
      }
      const { barcodes } = await BarcodeScanner.scan();
      const value = barcodes?.[0]?.rawValue;
      if (value) {
        this.barcode = value.trim().toUpperCase();
        this.onScan();
      }
    } catch (e) {
      // scan cancelled by user
    }
  }

  onScan() {
    const code = (this.barcode || '').trim();
    if (!code || this.loading) return;

    this.loading = true;
    this.sampleService.getSampleByBarcode(code).subscribe({
      next: (res) => {
        this.loading = false;
        const item = Array.isArray(res) ? res[0] : res;
        if (!item) {
          this.toastService.error('Error', 'Barcode not found');
          this.resetScan();
          return;
        }
        this.sample = item;
      },
      error: (err) => {
        this.loading = false;
        if (err.status === 404) {
          this.toastService.error('Error', 'Barcode not found');
          this.resetScan();
        } else {
          this.toastService.error('Error', 'Error while checking barcode');
        }
      },
    });
  }

  receiveSample() {
    if (!this.sample || this.receiving) return;
    this.receiving = true;

    const body = {
      sampleAccessionId: this.sample.sampleAccessionId,
      barCode: this.sample.barCode,
      status: 'RECEIVED',
      discardPosition: '0',
      found: false, transfer: false, today: false, urgent: false,
      recievedBy: 0, extraBy: 0, extraMarkedByLabId: 0,
    };

    this.sampleService.updateStatus(this.sample.sampleAccessionId, body).subscribe({
      next: () => {
        this.receiving = false;
        this.toastService.success('Success', 'Sample received successfully');
        this.resetScan();
      },
      error: () => {
        this.receiving = false;
        this.toastService.error('Error', 'Could not receive sample');
      },
    });
  }

  restore() {
    if (!this.sample || this.restoring) return;
    this.restoring = true;

    const body = {
      sampleAccessionId: this.sample.sampleAccessionId,
      barCode: this.sample.barCode,
      status: 'PENDING',
      discardPosition: '0',
      found: false, transfer: false, today: false, urgent: false,
      recievedBy: 0, extraBy: 0, extraMarkedByLabId: 0,
    };

    this.sampleService.updateStatus(this.sample.sampleAccessionId, body).subscribe({
      next: () => {
        this.restoring = false;
        this.toastService.success('Success', 'Sample restored to Pending');
        this.resetScan();
      },
      error: () => {
        this.restoring = false;
        this.toastService.error('Error', 'Could not restore sample');
      },
    });
  }

  resetScan() {
    this.sample = null;
    this.barcode = '';
    setTimeout(() => this.barcodeInput?.setFocus(), 250);
  }

  close() {
    this.modalCtrl.dismiss();
  }
}