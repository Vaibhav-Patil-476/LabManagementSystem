import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  ToastController,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonIcon,
  IonButton,
  IonSpinner,
  IonBadge,
  IonModal
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  searchOutline,
  calendarOutline,
  refreshOutline,
  documentTextOutline,
  chatbubbleEllipsesOutline,
  closeOutline,
  sendOutline,
  mailUnreadOutline
} from 'ionicons/icons';

import { firstValueFrom } from 'rxjs';
import { LabApiService } from '../../core/services/lab-api';

// ==== API WIRING NOTE ====
// Postman collection varun confirm kelele 4 real endpoints
// (LabApiService madhe add kara — lab-api-clinical-additions.ts baga):
//   getClinicalHistoryList(page, size, search?, startDate?, endDate?)
//   getClinicalHistoryByBookingTest(bookingId, testId)
//   createClinicalHistory({ bookingId, testId, history })
//   updateClinicalHistory(bookingId, clinicalId, payload)
//
// Thread ata BOOKING + TEST level ahe (screenshot cha Booking ID /
// Barcode / Test Name header exact ithe match hoto). ⚠️ Response cha
// exact field-shape Postman madhe nahi (fakt request schema dilay),
// mhanun mapping madhe flexible fallback cascade thevlay — testing
// karun actual field names confirm zalya ki mapXxxItem() tweak kara.

@Component({
  selector: 'app-clinical-history',
  standalone: true,
  templateUrl: './clinical-history.page.html',
  styleUrls: ['./clinical-history.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonIcon,
    IonButton,
    IonSpinner,
    IonBadge,
    IonModal,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule
  ]
})
export class ClinicalHistoryPage implements OnInit, AfterViewChecked {

  allThreads: any[] = [];
  filteredThreads: any[] = [];

  searchTerm = '';
  startDate: string = this.firstDayOfMonth();
  endDate: string = this.today();

  isLoading = false;

  // ---------- thread / chat modal ----------
  isThreadModalOpen = false;
  activeThread: any = null;
  threadMessages: any[] = [];
  isThreadLoading = false;

  newMessage = '';
  isSending = false;

  @ViewChild('chatScroll') chatScroll!: ElementRef<HTMLDivElement>;
  private shouldScrollToBottom = false;

  // ---------- date range picker (cancel-test sarkha) ----------
  @ViewChild('rangePicker') rangePicker!: any;
  rangeStart: Date | null = null;
  rangeEnd: Date | null = null;

  constructor(
    private labApiService: LabApiService,
    private toastCtrl: ToastController
  ) {
    addIcons({
      searchOutline,
      calendarOutline,
      refreshOutline,
      documentTextOutline,
      chatbubbleEllipsesOutline,
      closeOutline,
      sendOutline,
      mailUnreadOutline
    });
  }

  ngOnInit(): void {
    this.loadThreads();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollChatToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  firstDayOfMonth(): string {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  }
  today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // ---------- date range picker helpers (cancel-test sarkha) ----------
  private formatDateForInput(d: Date): string {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  private toDateObj(dateStr: string): Date | null {
    return dateStr ? new Date(dateStr + 'T00:00:00') : null;
  }

  private toDateStr(d: Date | null): string {
    return d ? this.formatDateForInput(d) : '';
  }

  openDateRangePicker(): void {
    this.rangeStart = this.toDateObj(this.startDate);
    this.rangeEnd = this.toDateObj(this.endDate);
    this.rangePicker?.open();
  }

  onRangeStartChange(event: any): void {
    this.rangeStart = event?.value || null;
  }

  onRangeEndChange(event: any): void {
    this.rangeEnd = event?.value || null;

    if (this.rangeStart && this.rangeEnd) {
      this.startDate = this.toDateStr(this.rangeStart);
      this.endDate = this.toDateStr(this.rangeEnd);
      this.loadThreads();
    }
  }

  private formatDate(ms: number | string | null | undefined): string {
    if (!ms) return '-';
    try {
      return new Date(ms).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      });
    } catch {
      return '-';
    }
  }

  private mapMessageItem(raw: any): any {
    return {
      clinicalId: raw?.clinicalId ?? raw?.id,
      senderName: raw?.addedBy ?? raw?.senderName ?? raw?.userName ?? 'User',
      message: raw?.remark ?? raw?.history ?? raw?.message ?? raw?.comment ?? '',
      timestamp: this.formatDate(raw?.created_on ?? raw?.timestamp),
      status: raw?.status ? String(raw.status).toLowerCase() : null, // 'closed' | 'pending' | null
      isMine: !!raw?.isMine || raw?.senderType === 'LAB'
    };
  }

