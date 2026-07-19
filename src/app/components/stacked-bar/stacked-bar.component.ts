import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stacked-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bar-track">
      <div class="seg" [style.width.%]="pct(received)" style="background:#16866e"></div>
      <div class="seg" [style.width.%]="pct(pending)" style="background:#2563eb"></div>
      <div class="seg" [style.width.%]="pct(outSourced)" style="background:#7856c9"></div>
      <div class="seg" [style.width.%]="pct(rejected)" style="background:#c05262"></div>
    </div>
  `,
  styles: [`
    :host { display:block; height:8px; width:100%; }
    .bar-track { display:flex; height:100%; width:100%; background:#eef2f2; border-radius:4px; overflow:hidden; }
    .seg { height:100%; transition: width .2s ease; }
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