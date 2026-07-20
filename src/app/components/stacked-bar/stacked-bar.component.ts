import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stacked-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
<div class="bar-track">

  <div
    *ngIf="received > 0"
    class="seg received"
    [style.width.%]="pct(received)">
  </div>

  <div
    *ngIf="pending > 0"
    class="seg pending"
    [style.width.%]="pct(pending)">
  </div>

  <div
    *ngIf="outSourced > 0"
    class="seg outsourced"
    [style.width.%]="pct(outSourced)">
  </div>

  <div
    *ngIf="rejected > 0"
    class="seg rejected"
    [style.width.%]="pct(rejected)">
  </div>

</div>
`,
  styles: [`
:host{
    display:block;
    width:100%;
    height:18px;
}

.bar-track{
    display:flex;
    width:100%;
    height:100%;
    overflow:hidden;
    border-radius:8px;
    background:#eef2f2;
}

.seg{
    height:100%;
    transition:width .35s ease;
}

.received{
    background:#16866e;
}

.pending{
    background:#f59e0b;
}

.outsourced{
    background:#2563eb;
}

.rejected{
    background:#ef4444;
}
`]
})
export class StackedBarComponent {
  @Input() received = 0;
  @Input() pending = 0;
  @Input() outSourced = 0;
  @Input() rejected = 0;
  @Input() total = 0;

  pct(v: number): number {
    if (!this.total) return 0;
    return Math.min(100, (v / this.total) * 100);
  }
}