  // ✅ getAll ek "message row per entry" return kartoy — booking+test
  // peksha. Mhanun list madhe card banवण्याआधी bookingId+testId var
  // group karto, jenekarun ekach booking+test chi multiple entries
  // (jasa "need data" + "done sir") EKACH card madhe combine hotil,
  // preview la saglyat latest message dakhavla jail.
  private extractEntry(raw: any): any {
    return {
      bookingId: raw?.bookingId,
      testId: raw?.testId ?? (Array.isArray(raw?.tests) ? raw.tests[0]?.testId : undefined),
      barcode: raw?.barcode ?? raw?.samples?.[0]?.sampleId ?? '',
      testName: raw?.testName ?? '-',
      patientName: raw?.customerName ?? raw?.patientName ?? raw?.name ?? '-',
      message: raw?.history ?? raw?.message ?? raw?.comment ?? raw?.remark ?? raw?.bookingComment ?? '',
      status: (raw?.status ?? 'pending').toString().toLowerCase(),
      createdOn: raw?.created_on ?? raw?.createdOn ?? raw?.timestamp ?? 0,
      senderName: raw?.senderName ?? raw?.userName ?? raw?.createdByName ?? raw?.createdBy ?? 'User'
    };
  }

  async loadThreads() {
    this.isLoading = true;
    try {
      const res: any = await firstValueFrom(
        this.labApiService.getClinicalHistoryList(0, 500, undefined, this.startDate, this.endDate)
      );

      // 👇 DEBUG: he console.log ughdun, tumcha actual field-names
      // baghun mala paste kara — mग mapping exact karto.
      console.log('CLINICAL HISTORY RAW RESPONSE:', res);

      let rawList: any[] = [];
      if (Array.isArray(res)) rawList = res;
      else if (Array.isArray(res?.data)) rawList = res.data;
      else if (Array.isArray(res?.content)) rawList = res.content;
      else if (Array.isArray(res?.data?.content)) rawList = res.data.content;

      // ---- group by bookingId + testId ----
      const grouped = new Map<string, any[]>();
      for (const raw of rawList) {
        const entry = this.extractEntry(raw);
        const key = `${entry.bookingId}_${entry.testId}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(entry);
      }

      this.allThreads = Array.from(grouped.values()).map(entries => {
        entries.sort((a, b) => new Date(a.createdOn).getTime() - new Date(b.createdOn).getTime());
        const latest = entries[entries.length - 1];
        return {
          bookingId: latest.bookingId,
          testId: latest.testId,
          barcode: entries.find(e => e.barcode)?.barcode || '',
          testName: entries.find(e => e.testName && e.testName !== '-')?.testName || '-',
          patientName: entries.find(e => e.patientName && e.patientName !== '-')?.patientName || '-',
          lastMessage: latest.message,
          lastMessageTime: this.formatDate(latest.createdOn),
          status: latest.status,
          unreadCount: 0
        };
      });

      this.applySearch();
    } catch (err) {
      console.error('Clinical history list fetch failed', err);
      this.showToast('Data load karta ala nahi. Parat try kara.', 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  applySearch() {
    if (!Array.isArray(this.allThreads)) this.allThreads = [];
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) {
      this.filteredThreads = [...this.allThreads];
      return;
    }
    this.filteredThreads = this.allThreads.filter(t =>
      t.patientName?.toLowerCase().includes(term) ||
      t.testName?.toLowerCase().includes(term) ||
      t.barcode?.toLowerCase().includes(term) ||
      String(t.bookingId).includes(term)
    );
  }

  async doRefresh(event: any) {
    await this.loadThreads();
    event?.target?.complete();
  }

  // ---------- open thread (card tap) ----------
  async openThread(item: any) {
    this.activeThread = item;
    this.isThreadModalOpen = true;
    this.threadMessages = [];
    this.isThreadLoading = true;

    try {
      const res: any = await firstValueFrom(
        this.labApiService.getClinicalHistoryByBookingTest(item.bookingId, item.testId)
      );

      let rawList: any[] = [];
      if (Array.isArray(res)) rawList = res;
      else if (Array.isArray(res?.data)) rawList = res.data;
      else if (Array.isArray(res?.content)) rawList = res.content;
      else if (res && typeof res === 'object' && !Array.isArray(res)) rawList = [res]; // single-object fallback

      this.threadMessages = rawList.map(raw => this.mapMessageItem(raw));
      this.shouldScrollToBottom = true;
    } catch (err) {
      console.error('Clinical history thread fetch failed', err);
      this.showToast('Thread load karta ala nahi.', 'danger');
    } finally {
      this.isThreadLoading = false;
    }
  }

  closeThread(): void {
    this.isThreadModalOpen = false;
    this.activeThread = null;
    this.threadMessages = [];
    this.newMessage = '';
  }

  async sendMessage() {
    const text = this.newMessage.trim();
    if (!text || !this.activeThread || this.isSending) return;

    this.isSending = true;
    try {
      await firstValueFrom(
        this.labApiService.createClinicalHistory({
          bookingId: this.activeThread.bookingId,
          testId: this.activeThread.testId,
          history: text
        })
      );

      // optimistic UI — apla message lagech thread madhe dakhav
      this.threadMessages.push({
        clinicalId: Date.now(),
        senderName: 'You',
        message: text,
        timestamp: this.formatDate(Date.now()),
        status: 'pending',
        isMine: true
      });
      this.newMessage = '';
      this.shouldScrollToBottom = true;
    } catch (err) {
      console.error('Send clinical history failed', err);
      this.showToast('Message pathvta ala nahi. Parat try kara.', 'danger');
    } finally {
      this.isSending = false;
    }
  }

  private scrollChatToBottom(): void {
    try {
      const el = this.chatScroll?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch {}
  }

  private async showToast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({ message, duration: 2000, color, position: 'top' });
    toast.present();
  }
}