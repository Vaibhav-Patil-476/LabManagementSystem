import { TestBed } from '@angular/core/testing';

import { BookingStatus } from './booking-status';

describe('BookingStatus', () => {
  let service: BookingStatus;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BookingStatus);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
