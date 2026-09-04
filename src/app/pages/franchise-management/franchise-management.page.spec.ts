import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FranchiseManagementPage } from './franchise-management.page';

describe('FranchiseManagementPage', () => {
  let component: FranchiseManagementPage;
  let fixture: ComponentFixture<FranchiseManagementPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(FranchiseManagementPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
