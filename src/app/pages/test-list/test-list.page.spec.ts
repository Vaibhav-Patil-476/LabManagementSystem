import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestListPage } from './test-list.page';

describe('TestListPage', () => {
  let component: TestListPage;
  let fixture: ComponentFixture<TestListPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(TestListPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
