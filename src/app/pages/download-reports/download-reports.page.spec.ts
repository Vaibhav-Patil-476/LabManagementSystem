import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DownloadReportsPage } from './download-reports.page';

describe('DownloadReportsPage', () => {
  let component: DownloadReportsPage;
  let fixture: ComponentFixture<DownloadReportsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(DownloadReportsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
