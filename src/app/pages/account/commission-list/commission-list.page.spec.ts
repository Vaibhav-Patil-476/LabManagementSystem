import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommissionListPage } from './commission-list.page';

describe('CommissionListPage', () => {
  let component: CommissionListPage;
  let fixture: ComponentFixture<CommissionListPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CommissionListPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
