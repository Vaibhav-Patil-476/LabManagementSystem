import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LedgerSearchPage } from './ledger-search.page';

describe('LedgerSearchPage', () => {
  let component: LedgerSearchPage;
  let fixture: ComponentFixture<LedgerSearchPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(LedgerSearchPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
