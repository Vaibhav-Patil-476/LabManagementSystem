import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { ChatMessage, DashboardVoiceService } from './dashboard-voice.service';
import { GeminiLiveService } from './gemini-live';

/**
 * Dashboard var floating chat box (button -> panel).
 * Usage:  <app-voice-chat-box></app-voice-chat-box>   (dashboard page chya template madhe, ion-content nantar)
 * Panel ughadla ki mic + AI automatically suru hoto, band kela ki thambto.
 * Footer madhe Start / Stop button: AI chalu-band karto, chat tasach rahto.
 */
@Component({
  selector: 'app-voice-chat-box',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- ============ Floating button ============ -->
    <div *ngIf="!(voice.open$ | async)" class="fab-wrap">
      <!-- Speech-bubble tooltips (fade in / out, loop) -->
      <span class="tip tip-a" aria-hidden="true">Ask me about bookings or reports. ⚡</span>
      <span class="tip tip-b" aria-hidden="true">Hi ⚡ How can I help you?</span>

      <button type="button" class="fab" (click)="voice.openChat()" aria-label="Open ILS AI voice assistant">
        <span class="fab-glow" aria-hidden="true"></span>
        <span class="fab-body">
          <svg class="spark" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path class="spark-big" d="M10 3l1.9 5.1L17 10l-5.1 1.9L10 17l-1.9-5.1L3 10l5.1-1.9z" fill="currentColor"></path>
            <path class="spark-small" d="M18.5 14l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor"></path>
          </svg>
          <span class="fab-label">ILS AI</span>
        </span>
      </button>
    </div>

    <!-- ============ Panel ============ -->
    <section *ngIf="voice.open$ | async" class="panel" role="dialog" aria-label="AI Assistant"
      [attr.data-state]="voice.state$ | async">

      <div class="grabber" aria-hidden="true"></div>

      <header class="header">
        <div class="orb" aria-hidden="true">
          <span class="orb-core"></span>
          <span class="orb-ring r1"></span>
          <span class="orb-ring r2"></span>
        </div>

        <div class="title">
          <strong>AI Assistant</strong>
          <span class="chip" [attr.data-state]="voice.state$ | async">
            <i class="dot"></i>{{ stateText(voice.state$ | async) }}
          </span>
        </div>

        <button type="button" class="icon-btn" (click)="voice.closeChat()" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2"
            stroke-linecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18"></path>
          </svg>
        </button>
      </header>

      <div class="body" #body>
        <ng-container *ngFor="let m of voice.messages$ | async; trackBy: trackById">

          <!-- Booking card -->
          <article *ngIf="m.card as c" class="card">
            <div class="card-head">
              <span class="avatar">{{ initial(c.patientName) }}</span>
              <div class="who">
                <span class="pname">{{ c.patientName || 'Patient' }}</span>
                <span class="pid">#{{ c.bookingId }}</span>
              </div>
            </div>

            <!-- Sample / Report (overall): Pending, Received, Ready -->
            <div class="summary">
              <div class="sum-item">
                <span class="sum-label">Sample</span>
                <span class="badge" [ngClass]="cls(c.sampleStatus)">{{ label(c.sampleStatus) }}</span>
              </div>
              <div class="sum-item">
                <span class="sum-label">Report</span>
                <span class="badge" [ngClass]="cls(c.reportStatus)">{{ label(c.reportStatus) }}</span>
              </div>
            </div>

            <!-- Test-wise status: Booking Status page sarkhach (SNR / IN PROCESS / COMPLETE ...) -->
            <div class="tests" *ngIf="c.tests.length">
              <div class="trow" *ngFor="let t of c.tests">
                <span class="tn" [title]="t.name">{{ t.name }}</span>
                <span class="tbadge" [ngClass]="testCls(t.reportStatus)">{{ testLabel(t.reportStatus) }}</span>
              </div>
            </div>
          </article>

          <!-- Chat bubbles -->
          <div *ngIf="!m.card && m.role !== 'notice'" class="bubble" [class.user]="m.role === 'user'">
            {{ m.text.trim() }}
          </div>

          <!-- Notice -->
          <div *ngIf="!m.card && m.role === 'notice'" class="notice">{{ m.text }}</div>
        </ng-container>

        <!-- Empty state -->
        <div class="empty" *ngIf="!(voice.messages$ | async)?.length">
          <div class="empty-orb" aria-hidden="true"></div>
          <p class="empty-title">How can I help?</p>
          <p class="empty-sub">Speak in English, Hindi or Marathi</p>
          <div class="examples">
            <span>"What's the status of booking 12345?"</span>
            <span>"Download report Ajay Thakur"</span>
          </div>
        </div>
      </div>

      <footer class="footer">
        <div class="wave" [attr.data-state]="voice.state$ | async" aria-hidden="true">
          <i></i><i></i><i></i><i></i><i></i>
        </div>
        <span class="state-text">{{ stateText(voice.state$ | async) }}</span>

        <!-- Start / Stop -->
        <button type="button" class="toggle" [class.on]="!isIdle(voice.state$ | async)"
          (click)="toggleVoice()"
          [attr.aria-label]="isIdle(voice.state$ | async) ? 'Start voice' : 'Stop voice'">
          <ng-container *ngIf="isIdle(voice.state$ | async); else stopTpl">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3"></rect>
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3"></path>
            </svg>
            Start
          </ng-container>
          <ng-template #stopTpl>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="2.5"></rect>
            </svg>
            Stop
          </ng-template>
        </button>

        <button type="button" class="clear" (click)="voice.clear()" aria-label="Clear chat">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18"></path>
            <path d="M8 6V4h8v2"></path>
            <path d="M6 6l1 14h10l1-14"></path>
          </svg>
          Clear
        </button>
      </footer>
    </section>
  `,
  styles: [`
    :host {
      --blue-1: #2563eb;
      --blue-2: #4f8cff;
      --violet: #7c5cff;
      --bg: #f6f8fc;
      --surface: #ffffff;
      --border: #e5eaf3;
      --text: #0f172a;
      --muted: #64748b;
      --ai-bubble: #ffffff;
      --shadow: 0 18px 50px rgba(15, 23, 42, .22), 0 2px 8px rgba(15, 23, 42, .08);

      position: fixed;
      right: 16px;
      bottom: calc(90px + env(safe-area-inset-bottom));
      z-index: 10000;
      font-family: inherit;
    }

    @media (prefers-color-scheme: dark) {
      :host {
        --bg: #0f1623;
        --surface: #172033;
        --border: #263148;
        --text: #e8edf7;
        --muted: #92a0b8;
        --ai-bubble: #1d2940;
        --shadow: 0 18px 50px rgba(0, 0, 0, .55);
      }
    }

    /* ---------- Floating button ---------- */
    .fab-wrap { position: relative; display: flex; justify-content: flex-end; }

    /* Pill button: [sparkle] ILS AI */
    .fab {
      position: relative;
      height: 48px; padding: 0; border: 0; border-radius: 999px;
      color: #fff; cursor: pointer; background: transparent;
      transition: transform .18s ease;
      -webkit-tap-highlight-color: transparent;
    }
    .fab:active { transform: scale(.95); }

    /* soft blurred halo around the pill, pulses (as in the reference video) */
    .fab-glow {
      position: absolute; inset: -6px; border-radius: 999px;
      background: linear-gradient(135deg, #38bdf8, var(--blue-1) 60%, var(--violet));
      filter: blur(11px); opacity: .55;
      animation: halo 2.6s ease-in-out infinite;
    }
    @keyframes halo {
      0%, 100% { transform: scale(.96); opacity: .38; }
      50%      { transform: scale(1.1);  opacity: .75; }
    }

    .fab-body {
      position: relative; z-index: 1;
      height: 100%; padding: 0 20px 0 15px;
      display: flex; align-items: center; gap: 8px;
      border-radius: 999px;
      background: linear-gradient(135deg, #38bdf8 0%, var(--blue-1) 62%, #3b6cf0 100%);
      border: 1px solid rgba(255, 255, 255, .45);
      box-shadow: 0 8px 22px rgba(37, 99, 235, .4), inset 0 1px 0 rgba(255, 255, 255, .5);
    }
    /* light sweep across the pill */
    .fab-body::after {
      content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
      background: linear-gradient(110deg, transparent 35%, rgba(255, 255, 255, .35) 50%, transparent 65%);
      background-size: 250% 100%; background-position: 150% 0;
      animation: sweep 4.8s ease-in-out infinite;
    }
    @keyframes sweep {
      0%, 55%  { background-position: 150% 0; }
      100%     { background-position: -50% 0; }
    }

    .fab-label {
      font-size: 15px; font-weight: 800; letter-spacing: .6px; line-height: 1;
      text-shadow: 0 1px 2px rgba(15, 23, 42, .25);
    }
    .spark { flex: none; filter: drop-shadow(0 0 4px rgba(255, 255, 255, .7)); }
    .spark-big   { transform-origin: 10px 10px;   animation: twinkle 2.2s ease-in-out infinite; }
    .spark-small { transform-origin: 18.5px 17px; animation: twinkle 2.2s ease-in-out .7s infinite; }
    @keyframes twinkle {
      0%, 100% { transform: scale(1);   opacity: 1; }
      50%      { transform: scale(.65); opacity: .6; }
    }

    /* Speech-bubble tooltips above the pill */
    .tip {
      position: absolute; right: 4px; bottom: calc(100% + 14px);
      white-space: nowrap; pointer-events: none;
      padding: 8px 14px; border-radius: 14px;
      font-size: 12.5px; font-weight: 600; color: var(--blue-1);
      background: var(--surface); border: 1px solid var(--border);
      box-shadow: 0 8px 22px rgba(15, 23, 42, .16);
      opacity: 0; transform: translateY(8px) scale(.96);
      transform-origin: bottom right;
    }
    .tip::after {
      content: ''; position: absolute; right: 22px; bottom: -6px;
      width: 10px; height: 10px; transform: rotate(45deg);
      background: var(--surface);
      border-right: 1px solid var(--border); border-bottom: 1px solid var(--border);
    }
    .tip-a { animation: tipA 14s ease-in-out infinite; }
    .tip-b { animation: tipB 14s ease-in-out infinite; }
    @keyframes tipA {
      0%, 6%    { opacity: 0; transform: translateY(8px) scale(.96); }
      12%, 38%  { opacity: 1; transform: none; }
      44%, 100% { opacity: 0; transform: translateY(8px) scale(.96); }
    }
    @keyframes tipB {
      0%, 52%   { opacity: 0; transform: translateY(8px) scale(.96); }
      58%, 88%  { opacity: 1; transform: none; }
      94%, 100% { opacity: 0; transform: translateY(8px) scale(.96); }
    }

    /* ---------- Panel ---------- */
    .panel {
      width: min(380px, calc(100vw - 32px));
      height: min(560px, 72vh);
      display: flex; flex-direction: column;
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 22px;
      box-shadow: var(--shadow);
      overflow: hidden;
      transform-origin: bottom right;
      animation: pop .26s cubic-bezier(.2, .9, .3, 1.1);
    }
    @keyframes pop {
      from { opacity: 0; transform: translateY(14px) scale(.96); }
      to   { opacity: 1; transform: none; }
    }
    .grabber { display: none; }

    /* ---------- Header ---------- */
    .header {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 14px 14px 16px;
      color: #fff;
      background:
        radial-gradient(120% 140% at 0% 0%, rgba(255, 255, 255, .22), transparent 55%),
        linear-gradient(135deg, var(--blue-2), var(--blue-1) 60%, var(--violet));
    }
    .title { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .title strong { font-size: 16px; font-weight: 700; letter-spacing: .2px; }
    .chip {
      align-self: flex-start;
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 11px; font-weight: 600;
      padding: 2px 9px 2px 7px; border-radius: 999px;
      background: rgba(255, 255, 255, .2);
      backdrop-filter: blur(6px);
    }
    .chip .dot { width: 7px; height: 7px; border-radius: 50%; background: #cbd5e1; }
    .chip[data-state='listening'] .dot { background: #4ade80; box-shadow: 0 0 0 0 rgba(74, 222, 128, .7); animation: blink 1.4s infinite; }
    .chip[data-state='speaking'] .dot { background: #fde047; animation: blink .9s infinite; }
    .chip[data-state='connecting'] .dot { background: #fdba74; animation: blink .8s infinite; }
    @keyframes blink {
      0%   { box-shadow: 0 0 0 0 rgba(255, 255, 255, .55); }
      100% { box-shadow: 0 0 0 7px rgba(255, 255, 255, 0); }
    }

    .icon-btn {
      width: 34px; height: 34px; border-radius: 12px; border: 0;
      display: grid; place-items: center; cursor: pointer; color: #fff;
      background: rgba(255, 255, 255, .18);
      transition: background .15s;
    }
    .icon-btn:hover { background: rgba(255, 255, 255, .3); }

    /* ---------- Orb ---------- */
    .orb { position: relative; width: 40px; height: 40px; flex: none; }
    .orb-core {
      position: absolute; inset: 7px; border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #fff, #bcd3ff 60%, #8aa9ff);
      box-shadow: 0 0 14px rgba(255, 255, 255, .7);
    }
    .orb-ring {
      position: absolute; inset: 3px; border-radius: 50%;
      border: 1.5px solid rgba(255, 255, 255, .6);
      opacity: 0;
    }
    .panel[data-state='listening'] .orb-ring.r1 { animation: orb 1.8s ease-out infinite; }
    .panel[data-state='listening'] .orb-ring.r2 { animation: orb 1.8s ease-out .9s infinite; }
    .panel[data-state='speaking'] .orb-core { animation: breathe .7s ease-in-out infinite alternate; }
    .panel[data-state='speaking'] .orb-ring.r1 { animation: orb 1.1s ease-out infinite; }
    .panel[data-state='speaking'] .orb-ring.r2 { animation: orb 1.1s ease-out .55s infinite; }
    @keyframes orb {
      0%   { transform: scale(.9); opacity: .9; }
      100% { transform: scale(1.5); opacity: 0; }
    }
    @keyframes breathe { to { transform: scale(1.18); } }

    /* ---------- Body ---------- */
    .body {
      flex: 1; overflow-y: auto; overscroll-behavior: contain;
      padding: 14px 12px;
      display: flex; flex-direction: column; gap: 10px;
      scroll-behavior: smooth;
    }
    .body::-webkit-scrollbar { width: 6px; }
    .body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 6px; }

    .bubble, .card, .notice { animation: rise .22s ease both; }
    @keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

    .bubble {
      max-width: 84%;
      padding: 9px 13px;
      font-size: 14px; line-height: 1.45;
      color: var(--text);
      background: var(--ai-bubble);
      border: 1px solid var(--border);
      border-radius: 16px 16px 16px 5px;
      align-self: flex-start;
      box-shadow: 0 1px 2px rgba(15, 23, 42, .05);
      word-break: break-word;
    }
    .bubble.user {
      align-self: flex-end;
      color: #fff; border: 0;
      background: linear-gradient(135deg, var(--blue-2), var(--blue-1));
      border-radius: 16px 16px 5px 16px;
      box-shadow: 0 4px 12px rgba(37, 99, 235, .3);
    }
    .notice {
      align-self: center;
      font-size: 12px; font-weight: 500;
      color: #b42318; background: #fee4e2;
      padding: 5px 12px; border-radius: 999px;
    }

    /* ---------- Empty state ---------- */
    .empty { margin: auto; text-align: center; padding: 10px 18px; }
    .empty-orb {
      width: 64px; height: 64px; margin: 0 auto 12px; border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #fff, #bcd3ff 55%, var(--blue-2));
      box-shadow: 0 10px 30px rgba(79, 140, 255, .45);
      animation: breathe 1.6s ease-in-out infinite alternate;
    }
    .empty-title { margin: 0; font-size: 16px; font-weight: 700; }
    .empty-sub { margin: 4px 0 14px; font-size: 13px; color: var(--muted); }
    .examples { display: flex; flex-direction: column; gap: 6px; align-items: center; }
    .examples span {
      font-size: 12px; color: var(--muted);
      padding: 6px 12px; border-radius: 999px;
      background: var(--surface); border: 1px solid var(--border);
    }

    /* ---------- Booking card ---------- */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 12px;
      font-size: 13px;
      box-shadow: 0 6px 18px rgba(15, 23, 42, .06);
    }
    .card-head { display: flex; align-items: center; gap: 10px; }
    .avatar {
      width: 36px; height: 36px; border-radius: 12px; flex: none;
      display: grid; place-items: center;
      font-weight: 700; color: #fff;
      background: linear-gradient(135deg, var(--blue-2), var(--violet));
    }
    .who { display: flex; flex-direction: column; min-width: 0; }
    .pname { font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: .2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pid { font-size: 12px; color: var(--muted); }

    .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
    .sum-item {
      display: flex; flex-direction: column; gap: 6px;
      padding: 8px 10px; border-radius: 12px;
      background: var(--bg); border: 1px solid var(--border);
    }
    .sum-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px; color: var(--muted); }

    .tests { margin-top: 10px; border-top: 1px dashed var(--border); padding-top: 8px; display: flex; flex-direction: column; gap: 6px; }
    .trow { display: flex; align-items: center; gap: 8px; }
    .tn { flex: 1; min-width: 0; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Sample / Report (overall) badges */
    .badge {
      display: inline-block; align-self: flex-start;
      padding: 3px 10px; border-radius: 999px;
      font-size: 12px; font-weight: 700;
      background: #e8edf5; color: #334155;
    }
    .badge.ok   { background: #d9f7e5; color: #12683a; }
    .badge.warn { background: #fff1c2; color: #8a5a00; }
    .badge.info { background: #dbe8ff; color: #1d4fb8; }
    .badge.bad  { background: #fddede; color: #a3201b; }
    .badge.snr { background: #6d3fc0; color: #fff; }

    /* Test-wise badge: Booking Status page sarkhe rang, hamesha UPPERCASE */
    .tbadge {
      flex: none;
      min-width: 74px; text-align: center;
      padding: 3px 9px; border-radius: 999px;
      font-size: 10px; font-weight: 800; letter-spacing: .4px;
      text-transform: uppercase; white-space: nowrap;
      background: #e8edf5; color: #334155;
    }
    .tbadge.badge-snr       { background: #6d3fc0; color: #fff; }
    .tbadge.badge-ready     { background: #d9f7e5; color: #12683a; }
    .tbadge.badge-inprocess { background: #dbe8ff; color: #1d4fb8; }
    .tbadge.badge-pending   { background: #fff1c2; color: #8a5a00; }
    .tbadge.badge-cancel    { background: #fddede; color: #a3201b; }
    .tbadge.badge-clinical  { background: #cdf3f0; color: #0f5f5a; }
    .tbadge.badge-recheck   { background: #ffe2c7; color: #9a4a00; }
    .tbadge.badge-outsource { background: #fbd9ec; color: #9b1c63; }

    @media (prefers-color-scheme: dark) {
      .badge { background: #26334d; color: #cbd5e1; }
      .badge.ok   { background: #123a27; color: #86efac; }
      .badge.warn { background: #3d2f0a; color: #fde68a; }
      .badge.info { background: #14305f; color: #a8c7ff; }
      .badge.bad  { background: #4a1816; color: #fca5a5; }

      .tbadge { background: #26334d; color: #cbd5e1; }
      .tbadge.badge-snr       { background: #7c52d6; color: #fff; }
      .tbadge.badge-ready     { background: #123a27; color: #86efac; }
      .tbadge.badge-inprocess { background: #14305f; color: #a8c7ff; }
      .tbadge.badge-pending   { background: #3d2f0a; color: #fde68a; }
      .tbadge.badge-cancel    { background: #4a1816; color: #fca5a5; }
      .tbadge.badge-clinical  { background: #0f3a37; color: #7ee3da; }
      .tbadge.badge-recheck   { background: #4a2a0a; color: #fdba74; }
      .tbadge.badge-outsource { background: #4a1535; color: #f9a8d4; }
    }

    /* ---------- Footer ---------- */
    .footer {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
      background: var(--surface);
      border-top: 1px solid var(--border);
    }
    .state-text { flex: 1; font-size: 12.5px; font-weight: 600; color: var(--muted); }
    .wave { display: flex; align-items: center; gap: 3px; height: 18px; }
    .wave i {
      width: 3px; height: 5px; border-radius: 3px;
      background: var(--muted); opacity: .5;
      transition: background .2s;
    }
    .wave[data-state='listening'] i { background: #16a34a; opacity: 1; animation: bars 1s ease-in-out infinite; }
    .wave[data-state='speaking'] i  { background: var(--blue-1); opacity: 1; animation: bars .7s ease-in-out infinite; }
    .wave i:nth-child(2) { animation-delay: .12s !important; }
    .wave i:nth-child(3) { animation-delay: .24s !important; }
    .wave i:nth-child(4) { animation-delay: .36s !important; }
    .wave i:nth-child(5) { animation-delay: .48s !important; }
    @keyframes bars { 0%, 100% { height: 5px; } 50% { height: 18px; } }

    /* Start / Stop */
    .toggle {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 14px; border-radius: 999px; cursor: pointer;
      font-size: 12.5px; font-weight: 700; color: #fff; border: 0;
      background: linear-gradient(135deg, var(--blue-2), var(--blue-1));
      box-shadow: 0 4px 12px rgba(37, 99, 235, .3);
      transition: transform .12s;
    }
    .toggle:active { transform: scale(.96); }
    .toggle.on {
      background: linear-gradient(135deg, #f87171, #dc2626);
      box-shadow: 0 4px 12px rgba(220, 38, 38, .3);
    }

    .clear {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: 999px; cursor: pointer;
      font-size: 12.5px; font-weight: 600; color: var(--blue-1);
      background: transparent; border: 1px solid var(--border);
      transition: background .15s;
    }
    .clear:hover { background: var(--bg); }

    /* ---------- Mobile: bottom sheet ---------- */
    @media (max-width: 520px) {
      .panel {
        position: fixed; left: 0; right: 0; bottom: 0;
        width: 100%; height: 78vh;
        border-radius: 24px 24px 0 0;
        border-bottom: 0;
        transform-origin: bottom center;
        animation: sheet .3s cubic-bezier(.2, .9, .3, 1);
      }
      .grabber {
        display: block; height: 4px; width: 40px; margin: 8px auto 0;
        border-radius: 4px; background: rgba(255, 255, 255, .55);
        position: absolute; left: 50%; top: 0; transform: translateX(-50%); z-index: 1;
      }
      .header { padding-top: 20px; }
    }
    @keyframes sheet { from { transform: translateY(100%); } to { transform: none; } }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
    }
  `]
})
export class VoiceChatBoxComponent implements OnInit, OnDestroy {
  @ViewChild('body') body?: ElementRef<HTMLDivElement>;
  private sub?: Subscription;

  constructor(
    public voice: DashboardVoiceService,
    private live: GeminiLiveService
  ) {}

  ngOnInit(): void {
    // navin message aala ki khali scroll
    this.sub = this.voice.messages$.subscribe(() =>
      setTimeout(() => {
        const el = this.body?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      })
    );
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.voice.closeChat();
  }

  trackById(_: number, m: ChatMessage): number {
    return m.id;
  }

  initial(name: string): string {
    return (name || '?').trim().charAt(0).toUpperCase() || '?';
  }

  isIdle(s: string | null): boolean {
    return !s || s === 'idle';
  }

  /**
   * Start / Stop. Service madhe kahich add karaychi garaj nahi:
   *  - Stop : GeminiLiveService (singleton) la direct stop(). Chat tasach rahto.
   *  - Start: jhunach openChat() (to AI suru karto). Click handler madhunach call hoto,
   *           mhanje mic/speaker gesture madhe suru hotat.
   */
  toggleVoice(): void {
    if (this.isIdle(this.live.state$.value)) {
      void this.voice.openChat();
    } else {
      this.live.stop();
    }
  }

  stateText(s: string | null): string {
    switch (s) {
      case 'connecting': return 'Connecting…';
      case 'listening': return 'Listening';
      case 'speaking': return 'Speaking';
      default: return 'Stopped';
    }
  }

  /* ---------- Sample / Report (overall) badge: Pending, Received, Ready ---------- */

label(s: string): string {
  const map: Record<string, string> = {
    SNR: 'SNR', PENDING: 'Pending', COMPLETE: 'Complete', READY: 'Complete',
    CLINICAL: 'Clinical', CANCELLED: 'Cancel'
  };
  return map[(s || '').toUpperCase()] || 'Pending';
}

cls(s: string): string {
  switch ((s || '').toUpperCase()) {
    case 'COMPLETE': case 'READY': return 'ok';
    case 'PENDING': return 'warn';
    case 'SNR': return 'snr';
    case 'CLINICAL': return 'info';
    case 'CANCELLED': return 'bad';
    default: return '';
  }
}
  /* ---------- Test-wise badge: Booking Status page sarkhach ---------- */

  testLabel(s?: string): string {
    const map: Record<string, string> = {
      SNR: 'SNR',
      IN_PROCESS: 'IN PROCESS',
      READY: 'COMPLETE',
      PENDING: 'PENDING',
      CLINICAL: 'CLINICAL',
      RECHECK_HOLD: 'RECHECK & HOLD',
      OUTSOURCE: 'OUTSOURCE',
      CANCELLED: 'CANCEL'
    };
    return map[(s || '').toUpperCase()] || 'PENDING';
  }

  testCls(s?: string): string {
    const map: Record<string, string> = {
      SNR: 'badge-snr',
      IN_PROCESS: 'badge-inprocess',
      READY: 'badge-ready',
      PENDING: 'badge-pending',
      CLINICAL: 'badge-clinical',
      RECHECK_HOLD: 'badge-recheck',
      OUTSOURCE: 'badge-outsource',
      CANCELLED: 'badge-cancel'
    };
    return map[(s || '').toUpperCase()] || 'badge-pending';
  }
}