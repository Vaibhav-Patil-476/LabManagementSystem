import { Component, Input, OnChanges } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';

@Component({
  selector: 'app-stacked-bar',
  standalone: true,
  imports: [BaseChartDirective],
  template: `<canvas baseChart [data]="chartData" [options]="chartOptions" type="bar"></canvas>`,
  styles: [`:host { display: block; height: 26px; width: 100%; }`]
})
export class StackedBarComponent implements OnChanges {
  @Input() received = 0;
  @Input() pending = 0;
  @Input() rejected = 0;
  @Input() total = 0;

  chartData: ChartConfiguration<'bar'>['data'] = { labels: [''], datasets: [] };
  chartOptions: ChartConfiguration<'bar'>['options'] = {};

  ngOnChanges() {
    const remainder = Math.max(0, this.total - this.received - this.pending - this.rejected);

    this.chartData = {
      labels: [''],
      datasets: [
        { data: [this.received], backgroundColor: '#16866e' },
        { data: [this.pending], backgroundColor: '#bd7d19' },
        { data: [this.rejected], backgroundColor: '#c05262' },
        { data: [remainder], backgroundColor: '#eef2f2' }
      ]
    };

    this.chartOptions = {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { stacked: true, display: false, min: 0, max: this.total || 1 },
        y: { stacked: true, display: false }
      },
      animation: { duration: 400 }
    };
  }
}