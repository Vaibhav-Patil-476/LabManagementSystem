import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CancelTestPage } from './cancel-test.page';

describe('CancelTestPage', () => {
  let component: CancelTestPage;
  let fixture: ComponentFixture<CancelTestPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CancelTestPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
