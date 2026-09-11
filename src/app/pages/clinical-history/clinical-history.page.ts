import { Component, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/services/auth';
import { ClinicalHistoryBadgeService } from '../../core/services/clinical-history-badge';
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
  mailUnreadOutline,
    checkmarkCircleOutline
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
export class ClinicalHistoryPage implements  AfterViewChecked {

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
    private toastCtrl: ToastController,
    private authService: AuthService,
     private badgeService: ClinicalHistoryBadgeService
  ) {
    addIcons({
      searchOutline,
      calendarOutline,
      refreshOutline,
      documentTextOutline,
      chatbubbleEllipsesOutline,
      closeOutline,
      sendOutline,
      mailUnreadOutline,
        checkmarkCircleOutline
    });
  }

ionViewWillEnter(): void {
  this.loadThreads();
}

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollChatToBottom();
      this.shouldScrollToBottom = false;
    }
  }

get unreadThreadsCount(): number {
  return this.allThreads.filter(t => t.unreadCount > 0).length;
}

firstDayOfMonth(): string {
  const d = new Date();
  return this.formatDateForInput(new Date(d.getFullYear(), d.getMonth(), 1));
}
today(): string {
  return this.formatDateForInput(new Date());
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
    
    const currentUserId = Number((this.authService.currentUserValue as any)?.raw?.id || 0);
    const isMine = currentUserId > 0 && Number(raw?.created_by) === currentUserId;

    return {
      clinicalId: raw?.clinicalId ?? raw?.id,
      senderName: raw?.addedBy ?? raw?.senderName ?? raw?.userName ?? 'User',
      message: raw?.remark ?? raw?.history ?? raw?.message ?? raw?.comment ?? '',
      timestamp: this.formatDate(raw?.created_on ?? raw?.timestamp),
      status: raw?.status ? String(raw.status).toLowerCase() : null,
      isMine
    };
  }

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
    senderName: raw?.senderName ?? raw?.userName ?? raw?.createdByName ?? raw?.createdBy ?? 'User',
    createdBy: raw?.created_by,               // ✅ NEW
    clinicalId: raw?.clinicalId ?? raw?.id     // ✅ NEW
  };
}
// async loadThreads() {
//   this.isLoading = true;
//   try {
//     const res: any = await firstValueFrom(
//       this.labApiService.getClinicalHistoryList(0, 500, undefined, this.startDate, this.endDate)
//     );

//     console.log('CLINICAL HISTORY RAW RESPONSE:', res);

//     let rawList: any[] = [];
//     if (Array.isArray(res)) rawList = res;
//     else if (Array.isArray(res?.data)) rawList = res.data;
//     else if (Array.isArray(res?.content)) rawList = res.content;
//     else if (Array.isArray(res?.data?.content)) rawList = res.data.content;

//     const grouped = new Map<string, any[]>();
//     for (const raw of rawList) {
//       const entry = this.extractEntry(raw);
//       const key = `${entry.bookingId}_${entry.testId}`;
//       if (!grouped.has(key)) grouped.set(key, []);
//       grouped.get(key)!.push(entry);
//     }

//     const currentUserId = Number((this.authService.currentUserValue as any)?.raw?.id || 0);

//     this.allThreads = Array.from(grouped.values()).map(entries => {
//       entries.sort((a, b) => new Date(a.createdOn).getTime() - new Date(b.createdOn).getTime());
//       const latest = entries[entries.length - 1];

//       const unreadCount = entries.filter(e =>
//         Number(e.createdBy) !== currentUserId &&
//         e.status !== 'closed'
//       ).length;

//       console.log(
//         'Booking', latest.bookingId,
//         '| currentUserId:', currentUserId,
//         '| unreadCount:', unreadCount,
//         '| entries:', entries.map(e => ({ createdBy: e.createdBy, status: e.status }))
//       );

