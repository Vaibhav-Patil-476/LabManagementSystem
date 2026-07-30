import { TestBed } from '@angular/core/testing';

import { LabApi } from './lab-api';

describe('LabApi', () => {
  let service: LabApi;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LabApi);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
