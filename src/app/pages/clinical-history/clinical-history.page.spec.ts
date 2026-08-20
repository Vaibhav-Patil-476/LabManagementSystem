import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ClinicalHistoryPage } from './clinical-history.page';

describe('ClinicalHistoryPage', () => {
  let component: ClinicalHistoryPage;
  let fixture: ComponentFixture<ClinicalHistoryPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ClinicalHistoryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
