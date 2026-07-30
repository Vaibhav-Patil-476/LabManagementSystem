import { TestBed } from '@angular/core/testing';

import { Wallet } from './wallet';

describe('Wallet', () => {
  let service: Wallet;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Wallet);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
