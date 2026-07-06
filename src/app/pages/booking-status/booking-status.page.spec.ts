import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BookingStatusPage } from './booking-status.page';

describe('BookingStatusPage', () => {
  let component: BookingStatusPage;
  let fixture: ComponentFixture<BookingStatusPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(BookingStatusPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
