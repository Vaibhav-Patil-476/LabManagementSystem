import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaymentHistoryPage } from './payment-history.page';

describe('PaymentHistoryPage', () => {
  let component: PaymentHistoryPage;
  let fixture: ComponentFixture<PaymentHistoryPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PaymentHistoryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
