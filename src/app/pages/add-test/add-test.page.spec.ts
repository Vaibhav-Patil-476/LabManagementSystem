import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AddTestPage } from './add-test.page';

describe('AddTestPage', () => {
  let component: AddTestPage;
  let fixture: ComponentFixture<AddTestPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AddTestPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