//       return {
//         bookingId: latest.bookingId,
//         testId: latest.testId,
//         barcode: entries.find(e => e.barcode)?.barcode || '',
//         testName: entries.find(e => e.testName && e.testName !== '-')?.testName || '-',
//         patientName: entries.find(e => e.patientName && e.patientName !== '-')?.patientName || '-',
//         lastMessage: latest.message,
//         lastMessageTime: this.formatDate(latest.createdOn),
//         status: latest.status,
//         unreadCount,
//         lastCreatedOn: latest.createdOn   // ✅ NEW — sorting साठी वापरतो
//       };
//     });

//     // ✅ NEW — unread threads सगळ्यात वर (top ला) दाखवा, बाकीचे नवीन-ते-जुने
//     this.allThreads.sort((a, b) => {
//       if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
//       if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
//       return new Date(b.lastCreatedOn).getTime() - new Date(a.lastCreatedOn).getTime();
//     });

//     this.applySearch();

//     // ✅ NEW — dashboard tile साठी total unread (unique bookings) push कर
//     this.badgeService.setUnreadCount(
//       this.allThreads.filter(t => t.unreadCount > 0).length
//     );

//   } catch (err) {
//     console.error('Clinical history list fetch failed', err);
//     this.showToast('Data load karta ala nahi. Parat try kara.', 'danger');
//   } finally {
//     this.isLoading = false;
//   }
// }
  // applySearch() {
  //   if (!Array.isArray(this.allThreads)) this.allThreads = [];
  //   const term = this.searchTerm.trim().toLowerCase();
  //   if (!term) {
  //     this.filteredThreads = [...this.allThreads];
  //     return;
  //   }
  //   this.filteredThreads = this.allThreads.filter(t =>
  //     t.patientName?.toLowerCase().includes(term) ||
  //     t.testName?.toLowerCase().includes(term) ||
  //     t.barcode?.toLowerCase().includes(term) ||
  //     String(t.bookingId).includes(term)
  //   );
  // }

  async loadThreads() {
  this.isLoading = true;
  try {
    const res: any = await firstValueFrom(
      this.labApiService.getClinicalHistoryList(
        0, 500, undefined,
        this.startDate,
        this.nextDay(this.endDate)   // ✅ NEW — end date + 1 day पाठवा, जेणेकरून
                                      //    timezone मुळे उशिरा पडणारे entries सुटणार नाहीत
      )
    );

    console.log('CLINICAL HISTORY RAW RESPONSE:', res);

    let rawList: any[] = [];
    if (Array.isArray(res)) rawList = res;
    else if (Array.isArray(res?.data)) rawList = res.data;
    else if (Array.isArray(res?.content)) rawList = res.content;
    else if (Array.isArray(res?.data?.content)) rawList = res.data.content;

    const grouped = new Map<string, any[]>();
    for (const raw of rawList) {
      const entry = this.extractEntry(raw);
      const key = `${entry.bookingId}_${entry.testId}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(entry);
    }

    const currentUserId = Number((this.authService.currentUserValue as any)?.raw?.id || 0);

    this.allThreads = Array.from(grouped.values()).map(entries => {
      entries.sort((a, b) => new Date(a.createdOn).getTime() - new Date(b.createdOn).getTime());
      const latest = entries[entries.length - 1];

      const unreadCount = entries.filter(e =>
        Number(e.createdBy) !== currentUserId &&
        e.status !== 'closed'
      ).length;

      console.log(
        'Booking', latest.bookingId,
        '| currentUserId:', currentUserId,
        '| unreadCount:', unreadCount,
        '| entries:', entries.map(e => ({ createdBy: e.createdBy, status: e.status }))
      );

      return {
        bookingId: latest.bookingId,
        testId: latest.testId,
        barcode: entries.find(e => e.barcode)?.barcode || '',
        testName: entries.find(e => e.testName && e.testName !== '-')?.testName || '-',
        patientName: entries.find(e => e.patientName && e.patientName !== '-')?.patientName || '-',
        lastMessage: latest.message,
        lastMessageTime: this.formatDate(latest.createdOn),
        status: latest.status,
        unreadCount,
        lastCreatedOn: latest.createdOn
      };
    });

    this.allThreads.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      return new Date(b.lastCreatedOn).getTime() - new Date(a.lastCreatedOn).getTime();
    });

    this.applySearch();

    this.badgeService.setUnreadCount(
      this.allThreads.filter(t => t.unreadCount > 0).length
    );

  } catch (err) {
    console.error('Clinical history list fetch failed', err);
    this.showToast('Data load karta ala nahi. Parat try kara.', 'danger');
  } finally {
    this.isLoading = false;
  }
}

  async doRefresh(event: any) {
    await this.loadThreads();
    event?.target?.complete();
  }

  // ---------- open thread (card tap) ----------
  // async openThread(item: any) {
  //   this.activeThread = item;
  //   this.isThreadModalOpen = true;
  //   this.threadMessages = [];
  //   this.isThreadLoading = true;

  //   try {
  //     const res: any = await firstValueFrom(
  //       this.labApiService.getClinicalHistoryByBookingTest(item.bookingId, item.testId)
  //     );

  //     let rawList: any[] = [];
  //     if (Array.isArray(res)) rawList = res;
  //     else if (Array.isArray(res?.data)) rawList = res.data;
  //     else if (Array.isArray(res?.content)) rawList = res.content;
  //     else if (res && typeof res === 'object' && !Array.isArray(res)) rawList = [res]; // single-object fallback

  //     this.threadMessages = rawList.map(raw => this.mapMessageItem(raw));
  //     this.shouldScrollToBottom = true;
  //   } catch (err) {
  //     console.error('Clinical history thread fetch failed', err);
  //     this.showToast('Thread load karta ala nahi.', 'danger');
  //   } finally {
  //     this.isThreadLoading = false;
  //   }
  // }

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
      else if (res && typeof res === 'object' && !Array.isArray(res)) rawList = [res];

      this.threadMessages = rawList.map(raw => this.mapMessageItem(raw));
      this.shouldScrollToBottom = true;

      // ✅ NEW: दुसऱ्या बाजूने पाठवलेले "pending" messages — आत्ता
      // बघितले गेले, म्हणून त्यांना "closed" मार्क करायचं (SMS
      // "seen" सारखं).
      this.markIncomingMessagesSeen(rawList, item.bookingId, item.testId);

    } catch (err) {
      console.error('Clinical history thread fetch failed', err);
      this.showToast('Thread load karta ala nahi.', 'danger');
    } finally {
      this.isThreadLoading = false;
    }
  }

private async markIncomingMessagesSeen(rawList: any[], bookingId: number, testId: number): Promise<void> {
  const currentUserId = Number((this.authService.currentUserValue as any)?.raw?.id || 0);
  if (!currentUserId) return;

  // 👇 DEBUG — कोण बंद होणार आहे ते आधी बघ, फील्ड नाव confirm करण्यासाठी
  console.log('markIncomingMessagesSeen | currentUserId:', currentUserId);
  console.log('rawList:', rawList.map(r => ({
    clinicalId: r.clinicalId ?? r.id,
    created_by: r.created_by,
    createdBy: r.createdBy,
    status: r.status
  })));

const toClose = rawList.filter((raw: any) => {
  const rawCreatedBy = Number(raw?.created_by ?? raw?.createdBy ?? NaN);
  const isOpen = String(raw?.status || '').toLowerCase() !== 'closed';
  const isMine = !isNaN(rawCreatedBy) && rawCreatedBy === currentUserId;
  return !isMine && !isNaN(rawCreatedBy) && isOpen;
});
  console.log('toClose (यांना बंद करणार):', toClose);   // 👈 DEBUG

  if (toClose.length === 0) return;

  for (const raw of toClose) {
    try {
      const existingText = raw?.remark ?? raw?.history ?? raw?.message ?? raw?.comment ?? '';
      await firstValueFrom(
        this.labApiService.updateClinicalHistory(bookingId, raw.clinicalId, {
          status: 'closed',
          remark: existingText,
          history: existingText,
          comment: existingText,
          message: existingText
        })
      );
    } catch (err) {
      console.error('Mark-as-seen failed for clinicalId', raw?.clinicalId, err);
    }
  }

  // Local UI मध्ये लगेच reflect करा (परत fetch ची वाट न बघता)
  const closedIds = new Set(toClose.map((r: any) => r.clinicalId));
  this.threadMessages = this.threadMessages.map(m =>
    closedIds.has(m.clinicalId) ? { ...m, status: 'closed' } : m
  );

  this.patchThreadPreview(bookingId, testId);
}

 private patchThreadPreview(bookingId: number, testId: number): void {
  const idx = this.allThreads.findIndex(
    (t: any) => t.bookingId === bookingId && t.testId === testId
  );
  if (idx === -1) return;

  const last = this.threadMessages[this.threadMessages.length - 1];
  if (!last) return;

  const updated = {
    ...this.allThreads[idx],
    lastMessage: last.message,
    lastMessageTime: last.timestamp,
    status: last.status || this.allThreads[idx].status,
    unreadCount: 0   // ✅ NEW — thread opened/seen, clear its badge
  };

  this.allThreads = [
    ...this.allThreads.slice(0, idx),
    updated,
    ...this.allThreads.slice(idx + 1)
  ];

  this.applySearch();
}

  closeThread(): void {
    this.isThreadModalOpen = false;
    this.activeThread = null;
    this.threadMessages = [];
    this.newMessage = '';
  }

//  async sendMessage() {
//   const text = this.newMessage.trim();
//   if (!text || !this.activeThread || this.isSending) return;

//   const { bookingId, testId } = this.activeThread;

//   this.isSending = true;
//   try {
//     await firstValueFrom(
//       this.labApiService.createClinicalHistory({
//         bookingId,
//         testId,
//         remark: text,
//         history: text,
//         comment: text,
//         message: text
//       })
//     );

//     // optimistic UI — apla message lagech thread madhe dakhav
//     this.threadMessages.push({
//       clinicalId: Date.now(),
//       senderName: 'You',
//       message: text,
//       timestamp: this.formatDate(Date.now()),
//       status: 'pending',
//       isMine: true
//     });
//     this.newMessage = '';
//     this.shouldScrollToBottom = true;
//   } catch (err) {
//     console.error('Send clinical history failed', err);
//     this.showToast('Message pathvta ala nahi. Parat try kara.', 'danger');
//   } finally {
//     this.isSending = false;
//   }
// }

async sendMessage() {
  const text = this.newMessage.trim();
  if (!text || !this.activeThread || this.isSending) return;

  const { bookingId, testId } = this.activeThread;

  this.isSending = true;
  try {
    const res: any = await firstValueFrom(
      this.labApiService.createClinicalHistory({
        bookingId,
        testId,
        remark: text,
        history: text,
        comment: text,
        message: text
      })
    );

    console.log('SEND MESSAGE RESPONSE:', res);

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

    // ✅ NEW — list card चा preview लगेच update करा
    this.patchThreadPreview(bookingId, testId);

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

  showOnlyUnread = false;

toggleUnreadFilter(): void {
  this.showOnlyUnread = !this.showOnlyUnread;
  this.applySearch();
}

applySearch() {
  if (!Array.isArray(this.allThreads)) this.allThreads = [];
  const term = this.searchTerm.trim().toLowerCase();

  let base = this.allThreads;
  if (this.showOnlyUnread) {
    base = base.filter(t => t.unreadCount > 0);   // ✅ NEW
  }

  if (!term) {
    this.filteredThreads = [...base];
    return;
  }
  this.filteredThreads = base.filter(t =>
    t.patientName?.toLowerCase().includes(term) ||
    t.testName?.toLowerCase().includes(term) ||
    t.barcode?.toLowerCase().includes(term) ||
    String(t.bookingId).includes(term)
  );
}

private nextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return this.formatDateForInput(d);
}
}